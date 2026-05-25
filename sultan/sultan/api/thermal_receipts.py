"""
Create three 80mm thermal receipt print formats for Sultan POS.
Called from setup_fields.run() or directly via bench execute.
"""

import frappe

# ── Shared style ─────────────────────────────────────────────────────────────
_BASE_CSS = """
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body, html { width: 72mm; font-size: 11px; color: #000; background: #fff; }
@page { size: 80mm auto; margin: 4mm; }
.center { text-align: center; }
.right  { text-align: right; }
.bold   { font-weight: bold; }
.small  { font-size: 9px; }
.lg     { font-size: 15px; }
.xl     { font-size: 18px; }
.divider { border-top: 1px dashed #000; margin: 4px 0; }
.line   { border-top: 1px solid #000; margin: 4px 0; }
table   { width: 100%; border-collapse: collapse; }
td, th  { padding: 1px 2px; vertical-align: top; }
th      { font-weight: bold; border-bottom: 1px solid #000; }
.items-table td:last-child  { text-align: right; }
.totals-table td:last-child { text-align: right; font-weight: bold; }
.totals-table .grand td     { font-size: 13px; font-weight: bold; border-top: 1px solid #000; }
.logo-area { height: 40px; display: flex; align-items: center; justify-content: center; margin-bottom: 4px; }
.logo-area img { max-height: 40px; max-width: 60mm; }
</style>
"""

# ── Template 1: Sultan Thermal Standard ─────────────────────────────────────
_STANDARD_HTML = """
{css}

<div class="center">
  <div class="logo-area">
    {{% if doc.company and frappe.db.get_value("Company", doc.company, "company_logo") %}}
      <img src="{{ frappe.db.get_value("Company", doc.company, "company_logo") }}" />
    {{% else %}}
      <span class="xl bold">{{ doc.company or "" }}</span>
    {{% endif %}}
  </div>
  <div>{{ frappe.db.get_value("Company", doc.company, "company_name") or doc.company or "" }}</div>
  {{% set addr = frappe.db.get_value("Company", doc.company, "address") %}}{{% if addr %}}<div class="small">{{ addr }}</div>{{% endif %}}
  {{% set tax_id = frappe.db.get_value("Company", doc.company, "tax_id") %}}{{% if tax_id %}}<div class="small">VAT: {{ tax_id }}</div>{{% endif %}}
</div>

<div class="divider"></div>

<div class="center">
  <div class="bold lg">TAX INVOICE / فاتورة ضريبية</div>
  <div>{{ doc.name }}</div>
  <div class="small">{{ frappe.utils.format_datetime(doc.posting_date ~ " " ~ (doc.posting_time or "00:00:00"), "dd/MM/yyyy HH:mm") }}</div>
  <div class="small">Cashier: {{ frappe.db.get_value("User", doc.owner, "full_name") or doc.owner }}</div>
  <div class="small">Customer: {{ doc.customer_name or doc.customer }}</div>
</div>

<div class="divider"></div>

<table class="items-table">
  <thead>
    <tr>
      <th style="width:40%">Item</th>
      <th style="width:15%;text-align:center">Qty</th>
      <th style="width:20%;text-align:right">Price</th>
      <th style="width:25%;text-align:right">Total</th>
    </tr>
  </thead>
  <tbody>
    {{% for item in doc.items %}}
    <tr>
      <td>{{ item.item_name or item.item_code }}</td>
      <td style="text-align:center">{{ item.qty | int }}</td>
      <td style="text-align:right">{{ "{:,.2f}".format(item.rate or 0) }}</td>
      <td style="text-align:right">{{ "{:,.2f}".format(item.amount or 0) }}</td>
    </tr>
    {{% endfor %}}
  </tbody>
</table>

<div class="line"></div>

<table class="totals-table">
  <tr><td>Subtotal / المجموع</td><td>{{ "{:,.2f}".format(doc.net_total or 0) }}</td></tr>
  {{% for tax in doc.taxes %}}
  <tr><td>{{ tax.description or tax.account_head }} ({{ tax.rate }}%)</td><td>{{ "{:,.2f}".format(tax.tax_amount or 0) }}</td></tr>
  {{% endfor %}}
  {{% if doc.discount_amount %}}
  <tr><td>Discount / خصم</td><td>-{{ "{:,.2f}".format(doc.discount_amount) }}</td></tr>
  {{% endif %}}
  <tr class="grand"><td>TOTAL / الإجمالي {{ doc.currency }}</td><td>{{ "{:,.2f}".format(doc.grand_total or 0) }}</td></tr>
</table>

{{% if doc.payments %}}
<div class="divider"></div>
<table class="totals-table">
  {{% for p in doc.payments %}}<tr><td>{{ p.mode_of_payment }}</td><td>{{ "{:,.2f}".format(p.amount or 0) }}</td></tr>{{% endfor %}}
</table>
{{% endif %}}

<div class="divider"></div>

{{% if doc.custom_qr_code_value or doc.custom_qr_code %}}<div class="center" style="margin:6px 0"><img src="{{ doc.custom_qr_code or '' }}" style="width:32mm;height:32mm" /></div>{{% endif %}}

<div class="center small" style="margin-top:8px">
  <div>Thank you for your visit! شكراً لزيارتكم</div>
  <div style="margin-top:16px;border-top:1px solid #000;padding-top:2px">This is a computer generated receipt</div>
</div>
"""

