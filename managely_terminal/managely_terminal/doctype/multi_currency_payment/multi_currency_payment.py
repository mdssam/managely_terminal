import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, nowdate

def convert_currency(amount, from_currency, to_currency, rate, company=None):
	amount = flt(amount)
	rate = flt(rate)
	if not rate:
		return amount
	if from_currency == to_currency:
		return amount

	sec_curr = None
	if company:
		from managely_terminal.managely_terminal.accounting.customizations import get_company_secondary_currency
		sec_curr = get_company_secondary_currency(company)

	is_secondary_from = bool(sec_curr and from_currency == sec_curr)
	is_secondary_to = bool(sec_curr and to_currency == sec_curr)

	if is_secondary_from:
		if rate <= 1.0:
			from managely_terminal.managely_terminal.accounting.customizations import get_company_dual_rate
			rate = get_company_dual_rate(company)
		if rate and rate > 1.0:
			return amount / rate
		elif rate and rate > 0:
			return amount * rate
		return amount
	elif is_secondary_to:
		if rate <= 1.0:
			from managely_terminal.managely_terminal.accounting.customizations import get_company_dual_rate
			rate = get_company_dual_rate(company)
		if rate and rate > 1.0:
			return amount * rate
		elif rate and rate > 0:
			return amount / rate
		return amount

	# Default standard currency conversion: multiply amount by rate
	return amount * rate


