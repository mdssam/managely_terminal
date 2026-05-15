import frappe
frappe.init(site="manu.com", sites_path="../../sites")
frappe.connect()

doc = frappe.new_doc("Sales Invoice")
doc.customer = frappe.db.get_value("Customer", {})
doc.pos_profile = frappe.db.get_value("POS Profile", {})
doc.is_pos = 0

doc.append("items", {
    "item_code": frappe.db.get_value("Item", {}),
    "qty": 1,
    "rate": 100
})

doc.set_missing_values()
print(f"After set_missing_values: {doc.is_pos}")
