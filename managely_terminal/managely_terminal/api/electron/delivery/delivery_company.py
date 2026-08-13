# Copyright (c) 2026, Beveren Software Inc and contributors
# For license information, please see license.txt

import frappe


@frappe.whitelist()
def get_delivery_companies_list():
	"""Get list of all active delivery companies."""
	try:
		if not frappe.db.exists("DocType", "Delivery Company"):
			return {"success": True, "data": []}
		
		cols = set(frappe.db.get_table_columns("Delivery Company"))
		
		wanted = ["name", "company_name", "mode_of_payment", "phone", "disabled"]
		fields = [f for f in wanted if f in cols or f == "name"]
		
		filters = {}
		if "disabled" in cols:
			filters["disabled"] = 0
			
		order_by = "company_name asc" if "company_name" in cols else "name asc"

		companies = frappe.get_all(
			"Delivery Company",
			fields=fields,
			filters=filters,
			order_by=order_by,
			ignore_permissions=True
		)
		
		for c in companies:
			if not c.get("company_name"):
				c["company_name"] = c.get("name")
				
		return {"success": True, "data": companies}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error fetching delivery companies")
		return {"success": False, "error": str(e)}