class MultiCurrencyPayment(Document):
	def validate(self):
		self.set_missing_values()
		self.validate_lines()
		self.validate_references()
		self.set_totals()

	def before_submit(self):
		"""Validate that total allocated does not exceed total payments and exchange rates are sane."""
		for row in self.lines:
			if row.currency != self.company_currency:
				if not flt(row.exchange_rate) or flt(row.exchange_rate) <= 0:
					frappe.throw(_(
						"Cannot submit: Invalid exchange rate ({0}) for currency <b>{1}</b> in row {2}."
					).format(row.exchange_rate, row.currency, row.idx))
				sec_curr = frappe.get_cached_value("Company", self.company, "custom_secondary_currency") if self.company else None
				if sec_curr and row.currency == sec_curr:
					if flt(row.exchange_rate) <= 1.0 and flt(self.exchange_rate) > 1.0:
						frappe.throw(_(
							"Cannot submit: Exchange rate for {0} in row {1} cannot be 1.0 when exchange rate is configured as {2}."
						).format(row.currency, row.idx, self.exchange_rate))

		if self.references:
			total_allocated = flt(self.total_references)
			total_payments = flt(self.total_payments)
			if total_allocated > total_payments + 0.001:
				frappe.throw(_(
					"Cannot submit: Total Allocated ({0}) exceeds Total Payments ({1}). "
					"Please reduce the allocated amounts or increase payment lines."
				).format(
					frappe.format(total_allocated, {"fieldtype": "Currency"}),
					frappe.format(total_payments, {"fieldtype": "Currency"})
				))

	def on_submit(self):
		self.make_gl_entries()
		self.update_vouchers_outstanding()

	def on_cancel(self):
		self.ignore_linked_doctypes = ["GL Entry", "Payment Ledger Entry"]
		# Legacy records used Journal Entry — cancel it if still submitted
		if self.journal_entry:
			je = frappe.get_doc("Journal Entry", self.journal_entry)
			if je.docstatus == 1:
				je.flags.ignore_permissions = True
				je.cancel()
		else:
			self.make_gl_entries(cancel=True)

		self.update_vouchers_outstanding(on_cancel=True)

	# ── Setup helpers ───────────────────────────────────────────────────────────

	def set_missing_values(self):
		if not self.posting_date:
			self.posting_date = nowdate()
		if self.company and not self.company_currency:
			self.company_currency = frappe.get_cached_value("Company", self.company, "default_currency")
		if self.company and not self.exchange_rate:
			from managely_terminal.managely_terminal.accounting.customizations import (
				get_company_secondary_currency,
				get_company_dual_rate,
			)
			if get_company_secondary_currency(self.company):
				self.exchange_rate = get_company_dual_rate(self.company, self.posting_date)

	def validate_lines(self):
		if not self.lines:
			frappe.throw(_("Add at least one payment line."))

		# Check for duplicate mode_of_payment
		seen_mop = set()
		for row in self.lines:
			if row.mode_of_payment:
				if row.mode_of_payment in seen_mop:
					frappe.throw(_(
						"Mode of Payment <b>{0}</b> is used more than once in the Payments table (row {1}). "
						"Each mode of payment can only appear once."
					).format(row.mode_of_payment, row.idx))
				seen_mop.add(row.mode_of_payment)

		for row in self.lines:
			if not row.mode_of_payment:
				frappe.throw(_("Mode of Payment is required in row {0}.").format(row.idx))
			if not row.currency:
				frappe.throw(_("Currency is required in row {0}.").format(row.idx))
			if flt(row.amount) <= 0:
				frappe.throw(_("Amount must be greater than zero in row {0}.").format(row.idx))

			# Dynamic exchange rate resolution & reconciliation
			if row.currency == self.company_currency:
				row.exchange_rate = 1.0
			else:
				# Server-side matching & override: fetch latest rate from Currency Exchange
				fetched_rate = self._fetch_exchange_rate(row.currency)
				if fetched_rate and flt(fetched_rate) > 0:
					# Override if mismatched, defaulted to 1.0, or outdated
					row.exchange_rate = flt(fetched_rate)
				elif not flt(row.exchange_rate) or flt(row.exchange_rate) <= 0 or flt(row.exchange_rate) == 1.0:
					frappe.throw(_(
						"Exchange Rate is required for currency <b>{0}</b> in row {1}. "
						"Please set an exchange rate or configure it under Accounts → Currency Exchange."
					).format(row.currency, row.idx))

			# Amount in Base Currency = Amount × Exchange Rate
			if row.currency == self.company_currency:
				row.amount_base_currency = flt(row.amount)
			else:
				row.amount_base_currency = convert_currency(row.amount, row.currency, self.company_currency, row.exchange_rate, company=self.company)

			row.amount_usd, row.amount_lbp = self._to_dual_currency(row.amount, row.currency, row.exchange_rate)

	def validate_references(self):
		"""Validate Payment References: no duplicates, allocated >= 0, allocated <= outstanding, belongs to party."""
		if not self.references:
			return

		# Check for duplicate reference_name
		seen_refs = set()
		for row in self.references:
			if row.reference_name:
				if row.reference_name in seen_refs:
					frappe.throw(_(
						"Reference <b>{0}</b> is used more than once in the Payment References table (row {1}). "
						"Each invoice can only appear once."
					).format(row.reference_name, row.idx))
				seen_refs.add(row.reference_name)

		for row in self.references:
			if not row.reference_doctype or not row.reference_name:
				frappe.throw(_("Reference Doctype and Name are required in Payment References row {0}.").format(row.idx))
			if flt(row.allocated_amount) < 0:
				frappe.throw(_("Allocated Amount cannot be negative in Payment References row {0}.").format(row.idx))
			if flt(row.outstanding_amount) and flt(row.allocated_amount) > flt(row.outstanding_amount) + 0.001:
				frappe.throw(_(
					"Allocated Amount {0} cannot exceed Outstanding Amount {1} in Payment References row {2}."
				).format(row.allocated_amount, row.outstanding_amount, row.idx))

			# Validate that the invoice belongs to the selected party and company
			if row.reference_doctype == "Sales Invoice":
				inv_party, inv_company, inv_docstatus = frappe.db.get_value("Sales Invoice", row.reference_name, ["customer", "company", "docstatus"])
				if inv_party != self.party:
					frappe.throw(_("Sales Invoice {0} does not belong to Customer {1}.").format(row.reference_name, self.party))
				if inv_company != self.company:
					frappe.throw(_("Sales Invoice {0} does not belong to Company {1}.").format(row.reference_name, self.company))
				if inv_docstatus != 1:
					frappe.throw(_("Sales Invoice {0} must be submitted.").format(row.reference_name))
			elif row.reference_doctype == "Purchase Invoice":
				inv_party, inv_company, inv_docstatus = frappe.db.get_value("Purchase Invoice", row.reference_name, ["supplier", "company", "docstatus"])
				if inv_party != self.party:
					frappe.throw(_("Purchase Invoice {0} does not belong to Supplier {1}.").format(row.reference_name, self.party))
				if inv_company != self.company:
					frappe.throw(_("Purchase Invoice {0} does not belong to Company {1}.").format(row.reference_name, self.company))
				if inv_docstatus != 1:
					frappe.throw(_("Purchase Invoice {0} must be submitted.").format(row.reference_name))

	def set_totals(self):
		sec_curr = frappe.get_cached_value("Company", self.company, "custom_secondary_currency") if self.company else None
		frac_units = frappe.get_cached_value("Currency", sec_curr, "fraction_units") if sec_curr else 2
		precision = 0 if frac_units == 0 else 2

		self.total_usd = sum(flt(r.amount_usd) for r in self.lines)
		self.total_lbp = flt(sum(flt(r.amount_lbp) for r in self.lines), precision)
		self.total_company_amount = sum(flt(r.amount_base_currency) for r in self.lines)

		# Summary totals shown on the form
		self.total_payments = flt(self.total_company_amount)
		self.total_references = sum(flt(r.allocated_amount) for r in (self.references or []))
		self.difference = flt(self.total_payments) - flt(self.total_references)
		self.unallocated_amount = max(0.0, flt(self.difference))

	# ── Currency helpers ────────────────────────────────────────────────────────

	def _fetch_exchange_rate(self, currency):
		if not currency or currency == self.company_currency:
			return 1.0
		rate = get_exchange_rate(currency, self.company_currency, self.posting_date, self.company)
		return flt(rate) if rate else 0.0

	def _to_dual_currency(self, amount, currency, exchange_rate):
		amount = flt(amount)
		from managely_terminal.managely_terminal.accounting.customizations import (
			get_company_secondary_currency,
			get_company_dual_rate,
		)
		sec_curr = get_company_secondary_currency(self.company) if self.company else None
		if not sec_curr:
			return amount, 0.0

		if not self.exchange_rate:
			self.exchange_rate = get_company_dual_rate(self.company, self.posting_date) or 0.0
		parent_rate = flt(self.exchange_rate)

		frac_units = frappe.get_cached_value("Currency", sec_curr, "fraction_units") if sec_curr else 2
		precision = 0 if frac_units == 0 else 2

		if currency == sec_curr:
			if parent_rate > 1.0:
				pri = flt(amount / parent_rate)
			elif parent_rate > 0:
				pri = flt(amount * parent_rate)
			else:
				pri = 0.0
			return pri, flt(amount, precision)

		if currency == self.company_currency:
			if parent_rate > 1.0:
				sec = flt(amount * parent_rate)
			elif parent_rate > 0:
				sec = flt(amount / parent_rate)
			else:
				sec = 0.0
			return amount, flt(sec, precision)

		# Foreign currency: convert to company currency first, then secondary
		row_rate = flt(exchange_rate) or 1.0
		pri_amount = flt(amount * row_rate)
		if parent_rate > 1.0:
			sec_amount = flt(pri_amount * parent_rate)
		elif parent_rate > 0:
			sec_amount = flt(pri_amount / parent_rate)
		else:
			sec_amount = 0.0
		return pri_amount, flt(sec_amount, precision)

	_to_usd_lbp = _to_dual_currency

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
		if getattr(self, "party_account", None):
			return self.party_account
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

	def _get_account_amount(self, row, account_currency):
		if row.currency == account_currency:
			return flt(row.amount)
		if account_currency == self.company_currency:
			return flt(row.amount_base_currency)

		# For any other currency, convert from base currency to account_currency using exchange rate
		rate = self._fetch_exchange_rate(account_currency)
		if rate:
			return convert_currency(row.amount_base_currency, self.company_currency, account_currency, rate)
		return flt(row.amount_base_currency)

	# ── Outstanding & Status updates ──────────────────────────────────────────

	def update_vouchers_outstanding(self, on_cancel=False):
		"""Recalculate outstanding amount and update status (Paid, Partly Paid, Unpaid) on referenced vouchers."""
		from erpnext.accounts.doctype.gl_entry.gl_entry import update_outstanding_amt
		party_account = self.party_account or self._get_party_account()
		for ref in (self.references or []):
			if ref.reference_doctype and ref.reference_name:
				try:
					update_outstanding_amt(
						party_account,
						self.party_type,
						self.party,
						ref.reference_doctype,
						ref.reference_name,
						on_cancel=on_cancel
					)
				except Exception as e:
					frappe.log_error(
						f"Error updating outstanding for {ref.reference_doctype} {ref.reference_name}: {str(e)}",
						"Multi Currency Payment update_vouchers_outstanding"
					)

	# ── GL Entries ──────────────────────────────────────────────────────────────

	def make_gl_entries(self, cancel=False):
		from erpnext.accounts.general_ledger import make_gl_entries as _make_gl_entries
		gl_map = self._build_gl_map()
		if gl_map:
			_make_gl_entries(gl_map, cancel=cancel)

	def _build_gl_map(self):
		is_receive = self.payment_type == "Receive"
		cost_center = self.cost_center or frappe.get_cached_value("Company", self.company, "cost_center")
		project = self.project or None
		party_account = self._get_party_account()
		mop_accounts = [self._get_mop_account(row.mode_of_payment) for row in self.lines]
		against_party = ", ".join(dict.fromkeys(mop_accounts))  # unique, order-preserving

		gl_map = []

		for i, row in enumerate(self.lines):
			account = mop_accounts[i]
			account_currency = frappe.get_cached_value("Account", account, "account_currency")
			acc_amount = self._get_account_amount(row, account_currency)
			base_amount = flt(row.amount_base_currency)
			exchange_rate = flt(row.exchange_rate) or 1.0

			row_cost_center = row.get("cost_center") or cost_center
			row_project = row.get("project") or project

			gl_map.append(frappe._dict({
				"doctype": "GL Entry",
				"posting_date": self.posting_date,
				"account": account,
				"party_type": None,
				"party": None,
				"against": party_account or "",
				"debit": base_amount if is_receive else 0,
				"credit": 0 if is_receive else base_amount,
				"debit_in_account_currency": acc_amount if is_receive else 0,
				"credit_in_account_currency": 0 if is_receive else acc_amount,
				"account_currency": account_currency,
				"exchange_rate": exchange_rate,
				"voucher_type": "Multi Currency Payment",
				"voucher_no": self.name,
				"remarks": row.remarks or self.remarks or "",
				"cost_center": row_cost_center,
				"project": row_project,
				"is_opening": "No",
				"is_advance": "No",
				"company": self.company,
			}))

		if party_account and self.party:
			total_base = flt(self.total_company_amount)
			party_currency = frappe.get_cached_value("Account", party_account, "account_currency")

			total_in_party_currency = total_base
			sec_curr = frappe.get_cached_value("Company", self.company, "custom_secondary_currency") if self.company else None
			if party_currency == self.company_currency:
				total_in_party_currency = total_base
			elif sec_curr and party_currency == sec_curr:
				total_in_party_currency = flt(self.total_lbp)
			else:
				rate = self._fetch_exchange_rate(party_currency)
				total_in_party_currency = flt(total_base / rate) if rate else total_base

			party_exchange_rate = 1.0
			if party_currency != self.company_currency and total_in_party_currency:
				party_exchange_rate = flt(total_base / total_in_party_currency)

			total_allocated_base = 0.0

			if self.references:
				for ref in self.references:
					ref_base = flt(ref.allocated_amount)
					if ref_base <= 0:
						continue

					total_allocated_base += ref_base
					ref_in_party = ref_base
					if party_currency != self.company_currency and party_exchange_rate:
						ref_in_party = flt(ref_base / party_exchange_rate)

					gl_map.append(frappe._dict({
						"doctype": "GL Entry",
						"posting_date": self.posting_date,
						"account": party_account,
						"party_type": self.party_type,
						"party": self.party,
						"against": against_party,
						"debit": 0 if is_receive else ref_base,
						"credit": ref_base if is_receive else 0,
						"debit_in_account_currency": 0 if is_receive else ref_in_party,
						"credit_in_account_currency": ref_in_party if is_receive else 0,
						"account_currency": party_currency,
						"exchange_rate": party_exchange_rate,
						"voucher_type": "Multi Currency Payment",
						"voucher_no": self.name,
						"against_voucher_type": ref.reference_doctype,
						"against_voucher": ref.reference_name,
						"remarks": self.remarks or "",
						"cost_center": cost_center,
						"project": project,
						"is_opening": "No",
						"is_advance": "No",
						"company": self.company,
					}))

				# Unallocated / Advance portion
				unallocated_base = total_base - total_allocated_base
				if unallocated_base > 0.001:
					unallocated_in_party = unallocated_base
					if party_currency != self.company_currency and party_exchange_rate:
						unallocated_in_party = flt(unallocated_base / party_exchange_rate)

					gl_map.append(frappe._dict({
						"doctype": "GL Entry",
						"posting_date": self.posting_date,
						"account": party_account,
						"party_type": self.party_type,
						"party": self.party,
						"against": against_party,
						"debit": 0 if is_receive else unallocated_base,
						"credit": unallocated_base if is_receive else 0,
						"debit_in_account_currency": 0 if is_receive else unallocated_in_party,
						"credit_in_account_currency": unallocated_in_party if is_receive else 0,
						"account_currency": party_currency,
						"exchange_rate": party_exchange_rate,
						"voucher_type": "Multi Currency Payment",
						"voucher_no": self.name,
						"against_voucher_type": None,
						"against_voucher": None,
						"remarks": self.remarks or "",
						"cost_center": cost_center,
						"project": project,
						"is_opening": "No",
						"is_advance": "Yes",
						"company": self.company,
					}))
			else:
				# Pure advance / on-account payment
				gl_map.append(frappe._dict({
					"doctype": "GL Entry",
					"posting_date": self.posting_date,
					"account": party_account,
					"party_type": self.party_type,
					"party": self.party,
					"against": against_party,
					"debit": 0 if is_receive else total_base,
					"credit": total_base if is_receive else 0,
					"debit_in_account_currency": 0 if is_receive else total_in_party_currency,
					"credit_in_account_currency": total_in_party_currency if is_receive else 0,
					"account_currency": party_currency,
					"exchange_rate": party_exchange_rate,
					"voucher_type": "Multi Currency Payment",
					"voucher_no": self.name,
					"against_voucher_type": None,
					"against_voucher": None,
					"remarks": self.remarks or "",
					"cost_center": cost_center,
					"project": project,
					"is_opening": "No",
					"is_advance": "Yes",
					"company": self.company,
				}))

		return gl_map


