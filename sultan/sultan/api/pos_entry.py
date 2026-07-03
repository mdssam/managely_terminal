import json
import traceback

import frappe
from frappe import _
from frappe.utils import now_datetime, today

# Import for clearing cache and clearing draft invoices on close
from sultan.sultan.api.cache import clear_backend_cache
from sultan.sultan.api.sales_invoice import delete_draft_invoices_for_opening_entry
from sultan.sultan.utils import clear_pos_profile_cache, get_current_pos_profile


@frappe.whitelist(allow_guest=True)
def get_csrf_token():
	"""Fetch (or generate) the CSRF token for the current session.

	allow_guest=True so the SPA can get a valid token before any login.
	"""
	try:
		token = frappe.local.session.data.get("csrf_token")
		if not token:
			token = frappe.generate_hash(length=32)
			frappe.local.session.data.csrf_token = token
			frappe.local.session.save()
	except Exception:
		token = ""
	return token


@frappe.whitelist()
def open_pos():
	"""Check if the current user has an accessible POS Opening Entry.

	Cashier: checks the user's own open entry.
	Menu User: auto-attaches to any active session on their assigned profile.
	"""
	user = frappe.session.user

	# Own session (Cashier / Admin path)
	own_entry = frappe.db.exists(
		"POS Opening Entry",
		{
			"user": user,
			"docstatus": 1,
			"pos_closing_entry": None,
			"status": "Open",
		},
	)
	if own_entry:
		return True

	# Menu User: attach to the profile's active session
	from sultan.sultan.utils import get_user_pos_profile_name
	pos_profile_name = get_user_pos_profile_name(user)
	if pos_profile_name:
		user_role = frappe.db.get_value("User", user, "role_profile_name") or "Cashier"
		if user_role == "Menu User":
			profile_entry = frappe.db.exists(
				"POS Opening Entry",
				{"pos_profile": pos_profile_name, "docstatus": 1, "status": "Open"},
			)
			return bool(profile_entry)

	return False


@frappe.whitelist()
def check_profile_session(pos_profile: str) -> dict:
	"""Pre-shift validation: return any active session for this POS profile.

	Called by the Cashier before opening a new shift so they can be warned
	about a previous-day session that was never closed.
	"""
	if not pos_profile:
		return {"has_active_session": False}

	open_entries = frappe.get_all(
		"POS Opening Entry",
		filters={"pos_profile": pos_profile, "docstatus": 1, "status": "Open"},
		fields=["name", "user", "period_start_date", "custom_employee", "custom_employee_name"],
		limit=1,
	)

	if not open_entries:
		return {"has_active_session": False}

	entry = open_entries[0]
	session_date = entry.period_start_date.date() if entry.period_start_date else None
	is_previous_day = str(session_date) < str(frappe.utils.today()) if session_date else False

	user_full_name = frappe.db.get_value("User", entry.user, "full_name") or entry.user

	# Resolve employee name: opening entry → Employee doctype via user_id
	employee_name = entry.custom_employee_name
	if not employee_name and entry.custom_employee:
		employee_name = frappe.db.get_value("Employee", entry.custom_employee, "employee_name")
	if not employee_name:
		employee_name = frappe.db.get_value(
			"Employee",
			{"user_id": entry.user, "status": "Active"},
			"employee_name",
		)

	return {
		"has_active_session": True,
		"session_name": entry.name,
		"session_user": entry.user,
		"session_user_full_name": user_full_name,
		"employee_name": employee_name,
		"session_date": str(session_date) if session_date else None,
		"is_previous_day": is_previous_day,
	}


@frappe.whitelist()
def create_opening_entry():
	"""
	Create a POS Opening Entry with balance details only.
	"""
	try:
		data = frappe.local.form_dict
		if isinstance(data, str):
			data = json.loads(data)

		user = frappe.session.user

		selected_pos_profile = data.get("pos_profile")
		if selected_pos_profile:
			pos_profile = selected_pos_profile
		else:
			pos_profile = get_current_pos_profile().name if get_current_pos_profile() else None

		company = frappe.defaults.get_user_default("Company")

		if not company:
			frappe.throw(_("No default company found for user {0}").format(user))
		if not pos_profile:
			frappe.throw(_("POS Profile could not be determined"))

		balance_details = data.get("balance_details") or data.get("opening_balance", [])
		if not balance_details:
			frappe.throw(_("At least one balance detail (mode of payment) is required"))

		employee = data.get("employee")
		employee_name = data.get("employee_name")

		# Check if an open entry exists
		existing = frappe.db.exists(
			"POS Opening Entry",
			{
				"pos_profile": pos_profile,
				"user": user,
				"docstatus": 1,
				"pos_closing_entry": None,
			},
		)
		if existing:
			frappe.throw(
				_(
					"You already have an open POS Opening Entry for profile '{0}'. Please close the existing entry before creating a new one."
				).format(pos_profile)
			)

		# Create the POS Opening Entry
		doc = frappe.new_doc("POS Opening Entry")
		if data.get("pre_assigned_name"):
			doc.name = data.get("pre_assigned_name")
			doc.flags.ignore_naming_series = True

		doc.user = user
		doc.company = company
		doc.pos_profile = pos_profile

		if data.get("posting_date"):
			doc.posting_date = data.get("posting_date")
		else:
			doc.posting_date = today()

		doc.set_posting_time = 1

		if data.get("period_start_date"):
			doc.period_start_date = data.get("period_start_date")
		else:
			doc.period_start_date = now_datetime()

		if employee:
			doc.custom_employee = employee
		if employee_name:
			doc.custom_employee_name = employee_name

		for row in balance_details:
			doc.append(
				"balance_details",
				{
					"mode_of_payment": row.get("mode_of_payment"),
					"opening_amount": row.get("opening_amount"),
				},
			)

		doc.insert()
		doc.submit()

		# Clear POS profile cache after creating opening entry to ensure fresh data
		try:
			clear_pos_profile_cache(user=user)
			frappe.logger().info(
				f"🧹 POS Profile cache cleared after creating opening entry for user: {user}"
			)
		except Exception:
			# Do not block opening if cache clear fails; log and continue
			frappe.logger().warning(
				f"Failed to clear POS profile cache after opening entry: {frappe.get_traceback()}"
			)

		return {
			"name": doc.name,
			"message": _("POS Opening Entry created successfully."),
		}

	except Exception as e:
		# Log error with full traceback in Error Log
		frappe.log_error(message=traceback.format_exc(), title="POS Opening Entry Creation Failed")
		# Throw user-friendly message
		frappe.throw(_("Failed to create POS Opening Entry: {0}").format(str(e)))


