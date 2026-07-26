frappe.ui.form.on('Delivery Company Settlement', {
	refresh: function(frm) {
		if (frm.doc.docstatus === 0) {
			frm.add_custom_button(__('Get Outstanding Invoices'), function() {
				if (!frm.doc.delivery_company) {
					frappe.msgprint(__('Please select a Delivery Company first.'));
					return;
				}
				frappe.call({
					method: 'managely_terminal.managely_terminal.doctype.delivery_company_settlement.delivery_company_settlement.get_outstanding_invoices',
					args: {
						delivery_company: frm.doc.delivery_company
					},
					callback: function(r) {
						if (r.message && r.message.length > 0) {
							frm.clear_table('invoices');
							let total_out = 0;
							let total_del = 0;
							r.message.forEach(function(row) {
								let child = frm.add_child('invoices');
								child.invoice_id = row.invoice_id;
								child.customer = row.customer;
								child.posting_date = row.posting_date;
								child.total_amount = row.total_amount;
								child.delivery_fee = row.delivery_fee;
								total_out += row.total_amount;
								total_del += row.delivery_fee;
							});
							frm.set_value('invoice_count', r.message.length);
							frm.set_value('total_amount', total_out);
							frm.set_value('delivery_amount', total_del);
							frm.set_value('net_amount', total_out - total_del);
							frm.set_value('settled_delivery_fee', total_del);
							frm.set_value('received_amount', total_out - total_del);
							if (!frm.doc.settled_at) {
								frm.set_value('settled_at', frappe.datetime.now_datetime());
							}
							frm.refresh_field('invoices');
							frappe.msgprint(__('Fetched {0} outstanding invoices for company.', [r.message.length]));
						} else {
							frappe.msgprint(__('No outstanding invoices found for the selected company.'));
						}
					}
				});
			}).addClass('btn-primary');
		}

		if (frm.doc.docstatus === 1) {
			frm.add_custom_button(__('Ledger'), function() {
				frappe.route_options = {
					"voucher_no": frm.doc.name,
					"company": frm.doc.company || frappe.defaults.get_user_default("company"),
					"from_date": frm.doc.posting_date || frappe.datetime.get_today(),
					"to_date": frm.doc.posting_date || frappe.datetime.get_today(),
					"show_cancelled_entries": 1
				};
				frappe.set_route("query-report", "General Ledger");
			});
		}
	},

	delivery_company: function(frm) {
		if (frm.doc.delivery_company) {
			if (!frm.doc.company_name) {
				frm.set_value('company_name', frm.doc.delivery_company);
			}
			frappe.db.get_value('Delivery Company', frm.doc.delivery_company, ['mode_of_payment'], function(r) {
				if (r) {
					if (r.mode_of_payment) frm.set_value('mode_of_payment', r.mode_of_payment);
				}
			});
		}
	}
});
