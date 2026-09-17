import frappe
from frappe import _
from frappe.utils import flt, nowdate


@frappe.whitelist()
def get_reconciled_exchange_rate(from_currency, to_currency=None, transaction_date=None, company=None):
	"""
	Fetch latest exchange rate bidirectionally from Currency Exchange doctype
	with strict fallback to ERPNext standard utilities and company dual rate configs.
	"""
	if not company:
		company = frappe.defaults.get_user_default("Company")

	if not to_currency and company:
		to_currency = frappe.get_cached_value("Company", company, "default_currency")

	if not from_currency or not to_currency or from_currency == to_currency:
		return 1.0

	if not transaction_date:
		transaction_date = nowdate()

	sec_curr = frappe.get_cached_value("Company", company, "custom_secondary_currency") if company else None

	# 1. Direct lookup with date filter: from_currency -> to_currency (date <= transaction_date)
	rate = frappe.db.get_value(
		"Currency Exchange",
		{
			"from_currency": from_currency,
			"to_currency": to_currency,
			"date": ["<=", transaction_date],
		},
		"exchange_rate",
		order_by="date desc",
	)
	if rate and flt(rate) > 0:
		return flt(rate)

	# 2. Direct lookup without date filter (latest available entry in Currency Exchange)
	rate = frappe.db.get_value(
		"Currency Exchange",
		{"from_currency": from_currency, "to_currency": to_currency},
		"exchange_rate",
		order_by="date desc",
	)
	if rate and flt(rate) > 0:
		return flt(rate)

	# 3. Inverse lookup with date filter: to_currency -> from_currency (date <= transaction_date)
	inv_rate = frappe.db.get_value(
		"Currency Exchange",
		{
			"from_currency": to_currency,
			"to_currency": from_currency,
			"date": ["<=", transaction_date],
		},
		"exchange_rate",
		order_by="date desc",
	)
	if not inv_rate or flt(inv_rate) <= 0:
		# Inverse lookup without date filter (latest available entry in Currency Exchange)
		inv_rate = frappe.db.get_value(
			"Currency Exchange",
			{"from_currency": to_currency, "to_currency": from_currency},
			"exchange_rate",
			order_by="date desc",
		)

	if inv_rate and flt(inv_rate) > 0:
		inv_rate = flt(inv_rate)
		# For secondary currency (e.g. LBP), keep rate as large multiplier (> 1.0)
		if sec_curr and (from_currency == sec_curr or to_currency == sec_curr) and inv_rate > 1.0:
			return inv_rate
		return flt(1.0 / inv_rate)

	# 4. Standard ERPNext utility lookup (for pegged currencies or external provider integration)
	try:
		from erpnext.setup.utils import get_exchange_rate as erpnext_get_exchange_rate
		rate = erpnext_get_exchange_rate(from_currency, to_currency, transaction_date)
		if rate and flt(rate) > 0:
			return flt(rate)
	except Exception:
		pass

	# 5. Dynamic rate lookup for secondary currency from company config
	if sec_curr and (from_currency == sec_curr or to_currency == sec_curr):
		try:
			from managely_terminal.managely_terminal.accounting.customizations import get_company_dual_rate
			rate = get_company_dual_rate(company, transaction_date)
			if rate and flt(rate) > 0:
				return flt(rate)
		except Exception:
			pass

	return None


@frappe.whitelist()
def get_standard_erpnext_rate(from_currency, to_currency=None, transaction_date=None, company=None):
	"""
	Return the multiplier exchange rate for standard ERPNext transactions:
	Base Amount (to_currency) = Document Amount (from_currency) * Rate
	Handles inverted quotes for secondary currencies (e.g. LBP quoted as 89,500).
	"""
	if not company:
		company = frappe.defaults.get_user_default("Company")

	if not to_currency and company:
		to_currency = frappe.get_cached_value("Company", company, "default_currency")

	if not from_currency or not to_currency or from_currency == to_currency:
		return 1.0

	rate = get_reconciled_exchange_rate(from_currency, to_currency, transaction_date, company)
	if not rate or flt(rate) <= 0:
		return None

	rate = flt(rate)
	sec_curr = frappe.get_cached_value("Company", company, "custom_secondary_currency") if company else None

	# If converting from secondary currency (weaker currency, e.g. LBP) to primary (e.g. USD)
	# and the rate is quoted as a large number (e.g. 89500), convert to multiplier: 1.0 / 89500
	if sec_curr and from_currency == sec_curr and rate > 1.0:
		return flt(1.0 / rate)

	return rate

