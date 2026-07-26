frappe.ui.form.on("Account", {
	parent_account(frm) {
		autofill_account_number(frm);
	},

	refresh(frm) {
		// Form view: parent_account may already be set.
		autofill_account_number(frm);
		// Tree view: parent_account is injected slightly after refresh — start polling.
		if (frm.is_new() && !frm.doc.account_number) {
			_poll_for_parent(frm);
		}
	},

	onload_post_render(frm) {
		// Second chance: catches quick-entry dialogs opened from the tree.
		autofill_account_number(frm);
		if (frm.is_new() && !frm.doc.account_number) {
			_poll_for_parent(frm);
		}
	},
});

// ── Tree view: intercept "Add Child" via event delegation ─────────────────────
// frappe.treeview_settings["Account"].onload is unreliable (it may have already
// fired by the time this file loads). Delegating on the tree container is safer.
$(document).on("click.sultan_acct_autonumber", ".tree-node-toolbar .btn-new-node, [data-label='Add Child']", function () {
	// The new-account dialog takes a moment to render; poll cur_dialog/cur_frm.
	_wait_for_new_account_form();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Poll cur_frm until parent_account is available, then fetch the next number.
 * Gives up after ~2 s so it never runs indefinitely.
 */
function _poll_for_parent(frm) {
	let tries = 0;
	const id = setInterval(() => {
		if (frm.doc.account_number) { clearInterval(id); return; }
		if (frm.doc.parent_account) {
			clearInterval(id);
			autofill_account_number(frm);
			return;
		}
		if (++tries > 20) clearInterval(id);  // give up after 2 s
	}, 100);
}

/**
 * After clicking "Add Child" in the tree, wait for the new Account form/dialog
 * to appear in cur_frm, then trigger the autonumber fill.
 */
function _wait_for_new_account_form() {
	let tries = 0;
	const id = setInterval(() => {
		const frm = cur_frm;
		if (frm && frm.doc && frm.doc.doctype === "Account" && frm.is_new()) {
			clearInterval(id);
			autofill_account_number(frm);
			if (!frm.doc.account_number) _poll_for_parent(frm);
			return;
		}
		if (++tries > 30) clearInterval(id);  // give up after 3 s
	}, 100);
}

function autofill_account_number(frm) {
	if (!frm.is_new() || !frm.doc.parent_account || frm.doc.account_number) return;

	frappe.call({
		method: "sultan.sultan.accounting.customizations.get_next_child_account_number_for_parent",
		args: { parent_account: frm.doc.parent_account },
		callback(r) {
			if (r.message && !frm.doc.account_number) {
				frm.set_value("account_number", r.message);
			}
		},
	});
}
