import json

import erpnext
import frappe
from erpnext.accounts.doctype.sales_invoice.sales_invoice import SalesInvoice
from erpnext.accounts.doctype.pos_invoice.pos_invoice import POSInvoice
from frappe import _
from frappe.utils import flt

from managely_terminal.managely_terminal.utils import get_current_pos_profile

# Performance optimization: Cache frequently accessed data
_cached_company_data = {}
_cached_customer_data = {}
_cached_item_accounts = {}


def get_current_pos_opening_entry():
	"""
	Get the active POS Opening Entry for the current user.

	Cashier: returns their own open entry.
	Menu User: auto-attaches to the profile's active open entry.
	"""
	try:
		user = frappe.session.user

		# Own session first (Cashier / Admin path)
		opening_entries = frappe.get_all(
			"POS Opening Entry",
			filters={"user": user, "docstatus": 1, "status": "Open"},
			fields=["name"],
			order_by="creation desc",
			limit_page_length=1,
		)
		if opening_entries:
			return opening_entries[0].name

		# Menu User: auto-attach to the profile's active session
		from managely_terminal.managely_terminal.utils import get_user_pos_profile_name
		pos_profile_name = get_user_pos_profile_name(user)
		if pos_profile_name:
			user_role = frappe.db.get_value("User", user, "role_profile_name") or "Cashier"
			if user_role == "Menu User":
				profile_entries = frappe.get_all(
					"POS Opening Entry",
					filters={"pos_profile": pos_profile_name, "docstatus": 1, "status": "Open"},
					fields=["name"],
					order_by="creation desc",
					limit_page_length=1,
				)
				if profile_entries:
					return profile_entries[0].name

		return None
	except Exception as e:
		frappe.log_error(f"Error getting current POS opening entry: {e!s}")
		return None






def _get_user_ids_by_full_name(full_name):
	"""Get user IDs (emails) that match the given full name."""
	try:
		users = frappe.get_all(
			"User",
			filters={"full_name": full_name, "enabled": 1},
			fields=["name"],
		)
		return [user.name for user in users] if users else []
	except Exception as e:
		frappe.logger().error(f"Error getting user IDs by full name '{full_name}': {e}")
		return []


def _get_opening_entries_by_employee_name(employee_name):
	"""Get POS Opening Entry IDs whose verified employee name matches the cashier filter."""
	try:
		opening_entry_meta = frappe.get_meta("POS Opening Entry")
		all_fieldnames = {df.fieldname for df in opening_entry_meta.fields}
		if "custom_employee_name" not in all_fieldnames:
			return []

		entries = frappe.get_all(
			"POS Opening Entry",
			filters={"custom_employee_name": employee_name},
			fields=["name"],
		)
		return [entry.name for entry in entries] if entries else []
	except Exception as e:
		frappe.logger().error(f"Error getting POS Opening Entries by employee name '{employee_name}': {e}")
		return []


def _build_filters_and_fields(
	skip_opening_entry_filter=False,
	cashier_user_ids=None,
	cashier_opening_entries=None,
	submitted_only=False,
	pos_profile=None,
	employee=None,
):
	"""Build filters and fields list based on user role and metadata.

	Args:
		skip_opening_entry_filter: If True, skip filtering by opening entry (show all invoices)
		cashier_user_ids: List of user IDs to filter by. If provided, only returns invoices for these users.
		cashier_opening_entries: POS Opening Entry IDs to filter by employee cashier name.
		submitted_only: If True, only return submitted invoices (docstatus=1); excludes Draft and Cancelled.
		pos_profile: POS Profile name to filter by.
	"""
	current_opening_entry = get_current_pos_opening_entry()

	# Check if user is admin
	user_roles = frappe.get_roles()
	is_admin_user = "Administrator" in user_roles or "System Manager" in user_roles

	# Safely check metadata to prevent SQL crashes on missing custom fields
	sales_invoice_meta = frappe.get_meta("Sales Invoice")
	all_fieldnames = {df.fieldname for df in sales_invoice_meta.fields}
	has_opening_entry = "custom_pos_opening_entry" in all_fieldnames
	has_zatca_status = "custom_zatca_submit_status" in all_fieldnames

	# Check if user is admin or auditor or branch manager
	is_auditor = "Auditor" in user_roles
	is_branch_manager = "Branch Manager" in user_roles
	allowed_profiles = []

	if employee:
		emp_doc = frappe.db.get_value("Employee", {"name": employee, "status": "Active"}, ["name", "custom_pos_role"], as_dict=True)
		if emp_doc:
			emp_role = emp_doc.custom_pos_role or "Cashier"
			if emp_role == "Branch Manager":
				is_branch_manager = True
				allowed_profiles = [d.pos_profile for d in frappe.get_all(
					"Allowed POS Profile",
					filters={"parent": emp_doc.name, "parenttype": "Employee"},
					fields=["pos_profile"]
				)]
			elif emp_role == "Auditor":
				is_auditor = True
	else:
		emp_name = frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, "name")
		if emp_name:
			emp_role = frappe.db.get_value("Employee", emp_name, "custom_pos_role")
			if emp_role == "Branch Manager":
				is_branch_manager = True
			elif emp_role == "Auditor":
				is_auditor = True
			allowed_profiles = [d.pos_profile for d in frappe.get_all(
				"Allowed POS Profile",
				filters={"parent": emp_name, "parenttype": "Employee"},
				fields=["pos_profile"]
			)]

	is_privileged_user = is_admin_user or is_auditor or is_branch_manager

	# Base filters
	filters = {}

	# Handle opening entry filter if field exists in DB
	if has_opening_entry:
		if skip_opening_entry_filter:
			frappe.logger().info(
				f"Skipping opening entry filter - showing all invoices for user {frappe.session.user}"
			)
		elif is_privileged_user:
			# For Sales Dashboard "Current Session": get all active POS sessions
			open_sessions = [d.name for d in frappe.get_all("POS Opening Entry", filters={"status": "Open", "docstatus": 1}, fields=["name"])]
			if open_sessions:
				filters["custom_pos_opening_entry"] = ["in", open_sessions]
			else:
				filters["custom_pos_opening_entry"] = "___NONE___"
		elif current_opening_entry:
			filters["custom_pos_opening_entry"] = current_opening_entry
		else:
			frappe.logger().info("No active POS opening entry found, showing all POS invoices")
			filters["custom_pos_opening_entry"] = ["!=", ""]

	# Only submitted invoices (for Sales Dashboard): docstatus 1 = Submitted; 0 = Draft, 2 = Cancelled
	if submitted_only:
		filters["docstatus"] = 1

	# Build base fields list
	fields = [
		"name",
		"posting_date",
		"posting_time",
		"owner",
		"customer",
		"customer_name",
		"base_grand_total",
		"base_rounded_total",
		"status",
		"discount_amount",
		"total_taxes_and_charges",
		"pos_profile",
		"currency",
		"custom_pos_customer",
		"is_return",
		"return_against",
	]

	# Inject dynamic custom fields only if present
	if has_opening_entry:
		fields.append("custom_pos_opening_entry")

	if has_zatca_status:
		fields.append("custom_zatca_submit_status")

	if "custom_delivery_status" in all_fieldnames:
		fields.append("custom_delivery_status")
	if "custom_delivery_cod" in all_fieldnames:
		fields.append("custom_delivery_cod")
	if "custom_delivery_prepaid" in all_fieldnames:
		fields.append("custom_delivery_prepaid")
	if "custom_delivery_fee" in all_fieldnames:
		fields.append("custom_delivery_fee")
	if "custom_delivery_personnel" in all_fieldnames:
		fields.append("custom_delivery_personnel")
	if "custom_driver_settled" in all_fieldnames:
		fields.append("custom_driver_settled")

	if "custom_pos_order_type" in all_fieldnames:
		fields.append("custom_pos_order_type")
	if "cashier_name" in all_fieldnames:
		fields.append("cashier_name")
	if "employee_username" in all_fieldnames:
		fields.append("employee_username")

	# Add cashier filter if provided. Prefer the employee attached to the POS
	# Opening Entry because the ERPNext browser session may still be Administrator.
	if cashier_opening_entries and has_opening_entry:
		if len(cashier_opening_entries) == 1:
			filters["custom_pos_opening_entry"] = cashier_opening_entries[0]
		else:
			filters["custom_pos_opening_entry"] = ["in", cashier_opening_entries]
		frappe.logger().info(f"Filtering by cashier POS Opening Entries: {cashier_opening_entries}")
	elif cashier_user_ids:
		if len(cashier_user_ids) == 1:
			filters["owner"] = cashier_user_ids[0]
		else:
			filters["owner"] = ["in", cashier_user_ids]
		frappe.logger().info(f"Filtering by cashier user IDs: {cashier_user_ids}")

	# Filter by branch profiles (custom_is_branch = 1)
	branch_profiles = [p.name for p in frappe.get_all("POS Profile", filters={"custom_is_branch": 1, "disabled": 0}, fields=["name"])]

	if is_branch_manager and not is_admin_user:
		allowed_branches = [p for p in allowed_profiles if p in branch_profiles]
		if allowed_branches:
			if pos_profile:
				if pos_profile in allowed_branches:
					filters["pos_profile"] = pos_profile
				else:
					filters["pos_profile"] = "___NONE___"
			else:
				if len(allowed_branches) == 1:
					filters["pos_profile"] = allowed_branches[0]
				else:
					filters["pos_profile"] = ["in", allowed_branches]
		else:
			filters["pos_profile"] = "___NONE___"
	else:
		if pos_profile:
			if pos_profile in branch_profiles:
				filters["pos_profile"] = pos_profile
			else:
				filters["pos_profile"] = "___NONE___"
		elif submitted_only:
			if branch_profiles:
				filters["pos_profile"] = ["in", branch_profiles]
			else:
				filters["pos_profile"] = "___NONE___"

	return filters, fields


def _build_search_filters(search):
	"""Build OR filters for search functionality."""
	if not search or not search.strip():
		return None

	search_term = search.strip()
	return [
		["name", "like", f"%{search_term}%"],
		["customer_name", "like", f"%{search_term}%"],
		["customer", "like", f"%{search_term}%"],
	]


def _batch_fetch_cashier_names(user_ids):
	"""Batch fetch cashier names for given user IDs."""
	if not user_ids:
		return {}

	placeholders = ",".join(["%s"] * len(user_ids))
	cashier_query = f"""
		SELECT name, full_name
		FROM `tabUser`
		WHERE name IN ({placeholders})
	"""
	cashier_results = frappe.db.sql(cashier_query, tuple(user_ids), as_dict=True)
	return {user.name: user.full_name or user.name for user in cashier_results}


