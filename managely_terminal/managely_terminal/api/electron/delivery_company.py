# Copyright (c) 2026, Beveren Software Inc and contributors
# For license information, please see license.txt

import frappe


@frappe.whitelist()
def get_delivery_companies_list():
	"""Get list of all active delivery companies."""
	try:
		if not frappe.db.exists("DocType", "Delivery Company"):
			return {"success": True, "data": []}
		companies = frappe.get_all(
			"Delivery Company",
			fields=[
				"name", 
				"company_name", 
				"receivable_account", 
				"mode_of_payment", 
				"phone", 
				"disabled"
			],
			filters={"disabled": 0},
			order_by="company_name asc",
		)
		return {"success": True, "data": companies}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error fetching delivery companies")
		return {"success": False, "error": str(e)}
