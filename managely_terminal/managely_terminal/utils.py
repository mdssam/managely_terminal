import frappe
from frappe import _

_cached_pos_profiles = {}
_cached_company_data = {}


def get_current_pos_profile():
	"""Get the active POS Profile with identity-only caching keyed by user and opening entry."""
	user = frappe.session.user
	from managely_terminal.managely_terminal.api.erpnext_sales_invoice import get_current_pos_opening_entry
	current_opening_entry = get_current_pos_opening_entry()
	cache_key = f"{user}|{current_opening_entry or 'none'}"

	if cache_key in _cached_pos_profiles:
		pos_profile_name = _cached_pos_profiles[cache_key]
	else:
		if current_opening_entry:
			opening_doc = frappe.get_doc("POS Opening Entry", current_opening_entry)
			pos_profile_name = opening_doc.pos_profile
		else:
			pos_profile_name = frappe.get_value("POS Profile User", {"user": user}, "parent")
			if not pos_profile_name:
				pos_profile_name = frappe.get_value(
					"User Permission",
					{"user": user, "allow": "POS Profile"},
					"for_value",
				)
			if not pos_profile_name:
				frappe.throw(_("No POS Profile found for user {0}").format(user))
		_cached_pos_profiles[cache_key] = pos_profile_name

	pos_profile_doc = frappe.get_doc("POS Profile", pos_profile_name)
	custom_warehouse = frappe.db.get_value(
		"POS Profile User",
		{"parent": pos_profile_name, "user": user},
		"custom_warehouse"
	)
	if custom_warehouse:
		pos_profile_doc.warehouse = custom_warehouse
	return pos_profile_doc


def clear_pos_profile_cache(user=None):
	"""Clear cached POS Profile identities."""
	global _cached_pos_profiles
	if user:
		keys_to_delete = [k for k in list(_cached_pos_profiles.keys()) if k.startswith(f"{user}|")]
		for k in keys_to_delete:
			del _cached_pos_profiles[k]
		if keys_to_delete:
			frappe.logger().info(
				f"POS Profile cache cleared for user: {user} ({len(keys_to_delete)} entries)"
			)
	else:
		current_user = frappe.session.user
		keys_to_delete = [k for k in list(_cached_pos_profiles.keys()) if k.startswith(f"{current_user}|")]
		for k in keys_to_delete:
			del _cached_pos_profiles[k]


def get_user_default_company():
	user = frappe.session.user
	return frappe.defaults.get_user_default(user, "Company")


def get_user_pos_profile_name(user: str):
	"""Return the POS Profile name assigned to a user (User Permission first, then Applicable Users)."""
	profile = frappe.db.get_value(
		"User Permission",
		{"user": user, "allow": "POS Profile"},
		"for_value",
	)
	if not profile:
		profile = frappe.db.get_value("POS Profile User", {"user": user}, "parent")
	return profile





def get_pos_opening_entry_dashboard(data=None):
	if not data:
		data = {}
	data.setdefault("non_standard_fieldnames", {})
	data["non_standard_fieldnames"]["POS Suspended Transaction"] = "pos_session"
	transactions = data.setdefault("transactions", [])
	for group in transactions:
		if group.get("label") == "Transactions":
			if "POS Suspended Transaction" not in group["items"]:
				group["items"].append("POS Suspended Transaction")
			return data
	transactions.append({"label": "Transactions", "items": ["POS Suspended Transaction"]})
	return data


def get_pos_closing_entry_dashboard(data=None):
	if not data:
		data = {}
	data.setdefault("non_standard_fieldnames", {})
	data["non_standard_fieldnames"]["POS Suspended Transaction"] = "pos_closing_entry"
	transactions = data.setdefault("transactions", [])
	for group in transactions:
		if group.get("label") == "Transactions":
			if "POS Suspended Transaction" not in group["items"]:
				group["items"].append("POS Suspended Transaction")
			return data
	transactions.append({"label": "Transactions", "items": ["POS Suspended Transaction"]})
	return data

def get_pos_invoice_dashboard(data=None):
	if not data:
		data = {}
	data.setdefault("non_standard_fieldnames", {})
	data["non_standard_fieldnames"]["POS Invoice"] = "customer"
	
	transactions = data.setdefault("transactions", [])
	transactions.append({
		"label": "Invoices",
		"items": ["POS Invoice"]
	})
	
	data.setdefault("internal_links", {})
	data["internal_links"]["Customer"] = ["customer"]
	
	return data


def extend_bootinfo(bootinfo):
	"""Inject report printing and auto-fit stylesheet into bootinfo.print_css."""
	import os

	css_content = ""
	try:
		css_path = os.path.join(
			frappe.get_app_path("managely_terminal"),
			"public",
			"css",
			"report_print_fix.css",
		)
		if os.path.exists(css_path):
			with open(css_path, "r", encoding="utf-8") as f:
				css_content = f.read()
	except Exception:
		pass

	if not css_content:
		css_content = """
@media screen {
    .print-format-gutter { padding: 15px 10px !important; background-color: #d1d8dd !important; overflow-x: auto !important; }
    .print-format-gutter .print-format { max-width: 98% !important; width: fit-content !important; min-width: 8.3in !important; padding: 0.25in !important; margin: 0 auto !important; }
    .print-format-gutter .print-format.landscape { min-width: 11.69in !important; }
}
@media print {
    @page { size: A4 landscape !important; margin: 5mm !important; }
    html, body { width: 100% !important; margin: 0 !important; padding: 0 !important; }
    .print-format-gutter { background: transparent !important; padding: 0 !important; margin: 0 !important; }
    .print-format-gutter .print-format { width: 100% !important; max-width: 100% !important; min-width: 100% !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
}
.print-format-gutter .print-format table { width: 100% !important; max-width: 100% !important; table-layout: auto !important; border-collapse: collapse !important; }
.print-format-gutter .print-format table th { min-width: 0 !important; width: auto !important; white-space: normal !important; word-break: break-word !important; overflow-wrap: anywhere !important; font-size: 8pt !important; padding: 3px 2px !important; line-height: 1.2 !important; vertical-align: middle !important; }
.print-format-gutter .print-format table td { white-space: normal !important; word-break: break-word !important; overflow-wrap: anywhere !important; font-size: 7.5pt !important; padding: 2px 2px !important; line-height: 1.2 !important; vertical-align: middle !important; }
.print-format-gutter .print-format table tr[style*="height: 30px"], .print-format-gutter .print-format table tr { height: auto !important; }
"""

	if "print_css" in bootinfo and bootinfo["print_css"]:
		bootinfo["print_css"] = bootinfo["print_css"] + "\n" + css_content
	else:
		bootinfo["print_css"] = css_content

