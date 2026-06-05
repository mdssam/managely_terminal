frappe.ui.form.on("Account", {
	parent_account(frm) {
		autofill_account_number(frm);
	},
	refresh(frm) {
		autofill_account_number(frm);
	},
});

function autofill_account_number(frm) {
	if (!frm.is_new() || !frm.doc.parent_account || frm.doc.account_number) return;

	frappe.call({
		method: "sultan.sultan.accounting.customizations.get_next_child_account_number_for_parent",
		args: {
			parent_account: frm.doc.parent_account,
		},
		callback(response) {
			if (response.message && !frm.doc.account_number) {
				frm.set_value("account_number", response.message);
			}
		},
	});
}
