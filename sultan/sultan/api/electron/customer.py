import json

import frappe
from erpnext.setup.utils import get_exchange_rate
from frappe import _

from sultan.sultan.utils import get_current_pos_profile


@frappe.whitelist(allow_guest=True)
def get_customers(limit: int = 100, start: int = 0, search: str = ""):
	"""
	Fetch customers with structured primary contact & address details.
	Returns all customers based on business type and search criteria.
	"""

	try:
		pos_profile = get_current_pos_profile()
		business_type = getattr(pos_profile, "custom_business_type", "B2C")
		company, company_currency = get_user_company_and_currency()
		result = []

		# Get customer groups from POS profile if configured
		customer_group_names = []
		if hasattr(pos_profile, "customer_groups") and pos_profile.customer_groups:
			customer_group_names = [d.customer_group for d in pos_profile.customer_groups if d.customer_group]

		# Get user permissions for Customer doctype
		user_permitted = frappe.permissions.get_user_permissions(frappe.session.user)
		permitted_customer_names = []
		has_customer_permissions = False
		if user_permitted and "Customer" in user_permitted:
			permitted_customer_names = [perm.get("doc") for perm in user_permitted["Customer"]]
			has_customer_permissions = True

		# If user has customer permissions configured but no customers are permitted, return empty result
		if has_customer_permissions and not permitted_customer_names:
			return {
				"success": True,
				"data": [],
				"total_count": 0,
			}

		# If there's a search term, broaden the query across name, customer_name, contact email/phone.
		# Also increase limit for search results to surface older matches.
		if search:
			# Sanitize search input for LIKE
			like_param = f"%{search}%"

			# Build optional customer_type filter
			cust_type_filter = ""
			cust_type_params = []
			if business_type == "B2B":
				cust_type_filter = "AND c.customer_type = %s"
				cust_type_params.append("Company")
			elif business_type == "B2C":
				cust_type_filter = "AND c.customer_type = %s"
				cust_type_params.append("Individual")
			print("Busines type", business_type)
			# Build optional customer_group filter
			cust_group_filter = ""
			cust_group_params = []
			if customer_group_names:
				placeholders = ",".join(["%s"] * len(customer_group_names))
				cust_group_filter = f"AND c.customer_group IN ({placeholders})"
				cust_group_params.extend(customer_group_names)

			# Build optional user permission filter
			user_perm_filter = ""
			user_perm_params = []
			if permitted_customer_names:
				placeholders = ",".join(["%s"] * len(permitted_customer_names))
				user_perm_filter = f"AND c.name IN ({placeholders})"
				user_perm_params.extend(permitted_customer_names)

			# Prefer higher cap when searching
			try:
				limit_val = int(limit) if limit else 100
			except Exception:
				limit_val = 100
			# Boost limits for search to show more matches
			limit_val = max(limit_val, 500)

			customer_names = frappe.db.sql(
				f"""
                SELECT DISTINCT c.name, c.customer_name, c.customer_type, c.customer_group, c.territory, c.default_currency
                FROM `tabCustomer` c
                LEFT JOIN `tabDynamic Link` dl ON dl.link_doctype='Customer' AND dl.link_name=c.name AND dl.parenttype='Contact'
                LEFT JOIN `tabContact` ct ON ct.name = dl.parent
                LEFT JOIN `tabContact Email` ce ON ce.parent = ct.name
                LEFT JOIN `tabContact Phone` cp ON cp.parent = ct.name
                WHERE (
                    c.customer_name LIKE %s OR c.name LIKE %s OR
                    ce.email_id LIKE %s OR cp.phone LIKE %s
                )
                {cust_type_filter}
                {cust_group_filter}
                {user_perm_filter}
                ORDER BY c.creation DESC
                LIMIT %s OFFSET %s
                """,
				tuple(
					[
						like_param,
						like_param,
						like_param,
						like_param,
						*cust_type_params,
						*cust_group_params,
						*user_perm_params,
						limit_val,
						int(start) or 0,
					]
				),
				as_dict=True,
			)

			# Total count for search
			total_count_row = frappe.db.sql(
				f"""
                SELECT COUNT(DISTINCT c.name) as total
                FROM `tabCustomer` c
                LEFT JOIN `tabDynamic Link` dl ON dl.link_doctype='Customer' AND dl.link_name=c.name AND dl.parenttype='Contact'
                LEFT JOIN `tabContact` ct ON ct.name = dl.parent
                LEFT JOIN `tabContact Email` ce ON ce.parent = ct.name
                LEFT JOIN `tabContact Phone` cp ON cp.parent = ct.name
                WHERE (
                    c.customer_name LIKE %s OR c.name LIKE %s OR
                    ce.email_id LIKE %s OR cp.phone LIKE %s
                )
                {cust_type_filter}
                {cust_group_filter}
                {user_perm_filter}
                """,
				tuple(
					[
						like_param,
						like_param,
						like_param,
						like_param,
						*cust_type_params,
						*cust_group_params,
						*user_perm_params,
					]
				),
				as_dict=True,
			)
			total_count = (total_count_row[0].total if total_count_row else 0) or 0
		else:
			# Original logic for when no search term - keep capped limit for performance
			filters = {}
			if business_type == "B2B":
				filters["customer_type"] = "Company"
			elif business_type == "B2C":
				filters["customer_type"] = "Individual"

			# Add customer group filtering if configured
			if customer_group_names:
				filters["customer_group"] = ["in", customer_group_names]

			# Add user permission filtering if configured
			if permitted_customer_names:
				filters["name"] = ["in", permitted_customer_names]

			customer_names = frappe.get_all(
				"Customer",
				filters=filters,
				fields=[
					"name",
					"customer_name",
					"customer_type",
					"customer_group",
					"territory",
					"default_currency",
				],
				order_by="creation desc",
				limit=limit,
				start=start,
			)

			total_count = frappe.db.count("Customer", filters=filters)

		# Process each customer to get detailed information
		for cust in customer_names:
			doc = frappe.get_doc("Customer", cust.name)

			contact = (
				frappe.db.get_value(
					"Contact",
					{"name": doc.customer_primary_contact},
					["first_name", "last_name", "email_id", "phone", "mobile_no"],
					as_dict=True,
				)
				if doc.customer_primary_contact
				else None
			)

			address = (
				frappe.db.get_value(
					"Address",
					{"name": doc.customer_primary_address},
					["address_line1", "city", "state", "country", "pincode"],
					as_dict=True,
				)
				if doc.customer_primary_address
				else None
			)

			# Get customer statistics
			stats = get_customer_statistics(doc.name)
			customer_stats = stats.get("data", {}) if stats.get("success") else {}

			result.append(
				{
					"name": doc.name,
					"customer_name": doc.customer_name,
					"customer_type": doc.customer_type,
					"customer_group": doc.customer_group,
					"territory": doc.territory,
					"contact": contact,
					"address": address,
					"default_currency": doc.default_currency,
					"company_currency": company_currency,
					"custom_total_orders": customer_stats.get("total_orders", 0),
					"custom_total_spent": customer_stats.get("total_spent", 0),
					"custom_last_visit": customer_stats.get("last_visit"),
					"company": company,
					"unified_customer": None,
					"loyalty_program": "",
					"loyalty_points": 0,
					# "exchange_rate": get_currency_exchange_rate(company_currency, doc.default_currency)
				}
			)

		# Fetch and append POS Customer records
		pos_cust_filters = {}
		if search:
			pos_cust_filters["customer_name"] = ["like", f"%{search}%"]

		pos_customers = frappe.get_all(
			"POS Customer",
			filters=pos_cust_filters,
			fields=["name", "customer_name", "mobile_no", "email_id", "company", "unified_customer", "address", "loyalty_program", "loyalty_points"],
			limit=limit,
		)

		for pc in pos_customers:
			result.append({
				"name": pc.name,
				"customer_name": pc.customer_name,
				"customer_type": "Individual",
				"customer_group": "All Customer Groups",
				"territory": "All Territories",
				"contact": {
					"email_id": pc.email_id,
					"phone": pc.mobile_no,
					"mobile_no": pc.mobile_no,
				},
				"address": {"address_line1": pc.get("address")} if pc.get("address") else None,
				"default_currency": company_currency,
				"company_currency": company_currency,
				"custom_total_orders": 0,
				"custom_total_spent": 0,
				"custom_last_visit": None,
				"is_pos_customer": True,
				"company": pc.get("company"),
				"unified_customer": pc.get("unified_customer"),
				"loyalty_program": pc.get("loyalty_program") or "",
				"loyalty_points": pc.get("loyalty_points") or 0,
			})

		# Deduplicate the merged list by customer_name
		seen_names = set()
		deduped_result = []
		for r in result:
			name_key = r.get("customer_name")
			if name_key not in seen_names:
				seen_names.add(name_key)
				deduped_result.append(r)
		result = deduped_result

		return {
			"success": True,
			"data": result,
			"total_count": len(result),
			"start": start,
			"limit": limit,
		}

	except Exception:
		frappe.log_error(frappe.get_traceback(), "Error fetching customers")
		return {
			"success": False,
			"error": _("Something went wrong while fetching customers."),
		}


