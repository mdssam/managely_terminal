import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt
from erpnext.accounts.general_ledger import make_gl_entries


class POSSuspendedTransaction(Document):
    def before_insert(self):
        if not self.flags.from_pos_api and not self.flags.ignore_permissions:
            frappe.throw(_(
                "POS Suspended Transactions cannot be created directly. "
                "Use the POS interface."
            ))

    def validate(self):
        self.validate_session()
        self.set_pos_cash_account()
        self.calculate_amounts()
        self.validate_total_amount()

    def validate_session(self):
        if not self.pos_session:
            frappe.throw(_("POS Session is required."))
        session = frappe.get_doc("POS Opening Entry", self.pos_session)
        if session.docstatus != 1:
            frappe.throw(_("POS Session {0} must be Submitted/Open.").format(self.pos_session))
        if not self.company:
            self.company = session.company
        elif self.company != session.company:
            frappe.throw(_(
                "The selected Company does not match the POS Session's company ({0})."
            ).format(session.company))
        self.pos_profile = session.pos_profile

    def set_pos_cash_account(self):
        if not self.mode_of_payment:
            frappe.throw(_("Mode of Payment is required."))

        pos_profile_name = frappe.db.get_value("POS Opening Entry", self.pos_session, "pos_profile")
        if not pos_profile_name:
            frappe.throw(_("Could not find POS Profile for session {0}.").format(self.pos_session))

        allowed = frappe.db.get_value(
            "POS Payment Method",
            {"parent": pos_profile_name, "mode_of_payment": self.mode_of_payment},
            "allowed_for_cash_in_out",
        )
        if allowed is None:
            frappe.throw(_("Mode of Payment {0} is not configured in POS Profile {1}.").format(
                self.mode_of_payment, pos_profile_name
            ))
        if not flt(allowed):
            frappe.throw(_(
                "Mode of Payment {0} is not allowed for Cash In/Out in POS Profile {1}."
            ).format(self.mode_of_payment, pos_profile_name))

        pos_cash_account = frappe.db.get_value(
            "Mode of Payment Account",
            {"parent": self.mode_of_payment, "company": self.company},
            "default_account",
        )
        if not pos_cash_account:
            frappe.throw(_("No default Account for Mode of Payment {0} in Company {1}.").format(
                self.mode_of_payment, self.company
            ))
        self.pos_cash_account = pos_cash_account

    def calculate_amounts(self):
        is_cash_in = flt(self.total_amount) >= 0.0 or flt(self.debit) > 0.0
        if flt(self.total_amount) < 0.0 or flt(self.credit) > 0.0:
            is_cash_in = False

        total_sum = 0.0
        company_currency = frappe.get_cached_value("Company", self.company, "default_currency")
        for row in self.accounts:
            if not row.account:
                frappe.throw(_("Please select an Account in row {0}.").format(row.idx))
            row.amount_in_account_currency = abs(flt(row.amount_in_account_currency))
            if not row.account_currency:
                row.account_currency = (
                    frappe.db.get_value("Account", row.account, "account_currency")
                    or company_currency
                )
            if not row.exchange_rate or row.exchange_rate <= 0:
                row.exchange_rate = 1.0 if row.account_currency == company_currency else 0.0
            row.amount = flt(row.amount_in_account_currency) * flt(row.exchange_rate)
            total_sum += row.amount

        self.total_amount = total_sum if is_cash_in else -total_sum
        if is_cash_in:
            self.debit = total_sum
            self.credit = 0.0
        else:
            self.credit = total_sum
            self.debit = 0.0

    def validate_total_amount(self):
        total_sum = sum(abs(flt(row.amount)) for row in self.accounts)
        if abs(abs(flt(self.total_amount)) - total_sum) > 0.01:
            frappe.throw(_("Total Amount ({0}) must equal the sum of accounts ({1}).").format(
                self.total_amount, total_sum
            ))

    def on_update(self):
        self.make_gl_entries()

    def on_trash(self):
        if not self.flags.ignore_permissions:
            frappe.throw(_("POS Suspended Transactions cannot be deleted directly."))
        self.delete_gl_entries()

    def make_gl_entries(self):
        self.delete_gl_entries()
        if not self.accounts:
            return

        pos_profile = frappe.db.get_value("POS Opening Entry", self.pos_session, "pos_profile")
        cost_center = None
        if pos_profile:
            cost_center = frappe.db.get_value("POS Profile", pos_profile, "cost_center")
        if not cost_center:
            cost_center = frappe.get_cached_value("Company", self.company, "cost_center")

        posting_date = frappe.utils.getdate(self.posting_date_time)
        company_currency = frappe.get_cached_value("Company", self.company, "default_currency")
        is_cash_in = flt(self.total_amount) >= 0.0 or flt(self.debit) > 0.0

        gl_entries = []
        for row in self.accounts:
            if flt(row.amount) == 0.0:
                continue
            gl_entries.append(frappe._dict({
                "doctype": "GL Entry",
                "company": self.company,
                "account": self.pos_cash_account,
                "posting_date": posting_date,
                "transaction_date": posting_date,
                "voucher_type": self.doctype,
                "voucher_no": self.name,
                "against": row.account,
                "remarks": self.description or _("POS Cash Transaction"),
                "debit": abs(flt(row.amount)) if is_cash_in else 0.0,
                "credit": 0.0 if is_cash_in else abs(flt(row.amount)),
                "debit_in_account_currency": abs(flt(row.amount)) if is_cash_in else 0.0,
                "credit_in_account_currency": 0.0 if is_cash_in else abs(flt(row.amount)),
                "account_currency": company_currency,
                "exchange_rate": 1.0,
                "cost_center": cost_center,
                "is_opening": "No",
            }))
            gl_entries.append(frappe._dict({
                "doctype": "GL Entry",
                "company": self.company,
                "account": row.account,
                "posting_date": posting_date,
                "transaction_date": posting_date,
                "voucher_type": self.doctype,
                "voucher_no": self.name,
                "against": self.pos_cash_account,
                "remarks": row.reference or self.description or _("POS Cash Settlement"),
                "debit": abs(flt(row.amount)) if not is_cash_in else 0.0,
                "credit": 0.0 if not is_cash_in else abs(flt(row.amount)),
                "debit_in_account_currency": abs(flt(row.amount_in_account_currency)) if not is_cash_in else 0.0,
                "credit_in_account_currency": 0.0 if not is_cash_in else abs(flt(row.amount_in_account_currency)),
                "account_currency": row.account_currency,
                "exchange_rate": row.exchange_rate,
                "party_type": row.party_type,
                "party": row.party,
                "cost_center": cost_center,
                "is_opening": "No",
            }))

        make_gl_entries(gl_entries)

    def delete_gl_entries(self):
        frappe.db.delete("GL Entry", {
            "voucher_type": self.doctype,
            "voucher_no": self.name,
        })