def _batch_fetch_opening_cashier_names(invoice_names):
	"""Map Sales Invoice and POS Invoice names to the employee cashier from their POS Opening Entry."""
	if not invoice_names:
		return {}

	try:
		opening_entry_meta = frappe.get_meta("POS Opening Entry")
		opening_entry_fields = {df.fieldname for df in opening_entry_meta.fields}
		if "custom_employee_name" not in opening_entry_fields:
			return {}

		placeholders = ", ".join(["%s"] * len(invoice_names))
		
		# Fetch from POS Invoice
		pos_rows = frappe.db.sql(
			f"""
			SELECT pi.name, poe.custom_employee_name
			FROM `tabPOS Invoice` pi
			LEFT JOIN `tabPOS Opening Entry` poe ON poe.name = pi.custom_pos_opening_entry
			WHERE pi.name IN ({placeholders})
			""",
			tuple(invoice_names),
			as_dict=True,
		)

		# Fetch from Sales Invoice
		si_rows = frappe.db.sql(
			f"""
			SELECT si.name, poe.custom_employee_name
			FROM `tabSales Invoice` si
			LEFT JOIN `tabPOS Opening Entry` poe ON poe.name = si.custom_pos_opening_entry
			WHERE si.name IN ({placeholders})
			""",
			tuple(invoice_names),
			as_dict=True,
		)

		res = {}
		for row in pos_rows:
			if row.get("custom_employee_name"):
				res[row.name] = row.custom_employee_name
		for row in si_rows:
			if row.get("custom_employee_name"):
				res[row.name] = row.custom_employee_name
		return res
	except Exception as e:
		frappe.logger().error(f"Error fetching POS Opening Entry cashier names: {e}")
		return {}


def _batch_fetch_payment_methods(invoice_names):
	"""Batch fetch payment methods for given invoices."""
	if not invoice_names:
		return {}

	placeholders = ",".join(["%s"] * len(invoice_names))
	payment_query = f"""
		SELECT parent, mode_of_payment, amount, custom_payment_original_amount, custom_payment_currency
		FROM `tabSales Invoice Payment`
		WHERE parent IN ({placeholders})
	"""
	payment_results = frappe.db.sql(payment_query, tuple(invoice_names), as_dict=True)

	# Group by parent invoice
	payment_methods_map = {}
	for payment in payment_results:
		if payment.parent not in payment_methods_map:
			payment_methods_map[payment.parent] = []
		payment_methods_map[payment.parent].append(
			{
				"mode_of_payment": payment.mode_of_payment,
				"amount": payment.amount,
				"custom_payment_original_amount": payment.custom_payment_original_amount,
				"custom_payment_currency": payment.custom_payment_currency,
			}
		)

	return payment_methods_map


def _batch_fetch_items(invoice_names):
	"""Batch fetch items for given invoices."""
	if not invoice_names:
		return {}

	placeholders = ",".join([f"'{name}'" for name in invoice_names])

	# Fetch from POS Invoice Item
	pos_items_query = f"""
		SELECT parent, item_code, item_name, qty, rate, amount
		FROM `tabPOS Invoice Item`
		WHERE parent IN ({placeholders})
	"""
	pos_items_results = frappe.db.sql(pos_items_query, as_dict=True)

	# Fetch from Sales Invoice Item as fallback
	si_items_query = f"""
		SELECT parent, item_code, item_name, qty, rate, amount
		FROM `tabSales Invoice Item`
		WHERE parent IN ({placeholders})
	"""
	si_items_results = frappe.db.sql(si_items_query, as_dict=True)

	# Merge: POS Invoice Item takes priority, fall back to Sales Invoice Item
	items_map = {}
	for item in si_items_results:
		if item.parent not in items_map:
			items_map[item.parent] = []
		items_map[item.parent].append(
			{
				"item_code": item.item_code,
				"item_name": item.item_name or item.item_code,
				"qty": item.qty,
				"rate": item.rate,
				"amount": item.amount,
				"quantity": item.qty,
			}
		)
	pos_parents_seen = set()
	for item in pos_items_results:
		# POS Invoice Item overrides Sales Invoice Item for the same parent
		if item.parent not in pos_parents_seen:
			# First POS item for this parent: clear any SI items
			items_map[item.parent] = []
			pos_parents_seen.add(item.parent)
		items_map[item.parent].append(
			{
				"item_code": item.item_code,
				"item_name": item.item_name or item.item_code,
				"qty": item.qty,
				"rate": item.rate,
				"amount": item.amount,
				"quantity": item.qty,
			}
		)

	return items_map


def _process_invoices(invoices, cashier_names_map, opening_cashier_map, payment_methods_map, items_map):
	"""Process and enrich invoices with related data."""
	for inv in invoices:
		inv["cashier_name"] = inv.get("cashier_name") or opening_cashier_map.get(inv.name) or cashier_names_map.get(inv.owner, inv.owner)

		# Override display customer details if POS Customer is linked
		if inv.get("custom_pos_customer"):
			pos_cust_name = frappe.db.get_value("POS Customer", inv["custom_pos_customer"], "customer_name")
			if pos_cust_name:
				inv["customer"] = pos_cust_name
				inv["customer_name"] = pos_cust_name

		# Format posting_time
		if inv.get("posting_time"):
			if hasattr(inv["posting_time"], "total_seconds"):
				total_seconds = int(inv["posting_time"].total_seconds())
				hours = total_seconds // 3600
				minutes = (total_seconds % 3600) // 60
				seconds = total_seconds % 60
				inv["posting_time"] = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
			else:
				inv["posting_time"] = str(inv["posting_time"])

		# Set payment methods
		payment_methods = payment_methods_map.get(inv.name, [])
		inv["payment_methods"] = payment_methods

		# Set backward-compatible mode_of_payment field
		if len(payment_methods) == 0:
			inv["mode_of_payment"] = "-"
		elif len(payment_methods) == 1:
			inv["mode_of_payment"] = payment_methods[0]["mode_of_payment"]
		else:
			inv["mode_of_payment"] = "/".join([pm["mode_of_payment"] for pm in payment_methods])

		# Set items and calculate return data
		items = items_map.get(inv.name, [])

		# Only calculate return data for Credit Note Issued and Consolidated invoices
		if inv.get("status") in ("Credit Note Issued", "Consolidated"):
			_calculate_return_quantities(inv, items)
		else:
			for item in items:
				item["returned_qty"] = 0
				item["available_qty"] = item["qty"]

		inv["items"] = items


def _calculate_return_quantities(invoice, items):
	"""Calculate return quantities for credit note invoices."""
	item_codes = [item["item_code"] for item in items]
	if not item_codes:
		return

	placeholders = ",".join(["%s"] * len(item_codes))
	returns_query = f"""
		SELECT sii.item_code, COALESCE(SUM(ABS(sii.qty)), 0) as total_returned_qty
		FROM `tabSales Invoice` si
		JOIN `tabSales Invoice Item` sii ON si.name = sii.parent
		WHERE si.is_return = 1
		  AND si.return_against = %s
		  AND sii.item_code IN ({placeholders})
		  AND si.docstatus = 1
		  AND si.customer = %s
		GROUP BY sii.item_code
	"""

	returns_data = frappe.db.sql(returns_query, (invoice.name, *item_codes, invoice.customer), as_dict=True)
	returned_qty_map = {row.item_code: row.total_returned_qty for row in returns_data}

	# Update items with return data
	for item in items:
		returned_qty_value = returned_qty_map.get(item["item_code"], 0)
		item["returned_qty"] = round(float(returned_qty_value), 6)
		item["available_qty"] = round(item["qty"] - returned_qty_value, 6)




def _get_invoice_cashier_name(invoice_data):
	opening_entry = invoice_data.get("custom_pos_opening_entry")
	if opening_entry:
		try:
			opening_entry_meta = frappe.get_meta("POS Opening Entry")
			opening_entry_fields = {df.fieldname for df in opening_entry_meta.fields}
			if "custom_employee_name" in opening_entry_fields:
				employee_name = frappe.db.get_value(
					"POS Opening Entry", opening_entry, "custom_employee_name"
				)
				if employee_name:
					return employee_name
		except Exception as e:
			frappe.logger().error(f"Error getting invoice cashier from POS Opening Entry {opening_entry}: {e}")

	return frappe.db.get_value(
		"User", invoice_data.get("owner"), "full_name"
	) or invoice_data.get("owner")


def _get_invoice_items_with_returns(invoice_id, customer, doctype="Sales Invoice"):
	"""
	Fetch invoice items and calculate returned/available quantities.
	"""
	item_table = "POS Invoice Item" if doctype == "POS Invoice" else "Sales Invoice Item"
	# Batch fetch all items for this invoice
	items_query = f"""
		SELECT item_code, item_name, qty, rate, amount, description
		FROM `tab{item_table}`
		WHERE parent = %s
	"""
	items_data = frappe.db.sql(items_query, (invoice_id,), as_dict=True)

	# Batch fetch return quantities for all items at once
	item_codes = [item.item_code for item in items_data]
	returned_qty_map = {}

	if item_codes:
		placeholders = ",".join(["%s"] * len(item_codes))
		# Check returns in Sales Invoice
		si_returns_query = f"""
			SELECT sii.item_code, COALESCE(SUM(ABS(sii.qty)), 0) as total_returned_qty
			FROM `tabSales Invoice` si
			JOIN `tabSales Invoice Item` sii ON si.name = sii.parent
			WHERE si.is_return = 1
			  AND si.return_against = %s
			  AND sii.item_code IN ({placeholders})
			  AND si.docstatus = 1
			GROUP BY sii.item_code
		"""

		# Check returns in POS Invoice
		pos_returns_query = f"""
			SELECT pii.item_code, COALESCE(SUM(ABS(pii.qty)), 0) as total_returned_qty
			FROM `tabPOS Invoice` pi
			JOIN `tabPOS Invoice Item` pii ON pi.name = pii.parent
			WHERE pi.is_return = 1
			  AND pi.return_against = %s
			  AND pii.item_code IN ({placeholders})
			  AND pi.docstatus = 1
			GROUP BY pii.item_code
		"""

		si_returns_data = frappe.db.sql(si_returns_query, (invoice_id, *item_codes), as_dict=True)
		pos_returns_data = frappe.db.sql(pos_returns_query, (invoice_id, *item_codes), as_dict=True)

		for row in si_returns_data:
			returned_qty_map[row.item_code] = returned_qty_map.get(row.item_code, 0) + row.total_returned_qty
		for row in pos_returns_data:
			returned_qty_map[row.item_code] = returned_qty_map.get(row.item_code, 0) + row.total_returned_qty

	# Build items list with return data
	items = []
	for item in items_data:
		returned_qty_value = returned_qty_map.get(item.item_code, 0)
		available_qty = round(item.qty - returned_qty_value, 6)

		items.append(
			{
				"item_code": item.item_code,
				"item_name": item.item_name,
				"qty": item.qty,
				"rate": item.rate,
				"amount": item.amount,
				"description": item.description,
				"returned_qty": returned_qty_value,
				"available_qty": available_qty,
			}
		)

	return items


