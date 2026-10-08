import frappe
from frappe import _

_cached_pos_profiles = {}
_cached_company_data = {}


def get_current_pos_profile():
	"""Get the active POS Profile with identity-only caching keyed by user and opening entry."""
	user = frappe.session.user
	from managely_terminal.managely_terminal.api.erpnext_sales_invoice import get_current_pos_opening_entry
	current_opening_entry = get_current_pos_opening_entry()
	cache_key = f"{user}|{current_opening_entry or 'none'}"

	if cache_key in _cached_pos_profiles:
		pos_profile_name = _cached_pos_profiles[cache_key]
	else:
		if current_opening_entry:
			opening_doc = frappe.get_doc("POS Opening Entry", current_opening_entry)
			pos_profile_name = opening_doc.pos_profile
		else:
			pos_profile_name = frappe.get_value("POS Profile User", {"user": user}, "parent")
			if not pos_profile_name:
				pos_profile_name = frappe.get_value(
					"User Permission",
					{"user": user, "allow": "POS Profile"},
					"for_value",
				)
			if not pos_profile_name:
				frappe.throw(_("No POS Profile found for user {0}").format(user))
		_cached_pos_profiles[cache_key] = pos_profile_name

	pos_profile_doc = frappe.get_doc("POS Profile", pos_profile_name)
	custom_warehouse = frappe.db.get_value(
		"POS Profile User",
		{"parent": pos_profile_name, "user": user},
		"custom_warehouse"
	)
	if custom_warehouse:
		pos_profile_doc.warehouse = custom_warehouse
	return pos_profile_doc


def clear_pos_profile_cache(user=None):
	"""Clear cached POS Profile identities."""
	global _cached_pos_profiles
	if user:
		keys_to_delete = [k for k in list(_cached_pos_profiles.keys()) if k.startswith(f"{user}|")]
		for k in keys_to_delete:
			del _cached_pos_profiles[k]
		if keys_to_delete:
			frappe.logger().info(
				f"POS Profile cache cleared for user: {user} ({len(keys_to_delete)} entries)"
			)
	else:
		current_user = frappe.session.user
		keys_to_delete = [k for k in list(_cached_pos_profiles.keys()) if k.startswith(f"{current_user}|")]
		for k in keys_to_delete:
			del _cached_pos_profiles[k]


def get_user_default_company():
	user = frappe.session.user
	return frappe.defaults.get_user_default(user, "Company")


def get_user_pos_profile_name(user: str):
	"""Return the POS Profile name assigned to a user (User Permission first, then Applicable Users)."""
	profile = frappe.db.get_value(
		"User Permission",
		{"user": user, "allow": "POS Profile"},
		"for_value",
	)
	if not profile:
		profile = frappe.db.get_value("POS Profile User", {"user": user}, "parent")
	return profile





def get_pos_opening_entry_dashboard(data=None):
	if not data:
		data = {}
	data.setdefault("non_standard_fieldnames", {})
	data["non_standard_fieldnames"]["POS Suspended Transaction"] = "pos_session"
	transactions = data.setdefault("transactions", [])
	for group in transactions:
		if group.get("label") == "Transactions":
			if "POS Suspended Transaction" not in group["items"]:
				group["items"].append("POS Suspended Transaction")
			return data
	transactions.append({"label": "Transactions", "items": ["POS Suspended Transaction"]})
	return data


def get_pos_closing_entry_dashboard(data=None):
	if not data:
		data = {}
	data.setdefault("non_standard_fieldnames", {})
	data["non_standard_fieldnames"]["POS Suspended Transaction"] = "pos_closing_entry"
	transactions = data.setdefault("transactions", [])
	for group in transactions:
		if group.get("label") == "Transactions":
			if "POS Suspended Transaction" not in group["items"]:
				group["items"].append("POS Suspended Transaction")
			return data
	transactions.append({"label": "Transactions", "items": ["POS Suspended Transaction"]})
	return data

def get_pos_invoice_dashboard(data=None):
	if not data:
		data = {}
	data.setdefault("non_standard_fieldnames", {})
	data["non_standard_fieldnames"]["POS Invoice"] = "customer"
	
	transactions = data.setdefault("transactions", [])
	transactions.append({
		"label": "Invoices",
		"items": ["POS Invoice"]
	})
	
	data.setdefault("internal_links", {})
	data["internal_links"]["Customer"] = ["customer"]
	
	return data


