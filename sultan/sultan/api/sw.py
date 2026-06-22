import frappe
import os

@frappe.whitelist(allow_guest=True)
def get_service_worker():
    path = frappe.get_app_path("sultan", "public", "sultan_spa", "sw.js")
    try:
        with open(path, "r") as f:
            js = f.read()
    except Exception:
        js = ""
    
    frappe.local.response.mimetype = "application/javascript"
    frappe.local.response.headers = frappe.local.response.headers or {}
    frappe.local.response.headers["Service-Worker-Allowed"] = "/sultan_spa/"
    frappe.local.response.filecontent = js
    frappe.local.response.type = "download"
    frappe.local.response.display_content_as = "inline"
    frappe.local.response.filename = "sw.js"

def add_sw_header(response, request=None):
    if frappe.local.request and "get_service_worker" in frappe.local.request.path:
        response.headers["Service-Worker-Allowed"] = "/sultan_spa/"
    return response
