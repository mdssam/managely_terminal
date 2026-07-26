# Copyright (c) 2026, Sultan Bakery and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class ScaleSettings(Document):
    pass


@frappe.whitelist()
def get_scale_settings():
    """Get Scale Settings for POS integration"""
    try:
        doc = frappe.get_single("Scale Settings")
        return {
            "prefix_included_or_not": doc.prefix_included_or_not,
            "no_of_prefix_characters": doc.no_of_prefix_characters or 0,
            "prefix": doc.prefix or "",
            "item_code_starting_digit": doc.item_code_starting_digit or 1,
            "item_code_total_digits": doc.item_code_total_digits or 5,
            "weight_starting_digit": doc.weight_starting_digit or 7,
            "weight_total_digits": doc.weight_total_digits or 5,
            "weight_decimals": doc.weight_decimals or 3,
            "price_included_in_barcode_or_not": doc.price_included_in_barcode_or_not,
            "price_starting_digit": doc.price_starting_digit or 7,
            "price_total_digit": doc.price_total_digit or 5,
            "price_decimals": doc.price_decimals or 3,
        }
    except Exception as e:
        frappe.log_error(f"Scale Settings Error: {str(e)}")
        return {}
