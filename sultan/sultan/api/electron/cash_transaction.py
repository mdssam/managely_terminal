"""
Cash I/O bridge for the Sultan SPA.

Creates Sultan POS Cash Transaction documents (CASH-IO-XXXX series) with an
accompanying Journal Entry for proper GL recording.
"""
import frappe
from frappe import _
from frappe.utils import flt, nowdate, nowtime

from sultan.sultan.api.electron.sales_invoice import get_current_pos_opening_entry

_SYNTHETIC_PROFILE = "System Default"


@frappe.whitelist()
def get_cash_io_config(pos_profile=None):
    """Return whether the Cash I/O feature is enabled for the given POS profile.

    "System Default" is a synthetic sentinel returned by get_pos_details when no
    real POS profile is resolved (e.g. stale localStorage cache). Treat it the same
    as an absent profile and resolve from the user's active opening entry instead.
    """
    if not pos_profile or pos_profile == _SYNTHETIC_PROFILE:
        opening_entry = get_current_pos_opening_entry()
        if opening_entry:
            pos_profile = frappe.db.get_value("POS Opening Entry", opening_entry, "pos_profile")

    if not pos_profile or pos_profile == _SYNTHETIC_PROFILE:
        return {"installed": True, "enabled": False, "allowed_modes": []}

    allowed_modes_raw = frappe.get_all(
        "POS Payment Method",
        filters={"parent": pos_profile, "allowed_for_cash_in_out": 1},
        fields=["mode_of_payment"],
    )

    company = None
    opening_entry = get_current_pos_opening_entry()
    if opening_entry:
        company = frappe.db.get_value("POS Opening Entry", opening_entry, "company")
    if not company:
        company = frappe.db.get_value("POS Profile", pos_profile, "company")

    company_currency = frappe.get_cached_value("Company", company, "default_currency") if company else (frappe.db.get_default("currency") or frappe.db.get_single_value("System Settings", "default_currency") or frappe.db.get_value("Company", {}, "default_currency") or "")

    allowed_modes = []
    for am in allowed_modes_raw:
        mop = am.mode_of_payment
        currency = company_currency
        if company:
            cash_account = frappe.db.get_value(
                "Mode of Payment Account",
                {"parent": mop, "company": company},
                "default_account",
            )
            if cash_account:
                acc_currency = frappe.db.get_value("Account", cash_account, "account_currency")
                if acc_currency:
                    currency = acc_currency
        symbol = frappe.db.get_value("Currency", currency, "symbol") or currency
        allowed_modes.append({
            "name": mop,
            "currency": currency,
            "symbol": symbol
        })

    return {
        "installed": True,
        "enabled": len(allowed_modes) > 0,
        "allowed_modes": allowed_modes,
    }


def get_exchange_rate_for_cash_io(pos_profile, from_currency, to_currency):
    if not from_currency or not to_currency or from_currency == to_currency:
        return 1.0

    if pos_profile:
        custom_rate = frappe.db.sql("""
            SELECT ppm.custom_exchange_rate
            FROM `tabPOS Payment Method` ppm
            JOIN `tabMode of Payment Account` mopa ON mopa.parent = ppm.mode_of_payment
            JOIN `tabAccount` acc ON acc.name = mopa.default_account
            WHERE ppm.parent = %s AND acc.account_currency = %s
            LIMIT 1
        """, (pos_profile, from_currency))
        if custom_rate and flt(custom_rate[0][0]) > 0:
            return 1.0 / flt(custom_rate[0][0])

        rate = frappe.db.get_value(
            "POS Multi Currency Rate",
            {"parent": pos_profile, "parenttype": "POS Profile", "currency": from_currency},
            "exchange_rate"
        )
        if rate:
            return flt(rate)

    try:
        from erpnext.setup.utils import get_exchange_rate
        return flt(get_exchange_rate(from_currency, to_currency))
    except Exception:
        return 1.0


