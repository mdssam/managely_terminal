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


_TXN_TYPE_OPTIONS = "Cash In\nCash Out\nOpening Difference\nClosing Difference"


def _upgrade_sultan_pos_cash_transaction_type():
    """Ensure Sultan POS Cash Transaction has all 4 options and mode_of_payment field."""
    # Ensure transaction_type has all 4 options and is read-only
    row = frappe.db.get_value(
        "DocField",
        {"parent": "Sultan POS Cash Transaction", "fieldname": "transaction_type"},
        ["name", "options", "read_only", "default"],
        as_dict=True,
    )
    if not row:
        return
    needs_update = (
        row.options != _TXN_TYPE_OPTIONS
        or not row.read_only
        or row.default != "Cash In"
    )
    if needs_update:
        frappe.db.set_value("DocField", row.name, {
            "options": _TXN_TYPE_OPTIONS,
            "read_only": 1,
            "default": "Cash In",
        })
        frappe.clear_cache(doctype="Sultan POS Cash Transaction")
        print("Upgraded Sultan POS Cash Transaction.transaction_type options.")
    else:
        print("Sultan POS Cash Transaction.transaction_type already up-to-date.")

    # Ensure mode_of_payment field exists (added after initial doctype creation)
    mop_field = frappe.db.get_value(
        "DocField",
        {"parent": "Sultan POS Cash Transaction", "fieldname": "mode_of_payment"},
        "name",
    )
    if not mop_field:
        # Find the idx of pos_profile to insert after it
        pos_profile_idx = frappe.db.get_value(
            "DocField",
            {"parent": "Sultan POS Cash Transaction", "fieldname": "pos_profile"},
            "idx",
        ) or 0
        new_field = frappe.new_doc("DocField")
        new_field.parent = "Sultan POS Cash Transaction"
        new_field.parenttype = "DocType"
        new_field.parentfield = "fields"
        new_field.fieldname = "mode_of_payment"
        new_field.label = "Mode of Payment"
        new_field.fieldtype = "Link"
        new_field.options = "Mode of Payment"
        new_field.idx = pos_profile_idx + 1
        new_field.insert(ignore_permissions=True)
        # Add the actual DB column
        if not frappe.db.has_column("Sultan POS Cash Transaction", "mode_of_payment"):
            frappe.db.add_column("Sultan POS Cash Transaction", "mode_of_payment", "varchar(140)")
        frappe.clear_cache(doctype="Sultan POS Cash Transaction")
        print("Added mode_of_payment field to Sultan POS Cash Transaction.")
    else:
        print("Sultan POS Cash Transaction.mode_of_payment already exists.")


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
					"fieldtype": "Data",
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
		doc = frappe.get_doc("DocType", "Klik Sales Invoice Reference")
		modified = False
		for field in doc.fields:
			if field.fieldname == "sales_invoice" and (field.fieldtype != "Data" or field.options):
				field.fieldtype = "Data"
				field.options = None
				modified = True
		if modified:
			doc.save(ignore_permissions=True)
			print("Updated Klik Sales Invoice Reference fields to allow Data")
		else:
			print("Custom DocType Klik Sales Invoice Reference already exists and is up to date.")

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

	# ── Multi-Currency Payment ───────────────────────────────────────────────
	for cf_def in [
		{
			"cf_name": "POS Profile-custom_multi_currency_section",
			"dt": "POS Profile", "fieldname": "custom_multi_currency_section",
			"label": "Multi-Currency Payments", "fieldtype": "Section Break",
			"insert_after": "disable_rounded_total",
		},
		{
			"cf_name": "POS Profile-custom_enable_multi_currency",
			"dt": "POS Profile", "fieldname": "custom_enable_multi_currency",
			"label": "Enable Multi-Currency", "fieldtype": "Check",
			"insert_after": "custom_multi_currency_section",
			"description": "Allow cashiers to accept payment in a secondary currency (e.g., LBP alongside USD).",
		},
		{
			"cf_name": "POS Profile-custom_secondary_currency",
			"dt": "POS Profile", "fieldname": "custom_secondary_currency",
			"label": "Secondary Currency", "fieldtype": "Link",
			"options": "Currency",
			"insert_after": "custom_enable_multi_currency",
			"depends_on": "eval:doc.custom_enable_multi_currency",
		},
		{
			"cf_name": "POS Profile-custom_exchange_rate",
			"dt": "POS Profile", "fieldname": "custom_exchange_rate",
			"label": "Exchange Rate (Secondary per Base)", "fieldtype": "Float",
			"precision": "2",
			"insert_after": "custom_secondary_currency",
			"depends_on": "eval:doc.custom_enable_multi_currency",
			"description": "Units of secondary currency per 1 unit of base currency (e.g., 89500 if 1 USD = 89,500 LBP).",
		},
	]:
		cf_name = cf_def.pop("cf_name")
		if not frappe.db.exists("Custom Field", cf_name):
			doc = frappe.new_doc("Custom Field")
			for k, v in cf_def.items():
				setattr(doc, k, v)
			doc.insert(ignore_permissions=True)
			print(f"Created {cf_name}.")
		else:
			print(f"{cf_name} already exists.")

	# ── Consolidate Invoice on Close ─────────────────────────────────────────
	consolidate_cf = "POS Profile-custom_consolidate_invoicing"
	if not frappe.db.exists("Custom Field", consolidate_cf):
		frappe.get_doc({
			"doctype": "Custom Field",
			"dt": "POS Profile",
			"fieldname": "custom_consolidate_invoicing",
			"label": "Consolidate Invoice on Close",
			"fieldtype": "Check",
			"insert_after": "write_off_account",
			"description": (
				"When enabled, each order is saved as a draft (no GL or stock impact). "
				"All drafts are submitted in batch when the session is closed."
			),
		}).insert(ignore_permissions=True)
		print("Created custom_consolidate_invoicing on POS Profile.")
	else:
		print("custom_consolidate_invoicing already exists.")

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

	# ── Is Branch ───────────────────────────────────────────────────────────
	is_branch_cf = "POS Profile-custom_is_branch"
	if not frappe.db.exists("Custom Field", is_branch_cf):
		frappe.get_doc({
			"doctype": "Custom Field",
			"dt": "POS Profile",
			"fieldname": "custom_is_branch",
			"label": "Is Branch",
			"fieldtype": "Check",
			"insert_after": "custom_exchange_rate_editable",
			"description": "Mark this POS Profile as a branch (instead of a delegate/salesman)."
		}).insert(ignore_permissions=True)
		print("Created custom_is_branch on POS Profile.")
	else:
		print("custom_is_branch already exists.")

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
				 "options": "Cash In\nCash Out\nOpening Difference\nClosing Difference",
				 "reqd": 1, "in_list_view": 1, "read_only": 1, "default": "Cash In"},
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
		# Upgrade existing DocType: ensure transaction_type has all 4 options and is read_only
		_upgrade_sultan_pos_cash_transaction_type()

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

	if not frappe.db.exists("DocType", "Allowed POS Profile"):
		doc = frappe.get_doc({
			"doctype": "DocType",
			"name": "Allowed POS Profile",
			"module": "Sultan",
			"custom": 1,
			"istable": 1,
			"fields": [
				{
					"fieldname": "pos_profile",
					"label": "POS Profile",
					"fieldtype": "Link",
					"options": "POS Profile",
					"in_list_view": 1,
					"reqd": 1
				}
			]
		})
		doc.insert(ignore_permissions=True)
		print("Created Custom DocType Allowed POS Profile")

	if not frappe.db.exists("DocType", "POS Security Incident"):
		frappe.get_doc({
			"doctype": "DocType",
			"name": "POS Security Incident",
			"module": "Sultan",
			"custom": 1,
			"autoname": "hash",
			"fields": [
				{
					"fieldname": "incident_id",
					"label": "Incident ID",
					"fieldtype": "Data",
					"reqd": 1,
					"in_list_view": 1
				},
				{
					"fieldname": "timestamp",
					"label": "Timestamp",
					"fieldtype": "Datetime",
					"reqd": 1,
					"in_list_view": 1
				},
				{
					"fieldname": "cashier",
					"label": "Cashier",
					"fieldtype": "Data",
					"in_list_view": 1
				},
				{
					"fieldname": "incident_type",
					"label": "Incident Type",
					"fieldtype": "Select",
					"options": "Console Opened\nDatabase Tampered\nUnauthorized Access",
					"in_list_view": 1,
					"reqd": 1
				},
				{
					"fieldname": "details",
					"label": "Details",
					"fieldtype": "Small Text",
					"in_list_view": 1
				}
			],
			"permissions": [
				{"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
				{"role": "Administrator", "read": 1, "write": 1, "create": 1, "delete": 1}
			]
		}).insert(ignore_permissions=True)
		print("Created Custom DocType POS Security Incident")

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

	# Dynamic Multi-Stamp Settings
	if not frappe.db.exists("DocType", "Sultan Stamp Setting"):
		frappe.get_doc({
			"doctype": "DocType",
			"name": "Sultan Stamp Setting",
			"module": "Sultan",
			"custom": 1,
			"istable": 1,
			"fields": [
				{
					"fieldname": "stamp_name",
					"label": "Stamp Name",
					"fieldtype": "Data",
					"reqd": 1,
					"in_list_view": 1
				},
				{
					"fieldname": "amount_lbp",
					"label": "Stamp Amount LBP",
					"fieldtype": "Currency",
					"reqd": 1,
					"in_list_view": 1,
					"precision": "0"
				},
				{
					"fieldname": "account",
					"label": "Account",
					"fieldtype": "Link",
					"options": "Account",
					"reqd": 1,
					"in_list_view": 1
				},
				{
					"fieldname": "currency",
					"label": "Currency",
					"fieldtype": "Link",
					"options": "Currency",
					"read_only": 1,
					"in_list_view": 1,
					"fetch_from": "account.account_currency"
				},
				{
					"fieldname": "description",
					"label": "Description",
					"fieldtype": "Data",
					"in_list_view": 1
				}
			]
		}).insert(ignore_permissions=True)
		print("Created Custom DocType Sultan Stamp Setting")
	else:
		# Check and add currency field if missing on existing DocType
		stamp_setting_meta = frappe.get_doc("DocType", "Sultan Stamp Setting")
		if not any(f.fieldname == "currency" for f in stamp_setting_meta.fields):
			stamp_setting_meta.append("fields", {
				"fieldname": "currency",
				"label": "Currency",
				"fieldtype": "Link",
				"options": "Currency",
				"read_only": 1,
				"in_list_view": 1,
				"fetch_from": "account.account_currency"
			})
			stamp_setting_meta.save(ignore_permissions=True)
			print("Added currency field to existing Sultan Stamp Setting DocType")

	if not frappe.db.exists("DocType", "Sultan Settings"):
		frappe.get_doc({
			"doctype": "DocType",
			"name": "Sultan Settings",
			"module": "Sultan",
			"custom": 1,
			"issingle": 1,
			"fields": [
				{
					"fieldname": "stamps",
					"label": "Stamps",
					"fieldtype": "Table",
					"options": "Sultan Stamp Setting"
				}
			],
			"permissions": [
				{"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
				{"role": "Accounts User", "read": 1, "write": 1}
			]
		}).insert(ignore_permissions=True)
		print("Created Custom Single DocType Sultan Settings")

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

