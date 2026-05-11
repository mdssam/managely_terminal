import frappe
from frappe import _

def main():
    frappe.init(site="manu.com")
    frappe.connect()
    try:
        ws = frappe.get_doc("Workspace", "Sultan POS")
        if not any(s.label == "Open Sultan POS" for s in ws.shortcuts):
            ws.append("shortcuts", {
                "label": "Open Sultan POS",
                "type": "URL",
                "url": "/sultan_spa",
                "icon": "rocket",
                "color": "Blue"
            })
            ws.save(ignore_permissions=True)
            frappe.db.commit()
            print("SUCCESS: Created 'Open Sultan POS' link in workspace.")
        else:
            print("INFO: Shortcut link already exists in workspace.")
    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        frappe.destroy()

if __name__ == "__main__":
    main()