def get_user_company_and_currency():
	default_company = frappe.defaults.get_user_default("Company")
	if not default_company:
		default_company = frappe.db.get_single_value("Global Defaults", "default_company")

	company_currency = frappe.db.get_value("Company", default_company, "default_currency")

	return default_company, company_currency


@frappe.whitelist(allow_guest=True)
def get_customer_addresses(customer: str):
	"""Get all addresses for a specific customer"""
	try:
		# Get all addresses linked to this customer
		addresses = frappe.get_all(
			"Address",
			filters={
				"name": [
					"in",
					frappe.get_all(
						"Dynamic Link",
						filters={
							"link_doctype": "Customer",
							"link_name": customer,
							"parenttype": "Address",
						},
						pluck="parent",
					),
				]
			},
			fields=[
				"name",
				"address_line1",
				"address_line2",
				"city",
				"state",
				"country",
				"pincode",
			],
			order_by="creation desc",
		)
		return addresses
	except Exception:
		frappe.log_error(frappe.get_traceback(), f"Error fetching addresses for customer {customer}")
		return []


@frappe.whitelist()
def get_currency_exchange_rate(from_currency: str, to_currency: str, transaction_date: str | None = None):
	"""
	Get exchange rate from `from_currency` to `to_currency`.
	Optionally pass a transaction_date (YYYY-MM-DD).
	"""
	if not transaction_date:
		transaction_date = frappe.utils.nowdate()
	try:
		if not from_currency or not to_currency:
			return {
				"success": False,
				"error": "Both from_currency and to_currency are required",
			}

		rate = get_exchange_rate(from_currency, to_currency, transaction_date)
		return rate

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error fetching exchange rate")
		return {"success": False, "error": str(e)}