@frappe.whitelist()
def create_cash_transaction(transaction_type, amount, description="",
                            mode_of_payment=None, pos_session=None, pre_assigned_name=None):
    """Create a POS Suspended Transaction for the active session."""
    try:
        if not pos_session:
            pos_session = get_current_pos_opening_entry()
        if not pos_session:
            return {"success": False, "error": "No open POS session found."}
        if not mode_of_payment:
            return {"success": False, "error": "Mode of payment is required."}

        from sultan.sultan.doctype.pos_suspended_transaction.pos_suspended_transaction import (
            create_cash_transaction_from_pos
        )
        name = create_cash_transaction_from_pos(
            pos_session=pos_session,
            amount=flt(amount),
            mode_of_payment=mode_of_payment,
            description=description,
            transaction_type=transaction_type,
            pre_assigned_name=pre_assigned_name,
        )
        return {"success": True, "name": name, "message": f"{transaction_type} of {amount} recorded."}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Create Cash Transaction Error")
        return {"success": False, "error": str(e)}


def _create_sultan_cash_transaction(pos_session, amount, mode_of_payment,
                                    description, transaction_type, employee=None):
    """Insert and submit a Sultan POS Cash Transaction + Journal Entry.

    This is the single authoritative function for all 4 transaction types
    (Cash In, Cash Out, Opening Difference, Closing Difference). All records
    land in Sultan POS Cash Transaction (CASH-IO-XXXX).
    """
    company = frappe.db.get_value("POS Opening Entry", pos_session, "company")
    pos_profile = frappe.db.get_value("POS Opening Entry", pos_session, "pos_profile")
    currency = frappe.get_cached_value("Company", company, "default_currency")

    # Cash account — from the mode of payment
    cash_account = frappe.db.get_value(
        "Mode of Payment Account",
        {"parent": mode_of_payment, "company": company},
        "default_account",
    )
    if not cash_account:
        frappe.throw(_(
            "No account configured for Mode of Payment '{0}' in company '{1}'. "
            "Go to Mode of Payment → {0} and add an account row for company {1}."
        ).format(mode_of_payment, company))

    # Offset account — POS Profile write-off account, or company write-off account
    offset_account = (
        frappe.db.get_value("POS Profile", pos_profile, "write_off_account")
        or frappe.get_cached_value("Company", company, "write_off_account")
    )
    if not offset_account:
        frappe.throw(_(
            "Please configure 'Write Off Account' in POS Profile '{0}' or Company '{1}'."
        ).format(pos_profile, company))

    now_date = nowdate()
    now_time = nowtime()

    # Cash In  → debit cash account (money enters drawer), credit offset
    # Cash Out → debit offset (expense recorded), credit cash account (money leaves drawer)
    if transaction_type in ("Cash In", "Opening Difference"):
        account_debit = cash_account
        account_credit = offset_account
    else:
        account_debit = offset_account
        account_credit = cash_account

    cash_account_currency = frappe.db.get_value("Account", cash_account, "account_currency") or currency
    offset_account_currency = frappe.db.get_value("Account", offset_account, "account_currency") or currency

    rate_cash = get_exchange_rate_for_cash_io(pos_profile, cash_account_currency, currency)
    rate_offset = get_exchange_rate_for_cash_io(pos_profile, offset_account_currency, currency)

    base_amount = flt(amount) * rate_cash

    # Debit account details
    if account_debit == cash_account:
        debit_currency = cash_account_currency
        debit_exchange_rate = rate_cash
        debit_in_ac = flt(amount)
        debit_base = base_amount
    else:
        debit_currency = offset_account_currency
        debit_exchange_rate = rate_offset
        debit_base = base_amount
        debit_in_ac = base_amount / debit_exchange_rate if debit_exchange_rate else base_amount

    # Credit account details
    if account_credit == cash_account:
        credit_currency = cash_account_currency
        credit_exchange_rate = rate_cash
        credit_in_ac = flt(amount)
        credit_base = base_amount
    else:
        credit_currency = offset_account_currency
        credit_exchange_rate = rate_offset
        credit_base = base_amount
        credit_in_ac = base_amount / credit_exchange_rate if credit_exchange_rate else base_amount

    # 1. Create and submit Journal Entry for GL recording
    je = frappe.new_doc("Journal Entry")
    je.voucher_type = "Cash Entry"
    je.company = company
    je.posting_date = now_date
    je.user_remark = description or transaction_type
    je.append("accounts", {
        "account": account_debit,
        "account_currency": debit_currency,
        "exchange_rate": debit_exchange_rate,
        "debit_in_account_currency": debit_in_ac,
        "debit": debit_base,
        "credit_in_account_currency": 0.0,
        "credit": 0.0,
    })
    je.append("accounts", {
        "account": account_credit,
        "account_currency": credit_currency,
        "exchange_rate": credit_exchange_rate,
        "debit_in_account_currency": 0.0,
        "debit": 0.0,
        "credit_in_account_currency": credit_in_ac,
        "credit": credit_base,
    })
    je.flags.ignore_permissions = True
    je.insert(ignore_permissions=True)
    je.submit()

    # 2. Create and submit Sultan POS Cash Transaction linked to the JE
    doc = frappe.new_doc("Sultan POS Cash Transaction")
    doc.transaction_type = transaction_type
    doc.amount = flt(amount)
    doc.description = description
    doc.pos_opening_entry = pos_session
    doc.pos_profile = pos_profile
    doc.posting_date = now_date
    doc.posting_time = now_time
    doc.account_debit = account_debit
    doc.account_credit = account_credit
    doc.currency = cash_account_currency
    doc.linked_journal_entry = je.name
    if employee:
        doc.cashier_employee = employee

    if mode_of_payment:
        doc.mode_of_payment = mode_of_payment
    doc.flags.ignore_permissions = True
    doc.insert(ignore_permissions=True)
    doc.submit()
    frappe.db.commit()
    return doc.name


