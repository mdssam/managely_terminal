import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate

@frappe.whitelist()
def get_closing_sessions(company=None, pos_profile=None, user=None, cashier=None, status=None, date=None, from_date=None, to_date=None):
    if not frappe.has_permission("POS Opening Entry", "read") and not frappe.has_permission("POS Closing Entry", "read"):
        frappe.throw(_("Not permitted to view POS Sessions"), frappe.PermissionError)

    profiles = frappe.get_all("POS Profile", fields=["name", "custom_branch_name"])
    profile_map = {}
    for p in profiles:
        raw_name = p.custom_branch_name or p.name or ""
        clean_name = str(raw_name).strip()
        profile_map[p.name] = clean_name
        profile_map[str(p.name).strip().lower()] = clean_name

    filters = {}
    or_filters = None
    meta_pos_opening = frappe.get_meta("POS Opening Entry")
    has_custom_emp = meta_pos_opening.has_field("custom_employee")
    has_custom_emp_name = meta_pos_opening.has_field("custom_employee_name")

    if company:
        filters["company"] = company
        
    if pos_profile:
        target_branch = str(pos_profile).strip().lower()
        matching_profile_names = []
        for p in profiles:
            clean_branch_name = str(p.custom_branch_name or p.name or "").strip().lower()
            clean_id = str(p.name).strip().lower()
            if clean_branch_name == target_branch or clean_id == target_branch:
                matching_profile_names.append(p.name)
        if matching_profile_names:
            if pos_profile not in matching_profile_names and str(pos_profile).lower() not in [m.lower() for m in matching_profile_names]:
                matching_profile_names.append(pos_profile)
            filters["pos_profile"] = ["in", matching_profile_names]
        else:
            filters["pos_profile"] = pos_profile

    target_user_val = cashier or user
    if target_user_val:
        emp_name = target_user_val
        emp_user_id = target_user_val
        if frappe.db.exists("Employee", target_user_val):
            emp_name = target_user_val
            emp_user_id = frappe.db.get_value("Employee", target_user_val, "user_id") or target_user_val
        elif frappe.db.exists("User", target_user_val):
            emp_user_id = target_user_val
            emp_name = frappe.db.get_value("Employee", {"user_id": target_user_val}, "name") or target_user_val

        if has_custom_emp:
            or_filters = [
                ["POS Opening Entry", "custom_employee", "=", emp_name],
                ["POS Opening Entry", "user", "=", emp_user_id]
            ]
        else:
            filters["user"] = emp_user_id

    if from_date and to_date:
        filters["posting_date"] = ["between", [from_date, to_date]]
    elif from_date:
        filters["posting_date"] = [">=", from_date]
    elif to_date:
        filters["posting_date"] = ["<=", to_date]
    elif date:
        filters["posting_date"] = date

    if status and status != "All":
        if status == "Open":
            filters["status"] = "Open"
            filters["docstatus"] = 1
        elif status == "Closed":
            filters["status"] = "Closed"
            filters["docstatus"] = 1
        elif status == "Draft":
            filters["docstatus"] = 0
        elif status == "Cancelled":
            filters["docstatus"] = 2
    else:
        filters["docstatus"] = ["!=", 2]

    query_fields = [
        "name", "pos_profile", "user", "company", "posting_date",
        "status", "docstatus", "creation", "pos_closing_entry",
        "period_start_date", "period_end_date"
    ]
    if has_custom_emp:
        query_fields.append("custom_employee")
    if has_custom_emp_name:
        query_fields.append("custom_employee_name")

    open_entries = frappe.get_all(
        "POS Opening Entry",
        filters=filters,
        or_filters=or_filters,
        fields=query_fields,
        order_by="posting_date desc, creation desc"
    )

    employees = frappe.get_all("Employee", fields=["name", "user_id", "custom_pos_username", "employee_name"])
    emp_by_name = {}
    emp_by_user = {}
    for e in employees:
        display_name = str(e.custom_pos_username or e.employee_name or e.name or "").strip()
        emp_by_name[e.name] = display_name
        if e.user_id:
            emp_by_user[e.user_id] = display_name

    total_expected_all = 0.0
    total_closing_all = 0.0
    total_difference_all = 0.0
    total_sessions = len(open_entries)

    closing_names = [e.pos_closing_entry for e in open_entries if e.pos_closing_entry]
    reconciliations = {}
    closing_meta = {}

    if closing_names:
        closing_docs = frappe.get_all(
            "POS Closing Entry",
            filters={"name": ["in", closing_names]},
            fields=["name", "docstatus", "status", "grand_total"]
        )
        for c in closing_docs:
            closing_meta[c.name] = c

        pay_rows = frappe.get_all(
            "POS Closing Entry Detail",
            filters={"parent": ["in", closing_names]},
            fields=["parent", "mode_of_payment", "expected_amount", "closing_amount", "difference"]
        )
        for row in pay_rows:
            parent = row.parent
            if parent not in reconciliations:
                reconciliations[parent] = {
                    "expected": 0.0,
                    "closing": 0.0,
                    "difference": 0.0,
                    "details": []
                }
            reconciliations[parent]["expected"] += flt(row.expected_amount)
            reconciliations[parent]["closing"] += flt(row.closing_amount)
            reconciliations[parent]["difference"] += flt(row.difference)
            reconciliations[parent]["details"].append(row)

    pos_invoice_meta = frappe.get_meta("POS Invoice")
    for entry in open_entries:
        raw_branch = profile_map.get(entry.pos_profile) or profile_map.get(str(entry.pos_profile).strip().lower()) or entry.pos_profile or ""
        entry.custom_branch_name = str(raw_branch).strip()
        
        emp_id = getattr(entry, "custom_employee", None)
        emp_name_val = getattr(entry, "custom_employee_name", None)
        cashier_display = None
        if emp_id and emp_id in emp_by_name:
            cashier_display = emp_by_name[emp_id]
        elif emp_name_val:
            cashier_display = emp_name_val
        elif entry.user in emp_by_user:
            cashier_display = emp_by_user[entry.user]
        else:
            cashier_display = frappe.db.get_value("User", entry.user, "full_name") or entry.user
        entry.cashier_name = str(cashier_display or "").strip()

        if entry.status == "Closed" and entry.pos_closing_entry:
            rec = reconciliations.get(
                entry.pos_closing_entry,
                {"expected": 0.0, "closing": 0.0, "difference": 0.0, "details": []}
            )
            if entry.pos_closing_entry not in reconciliations and entry.pos_closing_entry in closing_meta:
                c_doc = closing_meta[entry.pos_closing_entry]
                rec["expected"] = flt(c_doc.grand_total)
                rec["closing"] = flt(c_doc.grand_total)

            entry.expected_amount = rec["expected"]
            entry.closing_amount = rec["closing"]
            entry.difference = rec["difference"]
            entry.payment_details = rec["details"]
        elif entry.status == "Open" or not entry.pos_closing_entry:
            expected_sales = 0.0
            inv_filters = {"docstatus": 1}
            if pos_invoice_meta.has_field("posa_pos_opening_shift"):
                inv_filters["posa_pos_opening_shift"] = entry.name
            elif pos_invoice_meta.has_field("pos_opening_entry"):
                inv_filters["pos_opening_entry"] = entry.name
            else:
                inv_filters["pos_profile"] = entry.pos_profile
                inv_filters["owner"] = entry.user
                inv_filters["posting_date"] = entry.posting_date

            invoices = frappe.get_all("POS Invoice", filters=inv_filters, fields=["grand_total", "is_return"])
            for inv in invoices:
                expected_sales += flt(inv.grand_total)

            entry.expected_amount = expected_sales
            entry.closing_amount = 0.0
            entry.difference = 0.0
            entry.payment_details = []
            if not entry.status or entry.status == "Draft":
                entry.status = "Open" if entry.docstatus == 1 else "Draft"

        total_expected_all += flt(entry.expected_amount)
        total_closing_all += flt(entry.closing_amount)
        total_difference_all += flt(entry.difference)

    company_currency = frappe.db.get_default("currency")
    if company:
        company_currency = frappe.get_cached_value("Company", company, "default_currency") or company_currency
    elif open_entries and open_entries[0].company:
        company_currency = frappe.get_cached_value("Company", open_entries[0].company, "default_currency") or company_currency

    return {
        "entries": open_entries,
        "summary": {
            "total_sessions": total_sessions,
            "total_expected": total_expected_all,
            "total_closing": total_closing_all,
            "total_difference": total_difference_all,
            "currency": company_currency or ""
        }
    }