@frappe.whitelist(allow_guest=True)
def get_customer_info(customer_name: str):
	"""Fetch comprehensive customer document by customer name or ID."""
	try:
		# URL decode the customer name to handle special characters like +
		import urllib.parse

		customer_name = urllib.parse.unquote(customer_name)
		print("CUSTOMER WETU", customer_name)

		# Try POS Customer first
		pos_cust = frappe.db.get_value("POS Customer", {"customer_name": customer_name}, ["name", "customer_name", "mobile_no", "email_id", "unified_customer", "address"], as_dict=True)
		if not pos_cust:
			pos_cust = frappe.db.get_value("POS Customer", {"name": customer_name}, ["name", "customer_name", "mobile_no", "email_id", "unified_customer", "address"], as_dict=True)

		if pos_cust:
			return {
				"name": pos_cust.name,
				"customer_name": pos_cust.customer_name,
				"customer_group": "All Customer Groups",
				"territory": "All Territories",
				"customer_type": "Individual",
				"email_id": pos_cust.email_id,
				"mobile_no": pos_cust.mobile_no,
				"is_pos_customer": True,
				"company": pc.get("company"),
				"unified_customer": pc.get("unified_customer"),
				"contact_data": {
					"first_name": pos_cust.customer_name,
					"last_name": "",
					"email_id": pos_cust.email_id,
					"mobile_no": pos_cust.mobile_no,
					"phone": pos_cust.mobile_no,
				},
				"address_data": {
					"address_line1": pos_cust.address,
					"address_line2": "",
					"city": "",
					"state": "",
					"country": "",
					"pincode": "",
				} if pos_cust.get("address") else None,
			}

		# First try to find by customer_name
		customers = frappe.get_all("Customer", filters={"customer_name": customer_name}, fields=["name"])

		# If not found by customer_name, try by name (ID)
		if not customers:
			customers = frappe.get_all("Customer", filters={"name": customer_name}, fields=["name"])

		if not customers:
			# Log the search attempt for debugging
			frappe.logger().info(
				f"Customer not found: '{customer_name}'. Searched by customer_name and name."
			)
			return {"success": False, "error": f"Customer not found: {customer_name}"}

		customer = frappe.get_doc("Customer", customers[0]["name"])

		# Get primary contact details
		contact_data = None
		if customer.customer_primary_contact:
			contact_data = frappe.db.get_value(
				"Contact",
				customer.customer_primary_contact,
				["first_name", "last_name", "email_id", "phone", "mobile_no"],
				as_dict=True,
			)

		# Get primary address details
		address_data = None
		if customer.customer_primary_address:
			address_data = frappe.db.get_value(
				"Address",
				customer.customer_primary_address,
				[
					"address_line1",
					"address_line2",
					"city",
					"state",
					"country",
					"pincode",
				],
				as_dict=True,
			)

		# Prepare base customer data
		customer_data = {
			"name": customer.name,
			"customer_name": customer.customer_name,
			"customer_group": customer.customer_group,
			"territory": customer.territory,
			"customer_type": customer.customer_type,
			"customer_primary_contact": customer.customer_primary_contact,
			"customer_primary_address": customer.customer_primary_address,
			"email_id": customer.email_id,
			"mobile_no": customer.mobile_no,
			"creation": customer.creation,
			"contact_data": contact_data,
			"address_data": address_data,
		}

		# Add ZATCA details for company customers
		if customer.customer_type == "Company":
			customer_data.update(
				{
					"vat_number": getattr(customer, "custom_vat_number", ""),
					"registration_scheme": getattr(customer, "custom_registration_scheme", ""),
					"registration_number": getattr(customer, "custom_registration_number", ""),
					"payment_method": getattr(customer, "custom_payment_method", "Cash"),
					"industry": getattr(customer, "custom_industry", ""),
					"employee_count": getattr(customer, "custom_employee_count", ""),
					"company_name": customer.customer_name,
				}
			)

		return customer_data
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error fetching customer info")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def create_or_update_customer(customer_data):
	try:
		if isinstance(customer_data, str):
			customer_data = frappe.parse_json(customer_data)
		# Extract main fields
		customer_name = customer_data.get("name")
		email = customer_data.get("email")
		phone = customer_data.get("phone")
		cust_type = customer_data.get("customer_type", customer_data.get("type", "individual")).lower()
		address = customer_data.get("address") or {}
		if isinstance(address, str):
			address_dict = {"address_line1": address}
		else:
			address_dict = address

		country = address_dict.get("country", "Saudi Arabia")
		name_arabic = customer_data.get("name_arabic", "")

		if not customer_name:
			customer_name = phone or email
		if not customer_name:
			frappe.throw("Customer must have at least a name, phone, or email")

		contact_doc = None
		addr_doc = None
		# For Individuals → create a POS Customer linked to the default POS Profile customer
		if cust_type == "individual":
			pos_profile = get_current_pos_profile()
			unified_customer = getattr(pos_profile, "customer", None) or "Walk-in Customer"

			existing_pos_cust = frappe.db.get_value("POS Customer", {"customer_name": customer_name})
			if existing_pos_cust:
				frappe.throw(_("A customer with the name '{0}' already exists.").format(customer_name))
			else:
				addr_str = ""
				if isinstance(address, str):
					addr_str = address
				elif address:
					parts = [
						address.get("address_line1") or address.get("street") or "",
						address.get("address_line2") or address.get("buildingNumber") or "",
						address.get("city") or "",
						address.get("state") or "",
						address.get("pincode") or address.get("zipCode") or "",
						address.get("country") or ""
					]
					addr_str = ", ".join([p for p in parts if p])

				default_lp = frappe.db.get_single_value("Sultan Settings", "default_loyalty_program")
				pos_cust_doc = frappe.get_doc({
					"doctype": "POS Customer",
					"customer_name": customer_name,
					"mobile_no": phone,
					"email_id": email,
					"address": addr_str,
					"unified_customer": unified_customer if customer_data.get("unified_customer") == "Walk-in Customer" else (customer_data.get("unified_customer") or unified_customer),
					"company": customer_data.get("company") or pos_profile.company,
					"loyalty_program": default_lp or None,
					"naming_series": "pos-cust-.####"
				})
				pos_cust_doc.insert(ignore_permissions=True)

			return {
				"success": True,
				"customer_name": pos_cust_doc.name,
				"contact_name": None,
				"address_name": None,
			}

		# For Companies → create both Contact and Address
		if cust_type == "company":
			if frappe.db.exists("Customer", {"customer_name": customer_name}):
				frappe.throw(_("A company customer with the name '{0}' already exists.").format(customer_name))
			# Create or update Customer
			customer_doc = get_or_create_customer(
				customer_name, email, phone, country, name_arabic, customer_data
			)
			contact_name = customer_data.get("contactName", customer_name)
			contact_doc = create_or_update_contact(customer_doc.name, contact_name, email, phone)
			addr_doc = create_or_update_address(customer_doc.name, customer_name, address, country)

			if addr_doc:
				frappe.db.set_value(
					"Customer",
					customer_doc.name,
					"customer_primary_address",
					addr_doc.name,
				)

			return {
				"success": True,
				"customer_name": customer_doc.name,
				"contact_name": contact_doc.name if contact_doc else None,
				"address_name": addr_doc.name if addr_doc else None,
			}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Customer Creation/Update Error")
		return {"success": False, "error": str(e)}


