import re

import frappe
from frappe import _
from frappe.utils import flt


DEFAULT_LBP_PER_USD = 89500
TRANSACTION_DOCTYPES = ("Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry")


def setup_custom_fields():
	"""Create/update sultan accounting custom fields."""
	si_parent = _transaction_parent_fields("Sales Invoice", "customer")
	pi_parent = _transaction_parent_fields("Purchase Invoice", "bill_no", "bill_no")
	pe_parent = _transaction_parent_fields("Payment Entry", "party", "paid_to_account_currency")
	je_parent = _transaction_parent_fields("Journal Entry", "user_remark", "user_remark")

	fields = (
		si_parent
		+ pi_parent
		+ [
			{
				"dt": "Purchase Invoice",
				"fieldname": "custom_supplier_invoice_number",
				"label": "Supplier Invoice Number",
				"fieldtype": "Data",
				"insert_after": "bill_no",
			},
			{
				"dt": "Sales Invoice",
				"fieldname": "custom_stamps_auto_inserted",
				"label": "Stamps Auto Inserted",
				"fieldtype": "Check",
				"insert_after": "taxes_and_charges",
				"hidden": 1,
			},
			{
				"dt": "Purchase Invoice",
				"fieldname": "custom_stamps_auto_inserted",
				"label": "Stamps Auto Inserted",
				"fieldtype": "Check",
				"insert_after": "taxes_and_charges",
				"hidden": 1,
			},
		]
		+ pe_parent
		+ je_parent
		+ _dual_currency_child_fields("Sales Invoice Item", "amount")
		+ _dual_currency_child_fields("Purchase Invoice Item", "amount")
		+ _dual_currency_child_fields("Payment Entry Reference", "allocated_amount")
		+ _dual_currency_child_fields("Journal Entry Account", "credit_in_account_currency")
		+ _dual_currency_parent_total_fields("Sales Invoice", "base_grand_total")
		+ _dual_currency_parent_total_fields("Purchase Invoice", "base_grand_total")
		+ _dual_currency_parent_total_fields("Payment Entry", "base_received_amount")
		+ _dual_currency_parent_total_fields("Journal Entry", "total_credit")
		+ _stamp_tax_fields()
	)

	count = 0
	for f in fields:
		cf_name = frappe.db.get_value("Custom Field", {"dt": f["dt"], "fieldname": f["fieldname"]})
		if not cf_name:
			doc = frappe.new_doc("Custom Field")
			doc.update(f)
			doc.flags.ignore_permissions = True
			doc.insert(ignore_permissions=True)
			count += 1
		else:
			update_data = {k: v for k, v in f.items() if k in (
				"insert_after", "reqd", "bold", "hidden", "description", "label",
				"depends_on", "mandatory_depends_on",
			)}
			if update_data:
				frappe.db.set_value("Custom Field", cf_name, update_data)

	# Delete the old custom_target_warehouse field if it still exists — we now use
	# the native set_warehouse field made visible/mandatory via Property Setters below.
	for dt in ("Sales Invoice", "Purchase Invoice"):
		cf = frappe.db.get_value("Custom Field", {"dt": dt, "fieldname": "custom_target_warehouse"})
		if cf:
			frappe.delete_doc("Custom Field", cf, ignore_permissions=True)

	# Make the native set_warehouse field always visible and mandatory on both invoice types.
	# Standard ERPNext hides it behind depends_on:"update_stock"; we clear that here.
	for dt in ("Sales Invoice", "Purchase Invoice"):
		_ensure_property_setter(dt, "set_warehouse", "depends_on", "", "Code")
		_ensure_property_setter(dt, "set_warehouse", "mandatory_depends_on", "", "Code")
		_ensure_property_setter(dt, "set_warehouse", "reqd", "1", "Check")
		_ensure_property_setter(dt, "set_warehouse", "bold", "1", "Check")


	frappe.db.commit()
	frappe.clear_cache()
	return f"Created/updated {count} accounting custom fields."


def _ensure_property_setter(dt, field, prop, value, prop_type="Data"):
	existing = frappe.db.get_value(
		"Property Setter",
		{"doc_type": dt, "field_name": field, "property": prop},
		"name",
	)
	if existing:
		frappe.db.set_value("Property Setter", existing, "value", str(value))
	else:
		ps = frappe.new_doc("Property Setter")
		ps.doctype_or_field = "DocField"
		ps.doc_type = dt
		ps.field_name = field
		ps.property = prop
		ps.value = str(value)
		ps.property_type = prop_type
		ps.flags.ignore_permissions = True
		ps.insert(ignore_permissions=True)


