import frappe

def create_tax_exempt_field():
    """
    Creates custom_is_tax_exempt Check field on Item.
    Run via:
      bench --site dev15.asr1.online execute managely_terminal.managely_terminal.api.electron.setup_custom_fields.create_tax_exempt_field
    """
    if frappe.db.exists('Custom Field', 'Item Price-custom_is_tax_exempt'):
        frappe.delete_doc('Custom Field', 'Item Price-custom_is_tax_exempt', ignore_permissions=True)
        print('[setup] Deleted old custom_is_tax_exempt from Item Price.')

    cf_name = frappe.db.exists('Custom Field', {
        'dt': 'Item',
        'fieldname': 'custom_is_tax_exempt'
    })
    if cf_name:
        cf_doc = frappe.get_doc('Custom Field', cf_name)
        if cf_doc.description:
            cf_doc.description = None
            cf_doc.save(ignore_permissions=True)
            frappe.db.commit()
        print('[setup] custom_is_tax_exempt already exists on Item — description cleared.')
        return

    doc = frappe.get_doc({
        'doctype': 'Custom Field',
        'dt': 'Item',
        'fieldname': 'custom_is_tax_exempt',
        'fieldtype': 'Check',
        'label': 'Tax Exempt (No VAT)',
        'insert_after': 'is_weight_item',
        'in_list_view': 1,
        'in_standard_filter': 0,
        'allow_on_submit': 0,
        'read_only': 0,
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    print('[setup] SUCCESS: custom_is_tax_exempt created on Item')
