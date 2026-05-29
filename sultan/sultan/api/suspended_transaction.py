import frappe
from frappe.utils import now_datetime, today, flt

from sultan.sultan.utils import get_current_pos_profile
from sultan.sultan.api.sales_invoice import get_current_pos_opening_entry


# ── GL helpers ────────────────────────────────────────────────────────────────

def _get_pos_cash_account(pos_profile_name, company):
    """Return the default cash account for the POS profile's Cash mode of payment."""
    mop = frappe.db.get_value(
        "POS Payment Method",
        {"parent": pos_profile_name, "default": 1},
        "mode_of_payment",
    ) or "Cash"
    return frappe.db.get_value(
        "Mode of Payment Account",
        {"parent": mop, "company": company},
        "default_account",
    )


def _get_profile_gl_config(pos_profile_name):
    """Return GL config (company, write_off_account, cost_center, currency) from POS Profile."""
    return frappe.db.get_value(
        "POS Profile",
        pos_profile_name,
        ["company", "write_off_account", "cost_center", "currency"],
        as_dict=True,
    ) or {}


def _make_journal_entry(amount, debit_account, credit_account, company,
                        cost_center, posting_date, remark):
    """Create and submit a Journal Entry; return its name."""
    je = frappe.new_doc("Journal Entry")
    je.voucher_type = "Cash Entry"
    je.posting_date = posting_date
    je.company = company
    je.user_remark = remark
    je.append("accounts", {
        "account": debit_account,
        "debit_in_account_currency": amount,
        "credit_in_account_currency": 0,
        "cost_center": cost_center,
    })
    je.append("accounts", {
        "account": credit_account,
        "debit_in_account_currency": 0,
        "credit_in_account_currency": amount,
        "cost_center": cost_center,
    })
    je.insert(ignore_permissions=True)
    je.submit()
    return je.name


# ── Core internal function ─────────────────────────────────────────────────────

def create_suspended_transaction(
    transaction_type,
    amount,
    pos_opening_entry,
    pos_profile_name,
    company,
    description="",
    pos_closing_entry=None,
    posting_date=None,
):
    """Create a POS Suspended Transaction and a matching GL Journal Entry.

    Debit/Credit sides:
      Cash In / Opening Difference  → Debit POS Cash, Credit write_off_account
      Cash Out / Closing Difference → Debit write_off_account, Credit POS Cash
    """
    posting_date = posting_date or today()

    cfg = _get_profile_gl_config(pos_profile_name)
    write_off_account = cfg.get("write_off_account")
    cost_center = cfg.get("cost_center")
    currency = cfg.get("currency") or frappe.defaults.get_global_default("currency")
    pos_cash_account = _get_pos_cash_account(pos_profile_name, company)

    if transaction_type in ("Cash In", "Opening Difference"):
        debit_account = pos_cash_account
        credit_account = write_off_account
    else:
        debit_account = write_off_account
        credit_account = pos_cash_account

    frappe.flags.in_pos_transaction = True
    try:
        doc = frappe.new_doc("POS Suspended Transaction")
        doc.transaction_type = transaction_type
        doc.amount = flt(amount)
        doc.currency = currency
        doc.description = description or transaction_type
        doc.pos_opening_entry = pos_opening_entry
        doc.pos_profile = pos_profile_name
        doc.pos_closing_entry = pos_closing_entry
        doc.company = company
        doc.posting_date = posting_date
        doc.posting_time = now_datetime().strftime("%H:%M:%S")
        doc.cost_center = cost_center
        doc.insert(ignore_permissions=True)
        doc.submit()

        if debit_account and credit_account:
            je_name = _make_journal_entry(
                flt(amount), debit_account, credit_account,
                company, cost_center, posting_date,
                description or transaction_type,
            )
            frappe.db.set_value(
                "POS Suspended Transaction", doc.name,
                "linked_journal_entry", je_name,
            )
    finally:
        frappe.flags.in_pos_transaction = False

    return doc.name


# ── Lifecycle hooks ───────────────────────────────────────────────────────────

def check_desk_manipulation(doc, method):
    """Block direct desk creation/deletion of POS Suspended Transactions."""
    if not getattr(frappe.flags, "in_pos_transaction", False):
        frappe.throw(
            "POS Suspended Transactions cannot be created or deleted directly. "
            "Use the POS interface.",
            frappe.PermissionError,
        )


def check_opening_amount_difference(doc, method):
    """on_submit POS Opening Entry: detect cash mismatch vs last closing."""
    try:
        pos_profile = doc.pos_profile
        if not pos_profile:
            return

        last_closing = frappe.db.sql(
            """
            SELECT name, period_end_date
            FROM `tabPOS Closing Entry`
            WHERE pos_profile = %s AND docstatus = 1
            ORDER BY period_end_date DESC
            LIMIT 1
            """,
            pos_profile,
            as_dict=True,
        )
        if not last_closing:
            return

        cash_closing = flt(frappe.db.get_value(
            "POS Closing Entry Detail",
            {"parent": last_closing[0].name, "mode_of_payment": "Cash"},
            "closing_amount",
        ))

        cash_opening = 0.0
        for row in doc.balance_details or []:
            if (row.mode_of_payment or "").lower() == "cash":
                cash_opening = flt(row.opening_amount)
                break

        difference = cash_opening - cash_closing
        if abs(difference) < 0.001:
            return

        create_suspended_transaction(
            transaction_type="Opening Difference",
            amount=abs(difference),
            pos_opening_entry=doc.name,
            pos_profile_name=pos_profile,
            company=doc.company,
            description=(
                f"Opening difference: {'surplus' if difference > 0 else 'deficit'} "
                f"of {abs(difference):.2f} vs last closing"
            ),
            posting_date=doc.period_start_date or today(),
        )
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Opening Amount Difference Error")


