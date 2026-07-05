# Copyright (c) 2026, Beveren Sooftware Inc and contributors
# For license information, please see license.txt

import frappe


@frappe.whitelist()
def get_delivery_personnel_list():
	"""Get list of all delivery personnel."""
	try:
		if not frappe.db.exists("DocType", "Delivery Personnel"):
			return {"success": True, "data": []}
		personnel = frappe.get_all(
			"Delivery Personnel",
			fields=["name", "delivery_personnel"],
			order_by="delivery_personnel asc",
		)
		return {"success": True, "data": personnel}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error fetching delivery personnel")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def add_delivery_personnel(name, phone=None):
	try:
		if not name:
			return {"success": False, "error": "Name is required"}
		if frappe.db.exists("Delivery Personnel", name):
			return {"success": False, "error": f"Driver '{name}' already exists"}
		
		doc = frappe.get_doc({
			"doctype": "Delivery Personnel",
			"delivery_personnel": name,
			"phone": phone,
			"cell_number": phone
		})
		doc.insert(ignore_permissions=True)
		return {"success": True, "data": {"name": doc.name, "delivery_personnel": doc.delivery_personnel, "phone": phone}}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error adding delivery personnel")
		return {"success": False, "error": str(e)}