def validate_opening_entry(doc, method):
	exists = frappe.db.exists(
		"POS Opening Entry",
		{
			"user": doc.user,
			"status": "Open",
		},
	)
	if exists:
		cashier_name = frappe.db.get_value("User", doc.user, "full_name") or doc.user
		frappe.throw(_("Cashier {0} already has an open entry: {1}").format(cashier_name, exists))


def _consolidate_draft_invoices_for_closing(opening_entry_name):
	"""Merge all draft Sales Invoices for this session into one SINV per customer.

	For each customer that placed orders during the session, all their draft
	invoices are combined into a single submitted Sales Invoice.  The draft
	originals are deleted afterwards.  Raises frappe.ValidationError if any
	customer's consolidated invoice cannot be submitted (e.g. insufficient stock).
	"""
	from collections import defaultdict
	from frappe.utils import flt, nowdate, nowtime

	drafts = frappe.get_all(
		"Sales Invoice",
		filters={"custom_pos_opening_entry": opening_entry_name, "docstatus": 0},
		fields=[
			"name", "customer", "pos_profile", "company", "currency",
			"conversion_rate", "set_warehouse", "is_pos", "taxes_and_charges",
		],
		order_by="creation asc",
	)
	if not drafts:
		frappe.logger().info(
			f"[Consolidation] No draft invoices for opening entry {opening_entry_name}."
		)
		return

	by_customer = defaultdict(list)
	for d in drafts:
		by_customer[d.customer].append(d.name)

	failures = []
	for customer, draft_names in by_customer.items():
		try:
			consolidated = _build_consolidated_invoice(
				customer, draft_names, opening_entry_name
			)
			consolidated.insert(ignore_permissions=True)
			consolidated.save(ignore_permissions=True)
			# After save totals are computed — align paid_amount to grand_total
			consolidated.paid_amount = flt(consolidated.grand_total)
			consolidated.base_paid_amount = flt(consolidated.base_grand_total)
			consolidated.outstanding_amount = 0
			consolidated.save(ignore_permissions=True)
			consolidated.submit()
			frappe.db.commit()

			# Delete the now-redundant draft originals
			for name in draft_names:
				try:
					frappe.delete_doc("Sales Invoice", name, ignore_permissions=True, force=True)
				except Exception:
					pass
			frappe.db.commit()

			frappe.logger().info(
				f"[Consolidation] {len(draft_names)} order(s) for {customer} → {consolidated.name}"
			)
		except Exception as e:
			frappe.db.rollback()
			failures.append(f"  • {customer}: {e!s}")
			frappe.log_error(
				frappe.get_traceback(),
				f"[Consolidation] Failed for customer {customer}",
			)

	if failures:
		frappe.throw(
			_(
				"Could not consolidate orders for {0} customer(s). "
				"Please resolve the issues and try again:\n\n{1}"
			).format(len(failures), "\n".join(failures))
		)


