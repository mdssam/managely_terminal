import frappe
from sultan.sultan.api.thermal_receipts import create_thermal_print_formats
from sultan.sultan.accounting.customizations import setup_custom_fields as setup_accounting_custom_fields


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



def run():
	setup_accounting_custom_fields()



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
				"fieldname": "custom_delivery_personnel",
				"label": "Delivery Personnel",
				"fieldtype": "Link" if frappe.db.exists("DocType", "Delivery Personnel") else "Data",
				"options": "Delivery Personnel" if frappe.db.exists("DocType", "Delivery Personnel") else None,
				"insert_after": "customer"
			},
			{
				"dt": dt,
				"fieldname": "custom_delivery_status",
				"label": "Delivery Status",
				"fieldtype": "Select",
				"options": "Pending\nOut for Delivery\nDelivered\nSettled\nCancelled",
				"default": "Pending",
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
	ensure_sultan_pos_profile_fields()

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
	# app. Sultan only provides the SPA integration; install pos_cash_in_out to
	# enable the Cash I/O button.

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

	# Sultan Stamp Setting and Sultan Settings DocTypes are now standard

# 	# Custom field for POS Invoice to avoid erpnext 15 AttributeError
# 	pos_invoice_roundoff_cost_center = "POS Invoice-use_company_roundoff_cost_center"
# 	if not frappe.db.exists("Custom Field", pos_invoice_roundoff_cost_center):
# 		doc = frappe.get_doc({
# 			"doctype": "Custom Field",
# 			"dt": "POS Invoice",
# 			"fieldname": "use_company_roundoff_cost_center",
# 			"label": "Use Company Roundoff Cost Center",
# 			"fieldtype": "Check",
# 			"insert_after": "company"
# 		})
# 		doc.insert(ignore_permissions=True)
# 		print("Created use_company_roundoff_cost_center custom field on POS Invoice.")

	frappe.clear_cache(doctype="POS Profile")
	frappe.clear_cache(doctype="Sales Invoice")
	frappe.clear_cache(doctype="Employee")
	frappe.clear_cache(doctype="Sultan Settings")
	
	# Automate symlinking sw.js to the site's public directory under /sultan_spa/sw.js
	setup_sultan_spa_sw_link()
	
	frappe.db.commit()


def setup_sultan_spa_sw_link():
	import os
	public_path = frappe.get_site_path("public")
	sultan_spa_path = os.path.join(public_path, "sultan_spa")
	
	# Ensure the site's public/sultan_spa directory exists
	os.makedirs(sultan_spa_path, exist_ok=True)
	
	src_sw_path = frappe.get_app_path("sultan", "public", "sultan_spa", "sw.js")
	dest_sw_path = os.path.join(sultan_spa_path, "sw.js")
	
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


def ensure_sultan_pos_profile_fields():
	"""Set up Sultan app config fields under a unified Tab Break on POS Profile."""
	# 1. Define fields to keep (excluding old multi-currency fields)
	pos_fields = [
		{
			"fieldname": "custom_sultan_pos_settings_tab",
			"label": "Sultan POS Settings",
			"fieldtype": "Tab Break",
		},
		{
			"fieldname": "custom_sultan_business_section",
			"label": "Business Configuration",
			"fieldtype": "Section Break",
		},
		{
			"fieldname": "custom_is_branch",
			"label": "Is Branch",
			"fieldtype": "Check",
			"description": "Mark this POS Profile as a branch (instead of a delegate/salesman).",
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
			"fieldname": "custom_default_view",
			"label": "Default View",
			"fieldtype": "Select",
			"options": "\nGrid View\nList View",
			"default": "Grid View",
			"translatable": 0,
		},
		{
			"fieldname": "custom_sultan_printing_section",
			"label": "Receipt Printing Templates",
			"fieldtype": "Section Break",
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
			"fieldname": "custom_print_currency",
			"label": "Secondary Print Currency",
			"fieldtype": "Link",
			"options": "Currency",
			"description": "Additional currency to automatically convert and display at the bottom of thermal receipts (e.g. LBP or USD)",
		},
		{
			"fieldname": "custom_sultan_hardware_section",
			"label": "Hardware & Scale Settings",
			"fieldtype": "Section Break",
		},
		{
			"fieldname": "custom_use_scanner_fully",
			"label": "Use Scanner Fully",
			"fieldtype": "Check",
		},
		{
			"fieldname": "custom_scale_barcodes_start_with",
			"label": "Barcode Start Pattern",
			"fieldtype": "Data",
		},
		{
			"fieldname": "custom_sultan_checkout_section",
			"label": "Checkout & Session Settings",
			"fieldtype": "Section Break",
		},
		{
			"fieldname": "custom_delivery_required",
			"label": "Delivery Required?",
			"fieldtype": "Check",
		},
		{
			"fieldname": "custom_delivery_charge_account",
			"label": "Delivery Charge Account",
			"fieldtype": "Link",
			"options": "Account",
			"description": "Account where delivery fee income will be booked"
		},
		{
			"fieldname": "custom_consolidate_invoicing",
			"label": "Consolidate Invoice on Close",
			"fieldtype": "Check",
			"description": "When enabled, each order is saved as a draft (no GL or stock impact). All drafts are submitted in batch when the session is closed.",
		},
		{
			"fieldname": "custom_hide_expected_amount",
			"label": "Hide Expected Amount",
			"fieldtype": "Check",
		},
		{
			"fieldname": "custom_sultan_notifications_section",
			"label": "Customer Notifications",
			"fieldtype": "Section Break",
		},
		{
			"fieldname": "custom_enable_whatsapp",
			"label": "Enable Whatsapp",
			"fieldtype": "Check",
		},
		{
			"fieldname": "custom_enable_sms",
			"label": "Enable SMS",
			"fieldtype": "Check",
		},
		{
			"fieldname": "custom_email_template",
			"label": "Email Template",
			"fieldtype": "Link",
			"options": "Email Template",
		},
		{
			"fieldname": "custom_sultan_write_off_section",
			"label": "Write-Off Settings",
			"fieldtype": "Section Break",
		},
		{
			"fieldname": "custom_allow_write_off",
			"label": "Allow Write Off",
			"fieldtype": "Check",
		},
		{
			"fieldname": "custom_ignore_write_off_on_partial_returns",
			"label": "Ignore Write Off on Partial Returns",
			"fieldtype": "Check",
			"default": "1",
		},
	]

	# Clean up old multi-currency fields on POS Profile if they exist
	old_pos_profile_fields = [
		"custom_enable_multi_currency",
		"custom_allow_edit_exchange_rate",
		"custom_multi_currency_rates",
		"custom_multi_currency_section"
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
	prev_fieldname = "applicable_user"
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

