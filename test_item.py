import frappe
import sys
import traceback

frappe.connect(site="manu.com")
try:
    from sultan.sultan.api.item import get_items_with_balance_and_price
    result = get_items_with_balance_and_price(limit=5)
    print("SUCCESS! Result keys:", result.keys())
    print("First item:", result["items"][0] if result.get("items") else "No items")
except Exception as e:
    print("FAILED!")
    traceback.print_exc()
finally:
    frappe.destroy()