def _build_consolidated_invoice(customer, draft_names, opening_entry_name):
	"""Return an unsaved Sales Invoice doc combining all items and payments from draft_names."""
	from frappe.utils import flt, nowdate, nowtime

	draft_docs = [frappe.get_doc("Sales Invoice", n) for n in draft_names]
	base = draft_docs[0]

	doc = frappe.new_doc("Sales Invoice")
	doc.customer = customer
	doc.pos_profile = base.pos_profile
	doc.company = base.company
	doc.currency = base.currency
	doc.conversion_rate = base.conversion_rate or 1.0
	doc.is_pos = base.is_pos
	doc.update_stock = 1
	doc.set_warehouse = base.set_warehouse
	doc.taxes_and_charges = base.taxes_and_charges
	doc.posting_date = nowdate()
	doc.posting_time = nowtime()
	doc.set_posting_time = 1
	doc.due_date = nowdate()
	doc.custom_pos_opening_entry = opening_entry_name

	# Resolve debit_to (Receivable Account)
	from erpnext.accounts.party import get_party_account
	try:
		doc.debit_to = get_party_account("Customer", customer, base.company)
	except Exception:
		doc.debit_to = frappe.db.get_value("Company", base.company, "default_receivable_account")

	# Carry forward any custom scalar fields from the base draft
	for field in ("custom_exchange_rate_override", "custom_delivery_personnel",
				  "cost_center"):
		val = getattr(base, field, None)
		if val:
			setattr(doc, field, val)

	if not doc.get("cost_center"):
		if doc.pos_profile:
			doc.cost_center = frappe.db.get_value("POS Profile", doc.pos_profile, "cost_center")
		if not doc.get("cost_center"):
			doc.cost_center = frappe.get_cached_value("Company", doc.company, "cost_center")

	# Merge items from all drafts (keep each line separate — preserves rate/discount)
	for draft_doc in draft_docs:
		for item in draft_doc.items:
			doc.append("items", {
				"item_code": item.item_code,
				"qty": item.qty,
				"rate": item.rate,
				"price_list_rate": getattr(item, "price_list_rate", None) or item.rate,
				"discount_percentage": flt(getattr(item, "discount_percentage", 0)),
				"discount_amount": flt(getattr(item, "discount_amount", 0)),
				"income_account": getattr(item, "income_account", None),
				"expense_account": getattr(item, "expense_account", None),
				"warehouse": item.warehouse,
				"cost_center": getattr(item, "cost_center", None),
				"uom": item.uom,
				"conversion_factor": getattr(item, "conversion_factor", None) or 1,
				"batch_no": getattr(item, "batch_no", None) or None,
				"serial_no": getattr(item, "serial_no", None) or None,
			})

	# Copy tax rows from the base draft (one set of taxes for the consolidated total)
	for tax in base.taxes:
		doc.append("taxes", {
			"charge_type": tax.charge_type,
			"account_head": tax.account_head,
			"description": tax.description,
			"cost_center": tax.cost_center,
			"rate": tax.rate,
			"row_id": tax.row_id,
			"included_in_print_rate": tax.included_in_print_rate,
			"custom_is_stamp": tax.get("custom_is_stamp") or 0,
			"custom_stamp_amount_lbp": tax.get("custom_stamp_amount_lbp") or 0,
		})

	# Sum payments by mode_of_payment across all drafts
	payment_sums = {}
	for draft_doc in draft_docs:
		for payment in draft_doc.payments:
			mop = payment.mode_of_payment
			payment_sums[mop] = payment_sums.get(mop, 0.0) + flt(payment.amount)

	for mop, amount in payment_sums.items():
		doc.append("payments", {"mode_of_payment": mop, "amount": amount})

	return doc


@frappe.whitelist()
def create_closing_entry():
	"""
	Create a POS Closing Entry for the current user's open POS Opening Entry.
	"""
	try:
		data = _parse_request_data()
		user = frappe.session.user
		frappe.logger().info(f"POS Closing Entry Data Received: {data}")

		pos_opening_entry_name = data.get("pos_opening_entry")
		if pos_opening_entry_name:
			opening_entry = frappe.get_doc("POS Opening Entry", pos_opening_entry_name)
		else:
			opening_entry = _get_open_pos_entry(user)

		# Prevent closing if there are draft invoices
		draft_pos_invoices = frappe.get_all(
			"POS Invoice",
			filters={"custom_pos_opening_entry": opening_entry.name, "docstatus": 0},
			limit=1
		)
		draft_sales_invoices = frappe.get_all(
			"Sales Invoice",
			filters={"custom_pos_opening_entry": opening_entry.name, "docstatus": 0},
			limit=1
		)
		
		if draft_pos_invoices or draft_sales_invoices:
			frappe.throw(_("Cannot close session because there are unpaid draft invoices. Please pay or delete them first."))

		# When the POS Profile has "Consolidate Invoice on Close" enabled, all
		# draft invoices must be submitted before the reconciliation figures are
		# calculated — otherwise the payment totals would be zero.
		pos_profile_name = opening_entry.get("pos_profile") if isinstance(opening_entry, dict) else getattr(opening_entry, "pos_profile", None)
		if pos_profile_name and frappe.db.get_value("POS Profile", pos_profile_name, "custom_consolidate_invoicing"):
			_consolidate_draft_invoices_for_closing(opening_entry.name if hasattr(opening_entry, "name") else opening_entry["name"])


		payment_data = _calculate_payment_reconciliation(opening_entry, data)

		doc = _create_and_submit_closing_doc(opening_entry, data, payment_data, user)

		# Create Journal Entries for any Cash In/Out transactions in this session
		try:
			from sultan.sultan.api.cash_transaction import create_gl_entries_for_session
			create_gl_entries_for_session(opening_entry.name, opening_entry.company)
		except Exception:
			frappe.log_error(frappe.get_traceback(), "Cash Transaction GL Entry Error on Close")

		return {
			"name": doc.name,
			"message": _("POS Closing Entry created successfully."),
		}

	except Exception as e:
		frappe.log_error(message=traceback.format_exc(), title="POS Closing Entry Creation Failed")
		frappe.throw(_("Failed to create POS Closing Entry: {0}").format(str(e)))


def _parse_request_data():
	"""Parse and normalize the incoming request data."""
	data = frappe.local.form_dict
	if isinstance(data, str):
		data = json.loads(data)

	# Normalize closing_balance format
	closing_balance_raw = data.get("closing_balance", {})
	closing_balance = {}

	if isinstance(closing_balance_raw, list):
		for item in closing_balance_raw:
			if isinstance(item, dict) and "mode_of_payment" in item and "closing_amount" in item:
				closing_balance[item["mode_of_payment"]] = item["closing_amount"]
	elif isinstance(closing_balance_raw, dict):
		closing_balance = closing_balance_raw

	data["closing_balance"] = closing_balance
	return data


def _get_open_pos_entry(user):
	"""Fetch and validate the open POS Opening Entry for the user."""
	open_entry = frappe.get_all(
		"POS Opening Entry",
		filters={"user": user, "docstatus": 1, "status": "Open"},
		fields=["name", "pos_profile", "company", "period_start_date"],
	)

	if not open_entry:
		frappe.throw(_("No open POS Opening Entry found for user."))

	return open_entry[0]