# ── Whitelisted helpers for the form JS ────────────────────────────────────────

@frappe.whitelist()
def get_mop_account_currency(company, mode_of_payment):
	"""Return the account_currency of the default account for a Mode of Payment + company."""
	if not company or not mode_of_payment:
		return None
	account = frappe.db.get_value(
		"Mode of Payment Account",
		{"parent": mode_of_payment, "company": company},
		"default_account",
	)
	if not account:
		return None
	account_currency = frappe.get_cached_value("Account", account, "account_currency")
	if not account_currency and company:
		account_currency = frappe.get_cached_value("Company", company, "default_currency")
	return account_currency


@frappe.whitelist()
def get_exchange_rate(from_currency, to_currency=None, transaction_date=None, company=None):
	"""Fetch latest exchange rate bidirectionally from Currency Exchange doctype."""
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
		from managely_terminal.managely_terminal.accounting.customizations import get_company_dual_rate
		rate = get_company_dual_rate(company, transaction_date)
		if rate and flt(rate) > 0:
			return flt(rate)

	return None


@frappe.whitelist()
def get_reference_details(reference_doctype, reference_name):
	"""Return grand_total, outstanding_amount, due_date and bill_no for a
	Sales Invoice or Purchase Invoice so the JS can fill the Payment References row."""
	if not reference_doctype or not reference_name:
		return {}

	if reference_doctype == "Sales Invoice":
		doc = frappe.db.get_value(
			"Sales Invoice",
			reference_name,
			["grand_total", "outstanding_amount", "due_date"],
			as_dict=True,
		)
		if not doc:
			return {}
		return {
			"total_amount": flt(doc.grand_total),
			"outstanding_amount": flt(doc.outstanding_amount),
			"due_date": doc.due_date,
			"bill_no": None,
		}

	if reference_doctype == "Purchase Invoice":
		doc = frappe.db.get_value(
			"Purchase Invoice",
			reference_name,
			["grand_total", "outstanding_amount", "due_date", "bill_no"],
			as_dict=True,
		)
		if not doc:
			return {}
		return {
			"total_amount": flt(doc.grand_total),
			"outstanding_amount": flt(doc.outstanding_amount),
			"due_date": doc.due_date,
			"bill_no": doc.bill_no or None,
		}

	return {}


