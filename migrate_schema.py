import sys
import os
import json

os.chdir("/home/abeddy/techstation-meta")

sys.path.append("/home/abeddy/techstation-meta/apps/frappe")
sys.path.append("/home/abeddy/techstation-meta/apps/erpnext")

import frappe
import logging

# Mock logger
def mock_logger(*args, **kwargs):
    l = logging.getLogger("frappe_stub")
    return l
frappe.logger = mock_logger

def migrate():
    frappe.init(site="manu.com", sites_path="/home/abeddy/techstation-meta/sites")
    frappe.connect()
    
    print("Initiating schema patching...")
    fixtures_path = "/home/abeddy/techstation-meta/apps/klik_pos/klik_pos/fixtures/custom_field.json"
    
    with open(fixtures_path, "r") as f:
        data = json.load(f)
    
    print(f"Found {len(data)} custom fields in definitions.")
    
    count_added = 0
    count_skipped = 0
    
    for field_dict in data:
        # Ensure explicit name exists
        if "name" not in field_dict:
            field_dict["name"] = f"{field_dict['dt']}-{field_dict['fieldname']}"
        
        field_name = field_dict["name"]
        
        if not frappe.db.exists("Custom Field", field_name):
            try:
                # Validate dependency options: If a Link/Table field points to non-existent Doctype, skip it to avoid blocking
                if field_dict.get("fieldtype") in ["Link", "Table", "Table MultiSelect"]:
                    opts = field_dict.get("options")
                    if opts and not frappe.db.exists("DocType", opts):
                         print(f"Skipping {field_name} because DocType '{opts}' is missing.")
                         continue

                doc = frappe.get_doc(field_dict)
                doc.modified = None
                doc.creation = None
                # Disable mandatory validations that can trigger global rollbacks on doctype meta errors
                doc.flags.ignore_validate = True
                doc.insert(ignore_permissions=True)
                print(f"Added: {field_name}")
                count_added += 1
                # Commit frequently to prevent partial cascaded failures
                frappe.db.commit()
            except Exception as e:
                print(f"Error adding {field_name}: {str(e)}")
        else:
            count_skipped += 1
            
    frappe.db.commit()
    print(f"\nPatching finished! Added {count_added} fields. {count_skipped} already existed.")
    frappe.destroy()

if __name__ == "__main__":
    migrate()