def get_or_create_customer(name, email, phone, country, name_arabic="", data=None):
	"""Create or update a Customer (Individual or Company)."""
	try:
		cust_type = (
			"Company"
			if data and (data.get("customer_type") == "company" or data.get("type") == "company")
			else "Individual"
		)

		# Get customer_group and territory from data, with defaults
		customer_group = data.get("customer_group", "All Customer Groups") if data else "All Customer Groups"
		territory = data.get("territory", country) if data else country

		existing = frappe.get_all("Customer", filters={"customer_name": name}, fields=["name"])
		if existing:
			doc = frappe.get_doc("Customer", existing[0]["name"])
			doc.email_id = email
			doc.mobile_no = phone
			doc.custom_country = country
			doc.customer_type = cust_type
			doc.customer_name_in_arabic = name_arabic
			doc.customer_group = customer_group
			doc.territory = territory

			if cust_type == "Company":
				doc.custom_vat_number = data.get("vatNumber")
				doc.custom_payment_method = data.get("preferredPaymentMethod")
				doc.custom_registration_scheme = data.get("registrationScheme")
				doc.custom_registration_number = data.get("registrationNumber")

			doc.save()
		else:
			# Create new
			doc = frappe.get_doc(
				{
					"doctype": "Customer",
					"customer_name": name,
					"customer_type": cust_type,
					"customer_name_in_arabic": name_arabic,
					"email_id": email,
					"mobile_no": phone,
					"custom_country": country,
					"customer_group": customer_group,
					"territory": territory,
					"status": data.get("status", "Active") if data else "Active",
					"custom_vat_number": (data.get("vatNumber") if cust_type == "Company" else None),
					"custom_payment_method": (
						data.get("preferredPaymentMethod") if cust_type == "Company" else None
					),
					"custom_registration_scheme": (
						data.get("registrationScheme") if cust_type == "Company" else None
					),
					"custom_registration_number": (
						data.get("registrationNumber") if cust_type == "Company" else None
					),
				}
			)
			doc.insert()
		return doc
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error in get_or_create_customer")
		raise e