@frappe.whitelist()
def get_default_party_account(company, party_type, party):
	"""Return default receivable/payable account for a party."""
	if not company or not party_type or not party:
		return None
	account = frappe.db.get_value(
		"Party Account",
		{"parenttype": party_type, "parent": party, "company": company},
		"account",
	)
	if account:
		return account
	if party_type == "Customer":
		return frappe.get_cached_value("Company", company, "default_receivable_account")
	if party_type == "Supplier":
		return frappe.get_cached_value("Company", company, "default_payable_account")
	return None


@frappe.whitelist()
def get_outstanding_invoices(company, party_type, party):
	"""Return a list of outstanding invoices (Sales or Purchase) for the given party ordered by due date."""
	if not company or not party_type or not party:
		return []

	invoices = []
	if party_type == "Customer":
		# Fetch Sales Invoices ordered by due date (FIFO)
		sales_invoices = frappe.db.get_all(
			"Sales Invoice",
			filters={
				"docstatus": 1,
				"company": company,
				"customer": party,
				"outstanding_amount": [">", 0]
			},
			fields=["name", "outstanding_amount", "grand_total as total_amount", "due_date", "posting_date"],
			order_by="due_date asc, posting_date asc, name asc"
		)
		for si in sales_invoices:
			invoices.append({
				"reference_doctype": "Sales Invoice",
				"reference_name": si.name,
				"outstanding_amount": flt(si.outstanding_amount),
				"total_amount": flt(si.total_amount),
				"due_date": si.due_date,
				"bill_no": None
			})

	elif party_type == "Supplier":
		# Fetch Purchase Invoices ordered by due date (FIFO)
		purchase_invoices = frappe.db.get_all(
			"Purchase Invoice",
			filters={
				"docstatus": 1,
				"company": company,
				"supplier": party,
				"outstanding_amount": [">", 0]
			},
			fields=["name", "outstanding_amount", "grand_total as total_amount", "due_date", "posting_date", "bill_no"],
			order_by="due_date asc, posting_date asc, name asc"
		)
		for pi in purchase_invoices:
			invoices.append({
				"reference_doctype": "Purchase Invoice",
				"reference_name": pi.name,
				"outstanding_amount": flt(pi.outstanding_amount),
				"total_amount": flt(pi.total_amount),
				"due_date": pi.due_date,
				"bill_no": pi.bill_no
			})

	return invoices
