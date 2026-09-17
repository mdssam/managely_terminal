import frappe
from frappe import _
from frappe.utils import flt
from managely_terminal.managely_terminal.accounting.exchange_rate_utils import (
	get_standard_erpnext_rate,
)


def validate_payment_entry(doc, method=None):
	"""
	Reconcile and enforce exchange rates on Payment Entry.
	Ensures foreign currency accounts never default to 1.0 or outdated rates.
	"""
	if doc.docstatus == 1:
		return

	if not doc.company:
		return

	company_currency = frappe.get_cached_value("Company", doc.company, "default_currency")
	if not company_currency:
		return

	posting_date = doc.posting_date or frappe.utils.nowdate()

	# 1. Reconcile Source side (paid_from)
	if doc.paid_from and doc.paid_from_account_currency:
		from_curr = doc.paid_from_account_currency
		if from_curr == company_currency:
			doc.source_exchange_rate = 1.0
		else:
			latest_rate = get_standard_erpnext_rate(from_curr, company_currency, posting_date, doc.company)
			if not latest_rate or flt(latest_rate) <= 0:
				frappe.throw(_(
					"Exchange rate not found for <b>{0}</b> to <b>{1}</b> on {2}. "
					"Please configure it under Accounts → Currency Exchange."
				).format(from_curr, company_currency, posting_date))

			latest_rate = flt(latest_rate)
			if not doc.source_exchange_rate or flt(doc.source_exchange_rate) == 1.0 or abs(flt(doc.source_exchange_rate) - latest_rate) > 0.000001:
				doc.source_exchange_rate = latest_rate

		if doc.paid_amount:
			doc.base_paid_amount = flt(flt(doc.paid_amount) * flt(doc.source_exchange_rate), doc.precision("base_paid_amount"))

	# 2. Reconcile Target side (paid_to)
	if doc.paid_to and doc.paid_to_account_currency:
		to_curr = doc.paid_to_account_currency
		if to_curr == company_currency:
			doc.target_exchange_rate = 1.0
		else:
			latest_rate = get_standard_erpnext_rate(to_curr, company_currency, posting_date, doc.company)
			if not latest_rate or flt(latest_rate) <= 0:
				frappe.throw(_(
					"Exchange rate not found for <b>{0}</b> to <b>{1}</b> on {2}. "
					"Please configure it under Accounts → Currency Exchange."
				).format(to_curr, company_currency, posting_date))

			latest_rate = flt(latest_rate)
			if not doc.target_exchange_rate or flt(doc.target_exchange_rate) == 1.0 or abs(flt(doc.target_exchange_rate) - latest_rate) > 0.000001:
				doc.target_exchange_rate = latest_rate

		if doc.received_amount:
			doc.base_received_amount = flt(flt(doc.received_amount) * flt(doc.target_exchange_rate), doc.precision("base_received_amount"))

	if hasattr(doc, "set_difference_amount"):
		doc.set_difference_amount()


def validate_journal_entry(doc, method=None):
	"""
	Reconcile and enforce exchange rates on Journal Entry child accounts.
	Ensures rows with foreign currencies never default to 1.0 or outdated rates.
	"""
	if doc.docstatus == 1:
		return

	if not doc.company:
		return

	company_currency = frappe.get_cached_value("Company", doc.company, "default_currency")
	if not company_currency:
		return

	posting_date = doc.posting_date or frappe.utils.nowdate()

	for d in (doc.get("accounts") or []):
		row_curr = d.account_currency
		if not row_curr and d.account:
			row_curr = frappe.get_cached_value("Account", d.account, "account_currency")
			d.account_currency = row_curr

		if not row_curr:
			continue

		if row_curr == company_currency:
			d.exchange_rate = 1.0
		else:
			latest_rate = get_standard_erpnext_rate(row_curr, company_currency, posting_date, doc.company)
			if not latest_rate or flt(latest_rate) <= 0:
				frappe.throw(_(
					"Row #{0}: Exchange rate not found for currency <b>{1}</b> to <b>{2}</b> on {3}. "
					"Please configure it under Accounts → Currency Exchange."
				).format(d.idx, row_curr, company_currency, posting_date))

			latest_rate = flt(latest_rate)
			if not d.exchange_rate or flt(d.exchange_rate) == 1.0 or abs(flt(d.exchange_rate) - latest_rate) > 0.000001:
				d.exchange_rate = latest_rate

		# Recalculate company currency debit / credit amounts
		if flt(d.debit_in_account_currency):
			d.debit = flt(flt(d.debit_in_account_currency) * flt(d.exchange_rate), d.precision("debit"))
		if flt(d.credit_in_account_currency):
			d.credit = flt(flt(d.credit_in_account_currency) * flt(d.exchange_rate), d.precision("credit"))

	# Update totals and difference
	doc.total_debit = sum(flt(d.debit) for d in (doc.get("accounts") or []))
	doc.total_credit = sum(flt(d.credit) for d in (doc.get("accounts") or []))
	doc.difference = flt(doc.total_debit - doc.total_credit, doc.precision("total_debit") if hasattr(doc, "precision") else 2)


def validate_sales_invoice(doc, method=None):
	"""
	Reconcile and enforce conversion rate on Sales Invoice.
	"""
	if doc.docstatus == 1:
		return

	if not doc.company:
		return

	company_currency = frappe.get_cached_value("Company", doc.company, "default_currency")
	if not company_currency:
		return

	inv_curr = doc.currency or company_currency
	posting_date = doc.posting_date or frappe.utils.nowdate()

	if inv_curr == company_currency:
		doc.conversion_rate = 1.0
	else:
		latest_rate = get_standard_erpnext_rate(inv_curr, company_currency, posting_date, doc.company)
		if not latest_rate or flt(latest_rate) <= 0:
			frappe.throw(_(
				"Exchange rate not found for Sales Invoice currency <b>{0}</b> to <b>{1}</b> on {2}. "
				"Please configure it under Accounts → Currency Exchange."
			).format(inv_curr, company_currency, posting_date))

		latest_rate = flt(latest_rate)
		if not doc.conversion_rate or flt(doc.conversion_rate) == 1.0 or abs(flt(doc.conversion_rate) - latest_rate) > 0.000001:
			doc.conversion_rate = latest_rate
			if hasattr(doc, "calculate_taxes_and_totals"):
				doc.calculate_taxes_and_totals()


def validate_purchase_invoice(doc, method=None):
	"""
	Reconcile and enforce conversion rate on Purchase Invoice.
	"""
	if doc.docstatus == 1:
		return

	if not doc.company:
		return

	company_currency = frappe.get_cached_value("Company", doc.company, "default_currency")
	if not company_currency:
		return

	inv_curr = doc.currency or company_currency
	posting_date = doc.posting_date or frappe.utils.nowdate()

	if inv_curr == company_currency:
		doc.conversion_rate = 1.0
	else:
		latest_rate = get_standard_erpnext_rate(inv_curr, company_currency, posting_date, doc.company)
		if not latest_rate or flt(latest_rate) <= 0:
			frappe.throw(_(
				"Exchange rate not found for Purchase Invoice currency <b>{0}</b> to <b>{1}</b> on {2}. "
				"Please configure it under Accounts → Currency Exchange."
			).format(inv_curr, company_currency, posting_date))

		latest_rate = flt(latest_rate)
		if not doc.conversion_rate or flt(doc.conversion_rate) == 1.0 or abs(flt(doc.conversion_rate) - latest_rate) > 0.000001:
			doc.conversion_rate = latest_rate
			if hasattr(doc, "calculate_taxes_and_totals"):
				doc.calculate_taxes_and_totals()
