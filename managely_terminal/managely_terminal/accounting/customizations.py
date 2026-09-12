import re

import frappe
from frappe import _
from frappe.utils import flt


TRANSACTION_DOCTYPES = ("Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry")


def setup_custom_fields():
	"""Create/update terminal accounting custom fields."""
	si_parent = _transaction_parent_fields("Sales Invoice", "customer")
	pi_parent = _transaction_parent_fields("Purchase Invoice", "bill_no", "bill_no")
	pe_parent = _transaction_parent_fields("Payment Entry", "party", "paid_to_account_currency")
	je_parent = _transaction_parent_fields("Journal Entry", "user_remark", "user_remark")

	fields = (
		si_parent
		+ pi_parent
		+ [
			{
				"dt": "Company",
				"fieldname": "custom_secondary_currency",
				"label": "Secondary Currency",
				"fieldtype": "Link",
				"options": "Currency",
				"insert_after": "default_currency",
				"description": "Secondary operating or reporting currency for dual-currency transactions.",
			},
			{
				"dt": "Purchase Invoice",
				"fieldname": "custom_supplier_invoice_number",
				"label": "Supplier Invoice Number",
				"fieldtype": "Data",
				"insert_after": "bill_no",
			},
			{
				"dt": "Sales Invoice",
				"fieldname": "custom_stamps_auto_inserted",
				"label": "Stamps Auto Inserted",
				"fieldtype": "Check",
				"insert_after": "taxes_and_charges",
				"hidden": 1,
			},
			{
				"dt": "Purchase Invoice",
				"fieldname": "custom_stamps_auto_inserted",
				"label": "Stamps Auto Inserted",
				"fieldtype": "Check",
				"insert_after": "taxes_and_charges",
				"hidden": 1,
			},
		]
		+ pe_parent
		+ je_parent
		+ _dual_currency_child_fields("Sales Invoice Item", "amount")
		+ _dual_currency_child_fields("Purchase Invoice Item", "amount")
		+ _dual_currency_child_fields("Payment Entry Reference", "allocated_amount")
		+ _dual_currency_child_fields("Journal Entry Account", "credit_in_account_currency")
		+ _dual_currency_parent_total_fields("Sales Invoice", "base_grand_total")
		+ _dual_currency_parent_total_fields("Purchase Invoice", "base_grand_total")
		+ _dual_currency_parent_total_fields("Payment Entry", "base_received_amount")
		+ _dual_currency_parent_total_fields("Journal Entry", "total_credit")
		+ _stamp_tax_fields()
	)

	count = 0
	for f in fields:
		cf_name = frappe.db.get_value("Custom Field", {"dt": f["dt"], "fieldname": f["fieldname"]})
		if not cf_name:
			doc = frappe.new_doc("Custom Field")
			doc.update(f)
			doc.flags.ignore_permissions = True
			doc.insert(ignore_permissions=True)
			count += 1
		else:
			update_data = {k: v for k, v in f.items() if k in (
				"insert_after", "reqd", "bold", "hidden", "description", "label",
				"depends_on", "mandatory_depends_on", "precision", "options",
			)}
			if "precision" not in f:
				update_data["precision"] = None
			if update_data:
				frappe.db.set_value("Custom Field", cf_name, update_data)

	# Delete the old custom_target_warehouse field if it still exists — we now use
	# the native set_warehouse field made visible/mandatory via Property Setters below.
	for dt in ("Sales Invoice", "Purchase Invoice"):
		cf = frappe.db.get_value("Custom Field", {"dt": dt, "fieldname": "custom_target_warehouse"})
		if cf:
			frappe.delete_doc("Custom Field", cf, ignore_permissions=True)

	# Make the native set_warehouse field always visible and mandatory on both invoice types.
	# Standard ERPNext hides it behind depends_on:"update_stock"; we clear that here.
	for dt in ("Sales Invoice", "Purchase Invoice"):
		_ensure_property_setter(dt, "set_warehouse", "depends_on", "", "Code")
		_ensure_property_setter(dt, "set_warehouse", "mandatory_depends_on", "", "Code")
		_ensure_property_setter(dt, "set_warehouse", "reqd", "1", "Check")
		_ensure_property_setter(dt, "set_warehouse", "bold", "1", "Check")


	_sync_multi_currency_payment_docfields()

	frappe.db.commit()
	frappe.clear_cache()
	return f"Created/updated {count} accounting custom fields."