def _get_address_and_customer_info(invoice):
	"""
	Fetch company address, customer address, and customer contact information.
	"""
	# Get company address
	company_address_doc = None
	if invoice.company_address:
		company_address_doc = frappe.get_doc("Address", invoice.company_address).as_dict()

	# Get customer address
	customer_address_doc = None
	if invoice.customer_address:
		customer_address_doc = frappe.get_doc("Address", invoice.customer_address).as_dict()
	else:
		primary_address = frappe.db.get_value(
			"Dynamic Link",
			{
				"link_doctype": "Customer",
				"link_name": invoice.customer,
				"parenttype": "Address",
			},
			"parent",
		)
		if primary_address:
			customer_address_doc = frappe.get_doc("Address", primary_address).as_dict()

	# Get customer contact information
	customer_email = ""
	customer_mobile_no = ""
	customer_address_line1 = ""
	customer_city = ""
	customer_state = ""
	customer_pincode = ""
	customer_country = ""

	if getattr(invoice, "custom_pos_customer", None):
		pos_customer = frappe.get_doc("POS Customer", invoice.custom_pos_customer)
		customer_email = pos_customer.email_id or ""
		customer_mobile_no = pos_customer.mobile_no or ""
	elif invoice.customer:
		customer_doc = frappe.get_doc("Customer", invoice.customer)
		customer_email = customer_doc.email_id or ""
		customer_mobile_no = customer_doc.mobile_no or ""

		# Extract address fields
		if customer_address_doc:
			customer_address_line1 = customer_address_doc.get("address_line1", "")
			customer_city = customer_address_doc.get("city", "")
			customer_state = customer_address_doc.get("state", "")
			customer_pincode = customer_address_doc.get("pincode", "")
			customer_country = customer_address_doc.get("country", "")

	return {
		"company_address_doc": company_address_doc,
		"customer_address_doc": customer_address_doc,
		"customer_email": customer_email,
		"customer_mobile_no": customer_mobile_no,
		"customer_address_line1": customer_address_line1,
		"customer_city": customer_city,
		"customer_state": customer_state,
		"customer_pincode": customer_pincode,
		"customer_country": customer_country,
	}






def _resolve_offline_customer(customer_data, pos_profile):
	"""
	Create or locate an ERPNext Customer when the invoice carries an OFFLINE_CUST- id.
	Returns a real ERPNext customer name, or None if resolution fails.
	"""
	# 1. POS profile has a default customer configured — use it.
	if pos_profile.customer:
		return pos_profile.customer

	# 2. Try to create the customer from the data embedded in the invoice payload.
	try:
		cust_name = (
			customer_data.get("name")
			or customer_data.get("customer_name")
			or ""
		).strip()
		if not cust_name:
			return None

		# Re-use existing customer with the same name to avoid duplicates.
		existing = frappe.db.get_value("Customer", {"customer_name": cust_name}, "name")
		if existing:
			return existing

		cust_type = "Company" if customer_data.get("type") == "company" else "Individual"
		doc = frappe.new_doc("Customer")
		doc.customer_name = cust_name
		doc.customer_type = cust_type
		doc.customer_group = customer_data.get("customer_group") or "Individual"
		doc.territory = customer_data.get("territory") or "All Territories"
		phone = customer_data.get("phone") or ""
		email = customer_data.get("email") or ""
		if phone:
			doc.mobile_no = phone
		if email:
			doc.email_id = email
		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		frappe.logger().info(f"[Offline Sync] Created customer '{doc.name}' from offline invoice data")
		return doc.name
	except Exception as exc:
		frappe.log_error(f"[Offline Sync] Failed to create customer from offline data: {exc}")
		return None


def parse_invoice_data(data):
	"""Sanitize and extract customer and items from request payload including round-off."""
	if isinstance(data, str):
		data = json.loads(data)

	customer_obj = data.get("customer") or {}
	customer = customer_obj.get("id") if customer_obj else None
	items = data.get("items", [])

	amount_paid = 0.0
	pos_profile = get_current_pos_profile()
	sales_and_tax_charges = pos_profile.taxes_and_charges

	# Offline-synced invoices carry a temporary OFFLINE_CUST- id. Resolve it to a
	# real ERPNext customer before building the invoice document.
	if not customer or (isinstance(customer, str) and customer.startswith("OFFLINE_CUST-")):
		resolved = _resolve_offline_customer(customer_obj, pos_profile)
		if resolved:
			customer = resolved
	business_type = data.get("businessType")
	mode_of_payment = None

	# Extract round-off data from frontend
	roundoff_amount = data.get("roundOffAmount", 0.0)

	# Only get round-off account if round-off amount is not zero
	if roundoff_amount != 0:
		_roundoff_account = get_writeoff_account()

	if data.get("amountPaid"):
		amount_paid = data.get("amountPaid")

	if data.get("paymentMethods"):
		mode_of_payment = data.get("paymentMethods")

	if data.get("SalesTaxCharges"):
		sales_and_tax_charges = data.get("SalesTaxCharges")

	# Extract delivery personnel
	delivery_personnel = data.get("deliveryPersonnel")

	if not customer or not items:
		frappe.throw(_("Customer and items are required"))

	return (
		customer,
		items,
		amount_paid,
		sales_and_tax_charges,
		mode_of_payment,
		business_type,
		roundoff_amount,
		delivery_personnel,
	)




def _validate_item_rates(doc, data):
	"""
	H12 FIX: Validate that item rates sent by the POS client are within the
	allowed discount range. Prevents price manipulation via SQLite editing.
	
	Logic:
	  - Fetch standard selling price for each item from the default price list.
	  - If client rate < standard_rate * (1 - max_discount_pct/100), flag it.
	  - Suspicious items are logged and the invoice is blocked if fraud_threshold exceeded.
	"""
	try:
		try:
			max_discount_pct = flt(frappe.db.get_single_value("Terminal Settings", "max_item_discount_pct") or 100)
		except Exception:
			max_discount_pct = 100
		if max_discount_pct >= 100:
			# No limit configured ??? skip validation (default safe)
			return

		price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list") or "Standard Selling"
		fraud_items = []

		for item in doc.items:
			if not item.item_code or flt(item.rate) <= 0:
				continue

			std_price = frappe.db.get_value(
				"Item Price",
				{"item_code": item.item_code, "price_list": price_list, "selling": 1},
				"price_list_rate"
			)

			if not std_price or flt(std_price) <= 0:
				continue  # No standard price ??? skip this item

			allowed_floor = flt(std_price) * (1 - max_discount_pct / 100)
			if flt(item.rate) < allowed_floor:
				fraud_items.append({
					"item_code": item.item_code,
					"client_rate": flt(item.rate),
					"std_rate": flt(std_price),
					"allowed_floor": allowed_floor,
					"discount_pct": round((1 - flt(item.rate) / flt(std_price)) * 100, 2),
				})

		if fraud_items:
			cashier = getattr(doc, "cashier_name", "") or getattr(doc, "employee_username", "")
			frappe.log_error(
				f"H12 Price Fraud Alert on {doc.name}: cashier={cashier}, items={fraud_items}",
				"Suspicious Item Rate"
			)
			# Block the invoice ??? rates are outside allowed range
			item_codes = ", ".join(i["item_code"] for i in fraud_items)
			frappe.throw(
				f"Item rate(s) below allowed minimum for: {item_codes}. "
				f"Maximum allowed discount is {max_discount_pct}%.",
				title="Price Validation Failed"
			)
		elif len(doc.items) > 0:
			frappe.logger().info(f"H12 Price validation passed for {doc.name}")

	except frappe.ValidationError:
		raise
	except Exception as e:
		# Validation errors must not silently pass ??? log and re-raise
		frappe.log_error(f"H12 _validate_item_rates error: {e}", "Price Validation Error")

def build_sales_invoice_doc(
	customer,
	items,
	amount_paid,
	sales_and_tax_charges,
	mode_of_payment,
	business_type,
	roundoff_amount=0.0,
	include_payments=False,
	delivery_personnel=None,
	draft_id=None,
	delivery_fee=0.0,
	pre_assigned_name=None,
	naming_series=None,
):
	"""Main function to build a POS invoice document."""
	if draft_id and frappe.db.exists("POS Invoice", draft_id):
		doc = frappe.get_doc("POS Invoice", draft_id)
		# Clear existing children to prevent duplicates
		doc.set("items", [])
		doc.set("taxes", [])
		doc.set("payments", [])
		doc.set("pricing_rules", [])
	else:
		doc = frappe.new_doc("POS Invoice")
		if pre_assigned_name:
			doc.name = pre_assigned_name
			doc.flags.ignore_naming_series = True
		elif naming_series:
			doc.naming_series = naming_series
		
	doc.is_pos = 1

	# Resolve POS Customer (B2C/Cash consolidation)
	pos_customer_record = frappe.db.get_value("POS Customer", {"customer_name": customer}, ["name", "unified_customer"], as_dict=True)
	if not pos_customer_record:
		pos_customer_record = frappe.db.get_value("POS Customer", {"name": customer}, ["name", "unified_customer"], as_dict=True)

	if pos_customer_record:
		doc.custom_pos_customer = pos_customer_record.name
		customer = pos_customer_record.unified_customer

	doc.customer = customer
	doc.due_date = frappe.utils.nowdate()
	doc.custom_delivery_date = frappe.utils.nowdate()

	# Set delivery details if provided or has delivery fee
	if delivery_personnel or flt(delivery_fee) > 0.0:
		if delivery_personnel:
			doc.custom_delivery_personnel = delivery_personnel
		doc.custom_delivery_status = "Pending"
		doc.custom_delivery_fee = flt(delivery_fee)

	# Configure POS profile and company settings
	pos_profile = _get_active_pos_profile()
	_set_pos_profile_fields(doc, pos_profile, customer, business_type)

	# Ensure batch/serial requirements are satisfied BEFORE building items
	_validate_and_autofetch_batch_and_serial(items, pos_profile)

	# Set posting details
	_set_posting_fields(doc, data)

	# Set POS opening entry
	_set_pos_opening_entry(doc)

	# Handle round-off
	_set_roundoff_fields(doc, roundoff_amount)

	# Set taxes and charges
	_set_taxes_and_charges(doc, sales_and_tax_charges, pos_profile)

	# Add items to invoice
	_populate_invoice_items(doc, items, pos_profile)

	# Populate tax details
	_populate_tax_details(doc)

	# Inject Delivery Fee into taxes to add it to grand_total
	if flt(delivery_fee) > 0.0:
		shipping_account = None
		if pos_profile and getattr(pos_profile, "custom_delivery_charge_account", None):
			shipping_account = pos_profile.custom_delivery_charge_account
		
		if not shipping_account:
			shipping_account = frappe.db.get_value("Company", doc.company, "default_income_account")
		if shipping_account:
			doc.append("taxes", {
				"charge_type": "Actual",
				"account_head": shipping_account,
				"description": "Delivery Fee",
				"tax_amount": flt(delivery_fee),
				"base_tax_amount": flt(delivery_fee),
				"cost_center": doc.cost_center
			})
			# Re-calculate taxes and totals to update grand_total
			doc.run_method("calculate_taxes_and_totals")

	# Add payment information
	if include_payments:
		_add_payment_entries(doc, mode_of_payment)

	return doc


