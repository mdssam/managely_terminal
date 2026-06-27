import frappe
from frappe import _
from frappe.utils.password import get_decrypted_password


def _lookup_employee(username: str):
    """Return employee dict for the given POS username, or None."""
    employee = frappe.db.get_value(
        "Employee",
        {"custom_pos_username": username, "status": "Active"},
        ["name", "employee_name", "custom_pos_role", "custom_allow_returns"],
        as_dict=True,
    )
    if employee:
        profiles = frappe.get_all(
            "Allowed POS Profile",
            filters={"parent": employee.name, "parenttype": "Employee"},
            fields=["pos_profile"],
        )
        employee["custom_allowed_pos_profiles"] = [p.pos_profile for p in profiles if p.pos_profile]
    return employee


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
        "pos_role": employee.custom_pos_role or "Cashier",
        "allowed_pos_profiles": employee.get("custom_allowed_pos_profiles") or [],
        "custom_allow_returns": employee.get("custom_allow_returns") or 0,
    }


@frappe.whitelist(allow_guest=True)
def employee_pos_login(username: str, password: str) -> dict:
    """Verify POS credentials for the employee.

    Keeps the active browser session user. Throws an error if the session has expired (Guest).
    """
    if not username or not password:
        return {"success": False, "error": _("Username and password are required.")}

    employee = _lookup_employee(username)
    if not employee:
        return {"success": False, "error": _("Invalid username or password.")}

    if not _check_password(employee.name, password):
        return {"success": False, "error": _("Invalid username or password.")}

    current_user = frappe.session.user
    if current_user == "Guest":
        frappe.throw(_("Your session has expired. Please log in to your branch account again."), frappe.PermissionError)

    # Ensure the session has a CSRF token
    if not frappe.local.session.data.get("csrf_token"):
        frappe.local.session.data.csrf_token = frappe.generate_hash(length=32)

    csrf_token = frappe.local.session.data.get("csrf_token")
    frappe.db.commit()

    return {
        "success": True,
        "employee": employee.name,
        "employee_name": employee.employee_name,
        "pos_role": employee.custom_pos_role or "Cashier",
        "allowed_pos_profiles": employee.get("custom_allowed_pos_profiles") or [],
        "custom_allow_returns": employee.get("custom_allow_returns") or 0,
        "message": "Logged In",
        "csrf_token": csrf_token,
    }


@frappe.whitelist(allow_guest=True)
def get_pos_csrf_token() -> dict:
    """Return (or generate) the CSRF token for the current session.

    allow_guest=True so the SPA can fetch a valid token before any login
    attempt — prevents 400 errors caused by stale session cookies.
    """
    try:
        token = frappe.local.session.data.get("csrf_token")
        if not token:
            token = frappe.generate_hash(length=32)
            frappe.local.session.data.csrf_token = token
            frappe.local.session.save()
    except Exception:
        token = ""
    return {"csrf_token": token}


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


@frappe.whitelist(allow_guest=False)
def get_branch_employees_hashes(pos_profile: str) -> dict:
    if not pos_profile:
        return {"success": False, "error": _("POS Profile is required.")}

    # Find active employees
    employees = frappe.get_all(
        "Employee",
        filters={"status": "Active"},
        fields=["name", "employee_name", "custom_pos_username", "custom_pos_role", "user_id", "custom_allow_returns"]
    )

    data = []
    import hashlib

    for emp in employees:
        allowed_profiles = [d.pos_profile for d in frappe.get_all(
            "Allowed POS Profile",
            filters={"parent": emp.name, "parenttype": "Employee"},
            fields=["pos_profile"]
        )]

        if not allowed_profiles or pos_profile in allowed_profiles:
            try:
                password = get_decrypted_password("Employee", emp.name, "custom_pos_password", raise_exception=False) or ""
            except Exception:
                password = frappe.db.get_value("Employee", emp.name, "custom_pos_password") or ""

            if password and emp.custom_pos_username:
                salt = emp.name
                salted_pass = password + salt
                p_hash = hashlib.sha256(salted_pass.encode('utf-8')).hexdigest()

                data.append({
                    "employee": emp.name,
                    "employee_name": emp.employee_name,
                    "username": emp.custom_pos_username,
                    "role": emp.custom_pos_role or "Cashier",
                    "hash": p_hash,
                    "allowed_pos_profiles": allowed_profiles,
                    "user": emp.user_id,
                    "custom_allow_returns": emp.custom_allow_returns
                })

    return {"success": True, "data": data}
