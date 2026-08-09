# -*- coding: utf-8 -*-
# Sultan Terminal Monitor API endpoints (Frappe Server app)

import frappe
import json
from frappe import _
from frappe.utils import flt, get_timestamp, get_datetime, format_datetime, now_datetime

@frappe.whitelist()
def heartbeat():
    """
    Called by the Electron terminal client every 15 seconds to update its online status.
    Requires API Key / Secret auth.
    """
    try:
        params = frappe.local.form_dict
        if not params.get('terminal_id'):
            try:
                params = json.loads(frappe.request.get_data())
            except Exception:
                pass

        terminal_id = params.get('terminal_id')
        if not terminal_id:
            return {"success": False, "error": "Missing terminal_id"}
            
        branch_name = params.get('branch_name', '')
        pos_profile = params.get('pos_profile', '')
        username = params.get('active_user', '')
        app_version = params.get('app_version', '')
        
        # Get active terminals list from cache
        terminals = frappe.cache().get_value("active_terminals") or {}
        
        # Support both flat keys and nested 'telemetry' object
        telemetry = params.get('telemetry') or {}
        if isinstance(telemetry, str):
            try:
                telemetry = json.loads(telemetry)
            except:
                telemetry = {}
                
        # Update terminal status details
        terminals[terminal_id] = {
            "terminal_id": terminal_id,
            "branch_name": branch_name,
            "pos_profile": pos_profile,
            "status": "Online",
            "username": username,
            "app_version": app_version,
            "pending_invoices": params.get('pending_invoices') or telemetry.get('pending_invoices', 0),
            "pending_cash_transactions": params.get('pending_cash_transactions') or telemetry.get('pending_cash_transactions', 0),
            "pending_sync_queue": params.get('pending_sync_queue') or telemetry.get('pending_sync_queue', 0),
            "db_size_mb": params.get('db_size_mb') or telemetry.get('db_size_mb', 0.0),
            "ram_usage_mb": params.get('ram_usage_mb') or telemetry.get('ram_usage_mb', 0.0),
            "last_ping": frappe.utils.now_datetime().timestamp() * 1000
        }
        
        # Save cache state (long lived container)
        frappe.cache().set_value("active_terminals", terminals, expires_in_sec=86400)
        
        # Save specific terminal online state with a 35 seconds TTL
        frappe.cache().set_value(f"terminal_status:{terminal_id}", "Online", expires_in_sec=35)
        
        # Check for pending commands delivered via heartbeat (reliable fallback for Socket.io)
        pending_cmd = frappe.cache().get_value(f"terminal_cmd:{terminal_id}")
        if pending_cmd:
            frappe.cache().delete_value(f"terminal_cmd:{terminal_id}")
            return {"success": True, "site_name": frappe.local.site, "command": pending_cmd}
        
        return {"success": True, "site_name": frappe.local.site}
    except Exception as e:
        frappe.log_error(message=frappe.get_traceback(), title="Terminal Heartbeat Error")
        return {"success": False, "error": str(e)}



