import os
import frappe

FORMATS = [
    ("sultan_delivery_note", "Sultan Delivery Note", "Delivery Note", 21.0, 15.0, 14.0, 16.0, "en"),
    ("sultan_delivery_note_ar", "Sultan Delivery Note AR", "Delivery Note", 21.0, 15.0, 14.0, 16.0, "ar"),
    ("sultan_purchase_receipt", "Sultan Purchase Receipt", "Purchase Receipt", 21.0, 15.0, 14.0, 16.0, "en"),
    ("sultan_purchase_receipt_ar", "Sultan Purchase Receipt AR", "Purchase Receipt", 21.0, 15.0, 14.0, 16.0, "ar"),
    ("sultan_stock_entry", "Sultan Stock Entry", "Stock Entry", 21.0, 15.0, 14.0, 16.0, "en"),
    ("sultan_stock_entry_ar", "Sultan Stock Entry AR", "Stock Entry", 21.0, 15.0, 14.0, 16.0, "ar"),
    ("sultan_invoice", "Sultan Invoice", "Sales Invoice", 22.0, 15.0, 17.0, 17.0, "en"),
    ("sultan_invoice_ar", "Sultan Invoice AR", "Sales Invoice", 22.0, 15.0, 17.0, 17.0, "ar"),
    ("sultan_purchase_invoice", "Sultan Purchase Invoice", "Purchase Invoice", 22.0, 15.0, 17.0, 17.0, "en"),
    ("sultan_purchase_invoice_ar", "Sultan Purchase Invoice AR", "Purchase Invoice", 22.0, 15.0, 17.0, 17.0, "ar"),
    ("sultan_journal_entry", "Sultan Journal Entry", "Journal Entry", 22.0, 15.0, 17.0, 17.0, "en"),
    ("sultan_journal_entry_ar", "Sultan Journal Entry AR", "Journal Entry", 22.0, 15.0, 17.0, 17.0, "ar"),
    ("sultan_payment_entry", "Sultan Payment Entry", "Payment Entry", 22.0, 15.0, 17.0, 17.0, "en"),
    ("sultan_payment_entry_ar", "Sultan Payment Entry AR", "Payment Entry", 22.0, 15.0, 17.0, 17.0, "ar"),
    ("sultan_multi_currency_payment", "Sultan Multi Currency Payment", "Multi Currency Payment", 22.0, 15.0, 17.0, 17.0, "en"),
    ("sultan_multi_currency_payment_ar", "Sultan Multi Currency Payment AR", "Multi Currency Payment", 22.0, 15.0, 17.0, 17.0, "ar"),
]

DEFAULTS = {
    "Sales Invoice": "Sultan Invoice",
    "Purchase Invoice": "Sultan Purchase Invoice",
    "Delivery Note": "Sultan Delivery Note",
    "Purchase Receipt": "Sultan Purchase Receipt",
    "Stock Entry": "Sultan Stock Entry",
    "Journal Entry": "Sultan Journal Entry",
    "Payment Entry": "Sultan Payment Entry",
    "Multi Currency Payment": "Sultan Multi Currency Payment",
}


