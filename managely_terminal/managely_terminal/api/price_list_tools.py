# Copyright (c) 2026, Tati and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.utils import flt, cint, now_datetime


def ensure_log_table():
	"""Ensures the tabPrice Adjustment Log table exists to guarantee fail-safe operation."""
	if not frappe.db.table_exists("Price Adjustment Log"):
		frappe.db.sql("""
			CREATE TABLE IF NOT EXISTS `tabPrice Adjustment Log` (
				`name` VARCHAR(140) PRIMARY KEY,
				`creation` DATETIME(6),
				`modified` DATETIME(6),
				`modified_by` VARCHAR(140),
				`owner` VARCHAR(140),
				`docstatus` INT(1) DEFAULT 0,
				`idx` INT(8) DEFAULT 0,
				`price_list` VARCHAR(140),
				`source_price_list` VARCHAR(140),
				`operation_type` VARCHAR(50),
				`adjustment_method` VARCHAR(50),
				`adjustment_direction` VARCHAR(50),
				`adjustment_value` DECIMAL(18, 6) DEFAULT 0.0,
				`item_group` VARCHAR(140),
				`items_count` INT(11) DEFAULT 0,
				`snapshot_data` LONGTEXT,
				`restored` INT(1) DEFAULT 0,
				`restored_by` VARCHAR(140),
				`restored_at` DATETIME(6),
				`notes` TEXT,
				INDEX (`price_list`),
				INDEX (`creation`)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
		""")


def get_descendant_item_groups(group_name):
	"""Returns the item group itself and all its nested descendants."""
	if not group_name:
		return []
	if not frappe.db.exists("Item Group", group_name):
		return [group_name]

	group = frappe.db.get_value("Item Group", group_name, ["lft", "rgt"], as_dict=True)
	if group and group.lft and group.rgt:
		return frappe.get_all(
			"Item Group",
			filters={"lft": (">=", group.lft), "rgt": ("<=", group.rgt)},
			pluck="name",
		)
	return [group_name]


def round_price(value, rule):
	if rule == "integer":
		return float(round(value))
	elif rule == "none":
		return float(value)
	return float(round(value, 2))


