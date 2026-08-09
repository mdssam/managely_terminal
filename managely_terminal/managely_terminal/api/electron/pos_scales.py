import frappe

@frappe.whitelist()
def get_scales(pos_profile):
    if not pos_profile:
        return frappe.throw("POS Profile is required")
    
    # Fetch scales from the POS Profile child table
    scales = frappe.get_all("POS Profile Scale", 
        filters={"parent": pos_profile, "parenttype": "POS Profile", "parentfield": "custom_scales"},
        fields=["scale_name", "scale_barcode_prefix", "scale_type", "item_code_length", 
                "weight_length", "price_length", "divide_weight_by", "divide_price_by", "default_uom"]
    )
    
    return {
        "success": True,
        "data": scales
    }