def _calculate_payment_reconciliation(opening_entry, data):
	"""
	Calculate payment reconciliation data including opening balances,
	sales amounts, and expected vs closing amounts.

	For multi-currency setups, each mode of payment may have payments in
	different currencies (e.g. LBP cash and USD cash). We group by
	(mode_of_payment, currency) and use the original payment amounts so
	the receipt shows real currency figures instead of USD conversions.
	"""
	opening_entry_name = opening_entry.name
	opening_start = opening_entry.period_start_date
	opening_date = opening_start.date()
	opening_time = opening_start.time().strftime("%H:%M:%S")

	# Fetch opening balances (always in base/invoice currency)
	opening_modes = frappe.get_all(
		"POS Opening Entry Detail",
		filters={"parent": opening_entry_name},
		fields=["mode_of_payment", "opening_amount"],
	)
	opening_balance_map = {row.mode_of_payment: row.opening_amount for row in opening_modes}

	# Aggregate sales by (mode_of_payment, currency).
	# Use custom_payment_original_amount + custom_payment_currency when available,
	# otherwise fall back to the converted USD amount + invoice currency.
	sales_data = frappe.db.sql(
		"""
		SELECT sip.mode_of_payment,
		       COALESCE(NULLIF(sip.custom_payment_currency, ''), si.currency) AS currency,
		       SUM(
		           CASE
		               WHEN sip.custom_payment_original_amount IS NOT NULL
		                    AND sip.custom_payment_original_amount != 0
		               THEN sip.custom_payment_original_amount
		               ELSE sip.amount
		           END
		       ) as total_amount,
		       COUNT(DISTINCT si.name) as transactions
		FROM `tabSales Invoice` si
		JOIN `tabSales Invoice Payment` sip ON si.name = sip.parent
		WHERE si.custom_pos_opening_entry = %s
		  AND si.docstatus = 1
		GROUP BY sip.mode_of_payment, COALESCE(NULLIF(sip.custom_payment_currency, ''), si.currency)
		""",
		(opening_entry_name,),
		as_dict=True,
	)

	# Build a map: (mode, currency) -> total_amount
	company_currency = frappe.get_cached_value("Company", opening_entry.company or opening_entry.get("company"), "default_currency") or frappe.db.get_default("currency") or frappe.db.get_single_value("System Settings", "default_currency") or frappe.db.get_value("Company", {}, "default_currency")
	sales_map = {}
	for row in sales_data:
		key = (row.mode_of_payment, row.currency or company_currency)
		sales_map[key] = row.total_amount

	# Build reconciliation entries grouped by (mode, currency)
	closing_balance = data.get("closing_balance", {})
	reconciliation = []
	processed_keys = set()

	# Process all (mode, currency) pairs that appeared in sales
	for (mode, currency), sales_amount in sales_map.items():
		opening_amount = opening_balance_map.get(mode, 0)
		expected_amount = float(opening_amount) + float(sales_amount)
		closing_key = f"{mode}||{currency}"
		closing_amount = float(closing_balance.get(closing_key, closing_balance.get(mode, 0)))
		difference = closing_amount - expected_amount
		reconciliation.append({
			"mode_of_payment": mode,
			"currency": currency,
			"opening_amount": float(opening_amount),
			"sales_amount": float(sales_amount),
			"expected_amount": expected_amount,
			"closing_amount": closing_amount,
			"difference": difference,
		})
		processed_keys.add(mode)

	# Add modes that have opening balances but no sales
	for mode, opening_amount in opening_balance_map.items():
		if mode not in processed_keys:
			closing_amount = float(closing_balance.get(mode, 0))
			expected_amount = float(opening_amount)
			difference = closing_amount - expected_amount
			reconciliation.append({
				"mode_of_payment": mode,
				"currency": company_currency,
				"opening_amount": float(opening_amount),
				"sales_amount": 0.0,
				"expected_amount": expected_amount,
				"closing_amount": closing_amount,
				"difference": difference,
			})
			processed_keys.add(mode)

	# Also include modes entered in closing_balance that had no opening balance and no sales
	# This handles sessions where all modes start at zero (e.g. first day, no carry-over cash)
	for cb_key, cb_val in closing_balance.items():
		base_mode = cb_key.split("||")[0] if "||" in cb_key else cb_key
		if base_mode not in processed_keys:
			closing_amount = float(cb_val)
			expected_amount = float(opening_balance_map.get(base_mode, 0))
			difference = closing_amount - expected_amount
			reconciliation.append({
				"mode_of_payment": base_mode,
				"currency": company_currency,
				"opening_amount": expected_amount,
				"sales_amount": 0.0,
				"expected_amount": expected_amount,
				"closing_amount": closing_amount,
				"difference": difference,
			})
			processed_keys.add(base_mode)

	return reconciliation




