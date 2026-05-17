import frappe

def run():
	# Custom Child DocType for Sales Invoices in POS Closing Entry
	if not frappe.db.exists("DocType", "Klik Sales Invoice Reference"):
		doc = frappe.get_doc({
			"doctype": "DocType",
			"name": "Klik Sales Invoice Reference",
			"module": "Sultan",
			"custom": 1,
			"istable": 1,
			"fields": [
				{
					"fieldname": "sales_invoice",
					"label": "Sales Invoice",
					"fieldtype": "Link",
					"options": "Sales Invoice",
					"in_list_view": 1,
					"reqd": 1
				},
				{
					"fieldname": "customer",
					"label": "Customer",
					"fieldtype": "Link",
					"options": "Customer",
					"in_list_view": 1
				},
				{
					"fieldname": "posting_date",
					"label": "Posting Date",
					"fieldtype": "Date",
					"in_list_view": 1
				},
				{
					"fieldname": "amount",
					"label": "Amount",
					"fieldtype": "Currency",
					"in_list_view": 1
				}
			]
		})
		doc.insert(ignore_permissions=True)
		print("Created Custom DocType Klik Sales Invoice Reference")
	else:
		print("Custom DocType Klik Sales Invoice Reference already exists.")

	# Fix POS Closing Entry custom field options to Klik Sales Invoice Reference
	field_name = "POS Closing Entry-custom_sales_invoice"
	if not frappe.db.exists("Custom Field", field_name):
		cf = frappe.new_doc("Custom Field")
		cf.dt = "POS Closing Entry"
		cf.fieldname = "custom_sales_invoice"
		cf.label = "Sales Invoice"
		cf.fieldtype = "Table"
		cf.options = "Klik Sales Invoice Reference"
		cf.insert(ignore_permissions=True)
		print("Created custom_sales_invoice custom field on POS Closing Entry.")
	else:
		cf = frappe.get_doc("Custom Field", field_name)
		if cf.options != "Klik Sales Invoice Reference":
			cf.options = "Klik Sales Invoice Reference"
			cf.save(ignore_permissions=True)
			print("Updated custom_sales_invoice options to Klik Sales Invoice Reference")

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

	# Custom field for POS Opening Entry in Sales Invoice
	invoice_field_name = "Sales Invoice-custom_pos_opening_entry"
	if not frappe.db.exists("Custom Field", invoice_field_name):
		doc = frappe.new_doc("Custom Field")
		doc.dt = "Sales Invoice"
		doc.fieldname = "custom_pos_opening_entry"
		doc.label = "POS Opening Entry"
		doc.fieldtype = "Link"
		doc.options = "POS Opening Entry"
		doc.insert(ignore_permissions=True)
		print("Created custom_pos_opening_entry field.")
	else:
		print("custom_pos_opening_entry field already exists.")

	frappe.clear_cache(doctype="POS Profile User")
	frappe.clear_cache(doctype="POS Profile")
	frappe.clear_cache(doctype="Sales Invoice")
	frappe.clear_cache(doctype="POS Closing Entry")
	frappe.db.commit()

