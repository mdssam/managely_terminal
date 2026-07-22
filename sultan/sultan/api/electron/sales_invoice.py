import json

import erpnext
import frappe
from erpnext.accounts.doctype.sales_invoice.sales_invoice import SalesInvoice
from erpnext.accounts.doctype.pos_invoice.pos_invoice import POSInvoice
from frappe import _
from frappe.utils import flt

from sultan.sultan.utils import get_current_pos_profile

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
		from sultan.sultan.utils import get_user_pos_profile_name
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


@frappe.whitelist()
def get_my_unpaid_drafts():
	"""
	Returns a list of unpaid draft POS Invoices created by the current user.
	"""
	user = frappe.session.user
	if user == "Guest":
		return {"success": False, "error": "Not logged in"}

	drafts = frappe.get_all(
		"POS Invoice",
		filters={"docstatus": 0, "owner": user},
		fields=["name", "creation", "customer", "customer_name", "grand_total"],
		order_by="creation desc",
		limit_page_length=50
	)
	
	return {"success": True, "data": drafts}


@frappe.whitelist(allow_guest=True)
def get_sales_invoices(limit=100, start=0, search="", skip_opening_entry_filter=False, cashier_name=None, submitted_only=False, pos_profile=None, employee=None):
	"""
	Get sales invoices with proper filtering based on user role and POS opening entry.

	Args:
		skip_opening_entry_filter: If True, skip filtering by opening entry (for Invoice History page)
		cashier_name: Filter by cashier name (full name). If provided, only returns invoices for that cashier.
		submitted_only: If True, only return submitted invoices (docstatus=1). Use for Sales Dashboard; excludes Draft and Cancelled.
		pos_profile: Filter by POS Profile name. If provided, only returns invoices for that branch/profile.
	"""
	try:
		# Convert string to boolean if needed (Frappe passes query params as strings)
		if isinstance(skip_opening_entry_filter, str):
			skip_opening_entry_filter = skip_opening_entry_filter.lower() in ("true", "1", "yes")
		if isinstance(submitted_only, str):
			submitted_only = submitted_only.lower() in ("true", "1", "yes")

		# Get user IDs / POS Opening Entries for cashier filter if cashier_name is provided
		cashier_user_ids = None
		cashier_opening_entries = None
		if cashier_name and cashier_name != "all":
			cashier_user_ids = _get_user_ids_by_full_name(cashier_name)
			cashier_opening_entries = _get_opening_entries_by_employee_name(cashier_name)
			if not cashier_user_ids and not cashier_opening_entries:
				# No users found with this name, return empty result
				return {"success": True, "data": [], "total_count": 0}

		filters, fields = _build_filters_and_fields(
			skip_opening_entry_filter=skip_opening_entry_filter,
			cashier_user_ids=cashier_user_ids,
			cashier_opening_entries=cashier_opening_entries,
			submitted_only=submitted_only,
			pos_profile=pos_profile,
			employee=employee,
		)

		# Build search filters
		or_filters = _build_search_filters(search)

		# Fetch from POS Invoice
		pos_filters = filters.copy()
		pos_fields = fields.copy()

		pos_invoices = frappe.get_all(
			"POS Invoice",
			filters=pos_filters,
			or_filters=or_filters,
			fields=pos_fields,
			order_by="modified desc",
			limit=int(start) + int(limit),
		)

		for pinv in pos_invoices:
			pinv["doctype"] = "POS Invoice"

		# Slice for pagination
		invoices = pos_invoices[int(start):int(start)+int(limit)]

		# Counts
		pos_count_rows = frappe.get_all(
			"POS Invoice", filters=pos_filters, or_filters=or_filters, fields=["count(name) as total"]
		)
		pos_total = pos_count_rows[0].total if pos_count_rows else 0

		total_count = pos_total

		# Batch fetch related data
		invoice_names = [inv.name for inv in invoices]
		user_ids = list(set([inv.owner for inv in invoices]))

		cashier_names_map = _batch_fetch_cashier_names(user_ids)
		opening_cashier_map = _batch_fetch_opening_cashier_names(invoice_names)
		payment_methods_map = _batch_fetch_payment_methods(invoice_names)
		items_map = _batch_fetch_items(invoice_names)

		# Process and enrich invoices
		_process_invoices(invoices, cashier_names_map, opening_cashier_map, payment_methods_map, items_map)

		return {"success": True, "data": invoices, "total_count": total_count}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error fetching sales invoices")
		return {"success": False, "error": str(e)}


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

	cashier_query = """
		SELECT name, full_name
		FROM `tabUser`
		WHERE name IN ({})
	""".format(",".join([f"'{uid}'" for uid in user_ids]))
	cashier_results = frappe.db.sql(cashier_query, as_dict=True)
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

	payment_query = """
		SELECT parent, mode_of_payment, amount, custom_payment_original_amount, custom_payment_currency
		FROM `tabSales Invoice Payment`
		WHERE parent IN ({})
	""".format(",".join([f"'{name}'" for name in invoice_names]))
	payment_results = frappe.db.sql(payment_query, as_dict=True)

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

	returns_query = """
		SELECT sii.item_code, COALESCE(SUM(ABS(sii.qty)), 0) as total_returned_qty
		FROM `tabSales Invoice` si
		JOIN `tabSales Invoice Item` sii ON si.name = sii.parent
		WHERE si.is_return = 1
		  AND si.return_against = %s
		  AND sii.item_code IN ({})
		  AND si.docstatus = 1
		  AND si.customer = %s
		GROUP BY sii.item_code
	""".format(",".join([f"'{code}'" for code in item_codes]))

	returns_data = frappe.db.sql(returns_query, (invoice.name, invoice.customer), as_dict=True)
	returned_qty_map = {row.item_code: row.total_returned_qty for row in returns_data}

	# Update items with return data
	for item in items:
		returned_qty_value = returned_qty_map.get(item["item_code"], 0)
		item["returned_qty"] = round(float(returned_qty_value), 6)
		item["available_qty"] = round(item["qty"] - returned_qty_value, 6)


@frappe.whitelist(allow_guest=True)
def get_invoice_details(invoice_id):
	"""
	Main function to fetch complete invoice details.
	"""
	try:
		doctype = "POS Invoice" if frappe.db.exists("POS Invoice", invoice_id) else "Sales Invoice"
		invoice = frappe.get_doc(doctype, invoice_id)
		invoice_data = invoice.as_dict()

		# Get items with return data
		items = _get_invoice_items_with_returns(invoice_id, invoice.customer, doctype)

		# Get address and customer information
		address_data = _get_address_and_customer_info(invoice)

		# Override display customer details if POS Customer is linked
		if getattr(invoice, "custom_pos_customer", None):
			pos_cust_name = frappe.db.get_value("POS Customer", invoice.custom_pos_customer, "customer_name")
			if pos_cust_name:
				invoice_data["customer"] = pos_cust_name
				invoice_data["customer_name"] = pos_cust_name

		# Format posting time
		if invoice_data.get("posting_time"):
			if hasattr(invoice_data["posting_time"], "total_seconds"):
				total_seconds = int(invoice_data["posting_time"].total_seconds())
				hours = total_seconds // 3600
				minutes = (total_seconds % 3600) // 60
				seconds = total_seconds % 60
				invoice_data["posting_time"] = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
			else:
				invoice_data["posting_time"] = str(invoice_data["posting_time"])

		# Get cashier full name. Prefer the employee verified at POS session
		# opening; fall back to the ERPNext document owner.
		cashier_name = _get_invoice_cashier_name(invoice_data)
		invoice_data["cashier_name"] = cashier_name

		return {
			"success": True,
			"data": {
				**invoice_data,
				"items": items,
				**address_data,
			},
		}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), f"Error fetching invoice {invoice_id}")
		return {"success": False, "error": str(e)}


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
		# Check returns in Sales Invoice
		si_returns_query = """
			SELECT sii.item_code, COALESCE(SUM(ABS(sii.qty)), 0) as total_returned_qty
			FROM `tabSales Invoice` si
			JOIN `tabSales Invoice Item` sii ON si.name = sii.parent
			WHERE si.is_return = 1
			  AND si.return_against = %s
			  AND sii.item_code IN ({})
			  AND si.docstatus = 1
			GROUP BY sii.item_code
		""".format(",".join([f"'{code}'" for code in item_codes]))

		# Check returns in POS Invoice
		pos_returns_query = """
			SELECT pii.item_code, COALESCE(SUM(ABS(pii.qty)), 0) as total_returned_qty
			FROM `tabPOS Invoice` pi
			JOIN `tabPOS Invoice Item` pii ON pi.name = pii.parent
			WHERE pi.is_return = 1
			  AND pi.return_against = %s
			  AND pii.item_code IN ({})
			  AND pi.docstatus = 1
			GROUP BY pii.item_code
		""".format(",".join([f"'{code}'" for code in item_codes]))

		si_returns_data = frappe.db.sql(si_returns_query, (invoice_id,), as_dict=True)
		pos_returns_data = frappe.db.sql(pos_returns_query, (invoice_id,), as_dict=True)

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


