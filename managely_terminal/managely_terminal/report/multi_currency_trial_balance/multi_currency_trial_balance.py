import frappe
from frappe import _
from frappe.utils import flt

value_fields = (
	"opening_debit_usd",
	"opening_credit_usd",
	"opening_debit_lbp",
	"opening_credit_lbp",
	"period_debit_usd",
	"period_credit_usd",
	"period_debit_lbp",
	"period_credit_lbp",
	"closing_debit_usd",
	"closing_credit_usd",
	"closing_debit_lbp",
	"closing_credit_lbp",
)


def execute(filters=None):
	filters = frappe._dict(filters or {})
	validate_filters(filters)
	columns = get_columns(filters)
	data = get_data(filters)
	return columns, data


def validate_filters(filters):
	if not filters.company:
		frappe.throw(_("Company is required"))
	if not filters.from_date or not filters.to_date:
		frappe.throw(_("From Date and To Date are required"))
	if filters.from_date > filters.to_date:
		frappe.throw(_("From Date cannot be after To Date"))

	from managely_terminal.managely_terminal.accounting.customizations import (
		get_company_secondary_currency,
		get_company_dual_rate,
	)
	sec_curr = get_company_secondary_currency(filters.company)
	if not sec_curr:
		frappe.throw(
			_("Secondary Currency is not configured for Company {0}. Please set Secondary Currency in Company master to view this report.").format(filters.company)
		)

	if not filters.exchange_rate:
		filters.exchange_rate = get_company_dual_rate(filters.company, filters.to_date)
		if not filters.exchange_rate:
			pri_curr = frappe.get_cached_value("Company", filters.company, "default_currency")
			frappe.throw(
				_("No exchange rate found between {0} and {1}. Please enter an Exchange Rate.").format(
					pri_curr, sec_curr
				)
			)
	else:
		filters.exchange_rate = flt(filters.exchange_rate)


def get_columns(filters=None):
	company = filters.get("company") if filters else None
	if not company:
		company = frappe.defaults.get_user_default("Company")

	pri_curr = frappe.get_cached_value("Company", company, "default_currency") if company else ""
	from managely_terminal.managely_terminal.accounting.customizations import get_company_secondary_currency
	sec_curr = get_company_secondary_currency(company) if company else ""

	return [
		{
			"label": _("Account"),
			"fieldname": "account",
			"fieldtype": "Link",
			"options": "Account",
			"width": 300,
		},
		{
			"label": _("Account Number"),
			"fieldname": "account_number",
			"fieldtype": "Data",
			"width": 120,
		},
		{
			"label": _("Opening Debit {0}").format(pri_curr),
			"fieldname": "opening_debit_usd",
			"fieldtype": "Currency",
			"options": pri_curr,
			"width": 140,
		},
		{
			"label": _("Opening Credit {0}").format(pri_curr),
			"fieldname": "opening_credit_usd",
			"fieldtype": "Currency",
			"options": pri_curr,
			"width": 140,
		},
		{
			"label": _("Opening Debit {0}").format(sec_curr),
			"fieldname": "opening_debit_lbp",
			"fieldtype": "Currency",
			"options": sec_curr,
			"width": 140,
		},
		{
			"label": _("Opening Credit {0}").format(sec_curr),
			"fieldname": "opening_credit_lbp",
			"fieldtype": "Currency",
			"options": sec_curr,
			"width": 140,
		},
		{
			"label": _("Period Debit {0}").format(pri_curr),
			"fieldname": "period_debit_usd",
			"fieldtype": "Currency",
			"options": pri_curr,
			"width": 140,
		},
		{
			"label": _("Period Credit {0}").format(pri_curr),
			"fieldname": "period_credit_usd",
			"fieldtype": "Currency",
			"options": pri_curr,
			"width": 140,
		},
		{
			"label": _("Period Debit {0}").format(sec_curr),
			"fieldname": "period_debit_lbp",
			"fieldtype": "Currency",
			"options": sec_curr,
			"width": 140,
		},
		{
			"label": _("Period Credit {0}").format(sec_curr),
			"fieldname": "period_credit_lbp",
			"fieldtype": "Currency",
			"options": sec_curr,
			"width": 140,
		},
		{
			"label": _("Closing Debit {0}").format(pri_curr),
			"fieldname": "closing_debit_usd",
			"fieldtype": "Currency",
			"options": pri_curr,
			"width": 140,
		},
		{
			"label": _("Closing Credit {0}").format(pri_curr),
			"fieldname": "closing_credit_usd",
			"fieldtype": "Currency",
			"options": pri_curr,
			"width": 140,
		},
		{
			"label": _("Closing Debit {0}").format(sec_curr),
			"fieldname": "closing_debit_lbp",
			"fieldtype": "Currency",
			"options": sec_curr,
			"width": 140,
		},
		{
			"label": _("Closing Credit {0}").format(sec_curr),
			"fieldname": "closing_credit_lbp",
			"fieldtype": "Currency",
			"options": sec_curr,
			"width": 140,
		},
		{
			"label": _("Cost Center"),
			"fieldname": "cost_center",
			"fieldtype": "Link",
			"options": "Cost Center",
			"width": 160,
		},
	]


