import frappe
from frappe import _


@frappe.whitelist(allow_guest=False)
def verify_employee_login(username: str, password: str) -> dict:
    """Verify an employee's POS credentials.

    Returns {success, employee, employee_name} on success or {success, error} on failure.
    """
    if not username or not password:
        return {"success": False, "error": _("Username and password are required.")}

    employee = frappe.db.get_value(
        "Employee",
        {"custom_pos_username": username, "custom_pos_password": password, "status": "Active"},
        ["name", "employee_name"],
        as_dict=True,
    )

    if not employee:
        return {"success": False, "error": _("Invalid username or password.")}

    return {
        "success": True,
        "employee": employee.name,
        "employee_name": employee.employee_name,
    }
