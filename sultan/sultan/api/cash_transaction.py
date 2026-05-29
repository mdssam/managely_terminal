"""
Backward-compatible Cash Transaction API.

All new code should use sultan.sultan.api.suspended_transaction directly.
These wrappers keep existing front-end calls working.
"""
import frappe
from frappe.utils import flt

from sultan.sultan.api.suspended_transaction import (
    create_cash_transaction_from_pos,
    get_suspended_transactions,
)


@frappe.whitelist()
def create_cash_transaction(transaction_type, amount, description="", override_account=None):
    """Backward-compatible wrapper — delegates to create_cash_transaction_from_pos."""
    return create_cash_transaction_from_pos(transaction_type, amount, description)


@frappe.whitelist()
def get_cash_transactions(opening_entry=None):
    """Backward-compatible wrapper — delegates to get_suspended_transactions."""
    return get_suspended_transactions(opening_entry)


def create_gl_entries_for_session(opening_entry, company):
    """No-op: GL entries are now created inline by create_suspended_transaction."""
    pass
