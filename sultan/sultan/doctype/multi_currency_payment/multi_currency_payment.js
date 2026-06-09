frappe.ui.form.on("Multi Currency Payment", {
	refresh(frm) {
		if (frm.doc.journal_entry) {
			frm.add_custom_button(__("Journal Entry"), () => {
				frappe.set_route("Form", "Journal Entry", frm.doc.journal_entry);
			});
		}
	},
	company(frm) {
		if (frm.doc.company) {
			frappe.db.get_value("Company", frm.doc.company, "default_currency").then((r) => {
				frm.set_value("company_currency", r.message.default_currency);
			});
		}
	},
});
