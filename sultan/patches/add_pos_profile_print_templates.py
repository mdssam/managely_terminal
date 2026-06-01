import frappe

from sultan.sultan.api.thermal_receipts import create_thermal_print_formats


def execute():
	create_thermal_print_formats()
	ensure_pos_profile_print_fields()
	set_default_pos_profile_print_templates()


def ensure_pos_profile_print_fields():
	for fieldname, label, after in [
		("custom_pos_print_format_en", "POS Print Template (English)", "write_off_account"),
		("custom_pos_print_format_ar", "POS Print Template (Arabic)", "custom_pos_print_format_en"),
	]:
		cf = f"POS Profile-{fieldname}"
		if frappe.db.exists("Custom Field", cf):
			continue

		frappe.get_doc(
			{
				"doctype": "Custom Field",
				"dt": "POS Profile",
				"fieldname": fieldname,
				"label": label,
				"fieldtype": "Link",
				"options": "Print Format",
				"insert_after": after,
				"description": "Thermal receipt print format used by the Sultan POS SPA",
			}
		).insert(ignore_permissions=True)


def set_default_pos_profile_print_templates():
	frappe.reload_doc("accounts", "doctype", "pos_profile")

	for profile in frappe.get_all(
		"POS Profile",
		fields=["name", "custom_pos_print_format_en", "custom_pos_print_format_ar"],
	):
		updates = {}
		if not profile.custom_pos_print_format_en:
			updates["custom_pos_print_format_en"] = "Sultan Thermal Standard EN"
		if not profile.custom_pos_print_format_ar:
			updates["custom_pos_print_format_ar"] = "Sultan Thermal Standard AR"

		if updates:
			frappe.db.set_value("POS Profile", profile.name, updates, update_modified=False)

