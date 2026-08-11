import frappe
from managely_terminal.managely_terminal.api.electron.thermal_receipts import create_thermal_print_formats
from managely_terminal.managely_terminal.accounting.customizations import setup_custom_fields as setup_accounting_custom_fields


def ensure_employee_pos_login_fields():
	employee_fields = [
		{
			"fieldname": "custom_pos_login_tab",
			"label": "POS Profile",
			"fieldtype": "Tab Break",
			"dt": "Employee",
			"cf_name": "Employee-custom_pos_login_tab",
			"insert_after": "internal_work_history",
		},
		{
			"fieldname": "custom_pos_login_section",
			"label": "POS Login",
			"fieldtype": "Section Break",
			"dt": "Employee",
			"cf_name": "Employee-custom_pos_login_section",
			"insert_after": "custom_pos_login_tab",
		},
		{
			"fieldname": "custom_pos_username",
			"label": "POS Username",
			"fieldtype": "Data",
			"dt": "Employee",
			"cf_name": "Employee-custom_pos_username",
			"insert_after": "custom_pos_login_section",
			"unique": 1,
			"description": "Unique username the employee uses to log in at the POS terminal",
		},
		{
			"fieldname": "custom_pos_password",
			"label": "POS Password",
			"fieldtype": "Password",
			"dt": "Employee",
			"cf_name": "Employee-custom_pos_password",
			"insert_after": "custom_pos_username",
			"no_copy": 1,
		},
	]

	for ef in employee_fields:
		if not frappe.db.exists("Custom Field", ef["cf_name"]):
			doc = frappe.new_doc("Custom Field")
			for k, v in ef.items():
				if k not in ("cf_name",):
					setattr(doc, k, v)
			doc.insert(ignore_permissions=True)
			print(f"Created {ef['cf_name']}.")
		else:
			doc = frappe.get_doc("Custom Field", ef["cf_name"])
			changed = False
			for k, v in ef.items():
				if k == "cf_name":
					continue
				if getattr(doc, k, None) != v:
					setattr(doc, k, v)
					changed = True
			if changed:
				doc.save(ignore_permissions=True)
				print(f"Updated {ef['cf_name']}.")
			else:
				print(f"{ef['cf_name']} already exists.")

	frappe.clear_cache(doctype="Employee")



def ensure_misc_custom_fields():
	fields = [
		{"dt": "Item", "fieldname": "is_fresh_produce", "label": "Is Fresh Produce", "fieldtype": "Check", "insert_after": "allow_negative_stock"},
		{"dt": "Item", "fieldname": "supports_weight_price", "label": "Supports Weight Price", "fieldtype": "Check", "insert_after": "is_fresh_produce"},
		{"dt": "Item", "fieldname": "is_weight_item", "label": "Is Weight Item", "fieldtype": "Check", "insert_after": "is_fresh_produce"},
		{"dt": "POS Invoice Item", "fieldname": "custom_ingredients", "label": "Custom Ingredients", "fieldtype": "Small Text", "insert_after": "item_code"},
		{"dt": "Sales Order Item", "fieldname": "custom_ingredients", "label": "Custom Ingredients", "fieldtype": "Small Text", "insert_after": "item_code"},
		{"dt": "Work Order", "fieldname": "custom_pos_invoice", "label": "Source POS Invoice", "fieldtype": "Link", "options": "POS Invoice", "insert_after": "sales_order"},
		{"dt": "Work Order", "fieldname": "custom_sales_order", "label": "Source Sales Order", "fieldtype": "Link", "options": "Sales Order", "insert_after": "custom_pos_invoice"},
		{"dt": "Work Order", "fieldname": "custom_sales_invoice", "label": "Source Sales Invoice", "fieldtype": "Link", "options": "Sales Invoice", "insert_after": "custom_sales_order"},
		{"dt": "Item", "fieldname": "custom_is_tax_exempt", "label": "Tax Exempt (No VAT)", "fieldtype": "Check", "insert_after": "is_weight_item", "in_list_view": 1},
		{"dt": "POS Invoice", "fieldname": "custom_shift_order", "label": "Shift Order No", "fieldtype": "Data", "read_only": 1, "insert_after": "pos_profile"},
		{"dt": "Sales Invoice", "fieldname": "custom_shift_order", "label": "Shift Order No", "fieldtype": "Data", "read_only": 1, "insert_after": "pos_profile"}
	]

	pos_ref_doctypes = [
		"Sales Invoice",
		"POS Invoice", 
		"POS Opening Entry", 
		"POS Closing Entry", 
		"Driver Settlement", 
		"Delivery Company Settlement",
		"Work Order",
		"POS Suspended Transaction"
	]
	
	for dt in pos_ref_doctypes:
		if frappe.db.exists("DocType", dt):
			fields.append({
				"dt": dt,
				"fieldname": "pos_ref",
				"label": "POS Reference",
				"fieldtype": "Data",
				"read_only": 1
			})

	if frappe.db.exists("Custom Field", "Item Price-custom_is_tax_exempt"):
		frappe.delete_doc("Custom Field", "Item Price-custom_is_tax_exempt", ignore_permissions=True)
	
	for f in fields:
		cf_name = frappe.db.get_value("Custom Field", {"dt": f["dt"], "fieldname": f["fieldname"]})
		if not cf_name:
			doc = frappe.new_doc("Custom Field")
			doc.update(f)
			try:
				doc.insert(ignore_permissions=True)
				print(f"Created custom field {f['dt']}-{f['fieldname']}")
			except Exception as e:
				print(f"FAILED to insert custom field {f['dt']}-{f['fieldname']}: {str(e)}")
		else:
			cf_doc = frappe.get_doc("Custom Field", cf_name)
			if cf_doc.description:
				cf_doc.description = None
				cf_doc.save(ignore_permissions=True)