@frappe.whitelist()
def create_and_submit_invoice(data):
	try:
		import time

		start_time = time.time()

		# Validate input data
		if not data:
			frappe.throw("No data provided for invoice creation")

		if isinstance(data, str):
			data = json.loads(data)

		draft_id = data.get("draft_id")

		(
			customer,
			items,
			amount_paid,
			sales_and_tax_charges,
			mode_of_payment,
			business_type,
			roundoff_amount,
			delivery_personnel,
		) = parse_invoice_data(data)

		# Validate required fields
		if not customer:
			frappe.throw("Customer is required")
		if not items or len(items) == 0:
			frappe.throw("At least one item is required")

		# Build invoice document
		doc = build_sales_invoice_doc(
			customer,
			items,
			amount_paid,
			sales_and_tax_charges,
			mode_of_payment,
			business_type,
			roundoff_amount,
			include_payments=True,
			delivery_personnel=delivery_personnel,
			draft_id=draft_id,
			delivery_fee=flt(data.get("deliveryFee", 0.0)),
		)

		if data.get("is_return"):
			doc.is_return = 1
			doc.return_against = data.get("return_against")
			doc.is_pos = 1

		# Sultan custom fields
		doc.custom_pos_order_type = data.get("custom_pos_order_type") or ("Delivery" if float(data.get("deliveryFee", 0.0)) > 0 or data.get("deliveryPersonnel") else "Pickup")
		doc.cashier_name = data.get("cashier_name") or ""
		doc.employee_username = data.get("employee_username") or ""
		doc.custom_driver_settled = data.get("custom_driver_settled") or 0
		doc.custom_delivery_prepaid = data.get("custom_delivery_prepaid") or 0
		if not getattr(doc, "custom_pos_opening_entry", None):
			doc.custom_pos_opening_entry = data.get("custom_pos_opening_entry") or data.get("pos_session")

		doc.base_paid_amount = amount_paid
		doc.paid_amount = amount_paid
		
		# If it is a COD delivery order, it is unpaid until driver settles
		custom_delivery_cod = data.get("custom_delivery_cod")
		if custom_delivery_cod is not None:
			is_delivery_cod = int(custom_delivery_cod) == 1
		else:
			is_delivery_cod = (data.get("deliveryPersonnel") and data.get("paymentMethods") is None) or (data.get("deliveryStatus") == "Pending")
		if is_delivery_cod:
			doc.custom_delivery_cod = 1
			doc.outstanding_amount = doc.grand_total
			# POS Invoice requires at least one payment row to pass validate_mode_of_payment
			if not doc.get("payments"):
				try:
					pos_profile_doc = frappe.get_cached_doc("POS Profile", doc.pos_profile)
					default_mop = None
					if pos_profile_doc.get("payments"):
						for pm in pos_profile_doc.payments:
							if pm.default:
								default_mop = pm.mode_of_payment
								break
						if not default_mop:
							default_mop = pos_profile_doc.payments[0].mode_of_payment
					if default_mop:
						doc.append("payments", {"mode_of_payment": default_mop, "amount": 0, "default": 1})
				except Exception:
					pass
		else:
			doc.outstanding_amount = flt(doc.grand_total) - flt(amount_paid)

		# When the POS Profile has "Consolidate Invoice on Close" enabled, save as a
		# draft and return immediately.  GL entries and stock deductions are posted
		# in batch when the cashier closes the session (_submit_draft_invoices_for_closing).
		use_consolidation = False
		if use_consolidation:
			doc.save(ignore_permissions=True)
			processing_time = time.time() - start_time
			frappe.logger().info(
				f"Draft invoice {doc.name} saved (consolidation mode) in {processing_time:.2f}s"
			)
			return {
				"success": True,
				"invoice_name": doc.name,
				"invoice_id": doc.name,
				"invoice": {
					"name": doc.name,
					"doctype": doc.doctype,
					"customer": doc.customer,
					"customer_name": doc.customer_name,
					"posting_date": doc.posting_date,
					"base_grand_total": doc.base_grand_total,
					"currency": doc.currency,
					"status": "Draft",
					"is_pos": doc.is_pos,
					"company": doc.company,
				},
				"payment_entry": None,
				"processing_time": round(processing_time, 2),
			}

		# Standard path: save then submit; if submit fails (e.g. negative stock),
		# rollback the save and return error.
		# COD delivery invoices are saved as Draft until the driver collects payment.
		if is_delivery_cod:
			doc.save(ignore_permissions=True)
			processing_time = time.time() - start_time
			frappe.logger().info(f"COD Invoice {doc.name} saved as Draft (unpaid) in {processing_time:.2f}s")
			return {
				"success": True,
				"invoice_name": doc.name,
				"invoice_id": doc.name,
				"invoice": {
					"name": doc.name,
					"doctype": doc.doctype,
					"customer": doc.customer,
					"customer_name": doc.customer_name,
					"posting_date": doc.posting_date,
					"base_grand_total": doc.base_grand_total,
					"currency": doc.currency,
					"status": "Draft",
					"is_pos": doc.is_pos,
					"company": doc.company,
					"docstatus": 0,
				},
				"payment_entry": None,
				"processing_time": round(processing_time, 2),
			}

		doc.save(ignore_permissions=True)
		# After save, ERPNext recalculates rounded_total / grand_total.
		# Sync paid_amount with the final invoice total to satisfy validate_full_payment().
		_invoice_total = flt(doc.rounded_total) or flt(doc.grand_total)
		if _invoice_total and flt(doc.paid_amount) != _invoice_total:
			if doc.payments:
				# Adjust last payment row to cover any rounding gap
				_diff = _invoice_total - sum(flt(p.amount) for p in doc.payments[:-1])
				doc.payments[-1].amount = flt(_diff, doc.precision("paid_amount"))
			doc.paid_amount = _invoice_total
			doc.base_paid_amount = _invoice_total * (doc.conversion_rate or 1)
			doc.outstanding_amount = 0
			doc.db_update()
		try:
			doc.submit()
		except Exception as submit_err:
			frappe.db.rollback()  # ← undo the save + partial submit atomically
			frappe.log_error(frappe.get_traceback(), "Submit Invoice Error (e.g. negative stock)")
			return {"success": False, "message": str(submit_err)}

		payment_entry = None
		should_create_payment_entry = False

		if business_type == "B2B":
			should_create_payment_entry = True
		elif business_type == "B2B & B2C":
			# For B2B & B2C, only create payment entry for company customers
			global _cached_customer_data
			if customer not in _cached_customer_data:
				_cached_customer_data[customer] = frappe.get_doc("Customer", customer)

			customer_doc = _cached_customer_data[customer]
			if customer_doc.customer_type == "Company":
				should_create_payment_entry = True

		if should_create_payment_entry and mode_of_payment and amount_paid > 0:
			try:
				payment_entry = create_payment_entry(doc, mode_of_payment, amount_paid)
			except Exception:
				frappe.log_error(frappe.get_traceback(), f"Payment Entry Error for {doc.name}")
				payment_entry = None

		processing_time = time.time() - start_time
		frappe.logger().info(f"Invoice {doc.name} processed in {processing_time:.2f} seconds")

		# Return minimal invoice data for frontend performance
		return {
			"success": True,
			"invoice_name": doc.name,
			"invoice_id": doc.name,
			"invoice": {
				"name": doc.name,
				"doctype": doc.doctype,
				"customer": doc.customer,
				"customer_name": doc.customer_name,
				"posting_date": doc.posting_date,
				"base_grand_total": doc.base_grand_total,
				"currency": doc.currency,
				"status": doc.status,
				"is_pos": doc.is_pos,
				"company": doc.company,
			},
			"payment_entry": payment_entry.name if payment_entry else None,
			"processing_time": round(processing_time, 2),
		}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Submit Invoice Error")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def create_draft_invoice(data):
	try:
		if isinstance(data, str):
			data = json.loads(data)
			
		draft_id = data.get("draft_id")
		frappe.log_error(message=f"Received draft_id: {draft_id}. Exists: {frappe.db.exists('POS Invoice', draft_id) if draft_id else False}", title="create_draft_invoice debug")

		(
			customer,
			items,
			amount_paid,
			sales_and_tax_charges,
			mode_of_payment,
			business_type,
			roundoff_amount,
			delivery_personnel,
		) = parse_invoice_data(data)
		doc = build_sales_invoice_doc(
			customer,
			items,
			amount_paid,
			sales_and_tax_charges,
			mode_of_payment,
			business_type,
			roundoff_amount,
			include_payments=True,
			delivery_personnel=delivery_personnel,
			draft_id=draft_id,
		)

		if not doc.get("payments"):
			pos_profile_doc = frappe.get_cached_doc("POS Profile", doc.pos_profile)
			default_mode_of_payment = None
			if pos_profile_doc.get("payments"):
				for pm in pos_profile_doc.payments:
					if pm.default:
						default_mode_of_payment = pm.mode_of_payment
						break
				if not default_mode_of_payment:
					default_mode_of_payment = pos_profile_doc.payments[0].mode_of_payment
			
			if default_mode_of_payment:
				doc.append("payments", {
					"mode_of_payment": default_mode_of_payment,
					"amount": 0,
					"default": 1
				})

		if doc.name:
			frappe.log_error(message=f"Saving existing document. name: {doc.name}", title="create_draft_invoice debug doc.name")
			doc.save(ignore_permissions=True)
		else:
			frappe.log_error(message=f"Inserting new document.", title="create_draft_invoice debug doc.name")
			doc.insert(ignore_permissions=True)

		return {"success": True, "invoice_name": doc.name, "invoice": doc}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Draft Invoice Error")
		return {"success": False, "message": str(e)}


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

	# Offline-synced invoices carry a temporary OFFLINE_CUST- or CUST- id. Resolve it to a
	# real ERPNext customer before building the invoice document.
	if customer and isinstance(customer, str) and (customer.startswith("CUST-") or customer.startswith("OFFLINE_CUST-")):
		phone = customer_obj.get("phone") or customer_obj.get("mobile_no")
		cust_name = customer_obj.get("name") or customer_obj.get("customer_name")
		pos_cust_name = None
		if phone:
			pos_cust_name = frappe.db.get_value("POS Customer", {"mobile_no": phone}, "name")
		if not pos_cust_name and cust_name:
			pos_cust_name = frappe.db.get_value("POS Customer", {"customer_name": cust_name}, "name")
		if pos_cust_name:
			customer = pos_cust_name
		else:
			resolved = _resolve_offline_customer(customer_obj, pos_profile)
			if resolved:
				customer = resolved
	elif not customer or (isinstance(customer, str) and customer.startswith("OFFLINE_CUST-")):
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
		
	doc.is_pos = 1
	doc.ignore_pricing_rule = 1

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

	# Set delivery details only for Delivery orders (not Pickup)
	# Determine order type: check custom_pos_order_type if available
	_is_pickup_order = (business_type == "Pickup") or (not delivery_personnel and flt(delivery_fee) == 0.0)
	if (delivery_personnel or flt(delivery_fee) > 0.0) and not _is_pickup_order:
		if delivery_personnel:
			doc.custom_delivery_personnel = delivery_personnel
		doc.custom_delivery_status = "Pending"
		doc.custom_delivery_fee = flt(delivery_fee)
	else:
		# Pickup order: ensure no delivery_status is set
		doc.custom_delivery_status = None

	# Configure POS profile and company settings
	pos_profile = _get_active_pos_profile()
	_set_pos_profile_fields(doc, pos_profile, customer, business_type)

	# Ensure batch/serial requirements are satisfied BEFORE building items
	_validate_and_autofetch_batch_and_serial(items, pos_profile)

	# Set posting details
	_set_posting_fields(doc)

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
			shipping_account = "626100020 - Delivery Charge - SG"
			
		if not frappe.db.exists("Account", shipping_account):
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
# def _autofetch_batch_fifo(item_code, warehouse, qty):
# 	"""
# 	Simple FIFO-based batch selector.

