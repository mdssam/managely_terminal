import frappe

@frappe.whitelist()
def get_employee_pos_password(employee: str) -> str:
    from sultan.sultan.api.electron.employee_auth import get_employee_pos_password as fn
    return fn(employee)

@frappe.whitelist()
def get_branch_employees_hashes(pos_profile: str) -> dict:
    from sultan.sultan.api.electron.employee_auth import get_branch_employees_hashes as fn
    return fn(pos_profile)

@frappe.whitelist()
def get_branch_users_hashes() -> dict:
    from sultan.sultan.api.electron.employee_auth import get_branch_users_hashes as fn
    return fn()