@frappe.whitelist(allow_guest=True)
def get_customer_groups():
	"""Fetch customer groups based on POS profile configuration."""
	try:
		pos_profile = get_current_pos_profile()

		# Check if POS profile has customer groups configured
		if hasattr(pos_profile, "customer_groups") and pos_profile.customer_groups:
			customer_group_names = [d.customer_group for d in pos_profile.customer_groups if d.customer_group]

			customer_groups = frappe.get_all(
				"Customer Group",
				filters={"name": ["in", customer_group_names]},
				fields=["name", "customer_group_name"],
				order_by="customer_group_name asc",
			)
		else:
			customer_groups = frappe.get_all(
				"Customer Group",
				fields=["name", "customer_group_name"],
				order_by="customer_group_name asc",
			)

		# Check if "All Customer Groups" already exists, if not add it
		has_all_groups = any(group["name"] == "All Customer Groups" for group in customer_groups)
		if not has_all_groups:
			customer_groups.insert(
				0,
				{
					"name": "All Customer Groups",
					"customer_group_name": "All Customer Groups",
				},
			)

		return {"success": True, "data": customer_groups}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error fetching customer groups")
		return {"success": False, "error": str(e)}


@frappe.whitelist(allow_guest=True)
def get_territories():
	"""Fetch all territories for dropdown selection."""
	try:
		territories = frappe.get_all(
			"Territory",
			fields=["name", "territory_name"],
			order_by="territory_name asc",
		)

		return {"success": True, "data": territories}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error fetching territories")
		return {"success": False, "error": str(e)}


