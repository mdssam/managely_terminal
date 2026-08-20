import frappe
from frappe import _


def create_delivery_note_from_sales_invoice(doc, method=None):
    if doc.doctype != "Sales Invoice" or doc.docstatus != 1:
        return
    if getattr(doc, "is_pos", 0):
        return
    if not _has_stock_items(doc.items):
        return

    # When invoice already updates stock (update_stock=1), create a Draft DN for
    # tracking/printing only — don't submit, as stock was already deducted by the invoice.
    # When update_stock=0, submit the DN so it handles the stock deduction.
    submit_dn = not doc.update_stock

    if doc.is_return:
        _create_return_delivery_note(doc, submit_dn=submit_dn)
    else:
        _create_forward_delivery_note(doc, submit_dn=submit_dn)


def _create_forward_delivery_note(doc, submit_dn=True):
    if _linked_submitted_doc_exists("Delivery Note Item", "against_sales_invoice", doc.name):
        return
    try:
        from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_delivery_note

        dn = make_delivery_note(doc.name)
        if not dn.get("items"):
            return

        target_wh = doc.set_warehouse
        if target_wh:
            for row in dn.items:
                row.warehouse = target_wh
            dn.set_warehouse = target_wh

        dn.flags.ignore_permissions = True
        dn.insert(ignore_permissions=True)
        if submit_dn:
            dn.flags.ignore_permissions = True
            dn.submit()
    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            _("Auto Delivery Note failed for Sales Invoice {0}").format(doc.name),
        )


def _create_return_delivery_note(doc, submit_dn=True):
    """Create a return Delivery Note when a Sales Return invoice is submitted."""
    original_invoice = doc.return_against
    if not original_invoice:
        return

    original_dn = frappe.db.get_value(
        "Delivery Note Item", {"against_sales_invoice": original_invoice, "docstatus": 1}, "parent"
    )
    if not original_dn:
        return

    if _linked_submitted_doc_exists("Delivery Note Item", "against_sales_invoice", doc.name):
        return

    try:
        from erpnext.controllers.sales_and_purchase_return import make_return_doc

        return_dn = make_return_doc("Delivery Note", original_dn)
        if not return_dn.get("items"):
            return

        target_wh = doc.set_warehouse
        for row in return_dn.items:
            row.qty = -abs(
                next(
                    (i.qty for i in doc.items if i.item_code == row.item_code),
                    abs(row.qty),
                )
            )
            if target_wh:
                row.warehouse = target_wh

        return_dn.flags.ignore_permissions = True
        return_dn.insert(ignore_permissions=True)
        if submit_dn:
            return_dn.flags.ignore_permissions = True
            return_dn.submit()
    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            _("Auto Return Delivery Note failed for Sales Return {0}").format(doc.name),
        )


def create_purchase_receipt_from_purchase_invoice(doc, method=None):
    if doc.doctype != "Purchase Invoice" or doc.docstatus != 1 or doc.update_stock:
        return
    if not _has_stock_items(doc.items):
        return

    if doc.is_return:
        _create_return_purchase_receipt(doc)
    else:
        _create_forward_purchase_receipt(doc)


def _create_forward_purchase_receipt(doc):
    if _linked_submitted_doc_exists("Purchase Receipt Item", "purchase_invoice", doc.name):
        return
    try:
        from erpnext.accounts.doctype.purchase_invoice.purchase_invoice import make_purchase_receipt

        pr = make_purchase_receipt(doc.name)
        if not pr.get("items"):
            return

        target_wh = doc.set_warehouse
        if target_wh:
            for row in pr.items:
                row.warehouse = target_wh
            pr.set_warehouse = target_wh

        pr.flags.ignore_permissions = True
        pr.insert(ignore_permissions=True)
        pr.flags.ignore_permissions = True
        pr.submit()
    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            _("Auto Purchase Receipt failed for Purchase Invoice {0}").format(doc.name),
        )


def _create_return_purchase_receipt(doc):
    """Create a return Purchase Receipt when a Purchase Return invoice is submitted."""
    original_invoice = doc.return_against
    if not original_invoice:
        return

    original_pr = frappe.db.get_value(
        "Purchase Receipt Item", {"purchase_invoice": original_invoice, "docstatus": 1}, "parent"
    )
    if not original_pr:
        return

    if _linked_submitted_doc_exists("Purchase Receipt Item", "purchase_invoice", doc.name):
        return

    try:
        from erpnext.controllers.sales_and_purchase_return import make_return_doc

        return_pr = make_return_doc("Purchase Receipt", original_pr)
        if not return_pr.get("items"):
            return

        target_wh = doc.set_warehouse
        for row in return_pr.items:
            row.qty = -abs(
                next(
                    (i.qty for i in doc.items if i.item_code == row.item_code),
                    abs(row.qty),
                )
            )
            if target_wh:
                row.warehouse = target_wh

        return_pr.flags.ignore_permissions = True
        return_pr.insert(ignore_permissions=True)
        return_pr.flags.ignore_permissions = True
        return_pr.submit()
    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            _("Auto Return Purchase Receipt failed for Purchase Return {0}").format(doc.name),
        )