def setup_sultan_print_formats():
    """Ensure all 16 Sultan print formats exist and set them as default for their DocTypes.
    Runs automatically on bench migrate via after_migrate hook.
    """
    app_pf_dir = os.path.join(
        frappe.get_app_path("managely_terminal"), "managely_terminal", "print_format"
    )

    for folder, pf_name, dt, m_top, m_bot, m_left, m_right, lang in FORMATS:
        html_file = os.path.join(app_pf_dir, folder, f"{folder}.html")
        if not os.path.exists(html_file):
            continue

        with open(html_file, "r", encoding="utf-8") as f:
            html_content = f.read()

        if not frappe.db.exists("Print Format", pf_name):
            doc = frappe.new_doc("Print Format")
            doc.name = pf_name
            doc.doc_type = dt
            doc.module = "Managely Terminal"
            doc.custom_format = 1
            doc.standard = "No"
            doc.print_format_type = "Jinja"
            doc.default_print_language = lang
            doc.page_number = "Hide"
            doc.font_size = 9
            doc.margin_top = m_top
            doc.margin_bottom = m_bot
            doc.margin_left = m_left
            doc.margin_right = m_right
            doc.html = html_content
            doc.insert(ignore_permissions=True)
            print(f"Created Print Format: {pf_name}")
        else:
            frappe.db.set_value(
                "Print Format",
                pf_name,
                {
                    "doc_type": dt,
                    "html": html_content,
                    "margin_top": m_top,
                    "margin_bottom": m_bot,
                    "margin_left": m_left,
                    "margin_right": m_right,
                    "page_number": "Hide",
                    "custom_format": 1,
                    "font_size": 9,
                },
                update_modified=True,
            )
            print(f"Updated Print Format: {pf_name}")

    # Set default print format for each DocType
    for dt, pf_name in DEFAULTS.items():
        if frappe.db.exists("DocType", dt):
            frappe.db.set_value("DocType", dt, "default_print_format", pf_name)

        ps_name = f"{dt}-main-default_print_format"
        if not frappe.db.exists("Property Setter", ps_name):
            doc = frappe.get_doc({
                "doctype": "Property Setter",
                "name": ps_name,
                "doc_type": dt,
                "doctype_or_field": "DocType",
                "property": "default_print_format",
                "property_type": "Data",
                "value": pf_name,
                "module": "Managely Terminal",
            })
            doc.insert(ignore_permissions=True)
        else:
            frappe.db.set_value("Property Setter", ps_name, "value", pf_name)

    # Setup portable Sultan Bakery Letter Head
    setup_sultan_letter_head()

    frappe.db.commit()
    frappe.clear_cache()
    print("Sultan print formats setup complete.")


def setup_sultan_letter_head():
    """Ensure the official Sultan Bakery Letter Head exists with app-bundled assets.
    Portable across any Frappe bench and site.
    """
    lh_content = """<div class="sultan-lh-container" style="width: 100%;">
    <table class="sultan-lh-table" style="width: 100%; border-collapse: collapse; border: none; margin: 0; background: transparent;">
        <tbody>
            <tr>
                <td style="vertical-align: middle; text-align: left; padding: 0; border: none; background: transparent;">
                    <img src="/assets/managely_terminal/images/sultan_logo.png" alt="Sultan Bakery" style="height: 50px; width: auto; max-width: 220px; display: block;" />
                </td>
            </tr>
        </tbody>
    </table>
    <div class="sultan-lh-divider" style="width: 100%; border-top: 2px solid #322f14; margin-top: 8px; margin-bottom: 4px; clear: both;"></div>
</div>"""

    lh_name = "Sultan Bakery"
    if not frappe.db.exists("Letter Head", lh_name):
        doc = frappe.new_doc("Letter Head")
        doc.letter_head_name = lh_name
        doc.source = "HTML"
        doc.content = lh_content
        doc.image = "/assets/managely_terminal/images/sultan_logo.png"
        doc.is_default = 1
        doc.disabled = 0
        doc.insert(ignore_permissions=True)
        print(f"Created Letter Head: {lh_name}")
    else:
        frappe.db.set_value(
            "Letter Head",
            lh_name,
            {
                "source": "HTML",
                "content": lh_content,
                "image": "/assets/managely_terminal/images/sultan_logo.png",
                "is_default": 1,
                "disabled": 0,
            },
            update_modified=True,
        )
        print(f"Updated Letter Head: {lh_name}")

    companies = frappe.get_all("Company", pluck="name")
    for comp in companies:
        if "sultan" in comp.lower() or len(companies) == 1:
            frappe.db.set_value("Company", comp, "default_letter_head", lh_name)

