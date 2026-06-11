app_name = "sultan"
app_title = "Sultan"
app_publisher = "Tati"
app_description = "For manufacturing and pos"
app_email = "abedtatty@gmail.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
add_to_apps_screen = [
	{
		"name": "sultan_spa",
		"logo": "/assets/sultan/logo.png",
		"title": "Sultan POS",
		"route": "/sultan_spa",
	}
]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/sultan/css/sultan.css"
app_include_js = "/assets/sultan/js/sultan_pos_modifier.js"

# include js, css files in header of web template
# web_include_css = "/assets/sultan/css/sultan.css"
# web_include_js = "/assets/sultan/js/sultan.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "sultan/public/scss/website"

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
	"Multi Currency Payment": "public/js/doctype/multi_currency_payment.js",
}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
doctype_tree_js = {"Account": "public/js/doctype/account_autonumber.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "sultan/public/icons.svg"

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

website_route_rules = [
	{"from_route": "/sultan_spa", "to_route": "sultan_spa"},
	{"from_route": "/sultan_spa/<path:app_path>", "to_route": "sultan_spa"},
]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "sultan.utils.jinja_methods",
# 	"filters": "sultan.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "sultan.install.before_install"
# after_install = "sultan.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "sultan.uninstall.before_uninstall"
# after_uninstall = "sultan.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "sultan.utils.before_app_install"
# after_app_install = "sultan.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "sultan.utils.before_app_uninstall"
# after_app_uninstall = "sultan.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "sultan.notifications.get_notification_config"

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
	"POS Invoice": {
		"validate": "sultan.sultan.api.fix_invoice_items_valuation",
		"before_submit": "sultan.sultan.api.generate_production_order",
	},
	"Sales Order": {
		"on_submit": "sultan.sultan.api.generate_production_order"
	},
	"Sales Invoice": {
		"before_validate": "sultan.sultan.accounting.customizations.before_validate_transaction",
		"validate": "sultan.sultan.api.fix_invoice_items_valuation",
		"before_submit": "sultan.sultan.stock_automation.validate_target_warehouse",
		"on_submit": [
			"sultan.sultan.api.generate_production_order",
			"sultan.sultan.stock_automation.create_delivery_note_from_sales_invoice",
		],
	},
	"Purchase Invoice": {
		"before_validate": "sultan.sultan.accounting.customizations.before_validate_transaction",
		"before_save": "sultan.sultan.accounting.customizations.before_save_purchase_invoice",
		"before_submit": [
			"sultan.sultan.accounting.customizations.before_save_purchase_invoice",
			"sultan.sultan.stock_automation.validate_target_warehouse",
		],
		"on_submit": "sultan.sultan.stock_automation.create_purchase_receipt_from_purchase_invoice",
	},
	"Payment Entry": {
		"before_validate": "sultan.sultan.accounting.customizations.before_validate_transaction",
	},
	"Journal Entry": {
		"before_validate": "sultan.sultan.accounting.customizations.before_validate_transaction",
	},
	"Account": {
		"before_insert": "sultan.sultan.accounting.customizations.autonumber_child_account",
	},
	"POS Opening Entry": {
		"on_submit": "sultan.sultan.doctype.pos_suspended_transaction.pos_suspended_transaction.on_pos_opening_entry_submit",
	},
	"POS Closing Entry": {
		"before_validate": "sultan.sultan.doctype.pos_suspended_transaction.pos_suspended_transaction.before_validate_pos_closing_entry",
		"on_submit": "sultan.sultan.doctype.pos_suspended_transaction.pos_suspended_transaction.on_pos_closing_entry_submit",
		"on_cancel": "sultan.sultan.doctype.pos_suspended_transaction.pos_suspended_transaction.on_pos_closing_entry_cancel",
	},
}

# Scheduled Tasks
# ---------------

scheduler_events = {
	"daily": [
		"sultan.sultan.api.check_batch_expiry"
	]
}

# Testing
# -------

# before_tests = "sultan.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "sultan.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "sultan.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["sultan.utils.before_request"]
# after_request = ["sultan.utils.after_request"]

# Job Events
# ----------
# before_job = ["sultan.utils.before_job"]
# after_job = ["sultan.utils.after_job"]

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
# 	"sultan.auth.validate"
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
	{"dt": "Workspace", "filters": [["name", "=", "Sultan POS"]]}
]
