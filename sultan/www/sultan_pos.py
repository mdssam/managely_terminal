import frappe
from frappe import _

def get_context(context):
    """
    Provides dynamic item and configuration data to the premium custom POS view.
    """
    # 1. Fetch all active sales items
    items = frappe.get_all("Item", 
        filters={
            "disabled": 0, 
            "is_sales_item": 1
        },
        fields=["name", "item_code", "item_name", "item_group", "standard_rate", "description", "is_fresh_produce", "image"],
        order_by="item_name ASC"
    )

    # 2. Attach actual price list rates if standard_rate is missing
    for item in items:
        if not item.standard_rate:
            price = frappe.db.get_value("Item Price", {"item_code": item.item_code, "price_list": "Standard Selling"}, "price_list_rate")
            item.standard_rate = price or 0
            
    context.items = items
    
    # 3. Extract distinct categories
    groups = sorted(list(set([i.item_group for i in items if i.item_group])))
    context.categories = groups
    
    # 4. Global config
    context.currency_symbol = frappe.db.get_default("currency") or "$"
    
    return context
