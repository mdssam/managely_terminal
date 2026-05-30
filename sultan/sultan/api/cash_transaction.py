"""
Cash I/O bridge for the Sultan SPA.

All GL logic and doctypes are owned by the cash_drawer app.
These endpoints proxy to that app when it is installed; when it is not
installed the feature is simply disabled (the SPA hides the button).
"""
import frappe
from frappe.utils import flt

from sultan.sultan.api.sales_invoice import get_current_pos_opening_entry


def _installed():
    return "cash_drawer" in frappe.get_installed_apps()


@frappe.whitelist()
def get_cash_io_config(pos_profile=None):
    """Return whether the Cash I/O feature is installed and enabled for the profile."""
    if not _installed():
        return {"installed": False, "enabled": False, "allowed_modes": []}

    if not pos_profile:
        opening_entry = get_current_pos_opening_entry()
        if opening_entry:
            pos_profile = frappe.db.get_value("POS Opening Entry", opening_entry, "pos_profile")

    if not pos_profile:
        return {"installed": True, "enabled": False, "allowed_modes": []}

    # cash_drawer adds `allowed_for_cash_in_out` (no custom_ prefix) via create_custom_fields
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
    """Proxy to cash_drawer.create_cash_transaction_from_pos."""
    if not _installed():
        return {"success": False, "error": "Cash I/O feature (cash_drawer) is not installed."}

    try:
        from cash_drawer.cash_drawer.doctype.pos_suspended_transaction.pos_suspended_transaction import (
            create_cash_transaction_from_pos,
        )

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
    """Return submitted Cash In/Out records for the session (from POS Suspended Transaction)."""
    if not _installed():
        return {"success": True, "data": [], "summary": {"cash_in": 0, "cash_out": 0, "net": 0}}

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

    # Normalise to the shape the SPA expects
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
    """No-op: GL entries are created inline by cash_drawer."""
    pass