def _calculate_closing_entry_totals(opening_entry_name):
	"""
	Calculate total_quantity, net_total, and grand_total from all Sales Invoices
	linked to the opening entry. This matches standard Frappe POS behavior.
	"""
	from frappe.utils import flt

	try:
		# Aggregate from Sales Invoice
		aggregated_si = frappe.db.sql(
			"""
			SELECT
				COALESCE(SUM(si.net_total), 0) as net_total,
				COALESCE(SUM(si.grand_total), 0) as grand_total,
				COALESCE(SUM(sii.qty), 0) as total_quantity
			FROM `tabSales Invoice` si
			LEFT JOIN `tabSales Invoice Item` sii ON si.name = sii.parent
			WHERE si.custom_pos_opening_entry = %s
			  AND si.docstatus = 1
			""",
			(opening_entry_name,),
			as_dict=True,
		)

		# Aggregate from POS Invoice
		aggregated_pos = frappe.db.sql(
			"""
			SELECT
				COALESCE(SUM(pi.net_total), 0) as net_total,
				COALESCE(SUM(pi.grand_total), 0) as grand_total,
				COALESCE(SUM(pii.qty), 0) as total_quantity
			FROM `tabPOS Invoice` pi
			LEFT JOIN `tabPOS Invoice Item` pii ON pi.name = pii.parent
			WHERE pi.custom_pos_opening_entry = %s
			  AND pi.docstatus = 1
			""",
			(opening_entry_name,),
			as_dict=True,
		)

		net_total_si = flt(aggregated_si[0].net_total) if aggregated_si else 0.0
		grand_total_si = flt(aggregated_si[0].grand_total) if aggregated_si else 0.0
		qty_si = flt(aggregated_si[0].total_quantity) if aggregated_si else 0.0

		net_total_pos = flt(aggregated_pos[0].net_total) if aggregated_pos else 0.0
		grand_total_pos = flt(aggregated_pos[0].grand_total) if aggregated_pos else 0.0
		qty_pos = flt(aggregated_pos[0].total_quantity) if aggregated_pos else 0.0

		net_total = net_total_si + net_total_pos
		grand_total = grand_total_si + grand_total_pos
		total_quantity = qty_si + qty_pos

		return {
			"total_quantity": total_quantity,
			"net_total": net_total,
			"grand_total": grand_total,
		}
	except Exception as e:
		frappe.logger().error(f"Error calculating closing entry totals: {frappe.get_traceback()}")
		frappe.log_error(
			message=f"Error calculating totals: {e!s}\n{traceback.format_exc()}",
			title="Closing Entry Totals Calculation Error",
		)
		# Return zeros on error to avoid blocking closing entry creation
		return {"total_quantity": 0.0, "net_total": 0.0, "grand_total": 0.0}


def _populate_sales_invoices_to_closing_entry(closing_doc, opening_entry_name):
	"""
	Populate the custom_sales_invoice child table with all Sales Invoices
	linked to the opening entry.
	"""
	try:
		# Fetch all submitted Sales Invoices linked to this opening entry
		invoices = frappe.get_all(
			"Sales Invoice",
			filters={
				"custom_pos_opening_entry": opening_entry_name,
				"docstatus": 1,
			},
			fields=["name", "customer", "posting_date", "grand_total"],
			order_by="posting_date, posting_time",
		)

		# Fetch all submitted POS Invoices linked to this opening entry
		pos_invoices = frappe.get_all(
			"POS Invoice",
			filters={
				"custom_pos_opening_entry": opening_entry_name,
				"docstatus": 1,
			},
			fields=["name", "customer", "posting_date", "grand_total"],
			order_by="posting_date, posting_time",
		)

		# Append each Sales Invoice to the child table
		for invoice in invoices:
			closing_doc.append(
				"custom_sales_invoice",
				{
					"sales_invoice": invoice.name,
					"customer": invoice.customer,
					"posting_date": invoice.posting_date,
					"amount": invoice.grand_total,
				},
			)

		# Append each POS Invoice to the child table
		for invoice in pos_invoices:
			closing_doc.append(
				"custom_sales_invoice",
				{
					"sales_invoice": invoice.name,
					"customer": invoice.customer,
					"posting_date": invoice.posting_date,
					"amount": invoice.grand_total,
				},
			)

		if invoices:
			frappe.logger().info(
				f"✅ Populated {len(invoices)} sales invoices to closing entry {closing_doc.name}"
			)
	except Exception as e:
		# Log error but don't block closing entry creation
		frappe.logger().error(f"Failed to populate sales invoices to closing entry: {frappe.get_traceback()}")
		frappe.log_error(
			message=f"Error populating sales invoices: {e!s}\n{traceback.format_exc()}",
			title="Sales Invoice Population Error",
		)


def _create_and_submit_closing_doc(opening_entry, data, payment_data, user):
	"""Create, populate, and submit the POS Closing Entry document."""
	doc = frappe.new_doc("POS Closing Entry")
	if data.get("pre_assigned_name"):
		doc.name = data.get("pre_assigned_name")
		doc.flags.ignore_naming_series = True

	doc.user = user
	doc.company = opening_entry.company
	doc.pos_profile = opening_entry.pos_profile
	doc.period_start_date = opening_entry.period_start_date
	
	if data.get("period_end_date"):
		doc.period_end_date = data.get("period_end_date")
	else:
		doc.period_end_date = now_datetime()
		
	doc.set_posting_time = 1
	
	if data.get("posting_date"):
		doc.posting_date = data.get("posting_date")
	else:
		doc.posting_date = today()
		
	doc.pos_opening_entry = opening_entry.name

	# Calculate totals from Sales Invoices linked to opening entry
	totals = _calculate_closing_entry_totals(opening_entry.name)

	# Set totals (use calculated values, fallback to frontend data if calculation fails)
	doc.total_quantity = totals.get("total_quantity") or data.get("total_quantity") or 0.0
	doc.net_total = totals.get("net_total") or data.get("net_total") or 0.0
	doc.total_amount = totals.get("grand_total") or data.get("total_amount") or 0.0
	doc.grand_total = totals.get("grand_total") or data.get("total_amount") or 0.0

	# Append payment reconciliation
	for payment in payment_data:
		doc.append("payment_reconciliation", payment)

	# Append taxes
	for tax in data.get("taxes", []):
		doc.append(
			"taxes",
			{
				"account_head": tax.get("account_head"),
				"rate": tax.get("rate"),
				"amount": tax.get("amount"),
			},
		)

	# Populate sales invoices linked to this opening entry
	_populate_sales_invoices_to_closing_entry(doc, opening_entry.name)

	# Do not populate standard ERPNext pos_transactions table to avoid validation errors
	# when POS invoices are created by another user (e.g. cashiers) but closed by Administrator.
	# Sultan uses its own custom reconciliation system via custom_sales_invoice.


	# Submit and link back to opening entry
	doc.submit()
	frappe.db.set_value("POS Opening Entry", opening_entry.name, "pos_closing_entry", doc.name)

	# If POS Profile has "Clear draft invoices" enabled, delete all drafts for this session
	_clear_draft_invoices_on_close_if_enabled(opening_entry)

	# Clear POS profile cache for the current user to ensure fresh data on next session
	try:
		clear_pos_profile_cache(user=user)
	except Exception:
		# Do not block closing if cache clear fails; log and continue
		frappe.logger().warning("Failed to clear POS profile cache after closing entry", exc_info=True)

	return doc