@frappe.whitelist()
def get_session_popup_details(pos_session):
    if not frappe.has_permission("POS Opening Entry", "read"):
        frappe.throw(_("Not permitted to view POS Sessions"), frappe.PermissionError)

    opening_doc = frappe.get_doc("POS Opening Entry", pos_session)
    company_currency = frappe.get_cached_value("Company", opening_doc.company, "default_currency") or ""

    raw_branch = frappe.db.get_value("POS Profile", opening_doc.pos_profile, "custom_branch_name") or opening_doc.pos_profile or ""
    branch_display = str(raw_branch).strip()

    meta_pos = frappe.get_meta("POS Opening Entry")
    cashier_display = ""
    if meta_pos.has_field("custom_employee_name") and getattr(opening_doc, "custom_employee_name", None):
        cashier_display = getattr(opening_doc, "custom_employee_name")
    elif meta_pos.has_field("custom_employee") and getattr(opening_doc, "custom_employee", None):
        emp_val = getattr(opening_doc, "custom_employee")
        cashier_display = frappe.db.get_value("Employee", emp_val, "custom_pos_username") or frappe.db.get_value("Employee", emp_val, "employee_name") or emp_val
    if not cashier_display:
        cashier_display = frappe.db.get_value("Employee", {"user_id": opening_doc.user}, "custom_pos_username") or frappe.db.get_value("Employee", {"user_id": opening_doc.user}, "employee_name") or frappe.db.get_value("User", opening_doc.user, "full_name") or opening_doc.user
    cashier_display = str(cashier_display or "").strip()

    profile_mops = frappe.get_all("POS Payment Method", filters={"parent": opening_doc.pos_profile}, fields=["mode_of_payment"], order_by="idx asc")
    registered_mop_names = [row.mode_of_payment for row in profile_mops if row.mode_of_payment]

    payment_rows = []
    if opening_doc.pos_closing_entry and frappe.db.exists("POS Closing Entry", opening_doc.pos_closing_entry):
        closing_doc = frappe.get_doc("POS Closing Entry", opening_doc.pos_closing_entry)
        closing_mops_map = {}
        for r in closing_doc.payment_reconciliation:
            closing_mops_map[r.mode_of_payment] = {
                "mode_of_payment": r.mode_of_payment,
                "expected_amount": flt(r.expected_amount),
                "actual_amount": flt(r.closing_amount),
                "difference": flt(r.difference)
            }
        
        for mop in registered_mop_names:
            if mop in closing_mops_map:
                payment_rows.append(closing_mops_map[mop])
            else:
                payment_rows.append({
                    "mode_of_payment": mop,
                    "expected_amount": 0.0,
                    "actual_amount": 0.0,
                    "difference": 0.0
                })
        for mop, data in closing_mops_map.items():
            if mop not in registered_mop_names:
                payment_rows.append(data)
    else:
        try:
            from managely_terminal.managely_terminal.doctype.pos_suspended_transaction.pos_suspended_transaction import get_session_reconciliation_data
            rec_data = get_session_reconciliation_data(pos_session)
            expected_map = rec_data.get("expected", {})
            
            for mop in registered_mop_names:
                exp_val = flt(expected_map.get(mop, 0.0))
                payment_rows.append({
                    "mode_of_payment": mop,
                    "expected_amount": exp_val,
                    "actual_amount": 0.0,
                    "difference": -exp_val
                })
            for mop, exp_val in expected_map.items():
                if mop not in registered_mop_names:
                    payment_rows.append({
                        "mode_of_payment": mop,
                        "expected_amount": flt(exp_val),
                        "actual_amount": 0.0,
                        "difference": -flt(exp_val)
                    })
        except Exception:
            for mop in registered_mop_names:
                payment_rows.append({
                    "mode_of_payment": mop,
                    "expected_amount": 0.0,
                    "actual_amount": 0.0,
                    "difference": 0.0
                })

    suspended_txns = frappe.get_all(
        "POS Suspended Transaction",
        filters={"pos_session": pos_session},
        fields=["name", "posting_date_time", "transaction_type", "mode_of_payment", "total_amount", "description", "employee_name"],
        order_by="posting_date_time asc"
    )

    return {
        "session": {
            "name": opening_doc.name,
            "branch": branch_display,
            "cashier": cashier_display,
            "pos_profile": opening_doc.pos_profile,
            "posting_date": str(opening_doc.posting_date or ""),
            "status": opening_doc.status,
            "docstatus": opening_doc.docstatus,
            "period_start_date": str(opening_doc.period_start_date or ""),
            "period_end_date": str(opening_doc.period_end_date or ""),
            "pos_closing_entry": opening_doc.pos_closing_entry or "",
            "currency": company_currency
        },
        "payment_reconciliation": payment_rows,
        "suspended_transactions": suspended_txns
    }
