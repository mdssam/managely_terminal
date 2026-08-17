# -*- coding: utf-8 -*-
# Managely Terminal Monitor API endpoints (Frappe Server app)

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
                
        is_locked = params.get('is_locked') or telemetry.get('is_locked', False)
        hardware_id = params.get('hardware_id', '')
        
        # Detect status transitions for logging
        prev_state = terminals.get(terminal_id, {})
        was_online = prev_state.get('status') == 'Online'
        was_locked = prev_state.get('is_locked', False)
        prev_hw = prev_state.get('last_known_cipher', '')
                
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
            "blackbox_total": params.get('blackbox_total') or telemetry.get('blackbox_total', 0),
            "blackbox_committed": params.get('blackbox_committed') or telemetry.get('blackbox_committed', 0),
            "blackbox_failed": params.get('blackbox_failed') or telemetry.get('blackbox_failed', 0),
            "db_size_mb": params.get('db_size_mb') or telemetry.get('db_size_mb', 0.0),
            "ram_usage_mb": params.get('ram_usage_mb') or telemetry.get('ram_usage_mb', 0.0),
            "is_locked": is_locked,
            "target_device_id": params.get('hardware_id', ''),
            "derived_cipher": params.get('pos_cipher') or params.get('cipher') or '',
            "last_known_cipher": terminals.get(terminal_id, {}).get("last_known_cipher", ""),
            "last_ping": frappe.utils.now_datetime().timestamp() * 1000
        }
        
        # If terminal is healthy (not locked), update its last known good cipher
        if not is_locked and hardware_id:
            terminals[terminal_id]["last_known_cipher"] = hardware_id
        
        # Self-healing fallback: If an unlock was pending and terminal came online healthy with matching cipher, finalize update
        derived_c = params.get('pos_cipher') or params.get('cipher') or ''
        if not is_locked and derived_c and len(derived_c) == 32:
            pending_key = frappe.cache().get_value(f"pending_unlock:{terminal_id}")
            if pending_key == derived_c:
                resolved_prof = pos_profile if pos_profile and frappe.db.exists('POS Profile', pos_profile) else terminal_id
                if frappe.db.exists('POS Profile', resolved_prof):
                    current_db_cipher = frappe.db.get_value('POS Profile', resolved_prof, 'custom_pos_cipher')
                    if current_db_cipher != derived_c:
                        frappe.db.set_value('POS Profile', resolved_prof, 'custom_pos_cipher', derived_c)
                        frappe.db.commit()
                        frappe.cache().delete_value(f"pending_unlock:{terminal_id}")
                        frappe.cache().delete_value('active_terminals')

        # Save cache state (long lived container)
        frappe.cache().set_value("active_terminals", terminals, expires_in_sec=86400)
        
        # Save specific terminal online state with a 75 seconds TTL (jitter resistance)
        frappe.cache().set_value(f"terminal_status:{terminal_id}", "Online", expires_in_sec=75)
        
        # ── Activity Logging (State Transition Debounced) ─────────────────────
        common_log = dict(
            terminal_id=terminal_id,
            branch_name=branch_name,
            user=username or "Terminal",
            hardware_id=hardware_id,
            app_version=app_version,
            direction="IN"
        )

        last_logged_status = frappe.cache().get_value(f"terminal_logged_status:{terminal_id}")

        # Terminal just transitioned from Offline/None to Online
        if last_logged_status != "Online":
            frappe.cache().set_value(f"terminal_logged_status:{terminal_id}", "Online", expires_in_sec=86400)
            log_terminal_activity(
                event_type="Online",
                description=f"Terminal came online. User: {username or 'Login Screen'}, Version: {app_version}",
                **common_log
            )
        # Hardware changed while locked
        elif is_locked and prev_hw and hardware_id and prev_hw != hardware_id:
            log_terminal_activity(
                event_type="Hardware Changed",
                description=f"Hardware ID changed. Old: {prev_hw[:12]}... → New: {hardware_id[:12]}...",
                details={"old_hardware_id": prev_hw, "new_hardware_id": hardware_id},
                **common_log
            )
        # Terminal was locked and still locked — just log first occurrence
        elif is_locked and not was_locked:
            log_terminal_activity(
                event_type="Hardware Changed",
                description=f"Terminal DB is LOCKED due to hardware change. Hardware ID: {hardware_id}",
                details={"hardware_id": hardware_id},
                **common_log
            )

        # ─────────────────────────────────────────────────────────────────────
        # Check for pending commands delivered via heartbeat (reliable fallback for Socket.io)
        candidate_cmd_keys = [
            f"terminal_cmd:{terminal_id}",
            f"terminal_cmd:{pos_profile}" if pos_profile else None,
            f"terminal_cmd:{branch_name}" if branch_name else None,
            f"terminal_cmd:{branch_name}-{pos_profile}" if branch_name and pos_profile else None,
            f"terminal_cmd:{hardware_id}" if hardware_id else None
        ]
        pending_cmd = None
        for ck in filter(None, candidate_cmd_keys):
            pending_cmd = frappe.cache().get_value(ck)
            if pending_cmd:
                frappe.cache().delete_value(ck)
                return {"success": True, "site_name": frappe.local.site, "command": pending_cmd}
        
        return {"success": True, "site_name": frappe.local.site}
    except Exception as e:
        frappe.log_error(message=frappe.get_traceback(), title="Terminal Heartbeat Error")
        return {"success": False, "error": str(e)}



