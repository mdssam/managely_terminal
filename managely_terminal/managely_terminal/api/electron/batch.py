import frappe
from erpnext.stock.doctype.batch.batch import get_batch_qty


@frappe.whitelist()
def get_batch_nos_with_qty(item_code, warehouse=None):
	"""
	Returns batch numbers with available quantities for a given item.
	Primary endpoint: managely_terminal.managely_terminal.api.electron.batch.get_batch_nos_with_qty
	Fallback endpoint (older): managely_terminal.managely_terminal.api.electron.item.get_batch_nos_with_qty
	"""
	if not item_code:
		return []

	if not warehouse:
		try:
			from managely_terminal.managely_terminal.api.electron.pos_profile import get_current_pos_profile
			pos_doc = get_current_pos_profile()
			warehouse = pos_doc.warehouse
		except Exception:
			pass

	if not warehouse:
		return []

	batches = frappe.get_all(
		"Batch",
		filters={"item": item_code},
		fields=["name", "batch_id", "expiry_date"]
	)

	batch_qty_data = []
	for b in batches:
		qty = get_batch_qty(batch_no=b.name, warehouse=warehouse)
		if qty > 0:
			batch_qty_data.append({
				"batch_id": b.batch_id or b.name,
				"qty": qty,
				"expiry_date": str(b.expiry_date) if b.expiry_date else None
			})

	return batch_qty_data