def ensure_delivery_company_doctype_and_fields():
	# 1. Create Child DocType POS Profile Delivery Fee if it doesn't exist
	if not frappe.db.exists("DocType", "POS Profile Delivery Fee"):
		doc = frappe.get_doc({
			"doctype": "DocType",
			"name": "POS Profile Delivery Fee",
			"module": "Managely Terminal",
			"custom": 1,
			"istable": 1,
			"fields": [
				{
					"fieldname": "delivery_fee",
					"label": "Delivery Fee",
					"fieldtype": "Currency",
					"in_list_view": 1,
					"reqd": 1
				}
			]
		})
		doc.insert(ignore_permissions=True)
		print("Created DocType POS Profile Delivery Fee")

	if not frappe.db.exists("DocType", "POS Change Breakdown"):
		doc = frappe.get_doc({
			"doctype": "DocType",
			"name": "POS Change Breakdown",
			"module": "Managely Terminal",
			"custom": 1,
			"istable": 1,
			"editable_grid": 1,
			"fields": [
				{"fieldname": "cash_drawer", "label": "Cash Drawer / Method", "fieldtype": "Data", "in_list_view": 1},
				{"fieldname": "currency", "label": "Currency", "fieldtype": "Link", "options": "Currency", "in_list_view": 1},
				{"fieldname": "amount", "label": "Amount", "fieldtype": "Currency", "in_list_view": 1},
				{"fieldname": "base_amount", "label": "Base Amount", "fieldtype": "Currency", "in_list_view": 1}
			]
		})
		doc.insert(ignore_permissions=True)
		print("Created DocType POS Change Breakdown")

	# 2. Create DocType Delivery Company if it doesn't exist
	if not frappe.db.exists("DocType", "Delivery Company"):
		doc = frappe.get_doc({
			"doctype": "DocType",
			"name": "Delivery Company",
			"module": "Managely Terminal",
			"custom": 1,
			"istable": 0,
			"fields": [
				{
					"fieldname": "company_name",
					"label": "Company Name",
					"fieldtype": "Data",
					"reqd": 1,
					"in_list_view": 1
				},
# 				{
# 					"fieldname": "receivable_account",
# 					"label": "Receivable Account",
# 					"fieldtype": "Link",
# 					"options": "Account",
# 					"in_list_view": 1
# 				},
				{
					"fieldname": "phone",
					"label": "Phone",
					"fieldtype": "Data"
				},
				{
					"fieldname": "disabled",
					"label": "Disabled",
					"fieldtype": "Check",
					"default": "0"
				}
			],
			"autoname": "field:company_name"
		})
		doc.insert(ignore_permissions=True)
		print("Created DocType Delivery Company")

	# 4. Custom fields for Delivery Personnel
	delivery_personnel_fields = []

	for f in delivery_personnel_fields:
		cf_name = f"{f['dt']}-{f['fieldname']}"
		if not frappe.db.exists("Custom Field", cf_name):
			doc = frappe.new_doc("Custom Field")
			for k, v in f.items():
				setattr(doc, k, v)
			doc.insert(ignore_permissions=True)
			print(f"Created Custom Field {cf_name}")
		else:
			doc = frappe.get_doc("Custom Field", cf_name)
			changed = False
			for k, v in f.items():
				if getattr(doc, k, None) != v:
					setattr(doc, k, v)
					changed = True
			if changed:
				doc.save(ignore_permissions=True)
				print(f"Updated Custom Field {cf_name}")


