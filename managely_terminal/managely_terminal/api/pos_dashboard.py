# Copyright (c) 2026, Managely and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _
from frappe.utils import flt, nowdate

@frappe.whitelist()
def get_pos_dashboard_data():
	pos_profiles = frappe.get_all("POS Profile", fields=["name", "custom_branch_name", "disabled"])
	branch_map = {}
	branch_names_set = set()
	for p in pos_profiles:
		if p.get("disabled"):
			continue
		b_name = str(p.custom_branch_name or p.name or "").strip()
		branch_map[p.name] = b_name
		branch_names_set.add(b_name)

	all_branches = sorted(list(branch_names_set))
	if not all_branches:
		all_branches = [_("No Active Branches")]

	terminals = frappe.cache().get_value("active_terminals") or {}
	online_branches = set()
	if isinstance(terminals, dict):
		for term_id, term_data in terminals.items():
			if not isinstance(term_data, dict):
				continue
			if frappe.cache().get_value(f"terminal_status:{term_id}") == "Online":
				pos_prof = term_data.get("pos_profile")
				b_name = branch_map.get(pos_prof) or str(term_data.get("branch_name") or pos_prof or "").strip()
				if b_name:
					online_branches.add(b_name)

	online_branches_count = len(online_branches)
	total_branches_count = len(branch_map)

	open_entries = frappe.get_all(
		"POS Opening Entry",
		filters={"docstatus": 1, "status": "Open"},
		fields=["name", "pos_profile"]
	)
	open_sessions_count = len(open_entries)
	branch_cash_grouped = {b: {} for b in all_branches}

	for entry in open_entries:
		b_name = branch_map.get(entry.pos_profile) or str(entry.pos_profile).strip()
		try:
			from managely_terminal.managely_terminal.doctype.pos_suspended_transaction.pos_suspended_transaction import get_session_reconciliation_data
			import re
			
			def get_clean_mop(mop_str):
				m = str(mop_str or "Unknown").strip()
				curr_match = re.search(r'\((.*?)\)', m)
				curr = f" ({curr_match.group(1).upper()})" if curr_match else ""
				m_lower = m.lower()
				if "cash" in m_lower or "كاش" in m_lower:
					base = "Cash"
				elif "bank" in m_lower or "بنك" in m_lower or "فيزا" in m_lower or "visa" in m_lower:
					base = "Bank"
				else:
					base = m if not curr_match else m.replace(f"({curr_match.group(1)})", "").strip()
				return f"{base}{curr}"

			rec_data = get_session_reconciliation_data(entry.name)
			expected_map = rec_data.get("expected", {})
			for mop, val in expected_map.items():
				mop_clean = get_clean_mop(mop)
				if not mop_clean.startswith("Cash"):
					continue
				if mop_clean not in branch_cash_grouped.get(b_name, {}):
					if b_name not in branch_cash_grouped: branch_cash_grouped[b_name] = {}
					branch_cash_grouped[b_name][mop_clean] = 0.0
				branch_cash_grouped[b_name][mop_clean] += flt(val)
		except Exception:
			pass

	today = nowdate()
	closed_entries_today = frappe.get_all(
		"POS Closing Entry",
		filters={"docstatus": 1, "posting_date": today},
		fields=["name", "pos_profile"]
	)
	
	import re
	def get_clean_mop(mop_str):
		m = str(mop_str or "Unknown").strip()
		curr_match = re.search(r'\((.*?)\)', m)
		curr = f" ({curr_match.group(1).upper()})" if curr_match else ""
		m_lower = m.lower()
		if "cash" in m_lower or "كاش" in m_lower:
			base = "Cash"
		elif "bank" in m_lower or "بنك" in m_lower or "فيزا" in m_lower or "visa" in m_lower:
			base = "Bank"
		else:
			base = m if not curr_match else m.replace(f"({curr_match.group(1)})", "").strip()
		return f"{base}{curr}"

	for c_entry in closed_entries_today:
		b_name = branch_map.get(c_entry.pos_profile) or str(c_entry.pos_profile).strip()
		details = frappe.get_all(
			"POS Closing Entry Detail",
			filters={"parent": c_entry.name},
			fields=["mode_of_payment", "closing_amount"]
		)
		for d in details:
			mop_clean = get_clean_mop(d.mode_of_payment)
			if not mop_clean.startswith("Cash"):
				continue
			if mop_clean not in branch_cash_grouped.get(b_name, {}):
				if b_name not in branch_cash_grouped: branch_cash_grouped[b_name] = {}
				branch_cash_grouped[b_name][mop_clean] = 0.0
			branch_cash_grouped[b_name][mop_clean] += flt(d.closing_amount)

	cash_breakdown = {}
	for b, mops in branch_cash_grouped.items():
		if mops:
			filtered_mops = [{"mode": m, "amount": flt(v, 2)} for m, v in mops.items() if flt(v, 2) > 0]
			if filtered_mops:
				cash_breakdown[b] = filtered_mops

	branch_sales = {b: 0.0 for b in all_branches}
	invoices = frappe.db.sql("""
		SELECT pos_profile, SUM(grand_total) as total_sales
		FROM `tabPOS Invoice`
		WHERE docstatus = 1 AND posting_date = %s
		GROUP BY pos_profile
	""", (today,), as_dict=True)

	for inv in invoices:
		b_name = branch_map.get(inv.pos_profile) or str(inv.pos_profile).strip()
		if b_name in branch_sales:
			branch_sales[b_name] += flt(inv.total_sales)

	sales_values = [flt(branch_sales.get(b, 0.0), 2) for b in all_branches]

	# Get Top 5 selling items today globally
	top_items = frappe.db.sql("""
		SELECT item_code, item_name, SUM(qty) as total_qty, SUM(base_amount) as total_amount
		FROM (
			SELECT i.item_code, i.item_name, i.qty, i.base_amount
			FROM `tabPOS Invoice Item` i
			JOIN `tabPOS Invoice` p ON i.parent = p.name
			WHERE p.docstatus = 1 AND p.posting_date = %s
			
			UNION ALL
			
			SELECT i.item_code, i.item_name, i.qty, i.base_amount
			FROM `tabSales Invoice Item` i
			JOIN `tabSales Invoice` p ON i.parent = p.name
			WHERE p.docstatus = 1 AND p.is_pos = 1 AND p.posting_date = %s
		) as combined
		GROUP BY item_code
		ORDER BY total_qty DESC
		LIMIT 5
	""", (today, today), as_dict=True)

	if not top_items:
		top_items = frappe.db.sql("""
			SELECT item_code, item_name, SUM(qty) as total_qty, SUM(base_amount) as total_amount
			FROM (
				SELECT i.item_code, i.item_name, i.qty, i.base_amount
				FROM `tabPOS Invoice Item` i
				JOIN `tabPOS Invoice` p ON i.parent = p.name
				WHERE p.docstatus = 1
				
				UNION ALL
				
				SELECT i.item_code, i.item_name, i.qty, i.base_amount
				FROM `tabSales Invoice Item` i
				JOIN `tabSales Invoice` p ON i.parent = p.name
				WHERE p.docstatus = 1 AND p.is_pos = 1
			) as all_items
			GROUP BY item_code
			ORDER BY total_qty DESC
			LIMIT 5
		""", as_dict=True)

	formatted_top_items = []
	for idx, row in enumerate(top_items):
		formatted_top_items.append({
			"item_code": row.get("item_code"),
			"item_name": row.get("item_name"),
			"total_qty": flt(row.get("total_qty"), 2),
			"total_amount": flt(row.get("total_amount"), 2)
		})

	# Uncollected Delivery Company Orders
	uncollected_rows = frappe.db.sql("""
		SELECT custom_delivery_company, COUNT(name) as total_orders, SUM(grand_total) as total_amount
		FROM `tabPOS Invoice`
		WHERE docstatus < 2
		  AND (custom_driver_settled IS NULL OR custom_driver_settled = 0)
		  AND custom_delivery_company IS NOT NULL AND custom_delivery_company != ''
		GROUP BY custom_delivery_company
	""", as_dict=True)

	total_uncollected_count = sum(r.get("total_orders", 0) for r in uncollected_rows)
	total_uncollected_amount = sum(flt(r.get("total_amount", 0.0)) for r in uncollected_rows)

	uncollected_companies = []
	for r in uncollected_rows:
		uncollected_companies.append({
			"company": r.get("custom_delivery_company"),
			"count": r.get("total_orders", 0),
			"amount": flt(r.get("total_amount", 0.0), 2)
		})

	return {
		"online_branches_count": online_branches_count,
		"total_branches_count": total_branches_count,
		"open_sessions_count": open_sessions_count,
		"cash_breakdown": cash_breakdown,
		"daily_sales_chart": {
			"labels": all_branches,
			"datasets": [{"name": _("Daily Sales"), "values": sales_values}]
		},
		"top_items": formatted_top_items,
		"uncollected_delivery": {
			"count": total_uncollected_count,
			"amount": total_uncollected_amount,
			"companies": uncollected_companies
		}
	}