@frappe.whitelist()
def get_cash_transactions(opening_entry=None):
    """Return Cash In/Out records for the current session from POS Suspended Transaction."""
    if not opening_entry:
        opening_entry = get_current_pos_opening_entry()
    if not opening_entry:
        return {"success": True, "data": [], "summary": {"cash_in": 0, "cash_out": 0, "net": 0}}
        
    if not frappe.db.exists("DocType", "POS Suspended Transaction"):
        return {"success": True, "data": [], "summary": {"cash_in": 0, "cash_out": 0, "net": 0}}

    rows = frappe.get_all(
        "POS Suspended Transaction",
        filters={
            "pos_session": opening_entry,
            "transaction_type": ["in", ["Cash In", "Cash Out"]],
        },
        fields=[
            "name", "transaction_type", "total_amount",
            "description", "mode_of_payment", "posting_date_time",
        ],
        order_by="posting_date_time asc",
    )

    data = []
    for r in rows:
        p_date = ""
        p_time = ""
        if r.posting_date_time:
            p_date = str(r.posting_date_time.date())
            p_time = str(r.posting_date_time.time())
            
        data.append({
            "name": r.name,
            "transaction_type": r.transaction_type,
            "amount": abs(flt(r.total_amount)),
            "description": r.description or "",
            "mode_of_payment": r.mode_of_payment or "",
            "posting_date": p_date,
            "posting_time": p_time,
        })

    cash_in = sum(d["amount"] for d in data if d["transaction_type"] == "Cash In")
    cash_out = sum(d["amount"] for d in data if d["transaction_type"] == "Cash Out")

    return {
        "success": True,
        "data": data,
        "summary": {"cash_in": cash_in, "cash_out": cash_out, "net": cash_in - cash_out},
    }


def create_gl_entries_for_session(opening_entry, company):
    pass


