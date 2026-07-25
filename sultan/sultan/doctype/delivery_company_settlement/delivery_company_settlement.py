import frappe
from frappe.model.document import Document
from frappe.utils import flt

class DeliveryCompanySettlement(Document):
	def validate(self):
		self.calculate_totals()

	def calculate_totals(self):
		total_out = 0.0
		total_del = 0.0
		count = 0
		for item in self.get("invoices", []):
			count += 1
			amt = flt(item.total_amount)
			total_out += amt
			total_del += flt(item.delivery_fee)
		self.invoice_count = count
		self.total_amount = total_out
		self.delivery_amount = total_del
		self.net_amount = total_out - total_del

		if self.settled_delivery_fee is None or self.settled_delivery_fee == 0:
			self.settled_delivery_fee = total_del
		if self.received_amount is None or self.received_amount == 0:
			self.received_amount = self.net_amount

	def on_submit(self):
		self.settle_invoices()
		self.create_journal_entry()

	def settle_invoices(self):
		for item in self.get("invoices", []):
			inv_name = item.invoice_id
			if not inv_name:
				continue

			if frappe.db.exists("POS Invoice", inv_name):
				frappe.db.set_value("POS Invoice", inv_name, {
					"custom_delivery_status": "Delivered",
					"custom_driver_settled": 1
				}, update_modified=False)
			elif frappe.db.exists("Sales Invoice", inv_name):
				frappe.db.set_value("Sales Invoice", inv_name, {
					"custom_delivery_status": "Delivered",
					"custom_driver_settled": 1
				})

	def create_journal_entry(self):
		if not self.total_amount or flt(self.total_amount) <= 0:
			return

		company = frappe.db.get_value("Account", self.receivable_account, "company") or frappe.defaults.get_user_default("company") or "Sultan Global"
		
		# Resolve Payment Account
		payment_account = None
		if self.mode_of_payment:
			payment_account = frappe.db.get_value("Mode of Payment Account", {"parent": self.mode_of_payment, "company": company}, "default_account")
		
		if not payment_account:
			payment_account = frappe.db.get_value("Company", company, "default_bank_account") or frappe.db.get_value("Company", company, "default_cash_account")

		# Resolve Delivery Fee Account
		delivery_charge_account = "626100020 - Delivery Charge - SG"
		if not frappe.db.exists("Account", delivery_charge_account):
			delivery_charge_account = frappe.db.get_value("Company", company, "default_income_account")

		je = frappe.new_doc("Journal Entry")
		je.voucher_type = "Journal Entry"
		je.company = company
		je.posting_date = frappe.utils.nowdate()
		je.user_remark = f"Delivery Company Settlement for {self.delivery_company} ({self.name})"

		accounts = []

		# 1. Credit Delivery Company Receivable Account (Clear Receivable)
		if self.receivable_account:
			accounts.append({
				"account": self.receivable_account,
				"credit_in_account_currency": flt(self.total_amount),
				"reference_type": "Delivery Company Settlement",
				"reference_name": self.name
			})

		# 2. Debit Received Amount to Payment Mode Account (Bank/Cash)
		if flt(self.received_amount) > 0 and payment_account:
			accounts.append({
				"account": payment_account,
				"debit_in_account_currency": flt(self.received_amount)
			})

		# 3. Debit Delivery Charge Amount to Delivery Fee Account
		if flt(self.settled_delivery_fee) > 0 and delivery_charge_account:
			accounts.append({
				"account": delivery_charge_account,
				"debit_in_account_currency": flt(self.settled_delivery_fee)
			})

		# 4. Handle rounding / discrepancy if any
		total_debit = sum(a.get("debit_in_account_currency", 0) for a in accounts)
		total_credit = sum(a.get("credit_in_account_currency", 0) for a in accounts)
		diff = round(total_credit - total_debit, 2)

		if diff != 0:
			roundoff_acc = frappe.db.get_value("Company", company, "round_off_account")
			if roundoff_acc:
				if diff > 0:
					accounts.append({"account": roundoff_acc, "debit_in_account_currency": diff})
				else:
					accounts.append({"account": roundoff_acc, "credit_in_account_currency": abs(diff)})

		if len(accounts) >= 2:
			je.set("accounts", accounts)
			je.insert(ignore_permissions=True)
			je.submit()
			frappe.logger().info(f"Created Journal Entry {je.name} for Delivery Company Settlement {self.name}")

@frappe.whitelist()
def get_outstanding_invoices(delivery_company=None):
	"""Fetch outstanding delivery invoices for a Delivery Company."""
	invoices = []
	if not delivery_company:
		return []

	filters = {
		"custom_delivery_company": delivery_company,
		"custom_driver_settled": ["!=", 1],
		"docstatus": ["<", 2]
	}
	raw_invoices = frappe.get_all(
		"POS Invoice",
		filters=filters,
		fields=["name", "customer", "custom_pos_customer", "grand_total", "rounded_total", "custom_delivery_fee", "posting_date"]
	)
	for inv in raw_invoices:
		cust_link = inv.custom_pos_customer or inv.customer
		amt = flt(inv.rounded_total) or flt(inv.grand_total)
		invoices.append({
			"invoice_id": inv.name,
			"customer": cust_link,
			"posting_date": str(inv.posting_date) if inv.posting_date else None,
			"total_amount": amt,
			"delivery_fee": flt(inv.custom_delivery_fee)
		})

	return invoices