def run():
	ensure_misc_custom_fields()
	ensure_delivery_company_doctype_and_fields()
	setup_accounting_custom_fields()
	ensure_custom_html_blocks()



	# Fix POS Closing Entry custom field options to Klik Sales Invoice Reference
	field_name = "POS Closing Entry-custom_sales_invoice"
	if not frappe.db.exists("Custom Field", field_name):
		cf = frappe.new_doc("Custom Field")
		cf.dt = "POS Closing Entry"
		cf.fieldname = "custom_sales_invoice"
		cf.label = "Sales Invoice"
		cf.fieldtype = "Table"
		cf.options = "Klik Sales Invoice Reference"
		cf.insert(ignore_permissions=True)
		print("Created custom_sales_invoice custom field on POS Closing Entry.")
	else:
		cf = frappe.get_doc("Custom Field", field_name)
		if cf.options != "Klik Sales Invoice Reference":
			cf.options = "Klik Sales Invoice Reference"
			cf.save(ignore_permissions=True)
			print("Updated custom_sales_invoice options to Klik Sales Invoice Reference")


	# Custom field for Warehouse
	wh_name = "POS Profile User-custom_warehouse"
	if not frappe.db.exists("Custom Field", wh_name):
		doc = frappe.new_doc("Custom Field")
		doc.dt = "POS Profile User"
		doc.fieldname = "custom_warehouse"
		doc.label = "Warehouse"
		doc.fieldtype = "Link"
		doc.options = "Warehouse"
		doc.insert(ignore_permissions=True)
		print("Created custom_warehouse field.")
	else:
		print("custom_warehouse field already exists.")

	# Custom field for POS Opening Entry in Sales Invoice
	invoice_field_name = "Sales Invoice-custom_pos_opening_entry"
	if not frappe.db.exists("Custom Field", invoice_field_name):
		doc = frappe.new_doc("Custom Field")
		doc.dt = "Sales Invoice"
		doc.fieldname = "custom_pos_opening_entry"
		doc.label = "POS Opening Entry"
		doc.fieldtype = "Link"
		doc.options = "POS Opening Entry"
		doc.insert(ignore_permissions=True)
		print("Created custom_pos_opening_entry field.")
	else:
		print("custom_pos_opening_entry field already exists.")

	# Clean up any legacy delivery custom fields from Sales Invoice so they only exist on POS Invoice
	for legacy_fn in ["custom_delivery_personnel", "custom_delivery_personnel_name", "custom_delivery_status", "custom_delivery_fee", "custom_delivery_cod", "custom_delivery_prepaid", "custom_pos_order_type", "custom_driver_settled", "custom_delivery", "custom_column_break_hnemi"]:
		legacy_cf = f"Sales Invoice-{legacy_fn}"
		if frappe.db.exists("Custom Field", legacy_cf):
			frappe.delete_doc("Custom Field", legacy_cf, ignore_permissions=True)
			print(f"Removed legacy {legacy_cf}.")

	# Delivery fields on POS Invoice ONLY
	for dt in ["POS Invoice"]:
		delivery_fields = [
			{
				"dt": dt,
				"fieldname": "custom_delivery_type",
				"label": "Delivery Type",
				"fieldtype": "Select",
				"options": "\nCompany Driver\nDelivery Company",
				"default": "Company Driver",
				"insert_after": "customer"
			},
			{
				"dt": dt,
				"fieldname": "custom_delivery_company",
				"label": "Delivery Company",
				"fieldtype": "Link",
				"options": "Delivery Company",
				"insert_after": "custom_delivery_type"
			},
			{
				"dt": dt,
				"fieldname": "custom_delivery_personnel",
				"label": "Delivery Personnel",
				"fieldtype": "Link" if frappe.db.exists("DocType", "Delivery Personnel") else "Data",
				"options": "Delivery Personnel" if frappe.db.exists("DocType", "Delivery Personnel") else None,
				"insert_after": "custom_delivery_company"
			},
			{
				"dt": dt,
				"fieldname": "custom_delivery_status",
				"label": "Delivery Status",
				"fieldtype": "Select",
				"options": "\nPending\nOut for Delivery\nDelivered\nSettled\nCancelled",
				"default": None,
				"insert_after": "custom_delivery_personnel"
			},
			{
				"dt": dt,
				"fieldname": "custom_delivery_fee",
				"label": "Delivery Fee",
				"fieldtype": "Currency",
				"default": "0.0",
				"insert_after": "custom_delivery_status"
			}
		]
		for f in delivery_fields:
			cf_name = f"{dt}-{f['fieldname']}"
			if not frappe.db.exists("Custom Field", cf_name):
				doc = frappe.new_doc("Custom Field")
				for k, v in f.items():
					setattr(doc, k, v)
				doc.insert(ignore_permissions=True)
				print(f"Created {cf_name}.")
			else:
				doc = frappe.get_doc("Custom Field", cf_name)
				changed = False
				for k, v in f.items():
					if getattr(doc, k, None) != v:
						if k == "fieldtype" and getattr(doc, k, None) == "Link" and v == "Data":
							continue
						if k == "options" and getattr(doc, "fieldtype", None) == "Link" and v is None:
							continue
						setattr(doc, k, v)
						changed = True
				if changed:
					doc.save(ignore_permissions=True)
					print(f"Updated {cf_name}.")

	# Custom field for POS Opening Entry in POS Invoice
	pos_invoice_opening_field = "POS Invoice-custom_pos_opening_entry"
	if not frappe.db.exists("Custom Field", pos_invoice_opening_field):
		doc = frappe.new_doc("Custom Field")
		doc.dt = "POS Invoice"
		doc.fieldname = "custom_pos_opening_entry"
		doc.label = "POS Opening Entry"
		doc.fieldtype = "Link"
		doc.options = "POS Opening Entry"
		doc.insert(ignore_permissions=True)
		print("Created custom_pos_opening_entry field on POS Invoice.")
	else:
		print("custom_pos_opening_entry field on POS Invoice already exists.")


	# Delete custom field for POS Customer in Sales Invoice if it exists
	sales_invoice_pos_cust = "Sales Invoice-custom_pos_customer"
	if frappe.db.exists("Custom Field", sales_invoice_pos_cust):
		frappe.db.delete("Custom Field", {"name": sales_invoice_pos_cust})
		print("Deleted custom_pos_customer field from Sales Invoice.")

	# Custom field for POS Customer in POS Invoice
	pos_invoice_pos_cust = "POS Invoice-custom_pos_customer"
	if not frappe.db.exists("Custom Field", pos_invoice_pos_cust):
		doc = frappe.new_doc("Custom Field")
		doc.dt = "POS Invoice"
		doc.fieldname = "custom_pos_customer"
		doc.label = "POS Customer"
		doc.fieldtype = "Link"
		doc.options = "POS Customer"
		doc.insert(ignore_permissions=True)
		print("Created custom_pos_customer field on POS Invoice.")
	else:
		print("custom_pos_customer field on POS Invoice already exists.")

	# ── Item 6: show/hide per payment mode in Opening Entry dialog ──────────────
	opening_flag = "POS Payment Method-custom_show_in_opening_entry"
	if not frappe.db.exists("Custom Field", opening_flag):
		doc = frappe.new_doc("Custom Field")
		doc.dt = "POS Payment Method"
		doc.fieldname = "custom_show_in_opening_entry"
		doc.label = "Show in Opening Entry"
		doc.fieldtype = "Check"
		doc.default = "1"
		doc.insert(ignore_permissions=True)
		# Back-fill existing rows so nothing disappears for existing users
		frappe.db.sql(
			"UPDATE `tabPOS Payment Method` SET custom_show_in_opening_entry = 1 "
			"WHERE custom_show_in_opening_entry IS NULL OR custom_show_in_opening_entry = 0"
		)
		print("Created custom_show_in_opening_entry field.")
	else:
		print("custom_show_in_opening_entry field already exists.")

	# ── Reorganize POS Profile custom fields ─────────────────────────────────
	ensure_pos_profile_fields()

	# ── Employee POS Login fields ─────────────────────────────────────────────
	ensure_employee_pos_login_fields()

	# ── Employee on POS Opening Entry ─────────────────────────────────────────
	for fieldname, label, fieldtype, after, opts in [
		("custom_employee", "Employee", "Link", "user", "Employee"),
		("custom_employee_name", "Employee Name", "Data", "custom_employee", None),
	]:
		cf = f"POS Opening Entry-{fieldname}"
		if not frappe.db.exists("Custom Field", cf):
			d = frappe.new_doc("Custom Field")
			d.dt = "POS Opening Entry"
			d.fieldname = fieldname
			d.label = label
			d.fieldtype = fieldtype
			d.insert_after = after
			d.read_only = 1
			if opts:
				d.options = opts
			d.insert(ignore_permissions=True)
			print(f"Created {cf}.")
		else:
			print(f"{cf} already exists.")

	# ── Item 5: Three 80mm thermal receipt print formats ──────────────────────
	create_thermal_print_formats()

	# ── POS Cash In/Out feature ──────────────────────────────────────────────────
	# POS Suspended Transaction doctypes and hooks are owned by the pos_cash_in_out
	# app; install pos_cash_in_out to enable the Cash I/O button.

	# Doctypes and hooks for the Cash I/O feature live in the separate pos_cash_in_out
	# app. Run its setup (bench install-app pos_cash_in_out) to enable them.
	if "pos_cash_in_out" in frappe.get_installed_apps():
		print("pos_cash_in_out is installed — Cash I/O feature active.")

	# ── Branch Manager Setup ──────────────────────────────────────────────────
	if not frappe.db.exists("Role", "Branch Manager"):
		frappe.get_doc({
			"doctype": "Role",
			"role_name": "Branch Manager"
		}).insert(ignore_permissions=True)
		print("Created Role Branch Manager")

	if frappe.db.exists("DocType", "Branch Manager POS Profile"):
		try:
			frappe.delete_doc("DocType", "Branch Manager POS Profile", ignore_missing=True)
			print("Deleted old DocType Branch Manager POS Profile")
		except Exception:
			pass

	# Allowed POS Profile DocType is now standard

	allowed_pos_cf = "Employee-custom_allowed_pos_profiles"
	if not frappe.db.exists("Custom Field", allowed_pos_cf):
		frappe.get_doc({
			"doctype": "Custom Field",
			"dt": "Employee",
			"fieldname": "custom_allowed_pos_profiles",
			"label": "Allowed POS Profiles",
			"fieldtype": "Table",
			"options": "Allowed POS Profile",
			"insert_after": "custom_pos_password"
		}).insert(ignore_permissions=True)
		print("Created custom_allowed_pos_profiles custom field on Employee.")

	allow_returns_cf = "Employee-custom_allow_returns"
	if not frappe.db.exists("Custom Field", allow_returns_cf):
		frappe.get_doc({
			"doctype": "Custom Field",
			"dt": "Employee",
			"fieldname": "custom_allow_returns",
			"label": "Allow POS Returns",
			"fieldtype": "Check",
			"insert_after": "custom_allowed_pos_profiles",
			"default": "1"
		}).insert(ignore_permissions=True)
		print("Created custom_allow_returns custom field on Employee.")

	allow_discounts_cf = "Employee-custom_allow_discounts"
	if not frappe.db.exists("Custom Field", allow_discounts_cf):
		frappe.get_doc({
			"doctype": "Custom Field",
			"dt": "Employee",
			"fieldname": "custom_allow_discounts",
			"label": "Allow POS Discounts",
			"fieldtype": "Check",
			"insert_after": "custom_allow_returns",
			"default": "1"
		}).insert(ignore_permissions=True)
		print("Created custom_allow_discounts custom field on Employee.")

	allow_item_discounts_cf = "Employee-custom_allow_item_discounts"
	if not frappe.db.exists("Custom Field", allow_item_discounts_cf):
		frappe.get_doc({
			"doctype": "Custom Field",
			"dt": "Employee",
			"fieldname": "custom_allow_item_discounts",
			"label": "Allow POS Item Discounts",
			"fieldtype": "Check",
			"insert_after": "custom_allow_discounts",
			"default": "1"
		}).insert(ignore_permissions=True)
		print("Created custom_allow_item_discounts custom field on Employee.")

	# Stamp Setting and Terminal Settings DocTypes are now standard

	frappe.clear_cache(doctype="POS Profile")
	frappe.clear_cache(doctype="Sales Invoice")
	frappe.clear_cache(doctype="Employee")
	frappe.clear_cache(doctype="Terminal Settings")
	
	# Automate symlinking sw.js to the site's public directory under /terminal_spa/sw.js
	setup_terminal_spa_sw_link()
	
	frappe.db.commit()