def log_terminal_activity(terminal_id, event_type, direction, description, details=None, user=None, hardware_id=None, app_version=None, branch_name=None):
    """
    Central helper to write a Terminal Activity Log entry synchronously.
    Called from whitelisted endpoints; Frappe auto-commits after each request.
    """
    try:
        doc = frappe.get_doc({
            "doctype": "Terminal Activity Log",
            "terminal_id": terminal_id,
            "branch_name": branch_name or "",
            "event_type": event_type,
            "direction": direction,
            "description": description,
            "details": frappe.as_json(details) if details else None,
            "user": user or frappe.session.user or "System",
            "hardware_id": hardware_id or "",
            "app_version": app_version or ""
        })
        doc.insert(ignore_permissions=True)
    except Exception:
        frappe.log_error(message=frappe.get_traceback(), title="Terminal Activity Log Error")


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
                    
            now_ms = now * 1000
            last_ping_ms = flt(term.get("last_ping") or 0)
            is_cache_online = frappe.cache().get_value(f"terminal_status:{term_id}") == "Online"
            # Grace period: consider online if heartbeat was received within last 60 seconds (or cache flag is valid)
            is_online = is_cache_online or ((last_ping_ms > 0) and ((now_ms - last_ping_ms) < 60000))
            term["status"] = "Online" if is_online else "Offline"
            
            # Detect actual state transitions using debounced logged state
            logged_status = frappe.cache().get_value(f"terminal_logged_status:{term_id}")
            if not is_online and logged_status == "Online":
                frappe.cache().set_value(f"terminal_logged_status:{term_id}", "Offline", expires_in_sec=86400)
                try:
                    log_terminal_activity(
                        terminal_id=term_id,
                        branch_name=term.get('branch_name', ''),
                        event_type='Offline',
                        direction='SYSTEM',
                        description=f"Terminal went offline. Last user: {term.get('username', 'Unknown')}, Last version: {term.get('app_version', 'Unknown')}",
                        user='System',
                        app_version=term.get('app_version', '')
                    )
                except Exception:
                    pass
            elif is_online and logged_status != "Online":
                frappe.cache().set_value(f"terminal_logged_status:{term_id}", "Online", expires_in_sec=86400)
            
            term["latest_version"] = latest_ver
            
            cur_ver = str(term.get("app_version", "")).strip().lstrip("vV")
            latest_clean = str(latest_ver).strip().lstrip("vV")
            term["is_outdated"] = bool(latest_clean and cur_ver and cur_ver != latest_clean)
            
            if profile_doc:
                term["is_registered"] = profile_doc.get("is_registered", False)
                term["branch_name"] = str(profile_doc.get("custom_branch_name") or profile_doc.get("name") or term.get("branch_name") or "").strip()
                term["custom_pos_cipher"] = str(profile_doc.get("custom_pos_cipher") or "").strip()
                # Always override last_known_cipher from MariaDB (never from stale Redis cache)
                # This guarantees Force Unlock dialog always shows the real POS Profile cipher
                term["last_known_cipher"] = str(profile_doc.get("custom_pos_cipher") or "").strip()
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

            term["derived_cipher"] = str(term.get("derived_cipher") or term.get("pos_cipher") or term.get("cipher") or "").strip()

            active_list.append(term)
            
        # Persist updated status in cache
        frappe.cache().set_value("active_terminals", terminals, expires_in_sec=86400)
            
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
                    "is_registered": True,
                    "custom_pos_cipher": str(p.get("custom_pos_cipher") or "").strip(),
                    "last_known_cipher": str(p.get("custom_pos_cipher") or "").strip()
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
        
        term_info = (frappe.cache().get_value('active_terminals') or {}).get(terminal_id, {})
        log_terminal_activity(
            terminal_id=terminal_id,
            branch_name=term_info.get('branch_name', ''),
            event_type='Logs Pulled',
            direction='OUT',
            description=f'Log pull command sent to terminal. Limit: {limit}, From: {from_date}, To: {to_date}',
            user=frappe.session.user
        )
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
            log_terminal_activity(
                terminal_id="SYSTEM",
                branch_name="",
                event_type="Migrate & Clear Cache",
                direction="SYSTEM",
                description="Bench migrate completed successfully.",
                details={"log": log_output[:500]},
                user=frappe.session.user
            )
            return {"success": True, "message": "Site migration completed successfully!", "log": log_output}
        else:
            log_terminal_activity(
                terminal_id="SYSTEM",
                branch_name="",
                event_type="Migrate & Clear Cache",
                direction="SYSTEM",
                description="Bench migrate FAILED.",
                details={"log": log_output[:500]},
                user=frappe.session.user
            )
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
        
        term_info = (frappe.cache().get_value('active_terminals') or {}).get(terminal_id, {})
        log_terminal_activity(
            terminal_id=terminal_id,
            branch_name=term_info.get('branch_name', ''),
            event_type='DB Download',
            direction='OUT',
            description='DB download (pull) command sent to terminal by Administrator.',
            user=frappe.session.user
        )
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
        
        term_info = (frappe.cache().get_value('active_terminals') or {}).get(terminal_id, {})
        log_terminal_activity(
            terminal_id=terminal_id,
            branch_name=term_info.get('branch_name', ''),
            event_type='DB Restore',
            direction='OUT',
            description=f'DB restore command sent to terminal. File: {file_name}',
            details={'file_name': file_name},
            user=frappe.session.user
        )
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
        
        term_info = (frappe.cache().get_value('active_terminals') or {}).get(terminal_id, {})
        log_terminal_activity(
            terminal_id=terminal_id,
            branch_name=term_info.get('branch_name', ''),
            event_type='SQL Executed',
            direction='OUT',
            description=f'Remote SQL query executed on terminal.',
            details={'query': query},
            user=frappe.session.user
        )
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
def receive_unlock_result():
    try:
        data = json.loads(frappe.request.get_data())
        terminal_id = data.get('terminal_id')
        success = data.get('success')
        error = data.get('error')
        message = data.get('message')
        target_device_id = data.get('target_device_id') or data.get('hardware_id')
        new_cipher = data.get('new_cipher')
        
        if not terminal_id:
            return {'success': False, 'error': 'Missing terminal_id'}

        new_cipher = data.get('new_cipher') or target_device_id or ''

        term_info = (frappe.cache().get_value('active_terminals') or {}).get(terminal_id, {})
        branch = term_info.get('branch_name', '')
        pos_prof = data.get('pos_profile') or term_info.get('pos_profile') or terminal_id

        # ONLY update POS Profile custom_pos_cipher on MariaDB AFTER terminal confirms 100% SUCCESSFUL unlock!
        # DIRECTLY REPLACE with new_cipher so the profile is strictly locked to the new authorized hardware
        if success and new_cipher:
            resolved_prof = None
            if pos_prof and frappe.db.exists('POS Profile', pos_prof):
                resolved_prof = pos_prof
            else:
                parts = terminal_id.split('-')
                candidates = [parts[-1].strip(), parts[0].strip(), terminal_id]
                for c in candidates:
                    if frappe.db.exists('POS Profile', c):
                        resolved_prof = c
                        break

            if resolved_prof:
                frappe.db.set_value('POS Profile', resolved_prof, 'custom_pos_cipher', new_cipher)
                frappe.db.commit()
            else:
                profiles = frappe.get_all("POS Profile", fields=["name", "custom_pos_cipher"])
                for p in profiles:
                    if p.name in terminal_id or (p.custom_pos_cipher and p.custom_pos_cipher in terminal_id):
                        frappe.db.set_value('POS Profile', p.name, 'custom_pos_cipher', new_cipher)
                        frappe.db.commit()
                        break
            frappe.cache().delete_value('active_terminals')

        event_type = 'Force Unlock Success' if success else 'Force Unlock Failed'
        desc = (
            f"✅ Force Unlock SUCCESSFUL: Database authenticated, unlocked & re-keyed. Target HWID: {target_device_id[:12]}..., New DB Cipher: {new_cipher}. POS Profile custom_pos_cipher updated."
            if success else
            f"❌ Force Unlock FAILED: Terminal received command but database authentication failed. Reason: {error or 'Invalid Cipher'}. POS Profile unchanged."
        )

        log_terminal_activity(
            terminal_id=terminal_id,
            branch_name=branch,
            event_type=event_type,
            direction='IN',
            description=desc,
            details={'success': success, 'error': error, 'message': message, 'target_hardware_id': target_device_id, 'new_database_cipher': new_cipher},
            user='Terminal Client',
            hardware_id=target_device_id or ''
        )

        frappe.publish_realtime(
            event='server:display_unlock_result',
            message={
                'terminal_id': terminal_id,
                'success': success,
                'message': message,
                'error': error
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
        
        # Get terminal info for richer log
        term_info = (frappe.cache().get_value('active_terminals') or {}).get(terminal_id, {})
        log_terminal_activity(
            terminal_id=terminal_id,
            branch_name=term_info.get('branch_name', ''),
            event_type='Relaunch',
            direction='OUT',
            description='Relaunch command sent to terminal by Administrator.',
            user=frappe.session.user,
            app_version=term_info.get('app_version', '')
        )
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}


@frappe.whitelist()
def trigger_force_unlock_db(terminal_id, old_cipher=None, target_device_id=None, pos_profile=None):
    if frappe.session.user != 'Administrator':
        frappe.throw('Not authorized.', frappe.PermissionError)
        
    try:
        term_info = (frappe.cache().get_value('active_terminals') or {}).get(terminal_id, {})
        pos_prof = pos_profile or term_info.get('pos_profile') or terminal_id

        if not old_cipher:
            old_cipher = term_info.get('last_known_cipher') or term_info.get('custom_pos_cipher')
            if not old_cipher and frappe.db.exists('POS Profile', pos_prof):
                old_cipher = frappe.db.get_value('POS Profile', pos_prof, 'custom_pos_cipher') or ''

        if not target_device_id:
            target_device_id = term_info.get('target_device_id') or ''

        # Read the 32-character database cipher reported directly by Electron telemetry
        new_cipher = term_info.get('derived_cipher') or target_device_id or ''

        if new_cipher and len(new_cipher) == 32:
            frappe.cache().set_value('pending_unlock:{}'.format(terminal_id), new_cipher, expires_in_sec=300)

        cmd_payload = {
            'type': 'force_unlock_db',
            'old_cipher': old_cipher,
            'target_device_id': target_device_id,
            'new_cipher': new_cipher,
            'pos_profile': pos_prof
        }
        target_keys = set(filter(None, [
            terminal_id,
            pos_prof,
            term_info.get('branch_name', ''),
            f"{term_info.get('branch_name', '')}-{pos_prof}" if term_info.get('branch_name') and pos_prof else None,
            term_info.get('target_device_id', ''),
            old_cipher
        ]))
        for tk in target_keys:
            frappe.cache().set_value('terminal_cmd:{}'.format(tk), cmd_payload, expires_in_sec=180)
            try:
                frappe.publish_realtime(
                    event='server:force_unlock_db',
                    message={
                        'old_cipher': old_cipher,
                        'target_device_id': target_device_id,
                        'new_cipher': new_cipher,
                        'pos_profile': pos_prof
                    },
                    room='task_progress:terminal:{}'.format(tk)
                )
            except Exception:
                pass
        
        term_info = (frappe.cache().get_value('active_terminals') or {}).get(terminal_id, {})
        log_terminal_activity(
            terminal_id=terminal_id,
            branch_name=term_info.get('branch_name', ''),
            event_type='Force Unlock',
            direction='OUT',
            description=f'Force unlock DB command sent. Old Cipher: {old_cipher[:12]}..., Target HWID: {target_device_id[:12]}..., New DB Cipher: {new_cipher}',
            details={'old_cipher': old_cipher, 'target_hardware_id': target_device_id, 'new_database_cipher': new_cipher},
            user=frappe.session.user,
            hardware_id=target_device_id
        )
        return {'success': True, 'new_cipher': new_cipher}
    except Exception as e:
        return {'success': False, 'error': str(e)}


@frappe.whitelist()
def get_terminal_database_cipher(terminal_id=None, pos_profile=None):
    """
    Secure Administrator-Only API to retrieve the current SQLite database cipher (SQLCipher key)
    for a given terminal or POS profile at any time.
    """
    if frappe.session.user != 'Administrator':
        frappe.throw('Not authorized. Only Administrator can access database encryption keys.', frappe.PermissionError)

    if not terminal_id and not pos_profile:
        frappe.throw('Either terminal_id or pos_profile must be provided.')

    terminals = frappe.cache().get_value("active_terminals") or {}
    term_info = {}

    if terminal_id and terminal_id in terminals:
        term_info = terminals[terminal_id]
    else:
        for tid, tdata in terminals.items():
            if (terminal_id and tid == terminal_id) or (pos_profile and tdata.get('pos_profile') == pos_profile):
                term_info = tdata
                terminal_id = tid
                break

    resolved_profile = pos_profile or term_info.get('pos_profile') or terminal_id
    server_cipher = ""
    if resolved_profile and frappe.db.exists("POS Profile", resolved_profile):
        server_cipher = frappe.db.get_value("POS Profile", resolved_profile, "custom_pos_cipher") or ""
    elif terminal_id and frappe.db.exists("POS Profile", terminal_id):
        server_cipher = frappe.db.get_value("POS Profile", terminal_id, "custom_pos_cipher") or ""

    device_reported_cipher = term_info.get("derived_cipher") or term_info.get("pos_cipher") or term_info.get("cipher") or ""
    hardware_id = term_info.get("target_device_id") or term_info.get("hardware_id") or ""

    return {
        "success": True,
        "terminal_id": terminal_id,
        "pos_profile": resolved_profile,
        "database_cipher": server_cipher,
        "device_reported_cipher": device_reported_cipher,
        "hardware_id": hardware_id,
        "is_matching": bool(server_cipher and device_reported_cipher and server_cipher == device_reported_cipher),
        "is_locked": term_info.get("is_locked", False),
        "terminal_status": term_info.get("status", "Offline"),
        "last_ping": term_info.get("last_ping", 0)
    }


@frappe.whitelist()
def trigger_terminal_sync(terminal_id):
    """
    Broadcasts an instant sync trigger to the terminal client without requiring an application relaunch.
    """
    if frappe.session.user != 'Administrator':
        frappe.throw('Not authorized.', frappe.PermissionError)
    if not terminal_id:
        frappe.throw('terminal_id is required.')

    try:
        frappe.cache().set_value('terminal_cmd:{}'.format(terminal_id), {'type': 'sync_now'}, expires_in_sec=120)
        
        # Publish realtime event
        try:
            frappe.publish_realtime(
                event='server:sync_now',
                message={'reason': 'remote_admin_trigger', 'terminal_id': terminal_id},
                room='task_progress:terminal:{}'.format(terminal_id)
            )
        except Exception:
            pass

        # Also publish with cleaned key
        clean_key = terminal_id.replace(' ', '_').replace('-', '_')
        if clean_key != terminal_id:
            frappe.cache().set_value('terminal_cmd:{}'.format(clean_key), {'type': 'sync_now'}, expires_in_sec=120)
            try:
                frappe.publish_realtime(
                    event='server:sync_now',
                    message={'reason': 'remote_admin_trigger', 'terminal_id': terminal_id},
                    room='task_progress:terminal:{}'.format(clean_key)
                )
            except Exception:
                pass

        term_info = (frappe.cache().get_value('active_terminals') or {}).get(terminal_id, {})
        log_terminal_activity(
            terminal_id=terminal_id,
            branch_name=term_info.get('branch_name', ''),
            event_type='Logs Pulled',
            direction='OUT',
            description='Remote instant sync command dispatched to terminal.',
            details={'action': 'trigger_sync'},
            user=frappe.session.user
        )
        return {'success': True, 'message': f'Sync trigger dispatched to {terminal_id}'}
    except Exception as e:
        return {'success': False, 'error': str(e)}


@frappe.whitelist()
def trigger_replay_blackbox(terminal_id):
    """
    Broadcasts an instant trigger to replay failed blackbox events on the terminal client.
    """
    if frappe.session.user != 'Administrator':
        frappe.throw('Not authorized.', frappe.PermissionError)
    if not terminal_id:
        frappe.throw('terminal_id is required.')

    try:
        frappe.publish_realtime(
            event='server:replay_blackbox',
            message={'admin_token': frappe.session.user, 'terminal_id': terminal_id},
            room='task_progress:terminal:{}'.format(terminal_id)
        )
        
        term_info = (frappe.cache().get_value('active_terminals') or {}).get(terminal_id, {})
        log_terminal_activity(
            terminal_id=terminal_id,
            branch_name=term_info.get('branch_name', ''),
            event_type='Replay Blackbox',
            direction='OUT',
            description='Remote Blackbox replay command dispatched to terminal.',
            details={'action': 'trigger_replay_blackbox'},
            user=frappe.session.user
        )
        return {'success': True, 'message': f'Blackbox replay trigger dispatched to {terminal_id}'}
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