def _stamp_tax_fields():
	"""Custom fields for Lebanese Stamp Tax on tax child tables."""
	fields = []
	for dt in ("Sales Taxes and Charges", "Purchase Taxes and Charges"):
		fields += [
			{
				"dt": dt,
				"fieldname": "custom_is_stamp",
				"label": "Is Stamp",
				"fieldtype": "Check",
				"insert_after": "description",
				"in_list_view": 1,
			},
			{
				"dt": dt,
				"fieldname": "custom_stamp_amount_lbp",
				"label": "Stamp Amount LBP",
				"fieldtype": "Currency",
				"insert_after": "custom_is_stamp",
				"depends_on": "eval:doc.custom_is_stamp",
				"mandatory_depends_on": "eval:doc.custom_is_stamp",
				"precision": "0",
			},
		]
	return fields


def _apply_stamp_taxes(doc):
	"""Force stamp-marked tax rows to Actual type with the correct LBP-derived amount."""
	if not doc.get("taxes"):
		return
	exchange_rate = flt(getattr(doc, "custom_exchange_rate_override", None)) or DEFAULT_LBP_PER_USD
	currency = getattr(doc, "currency", None) or ""

	for tax in doc.taxes:
		if not (tax.get("custom_is_stamp") and flt(tax.get("custom_stamp_amount_lbp"))):
			continue
		lbp_amount = flt(tax.custom_stamp_amount_lbp)
		tax.charge_type = "Actual"
		tax.rate = 0
		if currency == "LBP":
			tax.tax_amount = lbp_amount
		else:
			tax.tax_amount = flt(lbp_amount / exchange_rate)


def _transaction_parent_fields(dt, insert_after, exchange_insert_after="currency"):
	return [
		{
			"dt": dt,
			"fieldname": "custom_transaction_description",
			"label": "Description",
			"fieldtype": "Small Text",
			"insert_after": insert_after,
		},
		{
			"dt": dt,
			"fieldname": "custom_exchange_rate_override",
			"label": "Exchange Rate Override (LBP/USD)",
			"fieldtype": "Float",
			"default": DEFAULT_LBP_PER_USD,
			"insert_after": exchange_insert_after,
			"description": "Manual transaction exchange rate used for LBP/USD dual-currency display.",
		},
	]


def _dual_currency_child_fields(dt, insert_after):
	return [
		{
			"dt": dt,
			"fieldname": "custom_usd_amount",
			"label": "USD Amount",
			"fieldtype": "Currency",
			"insert_after": insert_after,
			"read_only": 1,
			"in_list_view": 1,
		},
		{
			"dt": dt,
			"fieldname": "custom_lbp_amount",
			"label": "LBP Amount",
			"fieldtype": "Currency",
			"insert_after": "custom_usd_amount",
			"read_only": 1,
			"in_list_view": 1,
			"precision": "0",
		},
	]


def _dual_currency_parent_total_fields(dt, insert_after):
	return [
		{
			"dt": dt,
			"fieldname": "custom_total_usd",
			"label": "Total USD",
			"fieldtype": "Currency",
			"insert_after": insert_after,
			"read_only": 1,
		},
		{
			"dt": dt,
			"fieldname": "custom_total_lbp",
			"label": "Total LBP",
			"fieldtype": "Currency",
			"insert_after": "custom_total_usd",
			"read_only": 1,
			"precision": "0",
		},
	]


def _auto_insert_stamp_taxes(doc):
	"""Automatically append configured stamps to taxes for new Sales/Purchase Invoices."""
	if doc.doctype not in ("Sales Invoice", "Purchase Invoice") or doc.docstatus != 0:
		return

	if getattr(doc, "is_return", False):
		return

	# If stamps were already handled (either loaded on UI or auto-inserted on first validation), do not re-add them.
	if doc.get("custom_stamps_auto_inserted"):
		return

	# Only auto-insert if it is a new document (never saved to database yet)
	if not (doc.is_new() or not frappe.db.exists(doc.doctype, doc.name)):
		return

	if getattr(doc.flags, "sultan_stamps_applied", False):
		return
	doc.flags.sultan_stamps_applied = True

	try:
		settings = frappe.get_single("Sultan Settings")
	except Exception:
		return

	if not settings.get("stamps"):
		return

	if not doc.get("taxes"):
		doc.taxes = []

	inserted = False
	for setting in settings.stamps:
		# Check if stamp is already in taxes to avoid duplicates
		exists = any(
			tax.account_head == setting.account and tax.get("custom_is_stamp")
			for tax in doc.taxes
		)
		if not exists:
			tax_row = {
				"charge_type": "Actual",
				"account_head": setting.account,
				"description": setting.stamp_name,
				"custom_is_stamp": 1,
				"custom_stamp_amount_lbp": setting.amount_lbp,
				"rate": 0,
				"tax_amount": 0,
				"category": "Total",
			}
			if doc.doctype == "Purchase Invoice":
				tax_row["add_deduct_tax"] = "Add"
			doc.append("taxes", tax_row)
			inserted = True

	if inserted:
		doc.custom_stamps_auto_inserted = 1