def get_data(filters):
	raw_accounts = frappe.db.sql(
		"""
		select name, account_name, account_number, parent_account, lft, rgt, root_type, report_type, is_group
		from `tabAccount`
		where company = %(company)s
		order by lft
		""",
		filters,
		as_dict=True,
	)

	if not raw_accounts:
		return []

	# Build hierarchy map
	parent_children_map = {}
	accounts_by_name = {}
	for acc in raw_accounts:
		accounts_by_name[acc.name] = acc
		parent_children_map.setdefault(acc.parent_account or None, []).append(acc)

	# Build ordered list with indentation
	ordered_accounts = []

	def add_to_list(parent, level):
		children = parent_children_map.get(parent) or []
		for child in children:
			child.indent = level
			ordered_accounts.append(child)
			add_to_list(child.name, level + 1)

	add_to_list(None, 0)

	# Fetch GL amounts for leaves
	gl_amounts = get_gl_amounts(filters)
	rate = flt(filters.exchange_rate) or 1.0

	# Calculate base values for each account
	for acc in ordered_accounts:
		for field in value_fields:
			acc[field] = 0.0

		values = gl_amounts.get(acc.name)
		if values:
			op_dr = flt(values.get("opening_debit"))
			op_cr = flt(values.get("opening_credit"))
			p_dr = flt(values.get("period_debit"))
			p_cr = flt(values.get("period_credit"))

			# Net opening balance
			net_op = op_dr - op_cr
			if net_op >= 0:
				acc["opening_debit_usd"] = net_op
				acc["opening_credit_usd"] = 0.0
			else:
				acc["opening_debit_usd"] = 0.0
				acc["opening_credit_usd"] = abs(net_op)

			acc["period_debit_usd"] = p_dr
			acc["period_credit_usd"] = p_cr

			# Net closing balance
			net_cl = net_op + (p_dr - p_cr)
			if net_cl >= 0:
				acc["closing_debit_usd"] = net_cl
				acc["closing_credit_usd"] = 0.0
			else:
				acc["closing_debit_usd"] = 0.0
				acc["closing_credit_usd"] = abs(net_cl)

			acc["cost_center"] = filters.get("cost_center") or values.get("cost_center") or ""

	# Accumulate leaf values into parents (bottom-up traversal)
	accumulate_into_parents(ordered_accounts, accounts_by_name)

	# Compute secondary currency values from accumulated base values
	sec_curr = frappe.get_cached_value("Company", filters.company, "custom_secondary_currency")
	frac_units = frappe.get_cached_value("Currency", sec_curr, "fraction_units") if sec_curr else 2
	precision = 0 if frac_units == 0 else 2

	for acc in ordered_accounts:
		for field in ("opening_debit", "opening_credit", "period_debit", "period_credit", "closing_debit", "closing_credit"):
			pri_val = acc[f"{field}_usd"]
			if rate > 1.0:
				sec_val = pri_val * rate
			elif rate > 0:
				sec_val = pri_val / rate
			else:
				sec_val = pri_val
			acc[f"{field}_lbp"] = flt(sec_val, precision)

	# Format output rows and track rows with value
	data = []
	for acc in ordered_accounts:
		has_value = any(abs(flt(acc.get(f))) > 0.001 for f in value_fields)
		acc["has_value"] = has_value

		row = {
			"account": acc.name,
			"account_name": acc.account_name,
			"account_number": acc.account_number,
			"parent_account": acc.parent_account,
			"is_group": acc.is_group,
			"indent": acc.indent,
			"cost_center": acc.get("cost_center") or filters.get("cost_center") or "",
			"has_value": has_value,
		}
		for f in value_fields:
			if f.endswith("_lbp"):
				row[f] = flt(acc.get(f, 0.0), precision)
			else:
				row[f] = flt(acc.get(f, 0.0), 2)

		data.append(row)

	# Filter zero-value rows unless show_zero_values is requested
	if not flt(filters.get("show_zero_values")):
		data = filter_zero_rows(data, parent_children_map)

	return data