def setup_terminal_spa_sw_link():
	import os
	public_path = frappe.get_site_path("public")
	terminal_spa_path = os.path.join(public_path, "terminal_spa")
	
	# Ensure the site's public/terminal_spa directory exists
	os.makedirs(terminal_spa_path, exist_ok=True)
	
	src_sw_path = frappe.get_app_path("managely_terminal", "public", "terminal_spa", "sw.js")
	dest_sw_path = os.path.join(terminal_spa_path, "sw.js")
	
	if os.path.exists(src_sw_path):
		if os.path.exists(dest_sw_path) or os.path.islink(dest_sw_path):
			try:
				if os.path.isdir(dest_sw_path) and not os.path.islink(dest_sw_path):
					import shutil
					shutil.rmtree(dest_sw_path)
				else:
					os.remove(dest_sw_path)
			except Exception as e:
				print(f"Could not remove existing sw.js target: {e}")
		try:
			os.symlink(src_sw_path, dest_sw_path)
			print(f"Created symlink for sw.js at {dest_sw_path}")
		except Exception as e:
			import shutil
			try:
				shutil.copy(src_sw_path, dest_sw_path)
				print(f"Copied sw.js to {dest_sw_path}")
			except Exception as copy_err:
				print(f"Failed to link/copy sw.js: {copy_err}")


