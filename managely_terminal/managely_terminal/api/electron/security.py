import frappe

@frappe.whitelist()
def log_security_incidents(incidents):
	"""
	Dummy handler for bulk logging security incidents from the POS client.
	Feature disabled.
	"""
	return {"success": True, "logged": []}
