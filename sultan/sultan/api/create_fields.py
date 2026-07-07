import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

def run():
    print('Creating custom fields...')
    fields_to_add = [
        {'fieldname': 'custom_pos_order_type', 'label': 'POS Order Type', 'fieldtype': 'Select', 'options': 'Pickup\nDelivery', 'insert_after': 'customer'},
        {'fieldname': 'cashier_name', 'label': 'Cashier Name', 'fieldtype': 'Data', 'insert_after': 'custom_pos_order_type'},
        {'fieldname': 'employee_username', 'label': 'Employee Username', 'fieldtype': 'Data', 'insert_after': 'cashier_name'},
    ]
    for dt in ['Sales Invoice', 'POS Invoice']:
        for f in fields_to_add:
            try:
                create_custom_field(dt, f)
                print('Created field in doctype:', dt, f.get('fieldname'))
            except Exception as e:
                print('Skipped field:', dt, f.get('fieldname'), 'Error:', str(e))
    frappe.db.commit()
