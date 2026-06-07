import frappe
from frappe import _
from frappe.utils.password import get_decrypted_password


@frappe.whitelist(allow_guest=False)
def verify_employee_login(username: str, password: str) -> dict:
    """Verify an employee's POS credentials.

    The POS Password field is a Frappe Password type (stored encrypted),
    so we look up by username first, then decrypt and compare.
    """
    if not username or not password:
        return {"success": False, "error": _("Username and password are required.")}

    employee = frappe.db.get_value(
        "Employee",
        {"custom_pos_username": username, "status": "Active"},
        ["name", "employee_name"],
        as_dict=True,
    )

    if not employee:
        return {"success": False, "error": _("Invalid username or password.")}

    try:
        stored = get_decrypted_password("Employee", employee.name, "custom_pos_password", raise_exception=False)
    except Exception:
        stored = frappe.db.get_value("Employee", employee.name, "custom_pos_password")

    if stored != password:
        return {"success": False, "error": _("Invalid username or password.")}

    return {
        "success": True,
        "employee": employee.name,
        "employee_name": employee.employee_name,
    }


@frappe.whitelist(allow_guest=False)
def get_employee_pos_password(employee: str) -> str:
    if not employee:
        return ""

    if not frappe.has_permission("Employee", "read", employee):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    try:
        return get_decrypted_password("Employee", employee, "custom_pos_password", raise_exception=False) or ""
    except Exception:
        return frappe.db.get_value("Employee", employee, "custom_pos_password") or ""