@frappe.whitelist()
def get_cash_io_report_data(pos_profile=None, time_range=None, from_date=None, to_date=None, employee=None):
    """Fetch Cash In / Cash Out transactions list for the report page with role filtering."""
    try:
        user_roles = frappe.get_roles()
        is_admin = "Administrator" in user_roles or "System Manager" in user_roles
        is_auditor = "Auditor" in user_roles
        is_branch_manager = "Branch Manager" in user_roles
        allowed_profiles = []

        if employee:
            emp_doc = frappe.db.get_value("Employee", {"name": employee, "status": "Active"}, ["name", "custom_pos_role"], as_dict=True)
            if emp_doc:
                emp_role = emp_doc.custom_pos_role or "Cashier"
                if emp_role == "Branch Manager":
                    is_branch_manager = True
                    allowed_profiles = [d.pos_profile for d in frappe.get_all(
                        "Allowed POS Profile",
                        filters={"parent": emp_doc.name, "parenttype": "Employee"},
                        fields=["pos_profile"]
                    )]
                elif emp_role == "Auditor":
                    is_auditor = True
        else:
            emp_name = frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, "name")
            if emp_name:
                emp_role = frappe.db.get_value("Employee", emp_name, "custom_pos_role")
                if emp_role == "Branch Manager":
                    is_branch_manager = True
                elif emp_role == "Auditor":
                    is_auditor = True
                allowed_profiles = [d.pos_profile for d in frappe.get_all(
                    "Allowed POS Profile",
                    filters={"parent": emp_name, "parenttype": "Employee"},
                    fields=["pos_profile"]
                )]

        # Get branch profiles (custom_is_branch = 1)
        branch_profiles = [p.name for p in frappe.get_all("POS Profile", filters={"custom_is_branch": 1, "disabled": 0}, fields=["name"])]

        # Determine allowed POS Profiles based on roles
        if is_admin or is_auditor:
            allowed_profiles = branch_profiles
        elif is_branch_manager:
            allowed_profiles = [p for p in allowed_profiles if p in branch_profiles]
        else:
            # Cashier
            current_opening = get_current_pos_opening_entry()
            if current_opening:
                cashier_profile = frappe.db.get_value("POS Opening Entry", current_opening, "pos_profile")
                if cashier_profile:
                    allowed_profiles = [cashier_profile]

        # If no profiles allowed, return empty
        if not allowed_profiles:
            return {"success": True, "data": []}

        # Filters
        filters = {
            "transaction_type": ["in", ["Cash In", "Cash Out"]],
        }

        # Apply pos_profile filter
        if pos_profile:
            if pos_profile in allowed_profiles:
                filters["pos_profile"] = pos_profile
            else:
                return {"success": True, "data": []}
        else:
            filters["pos_profile"] = ["in", allowed_profiles]

        # Apply date/time filters
        if time_range == "today":
            filters["posting_date_time"] = [">=", f"{nowdate()} 00:00:00"]
        elif time_range == "week":
            from frappe.utils import add_days
            filters["posting_date_time"] = [">=", f"{add_days(nowdate(), -7)} 00:00:00"]
        elif time_range == "month":
            from frappe.utils import add_months
            filters["posting_date_time"] = [">=", f"{add_months(nowdate(), -1)} 00:00:00"]
        elif time_range in (None, "", "session"):
            # open sessions only
            open_sessions = [d.name for d in frappe.get_all("POS Opening Entry", filters={"status": "Open", "docstatus": 1}, fields=["name"])]
            if open_sessions:
                filters["pos_session"] = ["in", open_sessions]
            else:
                return {"success": True, "data": []}

        if from_date:
            filters["posting_date_time"] = [">=", f"{from_date} 00:00:00"]
        if to_date:
            if filters.get("posting_date_time") and filters["posting_date_time"][0] == ">=":
                start_date = filters["posting_date_time"][1]
                filters["posting_date_time"] = ["between", [start_date, f"{to_date} 23:59:59"]]
            else:
                filters["posting_date_time"] = ["<=", f"{to_date} 23:59:59"]

        rows = frappe.get_all(
            "POS Suspended Transaction",
            filters=filters,
            fields=[
                "name", "transaction_type", "total_amount",
                "description", "mode_of_payment", "posting_date_time",
                "pos_session", "pos_profile", "owner", "employee"
            ],
            order_by="posting_date_time desc",
        )

        data = []
        for r in rows:
            p_date = ""
            p_time = ""
            if r.posting_date_time:
                p_date = str(r.posting_date_time.date())
                p_time = str(r.posting_date_time.time())

            # Resolve actual employee name or user full name
            cashier_name = None
            emp = r.get("employee")
            if not emp and r.get("pos_session"):
                emp = frappe.db.get_value("POS Opening Entry", r.get("pos_session"), "custom_employee")
            if emp:
                cashier_name = frappe.db.get_value("Employee", emp, "custom_pos_username") or frappe.db.get_value("Employee", emp, "employee_name")
            if not cashier_name:
                cashier_name = frappe.db.get_value("User", r.owner, "full_name") or r.owner

            data.append({
                "name": r.name,
                "transaction_type": r.transaction_type,
                "amount": abs(flt(r.total_amount)),
                "description": r.description or "",
                "mode_of_payment": r.mode_of_payment or "",
                "posting_date": p_date,
                "posting_time": p_time,
                "session": r.pos_session,
                "pos_profile": r.pos_profile,
                "cashier": cashier_name
            })

        return {"success": True, "data": data}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "get_cash_io_report_data_error")
        raise e