# 	Strategy:
# 	- Prefer non-expired batches for the given item.
# 	- Order by expiry_date ASC, then creation ASC (FIFO style).
# 	- Currently does NOT enforce per-warehouse stock; core ERPNext validations
# 	  will still ensure there is sufficient stock when the invoice is submitted.
# 	"""
# 	from frappe.utils import nowdate

# 	today = nowdate()

# 	# Filter by item and non-expired batches; ignore disabled batches
# 	batches = frappe.get_all(
# 		"Batch",
# 		filters={
# 			"item": item_code,
# 			"disabled": 0,
# 			"expiry_date": [">=", today],
# 		},
# 		fields=["name", "expiry_date", "creation"],
# 		order_by="expiry_date asc, creation asc",
# 		limit_page_length=1,
# 	)

# 	if not batches:
# 		# Fallback: try ANY active batch if no expiry_date / future-dated batches exist
# 		batches = frappe.get_all(
# 			"Batch",
# 			filters={
# 				"item": item_code,
# 				"disabled": 0,
# 			},
# 			fields=["name", "creation"],
# 			order_by="creation asc",
# 			limit_page_length=1,
# 		)

# 	return batches[0].name if batches else None

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


def _set_posting_fields(doc):
	"""Set posting date, time and related fields."""
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

	item_query = """
		SELECT name, item_name, has_batch_no, has_serial_no
		FROM `tabItem`
		WHERE name IN ({})
	""".format(",".join([f"'{code}'" for code in item_codes]))

	item_results = frappe.db.sql(item_query, as_dict=True)
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

	final_rate = flt(item.get("rate") if item.get("rate") is not None else (item.get("price") or 0.0))
	original_price = flt(item.get("price_list_rate") or item.get("price") or 0.0)

	# If price_list_rate was not provided by the frontend, fetch it from the ERPNext price list
	if not original_price:
		try:
			original_price = flt(frappe.db.get_value(
				"Item Price",
				{"item_code": item_code, "selling": 1},
				"price_list_rate",
				order_by="creation desc",
			) or 0.0)
		except Exception:
			original_price = 0.0

	# Determine if pricing rule should be ignored
	if final_rate == 0.0 and original_price > 0.0:
		# This is a free/promotional item ??? preserve the 0 rate
		ignore_pricing_rule = 1
		discount_percentage = 100.0
		discount_amount = original_price
	else:
		if original_price and final_rate != original_price:
			ignore_pricing_rule = 1
		else:
			ignore_pricing_rule = 0
		discount_percentage = flt(item.get("discountPercentage") or item.get("discount_percentage") or 0.0)
		discount_amount = flt(item.get("discountAmount") or item.get("discount_amount") or 0.0)

	# Do not divide final_rate or original_price manually.
	# We set the tax template rows as inclusive (included=1) so ERPNext handles the division internally.
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
        "is_free_item": 1 if final_rate == 0.0 else 0,
        "ignore_pricing_rule": ignore_pricing_rule,
		# "rate": item.get("price"),
		# "rate": item.get("original_price") or item.get("price"),
		# "rate": item.get("discountedPrice") or item.get("price"),
		"discount_percentage": flt(discount_percentage),
    	"discount_amount": flt(discount_amount),
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