def ensure_pos_profile_fields():
	"""Set up app config fields under a unified Tab Break on POS Profile."""
	# 1. Define fields to keep and organize into Tabs/Sections
	pos_fields = [
		{
			"fieldname": "custom_managely_tab",
			"label": "Managely Terminal",
			"fieldtype": "Tab Break"
		},
		{
			"fieldname": "custom_general_settings_section",
			"label": "General Settings",
			"fieldtype": "Section Break"
		},
		{
			"fieldname": "custom_is_branch",
			"label": "Is Branch",
			"fieldtype": "Check",
			"description": "Mark this POS Profile as a branch (instead of a delegate/salesman).",
		},
		{
			"fieldname": "custom_branch_name",
			"label": "Branch Name",
			"fieldtype": "Data",
		},
		{
			"fieldname": "custom_business_type",
			"label": "Business Type",
			"fieldtype": "Select",
			"options": "\nB2C\nB2B\nB2B & B2C",
			"default": "B2C",
			"translatable": 0,
		},
		{
			"fieldname": "custom_consolidate_invoicing",
			"label": "Consolidate Invoice on Close",
			"fieldtype": "Check",
			"description": "When enabled, each order is saved as a draft. Drafts are submitted in batch when session closes.",
		},
		{
			"fieldname": "custom_hide_expected_amount",
			"label": "Hide Expected Amount",
			"fieldtype": "Check",
		},
		{
			"fieldname": "custom_pos_cipher",
			"label": "POS Cipher",
			"fieldtype": "Data",
		},
		{
			"fieldname": "custom_general_col_break",
			"fieldtype": "Column Break"
		},
		{
			"fieldname": "custom_use_scanner_fully",
			"label": "Use Scanner Fully",
			"fieldtype": "Check",
		},
		{
			"fieldname": "custom_autofetch_batchserial_",
			"label": "Auto-fetch Batch/Serial ",
			"fieldtype": "Check",
		},
		{
			"fieldname": "custom_allow_zero_stock_sale",
			"label": "Allow Selling Out of Stock Items",
			"fieldtype": "Check",
			"default": "0",
		},
		{
			"fieldname": "custom_scales_section",
			"label": "Scales Configuration",
			"fieldtype": "Section Break"
		},
		{
			"fieldname": "custom_scales",
			"label": "Scales",
			"fieldtype": "Table",
			"options": "POS Profile Scale",
		},
		{
			"fieldname": "custom_printing_section",
			"label": "Printing Settings",
			"fieldtype": "Section Break"
		},
		{
			"fieldname": "custom_pos_print_format_en",
			"label": "POS Print Template (English)",
			"fieldtype": "Link",
			"options": "Print Format",
			"description": "Thermal receipt print format used by the Sultan POS SPA",
		},
		{
			"fieldname": "custom_pos_print_format_ar",
			"label": "POS Print Template (Arabic)",
			"fieldtype": "Link",
			"options": "Print Format",
			"description": "Thermal receipt print format used by the Sultan POS SPA",
		},
		{
			"fieldname": "custom_prices_include_vat",
			"label": "Prices Include VAT in Print",
			"fieldtype": "Check",
		},
		{
			"fieldname": "custom_hide_tax_in_cart",
			"label": "Hide Tax in Cart and Print",
			"fieldtype": "Check",
		},
		{
			"fieldname": "custom_printing_col_break",
			"fieldtype": "Column Break"
		},
		{
			"fieldname": "custom_print_currency",
			"label": "Secondary Print Currency",
			"fieldtype": "Link",
			"options": "Currency",
			"description": "Additional currency to convert and display at the bottom of thermal receipts",
		},
		{
			"fieldname": "custom_delivery_section",
			"label": "Delivery Settings",
			"fieldtype": "Section Break"
		},
		{
			"fieldname": "custom_delivery_charge_account",
			"label": "Delivery Charge Account",
			"fieldtype": "Link",
			"options": "Account",
			"description": "Account where delivery fee income will be booked"
		},
		{
			"fieldname": "custom_allow_manual_delivery_fee",
			"label": "Allow Manual Delivery Fee",
			"fieldtype": "Check",
			"default": "0",
		},
		{
			"fieldname": "custom_delivery_col_break",
			"fieldtype": "Column Break"
		},
		{
			"fieldname": "custom_delivery_fees",
			"label": "Preset Delivery Fees",
			"fieldtype": "Table",
			"options": "POS Profile Delivery Fee",
		},
		{
			"fieldname": "custom_discount_writeoff_section",
			"label": "Discounts & Write-Offs",
			"fieldtype": "Section Break"
		},
		{
			"fieldname": "custom_discount_account",
			"label": "Discount Account",
			"fieldtype": "Link",
			"options": "Account",
			"description": "Account where POS discounts will be booked"
		},
		{
			"fieldname": "custom_allow_loyalty_points",
			"label": "Allow Loyalty Points",
			"fieldtype": "Check",
			"default": "1",
		},
		{
			"fieldname": "custom_allow_write_off",
			"label": "Allow Write Off",
			"fieldtype": "Check",
		},
		{
			"fieldname": "custom_discount_col_break",
			"fieldtype": "Column Break"
		},
		{
			"fieldname": "custom_ignore_write_off_on_partial_returns",
			"label": "Ignore Write Off on Partial Returns",
			"fieldtype": "Check",
			"default": "1",
		},
		{
			"fieldname": "custom_shift_settings_section",
			"label": "Shift Settings",
			"fieldtype": "Section Break"
		},
		{
			"fieldname": "custom_enable_shift_sequence",
			"label": "Enable Shift Sequence",
			"fieldtype": "Check"
		},
		{
			"fieldname": "custom_shift_sequence_prefix",
			"label": "Shift Sequence Prefix",
			"fieldtype": "Data"
		},
		{
			"fieldname": "custom_shift_sequence_start",
			"label": "Shift Sequence Start",
			"fieldtype": "Int",
			"default": "1"
		},
	]

	# Clean up old multi-currency fields on POS Profile if they exist
	old_pos_profile_fields = [
		"custom_enable_multi_currency",
		"custom_allow_edit_exchange_rate",
		"custom_multi_currency_rates",
		"custom_multi_currency_section",
		"custom_scale_barcodes_start_with"
	]
	if frappe.db.exists("Custom Field", "POS Payment Method-custom_exchange_rate"):
		frappe.delete_doc("Custom Field", "POS Payment Method-custom_exchange_rate", ignore_permissions=True)
		print("Deleted old POS Payment Method-custom_exchange_rate")
	for fieldname in old_pos_profile_fields:
		cf_name = f"POS Profile-{fieldname}"
		if frappe.db.exists("Custom Field", cf_name):
			frappe.delete_doc("Custom Field", cf_name, ignore_permissions=True)
			print(f"Deleted old POS Profile field: {cf_name}")

	# Insert or update POS Profile custom fields
	prev_fieldname = "project"
	for f in pos_fields:
		cf_name = f"POS Profile-{f['fieldname']}"
		f["dt"] = "POS Profile"
		f["insert_after"] = prev_fieldname

		if not frappe.db.exists("Custom Field", cf_name):
			doc = frappe.new_doc("Custom Field")
			for k, v in f.items():
				setattr(doc, k, v)
			doc.insert(ignore_permissions=True)
			print(f"Created {cf_name}.")
		else:
			doc = frappe.get_doc("Custom Field", cf_name)
			changed = False
			for k, v in f.items():
				if getattr(doc, k, None) != v:
					setattr(doc, k, v)
					changed = True
			if changed:
				doc.save(ignore_permissions=True)
				print(f"Updated {cf_name}.")
			else:
				print(f"{cf_name} already exists and is up to date.")

		prev_fieldname = f["fieldname"]

	# Clean up any leftover old klik POS settings section break
	if frappe.db.exists("Custom Field", "POS Profile-custom_klik_pos_settings"):
		frappe.delete_doc("Custom Field", "POS Profile-custom_klik_pos_settings", ignore_permissions=True)
		print("Deleted old POS Profile-custom_klik_pos_settings section break")

	# Add custom fields to POS Payment Method child table
	payment_method_fields = [
		{
			"fieldname": "custom_currency",
			"label": "Currency",
			"fieldtype": "Link",
			"options": "Currency",
			"in_list_view": 1,
			"read_only": 1,
			"insert_after": "mode_of_payment"
		}
	]
	for f in payment_method_fields:
		cf_name = f"POS Payment Method-{f['fieldname']}"
		f["dt"] = "POS Payment Method"
		if not frappe.db.exists("Custom Field", cf_name):
			doc = frappe.new_doc("Custom Field")
			for k, v in f.items():
				setattr(doc, k, v)
			doc.insert(ignore_permissions=True)
			print(f"Created {cf_name}.")
		else:
			doc = frappe.get_doc("Custom Field", cf_name)
			changed = False
			for k, v in f.items():
				if getattr(doc, k, None) != v:
					setattr(doc, k, v)
					changed = True
			if changed:
				doc.save(ignore_permissions=True)
				print(f"Updated {cf_name}.")

	frappe.clear_cache(doctype="POS Profile")
	frappe.clear_cache(doctype="POS Payment Method")


