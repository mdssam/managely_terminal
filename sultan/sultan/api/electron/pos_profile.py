import frappe
from frappe import _


@frappe.whitelist()
def get_pos_profiles_for_user():
	"""
	Return a list of POS Profiles assigned to the current user.

	Permission hierarchy:
	1. User Permissions (first level) - if exists, only return these profiles
	2. Applicable Users table (second level) - fallback if no User Permissions

	Returns profiles with an 'is_default' flag based on POS Profile User settings.
	"""
	user = frappe.session.user

	# Check for User Permissions first (first-level permission)
	user_permission_profiles = _get_user_permission_profiles(user)

	if user_permission_profiles:
		return _build_profiles_with_defaults(user_permission_profiles, user, require_applicable_user=True)

	# Fall back to Applicable Users table (second-level permission)
	applicable_user_profiles = _get_applicable_user_profiles(user)
	return _build_profiles_with_defaults(applicable_user_profiles, user, require_applicable_user=False)


def _get_user_permission_profiles(user):
	"""Get enabled POS Profiles from User Permissions."""
	user_permissions = frappe.get_all(
		"User Permission",
		filters={"user": user, "allow": "POS Profile"},
		fields=["for_value"],
	)

	if not user_permissions:
		return []

	profile_names = [p["for_value"] for p in user_permissions]

	# Get only enabled profiles
	all_profiles = frappe.get_all(
		"POS Profile", filters={"name": ["in", profile_names]}, fields=["name", "disabled"]
	)

	return [p.name for p in all_profiles if not p.disabled]


def _get_applicable_user_profiles(user):
	"""Get enabled POS Profiles where user is in Applicable Users table."""
	all_profiles = frappe.get_all("POS Profile", filters={"disabled": 0}, fields=["name"])

	profiles = []
	for profile in all_profiles:
		user_entry = frappe.get_all(
			"POS Profile User", filters={"parent": profile.name, "user": user}, fields=["user"], limit=1
		)
		if user_entry:
			profiles.append(profile.name)

	return profiles


def _build_profiles_with_defaults(profile_names, user, require_applicable_user=False):
	"""
	Build list of profiles with default flags.

	Args:
	    profile_names: List of profile names to process
	    user: Current user
	    require_applicable_user: If True, skip profiles where user is not in Applicable Users

	Returns:
	    List of dicts with 'name' and 'is_default' keys
	"""
	profiles_with_default = []

	for profile_name in profile_names:
		try:
			profile_data = _get_profile_default_status(profile_name, user)

			# Skip if user not in Applicable Users and it's required
			if require_applicable_user and not profile_data["in_applicable_users"]:
				frappe.logger().info(
					f"User {user} has User Permission for {profile_name} "
					f"but is not in Applicable Users - skipping"
				)
				continue

			profiles_with_default.append({"name": profile_name, "is_default": profile_data["is_default"]})

		except Exception as e:
			frappe.logger().error(f"Error getting details for POS Profile {profile_name}: {e}")
			# Only add profile with is_default=False if not requiring applicable user
			if not require_applicable_user:
				profiles_with_default.append({"name": profile_name, "is_default": False})

	return profiles_with_default


def _get_profile_default_status(profile_name, user):
	"""
	Get default status for a profile and check if user is in Applicable Users.

	Returns:
	    dict: {'is_default': bool, 'in_applicable_users': bool}
	"""
	user_entry = frappe.get_all(
		"POS Profile User", filters={"parent": profile_name, "user": user}, fields=["default"], limit=1
	)

	in_applicable_users = bool(user_entry)
	is_default = False

	if user_entry:
		default_value = user_entry[0].get("default")
		# Handle both integer (0/1) and boolean values
		is_default = default_value in (1, True)

	return {"is_default": is_default, "in_applicable_users": in_applicable_users}


