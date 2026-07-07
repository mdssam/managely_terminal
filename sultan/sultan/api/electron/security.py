import frappe
from frappe import _
import json
import datetime

@frappe.whitelist(allow_guest=True)
def log_security_incidents(incidents):
	"""
	Bulk log security incidents from the POS client.
	"""
	if isinstance(incidents, str):
		incidents = json.loads(incidents)

	if not incidents:
		return {"success": True, "logged": []}

	logged_names = []
	for inc in incidents:
		incident_id = inc.get("id")
		if not incident_id:
			continue
		
		# Check if already logged to prevent duplicates
		if frappe.db.exists("POS Security Incident", {"incident_id": incident_id}):
			continue
		
		# Parse timestamp into a datetime object
		dt = datetime.datetime.fromtimestamp(inc.get("timestamp") / 1000.0)
		
		doc = frappe.get_doc({
			"doctype": "POS Security Incident",
			"incident_id": incident_id,
			"timestamp": dt,
			"cashier": inc.get("cashier") or "Unknown",
			"incident_type": inc.get("type"),
			"details": inc.get("details"),
		})
		doc.insert(ignore_permissions=True)
		logged_names.append(doc.name)
		
	frappe.db.commit()
	return {"success": True, "logged": logged_names}
