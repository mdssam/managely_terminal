import frappe
from frappe import _


@frappe.whitelist()
def get_user_roles():
	"""
	Get the current user's roles and determine if they have administrative privileges.
	"""
	try:
		user = frappe.session.user
		user_roles = frappe.get_roles(user)

		# Check if user has administrative privileges
		admin_roles = ["Administrator", "Sales Manager", "System Manager"]
		is_admin_user = any(role in admin_roles for role in user_roles)

		return {
			"success": True,
			"data": {
				"user": user,
				"roles": user_roles,
				"is_admin_user": is_admin_user,
				"admin_roles": admin_roles,
			},
		}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error getting user roles")
		return {"success": False, "error": str(e)}


@frappe.whitelist(allow_guest=True)
def get_current_user_info():
	"""
	Get comprehensive current user information including roles and POS profile.
	"""
	try:
		import time

		start_time = time.time()

		user = frappe.session.user
		if user == "Guest":
			return {
				"success": True,
				"data": {
					"user": "Guest",
					"full_name": "Guest",
					"logged_in": False,
					"is_admin_user": False,
					"roles": []
				}
			}

		user_roles = frappe.get_roles(user)

		# Check if user has administrative privileges
		admin_roles = ["Administrator", "Sales Manager", "System Manager"]
		is_admin_user = any(role in admin_roles for role in user_roles)

		# Get user details
		user_doc = frappe.get_doc("User", user)

		# Get current POS profile (may not exist for all users)
		from sultan.sultan.utils import get_current_pos_profile

		try:
			pos_profile = get_current_pos_profile()
		except Exception:
			pos_profile = None

		# Resolve profile-specific role with safe fallback
		active_role = frappe.db.get_value("User", user, "role_profile_name") or "Cashier"

		# If their profile-specific active role is Administrator, grant admin privileges
		is_admin_user = is_admin_user or (active_role == "Administrator")

		_total_time = time.time() - start_time

		return {
			"success": True,
			"data": {
				"user": user,
				"full_name": user_doc.full_name or user,
				"email": user_doc.email,
				"role": active_role,
				"role_profile_name": active_role,
				"roles": user_roles,
				"is_admin_user": is_admin_user,
				"admin_roles": admin_roles,
				"pos_profile": pos_profile.name if pos_profile else None,
				"pos_profile_name": pos_profile.name if pos_profile else None,
			},
		}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Error getting current user info")
		return {"success": False, "error": str(e)}
