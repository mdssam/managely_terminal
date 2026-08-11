import frappe
from frappe import _
from frappe.model.naming import make_autoname


# ---------------------------------------------------------------
# autoname hooks — registered in hooks.py doc_events
# These must stay in api/pos_entry.py (not electron/) because
# hooks.py references this module path.
# ---------------------------------------------------------------

def autoname_pos_opening_entry(doc, method=None):
	if getattr(doc.flags, "pre_assigned_name", None):
		doc.name = doc.flags.pre_assigned_name
		return
	profile = doc.pos_profile or "DEFAULT"
	formatted_profile = profile.upper().replace(" ", "_").replace("-", "_")
	formatted_profile = "".join(c for c in formatted_profile if c.isalnum() or c == "_")
	prefix = f"OP-{formatted_profile}-.#####"
	doc.name = make_autoname(prefix)


def autoname_pos_closing_entry(doc, method=None):
	if getattr(doc.flags, "pre_assigned_name", None):
		doc.name = doc.flags.pre_assigned_name
		return
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
	if getattr(doc.flags, "pre_assigned_name", None):
		doc.name = doc.flags.pre_assigned_name
		return
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
	if getattr(doc.flags, "pre_assigned_name", None):
		doc.name = doc.flags.pre_assigned_name
		return
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
