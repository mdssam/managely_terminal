"""
Create three 80mm thermal receipt print formats for Sultan POS.
Called from setup_fields.run() or directly via bench execute.
"""

import frappe

# ── Shared style ─────────────────────────────────────────────────────────────
_BASE_CSS = """<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body, html { width: 72mm; font-size: 11px; color: #000; background: #fff; }
@page { size: 80mm auto; margin: 4mm; }
.center { text-align: center; }
.bold   { font-weight: bold; }
.small  { font-size: 9px; }
.lg     { font-size: 14px; }
.xl     { font-size: 17px; }
.divider { border-top: 1px dashed #000; margin: 4px 0; }
.solid  { border-top: 1px solid #000; margin: 4px 0; }
table   { width: 100%; border-collapse: collapse; }
td, th  { padding: 1px 2px; vertical-align: top; }
th      { font-weight: bold; border-bottom: 1px solid #000; }
.r { text-align: right; }
.c { text-align: center; }
.grand td { font-size: 13px; font-weight: bold; border-top: 1px solid #000; }
</style>"""

# ── Template 1: Sultan Thermal Standard ─────────────────────────────────────
_STANDARD_HTML = (
    "__CSS__\n"
    "\n"
    "<div class=\"center\">\n"
    "  <div class=\"xl bold\">{{ doc.company }}</div>\n"
    "  <div class=\"small\">{% if doc.tax_id %}VAT No: {{ doc.tax_id }}{% endif %}</div>\n"
    "</div>\n"
    "\n"
    "<div class=\"divider\"></div>\n"
    "\n"
    "<div class=\"center\">\n"
    "  <div class=\"bold lg\">TAX INVOICE / فاتورة ضريبية</div>\n"
    "  <div>{{ doc.name }}</div>\n"
    "  <div class=\"small\">{{ doc.posting_date }} {{ doc.posting_time or \"\" }}</div>\n"
    "  <div class=\"small\">Cashier: {{ doc.owner }}</div>\n"
    "  <div class=\"small\">Customer: {{ doc.customer_name or doc.customer }}</div>\n"
    "</div>\n"
    "\n"
    "<div class=\"divider\"></div>\n"
    "\n"
    "<table>\n"
    "  <thead><tr>\n"
    "    <th style=\"width:40%\">Item</th>\n"
    "    <th class=\"c\" style=\"width:12%\">Qty</th>\n"
    "    <th class=\"r\" style=\"width:22%\">Price</th>\n"
    "    <th class=\"r\" style=\"width:26%\">Total</th>\n"
    "  </tr></thead>\n"
    "  <tbody>\n"
    "    {% for item in doc.items %}\n"
    "    <tr>\n"
    "      <td>{{ item.item_name or item.item_code }}</td>\n"
    "      <td class=\"c\">{{ item.qty | int }}</td>\n"
    "      <td class=\"r\">{{ \"{:,.2f}\".format(item.rate or 0) }}</td>\n"
    "      <td class=\"r\">{{ \"{:,.2f}\".format(item.amount or 0) }}</td>\n"
    "    </tr>\n"
    "    {% endfor %}\n"
    "  </tbody>\n"
    "</table>\n"
    "\n"
    "<div class=\"solid\"></div>\n"
    "\n"
    "<table>\n"
    "  <tr><td>Subtotal / المجموع</td><td class=\"r\">{{ \"{:,.2f}\".format(doc.net_total or 0) }}</td></tr>\n"
    "  {% for tax in doc.taxes %}\n"
    "  <tr><td>{{ tax.description or tax.account_head }} ({{ tax.rate }}%)</td><td class=\"r\">{{ \"{:,.2f}\".format(tax.tax_amount or 0) }}</td></tr>\n"
    "  {% endfor %}\n"
    "  {% if doc.discount_amount %}\n"
    "  <tr><td>Discount / خصم</td><td class=\"r\">-{{ \"{:,.2f}\".format(doc.discount_amount) }}</td></tr>\n"
    "  {% endif %}\n"
    "  <tr class=\"grand\"><td>TOTAL / الإجمالي {{ doc.currency }}</td><td class=\"r\">{{ \"{:,.2f}\".format(doc.grand_total or 0) }}</td></tr>\n"
    "</table>\n"
    "\n"
    "{% if doc.payments %}\n"
    "<div class=\"divider\"></div>\n"
    "<table>\n"
    "  {% for p in doc.payments %}\n"
    "  <tr><td>{{ p.mode_of_payment }}</td><td class=\"r\">{{ \"{:,.2f}\".format(p.amount or 0) }}</td></tr>\n"
    "  {% endfor %}\n"
    "</table>\n"
    "{% endif %}\n"
    "\n"
    "<div class=\"divider\"></div>\n"
    "\n"
    "{% if doc.custom_qr_code %}\n"
    "<div class=\"center\" style=\"margin:4px 0\">\n"
    "  <img src=\"{{ doc.custom_qr_code }}\" style=\"width:30mm;height:30mm\" />\n"
    "</div>\n"
    "<div class=\"divider\"></div>\n"
    "{% endif %}\n"
    "\n"
    "<div class=\"center small\" style=\"margin-top:4px\">\n"
    "  <div>Thank you for your visit! / شكراً لزيارتكم</div>\n"
    "</div>\n"
)

