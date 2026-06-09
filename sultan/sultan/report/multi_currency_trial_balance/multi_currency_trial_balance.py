import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	filters = frappe._dict(filters or {})
	validate_filters(filters)
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def validate_filters(filters):
	if not filters.company:
		frappe.throw(_("Company is required"))
	if not filters.from_date or not filters.to_date:
		frappe.throw(_("From Date and To Date are required"))
	if filters.from_date > filters.to_date:
		frappe.throw(_("From Date cannot be after To Date"))
	if not filters.exchange_rate:
		filters.exchange_rate = 89500


def get_columns():
	return [
		{"label": _("Account Number"), "fieldname": "account_number", "fieldtype": "Data", "width": 120},
		{"label": _("Account Name"), "fieldname": "account_name", "fieldtype": "Data", "width": 260},
		{"label": _("Opening Debit USD"), "fieldname": "opening_debit_usd", "fieldtype": "Currency", "options": "USD", "width": 140},
		{"label": _("Opening Credit USD"), "fieldname": "opening_credit_usd", "fieldtype": "Currency", "options": "USD", "width": 140},
		{"label": _("Opening Debit LBP"), "fieldname": "opening_debit_lbp", "fieldtype": "Currency", "options": "LBP", "width": 140},
		{"label": _("Opening Credit LBP"), "fieldname": "opening_credit_lbp", "fieldtype": "Currency", "options": "LBP", "width": 140},
		{"label": _("Period Debit USD"), "fieldname": "period_debit_usd", "fieldtype": "Currency", "options": "USD", "width": 140},
		{"label": _("Period Credit USD"), "fieldname": "period_credit_usd", "fieldtype": "Currency", "options": "USD", "width": 140},
		{"label": _("Period Debit LBP"), "fieldname": "period_debit_lbp", "fieldtype": "Currency", "options": "LBP", "width": 140},
		{"label": _("Period Credit LBP"), "fieldname": "period_credit_lbp", "fieldtype": "Currency", "options": "LBP", "width": 140},
		{"label": _("Closing Debit USD"), "fieldname": "closing_debit_usd", "fieldtype": "Currency", "options": "USD", "width": 140},
		{"label": _("Closing Credit USD"), "fieldname": "closing_credit_usd", "fieldtype": "Currency", "options": "USD", "width": 140},
		{"label": _("Closing Debit LBP"), "fieldname": "closing_debit_lbp", "fieldtype": "Currency", "options": "LBP", "width": 140},
		{"label": _("Closing Credit LBP"), "fieldname": "closing_credit_lbp", "fieldtype": "Currency", "options": "LBP", "width": 140},
	]


def get_data(filters):
	accounts = frappe.get_all(
		"Account",
		filters={"company": filters.company},
		fields=["name", "account_name", "account_number", "lft", "is_group"],
		order_by="lft",
	)
	amounts = get_gl_amounts(filters)
	rows = []

	for account in accounts:
		values = amounts.get(account.name, frappe._dict())
		opening = flt(values.get("opening_debit")) - flt(values.get("opening_credit"))
		period = flt(values.get("period_debit")) - flt(values.get("period_credit"))
		closing = opening + period

		row = frappe._dict(
			account=account.name,
			account_number=account.account_number,
			account_name=account.account_name,
			indent=get_indent(account.account_number),
		)
		row.update(split_balance("opening", opening, filters.exchange_rate))
		row.update(split_debit_credit("period", values, filters.exchange_rate))
		row.update(split_balance("closing", closing, filters.exchange_rate))

		if account.is_group or any(flt(row.get(field)) for field in row if field.endswith(("usd", "lbp"))):
			rows.append(row)

	return rows


def get_gl_amounts(filters):
	rows = frappe.db.sql(
		"""
		select
			account,
			sum(case when posting_date < %(from_date)s then debit else 0 end) as opening_debit,
			sum(case when posting_date < %(from_date)s then credit else 0 end) as opening_credit,
			sum(case when posting_date between %(from_date)s and %(to_date)s then debit else 0 end) as period_debit,
			sum(case when posting_date between %(from_date)s and %(to_date)s then credit else 0 end) as period_credit
		from `tabGL Entry`
		where company = %(company)s
			and is_cancelled = 0
			and posting_date <= %(to_date)s
		group by account
		""",
		filters,
		as_dict=True,
	)
	return {row.account: row for row in rows}


def split_balance(prefix, amount, exchange_rate):
	usd = flt(abs(amount))
	lbp = flt(usd * flt(exchange_rate), 0)
	if amount >= 0:
		return {
			f"{prefix}_debit_usd": usd,
			f"{prefix}_credit_usd": 0,
			f"{prefix}_debit_lbp": lbp,
			f"{prefix}_credit_lbp": 0,
		}
	return {
		f"{prefix}_debit_usd": 0,
		f"{prefix}_credit_usd": usd,
		f"{prefix}_debit_lbp": 0,
		f"{prefix}_credit_lbp": lbp,
	}


def split_debit_credit(prefix, values, exchange_rate):
	debit_usd = flt(values.get(f"{prefix}_debit"))
	credit_usd = flt(values.get(f"{prefix}_credit"))
	return {
		f"{prefix}_debit_usd": debit_usd,
		f"{prefix}_credit_usd": credit_usd,
		f"{prefix}_debit_lbp": flt(debit_usd * flt(exchange_rate), 0),
		f"{prefix}_credit_lbp": flt(credit_usd * flt(exchange_rate), 0),
	}


def get_indent(account_number):
	if not account_number:
		return 0
	return max(len(str(account_number)) - 4, 0) // 2
