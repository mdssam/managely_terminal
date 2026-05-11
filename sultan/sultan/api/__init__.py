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
        {"dt": "Work Order", "fieldname": "custom_sales_order", "label": "Source Sales Order", "fieldtype": "Link", "options": "Sales Order", "insert_after": "custom_pos_invoice"},
        {"dt": "Work Order", "fieldname": "custom_sales_invoice", "label": "Source Sales Invoice", "fieldtype": "Link", "options": "Sales Invoice", "insert_after": "custom_sales_order"}
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
            "custom_sales_invoice": doc.name if doc.doctype == "Sales Invoice" else None,
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


@frappe.whitelist()
def create_instant_work_order(item_code, qty=1, custom_ingredients=None, **kwargs):
    """
    Creates an instant Work Order for an item directly from UI interaction.
    Expects custom_ingredients to be a JSON string or list of modifications.
    """
    from frappe.utils import now_datetime
    
    # Get active BOM for the item
    bom_no = frappe.db.get_value("BOM", {"item": item_code, "is_active": 1, "docstatus": 1})
    if not bom_no:
        frappe.throw(_("No active BOM found for item {0}").format(item_code))
        
    # Get some reasonable defaults for warehouse (company default)
    # Resilient warehouse resolution
    default_company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
    
    wip_wh = frappe.db.get_single_value("Manufacturing Settings", "default_wip_warehouse")
    
    # Fallback approach for finished goods warehouse
    fg_wh = None
    
    # Try 1: Get any valid retail or finished good warehouse from database
    wh_res = frappe.get_all("Warehouse", filters={"is_group": 0, "company": default_company}, fields=["name"], limit=1)
    if wh_res:
        fg_wh = wh_res[0].name
        
    if not wip_wh:
        wip_wh = fg_wh
        
    if not fg_wh:
        frappe.throw(_("No valid warehouse found for company {0}. Please configure a default warehouse.").format(default_company))
    
    # Create a new Work Order
    wo = frappe.get_doc({
        "doctype": "Work Order",
        "production_item": item_code,
        "bom_no": bom_no,
        "qty": flt(qty),
        "wip_warehouse": wip_wh or fg_wh,
        "fg_warehouse": fg_wh,
        "company": default_company,
        "planned_start_date": now_datetime(),
    })
    
    wo.insert(ignore_permissions=True)
    
    if custom_ingredients:
        apply_custom_ingredients(wo, custom_ingredients)
        
    try:
        wo.submit()
        return {"status": "success", "name": wo.name}
    except Exception as e:
        frappe.log_error(f"Instant Work Order Error for {item_code}: {str(e)}")
        return {"status": "error", "message": str(e)}

@frappe.whitelist()
def get_item_bom_ingredients(item_code):
    """
    Retrieves the ingredients list from the active BOM for an item.
    """
    bom_no = frappe.db.get_value("BOM", {"item": item_code, "is_active": 1, "docstatus": 1})
    if not bom_no:
        return []
        
    ingredients = frappe.db.get_all("BOM Item", 
        filters={"parent": bom_no},
        fields=["item_code", "item_name", "qty_consumed_per_unit as qty", "uom", "rate"]
    )
    return ingredients

@frappe.whitelist()
def get_batch_nos_with_qty(item_code, warehouse=None):
    """
    Returns a list of dicts with batch numbers, actual quantities, and expiry dates
    for a given item code and warehouse.
    """
    from erpnext.stock.doctype.batch.batch import get_batch_qty
    
    if not warehouse:
        # Fallback: avoid direct DB column lookup which fails in this install
        default_company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
        warehouse = frappe.db.get_value("Warehouse", {"company": default_company, "is_group": 0}, "name")

    if not item_code or not warehouse:
        return []

    batches = frappe.get_all("Batch", 
        filters={"item": item_code, "disabled": 0}, 
        fields=["name", "batch_id", "expiry_date"]
    )

    batch_qty_data = []
    for b in batches:
        qty = get_batch_qty(batch_no=b.name, warehouse=warehouse)
        if qty > 0:
            batch_qty_data.append({
                "batch_id": b.batch_id or b.name, 
                "qty": qty,
                "expiry_date": b.expiry_date
            })

    return batch_qty_data

