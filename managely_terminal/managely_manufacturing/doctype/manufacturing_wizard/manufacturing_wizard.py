# Copyright (c) 2026, Managely and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, nowdate, getdate

class ManufacturingWizard(Document):
	def validate(self):
		self.calculate_costs()

	def calculate_costs(self):
		raw_material_cost = 0.0
		for item in self.items:
			if not item.amount and item.qty and item.rate:
				item.amount = flt(item.qty) * flt(item.rate)
			raw_material_cost += flt(item.amount)

		scrap_cost = 0.0
		for scrap in self.scrap_items:
			if not scrap.amount and scrap.stock_qty and scrap.rate:
				scrap.amount = flt(scrap.stock_qty) * flt(scrap.rate)
			scrap_cost += flt(scrap.amount)

		operating_cost = 0.0
		for op in self.operations:
			if not op.operating_cost and op.time_in_mins and op.hour_rate:
				op.operating_cost = (flt(op.time_in_mins) / 60.0) * flt(op.hour_rate)
			operating_cost += flt(op.operating_cost)

		self.raw_material_cost = raw_material_cost
		self.scrap_deduction_cost = scrap_cost
		self.operating_cost = operating_cost

		total = raw_material_cost + operating_cost - scrap_cost
		self.total_cost = total if total > 0 else 0.0
		if flt(self.qty) > 0:
			self.unit_cost = flt(self.total_cost) / flt(self.qty)
		else:
			self.unit_cost = 0.0

@frappe.whitelist()
def execute_create(doc):
	if isinstance(doc, str):
		doc = json.loads(doc)
	
	company = doc.get("company")
	production_item = doc.get("production_item")
	qty = flt(doc.get("qty", 1.0))
	currency = doc.get("currency")
	if not currency and company:
		currency = frappe.get_cached_value("Company", company, "default_currency")
	if not currency:
		currency = frappe.db.get_default("currency") or frappe.db.get_single_value("System Settings", "default_currency")
	if not currency:
		frappe.throw(_("Please configure default currency in Company or System Settings."))
	items = doc.get("items", [])
	operations = doc.get("operations", [])
	scrap_items = doc.get("scrap_items", [])
	with_quality = doc.get("with_quality_inspection")
	inspection_template = doc.get("quality_inspection_template")

	if not production_item:
		frappe.throw(_("Please specify the Finished Item before launching."))
	if not items:
		frappe.throw(_("At least one Raw Material item is required."))

	bom = frappe.new_doc("BOM")
	bom.item = production_item
	bom.quantity = qty
	bom.uom = uom
	bom.company = company
	bom.currency = currency
	bom.is_active = 1
	bom.is_default = 1
	bom.with_operations = 1 if len(operations) > 0 else 0

	if inspection_template:
		bom.quality_inspection_template = inspection_template

	for raw in items:
		bom.append("items", {
			"item_code": raw.get("item_code"),
			"qty": flt(raw.get("qty")),
			"uom": raw.get("uom"),
			"rate": flt(raw.get("rate")),
			"stock_uom": raw.get("uom")
		})

	for scrap in scrap_items:
		bom.append("scrap_items", {
			"item_code": scrap.get("item_code"),
			"stock_qty": flt(scrap.get("stock_qty")),
			"stock_uom": scrap.get("stock_uom"),
			"rate": flt(scrap.get("rate"))
		})

	for op in operations:
		bom.append("operations", {
			"operation": op.get("operation"),
			"workstation": op.get("workstation"),
			"time_in_mins": flt(op.get("time_in_mins", 10)),
			"hour_rate": flt(op.get("hour_rate")),
			"operating_cost": flt(op.get("operating_cost"))
		})

	bom.insert()
	bom.submit()

	wip_warehouse = frappe.db.get_value("Manufacturing Settings", None, "default_wip_warehouse")
	fg_warehouse = frappe.db.get_value("Manufacturing Settings", None, "default_fg_warehouse")

	if not wip_warehouse:
		wip_warehouse = frappe.db.get_value("Warehouse", {"company": company, "name": ["like", "%Work In Progress%"]}, "name")
	if not wip_warehouse:
		wip_warehouse = frappe.db.get_value("Warehouse", {"company": company, "warehouse_type": "Work In Progress"}, "name")
	if not wip_warehouse:
		wip_warehouse = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")

	if not fg_warehouse:
		fg_warehouse = frappe.db.get_value("Warehouse", {"company": company, "name": ["like", "%Finished Goods%"]}, "name")
	if not fg_warehouse:
		fg_warehouse = frappe.db.get_value("Warehouse", {"company": company, "warehouse_type": "Finished Goods"}, "name")
	if not fg_warehouse:
		fg_warehouse = frappe.db.get_value("Item Default", {"parent": production_item, "company": company}, "default_warehouse")
	if not fg_warehouse:
		fg_warehouse = wip_warehouse

	work_order = frappe.new_doc("Work Order")
	work_order.production_item = production_item
	work_order.bom_no = bom.name
	work_order.qty = qty
	work_order.company = company
	work_order.wip_warehouse = wip_warehouse
	work_order.fg_warehouse = fg_warehouse
	work_order.planned_start_date = nowdate()

	work_order.insert()
	work_order.submit()

	wizard_name = doc.get("name")
	if wizard_name and frappe.db.exists("Manufacturing Wizard", wizard_name):
		frappe.db.set_value("Manufacturing Wizard", wizard_name, {
			"created_bom": bom.name,
			"created_work_order": work_order.name
		})

	return {
		"status": "success",
		"bom": bom.name,
		"work_order": work_order.name,
		"message": _("BOM and Work Order created and submitted successfully.")
	}

