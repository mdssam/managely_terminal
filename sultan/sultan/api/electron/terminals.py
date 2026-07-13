# -*- coding: utf-8 -*-
# Sultan Terminal Monitor API endpoints (Frappe Server app)

import frappe
import json

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
        
        # Update terminal status details
        terminals[terminal_id] = {
            "terminal_id": terminal_id,
            "branch_name": branch_name,
            "pos_profile": pos_profile,
            "status": "Online",
            "username": username,
            "app_version": app_version,
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
def get_active_terminals():
    """
    Returns list of all registered terminals and their current online/offline status.
    Accessible only to Administrator and System Managers.
    """
    if frappe.session.user != "Administrator" and "System Manager" not in frappe.get_roles():
        frappe.throw("Not authorized to view terminal monitoring panel.", frappe.PermissionError)
        
    try:
        terminals = frappe.cache().get_value("active_terminals") or {}
        active_list = []
        now = frappe.utils.now_datetime().timestamp()
        
        for term_id, term in terminals.items():
            # Check online status from active TTL key
            is_online = frappe.cache().get_value(f"terminal_status:{term_id}") == "Online"
            term["status"] = "Online" if is_online else "Offline"
            
            # Clean up terminals that haven't pinged in 24 hours
            last_ping = term.get("last_ping", 0) / 1000
            if (now - last_ping) < 86400:
                active_list.append(term)
                
        return active_list
    except Exception as e:
        return {"success": False, "error": str(e)}


@frappe.whitelist(allow_guest=False)
def trigger_pull_logs(terminal_id, limit=200, from_date=None, to_date=None):
    """
    Triggers log extraction on the client machine via Socket.io.
    Accessible only to Administrator and System Managers.
    """
    if frappe.session.user != "Administrator" and "System Manager" not in frappe.get_roles():
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
    Accessible only to Administrator and System Managers.
    """
    if frappe.session.user != "Administrator" and "System Manager" not in frappe.get_roles():
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


@frappe.whitelist(allow_guest=True)
def reload_terminal_monitor_page():
    """
    Utility endpoint to force reload the terminal_monitor page record from disk to database.
    """
    try:
        frappe.reload_doc("sultan", "page", "terminal_monitor")
        frappe.db.commit()
        return {"success": True, "message": "Page reloaded successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@frappe.whitelist(allow_guest=False)
def get_pulled_logs(terminal_id):
    """
    Called by the browser to fetch cached logs (fallback for Socket.io).
    """
    if frappe.session.user != "Administrator" and "System Manager" not in frappe.get_roles():
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
