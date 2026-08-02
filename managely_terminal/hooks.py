app_name = "managely_terminal"
app_title = "Managely Terminal"
app_publisher = "Tati"
app_description = "For manufacturing and pos"
app_email = "info@managely.cloud"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen removed for Web POS

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/managely_terminal/css/managely_terminal.css"
# app_include_js = "/assets/managely_terminal/js/managely_terminal_pos_modifier.js"

# page_js = {"point-of-sale": "public/js/pos_extension.js"}

# include js, css files in header of web template
# web_include_css = "/assets/managely_terminal/css/managely_terminal.css"
# web_include_js = "/assets/managely_terminal/js/managely_terminal.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "managely_terminal/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
	"Sales Invoice": "public/js/doctype/accounting_addendum.js",
	"Purchase Invoice": "public/js/doctype/accounting_addendum.js",
	"Payment Entry": "public/js/doctype/accounting_addendum.js",
	"Journal Entry": "public/js/doctype/accounting_addendum.js",
	"Account": "public/js/doctype/account_autonumber.js",
	"Employee": "public/js/doctype/employee_pos_login.js",
	"POS Closing Entry": "public/js/pos_closing_entry_extension.js",
	"POS Profile": "public/js/doctype/pos_profile.js",
}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
doctype_tree_js = {"Account": "public/js/doctype/account_autonumber.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "managely_terminal/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]



# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "managely_terminal.utils.jinja_methods",
# 	"filters": "managely_terminal.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "managely_terminal.install.before_install"
# after_install = "managely_terminal.install.after_install"

after_migrate = [
    "managely_terminal.managely_terminal.api.setup_custom_fields",
    "managely_terminal.managely_terminal.accounting.customizations.setup_custom_fields",
    "managely_terminal.managely_terminal.setup_fields.run",
]

# Uninstallation
# ------------

# before_uninstall = "managely_terminal.uninstall.before_uninstall"
# after_uninstall = "managely_terminal.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "managely_terminal.utils.before_app_install"
# after_app_install = "managely_terminal.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "managely_terminal.utils.before_app_uninstall"
# after_app_uninstall = "managely_terminal.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "managely_terminal.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"Page": {
		"validate": "managely_terminal.managely_terminal.api.electron.terminals.validate_page_permission",
	},
	"Loyalty Point Entry": {
		"on_update": "managely_terminal.managely_terminal.api.electron.customer.update_pos_customer_loyalty",
		"on_trash": "managely_terminal.managely_terminal.api.electron.customer.update_pos_customer_loyalty",
	},
	"POS Invoice": {
		"autoname": "managely_terminal.managely_terminal.api.pos_entry.autoname_pos_invoice",
		"validate": "managely_terminal.managely_terminal.api.fix_invoice_items_valuation",
		"before_submit": "managely_terminal.managely_terminal.api.generate_production_order",
	},
	"Sales Order": {
		"on_submit": "managely_terminal.managely_terminal.api.generate_production_order"
	},
	"Sales Invoice": {
		"before_validate": "managely_terminal.managely_terminal.accounting.customizations.before_validate_transaction",
		"validate": "managely_terminal.managely_terminal.api.fix_invoice_items_valuation",
		"before_submit": "managely_terminal.managely_terminal.stock_automation.validate_target_warehouse",
		"on_submit": [
			"managely_terminal.managely_terminal.api.generate_production_order",
			"managely_terminal.managely_terminal.stock_automation.create_delivery_note_from_sales_invoice",
		],
	},
	"Purchase Invoice": {
		"before_validate": "managely_terminal.managely_terminal.accounting.customizations.before_validate_transaction",
		"before_save": "managely_terminal.managely_terminal.accounting.customizations.before_save_purchase_invoice",
		"before_submit": [
			"managely_terminal.managely_terminal.accounting.customizations.before_save_purchase_invoice",
			"managely_terminal.managely_terminal.stock_automation.validate_target_warehouse",
		],
		"on_submit": "managely_terminal.managely_terminal.stock_automation.create_purchase_receipt_from_purchase_invoice",
	},
	"Payment Entry": {
		"before_validate": "managely_terminal.managely_terminal.accounting.customizations.before_validate_transaction",
	},
	"Journal Entry": {
		"before_validate": "managely_terminal.managely_terminal.accounting.customizations.before_validate_transaction",
	},
	"Account": {
		"before_insert": "managely_terminal.managely_terminal.accounting.customizations.autonumber_child_account",
	},
	"POS Opening Entry": {
		"autoname": "managely_terminal.managely_terminal.api.pos_entry.autoname_pos_opening_entry",
		"on_submit": "managely_terminal.managely_terminal.doctype.pos_suspended_transaction.pos_suspended_transaction.on_pos_opening_entry_submit",
	},
	"POS Closing Entry": {
		"autoname": "managely_terminal.managely_terminal.api.pos_entry.autoname_pos_closing_entry",
		"before_validate": "managely_terminal.managely_terminal.doctype.pos_suspended_transaction.pos_suspended_transaction.before_validate_pos_closing_entry",
		"on_submit": "managely_terminal.managely_terminal.doctype.pos_suspended_transaction.pos_suspended_transaction.on_pos_closing_entry_submit",
		"on_cancel": "managely_terminal.managely_terminal.doctype.pos_suspended_transaction.pos_suspended_transaction.on_pos_closing_entry_cancel",
	},
	"POS Profile": {
		"before_insert": "managely_terminal.managely_terminal.api.pos_profile.set_pos_profile_defaults",
		"before_save": [
			"managely_terminal.managely_terminal.api.pos_profile.set_pos_profile_defaults",
		],
		"after_save": "managely_terminal.managely_terminal.api.pos_profile.notify_pos_profile_updated",
	},
	"POS Suspended Transaction": {
		"autoname": "managely_terminal.managely_terminal.api.pos_entry.autoname_pos_suspended_transaction",
	},
	"Work Order": {
		"autoname": "managely_terminal.managely_terminal.api.pos_entry.autoname_work_order",
	},
}

# DocType Class Overrides
# -----------------------
override_doctype_class = {
	"Sales Invoice": "managely_terminal.managely_terminal.api.sales_invoice.CustomSalesInvoice",
	"POS Invoice": "managely_terminal.managely_terminal.api.sales_invoice.CustomPOSInvoice",
	"Purchase Invoice": "managely_terminal.managely_terminal.api.purchase_invoice.CustomPurchaseInvoice",
}

# Dashboard Links
# ---------------
override_doctype_dashboards = {
	"POS Opening Entry": "managely_terminal.managely_terminal.utils.get_pos_opening_entry_dashboard",
	"POS Closing Entry": "managely_terminal.managely_terminal.utils.get_pos_closing_entry_dashboard",
	"POS Invoice": "managely_terminal.managely_terminal.utils.get_pos_invoice_dashboard",
}

# Scheduled Tasks
# ---------------

scheduler_events = {
	"daily": [
		"managely_terminal.managely_terminal.api.check_batch_expiry"
	]
}

# Testing
# -------

# before_tests = "managely_terminal.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "managely_terminal.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "managely_terminal.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["managely_terminal.utils.before_request"]
# after_request = ["managely_terminal.managely_terminal.api.sw.add_sw_header"]

# Job Events
# ----------
# before_job = ["managely_terminal.utils.before_job"]
# after_job = ["managely_terminal.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"managely_terminal.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

fixtures = [
	"Custom Field",
	"Property Setter",
	"Custom DocPerm",
	"Client Script",
	{"dt": "Workspace", "filters": [["name", "in", ["Accounting"]]]}
]
