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
            "pending_invoices": params.get('pending_invoices', 0),
            "pending_cash_transactions": params.get('pending_cash_transactions', 0),
            "pending_sync_queue": params.get('pending_sync_queue', 0),
            "db_size_mb": params.get('db_size_mb', 0.0),
            "ram_usage_mb": params.get('ram_usage_mb', 0.0),
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
    if frappe.session.user != 'Administrator' and 'System Manager' not in frappe.get_roles():
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
    if frappe.session.user != 'Administrator' and 'System Manager' not in frappe.get_roles():
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
    if frappe.session.user != 'Administrator' and 'System Manager' not in frappe.get_roles():
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
    if frappe.session.user != 'Administrator' and 'System Manager' not in frappe.get_roles():
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
    if frappe.session.user != 'Administrator' and 'System Manager' not in frappe.get_roles():
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
    if frappe.session.user != 'Administrator' and 'System Manager' not in frappe.get_roles():
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
