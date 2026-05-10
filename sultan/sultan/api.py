import frappe
from frappe import _
from frappe.utils import flt, getdate, add_days

@frappe.whitelist()
def setup_custom_fields():
    """
    Bootstraps all required custom fields in ERPNext for Sultan customizations.
    Run via console or bench: bench execute sultan.sultan.api.setup_custom_fields
    """
    fields = [
        {"dt": "Item", "fieldname": "is_fresh_produce", "label": "Is Fresh Produce", "fieldtype": "Check", "insert_after": "allow_negative_stock"},
        {"dt": "Item", "fieldname": "supports_weight_price", "label": "Supports Weight Price", "fieldtype": "Check", "insert_after": "is_fresh_produce"},
        {"dt": "POS Invoice Item", "fieldname": "custom_ingredients", "label": "Custom Ingredients", "fieldtype": "Small Text", "insert_after": "item_code"},
        {"dt": "Sales Order Item", "fieldname": "custom_ingredients", "label": "Custom Ingredients", "fieldtype": "Small Text", "insert_after": "item_code"},
        {"dt": "Work Order", "fieldname": "custom_pos_invoice", "label": "Source POS Invoice", "fieldtype": "Link", "options": "POS Invoice", "insert_after": "sales_order"},
        {"dt": "Work Order", "fieldname": "custom_sales_order", "label": "Source Sales Order", "fieldtype": "Link", "options": "Sales Order", "insert_after": "custom_pos_invoice"}
    ]
    
    count = 0
    for f in fields:
        if not frappe.db.exists("Custom Field", {"dt": f["dt"], "fieldname": f["fieldname"]}):
            doc = frappe.new_doc("Custom Field")
            doc.update(f)
            doc.insert(ignore_permissions=True)
            count += 1
            
    frappe.db.commit()
    return f"Created {count} custom fields successfully!"

@frappe.whitelist()
def generate_production_order(doc, method=None):
    """
    Called via hooks on POS Invoice or Sales Order submission.
    Loops through items and creates an instant Work Order for fresh items.
    """
    for item in doc.items:
        # Check if item is marked as fresh produce / needs instant manufacturing
        is_fresh_produce = frappe.db.get_value("Item", item.item_code, "is_fresh_produce")
        if not is_fresh_produce:
            continue
            
        # Get active BOM for the item
        bom_no = frappe.db.get_value("BOM", {"item": item.item_code, "is_active": 1, "docstatus": 1})
        if not bom_no:
            frappe.log_error(f"No active BOM found for item {item.item_code}", "Sultan Manufacturing")
            continue
            
        # Create a new Work Order
        wo = frappe.get_doc({
            "doctype": "Work Order",
            "production_item": item.item_code,
            "bom_no": bom_no,
            "qty": item.qty,
            "source_warehouse": item.warehouse or doc.set_warehouse,
            "wip_warehouse": doc.get("wip_warehouse") or frappe.db.get_single_value("Manufacturing Settings", "default_wip_warehouse") or (item.warehouse or doc.set_warehouse),
            "fg_warehouse": item.warehouse or doc.set_warehouse,
            "company": doc.company,
            "planned_start_date": frappe.utils.now_datetime(),
            "custom_pos_invoice": doc.name if doc.doctype == "POS Invoice" else None,
            "custom_sales_order": doc.name if doc.doctype == "Sales Order" else None,
        })
        
        # Save Work Order to generate standard required items child table
        wo.insert(ignore_permissions=True)
        
        # Check if there are customized ingredient modifiers
        custom_ingredients = item.get("custom_ingredients")  # JSON string or custom child table
        if custom_ingredients:
            apply_custom_ingredients(wo, custom_ingredients)
            
        # Submit Work Order so it is instantly queued in the kitchen/production station
        try:
            wo.submit()
            from frappe.utils import get_link_to_form
            frappe.msgprint(
                msg=f"✅ Work Order has been dispatched to the kitchen!<br><br><strong>{get_link_to_form('Work Order', wo.name)}</strong>",
                title="Manufacturing Initiated",
                indicator="green"
            )
        except Exception as e:
            frappe.log_error(f"Failed to submit Work Order for {item.item_code}: {str(e)}", "Sultan Manufacturing")

