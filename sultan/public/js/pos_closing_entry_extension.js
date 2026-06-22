frappe.ui.form.on("POS Closing Entry", {
	refresh: function(frm) {
		if ($('#closing-entry-preview-styles').length === 0) {
			$('head').append(`
				<style id="closing-entry-preview-styles">
					.thermal-preview-container {
						max-height: 480px !important;
						overflow-y: auto !important;
						-ms-overflow-style: none !important;
						scrollbar-width: none !important;
					}
					.thermal-preview-container::-webkit-scrollbar { display: none !important; }
				</style>
			`);
		}

		if (frm.doc.docstatus === 1) {
			frm.add_custom_button(__("Print Summary"), function() {
				const closing_name = frm.doc.name;
				let d = new frappe.ui.Dialog({
					title: __("Print Summary"),
					size: "medium",
					fields: [{
						fieldtype: "HTML",
						fieldname: "preview_html",
						options: `
							<div class="thermal-preview-container" style="background:#eef2f5;padding:20px 0;display:flex;justify-content:center;border:1px solid #d1d5db;border-radius:6px;">
								<iframe src="/api/method/sultan.sultan.doctype.pos_suspended_transaction.pos_suspended_transaction.download_closing_pdf?closing_name=${closing_name}&as_html=1"
									style="width:72mm;height:800px;background:#fff;border:none;box-shadow:0 4px 10px rgba(0,0,0,0.1);overflow:hidden;"></iframe>
							</div>`
					}],
					primary_action_label: __("Download PDF"),
					primary_action: function() {
						window.open(`/api/method/sultan.sultan.doctype.pos_suspended_transaction.pos_suspended_transaction.download_closing_pdf?closing_name=${closing_name}`, '_blank');
						d.hide();
					}
				});
				d.show();
			});
		}
	},

	pos_opening_entry: function(frm) {
		setTimeout(() => {
			if (!frm.doc.pos_opening_entry || frm.doc.docstatus !== 0) return;
			frappe.call({
				method: "sultan.sultan.doctype.pos_suspended_transaction.pos_suspended_transaction.get_session_reconciliation_data",
				args: { pos_session: frm.doc.pos_opening_entry },
				callback: function(r) {
					if (!r.message) return;
					let txns = r.message.txns;
					let updated = false;

					frm.doc.payment_reconciliation.forEach(row => {
						const mop = row.mode_of_payment;
						if (r.message.expected && r.message.expected[mop] !== undefined) {
							row.expected_amount = flt(r.message.expected[mop]);
						}
						if (!row.closing_amount || row.closing_amount === row.expected_amount) {
							row.closing_amount = 0.0;
						}
						row.difference = flt(row.closing_amount) - flt(row.expected_amount);
						updated = true;
					});

					frm.clear_table("custom_pos_suspended_transactions");
					if (txns && txns.length > 0) {
						txns.forEach(t => {
							let child = frm.add_child("custom_pos_suspended_transactions");
							child.method = t.mode_of_payment;
							child.remarks = t.description;
							child.amount = t.total_amount;
						});
					}

					if (updated) frm.refresh_field("payment_reconciliation");
					frm.refresh_field("custom_pos_suspended_transactions");
				}
			});
		}, 800);
	},

	before_save: function(frm) {
		let txn_sums = {};
		if (frm.doc.custom_pos_suspended_transactions) {
			frm.doc.custom_pos_suspended_transactions.forEach(t => {
				txn_sums[t.method] = (txn_sums[t.method] || 0.0) + flt(t.amount);
			});
		}
		frm.doc.payment_reconciliation.forEach(row => {
			row.expected_amount += txn_sums[row.mode_of_payment] || 0.0;
			row.difference = flt(row.closing_amount) - flt(row.expected_amount);
		});
		frm.refresh_field("payment_reconciliation");
	}
});