# ── Whitelisted API endpoints ─────────────────────────────────────────────────

@frappe.whitelist()
def create_cash_transaction_from_pos(pos_session, amount, mode_of_payment,
                                      description, transaction_type, employee=None):
    if not pos_session:
        frappe.throw(_("POS Session is required."))

    company = frappe.db.get_value("POS Opening Entry", pos_session, "company")
    pos_profile = frappe.db.get_value("POS Opening Entry", pos_session, "pos_profile")

    amount_val = flt(amount) if transaction_type in ("Cash In", "Opening Difference") else -flt(amount)

    account = frappe.db.get_value("POS Profile", pos_profile, "write_off_account")
    if not account:
        account = frappe.get_cached_value("Company", company, "write_off_account")
    if not account:
        frappe.throw(_(
            "Please configure 'Write Off Account' in POS Profile {0} or Company {1}."
        ).format(pos_profile, company))

    doc = frappe.new_doc("POS Suspended Transaction")
    doc.pos_session = pos_session
    doc.company = company
    doc.mode_of_payment = mode_of_payment
    doc.posting_date_time = frappe.utils.now_datetime()
    doc.total_amount = amount_val
    doc.description = description
    doc.transaction_type = transaction_type
    doc.append("accounts", {
        "account": account,
        "amount_in_account_currency": abs(flt(amount_val)),
        "exchange_rate": 1.0,
    })
    doc.flags.from_pos_api = True
    doc.flags.ignore_permissions = True
    doc.insert(ignore_permissions=True)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return doc.name


# ── POS Opening/Closing Entry lifecycle hooks ─────────────────────────────────

def on_pos_opening_entry_submit(doc, method=None):
    """Check for difference between last closing and this opening amount."""
    last_closing = frappe.get_all(
        "POS Closing Entry",
        filters={"pos_profile": doc.pos_profile, "docstatus": 1, "company": doc.company},
        order_by="posting_date desc, posting_time desc",
        limit=1,
    )
    last_closing_cash = {}
    if last_closing:
        last_doc = frappe.get_doc("POS Closing Entry", last_closing[0].name)
        for row in last_doc.payment_reconciliation:
            track = frappe.db.get_value(
                "POS Payment Method",
                {"parent": doc.pos_profile, "mode_of_payment": row.mode_of_payment},
                "track_opening",
            )
            if track:
                last_closing_cash[row.mode_of_payment] = flt(row.closing_amount)

    for row in doc.balance_details:
        track = frappe.db.get_value(
            "POS Payment Method",
            {"parent": doc.pos_profile, "mode_of_payment": row.mode_of_payment},
            "track_opening",
        )
        if not track:
            continue
        last_amount = last_closing_cash.get(row.mode_of_payment, 0.0)
        difference = flt(row.opening_amount) - last_amount
        if difference == 0.0:
            continue
        desc = (
            _("Opening Difference (Gain)") if difference > 0.0
            else _("Opening Difference (Loss)")
        )
        create_cash_transaction_from_pos(
            pos_session=doc.name,
            amount=abs(difference),
            mode_of_payment=row.mode_of_payment,
            description=desc,
            transaction_type="Opening Difference",
        )