def apply_custom_ingredients(wo, custom_ingredients_data):
    """
    Modifies the Work Order's required items child table based on POS customizations.
    custom_ingredients_data can be a JSON like:
    [
        {"item_code": "Cheese", "action": "add", "qty": 0.05},
        {"item_code": "Onion", "action": "remove"}
    ]
    """
    import json
    if isinstance(custom_ingredients_data, str):
        try:
            modifiers = json.loads(custom_ingredients_data)
        except Exception:
            return
    else:
        modifiers = custom_ingredients_data

    # Ensure required items are fully calculated and available
    wo.set_required_items()
    
    required_items_map = {d.item_code: d for d in wo.required_items}
    
    for mod in modifiers:
        item_code = mod.get("item_code")
        action = mod.get("action")
        qty = flt(mod.get("qty") or 1.0) # Default to 1.0 if not explicitly defined
        
        if action == "remove":
            # Remove or set quantity to 0
            if item_code in required_items_map:
                wo.remove(required_items_map[item_code])
        elif action == "add":
            if item_code in required_items_map:
                # Add extra quantity to existing ingredient
                required_items_map[item_code].required_qty += qty
            else:
                # Append a new raw material/ingredient
                wo.append("required_items", {
                    "item_code": item_code,
                    "required_qty": qty,
                    "source_warehouse": wo.source_warehouse
                })
                
    wo.save(ignore_permissions=True)


@frappe.whitelist()
def parse_sultan_barcode(barcode):
    """
    Parses complex barcodes containing batch, expiry, and weight.
    Supports:
    1. Custom delimiter: ITEM_CODE|BATCH|EXPIRY_DATE|WEIGHT
    2. Standard GS1-128 parsed formats.
    """
    if not barcode:
        return {"status": "error", "message": "Empty barcode"}
        
    # 1. Custom Delimited format parsing
    if "|" in barcode:
        parts = barcode.split("|")
        if len(parts) >= 1:
            item_code = parts[0]
            batch_no = parts[1] if len(parts) > 1 else None
            expiry = parts[2] if len(parts) > 2 else None
            weight = flt(parts[3]) if len(parts) > 3 else 1.0
            
            # Fetch item price
            price = get_item_price(item_code, weight)
            
            return {
                "status": "success",
                "item_code": item_code,
                "batch_no": batch_no,
                "expiry": expiry,
                "weight": weight,
                "price": price
            }
            
    # 2. Simple fallback: standard barcode search
    item_code = frappe.db.get_value("Barcode", {"barcode": barcode}, "parent")
    if item_code:
        return {
            "status": "success",
            "item_code": item_code,
            "price": get_item_price(item_code, 1.0)
        }
        
    return {"status": "error", "message": _("Barcode not found or unrecognized")}


def get_item_price(item_code, weight=1.0):
    """
    Calculates item price, supporting weight-based calculation if enabled on the Item.
    """
    supports_weight_price = frappe.db.get_value("Item", item_code, "supports_weight_price")
    
    # Fetch price from standard selling price list
    price_list_rate = frappe.db.get_value("Item Price", {"item_code": item_code, "price_list": "Standard Selling"}, "price_list_rate") or 0.0
    
    if supports_weight_price and weight > 0:
        return flt(price_list_rate * weight)
    return flt(price_list_rate)


@frappe.whitelist()
def get_pending_orders_for_cashier():
    """
    Fetch all unpaid/draft Orders or Sales Orders to display on the Cashier Station.
    """
    return frappe.db.get_all("Sales Order", 
        filters={"docstatus": 0, "status": "Draft"}, 
        fields=["name", "customer", "grand_total", "transaction_date"]
    )

def check_batch_expiry():
    """
    Scheduled daily task to find batches expiring soon and trigger system alerts.
    """
    # Configuration: Warn 7 days before expiry
    warning_days = frappe.db.get_single_value("Stock Settings", "expiry_warning_days") or 7
    warning_date = add_days(frappe.utils.nowdate(), warning_days)
    
    expiring_batches = frappe.db.get_all("Batch", 
        filters={
            "expiry_date": ["<=", warning_date],
            "expiry_date": [">=", frappe.utils.nowdate()],
            "disabled": 0
        },
        fields=["name", "item_code", "expiry_date"]
    )
    
    if not expiring_batches:
        return
        
    for batch in expiring_batches:
        # Check if there is actually stock available for this expiring batch
        actual_qty = frappe.db.sql("""
            SELECT sum(actual_qty) FROM tabBin 
            WHERE item_code=%s AND name IN (SELECT parent FROM `tabBatch` WHERE name=%s)
        """, (batch.item_code, batch.name))
        
        # Create a standard frappe Notification / Log for system admins
        subject = f"⚠️ Expiry Warning: Batch {batch.name} of {batch.item_code} expires on {batch.expiry_date}"
        
        # Post an urgent direct system notification to all System Managers
        frappe.get_doc({
            "doctype": "Notification Log",
            "for_user": "Administrator", # In production iterate through active users
            "subject": subject,
            "type": "Alert",
            "email_content": f"Immediate action required: {subject}",
            "document_type": "Batch",
            "document_name": batch.name
        }).insert(ignore_permissions=True)
        
        # Also create an error log record for audit persistence
        frappe.log_error(message=subject, title="Sultan Batch Expiry Alert")

    frappe.db.commit()