def extend_bootinfo(bootinfo):
	"""Inject report printing and auto-fit stylesheet into bootinfo.print_css."""
	import os

	css_content = ""
	try:
		css_path = os.path.join(
			frappe.get_app_path("managely_terminal"),
			"public",
			"css",
			"report_print_fix.css",
		)
		if os.path.exists(css_path):
			with open(css_path, "r", encoding="utf-8") as f:
				css_content = f.read()
	except Exception:
		pass

	if not css_content:
		css_content = """
.print-format {
    margin-top: 10mm !important;
    margin-bottom: 10mm !important;
    margin-left: 4mm !important;
    margin-right: 4mm !important;
}
.print-format-gutter .print-format hr {
    display: none !important;
}
@media screen {
    .print-format-gutter { padding: 20px 15px !important; background-color: #e2e8f0 !important; overflow-x: auto !important; }
    .print-format-gutter .print-format { max-width: 98% !important; width: fit-content !important; min-width: 8.3in !important; padding: 0.3in !important; margin: 0 auto !important; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.12) !important; background: #ffffff !important; }
    .print-format-gutter .print-format.landscape { min-width: 11.69in !important; }
}
@media print {
    @page { margin-top: 10mm !important; margin-bottom: 10mm !important; margin-left: 4mm !important; margin-right: 4mm !important; }
    html, body { width: 100% !important; margin: 0 !important; padding: 0 !important; }
    .print-format-gutter { background: transparent !important; padding: 0 !important; margin: 0 !important; }
    .print-format-gutter .print-format, .print-format { width: 100% !important; max-width: 100% !important; min-width: 100% !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
}
.print-format-gutter .print-format table:not(.sultan-lh-table), .print-format table:not(.sultan-lh-table) { width: 100% !important; max-width: 100% !important; table-layout: auto !important; border-collapse: collapse !important; border: 1.5px solid #322f14 !important; }
.print-format-gutter .print-format table:not(.sultan-lh-table) th, .print-format table:not(.sultan-lh-table) th { min-width: 0 !important; white-space: normal !important; word-break: normal !important; word-wrap: normal !important; overflow-wrap: normal !important; font-size: 7.5pt !important; padding: 4px 4px !important; line-height: 1.25 !important; vertical-align: middle !important; border: 1px solid #4a4520 !important; border-bottom: 2px solid #322f14 !important; background-color: #322f14 !important; color: #ffffff !important; font-weight: 700 !important; text-align: center !important; }
.print-format-gutter .print-format table:not(.sultan-lh-table) td, .print-format table:not(.sultan-lh-table) td { white-space: normal !important; word-break: normal !important; word-wrap: break-word !important; font-size: 7.5pt !important; padding: 4px 4px !important; line-height: 1.2 !important; vertical-align: middle !important; border: 1px solid #94a3b8 !important; color: #1e293b !important; }
.print-format-gutter .print-format table tr[style*="height: 30px"], .print-format-gutter .print-format table tr { height: auto !important; }
"""

	if "print_css" in bootinfo and bootinfo["print_css"]:
		bootinfo["print_css"] = bootinfo["print_css"] + "\n" + css_content
	else:
		bootinfo["print_css"] = css_content


