frappe.provide("erpnext.PointOfSale");

frappe.pages["point-of-sale"].on_page_load = (function(original) {
	return function(wrapper) {
		const original_require = frappe.require;
		frappe.require = function(assets, callback) {
			const is_pos_bundle =
				(typeof assets === "string" && assets.includes("point-of-sale.bundle.js")) ||
				(Array.isArray(assets) && assets.some(a => typeof a === "string" && a.includes("point-of-sale.bundle.js")));

			if (is_pos_bundle) {
				return original_require.call(this, assets, function() {
					setup_pos_opening_override();
					if (callback) callback();
				});
			}
			return original_require.apply(this, arguments);
		};

		if (original) original(wrapper);
		frappe.require = original_require;

		let check_pos_ready = setInterval(() => {
			if (wrapper.pos && wrapper.pos.page) {
				clearInterval(check_pos_ready);

				// Suppress standard "POS Closed" modals
				setInterval(() => {
					$('.modal-title:contains("POS Closed")').closest('.modal').remove();
					$('.modal:contains("POS has been closed")').remove();
				}, 100);

				// Inject premium dialog styles once
				if ($('#cash-drawer-dialog-styles').length === 0) {
					$('head').append(`<style id="cash-drawer-dialog-styles">
						body .premium-closing-dialog .modal-dialog{max-width:480px!important;margin:60px auto!important}
						body .premium-closing-dialog .modal-content{border-radius:8px!important;border:1px solid #e5e7eb!important;box-shadow:0 20px 40px rgba(0,0,0,.12)!important;overflow:hidden!important;background:#fff!important}
						body .premium-closing-dialog .modal-header{background:#1f2937!important;border-bottom:none!important;padding:20px 28px!important}
						body .premium-closing-dialog .modal-title{font-weight:700!important;color:#fff!important;font-size:1.1em!important}
						body .premium-closing-dialog .modal-body{background:#f9fafb!important;padding:24px 28px!important}
						body .premium-closing-dialog .closing-header{background:#1f2937!important;color:#f9fafb!important;border-radius:6px!important;padding:14px 18px!important;margin-bottom:20px!important;border-left:4px solid #4b5563!important}
						body .premium-closing-dialog .closing-header h4{font-size:.95em!important;font-weight:700!important;margin:0 0 4px 0!important;color:#f9fafb!important}
						body .premium-closing-dialog .closing-header p{font-size:.85em!important;margin:0!important;color:#d1d5db!important;line-height:1.5!important}
						body .premium-closing-dialog .frappe-control[data-fieldtype="Currency"]{display:block!important;margin-bottom:12px!important;background:#fff!important;border:1px solid #e5e7eb!important;border-radius:6px!important;padding:10px 16px!important}
						body .premium-closing-dialog .frappe-control[data-fieldtype="Currency"] .form-group{display:flex!important;flex-direction:row!important;align-items:center!important;gap:16px!important;margin:0!important;padding:0!important;width:100%!important}
						body .premium-closing-dialog .frappe-control[data-fieldtype="Currency"] .control-label{font-size:.92em!important;font-weight:600!important;color:#1f2937!important;margin:0!important;min-width:120px!important;flex-shrink:0!important}
						body .premium-closing-dialog .frappe-control[data-fieldtype="Currency"] .control-input-wrapper{flex:1!important;min-width:0!important;margin:0!important}
						body .premium-closing-dialog .frappe-control[data-fieldtype="Currency"] input.input-with-feedback{height:38px!important;font-size:1em!important;font-weight:600!important;color:#1f2937!important;border-radius:4px!important;border:1px solid #d1d5db!important;background:#f9fafb!important;text-align:right!important;padding-right:12px!important;width:100%!important}
						body .premium-closing-dialog .modal-footer{background:#f9fafb!important;border-top:1px solid #e5e7eb!important;padding:16px 28px!important}
						body .premium-closing-dialog .modal-footer .btn-primary{background:#1f2937!important;border-color:#1f2937!important;color:#fff!important;font-weight:600!important;padding:9px 24px!important;border-radius:5px!important}
						.thermal-preview-container{max-height:480px!important;overflow-y:auto!important;scrollbar-width:none!important}
						.thermal-preview-container::-webkit-scrollbar{display:none!important}
					</style>`);
				}

				// Inject Cash Transaction menu item
				const original_prepare_menu = wrapper.pos.prepare_menu;
				wrapper.pos.prepare_menu = function() {
					if (original_prepare_menu) original_prepare_menu.call(this);
					this.page.add_menu_item(__("Cash Transaction"), function() {
						show_cash_transaction_dialog(wrapper.pos);
					});
				};

				// Override close_pos with premium closing dialog
				wrapper.pos.close_pos = function() {
					if (!this.$components_wrapper.is(":visible")) return;
					const me = this;

					frappe.db.get_doc("POS Profile", this.pos_profile).then(pos_profile_doc => {
						const payments = pos_profile_doc.payments || [];
						const fields = [{
							fieldtype: "HTML",
							fieldname: "instructions",
							html: `<div class="closing-dialog-container">
								<div class="closing-header">
									<h4>🔒 Shift Closing</h4>
									<p>Enter the actual balance in the drawer for each payment method to close the session.</p>
								</div>
							</div>`
						}];

						payments.forEach(p => {
							fields.push({
								fieldtype: "Currency",
								fieldname: `mop_${p.mode_of_payment}`,
								label: p.mode_of_payment,
								description: `Actual Balance for ${p.mode_of_payment}`,
								default: 0.0,
								reqd: 1,
							});
						});

						const dialog = new frappe.ui.Dialog({
							title: __("Close Session"),
							fields: fields,
							primary_action_label: __("Submit"),
							primary_action: function(values) {
								const closing_amounts = {};
								payments.forEach(p => {
									closing_amounts[p.mode_of_payment] = flt(values[`mop_${p.mode_of_payment}`]);
								});

								frappe.dom.freeze(__("Closing session..."));

								frappe.call({
									method: "sultan.sultan.doctype.pos_suspended_transaction.pos_suspended_transaction.close_pos_session",
									args: {
										pos_opening_entry: me.pos_opening,
										closing_amounts: closing_amounts,
									},
									callback: function(r) {
										frappe.dom.unfreeze();
										$('#freeze,#freeze-message-container').remove();
										if (!r.exc) {
											dialog.hide();
											frappe.show_alert({ message: __("Session Closed Successfully"), indicator: "green" });
											const closing_name = r.message;
											if (closing_name) {
												window.open(`/api/method/sultan.sultan.doctype.pos_suspended_transaction.pos_suspended_transaction.download_closing_pdf?closing_name=${closing_name}`, '_blank');

												let preview_dialog = new frappe.ui.Dialog({
													title: __("Print Summary"),
													size: "medium",
													fields: [{
														fieldtype: "HTML",
														fieldname: "preview_html",
														options: `<div class="thermal-preview-container" style="background:#eef2f5;padding:20px 0;display:flex;justify-content:center;border:1px solid #d1d5db;border-radius:6px;">
															<iframe src="/api/method/sultan.sultan.doctype.pos_suspended_transaction.pos_suspended_transaction.download_closing_pdf?closing_name=${closing_name}&as_html=1"
																style="width:72mm;height:800px;background:#fff;border:none;box-shadow:0 4px 10px rgba(0,0,0,.1);overflow:hidden;"></iframe>
														</div>`
													}],
													primary_action_label: __("Download PDF"),
													primary_action: function() {
														window.open(`/api/method/sultan.sultan.doctype.pos_suspended_transaction.pos_suspended_transaction.download_closing_pdf?closing_name=${closing_name}`, '_blank');
														preview_dialog.hide();
														window.location.reload();
													},
													onhide: function() { window.location.reload(); }
												});
												preview_dialog.show();
											} else {
												window.location.reload();
											}
										}
									}
								});
							}
						});

						dialog.$wrapper.addClass('premium-closing-dialog');
						dialog.show();
					});
				};

				wrapper.pos.prepare_menu();
				console.log("Sultan POS extension injected into POS.");
			}
		}, 1000);
	};
})(frappe.pages["point-of-sale"].on_page_load);


