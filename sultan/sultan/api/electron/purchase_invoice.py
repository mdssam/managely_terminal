import frappe
from erpnext.accounts.doctype.purchase_invoice.purchase_invoice import PurchaseInvoice

from sultan.sultan.api.electron.sales_invoice import _fix_stamp_gl_entries, _is_stamp_account


class CustomPurchaseInvoice(PurchaseInvoice):
	def validate_account_currency(self, account, account_currency=None):
		if _is_stamp_account(self, account):
			return
		super().validate_account_currency(account, account_currency)

	def get_gl_entries(self, warehouse_account=None):
		gl_entries = super().get_gl_entries(warehouse_account)
		_fix_stamp_gl_entries(self, gl_entries)
		return gl_entries
