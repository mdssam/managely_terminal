# -*- coding: utf-8 -*-
import frappe
import os
import shutil

@frappe.whitelist()
def upload_update(filename, chunk_index, is_last):
    """
    Accepts raw binary chunks via POST body.
    Requires System Manager role.
    """
    if "System Manager" not in frappe.get_roles(frappe.session.user):
        frappe.throw("Not Authorized. System Manager role required to deploy updates.", frappe.PermissionError)

    # Security check: only allow .yml, .exe, .blockmap
    if not (filename.endswith('.yml') or filename.endswith('.exe') or filename.endswith('.blockmap')):
        frappe.throw("Invalid file type")

    chunk_data = frappe.request.get_data()
    if not chunk_data:
        frappe.throw("No data received in chunk")

    updates_dir = frappe.get_site_path('public', 'files', 'updates')
    if not os.path.exists(updates_dir):
        os.makedirs(updates_dir, exist_ok=True)

    file_path = os.path.join(updates_dir, filename)
    
    # If first chunk, overwrite/create file. Also clean up old versions.
    if int(chunk_index) == 0:
        mode = 'wb'
        ext = os.path.splitext(filename)[1]
        # Only delete old .exe and .blockmap files. NEVER delete .yml files because latest.yml and latest-ia32.yml must co-exist!
        if ext in ('.exe', '.blockmap'):
            for f in os.listdir(updates_dir):
                if f.endswith(ext) and f != filename:
                    try:
                        os.remove(os.path.join(updates_dir, f))
                    except Exception:
                        pass
    else:
        mode = 'ab'
    
    with open(file_path, mode) as f:
        f.write(chunk_data)

    # When upload of a .yml finishes, ensure both latest.yml and latest-ia32.yml exist
    if is_last in ["true", "1", 1, True] and filename.endswith('.yml'):
        try:
            latest_path = os.path.join(updates_dir, 'latest.yml')
            latest_ia32_path = os.path.join(updates_dir, 'latest-ia32.yml')
            if filename == 'latest.yml' and not os.path.exists(latest_ia32_path):
                shutil.copyfile(latest_path, latest_ia32_path)
            elif filename == 'latest-ia32.yml' and not os.path.exists(latest_path):
                shutil.copyfile(latest_ia32_path, latest_path)
        except Exception:
            pass

    return {
        "success": True,
        "message": f"Chunk {chunk_index} received",
        "finished": is_last in ["true", "1", 1, True]
    }