def _sync_multi_currency_payment_docfields():
	mcp_fields = [
		("Multi Currency Payment", "total_payments", "Total Payments", "Company:company:default_currency", 0),
		("Multi Currency Payment", "total_references", "Total Allocated Amount", "Company:company:default_currency", 0),
		("Multi Currency Payment", "unallocated_amount", "Unallocated / Advance Amount", "Company:company:default_currency", 0),
		("Multi Currency Payment", "total_usd", "Total", "Company:company:default_currency", 0),
		("Multi Currency Payment", "total_lbp", "Total", "Company:company:custom_secondary_currency", 0),
		("Multi Currency Payment", "total_company_amount", "Total", "Company:company:default_currency", 1),
		("Multi Currency Payment Line", "amount_base_currency", "Amount", "Company:company:default_currency", 0),
		("Multi Currency Payment Line", "amount_usd", "Amount", "Company:company:default_currency", 1),
		("Multi Currency Payment Line", "amount_lbp", "Amount", "Company:company:custom_secondary_currency", 1),
		("Multi Currency Payment Reference", "total_amount", "Grand Total", "Company:company:default_currency", 0),
		("Multi Currency Payment Reference", "outstanding_amount", "Outstanding", "Company:company:default_currency", 0),
		("Multi Currency Payment Reference", "allocated_amount", "Allocated", "Company:company:default_currency", 0),
	]
	for parent, fname, label, options, hidden in mcp_fields:
		frappe.db.sql(
			"""
			UPDATE `tabDocField`
			SET `label` = %s, `options` = %s, `hidden` = %s
			WHERE `parent` = %s AND `fieldname` = %s
			""",
			(label, options, hidden, parent, fname),
		)


def _ensure_property_setter(dt, field, prop, value, prop_type="Data"):
	existing = frappe.db.get_value(
		"Property Setter",
		{"doc_type": dt, "field_name": field, "property": prop},
		"name",
	)
	if existing:
		frappe.db.set_value("Property Setter", existing, "value", str(value))
	else:
		ps = frappe.new_doc("Property Setter")
		ps.doctype_or_field = "DocField"
		ps.doc_type = dt
		ps.field_name = field
		ps.property = prop
		ps.value = str(value)
		ps.property_type = prop_type
		ps.flags.ignore_permissions = True
		ps.insert(ignore_permissions=True)


def _stamp_tax_fields():
	"""Custom fields for stamp tax on tax child tables."""
	fields = []
	for dt in ("Sales Taxes and Charges", "Purchase Taxes and Charges"):
		fields += [
			{
				"dt": dt,
				"fieldname": "custom_is_stamp",
				"label": "Is Stamp",
				"fieldtype": "Check",
				"insert_after": "description",
				"in_list_view": 1,
			},
			{
				"dt": dt,
				"fieldname": "custom_stamp_amount_lbp",
				"label": "Stamp Amount (Secondary Currency)",
				"fieldtype": "Currency",
				"options": "Company:company:custom_secondary_currency",
				"insert_after": "custom_is_stamp",
				"depends_on": "eval:doc.custom_is_stamp",
				"mandatory_depends_on": "eval:doc.custom_is_stamp",
			},
		]
	return fields


def _apply_stamp_taxes(doc):
	"""Force stamp-marked tax rows to Actual type with the correct secondary-currency-derived amount."""
	if not doc.get("taxes") or not doc.get("company"):
		return
	secondary_currency = get_company_secondary_currency(doc.company)
	if not secondary_currency:
		return

	exchange_rate = flt(getattr(doc, "custom_exchange_rate_override", None))
	if not exchange_rate:
		exchange_rate = get_company_dual_rate(doc.company, doc.get("posting_date") or doc.get("transaction_date"))
	if not exchange_rate:
		return

	currency = getattr(doc, "currency", None) or ""

	for tax in doc.taxes:
		if not (tax.get("custom_is_stamp") and flt(tax.get("custom_stamp_amount_lbp"))):
			continue
		stamp_amount = flt(tax.custom_stamp_amount_lbp)
		tax.charge_type = "Actual"
		tax.rate = 0
		if currency == secondary_currency:
			tax.tax_amount = stamp_amount
		else:
			tax.tax_amount = flt(stamp_amount / exchange_rate) if exchange_rate > 1.0 else flt(stamp_amount * exchange_rate)


