# Copyright (c) 2026, Managely and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.utils import flt
from erpnext.manufacturing.doctype.bom_update_tool.bom_update_tool import enqueue_replace_bom


@frappe.whitelist()
def get_recipe_details(bom_name: str) -> dict:
	"""Fetch recipe items and all parent BOMs referencing this BOM as a sub-assembly."""
	if not bom_name or not frappe.db.exists("BOM", bom_name):
		frappe.throw(_("BOM {0} does not exist.").format(bom_name))

	bom = frappe.get_doc("BOM", bom_name)

	items = []
	for it in bom.items:
		items.append({
			"item_code": it.item_code,
			"item_name": it.item_name or frappe.db.get_value("Item", it.item_code, "item_name") or it.item_code,
			"qty": flt(it.qty),
			"uom": it.uom,
			"rate": flt(it.rate),
			"amount": flt(it.amount),
		})

	# Get parent BOMs using this BOM as a component
	parent_records = frappe.db.sql(
		"""
		SELECT DISTINCT
			bi.parent AS parent_bom,
			b.item AS finished_item,
			b.item_name AS finished_item_name
		FROM `tabBOM Item` bi
		JOIN `tabBOM` b ON b.name = bi.parent
		WHERE bi.bom_no = %s
		  AND bi.docstatus = 1
		  AND b.docstatus = 1
		ORDER BY b.item_name ASC
		""",
		(bom_name,),
		as_dict=True,
	)

	return {
		"bom_name": bom.name,
		"item": bom.item,
		"item_name": bom.item_name,
		"quantity": flt(bom.quantity, 1.0),
		"uom": bom.uom,
		"currency": bom.currency,
		"items": items,
		"parents": parent_records,
		"parent_count": len(parent_records),
	}


@frappe.whitelist()
def update_recipe_and_propagate(current_bom: str, items: str | list, new_quantity: float | None = None) -> dict:
	"""Creates a new BOM revision with updated items, deactivates the old BOM,

	and triggers ERPNext's official BOM Update Tool to replace it in all parent recipes.
	"""
	if isinstance(items, str):
		items = json.loads(items)

	if not current_bom or not frappe.db.exists("BOM", current_bom):
		frappe.throw(_("Please select a valid BOM."))

	old_bom = frappe.get_doc("BOM", current_bom)
	if old_bom.docstatus != 1:
		frappe.throw(_("BOM must be submitted before creating a revision."))

	if not items:
		frappe.throw(_("At least one ingredient or raw material is required."))

	# 1. Clone the submitted BOM
	new_bom = frappe.copy_doc(old_bom)
	new_bom.is_active = 1
	new_bom.is_default = 1
	if new_quantity and flt(new_quantity) > 0:
		new_bom.quantity = flt(new_quantity)

	# 2. Reset and populate updated items
	new_bom.items = []
	for it in items:
		qty = flt(it.get("qty", 0))
		if qty <= 0:
			continue
		item_code = it.get("item_code")
		if not item_code:
			continue

		rate = flt(it.get("rate", 0))
		uom = it.get("uom") or frappe.db.get_value("Item", item_code, "stock_uom")
		new_bom.append("items", {
			"item_code": item_code,
			"qty": qty,
			"uom": uom,
			"rate": rate,
			"stock_uom": uom,
		})

	if not new_bom.items:
		frappe.throw(_("Recipe must have at least one ingredient with a quantity greater than zero."))

	# 3. Insert and Submit the new BOM revision
	new_bom.insert()
	new_bom.submit()

	# 4. Deactivate old BOM from being default or active
	frappe.db.set_value("BOM", old_bom.name, {"is_default": 0, "is_active": 0})

	# 5. Query parent BOMs before propagation
	parent_records = frappe.db.sql(
		"""
		SELECT DISTINCT bi.parent AS parent_bom, b.item_name
		FROM `tabBOM Item` bi
		JOIN `tabBOM` b ON b.name = bi.parent
		WHERE bi.bom_no = %s
		  AND bi.docstatus = 1
		  AND b.docstatus = 1
		""",
		(old_bom.name,),
		as_dict=True,
	)
	parent_count = len(parent_records)

	# 6. Propagate replacement using ERPNext's official engine
	enqueue_replace_bom(boms={"current_bom": old_bom.name, "new_bom": new_bom.name})

	return {
		"status": "success",
		"new_bom": new_bom.name,
		"old_bom": old_bom.name,
		"parent_count": parent_count,
		"parents": parent_records,
		"message": _(
			"New BOM revision {0} created and submitted. "
			"Propagation queued across {1} parent recipe(s) in the background."
		).format(new_bom.name, parent_count),
	}
