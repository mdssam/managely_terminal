import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

def run():
    print("Applying metadata changes...")
    
    # 1. Make loyalty_points read-only in POS Customer using Property Setter
    print("Making loyalty_points read-only in POS Customer...")
    make_property_setter(
        doctype="POS Customer",
        fieldname="loyalty_points",
        property="read_only",
        value=1,
        property_type="Check",
        validate_fields_for_doctype=False
    )
    
    # 2. Add default_loyalty_program field to Sultan Settings
    print("Checking default_loyalty_program field in Sultan Settings...")
    if not frappe.db.exists("Custom Field", "Sultan Settings-default_loyalty_program"):
        create_custom_field("Sultan Settings", {
            "fieldname": "default_loyalty_program",
            "label": "Default Loyalty Program",
            "fieldtype": "Link",
            "options": "Loyalty Program",
            "insert_after": "stamps"
        })
        print("Created default_loyalty_program Custom Field in Sultan Settings.")
    else:
        print("default_loyalty_program field already exists.")
        
    # 3. Change options of driver_id in Driver Settlement to Delivery Personnel
    print("Changing options of driver_id in Driver Settlement to Delivery Personnel...")
    make_property_setter(
        doctype="Driver Settlement",
        fieldname="driver_id",
        property="options",
        value="Delivery Personnel",
        property_type="Small Text",
        validate_fields_for_doctype=False
    )
        
    frappe.db.commit()
    print("Metadata changes completed successfully!")

