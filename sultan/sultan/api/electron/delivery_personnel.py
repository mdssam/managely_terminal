# Copyright (c) 2026, Beveren Software Inc and contributors
# For license information, please see license.txt

import frappe


def save_driver_attachment(docname, fieldname, base64_data):
	if not base64_data or not base64_data.startswith("data:"):
		return None
	try:
		from frappe.utils.file_manager import save_file
		# base64_data format: "data:image/png;base64,iVBORw0K..."
		header, base64_str = base64_data.split(";base64,")
		mime_type = header.replace("data:", "")
		# Determine file extension from mime type
		ext = "png"
		if "pdf" in mime_type:
			ext = "pdf"
		elif "jpeg" in mime_type or "jpg" in mime_type:
			ext = "jpg"
		
		# Generate file name
		filename = f"driver_{docname}_{fieldname}.{ext}"
		
		# Delete old attachment if it exists
		old_files = frappe.get_all("File", filters={"attached_to_doctype": "Delivery Personnel", "attached_to_name": docname, "attached_to_field": fieldname})
		for f in old_files:
			frappe.delete_doc("File", f.name)
		
		file_doc = save_file(
			fname=filename,
			content=base64_str,
			dt="Delivery Personnel",
			dn=docname,
			decode=True,
			is_private=0
		)
		# set field value to file URL
		frappe.db.set_value("Delivery Personnel", docname, fieldname, file_doc.file_url)
		return file_doc.file_url
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), f"Error saving driver attachment {fieldname}")
		return None


@frappe.whitelist()
def get_delivery_personnel_list():
	"""Get list of all delivery personnel."""
	try:
		if not frappe.db.exists("DocType", "Delivery Personnel"):
			return {"success": True, "data": []}
		personnel = frappe.get_all(
			"Delivery Personnel",
			fields=[
				"name", 
				"delivery_personnel", 
				"phone", 
				"custom_photo", 
				"custom_driver_license", 
				"custom_vehicle_license", 
				"custom_national_id",
				"custom_pos_profile"
			],
			order_by="delivery_personnel asc",
		)
		return {"success": True, "data": personnel}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error fetching delivery personnel")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def add_delivery_personnel(name, phone=None, photo=None, driver_license=None, vehicle_license=None, national_id=None, pos_profile=None):
	try:
		if not name:
			return {"success": False, "error": "Name is required"}
		if frappe.db.exists("Delivery Personnel", name):
			return {"success": False, "error": f"Driver '{name}' already exists"}
		
		doc = frappe.get_doc({
			"doctype": "Delivery Personnel",
			"delivery_personnel": name,
			"phone": phone,
			"cell_number": phone,
			"custom_pos_profile": pos_profile
		})
		doc.insert(ignore_permissions=True)
		
		# Save attachments
		if photo:
			save_driver_attachment(name, "custom_photo", photo)
		if driver_license:
			save_driver_attachment(name, "custom_driver_license", driver_license)
		if vehicle_license:
			save_driver_attachment(name, "custom_vehicle_license", vehicle_license)
		if national_id:
			save_driver_attachment(name, "custom_national_id", national_id)
		
		return {"success": True, "data": {"name": doc.name, "delivery_personnel": doc.delivery_personnel, "phone": phone}}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error adding delivery personnel")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def edit_delivery_personnel(old_name, new_name, phone=None, photo=None, driver_license=None, vehicle_license=None, national_id=None, pos_profile=None):
	try:
		if not old_name or not new_name:
			return {"success": False, "error": "Old name and new name are required"}
		if old_name != new_name and frappe.db.exists("Delivery Personnel", new_name):
			return {"success": False, "error": f"Driver '{new_name}' already exists"}
		
		# Rename if name changed
		if old_name != new_name:
			frappe.rename_doc("Delivery Personnel", old_name, new_name, force=True)
			
		# Update driver fields
		doc = frappe.get_doc("Delivery Personnel", new_name)
		doc.phone = phone
		doc.cell_number = phone
		doc.custom_pos_profile = pos_profile
		doc.save(ignore_permissions=True)
		
		# Save attachments
		if photo:
			save_driver_attachment(new_name, "custom_photo", photo)
		if driver_license:
			save_driver_attachment(new_name, "custom_driver_license", driver_license)
		if vehicle_license:
			save_driver_attachment(new_name, "custom_vehicle_license", vehicle_license)
		if national_id:
			save_driver_attachment(new_name, "custom_national_id", national_id)
			
		return {"success": True}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error editing delivery personnel")
		return {"success": False, "error": str(e)}
