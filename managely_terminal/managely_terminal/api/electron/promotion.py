# Copyright (c) 2026, Beveren Software Inc and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def create_promotion_request(item_code, item_name=None, pos_profile=None, employee_id=None, remarks=None):
    """Create a Promotion Request from the Electron POS terminal."""
    try:
        if not item_code:
            return {"success": False, "error": "Item code is required"}

        doc = frappe.get_doc({
            "doctype": "Promotion Request",
            "item_code": item_code,
            "item_name": item_name or frappe.db.get_value("Item", item_code, "item_name") or item_code,
            "pos_profile": pos_profile,
            "employee_id": employee_id,
            "remarks": remarks
        })
        doc.insert(ignore_permissions=True)
        frappe.db.commit()

        return {"success": True, "name": doc.name, "message": f"Promotion request created: {doc.name}"}
    except frappe.DuplicateEntryError:
        return {"success": True, "name": item_code, "message": "Promotion request already exists"}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Create Promotion Request Error")
        return {"success": False, "error": str(e)}