def update_closing_entry_expected_amounts(doc, method):
    """before_validate POS Closing Entry: add net Cash I/O to expected amounts."""
    try:
        opening_entry = getattr(doc, "pos_opening_entry", None)
        if not opening_entry:
            return

        suspended = frappe.get_all(
            "POS Suspended Transaction",
            filters={
                "pos_opening_entry": opening_entry,
                "docstatus": 1,
                "transaction_type": ["in", ["Cash In", "Cash Out"]],
            },
            fields=[
                "name", "transaction_type", "amount",
                "description", "posting_date", "posting_time", "currency",
            ],
        )

        net_suspended = sum(
            flt(t.amount) * (1 if t.transaction_type == "Cash In" else -1)
            for t in suspended
        )

        for row in doc.payment_reconciliation or []:
            if (row.mode_of_payment or "").lower() == "cash":
                row.expected_amount = flt(row.expected_amount) + net_suspended
                row.difference = flt(row.closing_amount) - flt(row.expected_amount)

        doc.set("custom_pos_suspended_transactions", [])
        for t in suspended:
            doc.append("custom_pos_suspended_transactions", {
                "suspended_transaction": t.name,
                "transaction_type": t.transaction_type,
                "amount": t.amount,
                "currency": t.currency,
                "description": t.description,
                "posting_date": t.posting_date,
                "posting_time": t.posting_time,
            })
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Update Closing Expected Amounts Error")


def create_transaction_from_closing_entry(doc, method):
    """on_submit POS Closing Entry: create Closing Difference if cash is mismatched."""
    try:
        for row in doc.payment_reconciliation or []:
            difference = flt(row.difference)
            if abs(difference) < 0.001:
                continue
            create_suspended_transaction(
                transaction_type="Closing Difference",
                amount=abs(difference),
                pos_opening_entry=doc.pos_opening_entry,
                pos_profile_name=doc.pos_profile,
                company=doc.company,
                pos_closing_entry=doc.name,
                description=(
                    f"Closing difference for {row.mode_of_payment}: "
                    f"{'surplus' if difference > 0 else 'deficit'} of {abs(difference):.2f}"
                ),
                posting_date=doc.period_end_date or today(),
            )
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Create Transaction From Closing Error")


def cancel_transaction_from_closing_entry(doc, method):
    """on_cancel POS Closing Entry: cancel linked Closing Difference transactions."""
    try:
        linked = frappe.get_all(
            "POS Suspended Transaction",
            filters={
                "pos_closing_entry": doc.name,
                "transaction_type": "Closing Difference",
                "docstatus": 1,
            },
            pluck="name",
        )
        for name in linked:
            txn = frappe.get_doc("POS Suspended Transaction", name)
            txn.cancel()
            if txn.linked_journal_entry:
                try:
                    je = frappe.get_doc("Journal Entry", txn.linked_journal_entry)
                    if je.docstatus == 1:
                        je.cancel()
                except Exception:
                    frappe.log_error(frappe.get_traceback(), f"Cancel JE {txn.linked_journal_entry}")
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Cancel Transaction From Closing Error")


# ── Whitelisted POS front-end endpoints ──────────────────────────────────────

@frappe.whitelist()
def create_cash_transaction_from_pos(transaction_type, amount, description=""):
    """POS front-end: create a Cash In or Cash Out for the active session."""
    try:
        amount = flt(amount)
        if amount <= 0:
            return {"success": False, "error": "Amount must be greater than zero."}
        if transaction_type not in ("Cash In", "Cash Out"):
            return {"success": False, "error": "Invalid transaction type."}

        opening_entry = get_current_pos_opening_entry()
        if not opening_entry:
            return {"success": False, "error": "No open POS session found."}

        pos_profile = get_current_pos_profile()
        pos_profile_name = pos_profile.name if hasattr(pos_profile, "name") else str(pos_profile)
        company = (
            pos_profile.company
            if hasattr(pos_profile, "company")
            else frappe.db.get_value("POS Profile", pos_profile_name, "company")
        )

        name = create_suspended_transaction(
            transaction_type=transaction_type,
            amount=amount,
            pos_opening_entry=opening_entry,
            pos_profile_name=pos_profile_name,
            company=company,
            description=description,
        )
        return {"success": True, "name": name, "message": f"{transaction_type} of {amount} recorded."}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Create Cash Transaction From POS Error")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_suspended_transactions(opening_entry=None):
    """Return submitted Cash In/Out records for the given (or active) session."""
    try:
        if not opening_entry:
            opening_entry = get_current_pos_opening_entry()
        if not opening_entry:
            return {
                "success": True, "data": [],
                "summary": {"cash_in": 0, "cash_out": 0, "net": 0},
            }

        transactions = frappe.get_all(
            "POS Suspended Transaction",
            filters={
                "pos_opening_entry": opening_entry,
                "docstatus": 1,
                "transaction_type": ["in", ["Cash In", "Cash Out"]],
            },
            fields=[
                "name", "transaction_type", "amount", "description",
                "posting_date", "posting_time", "linked_journal_entry",
            ],
            order_by="posting_date asc, posting_time asc",
        )

        cash_in = sum(flt(t.amount) for t in transactions if t.transaction_type == "Cash In")
        cash_out = sum(flt(t.amount) for t in transactions if t.transaction_type == "Cash Out")

        return {
            "success": True,
            "data": [dict(t) for t in transactions],
            "summary": {"cash_in": cash_in, "cash_out": cash_out, "net": cash_in - cash_out},
        }
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Get Suspended Transactions Error")
        return {"success": False, "error": str(e)}