@frappe.whitelist()
def custom_report_to_pdf(html, orientation="Landscape"):
	"""Intercept and enforce clean margins, professional letterhead, and responsive column layout for PDF report exports."""
	import re
	from bs4 import BeautifulSoup
	from frappe.core.doctype.access_log.access_log import make_access_log
	from frappe.utils.pdf import get_pdf

	make_access_log(file_type="PDF", method="PDF", page=html)
	frappe.local.response.filename = "report.pdf"

	soup = BeautifulSoup(html, "html.parser")

	# 1. Clean report letterhead: keep only Sultan Logo on the left, remove contact/address details
	for td in soup.find_all("td"):
		text = td.get_text()
		if any(w in text for w in ["+961", "SULTAN BAKEHOUSE", "HOSRAYEL", "4127139"]):
			td.decompose()

	# 2. De-extract header-html so it stays in the natural flow of the report body on Page 1
	# This prevents wkhtmltopdf --header-html overlay collision with <h2> and <thead>.
	h_tag = soup.find(id="header-html")
	if h_tag:
		del h_tag["id"]
		classes = h_tag.get("class", [])
		if isinstance(classes, list):
			if "hidden-pdf" in classes:
				classes.remove("hidden-pdf")
			h_tag["class"] = classes

	# 3. Constrain all logo and letterhead images to exact branding dimensions
	for img in soup.find_all("img"):
		if (
			img.find_parent(class_="letter-head")
			or img.find_parent(id="header-html")
			or "logo" in img.get("src", "").lower()
			or "sultan" in img.get("alt", "").lower()
			or "sultan" in img.get("src", "").lower()
		):
			img["style"] = "height: 48px !important; max-height: 48px !important; width: auto !important; max-width: 220px !important; display: block !important;"
			if img.has_attr("width"):
				del img["width"]
			if img.has_attr("height"):
				del img["height"]

	lh_div = soup.find(class_="letter-head")
	if lh_div and not lh_div.find(class_="sultan-lh-divider"):
		divider_tag = soup.new_tag("div")
		divider_tag["class"] = "sultan-lh-divider"
		divider_tag["style"] = "width: 100%; border-top: 2px solid #322f14; margin-top: 8px; margin-bottom: 8px; clear: both;"
		lh_div.append(divider_tag)

	margin_top = "10mm"

	# 2. Inspect data table and sanitize columns
	table = soup.find("table", class_="table") or soup.find("table")
	col_count = 0
	if table:
		first_tr = table.find("tr")
		if first_tr:
			ths_or_tds = first_tr.find_all(["th", "td"])
			col_count = len(ths_or_tds)

		# If dense table (> 12 columns, e.g. Multi Currency Trial Balance):
		if col_count > 12:
			ths = first_tr.find_all("th")
			for idx, th in enumerate(ths):
				t_text = th.get_text().strip()
				t_clean = t_text.replace("Debit", "Dr").replace("Credit", "Cr")
				for pfx in ["Opening", "Period", "Closing", "Account", "Cost"]:
					if t_clean.startswith(pfx + " "):
						t_clean = f"{pfx}<br>{t_clean[len(pfx)+1:]}"
						break
				th.clear()
				th.append(BeautifulSoup(t_clean, "html.parser"))

				if idx == 0:
					w = "2.5%"
				elif idx == 1:
					w = "15.5%"
				elif idx == 2:
					w = "5.5%"
				elif idx == len(ths) - 1:
					w = "5.5%"
				else:
					th_lower = t_clean.lower()
					if "lbp" in th_lower:
						w = "6.8%"
					else:
						w = "5.0%"
				th["style"] = f"width: {w} !important;"

		# Identify numeric columns and strip fixed heights
		numeric_cols = set()
		for tr in table.find_all("tr"):
			ths = tr.find_all("th")
			if ths:
				for idx, th in enumerate(ths):
					th_text = th.get_text().strip().lower()
					cls_list = th.get("class", [])
					if isinstance(cls_list, str):
						cls_list = [cls_list]
					if "text-right" in cls_list or any(
						w in th_text
						for w in [
							"dr",
							"cr",
							"debit",
							"credit",
							"balance",
							"amount",
							"usd",
							"lbp",
							"rate",
							"total",
							"closing",
							"opening",
							"period",
							"qty",
							"price",
						]
					):
						numeric_cols.add(idx)

		for tr in table.find_all("tr"):
			if tr.has_attr("style"):
				cleaned = [
					s.strip()
					for s in tr["style"].split(";")
					if s.strip() and not s.strip().startswith("height")
				]
				tr["style"] = "; ".join(cleaned)

			tds = tr.find_all("td")
			for idx in numeric_cols:
				if idx < len(tds):
					td = tds[idx]
					cls_list = td.get("class", [])
					if isinstance(cls_list, str):
						cls_list = [cls_list]
					if "text-right" not in cls_list:
						cls_list.append("text-right")
					td["class"] = cls_list

			for idx, td in enumerate(tds):
				if idx not in numeric_cols:
					sp = td.find("span")
					if sp and sp.has_attr("style") and "padding-left" in sp["style"]:
						m = re.search(r"padding-left:\s*([0-9.]+)(em|px)", sp["style"])
						if m:
							val = float(m.group(1))
							unit = m.group(2)
							px_val = min(val * 4, 12) if unit == "em" else min(val, 12)
							sp["style"] = f"padding-left: {px_val:.0f}px;"

			if any("total" in td.get_text().strip().lower() for td in tds[:3]):
				cls_list = tr.get("class", [])
				if isinstance(cls_list, str):
					cls_list = [cls_list]
				if "report-total-row" not in cls_list:
					cls_list.append("report-total-row")
				tr["class"] = cls_list

	# 3. Dynamic typography based on column density
	if col_count > 12:
		th_f, td_f = "5.2pt", "5.2pt"
		th_p, td_p = "3px 1px", "2.5px 1.5px"
		tbl_layout = "fixed"
	elif col_count > 8:
		th_f, td_f = "6.5pt", "6.5pt"
		th_p, td_p = "4px 3px", "3.5px 3px"
		tbl_layout = "auto"
	else:
		th_f, td_f = "8.0pt", "8.0pt"
		th_p, td_p = "5px 6px", "4px 6px"
		tbl_layout = "auto"

	adaptive_css = f"""
<style>
.print-format {{
    margin-top: {margin_top} !important;
    margin-bottom: 10mm !important;
    margin-left: 4mm !important;
    margin-right: 4mm !important;
}}
@media print {{
    @page {{
        margin-top: {margin_top} !important;
        margin-bottom: 10mm !important;
        margin-left: 4mm !important;
        margin-right: 4mm !important;
    }}
    html, body {{
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
    }}
    .print-format-gutter {{
        background: transparent !important;
        padding: 0 !important;
        margin: 0 !important;
    }}
    .print-format-gutter .print-format,
    .print-format {{
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 100% !important;
        box-shadow: none !important;
        border-radius: 0 !important;
    }}
}}
.letter-head {{
    margin-bottom: 8px !important;
}}
.letter-head img,
#header-html img,
div[id="header-html"] img,
.sultan-lh-container img,
.letter-head-preview img {{
    height: 48px !important;
    max-height: 48px !important;
    width: auto !important;
    max-width: 220px !important;
    display: block !important;
    margin: 0 !important;
    object-fit: contain !important;
}}
.sultan-lh-divider {{ border-top: 2px solid #322f14 !important; margin-top: 6px !important; margin-bottom: 8px !important; clear: both !important; }}

thead {{ display: table-header-group !important; }}
tr {{ page-break-inside: avoid !important; }}

.report-total-row td,
.print-format-gutter .print-format table tr.report-total-row td,
.print-format-gutter .print-format table tr[style*="font-weight: bold"] td,
.print-format-gutter .print-format table tr[style*="font-weight:bold"] td {{
    font-weight: 700 !important;
    border-top: 1.5px solid #322f14 !important;
    border-bottom: 2px solid #322f14 !important;
    background-color: #f1f5f9 !important;
}}

.print-format-gutter .print-format hr,
.print-format hr {{ display: none !important; }}

.print-format-gutter .print-format h2,
.print-format h2 {{
    font-size: 13pt !important;
    font-weight: 700 !important;
    color: #322f14 !important;
    margin: 4px 0 6px 0 !important;
    text-align: center !important;
    text-transform: uppercase !important;
    letter-spacing: 0.5px !important;
}}

.print-format-gutter .print-format table:not(.sultan-lh-table),
.print-format table:not(.sultan-lh-table) {{
    width: 100% !important;
    table-layout: {tbl_layout} !important;
    border-collapse: collapse !important;
    border: 1.5px solid #322f14 !important;
    margin-top: 4px !important;
}}

.print-format-gutter .print-format table:not(.sultan-lh-table) th,
.print-format table:not(.sultan-lh-table) th {{
    background-color: #322f14 !important;
    color: #ffffff !important;
    font-size: {th_f} !important;
    font-weight: 700 !important;
    line-height: 1.2 !important;
    padding: {th_p} !important;
    border: 1px solid #4a4520 !important;
    vertical-align: middle !important;
    text-align: center !important;
    white-space: normal !important;
    word-break: normal !important;
    word-wrap: normal !important;
    overflow-wrap: normal !important;
}}

.print-format-gutter .print-format table:not(.sultan-lh-table) td,
.print-format table:not(.sultan-lh-table) td {{
    font-size: {td_f} !important;
    padding: {td_p} !important;
    line-height: 1.15 !important;
    border: 1px solid #94a3b8 !important;
    vertical-align: middle !important;
    color: #1e293b !important;
    height: auto !important;
    overflow: hidden !important;
}}

.print-format-gutter .print-format table:not(.sultan-lh-table) td.text-right,
.print-format-gutter .print-format table:not(.sultan-lh-table) th.text-right,
.print-format table:not(.sultan-lh-table) td.text-right,
.print-format table:not(.sultan-lh-table) th.text-right {{
    text-align: right !important;
    white-space: nowrap !important;
}}

.print-format-gutter .print-format table:not(.sultan-lh-table) td:not(.text-right),
.print-format table:not(.sultan-lh-table) td:not(.text-right) {{
    white-space: normal !important;
    word-break: normal !important;
    word-wrap: break-word !important;
}}

.print-format-gutter .print-format table:not(.sultan-lh-table) td span,
.print-format table:not(.sultan-lh-table) td span {{
    display: inline-block !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
}}

.print-format-gutter .print-format table:not(.sultan-lh-table) tbody tr:nth-child(even) td,
.print-format table:not(.sultan-lh-table) tbody tr:nth-child(even) td {{
    background-color: #f8fafc !important;
}}

.print-format-gutter .print-format table tr,
.print-format table tr {{
    height: auto !important;
}}
</style>
"""
	transformed_html = str(soup)
	if "</head>" in transformed_html:
		transformed_html = transformed_html.replace("</head>", f"{adaptive_css}</head>")
	else:
		transformed_html = f"{adaptive_css}{transformed_html}"

	options = {
		"orientation": orientation,
		"margin-top": margin_top,
		"margin-bottom": "10mm",
		"margin-left": "4mm",
		"margin-right": "4mm",
	}

	frappe.local.response.filecontent = get_pdf(transformed_html, options)
	frappe.local.response.type = "pdf"



