# -*- coding: utf-8 -*-
# Sultan Terminal Monitor API endpoints (Frappe Server app)

import frappe
import json
from frappe import _
from frappe.utils import flt, get_timestamp, get_datetime, format_datetime, now_datetime

@frappe.whitelist(allow_guest=False)
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



@frappe.whitelist(allow_guest=False)
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


@frappe.whitelist(allow_guest=False)
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
        
        try:
            fetch_res = subprocess.run(
                ["git", "-c", "safe.directory=*", "fetch", "--quiet", "origin"],
                cwd=repo_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=25,
                check=False
            )
            if current_branch and current_branch != "HEAD":
                subprocess.run(
                    ["git", "-c", "safe.directory=*", "fetch", "--quiet", "origin", f"+{current_branch}:refs/remotes/origin/{current_branch}"],
                    cwd=repo_path,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=25,
                    check=False
                )
        except Exception as e:
            frappe.log_error(f"Git fetch failed during update check: {str(e)}", "Terminal Monitor Update Check")
            
        target_ref = f"origin/{current_branch}"
        if cint(simulate_update) != 1:
            verify_res = subprocess.run(
                ["git", "-c", "safe.directory=*", "rev-parse", "--verify", target_ref],
                cwd=repo_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=5
            )
            if verify_res.returncode != 0:
                for candidate in ["origin/main", "origin/master", "origin/develop", "FETCH_HEAD"]:
                    v_res = subprocess.run(
                        ["git", "-c", "safe.directory=*", "rev-parse", "--verify", candidate],
                        cwd=repo_path,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        timeout=5
                    )
                    if v_res.returncode == 0:
                        target_ref = candidate
                        if candidate.startswith("origin/"):
                            current_branch = candidate.replace("origin/", "")
                        break
                else:
                    return {
                        "version": current_version,
                        "branch": current_branch,
                        "update_available": False,
                        "commits_behind": 0
                    }

        compare_range = "HEAD~1..HEAD" if cint(simulate_update) == 1 else f"HEAD..{target_ref}"

        res = subprocess.run(
            ["git", "-c", "safe.directory=*", "rev-list", "--count", compare_range],
            cwd=repo_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10
        )
        behind_count = 0
        if res.returncode == 0 and res.stdout.strip().isdigit():
            behind_count = int(res.stdout.strip())
        else:
            return {
                "version": current_version,
                "branch": current_branch,
                "update_available": False,
                "commits_behind": 0
            }
            
        return {
            "version": current_version,
            "branch": current_branch,
            "update_available": behind_count > 0,
            "commits_behind": behind_count,
            "simulated": cint(simulate_update) == 1
        }
    except Exception:
        import managely_terminal
        cur_ver = getattr(managely_terminal, "__version__", "0.0.1")
        return {"version": cur_ver, "branch": "main", "update_available": False, "commits_behind": 0}


@frappe.whitelist(allow_guest=False)
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


@frappe.whitelist(allow_guest=False)
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


@frappe.whitelist(allow_guest=False)
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


@frappe.whitelist(allow_guest=False)
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


@frappe.whitelist(allow_guest=False)
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


@frappe.whitelist(allow_guest=True)
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


@frappe.whitelist(allow_guest=False)
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

@frappe.whitelist(allow_guest=False)
def trigger_pull_db(terminal_id):
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

@frappe.whitelist(allow_guest=False)
def receive_db_file():
    try:
        data = json.loads(frappe.request.get_data())
        terminal_id = data.get('terminal_id')
        success = data.get('success')
        
        if not terminal_id:
            return {'success': False, 'error': 'Missing terminal_id'}
            
        rel_url = ''
        error_msg = data.get('error', '')
        
        if success and data.get('file_data'):
            file_bytes = base64.b64decode(data.get('file_data'))
            filename = 'db_{}.db'.format(terminal_id.replace(' ', '_'))
            public_path = os.path.join(frappe.get_site_path('public'), 'files')
            if not os.path.exists(public_path):
                os.makedirs(public_path, exist_ok=True)
                
            full_path = os.path.join(public_path, filename)
            with open(full_path, 'wb') as f:
                f.write(file_bytes)
                
            rel_url = '/files/{}'.format(filename)
            
        payload = {
            'success': success,
            'download_url': rel_url,
            'error': error_msg,
            'timestamp': frappe.utils.now_datetime().timestamp()
        }
        
        frappe.cache().set_value('terminal_db_payload:{}'.format(terminal_id), payload, expires_in_sec=180)

        frappe.publish_realtime(
            event='server:display_db_file',
            message={
                'terminal_id': terminal_id,
                'success': success,
                'download_url': rel_url,
                'error': error_msg
            }
        )
        return {'success': True}
    except Exception as e:
        frappe.log_error(message=frappe.get_traceback(), title='Terminal Receive DB File Error')
        return {'success': False, 'error': str(e)}

@frappe.whitelist(allow_guest=False)
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

@frappe.whitelist(allow_guest=False)
def upload_restore_db(terminal_id, file_name, file_data):
    if frappe.session.user != 'Administrator':
        frappe.throw('Not authorized.', frappe.PermissionError)
        
    try:
        # Decode and save incoming database file temporarily
        file_bytes = base64.b64decode(file_data)
        
        # Save to public/files/restore
        filename = 'restore_{}_{}'.format(terminal_id.replace(' ', '_'), file_name)
        public_path = os.path.join(frappe.get_site_path('public'), 'files', 'restore')
        if not os.path.exists(public_path):
            os.makedirs(public_path, exist_ok=True)
            
        full_path = os.path.join(public_path, filename)
        with open(full_path, 'wb') as f:
            f.write(file_bytes)
            
        # Get absolute or relative URL to the restore file
        # We need site URL to let Electron download it
        site_url = frappe.utils.get_url()
        download_url = '{}/files/restore/{}'.format(site_url.rstrip('/'), filename)
        
        # Send command to terminal
        cmd_payload = {
            'type': 'restore_db_file',
            'download_url': download_url
        }
        frappe.cache().set_value('terminal_cmd:{}'.format(terminal_id), cmd_payload, expires_in_sec=120)
        
        try:
            frappe.publish_realtime(
                event='server:restore_db_file',
                message={'download_url': download_url},
                room='task_progress:terminal:{}'.format(terminal_id)
            )
        except Exception:
            pass
            
        return {'success': True, 'message': 'Database file uploaded. Relaying command to cash terminal...'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

@frappe.whitelist(allow_guest=False)
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

@frappe.whitelist(allow_guest=False)
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


@frappe.whitelist(allow_guest=False)
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

@frappe.whitelist(allow_guest=False)
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

@frappe.whitelist(allow_guest=False)
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

@frappe.whitelist(allow_guest=False)
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