def _get_active_pos_profile():
	"""Get the active POS profile from current session or fallback to default."""
	selected_pos_profile_name = None

	try:
		current_opening_entry = get_current_pos_opening_entry()
		if current_opening_entry:
			opening_doc = frappe.get_doc("POS Opening Entry", current_opening_entry)
			selected_pos_profile_name = opening_doc.pos_profile
	except Exception:
		frappe.logger().error(f"Error getting POS Opening Entry: {frappe.get_traceback()}")
		pass

	try:
		if selected_pos_profile_name:
			pos_profile_doc = frappe.get_doc("POS Profile", selected_pos_profile_name)
			return pos_profile_doc
		else:
			fallback_profile = get_current_pos_profile()
			return fallback_profile
	except Exception:
		frappe.logger().error(f"Error getting POS Profile: {frappe.get_traceback()}")
		frappe.logger().error(f"Attempted to get profile: {selected_pos_profile_name}")
		raise


def _set_pos_profile_fields(doc, pos_profile, customer, business_type):
	"""Set POS profile, company, currency and POS-specific fields."""
	doc.pos_profile = pos_profile.name
	doc.company = pos_profile.company
	doc.currency = get_customer_billing_currency(customer)
	doc.conversion_rate = 1.0
	doc.update_stock = 1
	doc.warehouse = pos_profile.warehouse
	doc.set_warehouse = pos_profile.warehouse
	doc.cost_center = pos_profile.cost_center or frappe.get_cached_value("Company", pos_profile.company, "cost_center")

	if pos_profile.get("change_amount_account"):
		doc.account_for_change_amount = pos_profile.change_amount_account


	# Resolve debit_to (Receivable Account)
	if not doc.get("debit_to"):
		from erpnext.accounts.party import get_party_account
		try:
			doc.debit_to = get_party_account("Customer", customer, pos_profile.company)
		except Exception:
			doc.debit_to = frappe.db.get_value("Company", pos_profile.company, "default_receivable_account")

	# Determine if this is a POS invoice
	doc.is_pos = _determine_is_pos(customer, business_type)
	if doc.doctype == "POS Invoice":
		doc.is_pos = 1


def _validate_and_autofetch_batch_and_serial(items, pos_profile):
	"""
	Validate that all batch/serial requirements are satisfied for POS items.

	Behaviour:
	- If POS Profile.custom_autofetch_batchserial_ is truthy:
	  * For batch-tracked items missing batch, try to auto-assign a batch using FIFO.
	  * If no suitable batch is found, raise a clear error and STOP invoice creation.
	- If the flag is not set:
	  * For batch-tracked items missing batch, raise an error and STOP invoice creation.
	- For serial-tracked items we do NOT auto-assign; user must select serials explicitly.
	"""
	if not items:
		return

	item_codes = [item.get("item_code") or item.get("id") for item in items if item.get("item_code") or item.get("id")]
	if not item_codes:
		return

	item_data_map = _batch_fetch_item_data(item_codes)
	auto_fetch_enabled = int(getattr(pos_profile, "custom_autofetch_batchserial_", 0) or 0)

	for item in items:
		item_code = item.get("item_code") or item.get("id")
		if not item_code:
			continue

		item_db_data = item_data_map.get(item_code, {}) or {}
		has_batch_no = int(item_db_data.get("has_batch_no") or 0)
		has_serial_no = int(item_db_data.get("has_serial_no") or 0)

		batch_number = item.get("batchNumber")
		serial_number = item.get("serialNumber")

		# Serial-number items: always require explicit selection from UI
		if has_serial_no and not serial_number:
			frappe.throw(
				_("Serial number is mandatory for Item {0}. Please select serial numbers before submitting.").format(
					item_code
				)
			)

		# Batch-number items: optionally auto-fetch, otherwise require explicit batch
		if has_batch_no and not batch_number:
			if auto_fetch_enabled:
				# Try to auto-pick a batch using simple FIFO strategy
				auto_batch = _autofetch_batch_fifo(item_code, pos_profile.warehouse, item.get("quantity"))
				if not auto_batch:
					frappe.throw(
						_(
							"Serial No / Batch No are mandatory for Item {0} and no suitable batch is available in warehouse {1}."
						).format(item_code, pos_profile.warehouse)
					)
				# Mutate the incoming item structure so downstream code uses this batch
				item["batchNumber"] = auto_batch
			else:
				frappe.throw(
					_(
						"Serial No / Batch No are mandatory for Item {0}. Please select a batch before submitting the invoice."
					).format(item_code)
				)

def _autofetch_batch_fifo(item_code, warehouse, qty):
    from frappe.utils import nowdate
    today = nowdate()

    # Pick oldest batch that actually has sufficient stock in the warehouse
    batches = frappe.db.sql("""
        SELECT 
            sle.batch_no,
            SUM(sle.actual_qty) as available_qty,
            b.expiry_date,
            b.creation
        FROM `tabStock Ledger Entry` sle
        INNER JOIN `tabBatch` b ON b.name = sle.batch_no
        WHERE 
            sle.item_code = %(item_code)s
            AND sle.warehouse = %(warehouse)s
            AND sle.is_cancelled = 0
            AND b.disabled = 0
            AND (b.expiry_date IS NULL OR b.expiry_date >= %(today)s)
        GROUP BY sle.batch_no
        HAVING available_qty >= %(qty)s
        ORDER BY b.expiry_date ASC, b.creation ASC
        LIMIT 1
    """, {
        "item_code": item_code,
        "warehouse": warehouse,
        "qty": qty,
        "today": today
    }, as_dict=True)

    if not batches:
        frappe.throw(
            f"No batch with sufficient stock found for item {item_code} "
            f"in warehouse {warehouse}. Required: {qty}"
        )

    return batches[0].batch_no


def _determine_is_pos(customer, business_type):
	"""Determine if the invoice should be marked as POS based on business type."""
	if business_type == "B2C":
		return 1
	elif business_type == "B2B":
		return 0
	elif business_type == "B2B & B2C":
		return _check_customer_type_for_pos(customer)
	else:
		return 0


def _check_customer_type_for_pos(customer):
	"""Check if customer is an individual for B2B & B2C business type."""
	global _cached_customer_data
	if customer not in _cached_customer_data:
		_cached_customer_data[customer] = frappe.get_doc("Customer", customer)

	customer_doc = _cached_customer_data[customer]
	return 1 if customer_doc.customer_type == "Individual" else 0


def _set_posting_fields(doc, data=None):
	"""Set posting date and time fields.

	H9 FIX: Honour the client's posting_date/posting_time when present.
	Before this fix the server always stamped nowdate()/nowtime(), so any
	invoice that synced even a second late was recorded at the wrong time,
	causing end-of-day reports and shift totals to be inaccurate.
	"""
	client_date = (data or {}).get('posting_date') if data else None
	client_time = (data or {}).get('posting_time') if data else None
	if client_date:
		doc.posting_date = client_date
		doc.posting_time = client_time or frappe.utils.nowtime()
	else:
		doc.posting_date = frappe.utils.nowdate()
		doc.posting_time = frappe.utils.nowtime()
	doc.set_posting_time = 1


def _set_pos_opening_entry(doc):
	"""Set the current POS opening entry on the document."""
	current_opening_entry = get_current_pos_opening_entry()
	if current_opening_entry:
		doc.custom_pos_opening_entry = current_opening_entry


def _set_roundoff_fields(doc, roundoff_amount):
	"""Set round-off amount and account if roundoff is non-zero."""
	if roundoff_amount != 0:
		conversion_rate = doc.conversion_rate or 1
		doc.custom_roundoff_amount = flt(abs(roundoff_amount))
		doc.custom_roundoff_account = get_writeoff_account()
		doc.custom_base_roundoff_amount = flt(abs(roundoff_amount) * conversion_rate)


def _set_taxes_and_charges(doc, sales_and_tax_charges, pos_profile):
	"""Set the taxes and charges template."""
	if sales_and_tax_charges:
		doc.taxes_and_charges = sales_and_tax_charges
	else:
		doc.taxes_and_charges = pos_profile.taxes_and_charges


def _populate_invoice_items(doc, items, pos_profile):
	"""Add all items to the invoice."""
	item_codes = [item.get("item_code") or item.get("id") for item in items]

	# Batch fetch item data and pre-cache accounts
	item_data_map = _batch_fetch_item_data(item_codes)
	_precache_item_accounts(item_codes, pos_profile.company)

	# Resolve tax rate if custom_prices_include_vat is enabled
	tax_rate = 0.0
	prices_include_vat = False
	try:
		if pos_profile and getattr(pos_profile, "custom_prices_include_vat", 0):
			prices_include_vat = True
			if doc.taxes_and_charges:
				tax_doc = get_tax_template(doc.taxes_and_charges)
				if tax_doc and tax_doc.taxes:
					for tax in tax_doc.taxes:
						if not tax.get("custom_is_stamp"):
							tax_rate += flt(tax.rate)
	except Exception:
		pass

	# Add each item to the invoice
	for item in items:
		item_data = _prepare_item_data(item, item_data_map, pos_profile, prices_include_vat, tax_rate)
		doc.append("items", item_data)


def _batch_fetch_item_data(item_codes):
	"""Batch fetch item data for all items."""
	if not item_codes:
		return {}

	placeholders = ",".join(["%s"] * len(item_codes))
	item_query = f"""
		SELECT name, item_name, has_batch_no, has_serial_no
		FROM `tabItem`
		WHERE name IN ({placeholders})
	"""

	item_results = frappe.db.sql(item_query, tuple(item_codes), as_dict=True)
	return {item.name: item for item in item_results}


