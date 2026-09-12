# Copyright (c) 2026, Managely and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _

def setup_manufacturing_onboarding():
	create_module_def()
	create_form_tour()
	cleanup_quick_start_onboarding()
	update_manufacturing_workspace()

def create_module_def():
	if not frappe.db.exists("Module Def", "Managely Manufacturing"):
		doc = frappe.new_doc("Module Def")
		doc.module_name = "Managely Manufacturing"
		doc.app_name = "managely_terminal"
		doc.insert(ignore_permissions=True)

def create_form_tour():
	tour_name = "Manufacturing Wizard Tour"
	tour_doc = None
	if frappe.db.exists("Form Tour", tour_name):
		tour_doc = frappe.get_doc("Form Tour", tour_name)
		tour_doc.steps = []
	else:
		tour_doc = frappe.new_doc("Form Tour")
		tour_doc.title = tour_name
		tour_doc.reference_doctype = "Manufacturing Wizard"
		tour_doc.module = "Managely Manufacturing"
		tour_doc.is_standard = 0
		tour_doc.first_document = 0

	steps = [
		{
			"title": _("Operational Modes"),
			"fieldname": "mode",
			"position": "Bottom",
			"description": _("Select from 3 operational modes: Create New Cycle from scratch, Update Existing BOM to revise recipes, or Track & Execute Work Order for live shop floor execution.")
		},
		{
			"title": _("Finished Product & Quantity"),
			"fieldname": "production_item",
			"position": "Bottom",
			"description": _("Specify the finished item you want to produce and the target batch production quantity.")
		},
		{
			"title": _("Raw Materials Table"),
			"fieldname": "items",
			"position": "Top",
			"description": _("List all direct materials, ingredients, and quantities required for the batch.")
		},
		{
			"title": _("By-Products & Scrap Recovery"),
			"fieldname": "scrap_items",
			"position": "Top",
			"description": _("Add recovered by-products (such as egg yolks). Their calculated valuation is credited directly to reduce the unit cost of your finished item.")
		},
		{
			"title": _("Workstations & Machinery"),
			"fieldname": "operations",
			"position": "Top",
			"description": _("Select the required machines (e.g., mixers, ovens) and duration in minutes to calculate operating and overhead costs.")
		},
		{
			"title": _("Quality Inspection Parameters"),
			"fieldname": "with_quality_inspection",
			"position": "Bottom",
			"description": _("Optionally assign a quality inspection template and enforce mandatory inspections before receiving finished goods.")
		},
		{
			"title": _("Real-Time Costing Summary"),
			"fieldname": "total_cost",
			"position": "Top",
			"description": _("Review the live calculated raw material cost, machine overheads, scrap deductions, and final unit cost before launching.")
		}
	]

	for st in steps:
		tour_doc.append("steps", st)

	tour_doc.save(ignore_permissions=True)

def cleanup_quick_start_onboarding():
	if frappe.db.exists("Module Onboarding", "Managely Manufacturing"):
		frappe.delete_doc("Module Onboarding", "Managely Manufacturing", ignore_permissions=True, force=True)
	if frappe.db.exists("Onboarding Step", "explore_manufacturing_wizard"):
		frappe.delete_doc("Onboarding Step", "explore_manufacturing_wizard", ignore_permissions=True, force=True)

def update_manufacturing_workspace():
	ws_name = "Manufacturing"
	if not frappe.db.exists("Workspace", ws_name):
		return

	doc = frappe.get_doc("Workspace", ws_name)

	# 1. Remove any Onboarding / Quick Start blocks from Workspace content
	content_list = []
	if doc.content:
		try:
			content_list = json.loads(doc.content)
		except Exception:
			content_list = []

	# Filter out any onboarding blocks
	content_list = [
		item for item in content_list
		if item.get("type") != "onboarding"
	]

	# 2. Add Shortcut for Manufacturing Wizard if not present
	has_shortcut = any(s.link_to == "Manufacturing Wizard" for s in doc.shortcuts)
	if not has_shortcut:
		doc.append("shortcuts", {
			"type": "DocType",
			"link_to": "Manufacturing Wizard",
			"label": "Manufacturing Wizard",
			"color": "Grey"
		})

	has_shortcut_in_content = any(
		item.get("type") == "shortcut" and item.get("data", {}).get("shortcut_name") == "Manufacturing Wizard"
		for item in content_list
	)
	if not has_shortcut_in_content:
		for i, item in enumerate(content_list):
			if item.get("type") == "header" and "Shortcuts" in item.get("data", {}).get("text", ""):
				content_list.insert(i + 1, {
					"id": "sc_mfg_wizard",
					"type": "shortcut",
					"data": {
						"shortcut_name": "Manufacturing Wizard",
						"col": 4
					}
				})
				break

	doc.content = json.dumps(content_list)

	# 3. Add Link to Manufacturing Wizard if not present
	has_link = any(l.link_to == "Manufacturing Wizard" for l in doc.links)
	if not has_link:
		doc.append("links", {
			"type": "Link",
			"link_type": "DocType",
			"link_to": "Manufacturing Wizard",
			"label": "Manufacturing Wizard",
			"onboard": 0
		})

	doc.flags.ignore_permissions = True
	doc.flags.ignore_mandatory = True
	doc.save()
