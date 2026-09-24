import frappe
from frappe import _
from frappe.utils import add_days, flt, get_datetime_str, nowdate

_original_erpnext_get_exchange_rate = None


def init_exchange_rate_patch():
	global _original_erpnext_get_exchange_rate
	try:
		import erpnext.setup.utils

		if erpnext.setup.utils.get_exchange_rate != get_universal_exchange_rate:
			_original_erpnext_get_exchange_rate = erpnext.setup.utils.get_exchange_rate
			erpnext.setup.utils.get_exchange_rate = get_universal_exchange_rate
	except Exception:
		pass


@frappe.whitelist()
def get_universal_exchange_rate(from_currency, to_currency=None, transaction_date=None, args=None, company=None):
	"""
	Universal bidirectional exchange rate resolver for Frappe & ERPNext.
	Guarantees: Base Amount (to_currency) = Document Amount (from_currency) * Rate.
	Handles:
	1. Direct Lookup: Currency Exchange (from_currency -> to_currency)
	2. Inverse Lookup: Currency Exchange (to_currency -> from_currency) => 1.0 / rate
	3. Pegged Currencies (ERPNext standard)
	4. Company Secondary Currency Dual Rate fallback
	5. Silent fallback without intrusive popup messages
	"""
	if not from_currency:
		return 0.0

	if not company:
		company = frappe.defaults.get_user_default("Company")

	if not to_currency and company:
		to_currency = frappe.get_cached_value("Company", company, "default_currency")

	if not to_currency:
		to_currency = frappe.db.get_single_value("System Settings", "default_currency") or "USD"

	if from_currency == to_currency:
		return 1.0

	if not transaction_date:
		transaction_date = nowdate()

	date_str = get_datetime_str(transaction_date)

	try:
		currency_settings = frappe.get_cached_doc("Accounts Settings")
		allow_stale_rates = currency_settings.get("allow_stale")
	except Exception:
		currency_settings = None
		allow_stale_rates = 1

	checkpoint_date = None
	if not allow_stale_rates and currency_settings:
		stale_days = currency_settings.get("stale_days")
		if stale_days:
			checkpoint_date = get_datetime_str(add_days(transaction_date, -stale_days))

	# 1. Direct lookup: from_currency -> to_currency (with date filter)
	filters = [
		["date", "<=", date_str],
		["from_currency", "=", from_currency],
		["to_currency", "=", to_currency],
	]
	if args == "for_buying":
		filters.append(["for_buying", "=", "1"])
	elif args == "for_selling":
		filters.append(["for_selling", "=", "1"])
	if checkpoint_date:
		filters.append(["date", ">", checkpoint_date])

	rate = frappe.db.get_value("Currency Exchange", filters, "exchange_rate", order_by="date desc")
	if rate and flt(rate) > 0:
		return flt(rate)

	# 1b. Direct lookup without date filter (fallback to latest available)
	fallback_filters = [
		["from_currency", "=", from_currency],
		["to_currency", "=", to_currency],
	]
	if args == "for_buying":
		fallback_filters.append(["for_buying", "=", "1"])
	elif args == "for_selling":
		fallback_filters.append(["for_selling", "=", "1"])

	rate = frappe.db.get_value("Currency Exchange", fallback_filters, "exchange_rate", order_by="date desc")
	if rate and flt(rate) > 0:
		return flt(rate)

	# 2. INVERSE LOOKUP: to_currency -> from_currency (with date filter)
	# When inverting: buying matches selling and vice versa
	inv_filters = [
		["date", "<=", date_str],
		["from_currency", "=", to_currency],
		["to_currency", "=", from_currency],
	]
	if args == "for_buying":
		inv_filters.append(["for_selling", "=", "1"])
	elif args == "for_selling":
		inv_filters.append(["for_buying", "=", "1"])
	if checkpoint_date:
		inv_filters.append(["date", ">", checkpoint_date])

	inv_rate = frappe.db.get_value("Currency Exchange", inv_filters, "exchange_rate", order_by="date desc")
	if inv_rate and flt(inv_rate) > 0:
		return flt(1.0 / flt(inv_rate))

	# 2b. INVERSE LOOKUP without date filter (fallback to latest available)
	inv_fallback_filters = [
		["from_currency", "=", to_currency],
		["to_currency", "=", from_currency],
	]
	if args == "for_buying":
		inv_fallback_filters.append(["for_selling", "=", "1"])
	elif args == "for_selling":
		inv_fallback_filters.append(["for_buying", "=", "1"])

	inv_rate = frappe.db.get_value("Currency Exchange", inv_fallback_filters, "exchange_rate", order_by="date desc")
	if inv_rate and flt(inv_rate) > 0:
		return flt(1.0 / flt(inv_rate))

	# 3. Pegged Currencies (ERPNext standard)
	if currency_settings and currency_settings.get("allow_pegged_currencies_exchange_rates"):
		try:
			from erpnext.setup.utils import get_pegged_currencies, get_pegged_rate

			pegged_currencies = get_pegged_currencies()
			if pegged := get_pegged_rate(pegged_currencies, from_currency, to_currency, transaction_date):
				return flt(pegged)
		except Exception:
			pass

	# 4. Fallback to Company secondary currency dual rate
	if company:
		try:
			sec_curr = frappe.get_cached_value("Company", company, "custom_secondary_currency")
			if sec_curr and (from_currency == sec_curr or to_currency == sec_curr):
				from managely_terminal.managely_terminal.accounting.customizations import get_company_dual_rate

				dual_rate = get_company_dual_rate(company, transaction_date)
				if dual_rate and flt(dual_rate) > 0:
					dual_rate = flt(dual_rate)
					if from_currency == sec_curr:
						return flt(1.0 / dual_rate)
					return dual_rate
		except Exception:
			pass

	# 5. External rate provider via original handler (safe call without unhandled exceptions)
	if _original_erpnext_get_exchange_rate:
		try:
			orig_val = _original_erpnext_get_exchange_rate(from_currency, to_currency, transaction_date, args)
			if orig_val and flt(orig_val) > 0:
				return flt(orig_val)
		except Exception:
			pass

	return 0.0


