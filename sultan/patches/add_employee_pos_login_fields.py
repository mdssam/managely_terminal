import frappe

from sultan.sultan.setup_fields import ensure_employee_pos_login_fields


def execute():
	ensure_employee_pos_login_fields()
	frappe.db.commit()
