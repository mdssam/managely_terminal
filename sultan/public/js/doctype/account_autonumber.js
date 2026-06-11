frappe.ui.form.on("Account", {
	parent_account(frm) {
		autofill_account_number(frm);
	},
	refresh(frm) {
		autofill_account_number(frm);
	},
	// Fires after form is fully rendered — catches tree view quick-entry where
	// parent_account is injected after the initial refresh event.
	onload_post_render(frm) {
		autofill_account_number(frm);
	},
});

// Tree view: patch "Add Child" so the number is filled once the dialog opens.
frappe.treeview_settings["Account"] = frappe.treeview_settings["Account"] || {};
(function () {
	var _orig_onload = frappe.treeview_settings["Account"].onload;
	frappe.treeview_settings["Account"].onload = function (treeview) {
		if (_orig_onload) _orig_onload.call(this, treeview);
		var _orig_new_node = treeview.new_node && treeview.new_node.bind(treeview);
		if (_orig_new_node) {
			treeview.new_node = function () {
				_orig_new_node();
				setTimeout(function () {
					if (cur_frm && cur_frm.doc && cur_frm.doc.doctype === "Account") {
						autofill_account_number(cur_frm);
					}
				}, 350);
			};
		}
	};
})();

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