function show_cash_transaction_dialog(pos_ctrl) {
	let pos_profile = pos_ctrl.pos_profile;

	const load = (profile) => {
		frappe.db.get_doc("POS Profile", profile).then(profile_doc => {
			let allowed_mops = (profile_doc.payments || [])
				.filter(p => p.allowed_for_cash_in_out == 1 || p.allowed_for_cash_in_out === true)
				.map(p => p.mode_of_payment);

			if (!allowed_mops.length) {
				allowed_mops = (profile_doc.payments || []).map(p => p.mode_of_payment);
			}

			let d = new frappe.ui.Dialog({
				title: __("POS Cash Transaction"),
				fields: [
					{
						fieldtype: "HTML",
						fieldname: "type_selector_html",
						options: `<div class="row" style="margin-bottom:15px;">
							<div class="col-xs-6" style="padding-right:5px;">
								<button type="button" id="btn_cash_in" class="btn btn-outline-success btn-block" style="padding:12px;font-weight:bold;font-size:14px;">🟢 Cash In</button>
							</div>
							<div class="col-xs-6" style="padding-left:5px;">
								<button type="button" id="btn_cash_out" class="btn btn-danger btn-block" style="padding:12px;font-weight:bold;font-size:14px;">🔴 Cash Out</button>
							</div>
						</div>`
					},
					{ fieldname: "transaction_type", fieldtype: "Select", options: "Cash In\nCash Out", default: "Cash Out", hidden: 1 },
					{ label: __("Amount"), fieldname: "amount", fieldtype: "Currency", reqd: 1 },
					{
						label: __("Method"),
						fieldname: "mode_of_payment",
						fieldtype: "Link",
						options: "Mode of Payment",
						reqd: 1,
						get_query: function() {
							return allowed_mops.length
								? { filters: { name: ["in", allowed_mops] } }
								: { filters: { name: ["in", [""]] } };
						}
					},
					{ label: __("Description"), fieldname: "description", fieldtype: "Small Text", reqd: 1 },
				],
				primary_action_label: __("Save"),
				primary_action(values) {
					if (d.is_submitting) return;
					if (flt(values.amount) <= 0) { frappe.msgprint(__("Please enter a valid amount.")); return; }

					d.is_submitting = true;
					d.get_primary_btn().attr("disabled", true);

					frappe.call({
						method: "sultan.sultan.doctype.pos_suspended_transaction.pos_suspended_transaction.create_cash_transaction_from_pos",
						args: {
							pos_session: pos_ctrl.pos_opening,
							amount: values.amount,
							mode_of_payment: values.mode_of_payment,
							description: values.description,
							transaction_type: values.transaction_type,
						},
						callback: function(r) {
							d.is_submitting = false;
							d.get_primary_btn().attr("disabled", false);
							if (!r.exc) {
								frappe.show_alert({ message: __(values.transaction_type + " recorded. Ref: " + r.message), indicator: "green" });
								d.hide();
							}
						}
					});
				}
			});

			d.$wrapper.on("click", "#btn_cash_in", function() {
				d.set_value("transaction_type", "Cash In");
				d.$wrapper.find("#btn_cash_in").removeClass("btn-outline-success").addClass("btn-success");
				d.$wrapper.find("#btn_cash_out").removeClass("btn-danger").addClass("btn-outline-danger");
			});
			d.$wrapper.on("click", "#btn_cash_out", function() {
				d.set_value("transaction_type", "Cash Out");
				d.$wrapper.find("#btn_cash_out").removeClass("btn-outline-danger").addClass("btn-danger");
				d.$wrapper.find("#btn_cash_in").removeClass("btn-success").addClass("btn-outline-success");
			});

			d.show();
			setTimeout(() => {
				d.set_value("transaction_type", "Cash Out");
				d.$wrapper.find("#btn_cash_out").removeClass("btn-outline-danger").addClass("btn-danger");
				d.$wrapper.find("#btn_cash_in").removeClass("btn-success").addClass("btn-outline-success");
			}, 100);

			if (allowed_mops.length) {
				let default_mop = allowed_mops.find(m => m.toLowerCase().includes("cash")) || allowed_mops[0];
				d.set_value("mode_of_payment", default_mop);
			}
		});
	};

	if (pos_profile) {
		load(pos_profile);
	} else if (pos_ctrl.pos_opening) {
		frappe.db.get_value("POS Opening Entry", pos_ctrl.pos_opening, "pos_profile").then(res => {
			const profile = res.message ? res.message.pos_profile : "";
			if (profile) load(profile);
			else frappe.msgprint(__("Could not find active POS Profile."));
		});
	}
}