# ── Template 2: Sultan Thermal Compact ──────────────────────────────────────
_COMPACT_HTML = """
{css}

<div class="center">
  <div class="bold lg">{{ doc.company or "" }}</div>
  <div class="small">{{ doc.name }} | {{ frappe.utils.format_datetime(doc.posting_date ~ " " ~ (doc.posting_time or "00:00:00"), "dd/MM/yyyy HH:mm") }}</div>
  <div class="small">{{ doc.customer_name or doc.customer }}</div>
</div>

<div class="divider"></div>

<table class="items-table" style="font-size:10px">
  {{% for item in doc.items %}}
  <tr>
    <td>{{ item.item_name or item.item_code }} × {{ item.qty | int }}</td>
    <td style="text-align:right">{{ "{:,.2f}".format(item.amount or 0) }}</td>
  </tr>
  {{% endfor %}}
</table>

<div class="line"></div>

<table class="totals-table">
  <tr><td>Net</td><td>{{ "{:,.2f}".format(doc.net_total or 0) }}</td></tr>
  {{% for tax in doc.taxes %}}
  <tr><td>VAT {{ tax.rate }}%</td><td>{{ "{:,.2f}".format(tax.tax_amount or 0) }}</td></tr>
  {{% endfor %}}
  <tr class="grand"><td>TOTAL {{ doc.currency }}</td><td>{{ "{:,.2f}".format(doc.grand_total or 0) }}</td></tr>
</table>

{{% if doc.payments %}}<div class="small center" style="margin-top:3px">Paid: {{% for p in doc.payments %}}{{ p.mode_of_payment }} {{ "{:,.2f}".format(p.amount or 0) }}  {{% endfor %}}</div>{{% endif %}}

<div class="divider"></div>
<div class="center small">{{ doc.company }} — Thank you!</div>
"""

# ── Template 3: Sultan Thermal Bilingual (Arabic + English) ─────────────────
_BILINGUAL_HTML = """
{css}
<style>
.ar { direction: rtl; text-align: right; font-family: 'Arial', sans-serif; }
.en { direction: ltr; text-align: left; }
.bi { display: flex; justify-content: space-between; }
.bi .ar-side { direction: rtl; }
.bi .en-side { direction: ltr; }
</style>

<div class="center">
  <div class="bold xl">{{ doc.company or "" }}</div>
  <div class="small">{{ doc.name }}</div>
  <div class="small">{{ frappe.utils.format_datetime(doc.posting_date ~ " " ~ (doc.posting_time or "00:00:00"), "dd/MM/yyyy HH:mm") }}</div>
</div>

<div class="divider"></div>

<div class="bi small">
  <div class="en-side">Customer: {{ doc.customer_name or doc.customer }}</div>
  <div class="ar-side ar">العميل: {{ doc.customer_name or doc.customer }}</div>
</div>

<div class="divider"></div>

<!-- Items -->
<table style="font-size:10px">
  <thead>
    <tr>
      <th>Item / الصنف</th>
      <th style="text-align:center">Qty</th>
      <th style="text-align:right">Amount</th>
    </tr>
  </thead>
  <tbody>
    {{% for item in doc.items %}}
    <tr>
      <td>{{ item.item_name or item.item_code }}</td>
      <td style="text-align:center">{{ item.qty | int }}</td>
      <td style="text-align:right">{{ "{:,.2f}".format(item.amount or 0) }}</td>
    </tr>
    {{% endfor %}}
  </tbody>
</table>

<div class="line"></div>

<table class="totals-table">
  <tr>
    <td>Subtotal / المجموع الجزئي</td>
    <td>{{ "{:,.2f}".format(doc.net_total or 0) }}</td>
  </tr>
  {{% for tax in doc.taxes %}}
  <tr>
    <td>{{ tax.description or "VAT" }} ({{ tax.rate }}%) / ضريبة</td>
    <td>{{ "{:,.2f}".format(tax.tax_amount or 0) }}</td>
  </tr>
  {{% endfor %}}
  {{% if doc.discount_amount %}}
  <tr><td>Discount / خصم</td><td>-{{ "{:,.2f}".format(doc.discount_amount) }}</td></tr>
  {{% endif %}}
  <tr class="grand">
    <td>TOTAL / الإجمالي {{ doc.currency }}</td>
    <td>{{ "{:,.2f}".format(doc.grand_total or 0) }}</td>
  </tr>
</table>

{{% if doc.payments %}}
<div class="divider"></div>
<table style="font-size:10px">
  {{% for p in doc.payments %}}
  <tr>
    <td>{{ p.mode_of_payment }}</td>
    <td style="text-align:right">{{ "{:,.2f}".format(p.amount or 0) }}</td>
  </tr>
  {{% endfor %}}
</table>
{{% endif %}}

<div class="divider"></div>

{{% if doc.custom_qr_code_value or doc.custom_qr_code %}}<div class="center" style="margin:4px 0"><img src="{{ doc.custom_qr_code or '' }}" style="width:28mm;height:28mm" /></div>{{% endif %}}

<div class="center small" style="margin-top:6px">
  <div>Thank you for shopping with us</div>
  <div class="ar" style="margin-top:2px">شكراً لتسوقكم معنا</div>
</div>
"""


FORMATS = [
    {
        "name": "Sultan Thermal Standard",
        "html": _STANDARD_HTML.format(css=_BASE_CSS),
        "description": "80mm standard receipt with logo, item table, VAT breakdown, and QR code",
    },
    {
        "name": "Sultan Thermal Compact",
        "html": _COMPACT_HTML.format(css=_BASE_CSS),
        "description": "80mm compact receipt — minimal header, items, and total only",
    },
    {
        "name": "Sultan Thermal Bilingual",
        "html": _BILINGUAL_HTML.format(css=_BASE_CSS),
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