def _precache_item_accounts(item_codes, company):
	"""Pre-cache income and expense accounts for all items."""
	if not item_codes:
		return

	# Query Item Default for the company for all these items in one query
	try:
		placeholders = ", ".join(["%s"] * len(item_codes))
		item_defaults = frappe.db.sql(f"""
			SELECT parent as item_code, income_account, expense_account
			FROM `tabItem Default`
			WHERE parent IN ({placeholders}) AND company = %s
		""", (*item_codes, company), as_dict=True)
		
		defaults_map = {d["item_code"]: d for d in item_defaults}
	except Exception:
		defaults_map = {}

	# Cache company defaults as fallback
	if company not in _cached_company_data:
		_cached_company_data[company] = frappe.get_doc("Company", company)
	company_doc = _cached_company_data[company]
	company_income = company_doc.default_income_account
	company_expense = company_doc.default_expense_account

	for item_code in item_codes:
		item_def = defaults_map.get(item_code, {})
		
		# Income Account
		income = item_def.get("income_account")
		if not income:
			item_group = frappe.db.get_value("Item", item_code, "item_group")
			if item_group:
				income = frappe.db.get_value("Item Default", {"parent": item_group, "parenttype": "Item Group", "company": company}, "income_account")
		if not income:
			income = company_income
		_cached_item_accounts[item_code] = income

		# Expense Account
		expense = item_def.get("expense_account")
		if not expense:
			item_group = frappe.db.get_value("Item", item_code, "item_group")
			if item_group:
				expense = frappe.db.get_value("Item Default", {"parent": item_group, "parenttype": "Item Group", "company": company}, "expense_account")
		if not expense:
			expense = company_expense
		_cached_item_accounts[f"{item_code}_expense"] = expense


def _prepare_item_data(item, item_data_map, pos_profile, prices_include_vat=False, tax_rate=0.0):
	"""Prepare item data dictionary for invoice line."""
	item_code = item.get("item_code") or item.get("id")

	# Get accounts and validate
	income_account = get_income_accounts(item_code)
	expense_account = get_expense_accounts(item_code)
	_validate_item_accounts(item_code, income_account, expense_account)

	discounted_price = item.get("discountedPrice")
	original_price   = item.get("price") or item.get("original_price")
	item_rate        = item.get("rate")
	is_free          = item.get("is_free_item") or item.get("is_free") or (item_rate is not None and flt(item_rate) == 0)

	if is_free:
		final_rate = 0.0
		ignore_pricing_rule = 1
	elif item_rate is not None and flt(item_rate) != flt(original_price):
		final_rate = flt(item_rate)
		ignore_pricing_rule = 1
	elif discounted_price is not None and flt(discounted_price) != flt(original_price):
		final_rate = flt(discounted_price)
		ignore_pricing_rule = 1
	else:
		final_rate = flt(item_rate if item_rate is not None else original_price)
		ignore_pricing_rule = 0

	# Do not divide final_rate or original_price manually.
	original_price = flt(original_price)

	# Fetch item name
	db_item = item_data_map.get(item_code, {}) or {}
	item_name = item.get("item_name") or item.get("name") or db_item.get("item_name") or item_code

	# Build base item data
	item_data = {
		"item_code": item_code,
		"item_name": item_name,
		"description": item_name or item_code or "No Description",
		"qty": item.get("quantity") or item.get("qty"),
		"rate": final_rate,
        "price_list_rate": flt(original_price),   # keep original for reference
        "ignore_pricing_rule": ignore_pricing_rule,
		# "rate": item.get("price"),
		# "rate": item.get("original_price") or item.get("price"),
		# "rate": item.get("discountedPrice") or item.get("price"),
		"discount_percentage": flt(item.get("discountPercentage", 0)),
    	"discount_amount": flt(item.get("discountAmount", 0)),
		"income_account": income_account,
		"expense_account": expense_account,
		"warehouse": pos_profile.warehouse,
		"source_warehouse": pos_profile.warehouse,
		"cost_center": pos_profile.cost_center,
	}

	# Add optional fields
	_add_uom_to_item(item_data, item)
	_add_batch_to_item(item_data, item, item_data_map.get(item_code, {}))
	_add_serial_to_item(item_data, item)

	return item_data


def _validate_item_accounts(item_code, income_account, expense_account):
	"""Validate that required accounts exist for the item."""
	if not income_account:
		frappe.throw(
			f"Income account not found for item {item_code}. "
			"Please check item defaults or company settings."
		)
	if not expense_account:
		frappe.throw(
			f"Expense account not found for item {item_code}. "
			"Please check item defaults or company settings."
		)


def _add_uom_to_item(item_data, item):
	"""Add UOM to item data if specified and not default."""
	selected_uom = item.get("uom")
	if selected_uom:
		item_data["uom"] = selected_uom
		conversion_factor = item.get("conversion_factor") or item.get("conversionFactor")
		if not conversion_factor:
			conversion_factor = frappe.db.get_value(
				"UOM Conversion Detail",
				{"parent": item_data["item_code"], "uom": selected_uom},
				"conversion_factor",
			)
		if conversion_factor:
			item_data["conversion_factor"] = flt(conversion_factor)


def _add_batch_to_item(item_data, item, item_db_data):
	"""Add batch information if item has batch tracking."""
	has_batch_no = item_db_data.get("has_batch_no", 0)
	batch_number = item.get("batchNumber")

	if has_batch_no and batch_number:
		item_data["use_serial_batch_fields"] = 1
		item_data["batch_no"] = batch_number


def _add_serial_to_item(item_data, item):
	"""Add serial number if provided."""
	serial_number = item.get("serialNumber")
	if serial_number:
		item_data["use_serial_batch_fields"] = 1
		item_data["serial_no"] = serial_number


def _populate_tax_details(doc):
	"""Populate tax details from the taxes and charges template."""
	if not doc.taxes_and_charges:
		return

	tax_doc = get_tax_template(doc.taxes_and_charges)
	if not tax_doc:
		return

	# Check if the POS Profile has custom_prices_include_vat enabled
	# If so, force all tax rows to be inclusive (included_in_print_rate = 1)
	# so the grand total = price list price (tax is already baked in)
	prices_include_vat = False
	try:
		pos_profile = _get_active_pos_profile()
		if pos_profile and getattr(pos_profile, "custom_prices_include_vat", 0):
			prices_include_vat = True
	except Exception:
		pass

	for tax in tax_doc.taxes:
		# If prices_include_vat is active, force the tax row to be inclusive (1)
		included = 1 if prices_include_vat else int(tax.included_in_print_rate or 0)
		doc.append(
			"taxes",
			{
				"charge_type": tax.charge_type,
				"account_head": tax.account_head,
				"description": tax.description,
				"cost_center": tax.cost_center,
				"rate": tax.rate,
				"row_id": tax.row_id,
				"tax_amount": tax.tax_amount,
				"included_in_print_rate": included,
				"custom_is_stamp": tax.get("custom_is_stamp") or 0,
				"custom_stamp_amount_lbp": tax.get("custom_stamp_amount_lbp") or 0,
			},
		)


def _upsert_currency_exchange(from_currency, to_currency, exchange_rate, date):
	"""Create or update today's Currency Exchange record so ERPNext can resolve
	the rate automatically for any transaction that happens after this payment."""
	if not (from_currency and to_currency and exchange_rate > 0):
		return
	if from_currency == to_currency:
		return
	try:
		existing = frappe.db.get_value(
			"Currency Exchange",
			{"from_currency": from_currency, "to_currency": to_currency, "date": date},
			"name",
		)
		if existing:
			frappe.db.set_value("Currency Exchange", existing, "exchange_rate", exchange_rate)
		else:
			ce = frappe.new_doc("Currency Exchange")
			ce.from_currency = from_currency
			ce.to_currency = to_currency
			ce.exchange_rate = exchange_rate
			ce.date = date
			ce.insert(ignore_permissions=True)
	except Exception:
		pass  # Non-fatal — payment still proceeds even if exchange record fails


def _add_payment_entries(doc, mode_of_payment):
	"""Add payment entries to the invoice.

	Each entry may optionally include currency/exchange_rate fields for
	multi-currency transactions.  The amount stored on the invoice is always
	in the invoice's base currency; conversion is performed here when the
	payment currency differs from the invoice currency.
	"""
	if not isinstance(mode_of_payment, list):
		return

	from frappe.utils import flt, nowdate

	# Set Change Amount Account to be the same as the used payment method's account
	used_mop = None
	for payment in mode_of_payment:
		if flt(payment.get("amount", 0)) > 0:
			used_mop = payment.get("method")
			break
	if not used_mop and len(mode_of_payment) > 0:
		used_mop = mode_of_payment[0].get("method")

	if used_mop:
		mop_account = frappe.db.get_value(
			"Mode of Payment Account",
			{"parent": used_mop, "company": doc.company},
			"default_account"
		)
		if mop_account:
			doc.account_for_change_amount = mop_account


	for payment in mode_of_payment:
		amount = flt(payment.get("amount", 0))
		pay_currency = payment.get("currency")
		exchange_rate = flt(payment.get("exchange_rate", 0))

		# Convert secondary-currency amount → invoice base currency
		# exchange_rate convention: base units per 1 secondary unit (e.g. 250 EGP per 1 USD)
		# so: secondary_amount × exchange_rate = base_amount
		original_amount = amount
		original_currency = pay_currency or doc.currency
		if pay_currency and pay_currency != doc.currency and exchange_rate > 0:
			if pay_currency == "LBP" and doc.currency == "USD":
				if exchange_rate > 1.0:
					amount = amount / exchange_rate
				else:
					amount = amount * exchange_rate
			elif pay_currency == "USD" and doc.currency == "LBP":
				if exchange_rate > 1.0:
					amount = amount * exchange_rate
				else:
					amount = amount / exchange_rate
			else:
				amount = amount * exchange_rate
			# Auto-save today's rate so ERPNext resolves it for all subsequent transactions
			_upsert_currency_exchange(pay_currency, doc.currency, exchange_rate, nowdate())

		amount = round(amount, 6)
		doc.append(
			"payments",
			{
				"mode_of_payment": payment["method"],
				"amount": amount,
				"custom_payment_currency": original_currency,
				"custom_payment_original_amount": round(original_amount, 6),
			},
		)


def get_tax_template(template_name):
	"""
	Optimized tax template getter with caching.
	Custom helper function to fetch Sales Taxes and Charges Template.
	Returns the full template document or raises an error if not found.
	"""
	global _cached_item_accounts

	if not template_name:
		return None

	cache_key = f"tax_template_{template_name}"
	if cache_key not in _cached_item_accounts:
		try:
			template_doc = frappe.get_doc("Sales Taxes and Charges Template", template_name)
			_cached_item_accounts[cache_key] = template_doc
		except frappe.DoesNotExistError:
			frappe.throw(f"Tax Template '{template_name}' not found")
		except Exception as e:
			frappe.log_error(f"Error fetching tax template {template_name}: {e!s}")
			_cached_item_accounts[cache_key] = None

	return _cached_item_accounts[cache_key]