# ── Template 2: Sultan Thermal Compact ──────────────────────────────────────
_COMPACT_HTML = (
    "__CSS__\n"
    "\n"
    "<div class=\"center\">\n"
    "  <div class=\"bold lg\">{{ doc.company }}</div>\n"
    "  <div class=\"small\">{{ doc.name }} | {{ doc.posting_date }}</div>\n"
    "  <div class=\"small\">{{ doc.customer_name or doc.customer }}</div>\n"
    "</div>\n"
    "\n"
    "<div class=\"divider\"></div>\n"
    "\n"
    "<table style=\"font-size:10px\">\n"
    "  {% for item in doc.items %}\n"
    "  <tr>\n"
    "    <td>{{ item.item_name or item.item_code }} x{{ item.qty | int }}</td>\n"
    "    <td class=\"r\">{{ \"{:,.2f}\".format(item.amount or 0) }}</td>\n"
    "  </tr>\n"
    "  {% endfor %}\n"
    "</table>\n"
    "\n"
    "<div class=\"solid\"></div>\n"
    "\n"
    "<table>\n"
    "  <tr><td>Net / صافي</td><td class=\"r\">{{ \"{:,.2f}\".format(doc.net_total or 0) }}</td></tr>\n"
    "  {% for tax in doc.taxes %}\n"
    "  <tr><td>VAT {{ tax.rate }}%</td><td class=\"r\">{{ \"{:,.2f}\".format(tax.tax_amount or 0) }}</td></tr>\n"
    "  {% endfor %}\n"
    "  <tr class=\"grand\"><td>TOTAL {{ doc.currency }}</td><td class=\"r\">{{ \"{:,.2f}\".format(doc.grand_total or 0) }}</td></tr>\n"
    "</table>\n"
    "\n"
    "{% if doc.payments %}\n"
    "<div class=\"small center\" style=\"margin-top:3px\">\n"
    "  {% for p in doc.payments %}{{ p.mode_of_payment }}: {{ \"{:,.2f}\".format(p.amount or 0) }}  {% endfor %}\n"
    "</div>\n"
    "{% endif %}\n"
    "\n"
    "<div class=\"divider\"></div>\n"
    "<div class=\"center small\">{{ doc.company }} — Thank you / شكراً!</div>\n"
)

