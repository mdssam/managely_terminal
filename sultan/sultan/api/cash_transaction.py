"""
Cash I/O bridge for the Sultan SPA.

POS Suspended Transaction logic lives in sultan; the DocType schema is currently
defined in cash_drawer and will move to sultan once cash_drawer is uninstalled.
"""
import frappe
from frappe.utils import flt

from sultan.sultan.api.sales_invoice import get_current_pos_opening_entry
from sultan.sultan.doctype.pos_suspended_transaction.pos_suspended_transaction import (
    create_cash_transaction_from_pos,
)


@frappe.whitelist()
def get_cash_io_config(pos_profile=None):
    """Return whether the Cash I/O feature is enabled for the given POS profile."""
    if not pos_profile:
        opening_entry = get_current_pos_opening_entry()
        if opening_entry:
            pos_profile = frappe.db.get_value("POS Opening Entry", opening_entry, "pos_profile")

    if not pos_profile:
        return {"installed": True, "enabled": False, "allowed_modes": []}

    allowed_modes = frappe.get_all(
        "POS Payment Method",
        filters={"parent": pos_profile, "allowed_for_cash_in_out": 1},
        pluck="mode_of_payment",
    )

    return {
        "installed": True,
        "enabled": len(allowed_modes) > 0,
        "allowed_modes": allowed_modes,
    }


@frappe.whitelist()
def create_cash_transaction(transaction_type, amount, description="",
                            mode_of_payment=None, pos_session=None):
    """Create a POS Suspended Transaction (Cash In / Cash Out)."""
    try:
        if not pos_session:
            pos_session = get_current_pos_opening_entry()
        if not pos_session:
            return {"success": False, "error": "No open POS session found."}
        if not mode_of_payment:
            return {"success": False, "error": "Mode of payment is required."}

        name = create_cash_transaction_from_pos(
            pos_session=pos_session,
            amount=flt(amount),
            mode_of_payment=mode_of_payment,
            description=description,
            transaction_type=transaction_type,
        )
        return {"success": True, "name": name, "message": f"{transaction_type} of {amount} recorded."}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Create Cash Transaction Error")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_cash_transactions(opening_entry=None):
    """Return Cash In/Out records for the current session."""
    if not opening_entry:
        opening_entry = get_current_pos_opening_entry()
    if not opening_entry:
        return {"success": True, "data": [], "summary": {"cash_in": 0, "cash_out": 0, "net": 0}}

    rows = frappe.get_all(
        "POS Suspended Transaction",
        filters={
            "pos_session": opening_entry,
            "transaction_type": ["in", ["Cash In", "Cash Out"]],
        },
        fields=[
            "name", "transaction_type",
            "total_amount as amount",
            "description", "mode_of_payment",
            "posting_date_time",
        ],
        order_by="posting_date_time asc",
    )

    data = []
    for r in rows:
        dt = r.get("posting_date_time")
        data.append({
            "name": r.name,
            "transaction_type": r.transaction_type,
            "amount": abs(flt(r.amount)),
            "description": r.description or "",
            "mode_of_payment": r.mode_of_payment or "",
            "posting_date": str(dt)[:10] if dt else "",
            "posting_time": str(dt)[11:19] if dt else "",
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