def get_customer_billing_currency(customer):
	try:
		customer_doc = frappe.get_doc("Customer", customer)
		if customer_doc.default_currency:
			return customer_doc.default_currency
	except Exception:
		pass

	# Fallback to company currency
	pos_profile = get_current_pos_profile()
	company_doc = frappe.get_doc("Company", pos_profile.company)
	return company_doc.default_currency


def get_income_accounts(item_code):
	"""Optimized income account getter with caching"""
	global _cached_item_accounts

	if item_code not in _cached_item_accounts:
		try:
			pos_profile = get_current_pos_profile()
			company = pos_profile.company

			# Try Item Defaults
			income = frappe.db.get_value("Item Default", {"parent": item_code, "company": company}, "income_account")
			if not income:
				item_group = frappe.db.get_value("Item", item_code, "item_group")
				if item_group:
					income = frappe.db.get_value("Item Default", {"parent": item_group, "parenttype": "Item Group", "company": company}, "income_account")
			if not income:
				# Cache company data
				if company not in _cached_company_data:
					_cached_company_data[company] = frappe.get_doc("Company", company)
				company_doc = _cached_company_data[company]
				income = company_doc.default_income_account

			_cached_item_accounts[item_code] = income
		except Exception as e:
			frappe.log_error(
				f"Error fetching income account for {item_code}: {e!s}",
				"Income Account Error",
			)
			_cached_item_accounts[item_code] = None

	return _cached_item_accounts[item_code]


def get_expense_accounts(item_code):
	"""Optimized expense account getter with caching"""
	global _cached_item_accounts

	cache_key = f"{item_code}_expense"
	if cache_key not in _cached_item_accounts:
		try:
			pos_profile = get_current_pos_profile()
			company = pos_profile.company

			# Try Item Defaults
			expense = frappe.db.get_value("Item Default", {"parent": item_code, "company": company}, "expense_account")
			if not expense:
				item_group = frappe.db.get_value("Item", item_code, "item_group")
				if item_group:
					expense = frappe.db.get_value("Item Default", {"parent": item_group, "parenttype": "Item Group", "company": company}, "expense_account")
			if not expense:
				# Cache company data
				if company not in _cached_company_data:
					_cached_company_data[company] = frappe.get_doc("Company", company)
				company_doc = _cached_company_data[company]
				expense = company_doc.default_expense_account

			_cached_item_accounts[cache_key] = expense
		except Exception as e:
			frappe.log_error(
				f"Error fetching expense account for {item_code}: {e!s}",
				"Expense Account Error",
			)
			_cached_item_accounts[cache_key] = None

	return _cached_item_accounts[cache_key]


from frappe.model.mapper import get_mapped_doc




# Add this function to handle round-off amount calculation and write-off
def set_base_roundoff_amount(doc, method):
	"""Set base round-off amount based on conversion rate"""
	if not doc.custom_roundoff_amount:
		return
	if not doc.conversion_rate:
		frappe.throw(_("Please set Exchange Rate First"))
	doc.custom_base_roundoff_amount = doc.conversion_rate * doc.custom_roundoff_amount


def set_grand_total_with_roundoff(doc, method):
	"""Modify grand total calculation to include round-off amount"""
	from erpnext.controllers.taxes_and_totals import calculate_taxes_and_totals

	if not doc.doctype == "Sales Invoice":
		return
	if not doc.custom_roundoff_account or not doc.custom_roundoff_amount:
		return

	# Monkey Patch calculate_totals method to include round-off
	calculate_taxes_and_totals.calculate_totals = custom_calculate_totals


def custom_calculate_totals(self):
	"""Main function to calculate invoice totals with custom round-off logic"""
	# Calculate basic grand total and taxes
	if self.doc.get("taxes"):
		self.doc.grand_total = flt(self.doc.get("taxes")[-1].total) + flt(self.doc.get("grand_total_diff"))
	else:
		self.doc.grand_total = flt(self.doc.net_total)

	if self.doc.get("taxes"):
		self.doc.total_taxes_and_charges = flt(
			self.doc.grand_total - self.doc.net_total - flt(self.doc.get("grand_total_diff")),
			self.doc.precision("total_taxes_and_charges"),
		)
	else:
		self.doc.total_taxes_and_charges = 0.0
	# Apply existing roundoff amount
	if (
		self.doc.doctype == "Sales Invoice"
		and self.doc.custom_roundoff_account
		and self.doc.custom_roundoff_amount
	):
		adjustment = self.doc.custom_roundoff_amount or 0

		# For returns, add the round-off to reduce the negative magnitude (e.g., -13 + 3.01 = -9.99)
		if getattr(self.doc, "is_return", 0):
			self.doc.grand_total += adjustment
		else:
			# Normal invoices subtract the round-off (e.g., 13 - 3.01 = 9.99)
			self.doc.grand_total -= adjustment

	self._set_in_company_currency(self.doc, ["total_taxes_and_charges", "rounding_adjustment"])
	# Calculate base currency totals
	if self.doc.doctype in [
		"Quotation",
		"Sales Order",
		"Delivery Note",
		"Sales Invoice",
		"POS Invoice",
	]:
		self.doc.base_grand_total = (
			flt(
				self.doc.grand_total * self.doc.conversion_rate,
				self.doc.precision("base_grand_total"),
			)
			if self.doc.total_taxes_and_charges
			else self.doc.base_net_total
		)
	else:
		self.doc.taxes_and_charges_added = self.doc.taxes_and_charges_deducted = 0.0
		for tax in self.doc.get("taxes"):
			if tax.category in ["Valuation and Total", "Total"]:
				if tax.add_deduct_tax == "Add":
					self.doc.taxes_and_charges_added += flt(tax.tax_amount_after_discount_amount)
				else:
					self.doc.taxes_and_charges_deducted += flt(tax.tax_amount_after_discount_amount)

		self.doc.round_floats_in(self.doc, ["taxes_and_charges_added", "taxes_and_charges_deducted"])

		self.doc.base_grand_total = (
			flt(self.doc.grand_total * self.doc.conversion_rate)
			if (self.doc.taxes_and_charges_added or self.doc.taxes_and_charges_deducted)
			else self.doc.base_net_total
		)

		self._set_in_company_currency(self.doc, ["taxes_and_charges_added", "taxes_and_charges_deducted"])

	self.doc.round_floats_in(self.doc, ["grand_total", "base_grand_total"])
	# Mania: Auto write-off small decimal amounts (e.g., 10.01 -> 10.00, -50.01 -> -50.00)
	if self.doc.doctype == "Sales Invoice":
		if self.doc.grand_total > 0:
			grand_total_int = int(self.doc.grand_total)
			# Float-safe fractional part (handles cases like 100.0100000001)
			decimal_part = flt(self.doc.grand_total - grand_total_int, 6)
			# If decimal part is very small (<= 0.01), write it off (with small tolerance)
			if decimal_part > 0 and decimal_part <= (0.01 + 1e-6):
				writeoff_account = get_writeoff_account()
				if writeoff_account:
					small_amount = decimal_part
					if self.doc.custom_roundoff_amount:
						self.doc.custom_roundoff_amount += small_amount
					else:
						self.doc.custom_roundoff_amount = small_amount
					self.doc.custom_roundoff_account = writeoff_account
					self.doc.custom_base_roundoff_amount = self.doc.custom_roundoff_amount * (
						self.doc.conversion_rate or 1
					)
					# For positive totals, subtract to reach .00
					self.doc.grand_total -= small_amount
					self.doc.base_grand_total = self.doc.grand_total * (self.doc.conversion_rate or 1)
		elif self.doc.grand_total < 0:
			abs_total = abs(self.doc.grand_total)
			abs_int = int(abs_total)
			decimal_part = flt(abs_total - abs_int, 6)
			if decimal_part > 0 and decimal_part <= (0.01 + 1e-6):
				writeoff_account = get_writeoff_account()
				if writeoff_account:
					small_amount = decimal_part
					if self.doc.custom_roundoff_amount:
						self.doc.custom_roundoff_amount += small_amount
					else:
						self.doc.custom_roundoff_amount = small_amount
					self.doc.custom_roundoff_account = writeoff_account
					self.doc.custom_base_roundoff_amount = self.doc.custom_roundoff_amount * (
						self.doc.conversion_rate or 1
					)
					# For negative totals, add to reach .00 (e.g., -50.01 + 0.01 = -50)
					self.doc.grand_total += small_amount
					self.doc.base_grand_total = self.doc.grand_total * (self.doc.conversion_rate or 1)

	self.set_rounded_total()


def create_roundoff_writeoff_entry(self):
	"""Create a write-off entry for round-off amount"""
	if not self.doc.custom_roundoff_amount or not self.doc.custom_roundoff_account:
		return
	if self.doc.is_return:
		write_off_amount = -self.doc.custom_roundoff_amount
	else:
		write_off_amount = self.doc.custom_roundoff_amount

	roundoff_entry = {
		"charge_type": "Actual",
		"account_head": self.doc.custom_roundoff_account,
		"description": "Round Off Adjustment",
		"tax_amount": write_off_amount,
		"base_tax_amount": write_off_amount or (write_off_amount * self.doc.conversion_rate),
		"add_deduct_tax": "Add" if write_off_amount > 0 else "Deduct",
		"category": "Total",
		"included_in_print_rate": 0,
		"cost_center": self.doc.cost_center
		or frappe.get_cached_value("Company", self.doc.company, "cost_center"),
	}

	self.doc.append("taxes", roundoff_entry)


def get_writeoff_account():
	pos_profile = get_current_pos_profile()
	if pos_profile.write_off_account:
		return pos_profile.write_off_account



def _is_stamp_account(doc, account):
	"""Return True when `account` is used as a stamp tax line on `doc`."""
	return any(
		t.account_head == account and t.get("custom_is_stamp")
		for t in (doc.taxes or [])
	)