def create_or_update_contact(customer, customer_name, email, phone):
	existing_contact = frappe.get_all("Contact", filters={"email_id": email, "link_name": customer}, limit=1)

	if existing_contact:
		doc = frappe.get_doc("Contact", existing_contact[0].name)
		doc.first_name = customer_name
		doc.phone = phone
		doc.email_id = email
	else:
		# create new document properly
		doc = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": customer_name,
				"email_id": email,
				"phone": phone,
				"links": [{"link_doctype": "Customer", "link_name": customer}],
			}
		)

	doc.save(ignore_permissions=True)
	return doc


def create_or_update_address(customer_id, customer_name, address_data, country):
	"""Create or update primary Address for the customer."""
	if not address_data:
		return None

	address_title = f"{customer_name} - Primary"

	address_fields = {
		"address_title": address_title,
		"address_type": address_data.get("addressType", "Billing"),
		"address_line1": address_data.get("street", ""),
		"address_line2": address_data.get("buildingNumber", ""),
		"city": address_data.get("city", ""),
		"state": address_data.get("state", ""),
		"county": address_data.get("city", ""),
		"pincode": address_data.get("zipCode", ""),
		"country": country,
		"is_primary_address": 1 if address_data.get("isPrimary") else 0,
		"is_shipping_address": 0,
	}

	existing = frappe.get_all("Address", filters={"address_title": address_title}, fields=["name"])

	if existing:
		doc = frappe.get_doc("Address", existing[0]["name"])
		for field, value in address_fields.items():
			setattr(doc, field, value)
		doc.links = []
	else:
		doc = frappe.new_doc("Address")
		for field, value in address_fields.items():
			setattr(doc, field, value)

	doc.append(
		"links",
		{
			"link_doctype": "Customer",
			"link_name": customer_id,
			"link_title": customer_name,
		},
	)
	doc.save()
	return doc


