# Safe custom overrides forwarding from klik_pos.api.pos_profile
import frappe
from frappe import _
from klik_pos.api.pos_profile import get_pos_profiles_for_user
from klik_pos.api.sales_invoice import get_current_pos_opening_entry
from klik_pos.klik_pos.utils import get_current_pos_profile

@frappe.whitelist()
def get_pos_details():
	# Determine active POS Profile: prefer the one from the current open entry if any
	current_opening_entry = get_current_pos_opening_entry()
	if current_opening_entry:
		opening_doc = frappe.get_doc("POS Opening Entry", current_opening_entry)
		pos = frappe.get_doc("POS Profile", opening_doc.pos_profile)
	else:
		pos = get_current_pos_profile()

	# SAFE FIELD ACCESS: Use getattr to avoid crashes when custom fields aren't in DB yet
	business_type = getattr(pos, "custom_business_type", "Retail")
	print_format = getattr(pos, "custom_pos_printformat", None)

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

	details = {
		"name": pos.name,
		"business_type": business_type,
		"print_format": print_format,
		"currency": pos.currency,
		"currency_symbol": frappe.db.get_value("Currency", pos.currency, "symbol") or pos.currency,
		"print_receipt_on_order_complete": pos.print_receipt_on_order_complete,
		"custom_use_scanner_fully": getattr(pos, "custom_use_scanner_fully", 0),
		"custom_allow_credit_sales": getattr(pos, "custom_allow_credit_sales", 0),
		"custom_allow_return": getattr(pos, "custom_allow_return", 1),
		"custom_hide_expected_amount": getattr(pos, "custom_hide_expected_amount", 0),
		"hide_unavailable_items": pos.hide_unavailable_items,
		"custom_default_view": getattr(pos, "custom_default_view", "Grid View"),
		"custom_whatsap_template": getattr(pos, "custom_whatsap_template", None),
		"custom_email_template": getattr(pos, "custom_email_template", None),
		"custom_enable_whatsapp": getattr(pos, "custom_enable_whatsapp", 0),
		"custom_enable_sms": getattr(pos, "custom_enable_sms", 0),
		"is_zatca_enabled": is_zatca_enabled(),
		"default_customer": default_customer,
		"current_opening_entry": current_opening_entry,
		"custom_scale_barcodes_start_with": getattr(pos, "custom_scale_barcodes_start_with", "") or "",
		"write_off_limit": pos.write_off_limit or 1.0,
		"custom_allow_write_off": getattr(pos, "custom_allow_write_off", 0),
		"custom_ignore_write_off_on_partial_returns": getattr(pos, "custom_ignore_write_off_on_partial_returns", 1),
		"custom_delivery_required": int(getattr(pos, "custom_delivery_required", 0) or 0),
		"allow_discount_change": pos.allow_discount_change or 0
	}
	return details

def is_zatca_enabled():
	pos_profile = get_current_pos_profile()
	company = pos_profile.company
	if frappe.db.has_column("Company", "custom_enable_zatca_e_invoicing"):
		return frappe.db.get_value("Company", company, "custom_enable_zatca_e_invoicing") == 1
	return False

