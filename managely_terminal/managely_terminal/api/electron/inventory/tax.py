import frappe
from frappe import _

from managely_terminal.managely_terminal.utils import get_current_pos_profile


@frappe.whitelist()
def get_sales_tax_categories():
	"""
	H10 FIX: Return ALL tax rows per template, not just the first one.
	Previously used frappe.db.get_value which returns a single row, causing
	multi-slab templates (e.g. 5% VAT + 2% municipality) to be misreported
	as a single rate and the client applied wrong totals.
	"""
	try:
		tax_categories = frappe.get_all(
			"Sales Taxes and Charges Template",
			filters={"disabled": 0},
			fields=["name", "title"],
		)

		result = []
		for cat in tax_categories:
			# H10 FIX: Fetch ALL tax rows for this template
			tax_rows = frappe.get_all(
				"Sales Taxes and Charges",
				filters={"parent": cat.name},
				fields=["rate", "included_in_print_rate", "charge_type", "account_head", "description"],
				order_by="idx asc",
			)

			# Effective rate = sum of all rows (for display purposes)
			total_rate = sum(float(r.get("rate") or 0) for r in tax_rows)
			is_inclusive = bool(tax_rows[0].get("included_in_print_rate")) if tax_rows else False

			result.append(
				{
					"id": cat.name,
					"name": cat.title or cat.name,
					"rate": total_rate,
					"is_inclusive": is_inclusive,
					"type": "inclusive" if is_inclusive else "exclusive",
					# Full breakdown for multi-slab templates
					"tax_rows": [
						{
							"rate": float(r.get("rate") or 0),
							"included_in_print_rate": bool(r.get("included_in_print_rate")),
							"charge_type": r.get("charge_type"),
							"account_head": r.get("account_head"),
							"description": r.get("description"),
						}
						for r in tax_rows
					],
				}
			)

		default_template = None
		try:
			pos_doc = get_current_pos_profile()
			default_template = pos_doc.taxes_and_charges
		except Exception:
			pass

		return {"success": True, "data": result, "default": default_template}
	except Exception as e:
		frappe.log_error("Tax Fetch Failed", str(e))
		return {"success": False, "error": str(e)}


def get_default_sales_tax_charges():
	pos_doc = get_current_pos_profile()
	return pos_doc.taxes_and_charges
