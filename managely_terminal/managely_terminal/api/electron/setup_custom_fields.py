import frappe

def create_tax_exempt_field():
    """
    Creates custom_is_tax_exempt Check field on Item Price.
    Run via:
      bench --site dev15.asr1.online execute managely_terminal.managely_terminal.api.electron.setup_custom_fields.create_tax_exempt_field
    """
    exists = frappe.db.exists('Custom Field', {
        'dt': 'Item Price',
        'fieldname': 'custom_is_tax_exempt'
    })
    if exists:
        print('[setup] custom_is_tax_exempt already exists on Item Price — skipping.')
        return

    doc = frappe.get_doc({
        'doctype': 'Custom Field',
        'dt': 'Item Price',
        'fieldname': 'custom_is_tax_exempt',
        'fieldtype': 'Check',
        'label': 'Tax Exempt (No VAT)',
        'insert_after': 'price_list_rate',
        'description': 'If checked, no VAT is applied on this item even when the POS profile has prices_include_vat enabled.',
        'in_list_view': 1,
        'in_standard_filter': 0,
        'allow_on_submit': 0,
        'read_only': 0,
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    print('[setup] SUCCESS: custom_is_tax_exempt created on Item Price')
