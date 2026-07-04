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

        # Check if the payment method is configured in the POS Profile
        exists = frappe.db.exists(
            "POS Payment Method",
            {"parent": pos_profile_name, "mode_of_payment": self.mode_of_payment}
        )
        if not exists:
            frappe.throw(_("Mode of Payment {0} is not configured in POS Profile {1}.").format(
                self.mode_of_payment, pos_profile_name
            ))

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
            
            if row.exchange_rate > 1.0:
                row.amount = flt(row.amount_in_account_currency) / flt(row.exchange_rate)
            else:
                row.amount = flt(row.amount_in_account_currency) * flt(row.exchange_rate)
            total_sum += row.amount

        self.total_amount = total_sum if is_cash_in else -total_sum
        if is_cash_in:
            self.debit = total_sum
            self.credit = 0.0
        else:
            self.credit = total_sum
            self.debit = 0.0

        # Calculate transaction currency amounts (original currency like LBP)
        rate_cash = flt(self.exchange_rate) or 1.0
        # If rate_cash is stored as e.g. 90000, we multiply total_sum (USD) by 90000 to get LBP amount.
        # If rate_cash is stored as e.g. 0.00001111 (less than 1.0), we divide total_sum by 0.00001111.
        if rate_cash > 1.0:
            total_sum_in_trans = total_sum * rate_cash
        else:
            total_sum_in_trans = total_sum / rate_cash if rate_cash else total_sum

        self.total_amount_in_transaction_currency = total_sum_in_trans if is_cash_in else -total_sum_in_trans
        if is_cash_in:
            self.debit_in_transaction_currency = total_sum_in_trans
            self.credit_in_transaction_currency = 0.0
        else:
            self.credit_in_transaction_currency = total_sum_in_trans
            self.debit_in_transaction_currency = 0.0

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
        parent_cost_center = self.get("cost_center")
        if not parent_cost_center:
            if pos_profile:
                parent_cost_center = frappe.db.get_value("POS Profile", pos_profile, "cost_center")
            if not parent_cost_center:
                parent_cost_center = frappe.get_cached_value("Company", self.company, "cost_center")
        parent_project = self.get("project")

        posting_date = frappe.utils.getdate(self.posting_date_time)
        company_currency = frappe.get_cached_value("Company", self.company, "default_currency")
        is_cash_in = flt(self.total_amount) >= 0.0 or flt(self.debit) > 0.0

        cash_currency = self.currency or frappe.db.get_value("Account", self.pos_cash_account, "account_currency") or company_currency
        rate_cash = flt(self.exchange_rate)
        if not rate_cash:
            from sultan.sultan.api.cash_transaction import get_exchange_rate_for_cash_io
            rate_cash = get_exchange_rate_for_cash_io(pos_profile, cash_currency, company_currency)

        gl_rate_cash = 1.0 / rate_cash if rate_cash > 1.0 else (rate_cash or 1.0)

        gl_entries = []
        for row in self.accounts:
            if flt(row.amount) == 0.0:
                continue
            
            cash_amount_in_ac = flt(row.amount) / gl_rate_cash if gl_rate_cash else flt(row.amount)
            gl_row_rate = 1.0 / row.exchange_rate if row.exchange_rate > 1.0 else (row.exchange_rate or 1.0)

            row_cost_center = row.get("cost_center") or parent_cost_center
            row_project = row.get("project") or parent_project

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
                 "debit_in_account_currency": abs(flt(cash_amount_in_ac)) if is_cash_in else 0.0,
                 "credit_in_account_currency": 0.0 if is_cash_in else abs(flt(cash_amount_in_ac)),
                 "account_currency": cash_currency,
                 "exchange_rate": gl_rate_cash,
                 "cost_center": parent_cost_center,
                 "project": parent_project,
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
                 "exchange_rate": gl_row_rate,
                 "party_type": row.party_type,
                 "party": row.party,
                 "cost_center": row_cost_center,
                 "project": row_project,
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
                                      description, transaction_type, employee=None, pre_assigned_name=None):
    if not pos_session:
        frappe.throw(_("POS Session is required."))

    company = frappe.db.get_value("POS Opening Entry", pos_session, "company")
    pos_profile = frappe.db.get_value("POS Opening Entry", pos_session, "pos_profile")
    company_currency = frappe.get_cached_value("Company", company, "default_currency")

    # Cash account — from the mode of payment
    cash_account = frappe.db.get_value(
        "Mode of Payment Account",
        {"parent": mode_of_payment, "company": company},
        "default_account",
    )
    if not cash_account:
        frappe.throw(_("No default Account for Mode of Payment {0} in Company {1}.").format(
            mode_of_payment, company
        ))
    cash_currency = frappe.db.get_value("Account", cash_account, "account_currency") or company_currency

    # Offset account
    account = frappe.db.get_value("POS Profile", pos_profile, "write_off_account")
    if not account:
        account = frappe.get_cached_value("Company", company, "write_off_account")
    if not account:
        frappe.throw(_(
            "Please configure 'Write Off Account' in POS Profile {0} or Company {1}."
        ).format(pos_profile, company))
    offset_currency = frappe.db.get_value("Account", account, "account_currency") or company_currency

    from sultan.sultan.api.cash_transaction import get_exchange_rate_for_cash_io
    rate_cash = get_exchange_rate_for_cash_io(pos_profile, cash_currency, company_currency)
    rate_offset = get_exchange_rate_for_cash_io(pos_profile, offset_currency, company_currency)

    base_amount = flt(amount) * rate_cash
    offset_amount_in_ac = base_amount / rate_offset if rate_offset else base_amount

    amount_val = base_amount if transaction_type in ("Cash In", "Opening Difference") else -base_amount

    if not employee and pos_session:
        employee = frappe.db.get_value("POS Opening Entry", pos_session, "custom_employee")

    doc = frappe.new_doc("POS Suspended Transaction")
    if pre_assigned_name:
        doc.name = pre_assigned_name
        doc.flags.ignore_naming_series = True
    doc.pos_session = pos_session
    doc.company = company
    if employee:
        doc.employee = employee
        doc.employee_name = frappe.db.get_value("Employee", employee, "employee_name")
    else:
        doc.employee_name = frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user
    doc.mode_of_payment = mode_of_payment
    doc.currency = cash_currency
    doc.exchange_rate = (1.0 / rate_cash) if rate_cash and rate_cash < 1.0 else (rate_cash or 1.0)
    doc.posting_date_time = frappe.utils.now_datetime()
    doc.total_amount = amount_val
    doc.description = description
    doc.transaction_type = transaction_type
    doc.append("accounts", {
        "account": account,
        "account_currency": offset_currency,
        "amount_in_account_currency": offset_amount_in_ac,
        "exchange_rate": (1.0 / rate_offset) if rate_offset and rate_offset < 1.0 else (rate_offset or 1.0),
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
            employee=doc.get("custom_employee"),
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
        if t.transaction_type in ("Cash In", "Cash Out", "Opening Difference"):
            txn_sums[mop] = txn_sums.get(mop, 0.0) + flt(t.total_amount)
        if t.transaction_type != "Closing Difference":
            if hasattr(doc, "custom_pos_suspended_transactions"):
                doc.append("custom_pos_suspended_transactions", {
                    "method": t.mode_of_payment,
                    "remarks": t.description,
                    "amount": flt(t.total_amount),
                })

    invoices = []
    if doc.get("pos_transactions"):
        invoices.extend([t.pos_invoice for t in doc.pos_transactions if t.pos_invoice])
    if hasattr(doc, "custom_sales_invoice") and doc.custom_sales_invoice:
        invoices.extend([t.sales_invoice for t in doc.custom_sales_invoice if t.sales_invoice])
    for row in doc.payment_reconciliation:
        mop = row.mode_of_payment
        rate = frappe.db.get_value(
            "POS Payment Method",
            {"parent": doc.pos_profile, "mode_of_payment": mop},
            "custom_exchange_rate"
        )
        rate = flt(rate) or 1.0

        invoices_sum = 0.0
        if invoices:
            payment_sum = frappe.db.sql("""
                SELECT SUM(
                    CASE 
                        WHEN custom_payment_original_amount IS NOT NULL AND custom_payment_original_amount != 0 
                        THEN custom_payment_original_amount 
                        ELSE amount 
                    END
                ) 
                FROM `tabSales Invoice Payment` 
                WHERE parent IN %s AND mode_of_payment = %s
            """, (tuple(invoices), mop))[0][0] or 0.0

            is_cash = frappe.db.get_value("Mode of Payment", mop, "type") == "Cash"
            change_sum = 0.0
            if is_cash:
                base_change_sum = frappe.db.get_value(
                    "POS Invoice",
                    {"name": ["in", invoices], "account_for_change_amount": ["is", "set"]},
                    "sum(change_amount)",
                ) or 0.0
                change_sum = flt(base_change_sum) * rate
            invoices_sum = flt(payment_sum) - flt(change_sum)

        suspended_sum = flt(txn_sums.get(mop, 0.0)) * rate
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
    # Invalidate query value cache for this document, as a negative existence check
    # might have been cached earlier in the transaction, which would cause
    # LinkValidationError on the new POS Suspended Transaction linking to this doc.
    if hasattr(frappe.db, "value_cache"):
        keys_to_del = [
            k for k in frappe.db.value_cache.keys()
            if isinstance(k, tuple) and len(k) >= 2 and k[0] == doc.doctype and k[1] == doc.name
        ]
        for k in keys_to_del:
            del frappe.db.value_cache[k]
    frappe.clear_document_cache(doc.doctype, doc.name)

    for row in doc.payment_reconciliation:
        if flt(row.difference) == 0.0:
            continue
        # Always track closing differences regardless of track_opening setting

        write_off_account = frappe.db.get_value("POS Profile", doc.pos_profile, "write_off_account")
        if not write_off_account:
            write_off_account = frappe.get_cached_value("Company", doc.company, "write_off_account")
        if not write_off_account:
            frappe.throw(_(
                "Please configure 'Write Off Account' in POS Profile {0} or Company {1}."
            ).format(doc.pos_profile, doc.company))
        employee = None
        if doc.pos_opening_entry:
            employee = frappe.db.get_value("POS Opening Entry", doc.pos_opening_entry, "custom_employee")

        company_currency = frappe.get_cached_value("Company", doc.company, "default_currency")
        cash_account = frappe.db.get_value(
            "Mode of Payment Account",
            {"parent": row.mode_of_payment, "company": doc.company},
            "default_account",
        )
        cash_currency = (
            frappe.db.get_value("Account", cash_account, "account_currency")
            or company_currency
        )
        from sultan.sultan.api.cash_transaction import get_exchange_rate_for_cash_io
        rate_cash = get_exchange_rate_for_cash_io(doc.pos_profile, cash_currency, company_currency)

        base_difference = flt(row.difference) * rate_cash

        write_off_currency = (
            frappe.db.get_value("Account", write_off_account, "account_currency")
            or company_currency
        )
        rate_write_off = get_exchange_rate_for_cash_io(doc.pos_profile, write_off_currency, company_currency)
        write_off_amount_in_ac = abs(base_difference) / rate_write_off if rate_write_off else abs(base_difference)

        txn = frappe.new_doc("POS Suspended Transaction")
        txn.pos_session = doc.pos_opening_entry
        txn.pos_closing_entry = doc.name
        txn.company = doc.company
        txn.employee = employee
        if employee:
            txn.employee_name = frappe.db.get_value("Employee", employee, "employee_name")
        else:
            txn.employee_name = frappe.db.get_value("User", doc.owner, "full_name") or doc.owner
        txn.mode_of_payment = row.mode_of_payment
        txn.currency = cash_currency
        txn.exchange_rate = (1.0 / rate_cash) if rate_cash and rate_cash < 1.0 else (rate_cash or 1.0)
        txn.posting_date_time = frappe.utils.now_datetime()
        txn.total_amount = base_difference
        txn.description = (
            _("Closing Difference (Gain)") if flt(row.difference) > 0.0
            else _("Closing Difference (Loss)")
        )
        txn.transaction_type = "Closing Difference"
        txn.append("accounts", {
            "account": write_off_account,
            "account_currency": write_off_currency,
            "amount_in_account_currency": write_off_amount_in_ac,
            "exchange_rate": (1.0 / rate_write_off) if rate_write_off and rate_write_off < 1.0 else (rate_write_off or 1.0),
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

    # --- Sultan: Consolidate POS Invoices into a single Sales Invoice at shift close ---
    try:
        _sultan_consolidate_invoices(doc)
    except Exception:
        frappe.log_error(frappe.get_traceback(), f"[Sultan] POS Invoice consolidation failed for {doc.name}")


@frappe.whitelist()
def get_session_reconciliation_data(pos_session):
    opening_doc = frappe.get_doc("POS Opening Entry", pos_session)

    opening_amounts = {
        row.mode_of_payment: flt(row.opening_amount)
        for row in opening_doc.balance_details
    }

    pos_invoice_meta = frappe.get_meta("POS Invoice")
    if pos_invoice_meta.has_field("posa_pos_opening_shift"):
        invoices = frappe.get_all(
            "POS Invoice",
            filters={"posa_pos_opening_shift": pos_session, "docstatus": 1},
            pluck="name",
        )
    elif pos_invoice_meta.has_field("pos_opening_entry"):
        invoices = frappe.get_all(
            "POS Invoice",
            filters={"pos_opening_entry": pos_session, "docstatus": 1},
            pluck="name",
        )
    else:
        invoices = frappe.get_all(
            "POS Invoice",
            filters={
                "posting_date": ["between", [
                    opening_doc.period_start_date or frappe.utils.nowdate(),
                    opening_doc.period_end_date or frappe.utils.nowdate(),
                ]],
                "pos_profile": opening_doc.pos_profile,
                "owner": opening_doc.user,
                "docstatus": 1,
            },
            pluck="name",
        )

    invoice_sums = {}
    change_sums = {}
    if invoices:
        payments = frappe.db.sql(
            "SELECT mode_of_payment, SUM(amount) as total "
            "FROM `tabSales Invoice Payment` WHERE parent IN %(invoices)s "
            "GROUP BY mode_of_payment",
            {"invoices": invoices},
            as_dict=True,
        )
        for p in payments:
            invoice_sums[p.mode_of_payment] = flt(p.total)

        cash_mops = frappe.get_all("Mode of Payment", filters={"type": "Cash"}, pluck="name")
        for mop in cash_mops:
            change_total = frappe.db.sql(
                "SELECT SUM(pi.change_amount) FROM `tabPOS Invoice` pi "
                "WHERE pi.name IN %(invoices)s AND pi.change_amount > 0",
                {"invoices": invoices},
            )[0][0] or 0.0
            if change_total:
                change_sums[mop] = flt(change_total)

    txns = frappe.get_all(
        "POS Suspended Transaction",
        filters={"pos_session": pos_session},
        fields=["name", "mode_of_payment", "total_amount", "description", "transaction_type"],
    )

    suspended_sums = {}
    txn_list = []
    for t in txns:
        mop = t.mode_of_payment
        if t.transaction_type in ("Cash In", "Cash Out"):
            suspended_sums[mop] = suspended_sums.get(mop, 0.0) + flt(t.total_amount)
        if t.transaction_type != "Closing Difference":
            txn_list.append({
                "mode_of_payment": mop,
                "description": t.description,
                "total_amount": flt(t.total_amount),
                "transaction_type": t.transaction_type,
            })

    all_mops = set(
        list(opening_amounts.keys())
        + list(invoice_sums.keys())
        + list(suspended_sums.keys())
    )
    expected = {
        mop: (
            opening_amounts.get(mop, 0.0)
            + invoice_sums.get(mop, 0.0) - change_sums.get(mop, 0.0)
            + suspended_sums.get(mop, 0.0)
        )
        for mop in all_mops
    }

    return {"expected": expected, "txns": txn_list}


@frappe.whitelist()
def close_pos_session(pos_opening_entry, closing_amounts, employee=None):
    import json
    if isinstance(closing_amounts, str):
        closing_amounts = json.loads(closing_amounts)

    opening_doc = frappe.get_doc("POS Opening Entry", pos_opening_entry)
    if opening_doc.status != "Open":
        frappe.throw(_("POS Session is already closed or not Open."))

    from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import (
        make_closing_entry_from_opening,
    )
    closing_doc = make_closing_entry_from_opening(opening_doc)

    pos_profile_doc = frappe.get_doc("POS Profile", opening_doc.pos_profile)
    existing_mops = [p.mode_of_payment for p in closing_doc.payment_reconciliation]
    for pm in pos_profile_doc.payments:
        if pm.mode_of_payment not in existing_mops:
            closing_doc.append("payment_reconciliation", {
                "mode_of_payment": pm.mode_of_payment,
                "opening_amount": 0.0,
                "expected_amount": 0.0,
                "closing_amount": 0.0,
            })
            existing_mops.append(pm.mode_of_payment)

    for row in closing_doc.payment_reconciliation:
        row.closing_amount = flt(closing_amounts.get(row.mode_of_payment, 0.0))

    closing_doc.insert(ignore_permissions=True)
    closing_doc.submit()
    frappe.db.commit()

    return closing_doc.name


@frappe.whitelist()
def download_closing_pdf(closing_name, as_html=0):
    from frappe.utils.pdf import get_pdf

    doc = frappe.get_doc("POS Closing Entry", closing_name)
    opening = frappe.get_doc("POS Opening Entry", doc.pos_opening_entry)

    suspended_txns = frappe.get_all(
        "POS Suspended Transaction",
        filters={"pos_session": doc.pos_opening_entry},
        fields=["transaction_type", "total_amount"],
    )
    other_cash_in = sum(flt(t.total_amount) for t in suspended_txns if t.transaction_type == "Cash In")
    other_cash_out = sum(flt(t.total_amount) for t in suspended_txns if t.transaction_type == "Cash Out")

    pos_invoice_meta = frappe.get_meta("POS Invoice")
    pos_session = doc.pos_opening_entry
    if pos_invoice_meta.has_field("posa_pos_opening_shift"):
        invoices = frappe.get_all(
            "POS Invoice",
            filters={"posa_pos_opening_shift": pos_session, "docstatus": 1},
            fields=["name", "is_return", "grand_total"],
        )
    elif pos_invoice_meta.has_field("pos_opening_entry"):
        invoices = frappe.get_all(
            "POS Invoice",
            filters={"pos_opening_entry": pos_session, "docstatus": 1},
            fields=["name", "is_return", "grand_total"],
        )
    else:
        invoices = frappe.get_all(
            "POS Invoice",
            filters={
                "posting_date": ["between", [
                    opening.period_start_date or frappe.utils.nowdate(),
                    opening.period_end_date or frappe.utils.nowdate(),
                ]],
                "pos_profile": opening.pos_profile,
                "owner": opening.user,
                "docstatus": 1,
            },
            fields=["name", "is_return", "grand_total"],
        )

    cash_sales = bank_sales = on_account_sales = cash_refund = bank_refund = 0.0
    if invoices:
        inv_names = [inv.name for inv in invoices]
        payments = frappe.get_all(
            "Sales Invoice Payment",
            filters={"parent": ["in", inv_names]},
            fields=["parent", "mode_of_payment", "amount"],
        )
        inv_lookup = {inv.name: inv for inv in invoices}
        for p in payments:
            inv = inv_lookup.get(p.parent)
            if not inv:
                continue
            mop_lower = p.mode_of_payment.lower()
            if "cash" in mop_lower:
                if inv.is_return:
                    cash_refund += abs(flt(p.amount))
                else:
                    cash_sales += flt(p.amount)
            else:
                if inv.is_return:
                    bank_refund += abs(flt(p.amount))
                else:
                    bank_sales += flt(p.amount)
        for inv in invoices:
            inv_payments = [p for p in payments if p.parent == inv.name]
            paid_amount = sum(flt(p.amount) for p in inv_payments)
            if paid_amount < flt(inv.grand_total) and not inv.is_return:
                on_account_sales += flt(inv.grand_total) - paid_amount

    opening_cash = sum(
        flt(row.opening_amount)
        for row in doc.payment_reconciliation
        if "cash" in row.mode_of_payment.lower()
    )
    total_expected = sum(flt(row.expected_amount) for row in doc.payment_reconciliation)

    company_currency = frappe.get_cached_value("Company", doc.company, "default_currency") or frappe.db.get_default("currency") or frappe.db.get_single_value("System Settings", "default_currency") or frappe.db.get_value("Company", {}, "default_currency")

    def fmt_num(val, currency=None):
        if not currency:
            currency = company_currency
        precision = 2
        if currency:
            number_format = frappe.db.get_value("Currency", currency, "number_format", cache=True)
            if not number_format:
                number_format = frappe.db.get_default("number_format") or "#,###.##"
            
            from frappe.utils.data import get_number_format_info
            _, _, precision = get_number_format_info(number_format)

        if precision == 0:
            return f"{round(flt(val)):,}"
        return f"{flt(val):,.{precision}f}"

    def format_dt(dt):
        return frappe.utils.format_datetime(dt, "dd/MM/yyyy HH:mm:ss") if dt else ""

    breakdown_rows = ""
    currency_totals = {}
    for row in doc.payment_reconciliation:
        mop_currency = frappe.db.get_value(
            "POS Payment Method",
            {"parent": doc.pos_profile, "mode_of_payment": row.mode_of_payment},
            "custom_currency"
        ) or company_currency
        
        exp = flt(row.expected_amount)
        act = flt(row.closing_amount)
        diff = flt(row.difference)
        
        if mop_currency not in currency_totals:
            currency_totals[mop_currency] = {"expected": 0.0, "actual": 0.0, "difference": 0.0}
        currency_totals[mop_currency]["expected"] += exp
        currency_totals[mop_currency]["actual"] += act
        currency_totals[mop_currency]["difference"] += diff
        
        mop_clean = row.mode_of_payment
        if "bank" in mop_clean.lower() or "card" in mop_clean.lower() or "credit" in mop_clean.lower():
            mop_clean = f"Bank ({mop_currency})"
        else:
            mop_clean = f"Cash ({mop_currency})"

        breakdown_rows += (
            f"<tr><td>{mop_clean}</td>"
            f"<td class='right'>{fmt_num(exp, mop_currency)}</td>"
            f"<td class='right'>{fmt_num(act, mop_currency)}</td>"
            f"<td class='right'>{fmt_num(diff, mop_currency)}</td></tr>"
        )

    total_rows = ""
    for cur, totals in currency_totals.items():
        total_rows += (
            f"<tr class='total-row'><td>Total ({cur})</td>"
            f"<td class='right'>{fmt_num(totals['expected'], cur)}</td>"
            f"<td class='right'>{fmt_num(totals['actual'], cur)}</td>"
            f"<td class='right'>{fmt_num(totals['difference'], cur)}</td></tr>"
        )

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
@page {{size:80mm auto;margin:0}}
body{{font-family:'Courier New',monospace;font-size:11px;color:#000;line-height:1.3;
width:70mm;margin:0 auto;padding:4mm 3mm;box-sizing:border-box}}
.header{{text-align:center;margin-bottom:4mm}}
.header h2{{font-size:14px;margin:0 0 1mm 0;font-weight:bold}}
.info-grid{{width:100%;border-collapse:collapse;margin-bottom:2mm}}
.info-grid td{{padding:1px 0;vertical-align:top;font-size:10px}}
.info-grid td.label{{font-weight:bold;width:50%}}
.info-grid td.value{{text-align:right;width:50%}}
.divider{{border-top:1px dashed #000;margin:2mm 0}}
.section-title{{font-size:11px;font-weight:bold;margin:2mm 0 1mm 0;text-transform:uppercase;text-decoration:underline}}
.data-table{{width:100%;border-collapse:collapse;margin-bottom:2mm}}
.data-table th{{border-bottom:1px solid #000;padding:2px 0;font-weight:bold;font-size:10px;text-align:left}}
.data-table th.right,.data-table td.right{{text-align:right}}
.data-table td{{padding:2px 0;font-size:10px}}
.data-table tr.total-row td{{border-top:1px dashed #000;border-bottom:1px solid #000;font-weight:bold}}
.footer{{text-align:center;margin-top:4mm;font-size:11px;font-weight:bold}}
</style></head><body>
<div class="header"><h2>{doc.pos_profile}</h2><div class="divider"></div></div>
<table class="info-grid">
<tr><td class="label">Date:</td><td class="value">{frappe.utils.formatdate(doc.posting_date,'dd/MM/yyyy')}</td></tr>
<tr><td class="label">Opening:</td><td class="value">{format_dt(opening.creation)}</td></tr>
<tr><td class="label">Closing:</td><td class="value">{format_dt(doc.creation)}</td></tr>
</table>
<div class="divider"></div>
<div class="section-title">Transactions ({company_currency})</div>
<table class="data-table">
<thead><tr><th>Type</th><th class="right">Amount</th></tr></thead>
<tbody>
<tr><td>Opening cash</td><td class="right">{fmt_num(opening_cash, company_currency)}</td></tr>
<tr><td>Cash sales</td><td class="right">{fmt_num(cash_sales, company_currency)}</td></tr>
<tr><td>Bank sales</td><td class="right">{fmt_num(bank_sales, company_currency)}</td></tr>
<tr><td>On account</td><td class="right">{fmt_num(on_account_sales, company_currency)}</td></tr>
<tr><td>Cash refund</td><td class="right">({fmt_num(cash_refund, company_currency)})</td></tr>
<tr><td>Bank refund</td><td class="right">({fmt_num(bank_refund, company_currency)})</td></tr>
<tr><td>Other cash in</td><td class="right">{fmt_num(other_cash_in, company_currency)}</td></tr>
<tr><td>Other cash out</td><td class="right">({fmt_num(other_cash_out, company_currency)})</td></tr>
<tr class="total-row"><td>Total expected</td><td class="right">{fmt_num(total_expected, company_currency)}</td></tr>
</tbody></table>
<div class="divider"></div>
<div class="section-title">Breakdown</div>
<table class="data-table">
<thead><tr><th>Account</th><th class="right">Expected</th><th class="right">Actual</th><th class="right">Diff</th></tr></thead>
<tbody>{breakdown_rows}
{total_rows}
</tbody></table>
<div class="footer">Closure#{doc.name}</div>
</body></html>"""

    if frappe.utils.cint(as_html) == 1:
        frappe.response.type = "download"
        frappe.response.display_content_as = "inline"
        frappe.response.content_type = "text/html"
        frappe.response.filename = "preview.html"
        frappe.response.filecontent = html
        return

    options = {
        "page-width": "80mm",
        "page-height": "160mm",
        "margin-top": "2mm",
        "margin-bottom": "2mm",
        "margin-left": "2mm",
        "margin-right": "2mm",
    }
    pdf_content = get_pdf(html, options=options)
    frappe.local.response.filename = f"POS-Closing-{closing_name}.pdf"
    frappe.local.response.filecontent = pdf_content
    frappe.local.response.type = "download"


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


def _sultan_consolidate_invoices(closing_entry_doc):
    """
    Consolidate all POS Invoices of this shift into a single Sales Invoice
    using ERPNext's standard POS Invoice Merge Log mechanism.

    Sultan does not populate pos_transactions on the closing entry to avoid
    owner/user validation errors. Instead we collect the invoices here and
    pass them directly to consolidate_pos_invoices.
    """
    from frappe.utils import flt
    from erpnext.accounts.doctype.pos_invoice_merge_log.pos_invoice_merge_log import (
        consolidate_pos_invoices,
    )

    pos_opening = closing_entry_doc.pos_opening_entry
    if not pos_opening:
        return

    # Fetch all submitted, unconsolidated POS Invoices for this shift
    raw_invoices = frappe.get_all(
        "POS Invoice",
        filters={
            "custom_pos_opening_entry": pos_opening,
            "docstatus": 1,
        },
        fields=["name", "customer", "is_return", "return_against", "consolidated_invoice"],
    )

    # Filter out already-consolidated invoices
    invoices = [
        frappe._dict(pos_invoice=r.name, customer=r.customer, is_return=r.is_return, return_against=r.return_against)
        for r in raw_invoices
        if not r.consolidated_invoice
    ]

    if not invoices:
        frappe.logger().info(f"[Sultan] No unconsolidated POS Invoices for shift {pos_opening}")
        return

    frappe.logger().info(f"[Sultan] Consolidating {len(invoices)} POS Invoices for shift {pos_opening}")
    consolidate_pos_invoices(pos_invoices=invoices, closing_entry=closing_entry_doc)
    frappe.logger().info(f"[Sultan] Consolidation complete for shift {pos_opening}")

