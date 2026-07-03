frappe.ui.form.on('POS Suspended Transaction', {
	refresh: function(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__('GL Entries'), () => {
				let posting_date = frm.doc.posting_date_time ? frm.doc.posting_date_time.split(' ')[0] : frappe.datetime.get_today();
				frappe.route_options = {
					voucher_no: frm.doc.name,
					from_date: posting_date,
					to_date: posting_date,
					company: frm.doc.company,
				};
				frappe.set_route('query-report', 'General Ledger');
			}, __('View'));
		}
	}
});
