# -*- coding: utf-8 -*-
import frappe

@frappe.whitelist()
def report_error(branch=None, payload_type=None, payload_id=None, error_message=None, client_timestamp=None):
    """Log an error reported from the POS client into Frappe Error Log."""
    try:
        title = f"POS Sync Error [{branch or 'Unknown Branch'} - {payload_type or 'General'}:{payload_id or '-'}]"
        frappe.log_error(title=title, message=error_message or "Unknown POS Error")
        return {"success": True}
    except Exception as e:
        frappe.logger().error(f"Failed to report POS error: {e}")
        return {"success": False, "error": str(e)}
