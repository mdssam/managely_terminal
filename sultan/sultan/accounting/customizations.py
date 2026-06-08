import re

import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import flt


DEFAULT_LBP_PER_USD = 89500
TRANSACTION_DOCTYPES = ("Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry")


def setup_custom_fields():
	create_custom_fields(
		{
			"Sales Invoice": _transaction_parent_fields("customer"),
			"Purchase Invoice": _transaction_parent_fields("bill_no")
			+ [
				{
					"fieldname": "custom_supplier_invoice_number",
					"label": "Supplier Invoice Number",
					"fieldtype": "Data",
					"insert_after": "bill_no",
					"translatable": 0,
				}
			],
			"Payment Entry": _transaction_parent_fields("party", "paid_to_account_currency"),
			"Journal Entry": _transaction_parent_fields("user_remark", "user_remark"),
			"Sales Invoice Item": _dual_currency_child_fields("amount"),
			"Purchase Invoice Item": _dual_currency_child_fields("amount"),
			"Payment Entry Reference": _dual_currency_child_fields("allocated_amount"),
			"Journal Entry Account": _dual_currency_child_fields("credit_in_account_currency"),
		},
		update=True,
	)
	frappe.clear_cache()


def _transaction_parent_fields(insert_after, exchange_insert_after="currency"):
	return [
		{
			"fieldname": "custom_transaction_description",
			"label": "Description",
			"fieldtype": "Small Text",
			"insert_after": insert_after,
		},
		{
			"fieldname": "custom_exchange_rate_override",
			"label": "Exchange Rate Override (LBP/USD)",
			"fieldtype": "Float",
			"default": DEFAULT_LBP_PER_USD,
			"insert_after": exchange_insert_after,
			"description": "Manual transaction exchange rate used for LBP/USD dual-currency display.",
		},
	]


def _dual_currency_child_fields(insert_after):
	return [
		{
			"fieldname": "custom_usd_amount",
			"label": "USD Amount",
			"fieldtype": "Currency",
			"insert_after": insert_after,
			"read_only": 1,
			"in_list_view": 1,
		},
		{
			"fieldname": "custom_lbp_amount",
			"label": "LBP Amount",
			"fieldtype": "Currency",
			"insert_after": "custom_usd_amount",
			"read_only": 1,
			"in_list_view": 1,
			"precision": "0",
		},
	]


def before_validate_transaction(doc, method=None):
	if doc.doctype not in TRANSACTION_DOCTYPES:
		return

	ensure_exchange_rate(doc)
	set_dual_currency_amounts(doc)
	copy_transaction_description_to_remarks(doc)

	if doc.doctype == "Payment Entry":
		autofill_payment_entry_amounts(doc)


def before_save_purchase_invoice(doc, method=None):
	validate_duplicate_supplier_invoice(doc)


def ensure_exchange_rate(doc):
	rate = flt(getattr(doc, "custom_exchange_rate_override", None)) or DEFAULT_LBP_PER_USD
	doc.custom_exchange_rate_override = rate

	if doc.doctype in ("Sales Invoice", "Purchase Invoice"):
		company_currency = frappe.get_cached_value("Company", doc.company, "default_currency") if doc.company else None
		if doc.currency and company_currency and doc.currency != company_currency:
			doc.conversion_rate = rate


def set_dual_currency_amounts(doc):
	rate = flt(getattr(doc, "custom_exchange_rate_override", None)) or DEFAULT_LBP_PER_USD
	for row in _iter_line_rows(doc):
		line_amount = _get_line_amount(row)
		currency = getattr(row, "account_currency", None) or _get_transaction_currency(doc)
		usd_amount, lbp_amount = _to_usd_lbp(line_amount, currency, rate)
		row.custom_usd_amount = usd_amount
		row.custom_lbp_amount = lbp_amount


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


def _to_usd_lbp(amount, currency, rate):
	amount = flt(amount)
	rate = flt(rate) or DEFAULT_LBP_PER_USD

	if currency == "LBP":
		return flt(amount / rate), flt(amount, 0)
	return flt(amount), flt(amount * rate, 0)
