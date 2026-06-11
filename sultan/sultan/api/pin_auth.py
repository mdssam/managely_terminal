import hashlib
import frappe
from frappe import _


def _hash_pin(pin: str) -> str:
    """SHA-256 hash of the PIN, salted with the site name."""
    salt = frappe.local.site or "sultan"
    return hashlib.sha256(f"{salt}:{pin}".encode()).hexdigest()


@frappe.whitelist()
def set_pos_pin(pin: str) -> dict:
    """Set (or update) the POS PIN for the current user."""
    if not pin or not str(pin).strip().isdigit() or not (4 <= len(str(pin).strip()) <= 8):
        return {"success": False, "error": "PIN must be 4–8 digits."}

    user = frappe.session.user
    hashed = _hash_pin(str(pin).strip())

    # Store in the hidden custom field directly via db to avoid password field masking
    frappe.db.set_value("User", user, "custom_pos_pin_hash", hashed, update_modified=False)
    frappe.db.commit()
    return {"success": True, "message": "PIN set successfully."}


@frappe.whitelist()
def verify_pos_pin(pin: str) -> dict:
    """Verify the current user's POS PIN. Returns success: true/false."""
    user = frappe.session.user
    stored_hash = frappe.db.get_value("User", user, "custom_pos_pin_hash")

    if not stored_hash:
        # No PIN configured — allow entry without PIN so existing sessions keep working
        return {"success": True, "no_pin_set": True}

    if not pin or not str(pin).strip().isdigit():
        return {"success": False, "error": "Invalid PIN format."}

    if _hash_pin(str(pin).strip()) == stored_hash:
        return {"success": True}

    return {"success": False, "error": "Incorrect PIN."}


@frappe.whitelist()
def has_pos_pin() -> dict:
    """Check if the current user has a PIN configured."""
    user = frappe.session.user
    stored = frappe.db.get_value("User", user, "custom_pos_pin_hash")
    return {"has_pin": bool(stored)}
