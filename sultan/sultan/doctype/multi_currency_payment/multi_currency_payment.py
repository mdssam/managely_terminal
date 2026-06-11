import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, nowdate

DEFAULT_LBP_PER_USD = 89500


class MultiCurrencyPayment(Document):
	def validate(self):
		self.set_missing_values()
		self.validate_lines()
		self.set_totals()

	def on_submit(self):
		self.create_journal_entry()

	def on_cancel(self):
		if self.journal_entry:
			je = frappe.get_doc("Journal Entry", self.journal_entry)
			if je.docstatus == 1:
				je.flags.ignore_permissions = True
				je.cancel()

	# ── Setup helpers ───────────────────────────────────────────────────────────

	def set_missing_values(self):
		if not self.posting_date:
			self.posting_date = nowdate()
		if self.company and not self.company_currency:
			self.company_currency = frappe.get_cached_value("Company", self.company, "default_currency")
		if not self.exchange_rate:
			self.exchange_rate = DEFAULT_LBP_PER_USD

	def validate_lines(self):
		if not self.lines:
			frappe.throw(_("Add at least one payment line."))

		for row in self.lines:
			if not row.mode_of_payment:
				frappe.throw(_("Mode of Payment is required in row {0}.").format(row.idx))
			if not row.currency:
				frappe.throw(_("Currency is required in row {0}.").format(row.idx))
			if flt(row.amount) <= 0:
				frappe.throw(_("Amount must be greater than zero in row {0}.").format(row.idx))

			# Resolve exchange rate: row → ERPNext exchange table → parent default
			if not flt(row.exchange_rate):
				row.exchange_rate = self._fetch_exchange_rate(row.currency)

			# Amount in Base Currency = Amount × Exchange Rate
			if row.currency == self.company_currency:
				row.amount_base_currency = flt(row.amount)
			else:
				row.amount_base_currency = flt(row.amount) * flt(row.exchange_rate)

			row.amount_usd, row.amount_lbp = self._to_usd_lbp(row.amount, row.currency, row.exchange_rate)

	def set_totals(self):
		self.total_usd = sum(flt(r.amount_usd) for r in self.lines)
		self.total_lbp = sum(flt(r.amount_lbp) for r in self.lines)
		self.total_company_amount = sum(flt(r.amount_base_currency) for r in self.lines)

	# ── Currency helpers ────────────────────────────────────────────────────────

	def _fetch_exchange_rate(self, currency):
		if not currency or currency == self.company_currency:
			return 1.0
		rate = frappe.db.get_value(
			"Currency Exchange",
			{"from_currency": currency, "to_currency": self.company_currency},
			"exchange_rate",
			order_by="date desc",
		)
		return flt(rate) or flt(self.exchange_rate) or DEFAULT_LBP_PER_USD

	def _to_usd_lbp(self, amount, currency, exchange_rate):
		amount = flt(amount)
		rate = flt(exchange_rate) or DEFAULT_LBP_PER_USD
		if currency == "LBP":
			return flt(amount / rate), flt(amount, 0)
		if currency == "USD":
			return amount, flt(amount * rate, 0)
		# Generic: convert via exchange_rate to company currency then express in USD/LBP
		base = amount * rate
		return flt(base / rate), flt(base, 0)

	# ── Account resolution ──────────────────────────────────────────────────────

	def _get_mop_account(self, mode_of_payment):
		account = frappe.db.get_value(
			"Mode of Payment Account",
			{"parent": mode_of_payment, "company": self.company},
			"default_account",
		)
		if not account:
			frappe.throw(_(
				"No default account configured for Mode of Payment <b>{0}</b> in company <b>{1}</b>. "
				"Please set it under Accounts → Mode of Payment."
			).format(mode_of_payment, self.company))
		return account

	def _get_party_account(self):
		if not self.party_type or not self.party:
			return None
		account = frappe.db.get_value(
			"Party Account",
			{"parenttype": self.party_type, "parent": self.party, "company": self.company},
			"account",
		)
		if account:
			return account
		if self.party_type == "Customer":
			return frappe.get_cached_value("Company", self.company, "default_receivable_account")
		if self.party_type == "Supplier":
			return frappe.get_cached_value("Company", self.company, "default_payable_account")
		return None

	# ── Journal Entry ───────────────────────────────────────────────────────────

	def create_journal_entry(self):
		if self.journal_entry:
			return

		# Automated Debit/Credit — no user intervention needed
		# Receive: MOP rows = Debit,  Party = Credit
		# Pay:     MOP rows = Credit, Party = Debit
		is_receive = self.payment_type == "Receive"
		mop_entry   = "Debit"  if is_receive else "Credit"
		party_entry = "Credit" if is_receive else "Debit"

		je = frappe.new_doc("Journal Entry")
		je.voucher_type = "Journal Entry"
		je.company = self.company
		je.posting_date = self.posting_date
		je.multi_currency = 1
		je.user_remark = self.remarks or _("Multi Currency Payment {0}").format(self.name)

		for row in self.lines:
			account = self._get_mop_account(row.mode_of_payment)
			account_currency = frappe.get_cached_value("Account", account, "account_currency")
			acc_amount = self._get_account_amount(row, account_currency)
			base_amount = flt(row.amount_base_currency)

			je.append("accounts", {
				"account": account,
				"account_currency": account_currency,
				"exchange_rate": flt(row.exchange_rate) or 1.0,
				"debit_in_account_currency":  acc_amount if mop_entry == "Debit"  else 0,
				"credit_in_account_currency": acc_amount if mop_entry == "Credit" else 0,
				"debit":  base_amount if mop_entry == "Debit"  else 0,
				"credit": base_amount if mop_entry == "Credit" else 0,
				"user_remark": row.remarks or "",
			})

		# Balancing party line (receivable/payable)
		party_account = self._get_party_account()
		if party_account and self.party:
			total_base = flt(self.total_company_amount)
			party_account_currency = frappe.get_cached_value("Account", party_account, "account_currency")
			je.append("accounts", {
				"account": party_account,
				"party_type": self.party_type,
				"party": self.party,
				"account_currency": party_account_currency,
				"exchange_rate": 1.0,
				"debit_in_account_currency":  total_base if party_entry == "Debit"  else 0,
				"credit_in_account_currency": total_base if party_entry == "Credit" else 0,
				"debit":  total_base if party_entry == "Debit"  else 0,
				"credit": total_base if party_entry == "Credit" else 0,
				"user_remark": self.remarks or "",
			})

		je.flags.ignore_permissions = True
		je.insert(ignore_permissions=True)
		je.flags.ignore_permissions = True
		je.submit()
		self.db_set("journal_entry", je.name)

	def _get_account_amount(self, row, account_currency):
		if row.currency == account_currency:
			return flt(row.amount)
		if account_currency == self.company_currency:
			return flt(row.amount_base_currency)
		if account_currency == "USD":
			return flt(row.amount_usd)
		if account_currency == "LBP":
			return flt(row.amount_lbp)
		return flt(row.amount_base_currency)


# ── Whitelisted helpers for the form JS ────────────────────────────────────────

@frappe.whitelist()
def get_mop_for_currency(company, currency):
	"""Return Mode of Payment names whose default account for this company uses the given currency."""
	if not company or not currency:
		return []
	rows = frappe.db.sql(
		"""
		SELECT DISTINCT mpa.parent AS name
		FROM `tabMode of Payment Account` mpa
		JOIN `tabAccount` a ON a.name = mpa.default_account
		WHERE mpa.company = %(company)s
		  AND a.account_currency = %(currency)s
		""",
		{"company": company, "currency": currency},
		as_dict=True,
	)
	return [r.name for r in rows]


@frappe.whitelist()
def get_exchange_rate(from_currency, to_currency):
	"""Fetch the latest exchange rate from Currency Exchange table."""
	if not from_currency or not to_currency or from_currency == to_currency:
		return 1.0
	rate = frappe.db.get_value(
		"Currency Exchange",
		{"from_currency": from_currency, "to_currency": to_currency},
		"exchange_rate",
		order_by="date desc",
	)
	return flt(rate) or None
