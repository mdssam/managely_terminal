frappe.ui.form.on('POS Profile', {
	refresh(frm) {
		// Set custom_currency to read_only in grid
		frm.fields_dict.payments.grid.docfields.forEach(df => {
			if (df.fieldname === 'custom_currency') {
				df.read_only = 1;
			}
		});
		frm.fields_dict.payments.grid.refresh();
	}
});

frappe.ui.form.on('POS Payment Method', {
	mode_of_payment(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row.mode_of_payment) {
			frappe.call({
				method: "sultan.sultan.api.pos_entry.get_mode_of_payment_currency",
				args: {
					mode_of_payment: row.mode_of_payment,
					company: frm.doc.company
				},
				callback: function(r) {
					if (r.message) {
						frappe.model.set_value(cdt, cdn, "custom_currency", r.message);
					}
				}
			});
		}
	}
});