@frappe.whitelist()
def get_daily_throughput(days=30):
    """
    Aggregates manufacturing throughput (completed work orders and produced quantities)
    grouped by day over the last X days.
    """
    from frappe.utils import add_days, today
    
    start_date = add_days(today(), -int(days))
    
    # Query Work Orders created in that period that are not cancelled
    data = frappe.db.sql("""
        SELECT 
            DATE(creation) as date,
            SUM(produced_qty) as total_qty,
            COUNT(name) as total_orders
        FROM `tabWork Order`
        WHERE creation >= %s AND docstatus < 2
        GROUP BY DATE(creation)
        ORDER BY DATE(creation) ASC
    """, (start_date,), as_dict=True)
    
    # Also fetch breakdown by top 5 produced items overall in this period
    items = frappe.db.sql("""
        SELECT 
            item_code,
            SUM(produced_qty) as qty
        FROM `tabWork Order`
        WHERE creation >= %s AND docstatus < 2
        GROUP BY item_code
        ORDER BY qty DESC
        LIMIT 5
    """, (start_date,), as_dict=True)
    
    return {
        "daily_trends": data,
        "top_produced_items": items
    }

def fix_invoice_items_valuation(doc, method=None):
    """
    Hook executed before save/submit to bypass rigid accounting blocks for 
    new items by dynamically enabling 'Allow Zero Valuation Rate'.
    """
    has_changes = False
    for item in doc.get("items"):
        # If it hasn't established a valuation yet, permit the system to generate accounting entry at zero
        if not item.allow_zero_valuation_rate:
            item.allow_zero_valuation_rate = 1
            has_changes = True
            
    # No explicit doc.save() needed since it runs inside the validate transaction


@frappe.whitelist()
def get_work_orders_for_pos_invoice(invoice_name):
    """
    Returns all Work Orders created for a given invoice (POS Invoice or Sales Invoice).
    Called from the POS frontend after payment is completed.
    """
    if not invoice_name:
        return []

    work_orders = frappe.db.sql("""
        SELECT name, production_item, qty, status, planned_start_date
        FROM `tabWork Order`
        WHERE custom_pos_invoice = %(name)s
           OR custom_sales_invoice = %(name)s
        ORDER BY creation ASC
    """, {"name": invoice_name}, as_dict=True)

    return work_orders


def _resolve_invoice(invoice_name):
    """Return (doctype, doc) trying POS Invoice then Sales Invoice."""
    for doctype in ("POS Invoice", "Sales Invoice"):
        if frappe.db.exists(doctype, invoice_name):
            return doctype, frappe.get_doc(doctype, invoice_name)
    return None, None


@frappe.whitelist()
def get_invoice_for_cashier(invoice_name):
    """
    Fetches a POS Invoice or Sales Invoice for the Cashier Terminal.
    Auto-detects the doctype from the invoice name.
    """
    if not invoice_name:
        frappe.throw(_("Invoice name is required"))

    doctype, inv = _resolve_invoice(invoice_name)
    if not inv:
        return {"success": False, "message": _("Invoice not found: {0}").format(invoice_name)}

    items = []
    for item in inv.items:
        items.append({
            "item_code": item.item_code,
            "item_name": item.item_name,
            "qty": item.qty,
            "rate": item.rate,
            "amount": item.amount,
        })

    return {
        "success": True,
        "invoice": {
            "name": inv.name,
            "doctype": doctype,
            "customer": inv.customer,
            "customer_name": inv.customer_name,
            "grand_total": inv.grand_total,
            "outstanding_amount": inv.outstanding_amount,
            "docstatus": inv.docstatus,
            "status": inv.status,
            "posting_date": str(inv.posting_date),
            "currency": inv.currency,
            "currency_symbol": frappe.db.get_value("Currency", inv.currency, "symbol") or "",
            "items": items,
        }
    }


@frappe.whitelist()
def pay_draft_invoice(invoice_name, mode_of_payment, amount=None):
    """
    Collects payment on a draft POS Invoice or Sales Invoice and submits it.
    Called from the Cashier Terminal PaymentPage.
    """
    if not invoice_name or not mode_of_payment:
        frappe.throw(_("Invoice name and mode of payment are required"))

    doctype, inv = _resolve_invoice(invoice_name)
    if not inv:
        frappe.throw(_("Invoice not found: {0}").format(invoice_name))

    if inv.docstatus != 0:
        frappe.throw(_("Invoice {0} is not a draft — it may already be paid.").format(invoice_name))

    pay_amount = flt(amount) if amount else inv.grand_total

    inv.set("payments", [])
    inv.append("payments", {
        "mode_of_payment": mode_of_payment,
        "amount": pay_amount,
    })

    inv.paid_amount = pay_amount
    inv.outstanding_amount = flt(inv.grand_total) - pay_amount

    inv.save(ignore_permissions=True)

    try:
        inv.submit()
        return {"success": True, "invoice": inv.name, "doctype": doctype, "status": "Paid"}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Cashier Pay Invoice Error")
        return {"success": False, "message": str(e)}
