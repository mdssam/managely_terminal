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

		if self.get("settled_delivery_fee") is None or self.get("settled_delivery_fee") == 0:
			self.settled_delivery_fee = total_del
		if self.get("received_amount") is None or self.get("received_amount") == 0:
			self.received_amount = self.net_amount

	def on_submit(self):
		self.settle_invoices()
		self.make_gl_entries()

	def on_cancel(self):
		# Reset settled status of invoices
		for item in self.get("invoices", []):
			inv_name = item.invoice_id
			if not inv_name:
				continue
			if frappe.db.exists("POS Invoice", inv_name):
				frappe.db.set_value("POS Invoice", inv_name, {
					"custom_delivery_status": "Out for Delivery",
					"custom_driver_settled": 0
				}, update_modified=False)
			elif frappe.db.exists("Sales Invoice", inv_name):
				frappe.db.set_value("Sales Invoice", inv_name, {
					"custom_delivery_status": "Out for Delivery",
					"custom_driver_settled": 0
				})
		self.make_gl_entries(cancel=True)

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

	def make_gl_entries(self, cancel=False):
		from erpnext.accounts.general_ledger import make_gl_entries

		if cancel:
			# If cancelling, fetch existing GL entries for this document and reverse them
			self.ignore_linked_doctypes = ["GL Entry"]
			gl_entries = frappe.get_all(
				"GL Entry",
				fields=["*"],
				filters={"voucher_type": self.doctype, "voucher_no": self.name},
			)
			if gl_entries:
				make_gl_entries(gl_map=gl_entries, cancel=1)
			return

		total_amt = flt(self.get("total_amount"))
		if not total_amt or total_amt <= 0:
			return

		company = self.get("company") or frappe.defaults.get_user_default("company") or "Sultan Global"
		posting_date = self.get("posting_date") or frappe.utils.nowdate()
		delivery_company = self.get("delivery_company")
		mode_of_payment = self.get("mode_of_payment")
		received_amount = flt(self.get("received_amount"))
		settled_delivery_fee = flt(self.get("settled_delivery_fee"))
		cost_center = (
			self.get("cost_center")
			or frappe.db.get_value("Company", company, "cost_center")
			or frappe.db.get_value("Cost Center", {"company": company, "is_group": 0}, "name")
			or frappe.db.get_value("Cost Center", {"is_group": 0}, "name")
		)
		remarks = self.get("remarks") or f"Delivery Company Settlement for {delivery_company} ({self.name})"

		# Resolve Delivery Company's Receivable Account from its Mode of Payment
		receivable_account = None
		if delivery_company:
			dc_mop = frappe.db.get_value("Delivery Company", delivery_company, "mode_of_payment")
			if dc_mop:
				receivable_account = frappe.db.get_value("Mode of Payment Account", {"parent": dc_mop, "company": company}, "default_account")

		# Resolve Payment Account
		payment_account = None
		if mode_of_payment:
			payment_account = frappe.db.get_value("Mode of Payment Account", {"parent": mode_of_payment, "company": company}, "default_account")
		
		if not payment_account:
			payment_account = frappe.db.get_value("Company", company, "default_bank_account") or frappe.db.get_value("Company", company, "default_cash_account")

		# Resolve Delivery Fee Account
		delivery_charge_account = "626100020 - Delivery Charge - SG"
		if not frappe.db.exists("Account", delivery_charge_account):
			delivery_charge_account = frappe.db.get_value("Company", company, "default_income_account")

		gl_map = []

		def get_gl_dict(account, debit=0, credit=0):
			return frappe._dict({
				"company": company,
				"posting_date": posting_date,
				"voucher_type": self.doctype,
				"voucher_no": self.name,
				"remarks": remarks,
				"account": account,
				"debit": flt(debit),
				"credit": flt(credit),
				"debit_in_account_currency": flt(debit),
				"credit_in_account_currency": flt(credit),
				"cost_center": cost_center,
			})

		# 1. Credit Delivery Company Receivable Account (Clear Receivable)
		if receivable_account:
			against_accounts = []
			if received_amount > 0 and payment_account:
				against_accounts.append(payment_account)
			if settled_delivery_fee > 0 and delivery_charge_account:
				against_accounts.append(delivery_charge_account)
			against_str = ", ".join(against_accounts)

			gl_map.append(get_gl_dict(
				account=receivable_account,
				credit=total_amt
			))
			gl_map[-1]["against"] = against_str

		# 2. Debit Received Amount to Payment Mode Account (Bank/Cash)
		if received_amount > 0 and payment_account:
			gl_map.append(get_gl_dict(
				account=payment_account,
				debit=received_amount
			))
			gl_map[-1]["against"] = receivable_account or ""

		# 3. Debit Delivery Charge Amount to Delivery Fee Account
		if settled_delivery_fee > 0 and delivery_charge_account:
			gl_map.append(get_gl_dict(
				account=delivery_charge_account,
				debit=settled_delivery_fee
			))
			gl_map[-1]["against"] = receivable_account or ""

		# 4. Handle rounding / discrepancy if any
		total_debit = sum(a.get("debit", 0) for a in gl_map)
		total_credit = sum(a.get("credit", 0) for a in gl_map)
		diff = round(total_credit - total_debit, 2)

		if diff != 0:
			roundoff_acc = frappe.db.get_value("Company", company, "round_off_account")
			if roundoff_acc:
				if diff > 0:
					gl_map.append(get_gl_dict(account=roundoff_acc, debit=diff))
				else:
					gl_map.append(get_gl_dict(account=roundoff_acc, credit=abs(diff)))
				gl_map[-1]["against"] = receivable_account or ""

		if len(gl_map) >= 2:
			# Post GL entries
			make_gl_entries(gl_map, cancel=cancel)
			frappe.logger().info(f"Posted GL Entries directly for Delivery Company Settlement {self.name}")

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
