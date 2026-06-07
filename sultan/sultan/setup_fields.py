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

	# Custom Child DocType for Sales Invoices in POS Closing Entry
	if not frappe.db.exists("DocType", "Klik Sales Invoice Reference"):
		doc = frappe.get_doc({
			"doctype": "DocType",
			"name": "Klik Sales Invoice Reference",
			"module": "Sultan",
			"custom": 1,
			"istable": 1,
			"fields": [
				{
					"fieldname": "sales_invoice",
					"label": "Sales Invoice",
					"fieldtype": "Link",
					"options": "Sales Invoice",
					"in_list_view": 1,
					"reqd": 1
				},
				{
					"fieldname": "customer",
					"label": "Customer",
					"fieldtype": "Link",
					"options": "Customer",
					"in_list_view": 1
				},
				{
					"fieldname": "posting_date",
					"label": "Posting Date",
					"fieldtype": "Date",
					"in_list_view": 1
				},
				{
					"fieldname": "amount",
					"label": "Amount",
					"fieldtype": "Currency",
					"in_list_view": 1
				}
			]
		})
		doc.insert(ignore_permissions=True)
		print("Created Custom DocType Klik Sales Invoice Reference")
	else:
		print("Custom DocType Klik Sales Invoice Reference already exists.")

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

	# Custom field for Role
	role_name = "POS Profile User-custom_role"
	if not frappe.db.exists("Custom Field", role_name):
		doc = frappe.new_doc("Custom Field")
		doc.dt = "POS Profile User"
		doc.fieldname = "custom_role"
		doc.label = "Role"
		doc.fieldtype = "Select"
		doc.options = "\nCashier\nMenu User\nAdministrator"
		doc.insert(ignore_permissions=True)
		print("Created custom_role field.")
	else:
		print("custom_role field already exists.")

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

	# ── POS Print Format per terminal ────────────────────────────────────────
	for fieldname, label, after in [
		("custom_pos_print_format_en", "POS Print Template (English)", "write_off_account"),
		("custom_pos_print_format_ar", "POS Print Template (Arabic)", "custom_pos_print_format_en"),
	]:
		cf = f"POS Profile-{fieldname}"
		if not frappe.db.exists("Custom Field", cf):
			frappe.get_doc({
				"doctype": "Custom Field",
				"dt": "POS Profile",
				"fieldname": fieldname,
				"label": label,
				"fieldtype": "Link",
				"options": "Print Format",
				"insert_after": after,
				"description": "Thermal receipt print format used by the Sultan POS SPA",
			}).insert(ignore_permissions=True)
			print(f"Created {fieldname} on POS Profile.")
		else:
			print(f"{fieldname} already exists.")

	# ── Items 1 & 7: Sultan POS Cash Transaction doctype ─────────────────────
	if not frappe.db.exists("DocType", "Sultan POS Cash Transaction"):
		txn_doc = frappe.get_doc({
			"doctype": "DocType",
			"name": "Sultan POS Cash Transaction",
			"module": "Sultan",
			"custom": 1,
			"naming_rule": "By \"Naming Series\" field",
			"autoname": "naming_series:",
			"is_submittable": 1,
			"track_changes": 1,
			"fields": [
				{"fieldname": "naming_series", "label": "Series", "fieldtype": "Select",
				 "options": "CASH-IO-.YYYY.-.####\n", "default": "CASH-IO-.YYYY.-.####", "reqd": 1},
				{"fieldname": "transaction_type", "label": "Transaction Type", "fieldtype": "Select",
				 "options": "Cash In\nCash Out", "reqd": 1, "in_list_view": 1},
				{"fieldname": "amount", "label": "Amount", "fieldtype": "Currency", "reqd": 1, "in_list_view": 1},
				{"fieldname": "description", "label": "Description", "fieldtype": "Small Text", "in_list_view": 1},
				{"fieldname": "col_break_1", "fieldtype": "Column Break"},
				{"fieldname": "pos_opening_entry", "label": "POS Opening Entry", "fieldtype": "Link",
				 "options": "POS Opening Entry", "reqd": 1},
				{"fieldname": "pos_profile", "label": "POS Profile", "fieldtype": "Link",
				 "options": "POS Profile", "read_only": 1},
				{"fieldname": "posting_date", "label": "Posting Date", "fieldtype": "Date",
				 "default": "Today", "reqd": 1},
				{"fieldname": "posting_time", "label": "Posting Time", "fieldtype": "Time"},
				{"fieldname": "sec_accounts", "label": "Accounts", "fieldtype": "Section Break"},
				# Cash In  → Debit = POS cash (read-only), Credit = bucket (editable)
				# Cash Out → Debit = bucket (editable), Credit = POS cash (read-only)
				{"fieldname": "account_debit", "label": "Account (Debit)", "fieldtype": "Link",
				 "options": "Account", "in_list_view": 0},
				{"fieldname": "account_credit", "label": "Account (Credit)", "fieldtype": "Link",
				 "options": "Account", "in_list_view": 0},
				{"fieldname": "currency", "label": "Currency", "fieldtype": "Link", "options": "Currency"},
				{"fieldname": "linked_journal_entry", "label": "Journal Entry", "fieldtype": "Link",
				 "options": "Journal Entry", "read_only": 1},
				{"fieldname": "cashier_employee", "label": "Cashier Employee", "fieldtype": "Link",
				 "options": "Employee"},
			],
			"permissions": [
				{"role": "System Manager", "read": 1, "write": 1, "create": 1,
				 "delete": 1, "submit": 1, "cancel": 1, "amend": 1},
				{"role": "Accounts User", "read": 1, "write": 1, "create": 1, "submit": 1},
			]
		})
		txn_doc.insert(ignore_permissions=True)
		print("Created Sultan POS Cash Transaction doctype.")
	else:
		print("Sultan POS Cash Transaction already exists.")

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

	frappe.clear_cache(doctype="POS Profile")
	frappe.clear_cache(doctype="Sales Invoice")
	frappe.clear_cache(doctype="Employee")
	frappe.db.commit()