@frappe.whitelist()
def load_existing_bom(bom_name):
	if not bom_name:
		frappe.throw(_("Please select a valid BOM."))
	
	bom = frappe.get_doc("BOM", bom_name)
	items = []
	for it in bom.items:
		items.append({
			"item_code": it.item_code,
			"item_name": it.item_name,
			"qty": it.qty,
			"uom": it.uom,
			"rate": it.rate,
			"amount": it.amount
		})

	scrap_items = []
	for sc in bom.scrap_items:
		scrap_items.append({
			"item_code": sc.item_code,
			"item_name": sc.item_name,
			"stock_qty": sc.stock_qty,
			"stock_uom": sc.stock_uom,
			"rate": sc.rate,
			"amount": sc.amount
		})

	operations = []
	for op in bom.operations:
		operations.append({
			"operation": op.operation,
			"workstation": op.workstation,
			"time_in_mins": op.time_in_mins,
			"hour_rate": op.hour_rate,
			"operating_cost": op.operating_cost,
			"description": op.description
		})

	return {
		"production_item": bom.item,
		"item_name": bom.item_name,
		"qty": bom.quantity,
		"uom": bom.uom,
		"company": bom.company,
		"currency": bom.currency,
		"with_quality_inspection": 1 if getattr(bom, "quality_inspection_template", None) else 0,
		"quality_inspection_template": getattr(bom, "quality_inspection_template", None),
		"items": items,
		"scrap_items": scrap_items,
		"operations": operations
	}

@frappe.whitelist()
def get_bom_parent_count(bom_name):
	"""Return the count of active parent BOMs that reference this BOM as a sub-assembly component."""
	if not bom_name:
		return 0
	return frappe.db.count("BOM Item", filters={"bom_no": bom_name, "docstatus": 1})


@frappe.whitelist()
def execute_update(doc):
	if isinstance(doc, str):
		doc = json.loads(doc)

	selected_bom = doc.get("selected_bom")
	if not selected_bom:
		frappe.throw(_("Please select an existing BOM to update."))

	old_bom = frappe.get_doc("BOM", selected_bom)

	new_bom = frappe.copy_doc(old_bom)
	new_bom.is_active = 1
	new_bom.is_default = 1
	new_bom.quantity = flt(doc.get("qty", old_bom.quantity))
	new_bom.uom = doc.get("uom", old_bom.uom)
	new_bom.items = []
	new_bom.scrap_items = []
	new_bom.operations = []

	for raw in doc.get("items", []):
		new_bom.append("items", {
			"item_code": raw.get("item_code"),
			"qty": flt(raw.get("qty")),
			"uom": raw.get("uom"),
			"rate": flt(raw.get("rate")),
			"stock_uom": raw.get("uom")
		})

	for scrap in doc.get("scrap_items", []):
		new_bom.append("scrap_items", {
			"item_code": scrap.get("item_code"),
			"stock_qty": flt(scrap.get("stock_qty")),
			"stock_uom": scrap.get("stock_uom"),
			"rate": flt(scrap.get("rate"))
		})

	ops = doc.get("operations", [])
	new_bom.with_operations = 1 if len(ops) > 0 else 0
	for op in ops:
		new_bom.append("operations", {
			"operation": op.get("operation"),
			"workstation": op.get("workstation"),
			"time_in_mins": flt(op.get("time_in_mins", 10)),
			"hour_rate": flt(op.get("hour_rate")),
			"operating_cost": flt(op.get("operating_cost"))
		})

	if doc.get("quality_inspection_template"):
		new_bom.quality_inspection_template = doc.get("quality_inspection_template")

	new_bom.insert()
	new_bom.submit()

	# Deactivate the old BOM as default and mark it inactive
	frappe.db.set_value("BOM", old_bom.name, {"is_default": 0, "is_active": 0})

	# Count parent BOMs that reference the old BOM before enqueuing replacement
	parent_count = frappe.db.count(
		"BOM Item", filters={"bom_no": old_bom.name, "docstatus": 1}
	)

	# Propagate the replacement across all parent BOMs using ERPNext's built-in BOM Update Tool
	from erpnext.manufacturing.doctype.bom_update_tool.bom_update_tool import enqueue_replace_bom
	enqueue_replace_bom(boms={"current_bom": old_bom.name, "new_bom": new_bom.name})

	wizard_name = doc.get("name")
	if wizard_name and frappe.db.exists("Manufacturing Wizard", wizard_name):
		frappe.db.set_value("Manufacturing Wizard", wizard_name, "created_bom", new_bom.name)

	return {
		"status": "success",
		"bom": new_bom.name,
		"old_bom": old_bom.name,
		"parent_count": parent_count,
		"message": _(
			"BOM revision {0} created and submitted. "
			"Replacement propagation queued across {1} parent recipe(s). "
			"Old BOM {2} deactivated."
		).format(new_bom.name, parent_count, old_bom.name)
	}

