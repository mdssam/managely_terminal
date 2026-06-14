import frappe
from frappe import _
from frappe.utils.password import get_decrypted_password


def _lookup_employee(username: str):
    """Return employee dict for the given POS username, or None."""
    return frappe.db.get_value(
        "Employee",
        {"custom_pos_username": username, "status": "Active"},
        ["name", "employee_name"],
        as_dict=True,
    )


def _check_password(employee_name: str, password: str) -> bool:
    try:
        stored = get_decrypted_password("Employee", employee_name, "custom_pos_password", raise_exception=False)
    except Exception:
        stored = frappe.db.get_value("Employee", employee_name, "custom_pos_password")
    return stored == password


@frappe.whitelist(allow_guest=True)
def verify_employee_login(username: str, password: str) -> dict:
    """Verify an employee's POS credentials (does NOT create a Frappe session)."""
    if not username or not password:
        return {"success": False, "error": _("Username and password are required.")}

    employee = _lookup_employee(username)
    if not employee:
        return {"success": False, "error": _("Invalid username or password.")}

    if not _check_password(employee.name, password):
        return {"success": False, "error": _("Invalid username or password.")}

    return {
        "success": True,
        "employee": employee.name,
        "employee_name": employee.employee_name,
    }


@frappe.whitelist(allow_guest=True)
def employee_pos_login(username: str, password: str) -> dict:
    """Verify POS credentials AND create a Frappe web session.

    Looks up the employee's linked Frappe user (user_id field).
    Falls back to Administrator if no user is linked.
    """
    if not username or not password:
        return {"success": False, "error": _("Username and password are required.")}

    employee = _lookup_employee(username)
    if not employee:
        return {"success": False, "error": _("Invalid username or password.")}

    if not _check_password(employee.name, password):
        return {"success": False, "error": _("Invalid username or password.")}

    frappe_user = frappe.db.get_value("Employee", employee.name, "user_id") or "Administrator"

    # Create Frappe session as the linked user
    frappe.local.login_manager.login_as(frappe_user)

    # Ensure the session has a CSRF token
    if not frappe.local.session.data.get("csrf_token"):
        frappe.local.session.data.csrf_token = frappe.generate_hash(length=32)

    csrf_token = frappe.local.session.data.get("csrf_token")
    frappe.db.commit()

    return {
        "success": True,
        "employee": employee.name,
        "employee_name": employee.employee_name,
        "message": "Logged In",
        "csrf_token": csrf_token,
    }


@frappe.whitelist()
def get_pos_csrf_token() -> dict:
    """Return the CSRF token for the current session (GET-safe, no CSRF needed)."""
    return {"csrf_token": frappe.local.session.data.csrf_token}


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