def _fix_stamp_gl_entries(doc, gl_entries):
	"""Overwrite GL amounts for stamp tax accounts with the exact LBP value."""
	if not doc.get("taxes"):
		return

	stamp_map = {
		t.account_head: flt(t.custom_stamp_amount_lbp)
		for t in doc.taxes
		if t.get("custom_is_stamp") and flt(t.get("custom_stamp_amount_lbp")) and t.account_head
	}
	if not stamp_map:
		return

	company_currency = frappe.db.get_value("Company", doc.company, "default_currency") or "LBP"
	exchange_rate = flt(getattr(doc, "custom_exchange_rate_override", None)) or 89500

	for gle in gl_entries:
		lbp_amount = stamp_map.get(gle.get("account"))
		if not lbp_amount:
			continue

		if company_currency == "LBP":
			# Debit and credit are already in LBP; just force the exact integer
			if gle.get("credit") or gle.get("credit_in_account_currency"):
				gle["credit"] = lbp_amount
				gle["credit_in_account_currency"] = lbp_amount
			else:
				gle["debit"] = lbp_amount
				gle["debit_in_account_currency"] = lbp_amount
		else:
			# Non-LBP company (e.g. EGP, USD).
			# ERPNext already computed gle["credit"] correctly in company currency
			# (it uses base_tax_amount which equals tax_amount * conversion_rate).
			# We must NOT overwrite that — doing so caused "Debit and Credit not equal"
			# because it substituted the USD amount (4.85) for the EGP amount (728.21).
			# We only need to fix credit_in_account_currency (which ERPNext wrongly sets
			# to the invoice-currency amount) and set the LBP exchange rate so Frappe's
			# GL validator passes: credit_in_account_currency * exchange_rate == credit.
			existing_credit = flt(gle.get("credit") or 0)
			existing_debit  = flt(gle.get("debit") or 0)
			base_amount = existing_credit or existing_debit  # already in company currency
			gle_rate = flt(base_amount / lbp_amount) if lbp_amount else 0

			if existing_credit or gle.get("credit_in_account_currency"):
				gle["credit_in_account_currency"] = lbp_amount
				gle["account_currency"] = "LBP"
				gle["exchange_rate"] = gle_rate
			else:
				gle["debit_in_account_currency"] = lbp_amount
				gle["account_currency"] = "LBP"
				gle["exchange_rate"] = gle_rate


def _fix_multi_currency_payment_gl_entries(doc, gl_entries):
	if not doc.get("payments"):
		return

	# Group payments by mode of payment account
	payment_map = {}
	for p in doc.payments:
		if p.account and (flt(p.custom_payment_original_amount) or p.custom_payment_currency):
			payment_map[p.account] = p

	for gle in gl_entries:
		account = gle.get("account")
		if account in payment_map:
			p = payment_map[account]
			orig_amount = flt(p.custom_payment_original_amount)
			orig_currency = p.custom_payment_currency
			if orig_amount and orig_currency:
				gle["account_currency"] = orig_currency
				if flt(gle.get("debit")) != 0:
					gle["debit_in_account_currency"] = orig_amount
				elif flt(gle.get("credit")) != 0:
					gle["credit_in_account_currency"] = orig_amount


def apply_custom_tax_exemptions(doc):
	import json
	for item in doc.get("items") or []:
		try:
			is_exempt = frappe.db.get_value(
				"Item",
				{"name": item.item_code, "custom_is_tax_exempt": 1},
				"name"
			)
			if is_exempt:
				exempt_dict = {}
				for tax in doc.get("taxes") or []:
					if tax.account_head:
						exempt_dict[tax.account_head] = 0.0
				if not exempt_dict and doc.taxes_and_charges:
					from managely_terminal.managely_terminal.api.electron.sales.sales_invoice import get_tax_template
					tax_doc = get_tax_template(doc.taxes_and_charges)
					if tax_doc and tax_doc.taxes:
						for tax in tax_doc.taxes:
							if tax.account_head:
								exempt_dict[tax.account_head] = 0.0
				if exempt_dict:
					item.item_tax_rate = json.dumps(exempt_dict)
		except Exception as e:
			frappe.log_error(f"Error applying tax exemption for {item.item_code}: {e!s}")


class CustomSalesInvoice(SalesInvoice):
	def calculate_taxes_and_totals(self):
		from erpnext.controllers.taxes_and_totals import calculate_taxes_and_totals as calc_t_t
		orig_update = calc_t_t.update_item_tax_map
		def custom_update(self_calc):
			orig_update(self_calc)
			apply_custom_tax_exemptions(self_calc.doc)
		calc_t_t.update_item_tax_map = custom_update
		try:
			super().calculate_taxes_and_totals()
		finally:
			calc_t_t.update_item_tax_map = orig_update

	def validate(self):
		# Disabled auto loyalty_program assignment
		super().validate()

	def make_loyalty_point_entry(self):
		custom_make_loyalty_point_entry(self)

	def validate_account_currency(self, account, account_currency=None):
		# Skip stamp tax accounts - they use LBP regardless of invoice currency
		if _is_stamp_account(self, account):
			return
		# Skip multi-currency payment accounts (e.g. LBP cash accounts on USD invoices).
		# When a payment is made in LBP on a USD invoice, the account_currency will be
		# LBP but the invoice currency is USD - ERPNext would normally reject this.
		# Our multi-currency GL logic already handles the correct amounts, so we allow it.
		if account_currency and account_currency != (self.currency or frappe.db.get_default("currency") or frappe.db.get_single_value("System Settings", "default_currency") or frappe.db.get_value("Company", {}, "default_currency")):
			account_doc_currency = frappe.db.get_value("Account", account, "account_currency")
			if account_doc_currency and account_doc_currency != self.currency:
				return
		super().validate_account_currency(account, account_currency)

	def get_gl_entries(self, warehouse_account=None):
		from erpnext.accounts.general_ledger import merge_similar_entries

		gl_entries = []

		self.make_roundoff_gl_entry(gl_entries)

		self.make_customer_gl_entry(gl_entries)

		self.make_tax_gl_entries(gl_entries)
		self.make_internal_transfer_gl_entries(gl_entries)

		self.make_item_gl_entries(gl_entries)
		self.make_precision_loss_gl_entry(gl_entries)
		self.make_discount_gl_entries(gl_entries)

		gl_entries = make_regional_gl_entries(gl_entries, self)

		# merge gl entries before adding pos entries
		gl_entries = merge_similar_entries(gl_entries)

		self.make_loyalty_point_redemption_gle(gl_entries)
		self.make_pos_gl_entries(gl_entries)

		self.make_write_off_gl_entry(gl_entries)
		self.make_gle_for_rounding_adjustment(gl_entries)

		_fix_stamp_gl_entries(self, gl_entries)
		_fix_multi_currency_payment_gl_entries(self, gl_entries)
		return gl_entries

	def make_roundoff_gl_entry(self, gl_entries):
		if self.custom_roundoff_account and self.custom_roundoff_amount:
			against_voucher = self.name
			# For return invoices, reverse the GL impact (credit instead of debit)
			if getattr(self, "is_return", 0):
				gl_entries.append(
					self.get_gl_dict(
						{
							"account": self.custom_roundoff_account,
							"party_type": "Customer",
							"party": self.customer,
							"due_date": self.due_date,
							"against": against_voucher,
							"credit": self.custom_base_roundoff_amount,
							"credit_in_account_currency": (
								self.custom_base_roundoff_amount
								if self.party_account_currency == self.company_currency
								else self.custom_roundoff_amount
							),
							"against_voucher": against_voucher,
							"against_voucher_type": self.doctype,
							"cost_center": (
								self.cost_center
								if self.cost_center
								else "Main - " + frappe.db.get_value("Company", self.company, "abbr")
							),
							"project": self.project,
						},
						self.party_account_currency,
						item=self,
					)
				)
			else:
				gl_entries.append(
					self.get_gl_dict(
						{
							"account": self.custom_roundoff_account,
							"party_type": "Customer",
							"party": self.customer,
							"due_date": self.due_date,
							"against": against_voucher,
							"debit": self.custom_base_roundoff_amount,
							"debit_in_account_currency": (
								self.custom_base_roundoff_amount
								if self.party_account_currency == self.company_currency
								else self.custom_roundoff_amount
							),
							"against_voucher": against_voucher,
							"against_voucher_type": self.doctype,
							"cost_center": (
								self.cost_center
								if self.cost_center
								else "Main - " + frappe.db.get_value("Company", self.company, "abbr")
							),
							"project": self.project,
						},
						self.party_account_currency,
						item=self,
					)
				)


@erpnext.allow_regional
def make_regional_gl_entries(gl_entries, doc):
	return gl_entries


def create_payment_entry(sales_invoice, mode_of_payment, amount_paid):
	"""
	Create Payment Entry for B2B Sales Invoice
	"""
	try:
		# Get company and customer details
		company = sales_invoice.company
		customer = sales_invoice.customer

		# Create Payment Entry
		company_doc = frappe.get_doc("Company", company)

		# Handle multiple payment methods
		payment_methods = []
		if isinstance(mode_of_payment, list) and len(mode_of_payment) > 0:
			payment_methods = mode_of_payment
		else:
			payment_methods = [{"method": mode_of_payment or "Cash", "amount": amount_paid}]

		created_entries = []
		for payment in payment_methods:
			method_name = payment.get("method")
			method_amount = float(payment.get("amount") or 0)

			if method_amount <= 0:
				continue

			pe = frappe.new_doc("Payment Entry")
			pe.payment_type = "Receive"
			pe.party_type = "Customer"
			pe.party = customer
			pe.company = company
			pe.posting_date = sales_invoice.posting_date
			pe.mode_of_payment = method_name
			
			# Set accounts
			pe.party_account = get_customer_receivable_account(customer, company)
			
			# Get account for mode of payment
			mode_of_payment_doc = frappe.get_doc("Mode of Payment", method_name)
			for account in mode_of_payment_doc.accounts:
				if account.company == company:
					pe.paid_to = account.default_account
					break
			
			if not pe.paid_to:
				pe.paid_to = company_doc.default_cash_account

			pe.paid_amount = method_amount
			pe.received_amount = method_amount
			pe.source_exchange_rate = 1
			pe.target_exchange_rate = 1
			pe.paid_from_account_currency = sales_invoice.currency
			pe.paid_to_account_currency = sales_invoice.currency

			pe.append(
				"references",
				{
					"reference_doctype": "Sales Invoice",
					"reference_name": sales_invoice.name,
					"allocated_amount": method_amount,
				},
			)

			pe.save()
			pe.submit()
			created_entries.append(pe.name)

		return created_entries

	except Exception as e:
		frappe.log_error(
			frappe.get_traceback(),
			f"Error creating payment entry for invoice {sales_invoice.name}",
		)
		frappe.throw(f"Failed to create payment entry: {e!s}")


def get_customer_receivable_account(customer, company):
	"""Get customer's receivable account using ERPNext utility"""
	try:
		from erpnext.accounts.party import get_party_account

		return get_party_account("Customer", customer, company)
	except Exception as e:
		frappe.log_error(f"Error getting receivable account for customer {customer}: {e!s}")
		return frappe.db.get_value("Company", company, "default_receivable_account")