@frappe.whitelist()
def preview_or_apply_adjustment(
	price_list,
	operation_type="duplicate",
	new_price_list_name=None,
	adjustment_method="percentage",
	adjustment_direction="increase",
	adjustment_value=0.0,
	item_group=None,
	include_other_items=1,
	rounding_rule="2_decimals",
	is_preview=0,
):
	"""
	Calculates and previews or applies price adjustments (percentage or fixed amount)
	either as a duplicate price list or in-place update.
	"""
	frappe.has_permission("Price List", "write", throw=True)
	ensure_log_table()

	if not frappe.db.exists("Price List", price_list):
		frappe.throw(_("Selected Price List does not exist: {0}").format(price_list))

	operation_type = (operation_type or "duplicate").strip()
	adjustment_method = (adjustment_method or "percentage").strip()
	adjustment_direction = (adjustment_direction or "increase").strip()
	adjustment_value = flt(adjustment_value)
	include_other_items = cint(include_other_items)
	is_preview = cint(is_preview)

	if operation_type == "duplicate" and not is_preview:
		if not new_price_list_name or not new_price_list_name.strip():
			frappe.throw(_("Please enter the new Price List name."))
		new_price_list_name = new_price_list_name.strip()
		if frappe.db.exists("Price List", new_price_list_name):
			frappe.throw(_("Price List already exists: {0}").format(new_price_list_name))

	if adjustment_value < 0:
		frappe.throw(_("Adjustment value must be zero or a positive number."))

	current_prices = frappe.get_all(
		"Item Price",
		filters={"price_list": price_list},
		fields=["name", "item_code", "item_name", "price_list_rate", "currency", "uom"],
	)

	if not current_prices:
		frappe.throw(_("No items found in Price List: {0}").format(price_list))

	target_item_codes = None
	if item_group:
		descendant_groups = get_descendant_item_groups(item_group)
		target_item_codes = set(
			frappe.get_all("Item", filters={"item_group": ("in", descendant_groups)}, pluck="name")
		)

	# Lightweight Insights Mode for High-Volume Data (Prevents UI/Memory Lag)
	if is_preview:
		total_source = len(current_prices)
		if target_item_codes is not None:
			adj_count = sum(1 for p in current_prices if p.item_code in target_item_codes)
		else:
			adj_count = total_source

		if operation_type == "duplicate":
			target_total = adj_count + ((total_source - adj_count) if include_other_items else 0)
		else:
			target_total = total_source

		return {
			"status": "preview",
			"total_source_items": total_source,
			"adjusted_count": adj_count,
			"total_target_items": target_total,
		}

	adjusted_items = []
	all_processed_items = []

	for p in current_prices:
		old_rate = flt(p.price_list_rate)
		is_matched = True if target_item_codes is None else (p.item_code in target_item_codes)

		if is_matched:
			if adjustment_method == "percentage":
				delta = old_rate * (adjustment_value / 100.0)
				new_rate = old_rate + delta if adjustment_direction == "increase" else max(0.0, old_rate - delta)
			elif adjustment_method == "fixed_amount":
				new_rate = old_rate + adjustment_value if adjustment_direction == "increase" else max(0.0, old_rate - adjustment_value)
			else:
				new_rate = old_rate

			new_rate = round_price(new_rate, rounding_rule)
			adjusted_items.append({
				"name": p.name,
				"item_code": p.item_code,
				"item_name": p.item_name,
				"uom": p.uom,
				"currency": p.currency,
				"old_rate": old_rate,
				"new_rate": new_rate,
				"is_adjusted": 1,
			})
			all_processed_items.append(adjusted_items[-1])
		else:
			if operation_type == "duplicate" and include_other_items:
				all_processed_items.append({
					"name": p.name,
					"item_code": p.item_code,
					"item_name": p.item_name,
					"uom": p.uom,
					"currency": p.currency,
					"old_rate": old_rate,
					"new_rate": old_rate,
					"is_adjusted": 0,
				})

	target_price_list = new_price_list_name if operation_type == "duplicate" else price_list

	if operation_type == "duplicate":
		src_doc = frappe.get_doc("Price List", price_list)
		new_pl = frappe.new_doc("Price List")
		new_pl.price_list_name = new_price_list_name
		new_pl.currency = src_doc.currency
		new_pl.buying = src_doc.buying
		new_pl.selling = src_doc.selling
		new_pl.enabled = 1
		new_pl.insert(ignore_permissions=True)

		for item in all_processed_items:
			ip = frappe.new_doc("Item Price")
			ip.item_code = item["item_code"]
			ip.price_list = new_price_list_name
			ip.price_list_rate = item["new_rate"]
			ip.currency = item.get("currency") or src_doc.currency
			ip.uom = item.get("uom")
			ip.insert(ignore_permissions=True)

	else:
		for item in adjusted_items:
			frappe.db.set_value("Item Price", item["name"], "price_list_rate", item["new_rate"])

	log_name = f"PAL-{frappe.utils.now_datetime().strftime('%Y-%m-%d')}-{frappe.generate_hash(length=6).upper()}"
	snapshot_json = json.dumps(all_processed_items, ensure_ascii=False)

	direction_label = "Increase" if adjustment_direction == "increase" else "Decrease"
	method_label = "Percentage" if adjustment_method == "percentage" else ("Fixed Amount" if adjustment_method == "fixed_amount" else "Exact Copy")
	op_label = "Duplicate to New List" if operation_type == "duplicate" else "In-place Update"

	log_doc = frappe.new_doc("Price Adjustment Log")
	log_doc.name = log_name
	log_doc.price_list = target_price_list
	log_doc.source_price_list = price_list if operation_type == "duplicate" else ""
	log_doc.operation_type = op_label
	log_doc.adjustment_method = method_label
	log_doc.adjustment_direction = direction_label
	log_doc.adjustment_value = adjustment_value
	log_doc.item_group = item_group or ""
	log_doc.items_count = len(adjusted_items)
	log_doc.snapshot_data = snapshot_json
	log_doc.notes = f"Adjusted {len(adjusted_items)} items by {adjustment_value} ({method_label} - {direction_label})"
	log_doc.insert(ignore_permissions=True)

	frappe.db.commit()

	return {
		"status": "success",
		"target_price_list": target_price_list,
		"operation_type": operation_type,
		"adjusted_count": len(adjusted_items),
		"total_count": len(all_processed_items),
		"log_name": log_doc.name,
	}