let check_class_ready = setInterval(() => {
	if (window.erpnext && window.erpnext.PointOfSale && window.erpnext.PointOfSale.Controller) {
		clearInterval(check_class_ready);
		try { setup_pos_opening_override(); } catch(e) { console.error("Sultan POS override error:", e); }
	}
}, 50);

function setup_pos_opening_override() {
	if (!window.erpnext || !window.erpnext.PointOfSale || !window.erpnext.PointOfSale.Controller) return;
	if (window.erpnext.PointOfSale.Controller.prototype._sultan_pos_overridden) return;
	window.erpnext.PointOfSale.Controller.prototype._sultan_pos_overridden = true;

	window.erpnext.PointOfSale.Controller.prototype.create_opening_voucher = function() {
		const me = this;
		const table_fields = [
			{ fieldname: "mode_of_payment", fieldtype: "Link", in_list_view: 1, label: __("Mode of Payment"), options: "Mode of Payment", reqd: 1 },
			{
				fieldname: "opening_amount",
				fieldtype: "Currency",
				in_list_view: 1,
				label: __("Opening Amount"),
				options: "company:company_currency",
				onchange: function() {
					dialog.fields_dict.balance_details.df.data.some(d => {
						if (d.idx == this.doc.idx) { d.opening_amount = this.value; dialog.fields_dict.balance_details.grid.refresh(); return true; }
					});
				}
			},
		];

		const fetch_pos_payment_methods = () => {
			const pos_profile = dialog.fields_dict.pos_profile.get_value();
			if (!pos_profile) return;
			frappe.db.get_doc("POS Profile", pos_profile).then(({ payments }) => {
				dialog.fields_dict.balance_details.df.data = [];
				payments.forEach(pay => {
					if (pay.track_opening) {
						dialog.fields_dict.balance_details.df.data.push({ mode_of_payment: pay.mode_of_payment, opening_amount: "0" });
					}
				});
				dialog.fields_dict.balance_details.grid.refresh();
			});
		};

		const dialog = new frappe.ui.Dialog({
			title: __("Create POS Opening Entry"),
			static: true,
			fields: [
				{ fieldtype: "Link", label: __("Company"), default: frappe.defaults.get_default("company"), options: "Company", fieldname: "company", reqd: 1 },
				{
					fieldtype: "Link",
					label: __("POS Profile"),
					options: "POS Profile",
					fieldname: "pos_profile",
					reqd: 1,
					get_query: () => ({ query: "erpnext.accounts.doctype.pos_profile.pos_profile.pos_profile_query", filters: { company: dialog.fields_dict.company.get_value() } }),
					onchange: () => fetch_pos_payment_methods(),
				},
				{ fieldname: "balance_details", fieldtype: "Table", label: __("Opening Balance Details"), cannot_add_rows: false, in_place_edit: true, reqd: 1, data: [], fields: table_fields },
			],
			primary_action: async function({ company, pos_profile, balance_details }) {
				if (!balance_details.length) {
					frappe.show_alert({ message: __("Please add Mode of payments and opening balance details."), indicator: "red" });
					return frappe.utils.play_sound("error");
				}
				balance_details = balance_details.filter(d => d.mode_of_payment);
				const res = await frappe.call({
					method: "frappe.client.submit",
					args: {
						doc: {
							doctype: "POS Opening Entry",
							period_start_date: frappe.datetime.now_datetime(),
							posting_date: frappe.datetime.nowdate(),
							user: frappe.session.user,
							pos_profile,
							company,
							balance_details,
						}
					},
					freeze: true,
				});
				if (!res.exc && res.message) {
					me.prepare_app_defaults(res.message);
				}
				dialog.hide();
			},
			primary_action_label: __("Submit"),
		});
		dialog.show();
	};
}
