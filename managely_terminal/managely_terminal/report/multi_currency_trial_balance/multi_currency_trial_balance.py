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
		filters.exchange_rate = 89500.0
	else:
		filters.exchange_rate = flt(filters.exchange_rate)


def get_columns():
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
			"label": _("Opening Debit USD"),
			"fieldname": "opening_debit_usd",
			"fieldtype": "Currency",
			"options": "USD",
			"width": 140,
		},
		{
			"label": _("Opening Credit USD"),
			"fieldname": "opening_credit_usd",
			"fieldtype": "Currency",
			"options": "USD",
			"width": 140,
		},
		{
			"label": _("Opening Debit LBP"),
			"fieldname": "opening_debit_lbp",
			"fieldtype": "Currency",
			"options": "LBP",
			"width": 140,
		},
		{
			"label": _("Opening Credit LBP"),
			"fieldname": "opening_credit_lbp",
			"fieldtype": "Currency",
			"options": "LBP",
			"width": 140,
		},
		{
			"label": _("Period Debit USD"),
			"fieldname": "period_debit_usd",
			"fieldtype": "Currency",
			"options": "USD",
			"width": 140,
		},
		{
			"label": _("Period Credit USD"),
			"fieldname": "period_credit_usd",
			"fieldtype": "Currency",
			"options": "USD",
			"width": 140,
		},
		{
			"label": _("Period Debit LBP"),
			"fieldname": "period_debit_lbp",
			"fieldtype": "Currency",
			"options": "LBP",
			"width": 140,
		},
		{
			"label": _("Period Credit LBP"),
			"fieldname": "period_credit_lbp",
			"fieldtype": "Currency",
			"options": "LBP",
			"width": 140,
		},
		{
			"label": _("Closing Debit USD"),
			"fieldname": "closing_debit_usd",
			"fieldtype": "Currency",
			"options": "USD",
			"width": 140,
		},
		{
			"label": _("Closing Credit USD"),
			"fieldname": "closing_credit_usd",
			"fieldtype": "Currency",
			"options": "USD",
			"width": 140,
		},
		{
			"label": _("Closing Debit LBP"),
			"fieldname": "closing_debit_lbp",
			"fieldtype": "Currency",
			"options": "LBP",
			"width": 140,
		},
		{
			"label": _("Closing Credit LBP"),
			"fieldname": "closing_credit_lbp",
			"fieldtype": "Currency",
			"options": "LBP",
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
	rate = flt(filters.exchange_rate) or 89500.0

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

	# Compute LBP values from accumulated USD values
	for acc in ordered_accounts:
		acc["opening_debit_lbp"] = flt(acc["opening_debit_usd"] * rate, 0)
		acc["opening_credit_lbp"] = flt(acc["opening_credit_usd"] * rate, 0)
		acc["period_debit_lbp"] = flt(acc["period_debit_usd"] * rate, 0)
		acc["period_credit_lbp"] = flt(acc["period_credit_usd"] * rate, 0)
		acc["closing_debit_lbp"] = flt(acc["closing_debit_usd"] * rate, 0)
		acc["closing_credit_lbp"] = flt(acc["closing_credit_usd"] * rate, 0)

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