@frappe.whitelist()
def get_adjustment_logs(price_list):
	"""Returns historical adjustment logs for this price list."""
	frappe.has_permission("Price List", "read", throw=True)
	ensure_log_table()

	logs = frappe.get_all(
		"Price Adjustment Log",
		filters={"price_list": price_list},
		fields=[
			"name",
			"creation",
			"owner",
			"operation_type",
			"adjustment_method",
			"adjustment_direction",
			"adjustment_value",
			"item_group",
			"items_count",
			"restored",
			"restored_by",
			"restored_at",
			"notes",
		],
		order_by="creation desc",
		limit=20,
	)
	return logs


@frappe.whitelist()
def restore_adjustment(log_name):
	"""
	Restores prices to their previous state recorded in a specific Adjustment Log.
	"""
	frappe.has_permission("Price List", "write", throw=True)
	ensure_log_table()

	if not frappe.db.exists("Price Adjustment Log", log_name):
		frappe.throw(_("Price adjustment log not found: {0}").format(log_name))

	log_doc = frappe.get_doc("Price Adjustment Log", log_name)
	if log_doc.restored:
		frappe.throw(_("This log has already been restored on: {0}").format(log_doc.restored_at))

	if not log_doc.snapshot_data:
		frappe.throw(_("No snapshot data found in this log."))

	items = json.loads(log_doc.snapshot_data)
	restored_count = 0

	for item in items:
		if not item.get("is_adjusted", 1):
			continue

		item_code = item["item_code"]
		old_rate = flt(item["old_rate"])
		ip_name = item.get("name")
		target_uom = item.get("uom")

		# 1. Try updating by exact record ID if still in the same price list
		if ip_name and frappe.db.exists("Item Price", ip_name) and frappe.db.get_value("Item Price", ip_name, "price_list") == log_doc.price_list:
			frappe.db.set_value("Item Price", ip_name, "price_list_rate", old_rate)
			restored_count += 1
		else:
			# 2. Match by item_code and uom
			filters = {"item_code": item_code, "price_list": log_doc.price_list}
			if target_uom:
				filters["uom"] = target_uom

			target_ip = frappe.db.get_value("Item Price", filters, "name")
			if target_ip:
				frappe.db.set_value("Item Price", target_ip, "price_list_rate", old_rate)
				restored_count += 1
			else:
				ip = frappe.new_doc("Item Price")
				ip.item_code = item_code
				ip.price_list = log_doc.price_list
				ip.price_list_rate = old_rate
				ip.currency = item.get("currency")
				ip.uom = target_uom
				ip.insert(ignore_permissions=True)
				restored_count += 1

	log_doc.restored = 1
	log_doc.restored_by = frappe.session.user
	log_doc.restored_at = now_datetime()
	log_doc.save(ignore_permissions=True)

	restore_log_name = f"PAL-RESTORE-{now_datetime().strftime('%Y-%m-%d')}-{frappe.generate_hash(length=6).upper()}"
	r_log = frappe.new_doc("Price Adjustment Log")
	r_log.name = restore_log_name
	r_log.price_list = log_doc.price_list
	r_log.operation_type = "Restore"
	r_log.adjustment_method = "Exact Copy"
	r_log.adjustment_direction = "None"
	r_log.adjustment_value = 0
	r_log.items_count = restored_count
	r_log.notes = f"Restored previous rates from log {log_name} for {restored_count} items."
	r_log.insert(ignore_permissions=True)

	frappe.db.commit()

	return {
		"status": "success",
		"restored_count": restored_count,
		"price_list": log_doc.price_list,
	}