def validate_target_warehouse(doc, method=None):
    """Block submission if Source Warehouse is empty and the invoice has stock items."""
    if not _has_stock_items(doc.items):
        return
    if not doc.set_warehouse:
        frappe.throw(
            _("Please set the <b>Source Warehouse</b> before submitting. "
              "It is required to generate the automatic Delivery Note / Purchase Receipt."),
            title=_("Source Warehouse Required"),
        )


def _has_stock_items(items):
    item_codes = {row.item_code for row in items if row.get("item_code")}
    if not item_codes:
        return False
    return bool(
        frappe.get_all(
            "Item",
            filters={"name": ["in", list(item_codes)], "is_stock_item": 1},
            limit=1,
        )
    )


def _linked_submitted_doc_exists(child_doctype, link_field, voucher_name):
    rows = frappe.get_all(
        child_doctype,
        filters={link_field: voucher_name, "docstatus": 1},
        fields=["parent", "parenttype"],
        limit=1,
    )
    return bool(rows)


@frappe.whitelist()
def get_items_for_stock_reconciliation(
    warehouse, posting_date, posting_time, company, item_code=None, item_group=None, ignore_empty_stock=False
):
    from erpnext.stock.doctype.stock_reconciliation.stock_reconciliation import (
        get_item_and_warehouses,
        get_itemwise_batch,
        get_item_data,
    )
    from erpnext.stock.utils import get_stock_balance
    from frappe.utils import cint

    ignore_empty_stock = cint(ignore_empty_stock)
    items = []
    if item_code and warehouse:
        items = get_item_and_warehouses(item_code, warehouse)

    if not item_code:
        items = get_reconciliation_items(warehouse, company, item_group=item_group)

    res = []
    itemwise_batch_data = get_itemwise_batch(warehouse, posting_date, company, item_code)

    for d in items:
        if (d.item_code, d.warehouse) in itemwise_batch_data:
            valuation_rate = get_stock_balance(
                d.item_code, d.warehouse, posting_date, posting_time, with_valuation_rate=True
            )[1]

            for row in itemwise_batch_data.get((d.item_code, d.warehouse)):
                if ignore_empty_stock and not row.qty:
                    continue

                args = get_item_data(row, row.qty, valuation_rate)
                res.append(args)
        else:
            stock_bal = get_stock_balance(
                d.item_code,
                d.warehouse,
                posting_date,
                posting_time,
                with_valuation_rate=True,
                with_serial_no=cint(d.has_serial_no),
            )
            qty, valuation_rate, serial_no = (
                stock_bal[0],
                stock_bal[1],
                stock_bal[2] if cint(d.has_serial_no) else "",
            )

            if ignore_empty_stock and not stock_bal[0]:
				continue

            args = get_item_data(d, qty, valuation_rate, serial_no)
            res.append(args)

    return res


def get_reconciliation_items(warehouse, company, item_group=None):
    lft, rgt = frappe.db.get_value("Warehouse", warehouse, ["lft", "rgt"]) or (0, 0)

    item_group_condition = ""
    if item_group:
        ig_lft, ig_rgt = frappe.db.get_value("Item Group", item_group, ["lft", "rgt"]) or (None, None)
        if ig_lft and ig_rgt:
            item_group_condition = f"""
                and i.item_group in (
                    select name from `tabItem Group` where lft >= {ig_lft} and rgt <= {ig_rgt}
                )
            """
        else:
            item_group_condition = f"and i.item_group = {frappe.db.escape(item_group)}"

    items = frappe.db.sql(
        f"""
        select
            i.name as item_code, i.item_name, bin.warehouse as warehouse, i.has_serial_no, i.has_batch_no
        from
            `tabBin` bin, `tabItem` i
        where
            i.name = bin.item_code
            and IFNULL(i.disabled, 0) = 0
            and i.is_stock_item = 1
            and i.has_variants = 0
            {item_group_condition}
            and exists(
                select name from `tabWarehouse` where lft >= {lft} and rgt <= {rgt} and name = bin.warehouse and is_group = 0
            )
    """,
        as_dict=1,
    )

    items += frappe.db.sql(
        f"""
        select
            i.name as item_code, i.item_name, id.default_warehouse as warehouse, i.has_serial_no, i.has_batch_no
        from
            `tabItem` i, `tabItem Default` id
        where
            i.name = id.parent
            and exists(
                select name from `tabWarehouse` where lft >= %s and rgt <= %s and name=id.default_warehouse and is_group = 0
            )
            and i.is_stock_item = 1
            and i.has_variants = 0
            and IFNULL(i.disabled, 0) = 0
            {item_group_condition}
            and id.company = %s
        group by i.name
    """,
        (lft, rgt, company),
        as_dict=1,
    )

    iw_keys = set()
    deduped_items = []
    for item in items:
        key = (item.item_code, item.warehouse)
        if key not in iw_keys:
            iw_keys.add(key)
            deduped_items.append(item)

    return deduped_items