@frappe.whitelist()
def update_customer(customer_id, customer_data):
	if isinstance(customer_data, str):
		customer_data = json.loads(customer_data)

	try:
		customer = frappe.get_doc("Customer", customer_id)

		# Extract email and phone for contact update
		email = customer_data.get("email")
		phone = customer_data.get("phone")
		customer_name = customer_data.get("name", customer.customer_name)
		address_data = customer_data.get("address", {})
		country = address_data.get("country", "Saudi Arabia")

		# Update customer fields
		for key, value in customer_data.items():
			if key not in ["email", "phone", "address"]:
				setattr(customer, key, value)

		customer.ignore_version = True
		customer.save()

		# Update email_id and mobile_no directly on Customer doctype for consistency
		if email:
			customer.email_id = email
		if phone:
			customer.mobile_no = phone

		# Update the primary contact's child tables if email or phone changed
		if customer.customer_primary_contact and (email or phone):
			try:
				contact_doc = frappe.get_doc("Contact", customer.customer_primary_contact)

				# Update email in child table
				if email:
					contact_doc.email_ids = []
					contact_doc.append("email_ids", {"email_id": email, "is_primary": 1})

				# Update phone in child table
				if phone:
					contact_doc.phone_nos = []
					contact_doc.append(
						"phone_nos",
						{
							"phone": phone,
							"is_primary_mobile_no": 1,
							"is_primary_phone": 1,
						},
					)

				contact_doc.save()
			except Exception:
				frappe.log_error(
					frappe.get_traceback(),
					f"Error updating contact for customer {customer_id}",
				)

		# Update address if address data is provided
		if address_data and any(
			address_data.get(field) for field in ["street", "city", "state", "zipCode", "buildingNumber"]
		):
			try:
				addr_doc = create_or_update_address(customer_id, customer_name, address_data, country)
				if addr_doc:
					frappe.db.set_value(
						"Customer",
						customer_id,
						"customer_primary_address",
						addr_doc.name,
					)
			except Exception:
				frappe.log_error(
					frappe.get_traceback(),
					f"Error updating address for customer {customer_id}",
				)

		return {"success": True, "updated_customer": customer.name}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Update Customer Error")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_customer_statistics(customer_id):
	"""Get customer statistics including total orders and total spent"""
	try:
		# Get total invoices (orders) for the customer
		total_orders = frappe.db.count(
			"Sales Invoice",
			filters={
				"customer": customer_id,
				"docstatus": 1,
				"is_return": 0,
				"status": ["!=", "Cancelled"],
				"custom_pos_opening_entry": ["!=", ""],  # Only POS-created invoices
			},
		)

		# Get total amount spent by the customer
		total_spent_result = frappe.db.sql(
			"""
            SELECT COALESCE(SUM(grand_total), 0) as total_spent
            FROM `tabSales Invoice`
            WHERE customer = %s
            AND docstatus = 1
            AND is_return = 0
            AND status != 'Cancelled'
            AND custom_pos_opening_entry IS NOT NULL
            AND custom_pos_opening_entry != ''
        """,
			(customer_id,),
			as_dict=True,
		)

		total_spent = total_spent_result[0].total_spent if total_spent_result else 0

		# Get last visit date (most recent invoice date)
		last_visit_result = frappe.db.sql(
			"""
            SELECT MAX(posting_date) as last_visit
            FROM `tabSales Invoice`
            WHERE customer = %s
            AND docstatus = 1
            AND is_return = 0
            AND status != 'Cancelled'
            AND custom_pos_opening_entry IS NOT NULL
            AND custom_pos_opening_entry != ''
        """,
			(customer_id,),
			as_dict=True,
		)

		last_visit = last_visit_result[0].last_visit if last_visit_result else None

		return {
			"success": True,
			"data": {
				"total_orders": total_orders,
				"total_spent": total_spent,
				"last_visit": last_visit,
			},
		}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error fetching customer statistics")
		return {"success": False, "error": str(e)}


@frappe.whitelist(allow_guest=True)
def get_global_totals():
	"""Return global totals for customers and invoices for dashboard cards."""
	try:
		total_customers = frappe.db.count("Customer")
		total_invoices = frappe.db.count(
			"Sales Invoice",
			filters={
				"docstatus": 1,
				"is_return": 0,
				"status": ["!=", "Cancelled"],
				"custom_pos_opening_entry": ["!=", ""],  # Only POS-created invoices
			},
		)
		return {
			"success": True,
			"total_customers": total_customers,
			"total_invoices": total_invoices,
		}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Get Global Customer Totals Error")
		return {
			"success": False,
			"error": str(e),
			"total_customers": 0,
			"total_invoices": 0,
		}


