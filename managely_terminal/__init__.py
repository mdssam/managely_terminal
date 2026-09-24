__version__ = "0.0.1"

# Universal bidirectional exchange rate patch for Frappe/ERPNext
try:
	from managely_terminal.managely_terminal.accounting.exchange_rate_utils import init_exchange_rate_patch
	init_exchange_rate_patch()
except Exception:
	pass
