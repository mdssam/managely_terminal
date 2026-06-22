import frappe

def main():
    if frappe.db.exists("Custom Field", "POS Profile User-custom_role"):
        frappe.delete_doc("Custom Field", "POS Profile User-custom_role")
        frappe.db.commit()
        print("Deleted custom_role from POS Profile User")
    else:
        print("custom_role not found on POS Profile User")

main()
