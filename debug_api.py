import sys
import os

os.chdir("/home/abeddy/techstation-meta")

# Add site packages path to sys.path
sys.path.append("/home/abeddy/techstation-meta/apps/frappe")
sys.path.append("/home/abeddy/techstation-meta/apps/erpnext")
sys.path.append("/home/abeddy/techstation-meta/apps/klik_pos")
sys.path.append("/home/abeddy/techstation-meta/apps/sultan")

import frappe
import logging

# Mock logger to prevent file based logger issues
def mock_logger(*args, **kwargs):
    l = logging.getLogger("frappe_stub")
    l.setLevel(logging.DEBUG)
    return l
frappe.logger = mock_logger

def debug():
    frappe.init(site="manu.com", sites_path="/home/abeddy/techstation-meta/sites")
    frappe.connect()
    
    # Authenticate as Administrator for debugging
    frappe.set_user("Administrator")
    
    print("Attempting to import and run get_pos_details...")
    from sultan.sultan.api.pos_profile import get_pos_details
    
    try:
        result = get_pos_details()
        print("SUCCESS:", result)
    except Exception as e:
        print("FAILED WITH EXCEPTION:")
        import traceback
        traceback.print_exc()
    finally:
        frappe.destroy()

if __name__ == "__main__":
    debug()
