import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, nowdate


class MultiCurrencyPayment(Document):
	def validate(self):
		self.set_missing_values()
		self.validate_lines()
		self.set_totals()

	def on_submit(self):
		self.create_journal_entry()

	def on_cancel(self):
		if self.journal_entry:
			journal_entry = frappe.get_doc("Journal Entry", self.journal_entry)
			if journal_entry.docstatus == 1:
				journal_entry.cancel()

	def set_missing_values(self):
		if not self.posting_date:
			self.posting_date = nowdate()
		if self.company and not self.company_currency:
			self.company_currency = frappe.get_cached_value("Company", self.company, "default_currency")
		if not self.exchange_rate:
			self.exchange_rate = 89500

	def validate_lines(self):
		if not self.lines:
			frappe.throw(_("Add at least one payment line."))

		for row in self.lines:
			if not row.account:
				frappe.throw(_("Account is required in row {0}.").format(row.idx))
			if not row.currency:
				row.currency = frappe.get_cached_value("Account", row.account, "account_currency")
			if flt(row.amount) <= 0:
				frappe.throw(_("Amount must be greater than zero in row {0}.").format(row.idx))
			row.exchange_rate = flt(row.exchange_rate) or self.exchange_rate
			row.amount_usd, row.amount_lbp = self.get_dual_amounts(row.amount, row.currency, row.exchange_rate)
			row.company_amount = self.get_company_amount(row)

	def set_totals(self):
		self.total_usd = sum(flt(row.amount_usd) for row in self.lines)
		self.total_lbp = sum(flt(row.amount_lbp) for row in self.lines)
		self.total_company_amount = sum(flt(row.company_amount) for row in self.lines)

	def get_dual_amounts(self, amount, currency, exchange_rate):
		amount = flt(amount)
		exchange_rate = flt(exchange_rate) or 89500
		if currency == "LBP":
			return flt(amount / exchange_rate), flt(amount, 0)
		return amount, flt(amount * exchange_rate, 0)

	def get_company_amount(self, row):
		if row.currency == self.company_currency:
			return flt(row.amount)
		if self.company_currency == "LBP":
			return flt(row.amount_lbp)
		return flt(row.amount_usd)

	def create_journal_entry(self):
		if self.journal_entry:
			return

		je = frappe.new_doc("Journal Entry")
		je.voucher_type = "Journal Entry"
		je.company = self.company
		je.posting_date = self.posting_date
		je.multi_currency = 1
		je.user_remark = self.remarks or _("Created from Multi Currency Payment {0}").format(self.name)

		for row in self.lines:
			account_currency = frappe.get_cached_value("Account", row.account, "account_currency")
			account_amount = self.get_account_amount(row, account_currency)
			company_amount = flt(row.company_amount)
			je.append(
				"accounts",
				{
					"account": row.account,
					"party_type": row.party_type or self.party_type,
					"party": row.party or self.party,
					"account_currency": account_currency,
					"exchange_rate": flt(row.exchange_rate) or self.exchange_rate,
					"debit_in_account_currency": account_amount if row.entry_type == "Debit" else 0,
					"credit_in_account_currency": account_amount if row.entry_type == "Credit" else 0,
					"debit": company_amount if row.entry_type == "Debit" else 0,
					"credit": company_amount if row.entry_type == "Credit" else 0,
				},
			)

		je.flags.ignore_permissions = True
		je.insert(ignore_permissions=True)
		je.submit()
		self.db_set("journal_entry", je.name)

	def get_account_amount(self, row, account_currency):
		if row.currency == account_currency:
			return flt(row.amount)
		if account_currency == "LBP":
			return flt(row.amount_lbp)
		if account_currency == "USD":
			return flt(row.amount_usd)
		return flt(row.company_amount)