@frappe.whitelist()
def journal_entry_get_exchange_rate(
	posting_date,
	account=None,
	account_currency=None,
	company=None,
	reference_type=None,
	reference_name=None,
	debit=None,
	credit=None,
	exchange_rate=None,
):
	"""
	Whitelisted method overriding erpnext.accounts.doctype.journal_entry.journal_entry.get_exchange_rate.
	Seamlessly returns bidirectional rate without blocking error modals.
	"""
	if account:
		account_details = frappe.get_cached_value(
			"Account", account, ["account_type", "root_type", "account_currency", "company"], as_dict=1
		)
		if account_details:
			if not company:
				company = account_details.company
			if not account_currency:
				account_currency = account_details.account_currency

	if not company:
		company = frappe.defaults.get_user_default("Company")

	company_currency = frappe.get_cached_value("Company", company, "default_currency") if company else None

	if account_currency and company_currency and account_currency != company_currency:
		if reference_type in ("Sales Invoice", "Purchase Invoice") and reference_name:
			rate = frappe.db.get_value(reference_type, reference_name, "conversion_rate")
			if rate and flt(rate) > 0:
				return flt(rate)

		if not exchange_rate or flt(exchange_rate) == 1.0:
			rate = get_universal_exchange_rate(account_currency, company_currency, posting_date, company=company)
			if rate and flt(rate) > 0:
				return flt(rate)
	else:
		return 1.0

	return flt(exchange_rate) or 1.0


@frappe.whitelist()
def get_standard_erpnext_rate(from_currency, to_currency=None, transaction_date=None, company=None):
	"""
	Return multiplier exchange rate for ERPNext transactions:
	Base Amount (to_currency) = Document Amount (from_currency) * Rate.
	"""
	return get_universal_exchange_rate(from_currency, to_currency, transaction_date, company=company)


@frappe.whitelist()
def get_reconciled_exchange_rate(from_currency, to_currency=None, transaction_date=None, company=None):
	"""
	Fetch latest exchange rate bidirectionally from Currency Exchange doctype.
	"""
	return get_universal_exchange_rate(from_currency, to_currency, transaction_date, company=company)