def _clear_draft_invoices_on_close_if_enabled(opening_entry):
	"""If POS Profile has custom_clear_draft_invoices set, delete all draft invoices for this session."""
	try:
		pos_profile_name = opening_entry.get("pos_profile") if isinstance(opening_entry, dict) else getattr(opening_entry, "pos_profile", None)
		opening_entry_name = opening_entry.get("name") if isinstance(opening_entry, dict) else getattr(opening_entry, "name", None)
		if not pos_profile_name or not opening_entry_name:
			return
		# Check custom field (safe if field does not exist)
		clear_drafts = frappe.db.get_value("POS Profile", pos_profile_name, "custom_clear_draft_invoices")
		if clear_drafts:
			delete_draft_invoices_for_opening_entry(opening_entry_name)
	except Exception as e:
		frappe.logger().warning("Failed to clear draft invoices on close: %s", e, exc_info=True)


@frappe.whitelist()
def get_branch_sessions():
	from sultan.sultan.utils import get_current_pos_profile
	from sultan.sultan.api.sales_invoice import get_current_pos_opening_entry
	
	current_profile = None
	current_opening_entry = get_current_pos_opening_entry()
	if current_opening_entry:
		opening_doc = frappe.get_doc("POS Opening Entry", current_opening_entry)
		current_profile = frappe.get_doc("POS Profile", opening_doc.pos_profile)
	else:
		try:
			current_profile = get_current_pos_profile()
		except Exception:
			current_profile = None

	active_role = frappe.db.get_value("User", frappe.session.user, "role_profile_name")

	is_admin = False
	if active_role and active_role.lower() == 'administrator':
		is_admin = True
	elif frappe.session.user == 'Administrator':
		is_admin = True

	is_auditor = False
	user_roles = frappe.get_roles(frappe.session.user)
	if active_role and active_role.lower() in ('auditor', 'pos auditor'):
		is_auditor = True
	elif "Auditor" in user_roles or "POS Auditor" in user_roles:
		is_auditor = True
	else:
		emp_pos_role = frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, "custom_pos_role")
		if emp_pos_role and emp_pos_role.lower() == 'auditor':
			is_auditor = True

	if not (is_admin or is_auditor):
		if not current_profile:
			frappe.throw("No active POS Profile found for the current session.", frappe.PermissionError)
		if not getattr(current_profile, "custom_is_branch", 0):
			frappe.throw("Access denied: POS Profile is not marked as a branch.", frappe.PermissionError)
		frappe.throw("Access denied: User does not have administrator privileges in this branch.", frappe.PermissionError)

	opening_entry_meta = frappe.get_meta("POS Opening Entry")
	opening_entry_fields = {df.fieldname for df in opening_entry_meta.fields}
	has_custom_employee = "custom_employee_name" in opening_entry_fields
	employee_field = ", ope.custom_employee_name as custom_employee_name" if has_custom_employee else ""

	query = f"""
		select
			ope.name as name,
			ope.pos_profile as pos_profile,
			COALESCE(
				p.currency,
				(select default_currency from tabCompany where name = p.company),
				(select defvalue from tabDefaultValue where defkey='currency' limit 1),
				(select defvalue from tabDefaultValue where defkey='default_currency' limit 1)
			) as currency,
			ope.period_start_date as period_start_date,
			clo.period_end_date as period_end_date,
			ope.status as status,
			ope.docstatus as docstatus,
			ope.pos_closing_entry as pos_closing_entry,
			clo.grand_total as grand_total,
			clo.total_quantity as total_quantity,
			ope.user as user,
			ope.owner as owner
			{employee_field}
		from
			`tabPOS Opening Entry` ope
		inner join
			`tabPOS Profile` p on ope.pos_profile = p.name
		left join
			`tabPOS Closing Entry` clo on ope.pos_closing_entry = clo.name
		where
			p.custom_is_branch = 1
		order by
			ope.creation desc
	"""
	sessions = frappe.db.sql(query, as_dict=True)

	for s in sessions:
		if s.get('period_start_date'):
			s['period_start_date'] = str(s['period_start_date'])
		if s.get('period_end_date'):
			s['period_end_date'] = str(s['period_end_date'])
		
		if s.get('docstatus') == 0:
			s['display_status'] = 'Draft'
		elif s.get('docstatus') == 2:
			s['display_status'] = 'Cancelled'
		else:
			s['display_status'] = s.get('status')
			
	closing_entries = [s.get('pos_closing_entry') for s in sessions if s.get('pos_closing_entry')]
	if closing_entries:
		closing_details = frappe.db.sql("""
			select 
				d.parent, 
				d.mode_of_payment, 
				d.opening_amount,
				d.expected_amount, 
				d.closing_amount, 
				d.difference,
				COALESCE(
					ppm.custom_currency, 
					(select currency from `tabPOS Profile` where name = c.pos_profile), 
					(select default_currency from `tabCompany` where name = c.company), 
					(select defvalue from tabDefaultValue where defkey='currency' limit 1),
					(select defvalue from tabDefaultValue where defkey='default_currency' limit 1)
				) as custom_currency,
				COALESCE(cur.number_format, '#,###.##') as currency_number_format
			from `tabPOS Closing Entry Detail` d
			join `tabPOS Closing Entry` c on d.parent = c.name
			left join `tabPOS Payment Method` ppm on c.pos_profile = ppm.parent and d.mode_of_payment = ppm.mode_of_payment
			left join `tabCurrency` cur on ppm.custom_currency = cur.name
			where d.parent in %s
		""", (tuple(closing_entries),), as_dict=True)
		
		# Map details to sessions
		details_map = {}
		for d in closing_details:
			if d.parent not in details_map:
				details_map[d.parent] = []
			details_map[d.parent].append(d)
			
		for s in sessions:
			if s.get('pos_closing_entry'):
				s['closing_details'] = details_map.get(s.get('pos_closing_entry'), [])
			else:
				s['closing_details'] = []

	return sessions