@frappe.whitelist(allow_guest=False)
def check_customer_permission(customer_name):
	"""Check if user has permission to access a specific customer"""
	try:
		# Get POS profile details
		pos_profile = get_current_pos_profile()
		business_type = getattr(pos_profile, "custom_business_type", "B2C")

		# Get customer groups from POS profile if configured
		customer_group_names = []
		if hasattr(pos_profile, "customer_groups") and pos_profile.customer_groups:
			customer_group_names = [d.customer_group for d in pos_profile.customer_groups if d.customer_group]

		# Get user permissions for Customer doctype
		user_permitted = frappe.permissions.get_user_permissions(frappe.session.user)
		permitted_customer_names = []
		has_customer_permissions = False
		if user_permitted and "Customer" in user_permitted:
			permitted_customer_names = [perm.get("doc") for perm in user_permitted["Customer"]]
			has_customer_permissions = True

		# Check if user has permission to access this specific customer
		has_permission = True

		# Check user permissions first
		if has_customer_permissions:
			if customer_name not in permitted_customer_names:
				has_permission = False
				frappe.logger().info(f"User does not have permission to access customer: {customer_name}")

		# If user has permission, check business type and customer groups
		if has_permission:
			# Get customer details
			customer = frappe.get_doc("Customer", customer_name)

			# Check business type
			if business_type == "B2C" and customer.customer_type == "Company":
				has_permission = False
				frappe.logger().info(f"B2C business type: Customer {customer_name} is Company type")
			elif business_type == "B2B" and customer.customer_type == "Individual":
				has_permission = False
				frappe.logger().info(f"B2B business type: Customer {customer_name} is Individual type")

			# Check customer groups if configured
			if has_permission and customer_group_names:
				if customer.customer_group not in customer_group_names:
					has_permission = False
					frappe.logger().info(
						f"Customer {customer_name} not in allowed groups: {customer_group_names}"
					)

		return {
			"success": True,
			"has_permission": has_permission,
			"customer_name": customer_name,
			"business_type": business_type,
			"customer_groups": customer_group_names,
			"user_permissions": len(permitted_customer_names) if has_customer_permissions else 0,
		}

	except Exception as e:
		frappe.logger().error(f"Error checking customer permission: {e!s}")
		return {"success": False, "error": str(e), "has_permission": False}


def update_pos_customer_loyalty(doc, method=None):
	"""
	Hook function triggered when a Loyalty Point Entry is created, modified or deleted.
	Synchronizes the active loyalty points in real-time to the custom POS Customer DocType.
	"""
	try:
		if getattr(doc, "customer", None):
			import frappe
			# 1. Sum up all active loyalty points for this customer
			points_query = frappe.db.sql("""
				SELECT SUM(loyalty_points) 
				FROM `tabLoyalty Point Entry` 
				WHERE customer = %s 
				  AND (expiry_date IS NULL OR expiry_date >= CURDATE())
			""", (doc.customer,))
			points = points_query[0][0] or 0.0
			
			# 2. Check if a POS Customer record exists for this customer name/ID
			pos_cust = frappe.db.get_value("POS Customer", {"customer_name": doc.customer}, "name")
			if not pos_cust:
				pos_cust = frappe.db.get_value("POS Customer", {"name": doc.customer}, "name")
				
			if pos_cust:
				# 3. Update the loyalty points directly in the database
				frappe.db.set_value("POS Customer", pos_cust, "loyalty_points", points)
				frappe.db.commit()
				frappe.logger().info(f"Loyalty Sync: Updated POS Customer '{pos_cust}' points to {points}")
	except Exception as e:
		import frappe
		frappe.logger().error(f"Loyalty Sync Error: Failed to update POS Customer loyalty points: {e!s}")
