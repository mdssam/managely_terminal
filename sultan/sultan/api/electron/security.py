import frappe

@frappe.whitelist(allow_guest=True)
def log_security_incidents(incidents):
	"""
	Dummy handler for bulk logging security incidents from the POS client.
	Feature disabled.
	"""
	return {"success": True, "logged": []}