@frappe.whitelist()
def resume_profile_session(pos_profile: str, employee: str = None, employee_name: str = None) -> dict:
	"""Take over / resume an existing open POS session for a profile.

	Updates the POS Opening Entry's user, custom_employee, and custom_employee_name
	to the current session's user and employee.
	"""
	if not pos_profile:
		frappe.throw(_("POS Profile is required to resume session"))

	user = frappe.session.user

	# Find the active session for the profile
	open_entries = frappe.get_all(
		"POS Opening Entry",
		filters={"pos_profile": pos_profile, "docstatus": 1, "status": "Open"},
		fields=["name"],
		limit=1,
	)

	if not open_entries:
		frappe.throw(_("No active session found for POS Profile {0}").format(pos_profile))

	entry_name = open_entries[0].name

	# Update the user and employee details on the POS Opening Entry
	frappe.db.set_value(
		"POS Opening Entry",
		entry_name,
		{
			"user": user,
			"custom_employee": employee or "",
			"custom_employee_name": employee_name or "",
		},
	)

	frappe.db.commit()

	# Clear POS profile cache
	try:
		clear_pos_profile_cache(user=user)
	except Exception:
		pass

	return {"success": True, "session_name": entry_name}




# --- Custom Naming Series Hooks ---

def autoname_pos_opening_entry(doc, method=None):
	from frappe.model.naming import make_autoname
	profile = doc.pos_profile
	if not profile:
		profile = "DEFAULT"
	formatted_profile = profile.upper().replace(" ", "_").replace("-", "_")
	formatted_profile = "".join(c for c in formatted_profile if c.isalnum() or c == "_")
	prefix = f"OP-{formatted_profile}-.#####"
	doc.name = make_autoname(prefix)

def autoname_pos_closing_entry(doc, method=None):
	from frappe.model.naming import make_autoname
	profile = None
	if doc.pos_opening_entry:
		profile = frappe.db.get_value("POS Opening Entry", doc.pos_opening_entry, "pos_profile")
	if not profile:
		profile = "DEFAULT"
	formatted_profile = profile.upper().replace(" ", "_").replace("-", "_")
	formatted_profile = "".join(c for c in formatted_profile if c.isalnum() or c == "_")
	prefix = f"CL-{formatted_profile}-.#####"
	doc.name = make_autoname(prefix)

def autoname_pos_invoice(doc, method=None):
	from frappe.model.naming import make_autoname
	profile = doc.pos_profile
	if not profile and getattr(doc, "pos_opening_entry", None):
		profile = frappe.db.get_value("POS Opening Entry", doc.pos_opening_entry, "pos_profile")
	if not profile and getattr(doc, "custom_pos_opening_entry", None):
		profile = frappe.db.get_value("POS Opening Entry", doc.custom_pos_opening_entry, "pos_profile")
	if not profile:
		profile = "DEFAULT"
	formatted_profile = profile.upper().replace(" ", "_").replace("-", "_")
	formatted_profile = "".join(c for c in formatted_profile if c.isalnum() or c == "_")
	prefix = f"PSINV-{formatted_profile}-.#####"
	doc.name = make_autoname(prefix)

def autoname_pos_suspended_transaction(doc, method=None):
	from frappe.model.naming import make_autoname
	profile = doc.pos_profile
	if not profile and doc.pos_session:
		profile = frappe.db.get_value("POS Opening Entry", doc.pos_session, "pos_profile")
	if not profile:
		profile = "DEFAULT"
	formatted_profile = profile.upper().replace(" ", "_").replace("-", "_")
	formatted_profile = "".join(c for c in formatted_profile if c.isalnum() or c == "_")
	prefix = f"CSH-{formatted_profile}-.#####"
	doc.name = make_autoname(prefix)

