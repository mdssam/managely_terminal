import frappe
from frappe.utils import flt


def execute():
	"""Reload Multi Currency Payment DocTypes and calculate unallocated_amount for historical records."""
	frappe.reload_doc("managely_terminal", "doctype", "multi_currency_payment")
	frappe.reload_doc("managely_terminal", "doctype", "multi_currency_payment_reference")
	frappe.reload_doc("managely_terminal", "doctype", "multi_currency_payment_line")

	if frappe.db.table_exists("Multi Currency Payment"):
		payments = frappe.db.get_all(
			"Multi Currency Payment",
			fields=["name", "total_payments", "total_references", "difference", "unallocated_amount"]
		)
		for p in payments:
			total_payments = flt(p.total_payments)
			ref_total = frappe.db.sql(
				"""SELECT SUM(allocated_amount) FROM `tabMulti Currency Payment Reference` WHERE parent=%s""",
				p.name
			)[0][0]

			if ref_total is not None:
				ref_total = flt(ref_total)
			else:
				ref_total = flt(p.total_references)

			diff = total_payments - ref_total
			unallocated = max(0.0, diff)

			frappe.db.set_value(
				"Multi Currency Payment",
				p.name,
				{
					"total_references": ref_total,
					"difference": diff,
					"unallocated_amount": unallocated,
				},
				update_modified=False
			)
