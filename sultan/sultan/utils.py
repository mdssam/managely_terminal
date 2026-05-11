import frappe
from frappe import _

_cached_pos_profiles = {}


def get_current_pos_opening_entry():
	user = frappe.session.user
	result = frappe.db.get_value(
		"POS Opening Entry",
		{"user": user, "docstatus": 1, "status": "Open"},
		"name",
		order_by="modified desc",
	)
	return result


def get_current_pos_profile():
	user = frappe.session.user
	current_opening_entry = get_current_pos_opening_entry()
	cache_key = f"{user}|{current_opening_entry or 'none'}"

	if cache_key in _cached_pos_profiles:
		pos_profile_name = _cached_pos_profiles[cache_key]
	else:
		if current_opening_entry:
			opening_doc = frappe.get_doc("POS Opening Entry", current_opening_entry)
			pos_profile_name = opening_doc.pos_profile
		else:
			pos_profile_name = frappe.db.get_value("POS Profile User", {"user": user}, "parent")
			if not pos_profile_name:
				frappe.throw(_("No POS Profile found for user {0}").format(user))
		_cached_pos_profiles[cache_key] = pos_profile_name

	return frappe.get_doc("POS Profile", pos_profile_name)


def clear_pos_profile_cache(user=None):
	global _cached_pos_profiles
	target = user or frappe.session.user
	keys = [k for k in list(_cached_pos_profiles.keys()) if k.startswith(f"{target}|")]
	for k in keys:
		del _cached_pos_profiles[k]


def get_user_default_company():
	user = frappe.session.user
	return frappe.defaults.get_user_default(user, "Company")
