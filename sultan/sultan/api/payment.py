import frappe
from frappe import _

from sultan.sultan.api.sales_invoice import get_current_pos_opening_entry
from sultan.sultan.utils import get_current_pos_profile


@frappe.whitelist()
def get_payment_modes():
	try:
		# Get pos_profile from query params if provided, otherwise use current profile
		pos_profile = frappe.form_dict.get("pos_profile")

		if pos_profile:
			pos_doc = frappe.get_doc("POS Profile", pos_profile)
		else:
			pos_doc = get_current_pos_profile()
		payment_modes = frappe.get_all(
			"POS Payment Method",
			filters={"parent": pos_doc.name},
			fields=["mode_of_payment", "default", "allow_in_returns", "custom_show_in_opening_entry", "custom_currency"],
		)

		for mode in payment_modes:
			payment_type = frappe.get_value("Mode of Payment", mode["mode_of_payment"], "type")
			mode["type"] = payment_type or "Default"

		return {"success": True, "pos_profile": pos_doc.name, "data": payment_modes}

	except Exception as e:
		frappe.log_error(title="Get Payment Modes Error", message=str(e))
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_all_mode_of_payment():
	try:
		mode_of_payments = frappe.get_all(
			"Mode of Payment",
			filters={"enabled": 1},
			fields=["name", "type", "enabled"],
		)
		return mode_of_payments
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Fetch Mode of Payment Error")
		return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_opening_entry_payment_summary():
	"""
	Get payment summary for the current POS opening entry.
	Admins see all transactions for the day, regular users see only their opening entry.
	"""
	try:
		opening_doc = _get_opening_document()
		if not opening_doc:
			return _error_response("No open POS Opening Entry found.")

		opening_info = _extract_opening_info(opening_doc)
		is_admin = _check_admin_privileges()

		sales_data = _fetch_sales_data(
			opening_info["profile"], opening_info["entry_name"], opening_info["date"], is_admin
		)

		payment_summary = _build_payment_summary(opening_info["modes"], sales_data, opening_info["profile"])

		return _success_response(opening_info, payment_summary)

	except Exception as e:
		frappe.log_error(
			title="Get Opening Entry Payment Summary Error",
			message=frappe.get_traceback(),
		)
		return _error_response(str(e))


def _get_opening_document():
	"""Retrieve the current POS opening entry document."""
	current_opening_entry = get_current_pos_opening_entry()
	if not current_opening_entry:
		return None
	return frappe.get_doc("POS Opening Entry", current_opening_entry)


def _extract_opening_info(opening_doc):
	"""Extract and format opening entry information."""
	opening_start = opening_doc.period_start_date

	modes = frappe.get_all(
		"POS Opening Entry Detail",
		filters={"parent": opening_doc.name},
		fields=["mode_of_payment", "opening_amount"],
	)

	return {
		"profile": opening_doc.pos_profile,
		"entry_name": opening_doc.name,
		"date": opening_start.date(),
		"time": opening_start.time().strftime("%H:%M:%S"),
		"modes": modes,
	}


def _check_admin_privileges():
	"""Check if current user has administrative privileges."""
	user_roles = frappe.get_roles(frappe.session.user)
	admin_roles = {"Administrator", "Sales Manager", "System Manager"}
	return bool(admin_roles & set(user_roles))


def _fetch_sales_data(pos_profile, opening_entry_name, opening_date, is_admin):
	"""Fetch aggregated sales payment data based on user privileges."""
	if is_admin:
		frappe.logger().info(
			f"Admin user {frappe.session.user} - aggregating all invoices for date: {opening_date}"
		)
		return _fetch_daily_sales_data(pos_profile, opening_date)

	frappe.logger().info(f"Aggregating payments for POS opening entry: {opening_entry_name}")
	return _fetch_opening_sales_data(opening_entry_name)