def before_validate_transaction(doc, method=None):
	if doc.doctype not in TRANSACTION_DOCTYPES:
		return

	ensure_exchange_rate(doc)
	_auto_insert_stamp_taxes(doc)
	_apply_stamp_taxes(doc)
	set_dual_currency_amounts(doc)
	copy_transaction_description_to_remarks(doc)

	if doc.doctype == "Payment Entry":
		autofill_payment_entry_amounts(doc)


def before_save_purchase_invoice(doc, method=None):
	validate_duplicate_supplier_invoice(doc)


@frappe.whitelist()
def get_lbp_usd_rate():
	# 1. Try USD to LBP
	rate = frappe.db.get_value(
		"Currency Exchange",
		{"from_currency": "USD", "to_currency": "LBP"},
		"exchange_rate",
		order_by="date desc",
	)
	if rate:
		return flt(rate)

	# 2. Try LBP to USD
	rate = frappe.db.get_value(
		"Currency Exchange",
		{"from_currency": "LBP", "to_currency": "USD"},
		"exchange_rate",
		order_by="date desc",
	)
	if rate:
		rate = flt(rate)
		if rate > 0:
			if rate < 1.0:
				return 1.0 / rate
			return rate

	return float(DEFAULT_LBP_PER_USD)


def ensure_exchange_rate(doc):
	rate = flt(getattr(doc, "custom_exchange_rate_override", None))
	if not rate:
		rate = get_lbp_usd_rate()
	doc.custom_exchange_rate_override = rate

	# Only override the accounting conversion_rate when the company books in LBP.
	# For other company currencies (e.g. EGP, USD) the standard Frappe rate lookup
	# must be left alone — overriding it with the LBP/USD rate causes wrong totals
	# and makes the browser form perpetually "Not Saved" (ERPNext re-fetches the
	# real rate client-side and detects a mismatch).
	if doc.doctype in ("Sales Invoice", "Purchase Invoice"):
		company_currency = frappe.get_cached_value("Company", doc.company, "default_currency") if doc.company else None
		if company_currency == "LBP" and doc.currency and doc.currency != "LBP":
			doc.conversion_rate = rate


def set_dual_currency_amounts(doc):
	rate = flt(getattr(doc, "custom_exchange_rate_override", None)) or DEFAULT_LBP_PER_USD
	company_currency = frappe.get_cached_value("Company", doc.company, "default_currency") if doc.get("company") else None
	total_usd = 0.0
	total_lbp = 0.0
	total_usd_debit = 0.0
	total_lbp_debit = 0.0
	total_usd_credit = 0.0
	total_lbp_credit = 0.0
	is_je = doc.doctype == "Journal Entry"

	for row in _iter_line_rows(doc):
		line_amount = _get_line_amount(row)
		currency = getattr(row, "account_currency", None) or _get_transaction_currency(doc)
		row_exchange_rate = flt(getattr(row, "exchange_rate", 1.0)) or 1.0
		usd_amount, lbp_amount = _to_usd_lbp(line_amount, currency, rate, company_currency, row_exchange_rate)
		row.custom_usd_amount = usd_amount
		row.custom_lbp_amount = lbp_amount
		if is_je:
			is_debit = flt(getattr(row, "debit", 0)) > 0 or flt(getattr(row, "debit_in_account_currency", 0)) > 0
			if is_debit:
				total_usd_debit += usd_amount
				total_lbp_debit += lbp_amount
			else:
				total_usd_credit += usd_amount
				total_lbp_credit += lbp_amount
		else:
			total_usd += usd_amount
			total_lbp += lbp_amount

	if is_je:
		total_usd = total_usd_debit if total_usd_debit > 0 else total_usd_credit
		total_lbp = total_lbp_debit if total_lbp_debit > 0 else total_lbp_credit
	elif doc.doctype in ("Sales Invoice", "Purchase Invoice"):
		final_amount = flt(getattr(doc, "rounded_total", 0)) or flt(getattr(doc, "grand_total", 0))
		currency = doc.currency or company_currency or frappe.db.get_default("currency") or frappe.db.get_single_value("System Settings", "default_currency") or frappe.db.get_value("Company", {}, "default_currency")
		total_usd, total_lbp = _to_usd_lbp(final_amount, currency, rate, company_currency)

	# Update parent total fields if present on the doctype
	if frappe.get_meta(doc.doctype).has_field("custom_total_usd"):
		doc.custom_total_usd = total_usd
	if frappe.get_meta(doc.doctype).has_field("custom_total_lbp"):
		doc.custom_total_lbp = round(total_lbp)




