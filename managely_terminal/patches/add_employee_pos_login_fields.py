import frappe

from managely_terminal.managely_terminal.setup_fields import ensure_employee_pos_login_fields


def execute():
	ensure_employee_pos_login_fields()
	frappe.db.commit()
