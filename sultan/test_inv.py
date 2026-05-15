import frappe
from sultan.sultan.api.sales_invoice import create_and_submit_invoice

def test_invoice():
    data = {
        "customer": {"id": "Walk In"},
        "items": [
            {
                "id": "123",
                "item_code": "123",
                "quantity": 1,
                "price": 100,
            }
        ],
        "amountPaid": 100,
        "paymentMethods": [{"method": "Cash", "amount": 100}],
        "businessType": "B2C"
    }
    frappe.init(site="manu.com", sites_path="../../sites")
    frappe.connect()
    
    # Try to get an item that exists
    item = frappe.db.get_all("Item", limit=1)
    if not item:
        print("No items")
        return
    data["items"][0]["id"] = item[0].name
    data["items"][0]["item_code"] = item[0].name
    
    # Get a customer
    customer = frappe.db.get_all("Customer", limit=1)
    if customer:
        data["customer"]["id"] = customer[0].name

    print("Creating invoice...")
    try:
        frappe.session.user = "Administrator"
        res = create_and_submit_invoice(data)
        print("Result:", res)
        if res.get("success"):
            inv = frappe.get_doc("Sales Invoice", res.get("invoice_name"))
            print(f"is_pos: {inv.is_pos}, status: {inv.status}, paid_amount: {inv.paid_amount}, outstanding: {inv.outstanding_amount}")
    except Exception as e:
        print("Error:", e)

test_invoice()