def ensure_custom_html_blocks():
	block_name = "POS Branch Dashboard Overview"
	html_content = """<div class="pos-dash-wrapper">
  <div class="pos-dash-header">
    <div style="flex: 1;"></div>
    <button class="btn btn-default pos-dash-refresh-btn" type="button" title="Refresh Dashboard">
      <i class="fa fa-refresh"></i>
    </button>
  </div>
  
  <div class="executive-metric-strip">
    <div class="metric-col">
      <div class="metric-header">
        <span class="metric-label">Online Branches</span>
      </div>
      <div class="metric-val-wrap">
        <span class="metric-big-val" id="val-online-branches">0 / 0</span>
      </div>
      <div class="metric-sub" id="sub-online-branches">Active POS profiles</div>
    </div>

    <div class="metric-divider"></div>

    <div class="metric-col">
      <div class="metric-header">
        <span class="metric-label">Open Sessions</span>
      </div>
      <div class="metric-val-wrap">
        <span class="metric-big-val" id="val-open-sessions">0</span>
      </div>
      <div class="metric-sub">Active terminal sessions</div>
    </div>

    <div class="metric-divider"></div>

    <div class="metric-col">
      <div class="metric-header">
        <span class="metric-label">Uncollected Delivery</span>
      </div>
      <div class="metric-val-wrap">
        <span class="metric-big-val" id="val-delivery-count">0 Orders</span>
      </div>
      <div class="metric-sub" id="sub-delivery-amount">Total: 0.00</div>
    </div>
  </div>

  <div class="pos-dash-charts">
    <div class="pos-dash-chart-box">
      <div class="chart-box-header">
        <div class="chart-box-title">Current Cash Balances</div>
        <div class="chart-box-badge">Cash Only</div>
      </div>
      <div id="pos-cash-bars" class="horizontal-bars-list"></div>
    </div>
    <div class="pos-dash-chart-box">
      <div class="chart-box-header">
        <div class="chart-box-title">Daily Sales by Branch</div>
        <div class="chart-box-badge">Today</div>
      </div>
      <div id="pos-sales-bars" class="horizontal-bars-list"></div>
    </div>
  </div>

  <div class="pos-dash-grid-two">
    <div class="pos-dash-panel-box">
      <div class="chart-box-header">
        <div class="chart-box-title">Top Selling Items</div>
        <select id="top-items-filter" class="form-control" style="width: 100px; padding: 2px 8px; height: 26px; font-size: 11px; background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer;">
          <option value="Today">Today</option>
          <option value="This Week">This Week</option>
          <option value="This Month">This Month</option>
          <option value="This Year">This Year</option>
          <option value="Last Year">Last Year</option>
          <option value="All Time">All Time</option>
        </select>
      </div>
      <div id="top-items-list" class="dash-list-wrapper"></div>
    </div>
    <div class="pos-dash-panel-box">
      <div class="chart-box-header">
        <div class="chart-box-title">Uncollected Delivery Companies</div>
        <div class="chart-box-badge">Pending Settlement</div>
      </div>
      <div id="delivery-companies-list" class="dash-list-wrapper"></div>
    </div>
  </div>
</div>"""

	style_content = """.pos-dash-wrapper {
  padding: 24px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 2px 4px rgba(15, 23, 42, 0.03);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #0f172a;
}

.pos-dash-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.pos-dash-refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.pos-dash-refresh-btn:hover {
  background: #f8fafc;
  color: #0f172a;
}

.sync-icon {
  transition: transform 0.3s ease;
}

.sync-icon.spin {
  animation: spin-anim 1s linear infinite;
}

@keyframes spin-anim {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.executive-metric-strip {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.02);
}

@media (max-width: 768px) {
  .executive-metric-strip {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }
  .metric-divider {
    display: none;
  }
}

.metric-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-header {
  display: flex;
  align-items: center;
}

.metric-label {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.7px;
}

.metric-val-wrap {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 2px;
}

.metric-big-val {
  font-size: 28px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.1;
  letter-spacing: -0.5px;
}

.metric-denom-val {
  font-size: 18px;
  font-weight: 600;
  color: #94a3b8;
}

.metric-unit-text {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
}

.metric-sub {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.metric-divider {
  width: 1px;
  height: 40px;
  background: #e2e8f0;
  margin: 0 24px;
}

.pos-dash-charts {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

@media (max-width: 900px) {
  .pos-dash-charts {
    grid-template-columns: 1fr;
  }
}

.pos-dash-grid-two {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

@media (max-width: 900px) {
  .pos-dash-grid-two {
    grid-template-columns: 1fr;
  }
}

.pos-dash-chart-box, .pos-dash-panel-box {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}

.chart-box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.chart-box-title {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
}

.chart-box-badge {
  font-size: 11px;
  font-weight: 600;
  background: #f1f5f9;
  color: #475569;
  padding: 3px 8px;
  border-radius: 6px;
}

.horizontal-bars-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.hbar-name {
  width: 170px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  white-space: normal;
  line-height: 1.3;
}

.hbar-track {
  flex: 1;
  height: 10px;
  background: #f1f5f9;
  border-radius: 9999px;
  overflow: hidden;
}

.hbar-fill-navy {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, #162d98, #2563eb);
}

.hbar-fill-blue {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, #2563eb, #3b82f6);
}

.hbar-val {
  min-width: 95px;
  text-align: right;
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.dash-list-wrapper {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dash-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
}

.dash-item-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.dash-rank-badge {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #334155;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dash-item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.dash-item-title {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dash-item-sub {
  font-size: 11px;
  color: #64748b;
}

.dash-item-val {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.empty-state-text {
  font-size: 13px;
  color: #94a3b8;
  text-align: center;
  padding: 20px 0;
}
"""

	script_content = """function formatNum(v) {
  return (v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildHorizontalBars(container, labels, values, fillClass) {
  if (!container) return;
  container.innerHTML = "";

  let maxVal = Math.max(...values, 0);
  if (maxVal <= 0) maxVal = 1;

  labels.forEach(function(label, idx) {
    let val = values[idx] || 0;
    let pct = Math.round((val / maxVal) * 100);
    if (val > 0 && pct < 3) pct = 3;

    let row = document.createElement("div");
    row.className = "hbar-row";

    let nameDiv = document.createElement("div");
    nameDiv.className = "hbar-name";
    nameDiv.textContent = label;

    let trackDiv = document.createElement("div");
    trackDiv.className = "hbar-track";

    let fillDiv = document.createElement("div");
    fillDiv.className = fillClass;
    fillDiv.style.width = pct + "%";
    trackDiv.appendChild(fillDiv);

    let valDiv = document.createElement("div");
    valDiv.className = "hbar-val";
    valDiv.textContent = formatNum(val);

    row.appendChild(nameDiv);
    row.appendChild(trackDiv);
    row.appendChild(valDiv);

    container.appendChild(row);
  });
}

function buildCashBreakdown(container, cashBreakdown) {
  if (!container) return;
  container.innerHTML = "";
  
  if (!cashBreakdown || Object.keys(cashBreakdown).length === 0) {
     container.innerHTML = '<div class="empty-state-text">No cash collected yet</div>';
     return;
  }
  
  let maxVal = 1;
  for (let branch in cashBreakdown) {
     cashBreakdown[branch].forEach(item => {
        if (item.amount > maxVal) maxVal = item.amount;
     });
  }

  for (let branch in cashBreakdown) {
     let isFirst = true;
     cashBreakdown[branch].forEach(item => {
        let val = item.amount || 0;
        let pct = Math.round((val / maxVal) * 100);
        if (val > 0 && pct < 3) pct = 3;
        
        let row = document.createElement("div");
        row.className = "hbar-row";
        row.style.marginBottom = "8px";

        let branchDiv = document.createElement("div");
        branchDiv.style.width = "90px";
        branchDiv.style.fontSize = "12px";
        branchDiv.style.fontWeight = "600";
        branchDiv.style.color = "#1e293b";
        branchDiv.style.whiteSpace = "nowrap";
        branchDiv.style.overflow = "hidden";
        branchDiv.style.textOverflow = "ellipsis";
        branchDiv.textContent = isFirst ? branch : "";

        let nameDiv = document.createElement("div");
        nameDiv.className = "hbar-name";
        nameDiv.style.width = "50px";
        nameDiv.style.fontSize = "12px";
        nameDiv.style.color = "#64748b";
        let currMatch = item.mode.match(/\((.*?)\)/);
        let currStr = currMatch ? " " + currMatch[1] : "";
        let modeName = currMatch ? item.mode.replace(/\(.*?\)/, "").trim() : item.mode;
        nameDiv.textContent = modeName; 

        let trackDiv = document.createElement("div");
        trackDiv.className = "hbar-track";

        let fillDiv = document.createElement("div");
        fillDiv.className = "hbar-fill-navy";
        fillDiv.style.width = pct + "%";
        trackDiv.appendChild(fillDiv);

        let valDiv = document.createElement("div");
        valDiv.className = "hbar-val";
        valDiv.style.fontWeight = "600";
        valDiv.textContent = formatNum(val) + currStr; 

        row.appendChild(branchDiv);
        row.appendChild(nameDiv);
        row.appendChild(trackDiv);
        row.appendChild(valDiv);

        container.appendChild(row);
        isFirst = false;
     });
  }
}

function renderTopItems(container, items) {
  if (!container) return;
  container.innerHTML = "";
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state-text">No items sold yet</div>';
    return;
  }

  items.forEach(function(item, idx) {
    let div = document.createElement("div");
    div.className = "dash-list-item";

    let left = document.createElement("div");
    left.className = "dash-item-left";

    let rank = document.createElement("div");
    rank.className = "dash-rank-badge";
    rank.textContent = (idx + 1);

    let info = document.createElement("div");
    info.className = "dash-item-info";

    let title = document.createElement("div");
    title.className = "dash-item-title";
    title.textContent = item.item_name;

    let qtyBadge = document.createElement("div");
    qtyBadge.className = "dash-item-qty-badge";
    let qtyStr = parseFloat(item.total_qty).toString();
    qtyBadge.textContent = qtyStr + " Units";

    info.appendChild(title);

    left.appendChild(rank);
    left.appendChild(info);

    div.appendChild(left);
    div.appendChild(qtyBadge);

    container.appendChild(div);
  });
}

function renderDeliveryCompanies(container, companies) {
  if (!container) return;
  container.innerHTML = "";
  if (!companies || companies.length === 0) {
    container.innerHTML = '<div class="empty-state-text">All delivery orders collected</div>';
    return;
  }

  companies.forEach(function(comp) {
    let div = document.createElement("div");
    div.className = "dash-list-item";

    let left = document.createElement("div");
    left.className = "dash-item-left";

    let info = document.createElement("div");
    info.className = "dash-item-info";

    let title = document.createElement("div");
    title.className = "dash-item-title";
    title.textContent = comp.company;

    let sub = document.createElement("div");
    sub.className = "dash-item-sub";
    sub.textContent = comp.count + " uncollected orders";

    info.appendChild(title);
    info.appendChild(sub);
    left.appendChild(info);

    let right = document.createElement("div");
    right.className = "dash-item-val";
    right.textContent = formatNum(comp.amount);

    div.appendChild(left);
    div.appendChild(right);

    container.appendChild(div);
  });
}

function renderDashboardData() {
  let btn = root_element.querySelector(".pos-dash-refresh-btn");
  let icon = root_element.querySelector(".fa-refresh");
  if (icon) icon.classList.add("fa-spin");

  frappe.call({
    method: "managely_terminal.managely_terminal.api.pos_dashboard.get_pos_dashboard_data",
    callback: function(r) {
      if (icon) icon.classList.remove("fa-spin");
      if (!r.message) return;
      let data = r.message;

      let elOnline = root_element.querySelector("#val-online-branches");
      let elSubOnline = root_element.querySelector("#sub-online-branches");
      let elSessions = root_element.querySelector("#val-open-sessions");
      let elDelivCount = root_element.querySelector("#val-delivery-count");
      let elDelivSub = root_element.querySelector("#sub-delivery-amount");

      if (elOnline) {
        elOnline.textContent = (data.online_branches_count || 0) + " / " + (data.total_branches_count || 0);
      }
      if (elSubOnline) {
        elSubOnline.textContent = (data.online_branches_count || 0) + " online of " + (data.total_branches_count || 0) + " branches";
      }
      if (elSessions) {
        elSessions.textContent = data.open_sessions_count || 0;
      }

      if (elDelivCount && data.uncollected_delivery) {
        elDelivCount.innerHTML = (data.uncollected_delivery.total_count || 0) + ' <span style="font-size: 15px; color: #64748b; font-weight: 600;">Orders</span>';
      }
      if (elDelivSub && data.uncollected_delivery) {
        elDelivSub.textContent = "Total: " + formatNum(data.uncollected_delivery.total_amount);
      }

      let cashContainer = root_element.querySelector("#pos-cash-bars");
      if (cashContainer && data.cash_breakdown) {
        buildCashBreakdown(cashContainer, data.cash_breakdown);
      }

      let salesContainer = root_element.querySelector("#pos-sales-bars");
      if (salesContainer && data.daily_sales_chart) {
        buildHorizontalBars(salesContainer, data.daily_sales_chart.labels, data.daily_sales_chart.datasets[0].values, "hbar-fill-blue");
      }

      let topItemsContainer = root_element.querySelector("#top-items-list");
      if (topItemsContainer) {
        renderTopItems(topItemsContainer, data.top_items);
      }

      let delivContainer = root_element.querySelector("#delivery-companies-list");
      if (delivContainer && data.uncollected_delivery) {
        renderDeliveryCompanies(delivContainer, data.uncollected_delivery.companies);
      }
    }
  });
}

let btn = root_element.querySelector(".pos-dash-refresh-btn");
if (btn) {
  btn.addEventListener("click", function() {
    renderDashboardData();
  });
}

let filterDropdown = root_element.querySelector("#top-items-filter");
if (filterDropdown) {
  filterDropdown.addEventListener("change", function(e) {
    let topItemsContainer = root_element.querySelector("#top-items-list");
    if (!topItemsContainer) return;
    
    topItemsContainer.style.opacity = "0.5";
    
    frappe.call({
      method: "managely_terminal.managely_terminal.api.pos_dashboard.get_filtered_top_items",
      args: { date_filter: e.target.value },
      callback: function(r) {
        if (!r.exc && r.message) {
          renderTopItems(topItemsContainer, r.message);
          topItemsContainer.style.opacity = "1";
        }
      }
    });
  });
}

renderDashboardData();"""

	if not frappe.db.exists("Custom HTML Block", block_name):
		doc = frappe.get_doc({
			"doctype": "Custom HTML Block",
			"name": block_name,
			"html": html_content,
			"style": style_content,
			"script": script_content,
			"private": 0
		})
		doc.insert(ignore_permissions=True)
		print(f"Created Custom HTML Block: {block_name}")
	else:
		doc = frappe.get_doc("Custom HTML Block", block_name)
		doc.html = html_content
		doc.style = style_content
		doc.script = script_content
		doc.save(ignore_permissions=True)
		print(f"Updated Custom HTML Block: {block_name}")