def _transaction_parent_fields(dt, insert_after, exchange_insert_after="currency"):
	return [
		{
			"dt": dt,
			"fieldname": "custom_transaction_description",
			"label": "Description",
			"fieldtype": "Small Text",
			"insert_after": insert_after,
		},
		{
			"dt": dt,
			"fieldname": "custom_exchange_rate_override",
			"label": "Exchange Rate Override",
			"fieldtype": "Float",
			"insert_after": exchange_insert_after,
		},
	]


def _dual_currency_child_fields(dt, insert_after):
	return [
		{
			"dt": dt,
			"fieldname": "custom_usd_amount",
			"label": "Amount (Company Currency)",
			"fieldtype": "Currency",
			"options": "Company:company:default_currency",
			"insert_after": insert_after,
			"read_only": 1,
			"in_list_view": 1,
		},
		{
			"dt": dt,
			"fieldname": "custom_lbp_amount",
			"label": "Amount (Secondary Currency)",
			"fieldtype": "Currency",
			"options": "Company:company:custom_secondary_currency",
			"insert_after": "custom_usd_amount",
			"read_only": 1,
			"in_list_view": 1,
		},
	]


def _dual_currency_parent_total_fields(dt, insert_after):
	return [
		{
			"dt": dt,
			"fieldname": "custom_total_usd",
			"label": "Total (Company Currency)",
			"fieldtype": "Currency",
			"options": "Company:company:default_currency",
			"insert_after": insert_after,
			"read_only": 1,
		},
		{
			"dt": dt,
			"fieldname": "custom_total_lbp",
			"label": "Total (Secondary Currency)",
			"fieldtype": "Currency",
			"options": "Company:company:custom_secondary_currency",
			"insert_after": "custom_total_usd",
			"read_only": 1,
		},
	]


def _auto_insert_stamp_taxes(doc):
	"""Automatically append configured stamps to taxes for new Sales/Purchase Invoices."""
	if doc.doctype not in ("Sales Invoice", "Purchase Invoice") or doc.docstatus != 0:
		return

	if not doc.get("company") or not get_company_secondary_currency(doc.company):
		return

	if getattr(doc, "is_return", False):
		return

	# If stamps were already handled (either loaded on UI or auto-inserted on first validation), do not re-add them.
	if doc.get("custom_stamps_auto_inserted"):
		return

	# Only auto-insert if it is a new document (never saved to database yet)
	if not (doc.is_new() or not frappe.db.exists(doc.doctype, doc.name)):
		return

	if getattr(doc.flags, "sultan_stamps_applied", False):
		return
	doc.flags.sultan_stamps_applied = True

	try:
		settings = frappe.get_single("Terminal Settings")
	except Exception:
		return

	if not settings.get("stamps"):
		return

	if not doc.get("taxes"):
		doc.taxes = []

	inserted = False
	for setting in settings.stamps:
		# Check if stamp is already in taxes to avoid duplicates
		exists = any(
			tax.account_head == setting.account and tax.get("custom_is_stamp")
			for tax in doc.taxes
		)
		if not exists:
			tax_row = {
				"charge_type": "Actual",
				"account_head": setting.account,
				"description": setting.stamp_name,
				"custom_is_stamp": 1,
				"custom_stamp_amount_lbp": setting.amount_lbp,
				"rate": 0,
				"tax_amount": 0,
				"category": "Total",
			}
			if doc.doctype == "Purchase Invoice":
				tax_row["add_deduct_tax"] = "Add"
			doc.append("taxes", tax_row)
			inserted = True

	if inserted:
		doc.custom_stamps_auto_inserted = 1