def _fetch_daily_sales_data(pos_profile, opening_date):
	"""Fetch all sales data for the day (admin view)."""
	return frappe.db.sql(
		"""
        SELECT
            sip.mode_of_payment,
            SUM(CASE WHEN sip.custom_payment_original_amount IS NOT NULL AND sip.custom_payment_original_amount != 0 THEN (CASE WHEN si.is_return = 1 THEN -ABS(sip.custom_payment_original_amount) ELSE sip.custom_payment_original_amount END) ELSE sip.amount END) as total_amount,
            COUNT(DISTINCT si.name) as transactions
        FROM `tabSales Invoice` si
        JOIN `tabSales Invoice Payment` sip ON si.name = sip.parent
        WHERE si.pos_profile = %s
          AND si.docstatus = 1
          AND si.posting_date = %s
          AND si.custom_pos_opening_entry IS NOT NULL
          AND si.custom_pos_opening_entry != ''
        GROUP BY sip.mode_of_payment
        """,
		(pos_profile, opening_date),
		as_dict=True,
	)


def _fetch_opening_sales_data(opening_entry_name):
	"""Fetch sales data for specific opening entry (regular user view)."""
	return frappe.db.sql(
		"""
        SELECT
            sip.mode_of_payment,
            SUM(CASE WHEN sip.custom_payment_original_amount IS NOT NULL AND sip.custom_payment_original_amount != 0 THEN (CASE WHEN si.is_return = 1 THEN -ABS(sip.custom_payment_original_amount) ELSE sip.custom_payment_original_amount END) ELSE sip.amount END) as total_amount,
            COUNT(DISTINCT si.name) as transactions
        FROM `tabSales Invoice` si
        JOIN `tabSales Invoice Payment` sip ON si.name = sip.parent
        WHERE si.custom_pos_opening_entry = %s
          AND si.docstatus = 1
        GROUP BY sip.mode_of_payment
        """,
		(opening_entry_name,),
		as_dict=True,
	)


def _build_payment_summary(opening_modes, sales_data, pos_profile):
	"""Build payment summary for ALL POS Profile payment modes (Item 3 fix).
	Modes with no transactions still appear so cashiers can enter closing amounts."""
	sales_map = {row.mode_of_payment: row for row in sales_data}
	opening_map = {mode.mode_of_payment: float(mode.opening_amount or 0.0) for mode in opening_modes}

	# Always show every mode on the POS Profile, not just those with sales
	all_profile_modes = frappe.get_all(
		"POS Payment Method",
		filters={"parent": pos_profile},
		fields=["mode_of_payment", "custom_currency"],
		order_by="idx asc",
	)

	summary = []
	pos_profile_currency = frappe.db.get_value("POS Profile", pos_profile, "currency", cache=True)
	pos_profile_company = frappe.db.get_value("POS Profile", pos_profile, "company", cache=True)
	company_currency = frappe.get_cached_value("Company", pos_profile_company, "default_currency") if pos_profile_company else None
	for profile_mode in all_profile_modes:
		mop = profile_mode.mode_of_payment
		sales_info = sales_map.get(mop, {})
		currency_code = profile_mode.custom_currency or pos_profile_currency or company_currency or frappe.db.get_default("currency") or frappe.db.get_single_value("System Settings", "default_currency") or frappe.db.get_value("Company", {}, "default_currency")
		number_format = frappe.db.get_value("Currency", currency_code, "number_format", cache=True) or "#,###.##"
		
		summary.append(
			{
				"name": mop,
				"openingAmount": opening_map.get(mop, 0.0),
				"amount": float(sales_info.get("total_amount", 0.0)),
				"transactions": int(sales_info.get("transactions", 0)),
				"custom_currency": currency_code,
				"currency_number_format": number_format,
			}
		)

	return summary


def _success_response(opening_info, payment_summary):
	"""Build success response."""
	return {
		"success": True,
		"pos_profile": opening_info["profile"],
		"opening_entry": opening_info["entry_name"],
		"date": str(opening_info["date"]),
		"time": opening_info["time"],
		"data": payment_summary,
	}


def _error_response(error_message):
	"""Build error response."""
	return {
		"success": False,
		"error": error_message,
	}