@frappe.whitelist()
def get_filtered_top_items(date_filter="Today"):
	from frappe.utils import nowdate, get_first_day_of_week, get_first_day, flt
	today = nowdate()
	start_date = today
	end_date = today

	if date_filter == "This Week":
		start_date = get_first_day_of_week(today)
	elif date_filter == "This Month":
		start_date = get_first_day(today)
	elif date_filter == "This Year":
		start_date = f"{today[:4]}-01-01"
	elif date_filter == "Last Year":
		last_year = str(int(today[:4]) - 1)
		start_date = f"{last_year}-01-01"
		end_date = f"{last_year}-12-31"
	elif date_filter == "All Time":
		start_date = None
		end_date = None

	if start_date and end_date:
		date_condition = "AND p.posting_date BETWEEN %s AND %s"
		params = (start_date, end_date)
	else:
		date_condition = ""
		params = ()

	query = f"""
		SELECT item_code, item_name, SUM(qty) as total_qty, SUM(base_amount) as total_amount
		FROM (
			SELECT i.item_code, i.item_name, i.qty, i.base_amount
			FROM `tabPOS Invoice Item` i
			JOIN `tabPOS Invoice` p ON i.parent = p.name
			WHERE p.docstatus = 1 {date_condition}
			
			UNION ALL
			
			SELECT i.item_code, i.item_name, i.qty, i.base_amount
			FROM `tabSales Invoice Item` i
			JOIN `tabSales Invoice` p ON i.parent = p.name
			WHERE p.docstatus = 1 AND p.is_pos = 1 {date_condition}
		) as combined
		GROUP BY item_code
		ORDER BY total_qty DESC
		LIMIT 5
	"""
	
	top_items = frappe.db.sql(query, params + params, as_dict=True)

	formatted_top_items = []
	for row in top_items:
		formatted_top_items.append({
			"item_code": row.get("item_code"),
			"item_name": row.get("item_name"),
			"total_qty": flt(row.get("total_qty"), 2),
			"total_amount": flt(row.get("total_amount"), 2)
		})
	return formatted_top_items