def before_validate_transaction(doc, method=None):
	if doc.doctype not in TRANSACTION_DOCTYPES:
		return

	ensure_exchange_rate(doc)
	_auto_insert_stamp_taxes(doc)
	_apply_stamp_taxes(doc)
	set_dual_currency_amounts(doc)
	copy_transaction_description_to_remarks(doc)

	if doc.doctype == "Payment Entry":
		autofill_payment_entry_amounts(doc)


def before_save_purchase_invoice(doc, method=None):
	validate_duplicate_supplier_invoice(doc)


def get_company_secondary_currency(company):
	"""Return the configured secondary currency for a Company, or None."""
	if not company:
		return None
	try:
		return frappe.get_cached_value("Company", company, "custom_secondary_currency")
	except Exception:
		return None


@frappe.whitelist()
def get_company_currency_config(company=None):
	"""Return company currency configuration: default_currency, custom_secondary_currency, fraction_units, exchange_rate."""
	if not company:
		company = frappe.defaults.get_user_default("Company")
	if not company:
		return {}

	default_currency = frappe.get_cached_value("Company", company, "default_currency")
	secondary_currency = get_company_secondary_currency(company)

	fraction_units = 2
	if secondary_currency:
		try:
			frac = frappe.get_cached_value("Currency", secondary_currency, "fraction_units")
			fraction_units = 0 if frac == 0 else 2
		except Exception:
			pass

	dual_rate = get_company_dual_rate(company) if secondary_currency else None

	return {
		"company": company,
		"default_currency": default_currency,
		"custom_secondary_currency": secondary_currency,
		"fraction_units": fraction_units,
		"exchange_rate": dual_rate,
	}


@frappe.whitelist()
def get_company_dual_rate(company=None, transaction_date=None):
	"""Return exchange rate between company default currency and secondary currency."""
	if not company:
		company = frappe.defaults.get_user_default("Company")
	if not company:
		return None

	default_currency = frappe.get_cached_value("Company", company, "default_currency")
	secondary_currency = get_company_secondary_currency(company)
	if not secondary_currency or not default_currency or default_currency == secondary_currency:
		return None

	# 1. ERPNext standard lookup
	try:
		from erpnext.setup.utils import get_exchange_rate as erpnext_get_exchange_rate
		rate = erpnext_get_exchange_rate(default_currency, secondary_currency, transaction_date)
		if rate and flt(rate) > 0:
			return flt(rate)
	except Exception:
		pass

	# 2. Direct lookup: default_currency -> secondary_currency
	rate = frappe.db.get_value(
		"Currency Exchange",
		{"from_currency": default_currency, "to_currency": secondary_currency},
		"exchange_rate",
		order_by="date desc",
	)
	if rate and flt(rate) > 0:
		return flt(rate)

	# 3. Inverse lookup: secondary_currency -> default_currency
	inv_rate = frappe.db.get_value(
		"Currency Exchange",
		{"from_currency": secondary_currency, "to_currency": default_currency},
		"exchange_rate",
		order_by="date desc",
	)
	if inv_rate and flt(inv_rate) > 0:
		inv_rate = flt(inv_rate)
		if inv_rate < 1.0:
			return 1.0 / inv_rate
		return inv_rate

	return None


@frappe.whitelist()
def get_lbp_usd_rate():
	"""Deprecated legacy alias: dynamically delegates to get_company_dual_rate with zero fallbacks."""
	rate = get_company_dual_rate(None)
	return flt(rate) if rate else None


def ensure_exchange_rate(doc):
	if not doc.get("company"):
		return
	secondary_currency = get_company_secondary_currency(doc.company)
	if not secondary_currency:
		return

	rate = flt(getattr(doc, "custom_exchange_rate_override", None))
	if not rate:
		rate = get_company_dual_rate(doc.company, doc.get("posting_date") or doc.get("transaction_date"))
	if rate:
		doc.custom_exchange_rate_override = rate

	if doc.doctype in ("Sales Invoice", "Purchase Invoice"):
		company_currency = frappe.get_cached_value("Company", doc.company, "default_currency")
		if company_currency and company_currency == secondary_currency and doc.currency and doc.currency != company_currency:
			doc.conversion_rate = rate


