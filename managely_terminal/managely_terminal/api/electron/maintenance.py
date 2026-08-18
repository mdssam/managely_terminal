import frappe

@frappe.whitelist(allow_guest=True)
def wipe_pos_master():
	"""
	Strictly development-only wipe utility for Sultan POS test data.
	Resets POS invoices, sessions, cash transactions, ledger entries, naming series, and POS profile ciphers.
	"""
	site = str(frappe.local.site or "")
	if not ("dev" in site or "localhost" in site or site == "dev15.asr1.online"):
		frappe.throw("Wipe utility is strictly restricted to development environments.")

	wiped_summary = {}

	# 1. POS Transaction Tables
	pos_tables = [
		"tabPOS Invoice Item",
		"tabSales Invoice Payment",
		"tabPOS Invoice",
		"tabPOS Closing Entry Detail",
		"tabPOS Closing Entry Taxes",
		"tabPOS Closing Entry",
		"tabPOS Opening Entry",
		"tabPOS Suspended Transaction Item",
		"tabPOS Suspended Transaction",
		"tabPromotion Request",
		"tabDriver Settlement Invoice",
		"tabDriver Settlement",
		"tabDelivery Company Settlement",
		"tabPOS Cash Transaction Detail",
		"tabPOS Change Breakdown",
	]

	for tbl in pos_tables:
		try:
			clean_dt = tbl.replace("tab", "")
			if frappe.db.table_exists(clean_dt):
				count = frappe.db.sql(f"SELECT COUNT(*) FROM `{tbl}`")[0][0]
				frappe.db.sql(f"DELETE FROM `{tbl}`")
				wiped_summary[clean_dt] = count
		except Exception as e:
			wiped_summary[tbl] = f"Error: {str(e)}"

	# 2. Accounting & Stock Ledgers from POS
	ledger_cleanup = [
		("tabGL Entry", "voucher_type IN ('POS Invoice', 'POS Closing Entry', 'POS Opening Entry', 'Driver Settlement', 'Delivery Company Settlement')"),
		("tabStock Ledger Entry", "voucher_type IN ('POS Invoice')"),
		("tabPayment Ledger Entry", "voucher_type IN ('POS Invoice', 'POS Closing Entry', 'Driver Settlement')"),
	]

	for tbl, cond in ledger_cleanup:
		try:
			clean_dt = tbl.replace("tab", "")
			count = frappe.db.sql(f"SELECT COUNT(*) FROM `{tbl}` WHERE {cond}")[0][0]
			frappe.db.sql(f"DELETE FROM `{tbl}` WHERE {cond}")
			wiped_summary[clean_dt] = count
		except Exception as e:
			wiped_summary[tbl] = f"Error: {str(e)}"

	# 3. Reset Naming Series in tabSeries
	series_patterns = ['CL-%', 'CSH-%', 'OP-%', 'PSINV-%', 'WO-%', 'DS-%', 'DCS-%', 'PR-%', 'SUS-%']
	for pat in series_patterns:
		try:
			frappe.db.sql("UPDATE `tabSeries` SET current = 0 WHERE name LIKE %s", (pat,))
			wiped_summary[f"series_{pat}"] = "Reset to 0"
		except Exception as e:
			wiped_summary[f"series_{pat}"] = f"Error: {str(e)}"

	# 4. Release Device Ciphers from POS Profiles so fresh devices can register
	try:
		frappe.db.sql("UPDATE `tabPOS Profile` SET custom_pos_cipher = NULL")
		wiped_summary["pos_profile_ciphers"] = "Cleared all custom_pos_cipher locks"
	except Exception as e:
		wiped_summary["pos_profile_ciphers"] = f"Error: {str(e)}"

	frappe.db.commit()

	return {
		"success": True,
		"message": "Development POS test data wiped, series reset, and POS profile ciphers cleared successfully.",
		"wiped": wiped_summary
	}