# ── Template 3: Sultan Thermal Bilingual (Arabic + English) ─────────────────
_BILINGUAL_HTML = (
    "__CSS__\n"
    "<style>.ar{direction:rtl;text-align:right}.split{display:flex;justify-content:space-between}</style>\n"
    "\n"
    "<div class=\"center\">\n"
    "  <div class=\"xl bold\">{{ doc.company }}</div>\n"
    "  <div class=\"small\">{{ doc.name }} | {{ doc.posting_date }}</div>\n"
    "</div>\n"
    "\n"
    "<div class=\"divider\"></div>\n"
    "\n"
    "<div class=\"split small\">\n"
    "  <span>Customer: {{ doc.customer_name or doc.customer }}</span>\n"
    "  <span class=\"ar\">العميل: {{ doc.customer_name or doc.customer }}</span>\n"
    "</div>\n"
    "\n"
    "<div class=\"divider\"></div>\n"
    "\n"
    "<table>\n"
    "  <thead><tr>\n"
    "    <th>Item / الصنف</th>\n"
    "    <th class=\"c\">Qty</th>\n"
    "    <th class=\"r\">Amount</th>\n"
    "  </tr></thead>\n"
    "  <tbody>\n"
    "    {% for item in doc.items %}\n"
    "    <tr>\n"
    "      <td>{{ item.item_name or item.item_code }}</td>\n"
    "      <td class=\"c\">{{ item.qty | int }}</td>\n"
    "      <td class=\"r\">{{ \"{:,.2f}\".format(item.amount or 0) }}</td>\n"
    "    </tr>\n"
    "    {% endfor %}\n"
    "  </tbody>\n"
    "</table>\n"
    "\n"
    "<div class=\"solid\"></div>\n"
    "\n"
    "<table>\n"
    "  <tr><td>Subtotal / المجموع الجزئي</td><td class=\"r\">{{ \"{:,.2f}\".format(doc.net_total or 0) }}</td></tr>\n"
    "  {% for tax in doc.taxes %}\n"
    "  <tr><td>{{ tax.description or \"VAT\" }} / ضريبة ({{ tax.rate }}%)</td><td class=\"r\">{{ \"{:,.2f}\".format(tax.tax_amount or 0) }}</td></tr>\n"
    "  {% endfor %}\n"
    "  {% if doc.discount_amount %}\n"
    "  <tr><td>Discount / خصم</td><td class=\"r\">-{{ \"{:,.2f}\".format(doc.discount_amount) }}</td></tr>\n"
    "  {% endif %}\n"
    "  <tr class=\"grand\"><td>TOTAL / الإجمالي {{ doc.currency }}</td><td class=\"r\">{{ \"{:,.2f}\".format(doc.grand_total or 0) }}</td></tr>\n"
    "</table>\n"
    "\n"
    "{% if doc.payments %}\n"
    "<div class=\"divider\"></div>\n"
    "<table style=\"font-size:10px\">\n"
    "  {% for p in doc.payments %}\n"
    "  <tr><td>{{ p.mode_of_payment }}</td><td class=\"r\">{{ \"{:,.2f}\".format(p.amount or 0) }}</td></tr>\n"
    "  {% endfor %}\n"
    "</table>\n"
    "{% endif %}\n"
    "\n"
    "<div class=\"divider\"></div>\n"
    "\n"
    "{% if doc.custom_qr_code %}\n"
    "<div class=\"center\" style=\"margin:4px 0\">\n"
    "  <img src=\"{{ doc.custom_qr_code }}\" style=\"width:28mm;height:28mm\" />\n"
    "</div>\n"
    "<div class=\"divider\"></div>\n"
    "{% endif %}\n"
    "\n"
    "<div class=\"center small\" style=\"margin-top:4px\">\n"
    "  <div>Thank you for shopping with us</div>\n"
    "  <div class=\"ar\">شكراً لتسوقكم معنا</div>\n"
    "</div>\n"
)


FORMATS = [
    {
        "name": "Sultan Thermal Standard",
        "html": _STANDARD_HTML.replace("__CSS__", _BASE_CSS),
        "description": "80mm standard receipt with header, item table, VAT breakdown, and QR code",
    },
    {
        "name": "Sultan Thermal Compact",
        "html": _COMPACT_HTML.replace("__CSS__", _BASE_CSS),
        "description": "80mm compact receipt — minimal header, items and total only",
    },
    {
        "name": "Sultan Thermal Bilingual",
        "html": _BILINGUAL_HTML.replace("__CSS__", _BASE_CSS),
        "description": "80mm bilingual (Arabic/English) receipt with QR code",
    },
]


def create_thermal_print_formats():
    """Create or update the three Sultan thermal print formats."""
    for fmt in FORMATS:
        existing = frappe.db.exists("Print Format", fmt["name"])
        if not existing:
            doc = frappe.new_doc("Print Format")
            doc.name = fmt["name"]
            doc.doc_type = "Sales Invoice"
            doc.custom_format = 1
            doc.print_format_type = "Jinja"
            doc.html = fmt["html"]
            doc.description = fmt.get("description", "")
            doc.insert(ignore_permissions=True)
            print(f"Created print format: {fmt['name']}")
        else:
            frappe.db.set_value("Print Format", fmt["name"], "html", fmt["html"])
            print(f"Updated print format: {fmt['name']}")

    frappe.db.commit()
