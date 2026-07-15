import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter

def run():
    # 1. Make loyalty_points read-only in POS Customer using Property Setter
    make_property_setter(
        doctype="POS Customer",
        fieldname="loyalty_points",
        property="read_only",
        value=1,
        property_type="Check",
        validate_fields_for_doctype=False
    )
    
    # default_loyalty_program is now standard on Sultan Settings
    
    # 3. Change options of driver_id in Driver Settlement to Delivery Personnel
    make_property_setter(
        doctype="Driver Settlement",
        fieldname="driver_id",
        property="options",
        value="Delivery Personnel",
        property_type="Small Text",
        validate_fields_for_doctype=False
    )
        
    frappe.db.commit()