def delete_draft_invoices_for_opening_entry(opening_entry_name):
	"""
	Delete all draft Sales Invoices linked to the given POS Opening Entry (session).
	Called on POS close when POS Profile has custom_clear_draft_invoices enabled.
	"""
	try:
		drafts = frappe.get_all(
			"Sales Invoice",
			filters={
				"docstatus": 0,
				"custom_pos_opening_entry": opening_entry_name,
			},
			pluck="name",
		)
		deleted = 0
		for name in drafts:
			try:
				doc = frappe.get_doc("Sales Invoice", name)
				if doc.docstatus == 0:
					doc.delete()
					deleted += 1
			except Exception as e:
				frappe.logger().error(f"Error deleting draft invoice {name}: {e}")
		if deleted:
			frappe.logger().info(f"Cleared {deleted} draft invoice(s) for opening entry {opening_entry_name}")
		return deleted
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Clear draft invoices on POS close")
		# Do not raise - closing entry already succeeded
		return 0








class CustomPOSInvoice(POSInvoice):
	"""
	Managely customised POS Invoice.

	Adds a ``use_company_roundoff_cost_center`` property so that the
	standard ERPNext GL-entries generator can access it even when the
	field is not present in the DB schema (avoids AttributeError on
	POS Invoice GL generation in erpnext 15).

	Also overrides ``make_discount_gl_entries`` to ensure
	``enable_discount_accounting`` is always defined (avoids
	UnboundLocalError in erpnext 15 accounts_controller.py).
	"""

	def validate(self):
		# Disabled auto loyalty_program assignment
		super().validate()

	def calculate_taxes_and_totals(self):
		from erpnext.controllers.taxes_and_totals import calculate_taxes_and_totals as calc_t_t
		orig_update = calc_t_t.update_item_tax_map
		def custom_update(self_calc):
			orig_update(self_calc)
			apply_custom_tax_exemptions(self_calc.doc)
		calc_t_t.update_item_tax_map = custom_update
		try:
			super().calculate_taxes_and_totals()
		finally:
			calc_t_t.update_item_tax_map = orig_update

	def make_loyalty_point_entry(self):
		custom_make_loyalty_point_entry(self)

	@property
	def use_company_roundoff_cost_center(self):
		return getattr(self, "_use_company_roundoff_cost_center", False)

	@use_company_roundoff_cost_center.setter
	def use_company_roundoff_cost_center(self, value):
		self._use_company_roundoff_cost_center = value

	def make_discount_gl_entries(self, gl_entries):
		"""Override to guard against UnboundLocalError in erpnext 15."""
		try:
			super().make_discount_gl_entries(gl_entries)
		except UnboundLocalError:
			# enable_discount_accounting not set for POS Invoice doctype in older erpnext 15 builds
			pass

	def make_gl_entries(self, cancel=False, adv_adj=False):
		"""
		For delivery company orders (Toters, Hungerstation, etc.) skip immediate GL posting.
		GL entries (receivable + revenue) will be posted once via the Consolidated Sales Invoice
		at session close, preventing double-posting of the delivery company receivable.
		Backward-compatible: if this invoice already has GL entries (posted before this code was
		deployed) we fall through to the standard logic so cancellation still works correctly.
		"""
		if self.custom_delivery_company:
			has_existing_gl = frappe.db.count(
				"GL Entry",
				{"voucher_type": "POS Invoice", "voucher_no": self.name, "is_cancelled": 0},
			)
			if not has_existing_gl and not cancel:
				# No existing GL entries — skip; consolidated Sales Invoice will post them
				return
		super().make_gl_entries(cancel=cancel, adv_adj=adv_adj)







# ── Custom Loyalty points support for POS Customer (B2C) ────────────────────

def custom_make_loyalty_point_entry(self):
	"""
	Custom loyalty point entry that uses unified_customer + custom_pos_customer.
	No shadow Customer records are created in tabCustomer.
	- Loyalty Point Entry.customer    = unified_customer (the branch Customer — for ERPNext accounting)
	- Loyalty Point Entry.custom_pos_customer = POS Customer name (the real individual customer)
	The update_pos_customer_loyalty hook then updates POS Customer.loyalty_points.
	"""
	import frappe
	if not getattr(self, "custom_pos_customer", None):
		# No POS Customer on this invoice — use standard ERPNext loyalty flow
		super(self.__class__, self).make_loyalty_point_entry()
		return

	from frappe.utils import flt, cint, add_days, getdate

	pos_customer_name = self.custom_pos_customer   # e.g. "ahmed samir"
	unified_customer  = self.customer               # e.g. "zouk branche" (the branch Customer)

	# Ensure loyalty_program is set
	if not self.loyalty_program:
		self.loyalty_program = frappe.db.get_single_value("Terminal Settings", "default_loyalty_program")
	if not self.loyalty_program:
		return

	# ── Handle REDEMPTION (negative entry for points consumed) ───────────────
	if getattr(self, 'redeem_loyalty_points', 0) and getattr(self, 'loyalty_points', 0) > 0:
		redemption_account = frappe.db.get_value("Loyalty Program", self.loyalty_program, "expense_account") or ""
		cost_center        = frappe.db.get_value("Loyalty Program", self.loyalty_program, "cost_center") or ""

		# Prevent duplicate redemption entry
		if not frappe.db.exists("Loyalty Point Entry", {
			"invoice": self.name, "invoice_type": self.doctype, "loyalty_points": ["<", 0]
		}):
			redemption_lpe = frappe.get_doc({
				"doctype": "Loyalty Point Entry",
				"company": self.company,
				"loyalty_program": self.loyalty_program,
				"customer": unified_customer,
				"custom_pos_customer": pos_customer_name,
				"invoice_type": self.doctype,
				"invoice": self.name,
				"loyalty_points": -1 * cint(self.loyalty_points),
				"purchase_amount": flt(self.loyalty_amount),
				"redemption_account": redemption_account,
				"redemption_cost_center": cost_center,
				"posting_date": self.posting_date,
			})
			redemption_lpe.flags.ignore_permissions = 1
			redemption_lpe.save()
			frappe.logger().info(f"[LOYALTY] -{cint(self.loyalty_points)} pts redeemed — POS Customer '{pos_customer_name}'")

	# ── Prevent duplicate earning entries ─────────────────────────────────────
	if frappe.db.exists("Loyalty Point Entry", {
		"invoice": self.name, "invoice_type": self.doctype, "loyalty_points": [">", 0]
	}):
		return

	# ── Calculate EARNING points ──────────────────────────────────────────────
	lp_doc = frappe.get_doc("Loyalty Program", self.loyalty_program)

	today = getdate(self.posting_date)
	if lp_doc.from_date and getdate(lp_doc.from_date) > today:
		return
	if lp_doc.to_date and getdate(lp_doc.to_date) < today:
		return

	# Determine collection factor from tier rules (based on total purchase history)
	collection_factor = 1.0
	tier_name = None
	if lp_doc.collection_rules:
		total_purchase = frappe.db.sql("""
			SELECT COALESCE(SUM(purchase_amount), 0)
			FROM `tabLoyalty Point Entry`
			WHERE custom_pos_customer = %s AND loyalty_points > 0
		""", (pos_customer_name,))[0][0] or 0.0

		for rule in sorted(lp_doc.collection_rules, key=lambda r: r.min_spent or 0, reverse=True):
			if (rule.min_spent or 0) <= float(total_purchase):
				collection_factor = rule.collection_factor or 1.0
				tier_name = rule.tier_name
				break
		else:
			# No tier matched — use first rule
			first = lp_doc.collection_rules[0]
			collection_factor = first.collection_factor or 1.0
			tier_name = first.tier_name

	returned_amount = self.get_returned_amount()
	current_amount  = flt(self.grand_total) - cint(self.loyalty_amount)
	eligible_amount = current_amount - returned_amount

	if eligible_amount <= 0:
		return

	points_earned = cint(eligible_amount / collection_factor) if collection_factor else 0
	if points_earned <= 0:
		return

	expiry_date = add_days(self.posting_date, lp_doc.expiry_duration) if lp_doc.expiry_duration else None

	earning_lpe = frappe.get_doc({
		"doctype": "Loyalty Point Entry",
		"company": self.company,
		"loyalty_program": self.loyalty_program,
		"loyalty_program_tier": tier_name,
		"customer": unified_customer,
		"custom_pos_customer": pos_customer_name,
		"invoice_type": self.doctype,
		"invoice": self.name,
		"loyalty_points": points_earned,
		"purchase_amount": eligible_amount,
		"expiry_date": expiry_date,
		"posting_date": self.posting_date,
	})
	earning_lpe.flags.ignore_permissions = 1
	earning_lpe.save()
	frappe.logger().info(f"[LOYALTY] +{points_earned} pts -> POS Customer '{pos_customer_name}'")

import erpnext.accounts.doctype.loyalty_program.loyalty_program as lp_module
import erpnext.accounts.doctype.sales_invoice.sales_invoice as si_module

def custom_validate_loyalty_points(ref_doc, points_to_redeem):
	# If this is a Managely POS invoice and has custom_pos_customer
	if getattr(ref_doc, "custom_pos_customer", None):
		import frappe
		from frappe.utils import flt, today
		from erpnext.accounts.doctype.loyalty_program.loyalty_program import get_loyalty_program_details_with_points

		customer_id = ref_doc.custom_pos_customer
		
		# Ensure the customer's loyalty program is set on the invoice
		if not ref_doc.loyalty_program:
			ref_doc.loyalty_program = frappe.db.get_single_value("Terminal Settings", "default_loyalty_program")

		if not ref_doc.loyalty_program:
			return

		if points_to_redeem:
			# Get available points directly from POS Customer — no shadow Customer needed
			available_points = int(frappe.db.get_value("POS Customer", customer_id, "loyalty_points") or 0)

			if points_to_redeem > available_points:
				frappe.throw(f"You don't have enough Loyalty Points to redeem. Available: {available_points}")

			# Get conversion factor from the Loyalty Program (monetary value per point)
			conversion_factor = flt(frappe.db.get_value(
				"Loyalty Program", ref_doc.loyalty_program, "conversion_factor"
			) or 1.0)

			ref_doc.loyalty_amount = flt(points_to_redeem * conversion_factor)
	else:
		# Call original standard validation
		lp_module.original_validate_loyalty_points(ref_doc, points_to_redeem)

# Keep original references
if not hasattr(lp_module, "original_validate_loyalty_points"):
	lp_module.original_validate_loyalty_points = lp_module.validate_loyalty_points

# Apply monkey patches
lp_module.validate_loyalty_points = custom_validate_loyalty_points
si_module.validate_loyalty_points = custom_validate_loyalty_points
