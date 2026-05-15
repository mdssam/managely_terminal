import frappe


def get_context(context):
    """
    Sultan POS shortcut page — immediately redirects to the SPA.
    The ERPNext desk shortcut (/app/sultan_pos) lands here first;
    we send the browser straight to the React SPA at /sultan_spa/.
    """
    frappe.local.flags.redirect_location = "/sultan_spa/"
    raise frappe.Redirect