@frappe.whitelist()
def get_latest_pos_version():
    import os
    try:
        yml_path = frappe.get_site_path("public", "files", "updates", "latest.yml")
        if os.path.exists(yml_path):
            with open(yml_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("version:"):
                        return line.split(":")[1].strip()
    except Exception:
        pass
    return ""


@frappe.whitelist()
def check_app_update_status(simulate_update=False):
    """
    Checks if there are available git updates for the managely_terminal server app.
    Accessible only to Administrator.
    """
    if frappe.session.user != "Administrator":
        frappe.throw("Not authorized.", frappe.PermissionError)
        
    import subprocess, os
    from frappe.utils import cint
    try:
        app_path = frappe.get_app_path("managely_terminal")
        repo_path = os.path.dirname(app_path)
        
        import managely_terminal
        current_version = getattr(managely_terminal, "__version__", "0.0.1")
        
        # Dynamically determine the current checked out git branch with safe.directory configuration
        branch_res = subprocess.run(
            ["git", "-c", "safe.directory=*", "branch", "--show-current"],
            cwd=repo_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5
        )
        current_branch = branch_res.stdout.strip()
        if not current_branch:
            ref_res = subprocess.run(
                ["git", "-c", "safe.directory=*", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=repo_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=5
            )
            current_branch = ref_res.stdout.strip()
            if current_branch == "HEAD" or not current_branch:
                current_branch = "main"
        
        local_res = subprocess.run(
            ["git", "-c", "safe.directory=*", "rev-parse", "HEAD"],
            cwd=repo_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5
        )
        local_sha = local_res.stdout.strip()
        
        remote_sha = ""
        if cint(simulate_update) != 1:
            ls_res = subprocess.run(
                ["git", "-c", "safe.directory=*", "ls-remote", "--heads", "origin", current_branch],
                cwd=repo_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=15
            )
            if ls_res.returncode == 0 and ls_res.stdout.strip():
                remote_sha = ls_res.stdout.strip().split()[0]
            
            if not remote_sha:
                for candidate in ["main", "master", "develop"]:
                    c_res = subprocess.run(
                        ["git", "-c", "safe.directory=*", "ls-remote", "--heads", "origin", candidate],
                        cwd=repo_path,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        timeout=10
                    )
                    if c_res.returncode == 0 and c_res.stdout.strip():
                        remote_sha = c_res.stdout.strip().split()[0]
                        current_branch = candidate
                        break
        
        if cint(simulate_update) == 1:
            update_available = True
        elif local_sha and remote_sha and len(local_sha) >= 40 and len(remote_sha) >= 40:
            update_available = (local_sha != remote_sha)
        else:
            update_available = False
            
        return {
            "version": current_version,
            "branch": current_branch,
            "update_available": update_available,
            "commits_behind": 1 if update_available and cint(simulate_update) == 1 else 0,
            "simulated": cint(simulate_update) == 1
        }
    except Exception:
        import managely_terminal
        cur_ver = getattr(managely_terminal, "__version__", "0.0.1")
        return {"version": cur_ver, "branch": "main", "update_available": False, "commits_behind": 0}


@frappe.whitelist()
def get_active_terminals():
    """
    Returns list of all registered terminals and their current online/offline status.
    Accessible only to Administrator.
    """
    if frappe.session.user != "Administrator":
        frappe.throw("Not authorized to view terminal monitoring panel.", frappe.PermissionError)
        
    try:
        terminals = frappe.cache().get_value("active_terminals")
        if not isinstance(terminals, dict):
            terminals = {}
            
        active_list = []
        now = now_datetime().timestamp()
        
        latest_ver = get_latest_pos_version()
        
        fields_to_fetch = ["name", "owner", "modified"]
        try:
            meta_fields = [df.fieldname for df in frappe.get_meta("POS Profile").fields]
            if "custom_branch_name" in meta_fields or frappe.db.has_column("POS Profile", "custom_branch_name"):
                fields_to_fetch.append("custom_branch_name")
            if "custom_pos_cipher" in meta_fields or frappe.db.has_column("POS Profile", "custom_pos_cipher"):
                fields_to_fetch.append("custom_pos_cipher")
            all_profiles = frappe.get_all("POS Profile", fields=fields_to_fetch)
        except Exception:
            all_profiles = frappe.get_all("POS Profile", fields=["name", "owner", "modified"])
        
        registered_ciphers = {}
        for p in all_profiles:
            has_cipher = bool(str(p.get("custom_pos_cipher") or "").strip())
            p["is_registered"] = has_cipher
            if has_cipher:
                registered_ciphers[p.get("custom_pos_cipher").strip()] = p
                
        processed_profile_names = set()
        for term_id, term in list(terminals.items()):
            if not isinstance(term, dict):
                continue
            pos_profile_name = term.get("pos_profile")
            profile_doc = None
            for p in all_profiles:
                if p.get("name") == pos_profile_name or (p.get("custom_pos_cipher") and p.get("custom_pos_cipher").strip() == term_id):
                    profile_doc = p
                    break
                    
            is_online = frappe.cache().get_value(f"terminal_status:{term_id}") == "Online"
            term["status"] = "Online" if is_online else "Offline"
            term["latest_version"] = latest_ver
            
            cur_ver = str(term.get("app_version", "")).strip().lstrip("vV")
            latest_clean = str(latest_ver).strip().lstrip("vV")
            term["is_outdated"] = bool(latest_clean and cur_ver and cur_ver != latest_clean)
            
            if profile_doc:
                term["is_registered"] = profile_doc.get("is_registered", False)
                term["branch_name"] = str(profile_doc.get("custom_branch_name") or profile_doc.get("name") or term.get("branch_name") or "").strip()
                processed_profile_names.add(profile_doc.get("name"))
            else:
                term["is_registered"] = bool(term_id in registered_ciphers)
                
            last_ping = flt(term.get("last_ping") or 0)
            if last_ping > 0:
                try:
                    import datetime
                    dt_obj = datetime.datetime.fromtimestamp(last_ping / 1000.0)
                    term["last_online"] = dt_obj.strftime("%Y-%m-%d %H:%M:%S")
                    term["last_online_user"] = dt_obj.strftime("%d-%m-%Y %H:%M:%S")
                except Exception:
                    term["last_online"] = _("Never Online")
                    term["last_online_user"] = _("Never Online")
            else:
                term["last_online"] = _("Never Online")
                term["last_online_user"] = _("Never Online")
                
            active_list.append(term)
            
        for p in all_profiles:
            if p.get("is_registered") and p.get("name") not in processed_profile_names:
                mod_ts = get_timestamp(p.get("modified")) * 1000 if p.get("modified") else 0
                try:
                    mod_dt = get_datetime(p.get("modified")) if p.get("modified") else None
                    if not mod_dt and mod_ts > 0:
                        import datetime
                        mod_dt = datetime.datetime.fromtimestamp(mod_ts / 1000.0)
                    dt_str = mod_dt.strftime("%Y-%m-%d %H:%M:%S") if mod_dt else _("Never Online")
                    dt_str_user = mod_dt.strftime("%d-%m-%Y %H:%M:%S") if mod_dt else _("Never Online")
                except Exception:
                    dt_str = _("Never Online")
                    dt_str_user = _("Never Online")
                
                synth_term = {
                    "terminal_id": p.get("custom_pos_cipher") or p.get("name"),
                    "branch_name": str(p.get("custom_branch_name") or p.get("name")).strip(),
                    "pos_profile": p.get("name"),
                    "status": "Offline",
                    "username": p.get("owner") or "",
                    "app_version": "Unknown",
                    "pending_invoices": 0,
                    "pending_cash_transactions": 0,
                    "pending_sync_queue": 0,
                    "db_size_mb": 0.0,
                    "ram_usage_mb": 0.0,
                    "last_ping": mod_ts,
                    "last_online": dt_str,
                    "last_online_user": dt_str_user,
                    "latest_version": latest_ver,
                    "is_outdated": False,
                    "is_registered": True
                }
                active_list.append(synth_term)
                
        active_list.sort(key=lambda x: (0 if x.get("status") == "Online" else 1, str(x.get("branch_name", "")).lower()))
        
        return active_list
    except Exception as e:
        frappe.log_error(message=frappe.get_traceback(), title="Terminal Monitor Get Active Terminals Error")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def trigger_pull_logs(terminal_id, limit=200, from_date=None, to_date=None):
    """
    Triggers log extraction on the client machine via Socket.io.
    Accessible only to Administrator.
    """
    if frappe.session.user != "Administrator":
        frappe.throw("Not authorized.", frappe.PermissionError)
        
    try:
        # Publish Socket event directed to the terminal's room
        cmd_payload = {
            "type": "request_logs",
            "limit": int(limit),
            "log_type": "all",
            "from_date": from_date,
            "to_date": to_date
        }
        # Store in cache so heartbeat picks it up (reliable delivery)
        frappe.cache().set_value(f"terminal_cmd:{terminal_id}", cmd_payload, expires_in_sec=120)
        # Also push via Socket.io (best effort)
        try:
            frappe.publish_realtime(
                event='server:request_logs',
                message={
                    'limit': int(limit),
                    'type': 'all',
                    'from_date': from_date,
                    'to_date': to_date
                },
                room="task_progress:terminal:{}".format(terminal_id)
            )
        except Exception:
            pass
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def receive_logs():
    """
    Callback endpoint called by the Electron client to submit the pulled logs.
    Relays logs back to the Administrator's browser in real-time.
    """
    try:
        data = json.loads(frappe.request.get_data())
        terminal_id = data.get('terminal_id')
        success = data.get('success')
        
        if not terminal_id:
            return {"success": False, "error": "Missing terminal_id"}
            
        # Store in cache for polling fallback
        frappe.cache().set_value(f"terminal_logs_payload:{terminal_id}", {
            'success': success,
            'data': data.get('data', {}),
            'error': data.get('error', ''),
            'action': data.get('action', ''),
            'timestamp': frappe.utils.now_datetime().timestamp()
        }, expires_in_sec=180)

        # Relay data to the client admin page via public socket event
        frappe.publish_realtime(
            event='server:display_logs',
            message={
                'terminal_id': terminal_id,
                'success': success,
                'data': data.get('data', {}),
                'error': data.get('error', ''),
                'action': data.get('action', '')
            }
        )
        return {"success": True}
    except Exception as e:
        frappe.log_error(message=frappe.get_traceback(), title="Terminal Receive Logs Error")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def force_requeue(terminal_id, payload_type, payload_id, new_payload=None):
    """
    Triggers force re-sync of a specific transaction local to a terminal via Socket.io.
    Accessible only to Administrator.
    """
    if frappe.session.user != "Administrator":
        frappe.throw("Not authorized.", frappe.PermissionError)
        
    try:
        # Cache queue command fallback
        cmd_payload = {
            "type": "force_queue",
            "payload_type": payload_type,
            "payload_id": payload_id,
            "new_payload": new_payload
        }
        frappe.cache().set_value(f"terminal_cmd:{terminal_id}", cmd_payload, expires_in_sec=120)

        frappe.publish_realtime(
            event='server:force_queue',
            message={
                'payload_type': payload_type,
                'payload_id': payload_id,
                'new_payload': new_payload
            },
            room="task_progress:terminal:{}".format(terminal_id)
        )
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def migrate_and_clear_cache():
    """
    Executes full site migration via bench subprocess to avoid crashing the current gunicorn worker.
    """
    if frappe.session.user != "Administrator":
        frappe.throw("Not authorized", frappe.PermissionError)
    
    import subprocess
    from frappe.utils import get_bench_path
    
    try:
        bench_path = get_bench_path()
        site_name = frappe.local.site
        
        # Run bench migrate in a subprocess
        result = subprocess.run(
            ["bench", "--site", site_name, "migrate"],
            cwd=bench_path,
            capture_output=True,
            text=True
        )
        
        log_output = result.stdout
        if result.stderr:
            log_output += "\n" + result.stderr
            
        if result.returncode == 0:
            return {"success": True, "message": "Site migration completed successfully!", "log": log_output}
        else:
            return {"success": False, "error": "Migration command failed", "log": log_output}
    except Exception as e:
        return {"success": False, "error": str(e), "log": str(e)}


@frappe.whitelist()
def reload_terminal_monitor_page():
    """
    Utility endpoint to force reload the terminal_monitor page record from disk to database.
    """
    try:
        frappe.reload_doc("managely_terminal", "page", "terminal_monitor")
        frappe.db.commit()
        return {"success": True, "message": "Page reloaded successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_pulled_logs(terminal_id):
    """
    Called by the browser to fetch cached logs (fallback for Socket.io).
    """
    if frappe.session.user != "Administrator":
        frappe.throw("Not authorized.", frappe.PermissionError)
        
    try:
        logs = frappe.cache().get_value(f"terminal_logs_payload:{terminal_id}")
        if logs:
            # Delete after retrieval to avoid double rendering
            frappe.cache().delete_value(f"terminal_logs_payload:{terminal_id}")
            return {"success": True, "logs": logs}
        return {"success": False}
    except Exception as e:
        return {"success": False, "error": str(e)}
import frappe
import json
import base64
import os

@frappe.whitelist()
def trigger_pull_db(terminal_id):
    if frappe.session.user != 'Administrator':
        frappe.throw('Only Administrator can trigger DB pull', frappe.PermissionError)
    try:
        cmd_payload = {
            'type': 'request_db_file'
        }
        frappe.cache().set_value('terminal_cmd:{}'.format(terminal_id), cmd_payload, expires_in_sec=120)
        try:
            frappe.publish_realtime(
                event='server:request_db_file',
                message={},
                room='task_progress:terminal:{}'.format(terminal_id)
            )
        except Exception:
            pass
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}

@frappe.whitelist()
def receive_db_file():
    try:
        data = json.loads(frappe.request.get_data())
        terminal_id = data.get('terminal_id')
        success = data.get('success')
        
        if not terminal_id:
            return {'success': False, 'error': 'Missing terminal_id'}
            
        error_msg = data.get('error', '')
        file_data = data.get('file_data') if success else None
        
        payload = {
            'success': success,
            'file_data': file_data,
            'error': error_msg,
            'timestamp': frappe.utils.now_datetime().timestamp()
        }
        
        frappe.cache().set_value('terminal_db_payload:{}'.format(terminal_id), payload, expires_in_sec=180)

        frappe.publish_realtime(
            event='server:display_db_file',
            message={
                'terminal_id': terminal_id,
                'success': success,
                'file_data': file_data,
                'error': error_msg
            }
        )
        return {'success': True}
    except Exception as e:
        frappe.log_error(message=frappe.get_traceback(), title='Terminal Receive DB File Error')
        return {'success': False, 'error': str(e)}

@frappe.whitelist()
def get_pulled_db(terminal_id):
    if frappe.session.user != 'Administrator':
        frappe.throw('Not authorized.', frappe.PermissionError)
        
    try:
        db_info = frappe.cache().get_value('terminal_db_payload:{}'.format(terminal_id))
        if db_info:
            frappe.cache().delete_value('terminal_db_payload:{}'.format(terminal_id))
            return {'success': True, 'db_info': db_info}
        return {'success': False}
    except Exception as e:
        return {'success': False, 'error': str(e)}
import frappe
import json
import base64
import os

@frappe.whitelist()
def upload_restore_db(terminal_id, file_name, file_data):
    if frappe.session.user != 'Administrator':
        frappe.throw('Not authorized.', frappe.PermissionError)
        
    try:
        # Do not save to disk, pass base64 file data directly to terminal via websocket
        cmd_payload = {
            'type': 'restore_db_file',
            'file_name': file_name,
            'file_data': file_data
        }
        frappe.cache().set_value('terminal_cmd:{}'.format(terminal_id), cmd_payload, expires_in_sec=120)
        
        try:
            frappe.publish_realtime(
                event='server:restore_db_file',
                message={
                    'file_name': file_name,
                    'file_data': file_data
                },
                room='task_progress:terminal:{}'.format(terminal_id)
            )
        except Exception:
            pass
            
        return {'success': True, 'message': 'Database file uploaded. Relaying command to cash terminal...'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

@frappe.whitelist()
def receive_restore_status():
    try:
        data = json.loads(frappe.request.get_data())
        terminal_id = data.get('terminal_id')
        success = data.get('success')
        error_msg = data.get('error', '')
        
        if not terminal_id:
            return {'success': False, 'error': 'Missing terminal_id'}
            
        payload = {
            'success': success,
            'error': error_msg,
            'timestamp': frappe.utils.now_datetime().timestamp()
        }
        
        frappe.cache().set_value('terminal_restore_payload:{}'.format(terminal_id), payload, expires_in_sec=180)

        frappe.publish_realtime(
            event='server:display_restore_status',
            message={
                'terminal_id': terminal_id,
                'success': success,
                'error': error_msg
            }
        )
        return {'success': True}
    except Exception as e:
        frappe.log_error(message=frappe.get_traceback(), title='Terminal Restore DB File Error')
        return {'success': False, 'error': str(e)}

@frappe.whitelist()
def get_restore_status(terminal_id):
    if frappe.session.user != 'Administrator':
        frappe.throw('Not authorized.', frappe.PermissionError)
        
    try:
        res = frappe.cache().get_value('terminal_restore_payload:{}'.format(terminal_id))
        if res:
            frappe.cache().delete_value('terminal_restore_payload:{}'.format(terminal_id))
            return {'success': True, 'restore_info': res}
        return {'success': False}
    except Exception as e:
        return {'success': False, 'error': str(e)}


@frappe.whitelist()
def trigger_execute_sql(terminal_id, query):
    if frappe.session.user != 'Administrator':
        frappe.throw('Not authorized.', frappe.PermissionError)
        
    try:
        cmd_payload = {
            'type': 'execute_sql',
            'query': query
        }
        frappe.cache().set_value('terminal_cmd:{}'.format(terminal_id), cmd_payload, expires_in_sec=120)
        try:
            frappe.publish_realtime(
                event='server:execute_sql',
                message={'query': query},
                room='task_progress:terminal:{}'.format(terminal_id)
            )
        except Exception:
            pass
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}

@frappe.whitelist()
def receive_sql_result():
    try:
        data = json.loads(frappe.request.get_data())
        terminal_id = data.get('terminal_id')
        success = data.get('success')
        
        if not terminal_id:
            return {'success': False, 'error': 'Missing terminal_id'}
            
        payload = {
            'success': success,
            'data': data.get('data'),
            'error': data.get('error'),
            'timestamp': frappe.utils.now_datetime().timestamp()
        }
        
        frappe.cache().set_value('terminal_sql_payload:{}'.format(terminal_id), payload, expires_in_sec=180)

        frappe.publish_realtime(
            event='server:display_sql_result',
            message={
                'terminal_id': terminal_id,
                'success': success,
                'data': data.get('data'),
                'error': data.get('error')
            }
        )
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}

@frappe.whitelist()
def get_sql_result(terminal_id):
    if frappe.session.user != 'Administrator':
        frappe.throw('Not authorized.', frappe.PermissionError)
        
    try:
        res = frappe.cache().get_value('terminal_sql_payload:{}'.format(terminal_id))
        if res:
            frappe.cache().delete_value('terminal_sql_payload:{}'.format(terminal_id))
            return {'success': True, 'sql_info': res}
        return {'success': False}
    except Exception as e:
        return {'success': False, 'error': str(e)}

@frappe.whitelist()
def trigger_relaunch_app(terminal_id):
    if frappe.session.user != 'Administrator':
        frappe.throw('Not authorized.', frappe.PermissionError)
        
    try:
        cmd_payload = {
            'type': 'relaunch_app'
        }
        frappe.cache().set_value('terminal_cmd:{}'.format(terminal_id), cmd_payload, expires_in_sec=120)
        try:
            frappe.publish_realtime(
                event='server:relaunch_app',
                message={},
                room='task_progress:terminal:{}'.format(terminal_id)
            )
        except Exception:
            pass
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def validate_page_permission(doc, method=None):
    """
    Enforces that no role or user can ever be granted access to terminal_monitor page except Administrator.
    """
    if doc.name == "terminal_monitor" or getattr(doc, "page_name", None) == "terminal_monitor":
        if frappe.session.user != "Administrator":
            frappe.throw("Only Administrator can manage permissions or settings for Terminal Monitor.", frappe.PermissionError)
        for r in doc.get("roles"):
            if r.role != "Administrator":
                frappe.throw(f"Role '{r.role}' cannot be assigned to Terminal Monitor. Access is strictly restricted to the Administrator account only.", frappe.PermissionError)
