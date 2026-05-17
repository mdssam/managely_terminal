import frappe

def run():
	# Custom field for Role
	role_name = "POS Profile User-custom_role"
	if not frappe.db.exists("Custom Field", role_name):
		doc = frappe.new_doc("Custom Field")
		doc.dt = "POS Profile User"
		doc.fieldname = "custom_role"
		doc.label = "Role"
		doc.fieldtype = "Select"
		doc.options = "\nCashier\nMenu User\nAdministrator"
		doc.insert(ignore_permissions=True)
		print("Created custom_role field.")
	else:
		print("custom_role field already exists.")

	# Custom field for Warehouse
	wh_name = "POS Profile User-custom_warehouse"
	if not frappe.db.exists("Custom Field", wh_name):
		doc = frappe.new_doc("Custom Field")
		doc.dt = "POS Profile User"
		doc.fieldname = "custom_warehouse"
		doc.label = "Warehouse"
		doc.fieldtype = "Link"
		doc.options = "Warehouse"
		doc.insert(ignore_permissions=True)
		print("Created custom_warehouse field.")
	else:
		print("custom_warehouse field already exists.")

	frappe.clear_cache(doctype="POS Profile User")
	frappe.clear_cache(doctype="POS Profile")
	frappe.db.commit()