@frappe.whitelist()
def return_sales_invoice(invoice_name):
	try:
		original_invoice = frappe.get_doc("Sales Invoice", invoice_name)

		if original_invoice.docstatus != 1:
			frappe.throw("Only submitted invoices can be returned.")

		if original_invoice.is_return:
			frappe.throw("This invoice is already a return.")

		# Exclude payment mapping
		return_doc = get_mapped_doc(
			"Sales Invoice",
			invoice_name,
			{
				"Sales Invoice": {
					"doctype": "Sales Invoice",
					"field_map": {"name": "return_against"},
					"validation": {"docstatus": ["=", 1]},
				},
				"Sales Invoice Item": {
					"doctype": "Sales Invoice Item",
					"field_map": {"name": "prevdoc_detail_docname"},
				},
				"Sales Taxes and Charges": {
					"doctype": "Sales Taxes and Charges",
				},
			},
		)

		return_doc.is_return = 1
		return_doc.posting_date = frappe.utils.nowdate()

		for item in return_doc.items:
			item.qty = -abs(item.qty)
			item.sales_invoice_item = item.prevdoc_detail_docname
			item.pos_invoice_item = item.prevdoc_detail_docname

		# Mirror original round-off/write-off as POSITIVE on return; totals logic handles sign for returns
		try:
			if getattr(original_invoice, "custom_roundoff_amount", 0):
				return_doc.custom_roundoff_amount = abs(original_invoice.custom_roundoff_amount or 0)
				return_doc.custom_base_roundoff_amount = abs(
					getattr(original_invoice, "custom_base_roundoff_amount", 0) or 0
				)
				# keep same account
				return_doc.custom_roundoff_account = getattr(
					original_invoice, "custom_roundoff_account", None
				)
				# Do not set standard write_off fields on returns to avoid double impact in GL
		except Exception:
			# non-fatal; continue without custom roundoff
			pass

		return_doc.payments = []
		for p in original_invoice.payments:
			return_doc.append(
				"payments",
				{
					"mode_of_payment": p.mode_of_payment,
					"amount": -abs(p.amount),
					"account": p.account,
				},
			)

		# Payment sync will be handled after save so totals include write-off adjustments

		return_doc.save(ignore_permissions=True)

		# After save (totals finalized by validate), sync payments to match grand/rounded total
		if getattr(return_doc, "custom_roundoff_amount", 0):
			try:
				return_doc.reload()
			except Exception:
				pass
			final_total = getattr(return_doc, "rounded_total", None)
			if final_total is None:
				final_total = return_doc.grand_total
			desired_payment = abs(flt(final_total, return_doc.precision("grand_total")))
			if desired_payment > 0:
				if return_doc.payments and len(return_doc.payments) > 0:
					# For returns, record refund as positive amount on payment row
					return_doc.payments[0].amount = desired_payment
					for _p in return_doc.payments[1:]:
						_p.amount = 0
				else:
					return_doc.append(
						"payments",
						{"mode_of_payment": "Cash", "amount": desired_payment},
					)
			# Sync totals fields
			return_doc.paid_amount = desired_payment
			return_doc.base_paid_amount = desired_payment * (return_doc.conversion_rate or 1)
			return_doc.outstanding_amount = 0
			return_doc.save(ignore_permissions=True)

		return_doc.submit()

		return {"success": True, "return_invoice": return_doc.name}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Return Invoice Error")
		return {"success": False, "message": str(e)}


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
	# print("Round-off amount before adjustment:", self.doc.custom_roundoff_amount)

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


class CustomSalesInvoice(SalesInvoice):
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


@frappe.whitelist()
def returned_qty(customer, sales_invoice, item):
	"""
	Get total returned quantity for a specific item (item_code) against a given sales invoice.
	- sales_invoice should be the original invoice name.
	- item should be the item_code (not item name or child row name).
	Returns: {'total_returned_qty': <float>}
	"""
	values = {
		"customer": customer,
		"sales_invoice": sales_invoice,
		"item": item,
	}

	# Sum qty from Sales Invoice Items of return invoices that point to the original invoice
	si_result = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(sii.qty), 0) AS total_returned_qty
		FROM `tabSales Invoice` si
		JOIN `tabSales Invoice Item` sii ON si.name = sii.parent
		WHERE si.is_return = 1
		  AND si.return_against = %(sales_invoice)s
		  AND sii.item_code = %(item)s
		  AND si.docstatus = 1
		""",
		values=values,
		as_dict=True,
	)

	# Sum qty from POS Invoice Items of return invoices that point to the original invoice
	pos_result = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(pii.qty), 0) AS total_returned_qty
		FROM `tabPOS Invoice` pi
		JOIN `tabPOS Invoice Item` pii ON pi.name = pii.parent
		WHERE pi.is_return = 1
		  AND pi.return_against = %(sales_invoice)s
		  AND pii.item_code = %(item)s
		  AND pi.docstatus = 1
		""",
		values=values,
		as_dict=True,
	)

	total_si = abs(si_result[0]["total_returned_qty"]) if si_result else 0.0
	total_pos = abs(pos_result[0]["total_returned_qty"]) if pos_result else 0.0
	total = total_si + total_pos

	return {
		"total_returned_qty": round(float(total), 6)
	}  # Round to 6 decimal places to avoid precision issues