@frappe.whitelist()
def get_pos_details():
	# Determine active POS Profile: prefer the one from the current open entry if any
	from sultan.sultan.api.electron.sales_invoice import get_current_pos_opening_entry
	from sultan.sultan.utils import get_current_pos_profile
	current_opening_entry = get_current_pos_opening_entry()
	if current_opening_entry:
		opening_doc = frappe.get_doc("POS Opening Entry", current_opening_entry)
		pos = frappe.get_doc("POS Profile", opening_doc.pos_profile)
	else:
		try:
			pos = get_current_pos_profile()
		except Exception:
			pos = None

	# Fallback for non-pos users (like order stations)
	if not pos:
		frappe.logger().info(f"Creating synthetic POS context for user {frappe.session.user}")
		return {
			"name": "System Default",
			"business_type": "Retail",
			"print_format": "Standard",
			"currency": frappe.db.get_default("currency") or "SAR",
			"currency_symbol": "",
			"print_receipt_on_order_complete": 0,
			"custom_pos_print_format_en": None,
			"custom_pos_print_format_ar": None,
			"custom_use_scanner_fully": 0,
			"custom_allow_credit_sales": 0,
			"custom_allow_return": 0,
			"custom_hide_expected_amount": 0,
			"hide_unavailable_items": 0,
			"is_zatca_enabled": False,
			"default_customer": None,
			"current_opening_entry": None,
			"custom_scale_barcodes_start_with": "",
			"allow_discount_change": 0,
			"custom_hide_tax_in_cart": 0,
			"custom_prices_include_vat": 0,
			"custom_allow_zero_stock_sale": 0,
			"role": frappe.db.get_value("User", frappe.session.user, "role_profile_name") or "Cashier"
		}

	# Resolve country code based on company's country
	country_code = None
	if getattr(pos, "company", None):
		company_country = frappe.db.get_value("Company", pos.company, "country")
		if company_country:
			raw_code = frappe.db.get_value("Country", company_country, "code")
			if raw_code:
				country_code = str(raw_code).upper()

	business_type = getattr(pos, "custom_business_type", "Retail")
	print_format = getattr(pos, "custom_pos_printformat", "Standard")

	# Get default customer details if set
	default_customer = None
	if pos.customer:
		customer_doc = frappe.get_doc("Customer", pos.customer)
		default_customer = {
			"id": customer_doc.name,
			"name": customer_doc.customer_name,
			"email": customer_doc.email_id or "",
			"phone": customer_doc.mobile_no or "",
			"customer_type": customer_doc.customer_type,
			"territory": customer_doc.territory,
			"customer_group": customer_doc.customer_group,
			"default_currency": customer_doc.default_currency,
		}

	active_role = frappe.db.get_value("User", frappe.session.user, "role_profile_name") or "Cashier"

	details = {
		"name": pos.name,
		"business_type": business_type,
		"print_format": print_format,
		"currency": getattr(pos, "currency", None) or "SAR",
		"currency_symbol": frappe.db.get_value("Currency", getattr(pos, "currency", "SAR"), "symbol") or "$",
		"print_receipt_on_order_complete": getattr(pos, "print_receipt_on_order_complete", 0),
		"custom_pos_print_format_en": getattr(pos, "custom_pos_print_format_en", None),
		"custom_pos_print_format_ar": getattr(pos, "custom_pos_print_format_ar", None),
		"custom_print_currency": getattr(pos, "custom_print_currency", None) or None,
		"custom_use_scanner_fully": getattr(pos, "custom_use_scanner_fully", 0),
		"custom_allow_credit_sales": getattr(pos, "custom_allow_credit_sales", 0),
		"custom_allow_return": getattr(pos, "custom_allow_return", 0),
		"custom_hide_expected_amount": getattr(pos, "custom_hide_expected_amount", 0),
		"hide_unavailable_items": getattr(pos, "hide_unavailable_items", 0),
		"custom_default_view": getattr(pos, "custom_default_view", "Grid View"),
		"custom_whatsap_template": getattr(pos, "custom_whatsap_template", None),
		"custom_email_template": getattr(pos, "custom_email_template", None),
		"custom_enable_whatsapp": getattr(pos, "custom_enable_whatsapp", 0),
		"custom_enable_sms": getattr(pos, "custom_enable_sms", 0),
		"is_zatca_enabled": is_zatca_enabled(),
		"default_customer": default_customer,
		"current_opening_entry": current_opening_entry,
		"custom_scale_barcodes_start_with": getattr(pos, "custom_scale_barcodes_start_with", "") or "",
		"write_off_limit": getattr(pos, "write_off_limit", 1.0),
		"custom_allow_write_off": getattr(pos, "custom_allow_write_off", 0),
		"custom_ignore_write_off_on_partial_returns": getattr(pos, "custom_ignore_write_off_on_partial_returns", 1.0),
		"custom_delivery_required": int(getattr(pos, "custom_delivery_required", 0) or 0),
		"allow_discount_change": getattr(pos, "allow_discount_change", 0),
		"custom_allow_zero_stock_sale": getattr(pos, "custom_allow_zero_stock_sale", 0),
		"role": active_role,
		"custom_is_branch": int(getattr(pos, "custom_is_branch", 0) or 0),
		# Multi-currency
		"custom_enable_multi_currency": int(getattr(pos, "custom_enable_multi_currency", 0) or 0),
		"custom_secondary_currency": getattr(pos, "custom_secondary_currency", None) or None,
		"custom_secondary_currency_symbol": (
			frappe.db.get_value("Currency", getattr(pos, "custom_secondary_currency", None), "symbol")
			if getattr(pos, "custom_secondary_currency", None) else None
		),
		"custom_exchange_rate": float(getattr(pos, "custom_exchange_rate", 0) or 0),
		"custom_hide_tax_in_cart": int(getattr(pos, "custom_hide_tax_in_cart", 0) or 0),
		"custom_prices_include_vat": int(getattr(pos, "custom_prices_include_vat", 0) or 0),
		"custom_allow_loyalty_points": int(getattr(pos, "custom_allow_loyalty_points", 1) or 0),
		"country_code": country_code or "LB",
	}
	return details