@frappe.whitelist()
def get_work_order_live_status(work_order_name):
	if not work_order_name:
		frappe.throw(_("Please select a Work Order."))

	wo = frappe.get_doc("Work Order", work_order_name)
	
	job_cards = frappe.get_all("Job Card", 
		filters={"work_order": work_order_name},
		fields=["name", "operation", "workstation", "status", "total_completed_qty", "for_quantity"]
	)

	inspections = frappe.get_all("Quality Inspection",
		filters={"reference_type": "Work Order", "reference_name": work_order_name},
		fields=["name", "status", "inspection_type", "inspected_by"]
	)

	items_summary = []
	for it in wo.required_items:
		items_summary.append({
			"item_code": it.item_code,
			"required_qty": it.required_qty,
			"transferred_qty": it.transferred_qty
		})

	can_transfer = (wo.status in ["Not Started", "In Process"]) and (flt(wo.material_transferred_for_manufacturing) < flt(wo.qty))
	can_finish = (wo.status == "In Process") and (flt(wo.produced_qty) < flt(wo.qty))

	return {
		"work_order": wo.name,
		"status": wo.status,
		"production_item": wo.production_item,
		"item_name": wo.item_name,
		"planned_qty": wo.qty,
		"produced_qty": wo.produced_qty,
		"wip_warehouse": wo.wip_warehouse,
		"fg_warehouse": wo.fg_warehouse,
		"job_cards": job_cards,
		"inspections": inspections,
		"items_summary": items_summary,
		"can_transfer": can_transfer,
		"can_finish": can_finish
	}

@frappe.whitelist()
def execute_tracker_action(action_type, work_order_name):
	if not work_order_name:
		frappe.throw(_("Work Order name is required."))

	if action_type == "transfer_materials":
		from erpnext.manufacturing.doctype.work_order.work_order import make_stock_entry
		se = make_stock_entry(work_order_name, "Material Transfer for Manufacture")
		se.insert()
		return {
			"status": "success",
			"stock_entry": se.name,
			"message": _("Draft Material Transfer Stock Entry {0} created.").format(se.name)
		}

	elif action_type == "finish_manufacturing":
		from erpnext.manufacturing.doctype.work_order.work_order import make_stock_entry
		se = make_stock_entry(work_order_name, "Manufacture")
		se.insert()
		return {
			"status": "success",
			"stock_entry": se.name,
			"message": _("Draft Manufacture Stock Entry {0} created.").format(se.name)
		}

	elif action_type == "create_inspection":
		wo = frappe.get_doc("Work Order", work_order_name)
		qi = frappe.new_doc("Quality Inspection")
		qi.inspection_type = "In Process"
		qi.reference_type = "Work Order"
		qi.reference_name = work_order_name
		qi.item_code = wo.production_item
		qi.inspected_by = frappe.session.user
		qi.sample_size = 1
		qi.insert()
		return {
			"status": "success",
			"quality_inspection": qi.name,
			"message": _("Draft Quality Inspection {0} created.").format(qi.name)
		}

	else:
		frappe.throw(_("Invalid action type."))
