import frappe
from frappe.utils import now_datetime, today

from sultan.sultan.utils import get_current_pos_profile
from sultan.sultan.api.sales_invoice import get_current_pos_opening_entry


# ── Public API ────────────────────────────────────────────────────────────────

@frappe.whitelist()
def create_cash_transaction(transaction_type, amount, description="", override_account=None):
	"""Record a Cash In or Cash Out for the active POS session.

	Cash In  → Debit = POS cash account (locked), Credit = bucket account (editable later)
	Cash Out → Debit = bucket account (editable later), Credit = POS cash account (locked)
	"""
	try:
		amount = float(amount)
		if amount <= 0:
			return {"success": False, "error": "Amount must be greater than zero."}

		opening_entry = get_current_pos_opening_entry()
		if not opening_entry:
			return {"success": False, "error": "No open POS session found."}

		pos_profile = get_current_pos_profile()
		now = now_datetime()

		pos_cash_account = _get_pos_cash_account(pos_profile)
		bucket_account = (
			override_account
			or frappe.db.get_value("POS Profile", pos_profile.name, "custom_cash_io_bucket_account")
			or _get_fallback_bucket_account(pos_profile.company)
		)

		if transaction_type == "Cash In":
			account_debit = pos_cash_account   # locked
			account_credit = bucket_account    # editable by accountant
		else:
			account_debit = bucket_account     # editable by accountant
			account_credit = pos_cash_account  # locked

		doc = frappe.new_doc("Sultan POS Cash Transaction")
		doc.transaction_type = transaction_type
		doc.amount = amount
		doc.description = description or ""
		doc.pos_opening_entry = opening_entry
		doc.pos_profile = pos_profile.name
		doc.posting_date = today()
		doc.posting_time = now.strftime("%H:%M:%S")
		doc.account_debit = account_debit
		doc.account_credit = account_credit
		doc.currency = pos_profile.currency or frappe.defaults.get_global_default("currency")
		doc.insert(ignore_permissions=True)
		doc.submit()

		return {
			"success": True,
			"name": doc.name,
			"message": f"{transaction_type} of {amount} recorded.",
		}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Create Cash Transaction Error")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_cash_transactions(opening_entry=None):
	"""Return all submitted Cash In/Out records for the given (or active) session."""
	try:
		if not opening_entry:
			opening_entry = get_current_pos_opening_entry()
		if not opening_entry:
			return {"success": True, "data": [], "summary": {"cash_in": 0, "cash_out": 0, "net": 0}}

		transactions = frappe.get_all(
			"Sultan POS Cash Transaction",
			filters={"pos_opening_entry": opening_entry, "docstatus": 1},
			fields=[
				"name", "transaction_type", "amount", "description",
				"posting_date", "posting_time", "account_debit", "account_credit",
				"linked_journal_entry",
			],
			order_by="posting_date asc, posting_time asc",
		)

		cash_in = sum(t.amount for t in transactions if t.transaction_type == "Cash In")
		cash_out = sum(t.amount for t in transactions if t.transaction_type == "Cash Out")

		return {
			"success": True,
			"data": transactions,
			"summary": {"cash_in": cash_in, "cash_out": cash_out, "net": cash_in - cash_out},
		}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Get Cash Transactions Error")
		return {"success": False, "error": str(e)}


# ── GL entry creation (called by pos_entry.create_closing_entry) ──────────────

def create_gl_entries_for_session(opening_entry, company):
	"""Create a Journal Entry for every unprocessed Cash In/Out in a closing session."""
	unprocessed = frappe.get_all(
		"Sultan POS Cash Transaction",
		filters={
			"pos_opening_entry": opening_entry,
			"docstatus": 1,
			"linked_journal_entry": ["is", "not set"],
		},
		fields=[
			"name", "transaction_type", "amount", "description",
			"account_debit", "account_credit", "currency", "posting_date",
		],
	)

	for txn in unprocessed:
		if not txn.account_debit or not txn.account_credit:
			continue
		try:
			je = frappe.new_doc("Journal Entry")
			je.voucher_type = "Cash Entry"
			je.posting_date = txn.posting_date
			je.company = company
			je.user_remark = txn.description or txn.transaction_type
			je.append("accounts", {
				"account": txn.account_debit,
				"debit_in_account_currency": txn.amount,
				"credit_in_account_currency": 0,
			})
			je.append("accounts", {
				"account": txn.account_credit,
				"debit_in_account_currency": 0,
				"credit_in_account_currency": txn.amount,
			})
			je.insert(ignore_permissions=True)
			je.submit()
			frappe.db.set_value("Sultan POS Cash Transaction", txn.name, "linked_journal_entry", je.name)
		except Exception:
			frappe.log_error(frappe.get_traceback(), f"GL Entry Error for cash transaction {txn.name}")


# ── Internal helpers ──────────────────────────────────────────────────────────

def _get_pos_cash_account(pos_profile):
	"""Return the default_account of the POS profile's default Cash mode of payment."""
	try:
		default_mop = frappe.db.get_value(
			"POS Payment Method",
			{"parent": pos_profile.name, "default": 1},
			"mode_of_payment",
		) or "Cash"
		return frappe.db.get_value(
			"Mode of Payment Account",
			{"parent": default_mop, "company": pos_profile.company},
			"default_account",
		)
	except Exception:
		return None


def _get_fallback_bucket_account(company):
	"""Last-resort bucket account: first Temporary account for the company."""
	return frappe.db.get_value(
		"Account",
		{"account_type": "Temporary", "company": company, "is_group": 0},
		"name",
	)
