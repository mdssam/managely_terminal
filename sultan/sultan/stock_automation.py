import frappe
from frappe import _


def create_delivery_note_from_sales_invoice(doc, method=None):
	if doc.doctype != "Sales Invoice" or doc.docstatus != 1 or doc.update_stock:
		return
	if not _has_stock_items(doc.items):
		return
	if _linked_submitted_doc_exists("Delivery Note Item", "against_sales_invoice", doc.name):
		return

	try:
		from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_delivery_note

		delivery_note = make_delivery_note(doc.name)
		if not delivery_note.get("items"):
			return
		delivery_note.flags.ignore_permissions = True
		delivery_note.insert(ignore_permissions=True)
		delivery_note.submit()
	except Exception:
		frappe.log_error(
			frappe.get_traceback(),
			_("Auto Delivery Note failed for Sales Invoice {0}").format(doc.name),
		)


def create_purchase_receipt_from_purchase_invoice(doc, method=None):
	if doc.doctype != "Purchase Invoice" or doc.docstatus != 1 or doc.update_stock:
		return
	if not _has_stock_items(doc.items):
		return
	if _linked_submitted_doc_exists("Purchase Receipt Item", "purchase_invoice", doc.name):
		return

	try:
		from erpnext.accounts.doctype.purchase_invoice.purchase_invoice import make_purchase_receipt

		purchase_receipt = make_purchase_receipt(doc.name)
		if not purchase_receipt.get("items"):
			return
		purchase_receipt.flags.ignore_permissions = True
		purchase_receipt.insert(ignore_permissions=True)
		purchase_receipt.submit()
	except Exception:
		frappe.log_error(
			frappe.get_traceback(),
			_("Auto Purchase Receipt failed for Purchase Invoice {0}").format(doc.name),
		)


def _has_stock_items(items):
	item_codes = {row.item_code for row in items if row.get("item_code")}
	if not item_codes:
		return False

	return bool(
		frappe.get_all(
			"Item",
			filters={"name": ["in", list(item_codes)], "is_stock_item": 1},
			limit=1,
		)
	)


def _linked_submitted_doc_exists(child_doctype, link_field, voucher_name):
	parent_field = "parent"
	parent_type_field = "parenttype"
	rows = frappe.get_all(
		child_doctype,
		filters={link_field: voucher_name, "docstatus": 1},
		fields=[parent_field, parent_type_field],
		limit=1,
	)
	return bool(rows)