@frappe.whitelist()
def get_valid_sales_invoices(doctype, txt, searchfield, start, page_len, filters=None):
	"""Get valid sales invoices based on filters for multi-invoice returns"""
	filters = filters or {}
	customer = filters.get("customer")
	shipping_address = filters.get("shipping_address")
	item_code = filters.get("item") or filters.get("item_code")
	start_date = filters.get("start_date")

	# Check if customer is a POS Customer
	is_pos_cust = False
	customer_display_name = customer
	if customer:
		is_pos_cust = frappe.db.exists("POS Customer", {"customer_name": customer}) or frappe.db.exists("POS Customer", customer)
		if is_pos_cust:
			customer_display_name = frappe.db.get_value("POS Customer", customer, "customer_name") or customer

	# Build dynamic conditions for Sales Invoice
	conditions = [
		"si.docstatus = 1",
		"si.is_return = 0",
		"si.custom_pos_opening_entry IS NOT NULL AND si.custom_pos_opening_entry != ''",
	]
	query_params = {
		"txt": f"%{txt}%",
		"start": int(start),
		"page_len": int(page_len),
		"customer": customer,
		"customer_name": customer_display_name,
	}

	if customer:
		if is_pos_cust:
			unified_customer = frappe.db.get_value("POS Customer", customer, "unified_customer") or frappe.db.get_value("POS Customer", {"customer_name": customer}, "unified_customer")
			if unified_customer:
				conditions.append("(si.customer = %(customer)s OR si.customer = %(unified_customer)s)")
				query_params["unified_customer"] = unified_customer
			else:
				conditions.append("si.customer = %(customer)s")
		else:
			conditions.append("si.customer = %(customer)s")

	if shipping_address:
		conditions.append("si.shipping_address_name = %(shipping_address)s")
		query_params["shipping_address"] = shipping_address

	if item_code:
		conditions.append("sii.item_code = %(item_code)s")
		query_params["item_code"] = item_code

	if start_date:
		conditions.append("si.posting_date >= %(start_date)s")
		query_params["start_date"] = start_date

	conditions.append(
		"""
		(sii.qty + COALESCE((
			SELECT SUM(cd.qtr)
			FROM `tabCredit Details` cd
			JOIN `tabSales Invoice` rsi ON cd.parent = rsi.name
			WHERE cd.sales_invoice = si.name
			AND cd.item = sii.item_code
			AND rsi.customer = si.customer
			AND rsi.docstatus = 1
			AND rsi.status != 'Cancelled'
		), 0)) > 0
		"""
	)

	# Build dynamic conditions for POS Invoice
	pos_conditions = [
		"pi.docstatus = 1",
		"pi.is_return = 0",
		"pi.pos_opening_entry IS NOT NULL AND pi.pos_opening_entry != ''",
	]

	if customer:
		if is_pos_cust:
			pos_conditions.append("(pi.custom_pos_customer = %(customer)s OR pi.custom_pos_customer = %(customer_name)s)")
		else:
			pos_conditions.append("pi.customer = %(customer)s")

	if shipping_address:
		pos_conditions.append("pi.shipping_address_name = %(shipping_address)s")

	if item_code:
		pos_conditions.append("pii.item_code = %(item_code)s")

	if start_date:
		pos_conditions.append("pi.posting_date >= %(start_date)s")

	pos_conditions.append(
		"""
		(pii.qty + COALESCE((
			SELECT SUM(cd.qtr)
			FROM `tabCredit Details` cd
			JOIN `tabPOS Invoice` rsi ON cd.parent = rsi.name
			WHERE cd.sales_invoice = pi.name
			AND cd.item = pii.item_code
			AND rsi.customer = pi.customer
			AND rsi.docstatus = 1
			AND rsi.status != 'Cancelled'
		), 0)) > 0
		"""
	)

	where_clause = " AND ".join(conditions)
	pos_where_clause = " AND ".join(pos_conditions)

	query = f"""
		SELECT DISTINCT si.name, si.posting_date, sii.qty
		FROM `tabSales Invoice` si
		JOIN `tabSales Invoice Item` sii ON si.name = sii.parent
		WHERE {where_clause}
		AND si.name LIKE %(txt)s
		UNION
		SELECT DISTINCT pi.name, pi.posting_date, pii.qty
		FROM `tabPOS Invoice` pi
		JOIN `tabPOS Invoice Item` pii ON pi.name = pii.parent
		WHERE {pos_where_clause}
		AND pi.name LIKE %(txt)s
		LIMIT %(start)s, %(page_len)s
	"""

	return frappe.db.sql(query, query_params)