def before_validate_pos_closing_entry(doc, method=None):
    """Recalculate expected amounts including suspended transactions."""
    if not doc.pos_opening_entry:
        return

    txns = frappe.get_all(
        "POS Suspended Transaction",
        filters={"pos_session": doc.pos_opening_entry},
        fields=["name", "mode_of_payment", "total_amount", "description", "transaction_type"],
    )

    doc.set("custom_pos_suspended_transactions", [])
    txn_sums = {}
    for t in txns:
        mop = t.mode_of_payment
        if t.transaction_type in ("Cash In", "Cash Out"):
            txn_sums[mop] = txn_sums.get(mop, 0.0) + flt(t.total_amount)
        if t.transaction_type != "Closing Difference":
            if hasattr(doc, "custom_pos_suspended_transactions"):
                doc.append("custom_pos_suspended_transactions", {
                    "method": t.mode_of_payment,
                    "remarks": t.description,
                    "amount": flt(t.total_amount),
                })

    invoices = [t.pos_invoice for t in doc.pos_transactions]
    for row in doc.payment_reconciliation:
        mop = row.mode_of_payment
        invoices_sum = 0.0
        if invoices:
            payment_sum = frappe.db.get_value(
                "Sales Invoice Payment",
                {"parent": ["in", invoices], "mode_of_payment": mop},
                "sum(amount)",
            ) or 0.0
            is_cash = frappe.db.get_value("Mode of Payment", mop, "type") == "Cash"
            change_sum = 0.0
            if is_cash:
                change_sum = frappe.db.get_value(
                    "POS Invoice",
                    {"name": ["in", invoices], "account_for_change_amount": ["is", "set"]},
                    "sum(change_amount)",
                ) or 0.0
            invoices_sum = flt(payment_sum) - flt(change_sum)

        suspended_sum = flt(txn_sums.get(mop, 0.0))
        row.expected_amount = flt(row.opening_amount) + invoices_sum + suspended_sum
        row.difference = flt(row.closing_amount) - flt(row.expected_amount)

    frappe.db.set_value(
        "POS Suspended Transaction",
        {"pos_session": doc.pos_opening_entry},
        "pos_closing_entry",
        doc.name,
    )


def on_pos_closing_entry_submit(doc, method=None):
    """Create a Closing Difference transaction for any payment reconciliation differences."""
    for row in doc.payment_reconciliation:
        if flt(row.difference) == 0.0:
            continue
        track = frappe.db.get_value(
            "POS Payment Method",
            {"parent": doc.pos_profile, "mode_of_payment": row.mode_of_payment},
            "track_opening",
        )
        if not track:
            continue

        write_off_account = frappe.db.get_value("POS Profile", doc.pos_profile, "write_off_account")
        if not write_off_account:
            write_off_account = frappe.get_cached_value("Company", doc.company, "write_off_account")
        if not write_off_account:
            frappe.throw(_(
                "Please configure 'Write Off Account' in POS Profile {0} or Company {1}."
            ).format(doc.pos_profile, doc.company))

        txn = frappe.new_doc("POS Suspended Transaction")
        txn.pos_session = doc.pos_opening_entry
        txn.pos_closing_entry = doc.name
        txn.company = doc.company
        txn.mode_of_payment = row.mode_of_payment
        txn.posting_date_time = frappe.utils.now_datetime()
        txn.total_amount = flt(row.difference)
        txn.description = (
            _("Closing Difference (Gain)") if flt(row.difference) > 0.0
            else _("Closing Difference (Loss)")
        )
        txn.transaction_type = "Closing Difference"
        txn.append("accounts", {
            "account": write_off_account,
            "amount_in_account_currency": abs(flt(row.difference)),
            "exchange_rate": 1.0,
        })
        txn.flags.from_pos_api = True
        txn.flags.ignore_permissions = True
        txn.insert(ignore_permissions=True)
        frappe.db.commit()

    frappe.db.set_value(
        "POS Suspended Transaction",
        {"pos_session": doc.pos_opening_entry},
        "pos_closing_entry",
        doc.name,
    )


def on_pos_closing_entry_cancel(doc, method=None):
    txns = frappe.get_all(
        "POS Suspended Transaction",
        filters={"pos_session": doc.pos_opening_entry, "transaction_type": "Closing Difference"},
    )
    for t in txns:
        frappe.delete_doc("POS Suspended Transaction", t.name, ignore_permissions=True)
        frappe.db.commit()

    frappe.db.set_value(
        "POS Suspended Transaction",
        {"pos_session": doc.pos_opening_entry},
        "pos_closing_entry",
        None,
    )