def accumulate_into_parents(accounts, accounts_by_name):
	# Traverse bottom-up (reverse of top-down tree order)
	for acc in reversed(accounts):
		if acc.parent_account and acc.parent_account in accounts_by_name:
			parent = accounts_by_name[acc.parent_account]
			parent["opening_debit_usd"] += acc["opening_debit_usd"]
			parent["opening_credit_usd"] += acc["opening_credit_usd"]
			parent["period_debit_usd"] += acc["period_debit_usd"]
			parent["period_credit_usd"] += acc["period_credit_usd"]
			parent["closing_debit_usd"] += acc["closing_debit_usd"]
			parent["closing_credit_usd"] += acc["closing_credit_usd"]
			if not parent.get("cost_center") and acc.get("cost_center"):
				parent["cost_center"] = acc.get("cost_center")


def filter_zero_rows(data, parent_children_map):
	accounts_to_show = set()

	def get_all_parents(account_name):
		for parent, children in parent_children_map.items():
			for child in children:
				if child.name == account_name and parent:
					accounts_to_show.add(parent)
					get_all_parents(parent)

	for row in data:
		if row.get("has_value"):
			accounts_to_show.add(row.get("account"))
			get_all_parents(row.get("account"))

	return [row for row in data if row.get("account") in accounts_to_show]


def get_gl_amounts(filters):
	cost_center_condition = ""
	if filters.get("cost_center"):
		lft, rgt = frappe.db.get_value("Cost Center", filters.cost_center, ["lft", "rgt"]) or (None, None)
		if lft and rgt:
			filters.cost_center_lft = lft
			filters.cost_center_rgt = rgt
			cost_center_condition = """and cost_center in (
				select name from `tabCost Center`
				where lft >= %(cost_center_lft)s and rgt <= %(cost_center_rgt)s
			)"""
		else:
			cost_center_condition = "and cost_center = %(cost_center)s"

	rows = frappe.db.sql(
		f"""
		select
			account,
			max(cost_center) as cost_center,
			sum(case when posting_date < %(from_date)s then debit else 0 end) as opening_debit,
			sum(case when posting_date < %(from_date)s then credit else 0 end) as opening_credit,
			sum(case when posting_date between %(from_date)s and %(to_date)s then debit else 0 end) as period_debit,
			sum(case when posting_date between %(from_date)s and %(to_date)s then credit else 0 end) as period_credit
		from `tabGL Entry`
		where company = %(company)s
			and is_cancelled = 0
			and posting_date <= %(to_date)s
			{cost_center_condition}
		group by account
		""",
		filters,
		as_dict=True,
	)
	return {row.account: row for row in rows}