@frappe.whitelist()
def get_customer_invoices_for_return(customer, start_date=None, end_date=None, shipping_address=None):
	"""Get all invoices for a customer within date range that can be returned"""
	try:
		# Check if customer is a POS Customer
		is_pos_cust = frappe.db.exists("POS Customer", {"customer_name": customer}) or frappe.db.exists("POS Customer", customer)
		customer_display_name = customer
		if is_pos_cust:
			customer_display_name = frappe.db.get_value("POS Customer", customer, "customer_name") or customer

		# Base filters for Sales Invoice
		filters = {
			"docstatus": 1,
			"is_return": 0,
			"status": ["!=", "Cancelled"],
			"custom_pos_opening_entry": ["!=", ""],
		}
		if is_pos_cust:
			unified_customer = frappe.db.get_value("POS Customer", customer, "unified_customer") or frappe.db.get_value("POS Customer", {"customer_name": customer}, "unified_customer")
			if unified_customer:
				filters["customer"] = ["in", [customer, customer_display_name, unified_customer]]
			else:
				filters["customer"] = ["in", [customer, customer_display_name]]
		else:
			filters["customer"] = customer

		if start_date:
			filters["posting_date"] = [">=", start_date]
		if end_date:
			if "posting_date" in filters:
				filters["posting_date"] = ["between", [start_date, end_date]]
			else:
				filters["posting_date"] = ["<=", end_date]

		if shipping_address:
			filters["customer_address"] = shipping_address

		invoices = frappe.get_all(
			"Sales Invoice",
			filters=filters,
			fields=[
				"name",
				"posting_date",
				"posting_time",
				"customer",
				"grand_total",
				"paid_amount",
				"status",
			],
			order_by="posting_date desc",
		)
		for inv in invoices:
			inv["doctype"] = "Sales Invoice"

		# Base filters for POS Invoice
		pos_filters = {
			"docstatus": 1,
			"is_return": 0,
			"status": ["!=", "Cancelled"],
			"custom_pos_opening_entry": ["!=", ""],
		}
		if is_pos_cust:
			pos_filters["custom_pos_customer"] = ["in", [customer, customer_display_name]]
		else:
			pos_filters["customer"] = customer

		if start_date:
			pos_filters["posting_date"] = [">=", start_date]
		if end_date:
			if "posting_date" in pos_filters:
				pos_filters["posting_date"] = ["between", [start_date, end_date]]
			else:
				pos_filters["posting_date"] = ["<=", end_date]

		if shipping_address:
			pos_filters["customer_address"] = shipping_address

		pos_invoices = frappe.get_all(
			"POS Invoice",
			filters=pos_filters,
			fields=[
				"name",
				"posting_date",
				"posting_time",
				"customer",
				"grand_total",
				"paid_amount",
				"status",
				"custom_pos_customer",
			],
			order_by="posting_date desc",
		)
		for pinv in pos_invoices:
			pinv["doctype"] = "POS Invoice"

		# Merge and sort
		all_invoices = invoices + pos_invoices
		all_invoices.sort(key=lambda x: x.get("posting_date") or "", reverse=True)

		# Override customer name for POS Customers
		for inv in all_invoices:
			if inv.get("custom_pos_customer"):
				pos_cust_name = frappe.db.get_value("POS Customer", inv["custom_pos_customer"], "customer_name")
				if pos_cust_name:
					inv["customer"] = pos_cust_name

		invoice_names = [inv.name for inv in all_invoices]
		all_items = []
		if invoice_names:
			# Fetch items from Sales Invoice Item
			si_items = frappe.get_all(
				"Sales Invoice Item",
				filters={"parent": ["in", invoice_names]},
				fields=["parent", "item_code", "item_name", "qty", "rate", "amount"],
				order_by="parent, idx",
			)
			# Fetch items from POS Invoice Item
			pos_items = frappe.get_all(
				"POS Invoice Item",
				filters={"parent": ["in", invoice_names]},
				fields=["parent", "item_code", "item_name", "qty", "rate", "amount"],
				order_by="parent, idx",
			)
			all_items = si_items + pos_items

		# Batch fetch all returned quantities for all items at once
		returned_qty_map = {}
		if all_items:
			item_codes = list(set([item.item_code for item in all_items]))
			_invoice_item_pairs = [(item.parent, item.item_code) for item in all_items]

			if item_codes:
				# Create a more efficient query to get all returned quantities
				returns_query = """
					SELECT
						rsi.return_against as original_invoice,
						sii.item_code,
						COALESCE(SUM(ABS(sii.qty)), 0) as total_returned_qty
					FROM `tabSales Invoice` rsi
					JOIN `tabSales Invoice Item` sii ON rsi.name = sii.parent
					WHERE rsi.is_return = 1
					  AND rsi.return_against IN ({})
					  AND sii.item_code IN ({})
					  AND rsi.docstatus = 1
					  AND rsi.customer = %s
					GROUP BY rsi.return_against, sii.item_code
				""".format(
					",".join([f"'{name}'" for name in invoice_names]),
					",".join([f"'{code}'" for code in item_codes]),
				)

				returns_data = frappe.db.sql(returns_query, (customer,), as_dict=True)
				returned_qty_map = {
					(row.original_invoice, row.item_code): row.total_returned_qty for row in returns_data
				}

		# Group items by invoice and calculate returned quantities
		invoice_items_map = {}
		for item in all_items:
			if item.parent not in invoice_items_map:
				invoice_items_map[item.parent] = []

			returned_qty_value = returned_qty_map.get((item.parent, item.item_code), 0)
			item.returned_qty = returned_qty_value
			item.available_qty = round(
				item.qty - returned_qty_value, 6
			)  # Round to 6 decimal places to avoid precision issues

			invoice_items_map[item.parent].append(item)

		# Assign items to invoices
		for invoice in invoices:
			invoice.items = invoice_items_map.get(invoice.name, [])

			# Get all payment methods from payment child table
			invoice_doc = frappe.get_doc("Sales Invoice", invoice.name)
			payment_methods = []
			if invoice_doc.payments:
				for payment in invoice_doc.payments:
					payment_methods.append(
						{"mode_of_payment": payment.mode_of_payment, "amount": payment.amount}
					)
			elif invoice_doc.status == "Draft":
				payment_methods = []
			else:
				# Check Payment Entry if invoice payments table is empty but invoice is paid
				if invoice_doc.status in ["Paid", "Partly Paid"] and not invoice_doc.payments:
					payment_entries = frappe.get_all(
						"Payment Entry Reference",
						filters={"reference_name": invoice_doc.name, "reference_doctype": "Sales Invoice"},
						fields=["parent", "allocated_amount"],
						parent_doctype="Payment Entry",
					)

					for pe_ref in payment_entries:
						payment_entry = frappe.get_doc("Payment Entry", pe_ref.parent)
						if payment_entry.docstatus == 1:
							payment_methods.append(
								{
									"mode_of_payment": payment_entry.mode_of_payment,
									"amount": pe_ref.allocated_amount,
								}
							)

			invoice.payment_methods = payment_methods
			# Keep backward compatibility - show first payment method or combined display
			if len(payment_methods) == 0:
				invoice.payment_method = "-"
			elif len(payment_methods) == 1:
				invoice.payment_method = payment_methods[0]["mode_of_payment"]
			else:
				# Show combined payment methods like "Cash/Credit Card"
				invoice.payment_method = "/".join([pm["mode_of_payment"] for pm in payment_methods])

		return {"success": True, "data": invoices}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error fetching customer invoices for return")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def create_partial_return(
	invoice_name, return_items, payment_method=None, return_amount=None, expected_return_amount=None,
	return_currency=None, return_original_amount=None, payments=None
):
	"""Create a partial return for selected items from an invoice with custom payment method"""

	try:
		if isinstance(return_items, str):
			return_items = json.loads(return_items)

		doctype = "POS Invoice" if frappe.db.exists("POS Invoice", invoice_name) else "Sales Invoice"
		original_invoice = frappe.get_doc(doctype, invoice_name)

		if original_invoice.docstatus != 1:
			frappe.throw("Only submitted invoices can be returned.")

		if original_invoice.is_return:
			frappe.throw("This invoice is already a return.")

		item_doctype = "POS Invoice Item" if doctype == "POS Invoice" else "Sales Invoice Item"
		# Create return invoice using the same approach as return_sales_invoice
		return_doc = get_mapped_doc(
			doctype,
			invoice_name,
			{
				doctype: {
					"doctype": doctype,
					"field_map": {"name": "return_against"},
					"validation": {"docstatus": ["=", 1]},
				},
				item_doctype: {
					"doctype": item_doctype,
					"field_map": {"name": "prevdoc_detail_docname"},
				},
				"Sales Taxes and Charges": {
					"doctype": "Sales Taxes and Charges",
				},
			},
		)

		return_doc.is_return = 1
		return_doc.posting_date = frappe.utils.nowdate()
		return_doc.custom_delivery_date = frappe.utils.nowdate()

		# Set the current POS opening entry
		current_opening_entry = get_current_pos_opening_entry()
		if current_opening_entry:
			return_doc.custom_pos_opening_entry = current_opening_entry

		# Ensure no original round-off leaks into partial return
		return_doc.custom_roundoff_amount = 0
		return_doc.custom_base_roundoff_amount = 0
		return_doc.custom_roundoff_account = get_writeoff_account()

		# Get available returnable quantities for validation
		available_quantities = {item["item_code"]: item["available_qty"] for item in _get_invoice_items_with_returns(invoice_name, original_invoice.customer, doctype)}

		# Filter items to only include selected ones with return quantities
		filtered_items = []
		for return_item in return_items:
			item_code = return_item.get("item_code")
			r_qty = flt(return_item.get("return_qty", 0))
			if r_qty > 0:
				available_qty = flt(available_quantities.get(item_code, 0))
				if r_qty > available_qty + 0.0001:
					frappe.throw(
						f"Cannot return {r_qty} units of item {item_code}. "
						f"Only {available_qty} units are available for return on this invoice."
					)
				for item in return_doc.items:
					if item.item_code == item_code:
						item.qty = -abs(r_qty)
						item.sales_invoice_item = item.prevdoc_detail_docname
						item.pos_invoice_item = item.prevdoc_detail_docname
						filtered_items.append(item)
						break

		return_doc.items = filtered_items

		# No custom roundoff mirroring for now

		# Clear existing payments
		return_doc.payments = []

		# Calculate taxes and totals to get baseline returned amount including taxes
		try:
			return_doc.calculate_taxes_and_totals()
		except Exception:
			pass

		# Calculate total returned amount (baseline expected refund, including taxes)
		# Prefer client-provided expected amount; fallback to backend computation
		if expected_return_amount is not None:
			try:
				total_returned_amount = flt(expected_return_amount, return_doc.precision("grand_total") or 2)
			except Exception:
				total_returned_amount = abs(return_doc.grand_total)
		else:
			total_returned_amount = abs(return_doc.grand_total)

		# If payments are provided, final_return_amount is the sum of payments
		if payments:
			if isinstance(payments, str):
				payments = json.loads(payments)
			final_return_amount = sum(abs(flt(p.get("amount", 0))) for p in payments)
		else:
			final_return_amount = return_amount if return_amount is not None else total_returned_amount

		final_payment_method = payment_method if payment_method else "Cash"

		# Optionally persist the auto-calculated expected refund if a custom field exists
		try:
			_si_meta = frappe.get_meta(doctype)
			if any(df.fieldname == "custom_expected_refund_amount" for df in _si_meta.fields):
				return_doc.custom_expected_refund_amount = flt(
					total_returned_amount, return_doc.precision("grand_total") or 2
				)
		except Exception:
			pass

		# If cashier entered a custom refund (partial return), push the difference to round-off on the return
		try:
			# Only apply when there's a meaningful difference
			prec = return_doc.precision("grand_total") or 2
			_diff = flt(total_returned_amount, prec) - flt(final_return_amount, prec)
			if abs(_diff) > (10 ** (-prec)) / 2:
				# For returns, custom_calculate_totals ADDS custom_roundoff_amount to grand_total.
				# This is a NEW write-off specific to this partial return. Do not accumulate.
				return_doc.custom_roundoff_amount = 0
				return_doc.custom_base_roundoff_amount = 0
				return_doc.custom_roundoff_amount = abs(flt(_diff, prec))
				return_doc.custom_roundoff_account = get_writeoff_account()
				return_doc.custom_base_roundoff_amount = flt(
					return_doc.custom_roundoff_amount * (return_doc.conversion_rate or 1), prec
				)
		except Exception:
			pass
		# Handle write-off for full returns
		original_grand_total = abs(original_invoice.grand_total)
		requested_return = abs(final_return_amount)
		is_full_return = abs(requested_return - original_grand_total) < 0.01

		if (
			is_full_return
			and hasattr(original_invoice, "custom_roundoff_amount")
			and original_invoice.custom_roundoff_amount
		):
			# For full returns, mirror the original write-off to make grand total = paid amount
			return_doc.custom_roundoff_amount = abs(original_invoice.custom_roundoff_amount)
			return_doc.custom_base_roundoff_amount = abs(original_invoice.custom_base_roundoff_amount)
			return_doc.custom_roundoff_account = getattr(
				original_invoice, "custom_roundoff_account", get_writeoff_account()
			)

			# Adjust payment amount to match the paid amount (after write-off)
			original_paid_amount = original_invoice.paid_amount or original_invoice.grand_total
			final_return_amount = abs(original_paid_amount)

		# Append payments to return_doc
		if payments:
			for p in payments:
				pay_row = {
					"mode_of_payment": p.get("mode_of_payment"),
					"amount": -abs(flt(p.get("amount", 0))),
				}
				if p.get("currency"):
					pay_row["custom_payment_currency"] = p.get("currency")
				if p.get("original_amount"):
					pay_row["custom_payment_original_amount"] = -abs(flt(p.get("original_amount", 0)))
				return_doc.append("payments", pay_row)
		elif final_return_amount > 0:
			payment_row = {
				"mode_of_payment": final_payment_method,
				"amount": -abs(final_return_amount),
			}
			if return_currency:
				payment_row["custom_payment_currency"] = return_currency
			if return_original_amount:
				payment_row["custom_payment_original_amount"] = -abs(flt(return_original_amount))
			return_doc.append("payments", payment_row)
		
		# Recalculate totals (payment amount stays as user entered)
		try:
			return_doc.calculate_taxes_and_totals()
		except Exception:
			pass

		# Explicitly set payment and change fields to prevent validation errors in POS Invoice
		final_invoice_total = return_doc.rounded_total or return_doc.grand_total
		if final_invoice_total:
			return_doc.paid_amount = final_invoice_total
			return_doc.base_paid_amount = final_invoice_total * (return_doc.conversion_rate or 1)
			if return_doc.payments:
				total_pay_entered = sum(flt(p.amount) for p in return_doc.payments)
				if total_pay_entered:
					factor = flt(final_invoice_total) / flt(total_pay_entered)
					for p in return_doc.payments:
						p.amount = flt(p.amount * factor, return_doc.precision("grand_total") or 2)
						if hasattr(p, "base_amount"):
							p.base_amount = flt(p.amount * (return_doc.conversion_rate or 1), return_doc.precision("grand_total") or 2)
						if getattr(p, "custom_payment_original_amount", None):
							p.custom_payment_original_amount = flt(p.custom_payment_original_amount * factor, 0)
		else:
			return_doc.paid_amount = -abs(final_return_amount) if final_return_amount else 0.0
			return_doc.base_paid_amount = (return_doc.paid_amount) * (return_doc.conversion_rate or 1)

		return_doc.change_amount = 0.0
		return_doc.base_change_amount = 0.0

		return_doc.save(ignore_permissions=True)
		return_doc.submit()

		return {
			"success": True,
			"return_invoice": return_doc.name,
			"message": f"Return created successfully: {return_doc.name} (Payment: {final_payment_method})",
		}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Partial Return Error")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def create_multi_invoice_return(return_data):
	"""Create multiple return invoices for items from different invoices"""
	try:
		if isinstance(return_data, str):
			return_data = json.loads(return_data)

		invoice_returns = return_data.get("invoice_returns", [])

		created_returns = []

		for _i, invoice_return in enumerate(invoice_returns):
			invoice_name = invoice_return.get("invoice_name")
			return_items = invoice_return.get("return_items", [])
			payment_method = invoice_return.get("payment_method")
			return_amount = invoice_return.get("return_amount")

			if return_items:
				# Call create_partial_return with payment method and return amount
				result = create_partial_return(
					invoice_name, return_items, payment_method=payment_method, return_amount=return_amount
				)
				if result.get("success"):
					created_returns.append(result.get("return_invoice"))
				else:
					frappe.log_error(f"Failed to create return for {invoice_name}: {result.get('message')}")

		return {
			"success": True,
			"created_returns": created_returns,
			"message": f"Created {len(created_returns)} return invoices successfully",
		}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Multi Invoice Return Error")
		return {"success": False, "message": str(e)}


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