def is_zatca_enabled():
	from sultan.sultan.utils import get_current_pos_profile
	try:
		pos_profile = get_current_pos_profile()
	except Exception:
		return False
	if not pos_profile:
		return False
	company = pos_profile.company
	if frappe.db.has_column("Company", "custom_enable_zatca_e_invoicing"):
		return frappe.db.get_value("Company", company, "custom_enable_zatca_e_invoicing") == 1
	return False


def set_pos_profile_defaults(doc, method=None):
	"""Always enforce Sultan Thermal Standard EN/AR templates on all POS Profiles."""
	doc.custom_pos_print_format_en = "Sultan Thermal Standard EN"
	doc.custom_pos_print_format_ar = "Sultan Thermal Standard AR"
	doc.print_format = "Sultan Thermal Standard EN"


def validate_pos_profile_rename(doc, method, old, new, merge=False, *args, **kwargs):
	"""Prevent renaming POS Profile if there is an active POS opening entry session."""
	if frappe.db.exists("POS Opening Entry", {"pos_profile": old, "status": "Open", "docstatus": 1}):
		frappe.throw(
			_("Cannot rename POS Profile '{0}' because there is an active POS session open. Please close all active POS sessions first.")
			.format(old)
		)


def validate_pos_profile_change(doc, method=None):
	"""Prevent saving any modifications to POS Profile if there is an active POS opening entry session."""
	# Only run this check if the document is not new (we are updating an existing one)
	if not doc.is_new():
		if frappe.db.exists("POS Opening Entry", {"pos_profile": doc.name, "status": "Open", "docstatus": 1}):
			frappe.throw(
				_("Cannot modify POS Profile '{0}' because there is an active POS session open. Please close all active POS sessions first.")
				.format(doc.name)
			)


@frappe.whitelist()
def get_dashboard_branches(employee=None):
	"""
	Return list of POS Profiles that are branches (custom_is_branch = 1).
	Branch Manager: restrict to their Allowed POS Profile child table.
	"""
	user = frappe.session.user
	user_roles = frappe.get_roles()
	is_admin_user = "Administrator" in user_roles or "System Manager" in user_roles
	is_branch_manager = "Branch Manager" in user_roles
	allowed_profiles = []

	if employee:
		emp_doc = frappe.db.get_value("Employee", {"name": employee, "status": "Active"}, ["name", "custom_pos_role"], as_dict=True)
		if emp_doc:
			emp_role = emp_doc.custom_pos_role or "Cashier"
			if emp_role == "Branch Manager":
				is_branch_manager = True
				allowed_profiles = [d.pos_profile for d in frappe.get_all(
					"Allowed POS Profile",
					filters={"parent": emp_doc.name, "parenttype": "Employee"},
					fields=["pos_profile"]
				)]
	else:
		emp_name = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")
		if emp_name:
			emp_role = frappe.db.get_value("Employee", emp_name, "custom_pos_role")
			if emp_role == "Branch Manager":
				is_branch_manager = True
			allowed_profiles = [d.pos_profile for d in frappe.get_all(
				"Allowed POS Profile",
				filters={"parent": emp_name, "parenttype": "Employee"},
				fields=["pos_profile"]
			)]

	filters = {"disabled": 0, "custom_is_branch": 1}

	if is_branch_manager and not is_admin_user:
		if allowed_profiles:
			filters["name"] = ["in", allowed_profiles]
		else:
			return []

	profiles = frappe.get_all("POS Profile", filters=filters, fields=["name"])
	return [p.name for p in profiles]