def set_dual_currency_amounts(doc):
	company = doc.get("company")
	if not company:
		return
	secondary_currency = get_company_secondary_currency(company)
	if not secondary_currency:
		return

	company_currency = frappe.get_cached_value("Company", company, "default_currency")
	rate = flt(getattr(doc, "custom_exchange_rate_override", None))
	if not rate:
		rate = get_company_dual_rate(company, doc.get("posting_date") or doc.get("transaction_date"))
	if not rate:
		return

	total_usd = 0.0
	total_lbp = 0.0
	total_usd_debit = 0.0
	total_lbp_debit = 0.0
	total_usd_credit = 0.0
	total_lbp_credit = 0.0
	is_je = doc.doctype == "Journal Entry"

	for row in _iter_line_rows(doc):
		line_amount = _get_line_amount(row)
		currency = getattr(row, "account_currency", None) or _get_transaction_currency(doc)
		row_exchange_rate = flt(getattr(row, "exchange_rate", 1.0)) or 1.0
		usd_amount, lbp_amount = _to_dual_currency(
			line_amount, currency, rate, company_currency, row_exchange_rate, secondary_currency=secondary_currency
		)
		row.custom_usd_amount = usd_amount
		row.custom_lbp_amount = lbp_amount
		if is_je:
			is_debit = flt(getattr(row, "debit", 0)) > 0 or flt(getattr(row, "debit_in_account_currency", 0)) > 0
			if is_debit:
				total_usd_debit += usd_amount
				total_lbp_debit += lbp_amount
			else:
				total_usd_credit += usd_amount
				total_lbp_credit += lbp_amount
		else:
			total_usd += usd_amount
			total_lbp += lbp_amount

	if is_je:
		total_usd = total_usd_debit if total_usd_debit > 0 else total_usd_credit
		total_lbp = total_lbp_debit if total_lbp_debit > 0 else total_lbp_credit
	elif doc.doctype in ("Sales Invoice", "Purchase Invoice"):
		final_amount = flt(getattr(doc, "rounded_total", 0)) or flt(getattr(doc, "grand_total", 0))
		currency = doc.currency or company_currency
		total_usd, total_lbp = _to_dual_currency(final_amount, currency, rate, company_currency, secondary_currency=secondary_currency)
	elif doc.doctype == "Payment Entry":
		final_amount = flt(doc.paid_amount) or flt(doc.received_amount)
		currency = (doc.paid_from_account_currency if doc.payment_type == "Pay" else doc.paid_to_account_currency) or _get_transaction_currency(doc)
		if final_amount:
			total_usd, total_lbp = _to_dual_currency(final_amount, currency, rate, company_currency, secondary_currency=secondary_currency)

	# Update parent total fields if present on the doctype
	if frappe.get_meta(doc.doctype).has_field("custom_total_usd"):
		doc.custom_total_usd = total_usd
	if frappe.get_meta(doc.doctype).has_field("custom_total_lbp"):
		frac_units = frappe.get_cached_value("Currency", secondary_currency, "fraction_units")
		doc.custom_total_lbp = round(total_lbp) if frac_units == 0 else round(total_lbp, 2)




def copy_transaction_description_to_remarks(doc):
	description = (getattr(doc, "custom_transaction_description", None) or "").strip()
	if description and hasattr(doc, "remarks") and not (doc.remarks or "").strip():
		doc.remarks = description


def autofill_payment_entry_amounts(doc):
	if doc.payment_type == "Internal Transfer" or not doc.get("references"):
		return

	total = sum(flt(row.allocated_amount) for row in doc.references)
	if total <= 0:
		return

	if not flt(doc.paid_amount):
		doc.paid_amount = total
	if not flt(doc.received_amount):
		doc.received_amount = total