def autoname_work_order(doc, method=None):
	from frappe.model.naming import make_autoname
	profile = None
	
	if getattr(doc, "custom_pos_invoice", None):
		profile = frappe.db.get_value("POS Invoice", doc.custom_pos_invoice, "pos_profile")
		if not profile:
			opening_entry = frappe.db.get_value("POS Invoice", doc.custom_pos_invoice, "custom_pos_opening_entry")
			if opening_entry:
				profile = frappe.db.get_value("POS Opening Entry", opening_entry, "pos_profile")
				
	if not profile:
		profile = "DEFAULT"
		
	formatted_profile = profile.upper().replace(" ", "_").replace("-", "_")
	formatted_profile = "".join(c for c in formatted_profile if c.isalnum() or c == "_")
	prefix = f"WO-{formatted_profile}-.#####"
	doc.name = make_autoname(prefix)



@frappe.whitelist(allow_guest=True)
def branch_login(email, password):
	try:
		from frappe.utils.password import get_decrypted_password
		
		# Authenticate using login manager
		login_manager = frappe.auth.LoginManager()
		login_manager.authenticate(user=email, pwd=password)
		login_manager.post_login()
		
		user = frappe.session.user
		
		# Resolve POS Profile
		pos_profile_name = frappe.get_value("POS Profile User", {"user": user}, "parent")
		if not pos_profile_name:
			pos_profile_name = frappe.get_value("User Permission", {"user": user, "allow": "POS Profile"}, "for_value")
			
		if not pos_profile_name:
			return {
				"success": False,
				"error": f"No POS Profile assigned to user {user}."
			}
			
		pos_profile = frappe.get_doc("POS Profile", pos_profile_name)
		
		# Get warehouse
		warehouse = pos_profile.warehouse
		custom_warehouse = frappe.db.get_value("POS Profile User", {"parent": pos_profile_name, "user": user}, "custom_warehouse")
		if custom_warehouse:
			warehouse = custom_warehouse
			
		# Resolve/Generate API credentials for the user
		user_doc = frappe.get_doc("User", user)
		if not user_doc.api_key:
			user_doc.api_key = frappe.generate_hash(length=15)
			user_doc.save(ignore_permissions=True)
			
		api_secret = None
		try:
			api_secret = get_decrypted_password("User", user, "api_secret", raise_exception=False)
		except Exception:
			pass
			
		if not api_secret:
			api_secret = frappe.generate_hash(length=15)
			from frappe.utils.password import set_encrypted_password
			set_encrypted_password("User", user, api_secret, "api_secret")
			
		frappe.db.commit()
		
		return {
			"success": True,
			"branch_name": pos_profile_name,
			"warehouse": warehouse or "",
			"pos_profile": pos_profile_name,
			"api_key": user_doc.api_key,
			"api_secret": api_secret
		}
	except frappe.AuthenticationError:
		return {
			"success": False,
			"error": "Invalid email or password."
		}
	except Exception as e:
		frappe.log_error(message=frappe.get_traceback(), title="POS Branch Login Error")
		return {
			"success": False,
			"error": str(e)
		}


@frappe.whitelist()
def get_mode_of_payment_currency(mode_of_payment, company):
	system_default = frappe.db.get_default("currency") or frappe.db.get_single_value("System Settings", "default_currency") or frappe.db.get_value("Company", {}, "default_currency")
	if not company or not mode_of_payment:
		return system_default
	account = frappe.db.get_value(
		"Mode of Payment Account",
		{"parent": mode_of_payment, "company": company},
		"default_account",
	)
	if not account:
		return frappe.get_cached_value("Company", company, "default_currency") or system_default
	return frappe.get_cached_value("Account", account, "account_currency") or frappe.get_cached_value("Company", company, "default_currency") or system_default


@frappe.whitelist()
def get_sequence_state(pos_profile):
	if not pos_profile:
		frappe.throw(_("pos_profile is required"))
	
	formatted_profile = pos_profile.upper().replace(" ", "_").replace("-", "_")
	formatted_profile = "".join(c for c in formatted_profile if c.isalnum() or c == "_")
	
	session_prefix = f"OP-{formatted_profile}-"
	invoice_prefix = f"PSINV-{formatted_profile}-"
	closing_prefix = f"CL-{formatted_profile}-"
	cash_tx_prefix = f"CSH-{formatted_profile}-"
	
	# Fetch current counters from tabSeries directly
	session_current_res = frappe.db.sql("SELECT current FROM `tabSeries` WHERE name = %s", (session_prefix,))
	session_current = session_current_res[0][0] if session_current_res else 0

	invoice_current_res = frappe.db.sql("SELECT current FROM `tabSeries` WHERE name = %s", (invoice_prefix,))
	invoice_current = invoice_current_res[0][0] if invoice_current_res else 0

	closing_current_res = frappe.db.sql("SELECT current FROM `tabSeries` WHERE name = %s", (closing_prefix,))
	closing_current = closing_current_res[0][0] if closing_current_res else 0

	cash_tx_current_res = frappe.db.sql("SELECT current FROM `tabSeries` WHERE name = %s", (cash_tx_prefix,))
	cash_tx_current = cash_tx_current_res[0][0] if cash_tx_current_res else 0
	
	last_session_id = f"{session_prefix}{str(session_current).zfill(5)}" if session_current > 0 else None
	last_invoice_id = f"{invoice_prefix}{str(invoice_current).zfill(5)}" if invoice_current > 0 else None
	last_closing_id = f"{closing_prefix}{str(closing_current).zfill(5)}" if closing_current > 0 else None
	last_cash_tx_id = f"{cash_tx_prefix}{str(cash_tx_current).zfill(5)}" if cash_tx_current > 0 else None
	
	return {
		"last_session_id": last_session_id,
		"last_invoice_id": last_invoice_id,
		"last_closing_id": last_closing_id,
		"last_cash_tx_id": last_cash_tx_id
	}