def copy_transaction_description_to_remarks(doc):
	description = (getattr(doc, "custom_transaction_description", None) or "").strip()
	if description and hasattr(doc, "remarks") and not (doc.remarks or "").strip():
		doc.remarks = description


def autofill_payment_entry_amounts(doc):
	if doc.payment_type == "Internal Transfer" or not doc.get("references"):
		return

	total = sum(flt(row.allocated_amount) for row in doc.references)
	if total <= 0:
		return

	precision = doc.precision("paid_amount") or 2
	if not flt(doc.paid_amount) or abs(flt(doc.paid_amount) - total) > 10 ** -precision:
		doc.paid_amount = total
	if not flt(doc.received_amount) or abs(flt(doc.received_amount) - total) > 10 ** -precision:
		doc.received_amount = total


def validate_duplicate_supplier_invoice(doc):
	supplier_invoice_number = (
		getattr(doc, "custom_supplier_invoice_number", None) or getattr(doc, "bill_no", None) or ""
	).strip()
	if not supplier_invoice_number or not doc.supplier:
		return

	duplicate = frappe.db.get_value(
		"Purchase Invoice",
		{
			"supplier": doc.supplier,
			"name": ["!=", doc.name],
			"docstatus": ["<", 2],
			"custom_supplier_invoice_number": supplier_invoice_number,
		},
		"name",
	)
	if not duplicate:
		duplicate = frappe.db.get_value(
			"Purchase Invoice",
			{
				"supplier": doc.supplier,
				"name": ["!=", doc.name],
				"docstatus": ["<", 2],
				"bill_no": supplier_invoice_number,
			},
			"name",
		)

	if duplicate:
		frappe.throw(
			_("Supplier Invoice Number {0} is already recorded for supplier {1} in Purchase Invoice {2}.").format(
				frappe.bold(supplier_invoice_number), frappe.bold(doc.supplier), frappe.bold(duplicate)
			),
			title=_("Duplicate Supplier Invoice"),
		)


def autonumber_child_account(doc, method=None):
	if not doc.parent_account or doc.account_number:
		return

	parent_number = frappe.db.get_value("Account", doc.parent_account, "account_number")
	if not parent_number:
		return

	doc.account_number = get_next_child_account_number(doc.parent_account, parent_number)


def get_next_child_account_number(parent_account, parent_number):
	parent_number = str(parent_number).strip()
	if not re.fullmatch(r"\d+", parent_number):
		return parent_number

	child_numbers = frappe.get_all(
		"Account",
		filters={"parent_account": parent_account, "account_number": ["is", "set"]},
		pluck="account_number",
	)
	numeric_child_numbers = [
		int(str(number))
		for number in child_numbers
		if str(number).isdigit() and len(str(number)) == len(parent_number)
	]

	next_number = max(numeric_child_numbers + [int(parent_number)]) + 1
	return str(next_number).zfill(len(parent_number))


@frappe.whitelist()
def get_next_child_account_number_for_parent(parent_account):
	if not parent_account:
		return None

	parent_number = frappe.db.get_value("Account", parent_account, "account_number")
	if not parent_number:
		return None

	return get_next_child_account_number(parent_account, parent_number)


def _iter_line_rows(doc):
	table_fields = {
		"Sales Invoice": ("items",),
		"Purchase Invoice": ("items",),
		"Payment Entry": ("references",),
		"Journal Entry": ("accounts",),
	}
	for table_field in table_fields.get(doc.doctype, ()):
		for row in doc.get(table_field) or []:
			yield row


def _get_line_amount(row):
	for fieldname in (
		"amount",
		"allocated_amount",
		"debit_in_account_currency",
		"credit_in_account_currency",
		"debit",
		"credit",
	):
		value = flt(getattr(row, fieldname, None))
		if value:
			return abs(value)
	return 0


def _get_transaction_currency(doc):
	if getattr(doc, "currency", None):
		return doc.currency
	if getattr(doc, "paid_from_account_currency", None):
		return doc.paid_from_account_currency
	if getattr(doc, "company", None):
		return frappe.get_cached_value("Company", doc.company, "default_currency")
	return None


def _to_usd_lbp(amount, currency, rate, company_currency=None, row_exchange_rate=1.0):
	amount = flt(amount)
	rate = flt(rate) or DEFAULT_LBP_PER_USD

	if currency == "LBP":
		return flt(amount / rate), flt(amount, 0)
	if currency == "USD":
		return flt(amount), flt(amount * rate, 0)

	# Generic currency: convert via exchange_rate to company currency then express in USD/LBP
	if not company_currency:
		return flt(amount), flt(amount * rate, 0)

	if company_currency == "USD":
		usd_amount = amount * flt(row_exchange_rate)
	else:
		base_amount = amount * flt(row_exchange_rate)
		usd_amount = base_amount / rate

	return flt(usd_amount), flt(usd_amount * rate, 0)