@frappe.whitelist()
def delete_draft_invoice(invoice_id):
	"""
	Delete a draft sales invoice.
	Only allows deletion of Draft status invoices.
	"""
	try:
		# Get the invoice document
		doctype = "POS Invoice" if frappe.db.exists("POS Invoice", invoice_id) else "Sales Invoice"
		invoice_doc = frappe.get_doc(doctype, invoice_id)

		if invoice_doc.status != "Draft":
			return {
				"success": False,
				"error": f"Cannot delete invoice {invoice_id}. Only Draft invoices can be deleted. Current status: {invoice_doc.status}",
			}

		invoice_doc.delete()

		return {
			"success": True,
			"message": f"Draft invoice {invoice_id} deleted successfully",
		}

	except frappe.DoesNotExistError:
		return {"success": False, "error": f"Invoice {invoice_id} not found"}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), f"Error deleting draft invoice {invoice_id}")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def submit_draft_invoice(invoice_id):
	"""
	Submit a draft sales invoice directly without payment dialog.
	This converts a draft invoice to submitted status.
	"""
	try:
		invoice_doc = frappe.get_doc("Sales Invoice", invoice_id)

		if invoice_doc.status != "Draft":
			return {
				"success": False,
				"error": f"Cannot submit invoice {invoice_id}. Only Draft invoices can be submitted. Current status: {invoice_doc.status}",
			}

		invoice_doc.submit()

		return {
			"success": True,
			"message": f"Draft invoice {invoice_id} submitted successfully",
			"invoice_name": invoice_doc.name,
			"invoice": invoice_doc,
		}

	except frappe.DoesNotExistError:
		return {"success": False, "error": f"Invoice {invoice_id} not found"}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), f"Error submitting draft invoice {invoice_id}")
		return {"success": False, "error": str(e)}


@frappe.whitelist(allow_guest=True)
def get_today_exchange_rates(currencies, base_currency):
	"""Return today's exchange rates for the given secondary currencies.

	Looks up the Currency Exchange table for records dated today.
	Falls back to the most recent record for each currency if today
	has no entry.  The frontend uses this to pre-fill the rate input
	so the cashier does not have to re-enter it every transaction.
	"""
	if isinstance(currencies, str):
		currencies = json.loads(currencies)

	from frappe.utils import nowdate
	today = nowdate()
	result = {}

	for currency in currencies:
		if currency == base_currency:
			continue
		# Prefer today's record; fall back to most recent
		rate = frappe.db.get_value(
			"Currency Exchange",
			{"from_currency": currency, "to_currency": base_currency, "date": today},
			"exchange_rate",
		)
		if not rate:
			rate = frappe.db.get_value(
				"Currency Exchange",
				{"from_currency": currency, "to_currency": base_currency},
				"exchange_rate",
				order_by="date desc",
			)
		if not rate:
			rate = frappe.db.get_value(
				"Currency Exchange",
				{"from_currency": base_currency, "to_currency": currency, "date": today},
				"exchange_rate",
			)
		if not rate:
			rate = frappe.db.get_value(
				"Currency Exchange",
				{"from_currency": base_currency, "to_currency": currency},
				"exchange_rate",
				order_by="date desc",
			)
		if rate:
			result[currency] = flt(rate)

	return result


