# Copyright (c) 2026, Managely and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _
from frappe.utils import flt, nowdate
from frappe.utils.dashboard import cache_source

@frappe.whitelist()
@cache_source
def get(
	chart_name=None,
	chart=None,
	no_cache=None,
	filters=None,
	from_date=None,
	to_date=None,
	timespan=None,
	time_interval=None,
	heatmap_year=None,
):
	open_entries = frappe.get_all(
		"POS Opening Entry",
		filters={"docstatus": 1, "status": "Open"},
		fields=["name", "pos_profile", "status", "docstatus"]
	)
	if not open_entries:
		open_entries = frappe.get_all(
			"POS Opening Entry",
			filters={"docstatus": 1, "posting_date": nowdate()},
			fields=["name", "pos_profile", "status", "docstatus", "pos_closing_entry"]
		)

	branch_map = {}
	for p in frappe.get_all("POS Profile", fields=["name", "custom_branch_name"]):
		clean_name = str(p.custom_branch_name or p.name or "").strip()
		branch_map[p.name] = clean_name

	all_mops = set()
	branch_totals = {}

	for entry in open_entries:
		b_name = branch_map.get(entry.pos_profile) or str(entry.pos_profile).strip()
		if b_name not in branch_totals:
			branch_totals[b_name] = {}

		if entry.status == "Closed" and entry.get("pos_closing_entry"):
			details = frappe.get_all(
				"POS Closing Entry Detail",
				filters={"parent": entry.pos_closing_entry},
				fields=["mode_of_payment", "closing_amount"]
			)
			for d in details:
				mop = str(d.mode_of_payment or "").strip()
				if not mop:
					continue
				all_mops.add(mop)
				branch_totals[b_name][mop] = branch_totals[b_name].get(mop, 0.0) + flt(d.closing_amount)
		else:
			try:
				from managely_terminal.managely_terminal.doctype.pos_suspended_transaction.pos_suspended_transaction import get_session_reconciliation_data
				rec_data = get_session_reconciliation_data(entry.name)
				expected_map = rec_data.get("expected", {})
				for mop, val in expected_map.items():
					mop_str = str(mop or "").strip()
					if not mop_str:
						continue
					all_mops.add(mop_str)
					branch_totals[b_name][mop_str] = branch_totals[b_name].get(mop_str, 0.0) + flt(val)
			except Exception:
				pass

	labels = sorted(list(branch_totals.keys()))
	if not labels:
		fallback_branches = frappe.get_all("POS Profile", fields=["name", "custom_branch_name"], limit=5)
		labels = [str(b.custom_branch_name or b.name).strip() for b in fallback_branches]
		if not labels:
			labels = [_("No Active Branches")]
		return {
			"labels": labels,
			"datasets": [{"name": _("Cash"), "values": [0.0] * len(labels)}],
			"type": "bar"
		}

	sorted_mops = sorted(list(all_mops))
	datasets = []
	for mop in sorted_mops:
		values = [flt(branch_totals[branch].get(mop, 0.0)) for branch in labels]
		datasets.append({"name": _(mop), "values": values})

	return {
		"labels": labels,
		"datasets": datasets,
		"type": "bar"
	}