def validate_duplicate_supplier_invoice(doc):
	supplier_invoice_number = (
		getattr(doc, "custom_supplier_invoice_number", None) or getattr(doc, "bill_no", None) or ""
	).strip()
	if not supplier_invoice_number or not doc.supplier:
		return

	duplicate = frappe.db.get_value(
		"Purchase Invoice",
		{
			"supplier": doc.supplier,
			"name": ["!=", doc.name],
			"docstatus": ["<", 2],
			"custom_supplier_invoice_number": supplier_invoice_number,
		},
		"name",
	)
	if not duplicate:
		duplicate = frappe.db.get_value(
			"Purchase Invoice",
			{
				"supplier": doc.supplier,
				"name": ["!=", doc.name],
				"docstatus": ["<", 2],
				"bill_no": supplier_invoice_number,
			},
			"name",
		)

	if duplicate:
		frappe.throw(
			_("Supplier Invoice Number {0} is already recorded for supplier {1} in Purchase Invoice {2}.").format(
				frappe.bold(supplier_invoice_number), frappe.bold(doc.supplier), frappe.bold(duplicate)
			),
			title=_("Duplicate Supplier Invoice"),
		)


def autonumber_child_account(doc, method=None):
	if not doc.parent_account or doc.account_number:
		return

	parent_number = frappe.db.get_value("Account", doc.parent_account, "account_number")
	if not parent_number:
		return

	doc.account_number = get_next_child_account_number(doc.parent_account, parent_number)


def get_next_child_account_number(parent_account, parent_number):
	parent_number = str(parent_number).strip()
	if not re.fullmatch(r"\d+", parent_number):
		return parent_number

	child_numbers = frappe.get_all(
		"Account",
		filters={"parent_account": parent_account, "account_number": ["is", "set"]},
		pluck="account_number",
	)
	numeric_child_numbers = [
		int(str(number))
		for number in child_numbers
		if str(number).isdigit() and len(str(number)) == len(parent_number)
	]

	next_number = max(numeric_child_numbers + [int(parent_number)]) + 1
	return str(next_number).zfill(len(parent_number))


@frappe.whitelist()
def get_next_child_account_number_for_parent(parent_account):
	if not parent_account:
		return None

	parent_number = frappe.db.get_value("Account", parent_account, "account_number")
	if not parent_number:
		return None

	return get_next_child_account_number(parent_account, parent_number)


def _iter_line_rows(doc):
	table_fields = {
		"Sales Invoice": ("items",),
		"Purchase Invoice": ("items",),
		"Payment Entry": ("references",),
		"Journal Entry": ("accounts",),
	}
	for table_field in table_fields.get(doc.doctype, ()):
		for row in doc.get(table_field) or []:
			yield row


def _get_line_amount(row):
	for fieldname in (
		"amount",
		"allocated_amount",
		"debit_in_account_currency",
		"credit_in_account_currency",
		"debit",
		"credit",
	):
		value = flt(getattr(row, fieldname, None))
		if value:
			return abs(value)
	return 0


def _get_transaction_currency(doc):
	if getattr(doc, "currency", None):
		return doc.currency
	if getattr(doc, "paid_from_account_currency", None):
		return doc.paid_from_account_currency
	if getattr(doc, "company", None):
		return frappe.get_cached_value("Company", doc.company, "default_currency")
	return None


def _to_dual_currency(amount, currency, rate, company_currency=None, row_exchange_rate=1.0, secondary_currency=None):
	amount = flt(amount)
	if not secondary_currency or not company_currency:
		return amount, 0.0

	rate = flt(rate)
	if not rate or rate <= 0:
		return amount, 0.0

	sec_curr = secondary_currency
	pri_curr = company_currency

	frac_units = frappe.get_cached_value("Currency", sec_curr, "fraction_units")
	precision = 0 if frac_units == 0 else 2

	if currency == sec_curr:
		if rate > 1.0:
			primary_amount = amount / rate
		elif rate > 0:
			primary_amount = amount * rate
		else:
			primary_amount = amount
		return flt(primary_amount), flt(amount, precision)

	if currency == pri_curr:
		if rate > 1.0:
			secondary_amount = amount * rate
		elif rate > 0:
			secondary_amount = amount / rate
		else:
			secondary_amount = amount
		return flt(amount), flt(secondary_amount, precision)

	# Foreign currency: convert via row_exchange_rate to company currency then calculate secondary
	primary_amount = amount * flt(row_exchange_rate)
	if rate > 1.0:
		secondary_amount = primary_amount * rate
	elif rate > 0:
		secondary_amount = primary_amount / rate
	else:
		secondary_amount = primary_amount

	return flt(primary_amount), flt(secondary_amount, precision)


_to_usd_lbp = _to_dual_currency