class CustomPOSInvoice(POSInvoice):
	"""
	Sultan customised POS Invoice.

	Adds a ``use_company_roundoff_cost_center`` property so that the
	standard ERPNext GL-entries generator can access it even when the
	field is not present in the DB schema (avoids AttributeError on
	POS Invoice GL generation in erpnext 15).

	Also overrides ``make_discount_gl_entries`` to ensure
	``enable_discount_accounting`` is always defined (avoids
	UnboundLocalError in erpnext 15 accounts_controller.py).
	"""

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



@frappe.whitelist()
def settle_delivery_invoices(invoice_names=None, current_session_id=None, payload=None):
	"""
	Settle COD delivery invoices and create a submitted Driver Settlement DocType.
	Accepts either legacy format (invoice_names list) or new rich payload dict.
	"""
	try:
		# Support both old (invoice_names) and new (payload) call formats
		if payload:
			if isinstance(payload, str):
				payload = json.loads(payload)
			invoice_rows = payload.get("invoices", [])
			if isinstance(invoice_rows, str):
				invoice_rows = json.loads(invoice_rows)
			invoice_names_list = [r["id"] for r in invoice_rows]
			current_session_id = payload.get("session_id", current_session_id)
		else:
			if isinstance(invoice_names, str):
				invoice_names = json.loads(invoice_names)
			invoice_names_list = invoice_names or []
			payload = {}
			invoice_rows = [{"id": n} for n in invoice_names_list]

		settled = []
		errors = []

		for name in invoice_names_list:
			try:
				if frappe.db.exists("POS Invoice", name):
					doc = frappe.get_doc("POS Invoice", name)
					if doc.docstatus == 0:
						doc.custom_delivery_status = "Delivered"
						doc.custom_driver_settled = 1
						doc.custom_pos_opening_entry = current_session_id
						invoice_total = flt(doc.rounded_total) or flt(doc.grand_total)
						write_off = flt(doc.write_off_amount)
						paid_amt = invoice_total - write_off
						if doc.payments:
							for p in doc.payments:
								p.amount = 0
							doc.payments[-1].amount = paid_amt
						else:
							default_mop = "Cash"
							try:
								pos_profile_doc = frappe.get_cached_doc("POS Profile", doc.pos_profile)
								if pos_profile_doc.get("payments"):
									for pm in pos_profile_doc.payments:
										if pm.default:
											default_mop = pm.mode_of_payment
											break
									if not default_mop:
										default_mop = pos_profile_doc.payments[0].mode_of_payment
							except Exception:
								pass
							doc.append("payments", {"mode_of_payment": default_mop, "amount": paid_amt, "default": 1})
						doc.paid_amount = paid_amt
						doc.base_paid_amount = paid_amt * (doc.conversion_rate or 1)
						doc.outstanding_amount = 0
						doc.custom_delivery_cod = 1
						doc.save(ignore_permissions=True)
						doc.submit()
					else:
						frappe.db.set_value("POS Invoice", name, {
							"custom_delivery_status": "Delivered",
							"custom_driver_settled": 1,
							"custom_pos_opening_entry": current_session_id
						}, update_modified=False)
					settled.append(name)
				elif frappe.db.exists("Sales Invoice", name):
					frappe.db.set_value("Sales Invoice", name, {
						"custom_delivery_status": "Delivered",
						"custom_driver_settled": 1,
						"custom_pos_opening_entry": current_session_id
					})
					settled.append(name)
			except Exception as inv_err:
				frappe.log_error(frappe.get_traceback(), f"Error settling invoice {name}")
				errors.append({"name": name, "error": str(inv_err)})

		# ── Create & submit Driver Settlement DocType ──────────────────
		settlement_name = None
		try:
			if frappe.db.table_exists("Driver Settlement"):
				from frappe.utils import now_datetime
				from frappe.utils import get_datetime, now_datetime
				if payload.get("settled_at"):
					dt = get_datetime(payload.get("settled_at"))
					settled_at_val = dt.replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")
				else:
					settled_at_val = str(now_datetime())
				from frappe.utils import getdate
				settlement_invoices = []
				for r in invoice_rows:
					posting_date_raw = r.get("posting_date", "")
					posting_date_cleaned = None
					if posting_date_raw:
						try:
							posting_date_cleaned = getdate(posting_date_raw).strftime("%Y-%m-%d")
						except Exception:
							posting_date_cleaned = str(posting_date_raw)
					is_cod_val = int(r.get("is_cod", 0))
					total_amt_val = flt(r.get("total_amount", 0))
					settlement_invoices.append({
						"invoice_id": r.get("id", ""),
						"customer": r.get("customer", ""),
						"posting_date": posting_date_cleaned,
						"total_amount": total_amt_val,
						"delivery_fee": flt(r.get("delivery_fee", 0)),
						"is_cod": is_cod_val,
						"cod_amount": flt(r.get("cod_amount", 0)) if is_cod_val else 0.0,
						"prepaid_amount": total_amt_val if not is_cod_val else 0.0,
					})

				# Resolve or create standard Delivery Personnel document
				driver_name_val = payload.get("driver_name") or payload.get("driver_id") or ""
				driver_id_val = frappe.db.get_value("Delivery Personnel", {"delivery_personnel": driver_name_val}, "name")
				if not driver_id_val and driver_name_val:
					try:
						driver_doc = frappe.get_doc({
							"doctype": "Delivery Personnel",
							"delivery_personnel": driver_name_val
						})
						driver_doc.insert(ignore_permissions=True)
						driver_id_val = driver_doc.name
					except Exception as driver_err:
						frappe.log_error(frappe.get_traceback(), "Failed to auto-create Delivery Personnel document")

				settlement_doc = frappe.get_doc({
					"doctype": "Driver Settlement",
					"driver_id": driver_id_val or payload.get("driver_id", ""),
					"driver_name": driver_name_val,
					"session_id": current_session_id,
					"settled_at": settled_at_val,
					"total_amount": flt(payload.get("total_amount", 0)),
					"delivery_amount": flt(payload.get("delivery_amount", 0)),
					"net_amount": flt(payload.get("net_amount", 0)),
					"invoice_count": len(invoice_rows),
					"invoices": settlement_invoices,
				})
				if payload.get("name") or payload.get("pre_assigned_name"):
					settlement_doc.name = payload.get("name") or payload.get("pre_assigned_name")
				settlement_doc.insert(ignore_permissions=True)
				settlement_doc.submit()
				settlement_name = settlement_doc.name
				frappe.logger().info(f"Driver Settlement created and submitted: {settlement_name}")
		except Exception as ds_err:
			frappe.log_error(frappe.get_traceback(), "Driver Settlement DocType creation failed")
			# Non-fatal — invoices are already settled

		frappe.db.commit()
		return {
			"success": True,
			"settled": settled,
			"errors": errors,
			"settlement_name": settlement_name,
		}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error settling delivery invoices")
		return {"success": False, "error": str(e)}

@frappe.whitelist()
def assign_driver_to_invoice(invoice_name, driver_name=None, status=None):
	try:
		fields_to_update = {}
		if driver_name is not None:
			fields_to_update["custom_delivery_personnel"] = driver_name
		if status is not None:
			fields_to_update["custom_delivery_status"] = status
			
		if not fields_to_update:
			return {"success": False, "error": "No fields to update"}

		if frappe.db.exists("POS Invoice", invoice_name):
			frappe.db.set_value("POS Invoice", invoice_name, fields_to_update)
		elif frappe.db.exists("Sales Invoice", invoice_name):
			frappe.db.set_value("Sales Invoice", invoice_name, fields_to_update)
		else:
			return {"success": False, "error": "Invoice not found"}
			
		frappe.db.commit()
		return {"success": True}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error assigning driver to invoice")
		return {"success": False, "error": str(e)}
