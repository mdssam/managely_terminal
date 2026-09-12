// Copyright (c) 2026, Managely and contributors
// For license information, please see license.txt

frappe.ui.form.on("Manufacturing Wizard", {
	setup: function(frm) {
		frm.current_step = 1;
	},

	refresh: function(frm) {
		frm.trigger("render_tour_banner");
		frm.trigger("update_mode_view");
		frm.trigger("calculate_totals");

		if (frm.doc.company && !frm.doc.currency) {
			frm.trigger("company");
		}

		if (frm.doc.mode === "Track & Execute Work Order" && frm.doc.selected_work_order) {
			frm.trigger("load_work_order_tracker");
		}
	},

	company: function(frm) {
		if (frm.doc.company) {
			frappe.db.get_value("Company", frm.doc.company, "default_currency", function(r) {
				if (r && r.default_currency) {
					frm.set_value("currency", r.default_currency);
				}
			});
		}
	},

	mode: function(frm) {
		frm.current_step = 1;
		frm.trigger("update_mode_view");
	},

	selected_bom: function(frm) {
		if (frm.doc.selected_bom && frm.doc.mode === "Update Existing BOM") {
			frm.trigger("load_bom_data");
		}
	},

	selected_work_order: function(frm) {
		if (frm.doc.selected_work_order && frm.doc.mode === "Track & Execute Work Order") {
			frm.trigger("load_work_order_tracker");
		}
	},

	production_item: function(frm) {
		if (frm.doc.production_item) {
			frappe.db.get_doc("Item", frm.doc.production_item).then(function(item_doc) {
				frm.set_value("uom", item_doc.stock_uom);
				frm.set_value("item_name", item_doc.item_name);
			});
		}
	},

	qty: function(frm) {
		frm.trigger("calculate_totals");
	},

	render_tour_banner: function(frm) {
		var guide_text = __("Need assistance? Click the interactive tour button to explore the 3 operational modes, raw materials, by-product scrap recovery, and real-time execution.");
		var btn_label = __("Start Interactive Tour");
		var banner_html = '<div class="mfg-tour-bar">' +
			'<span>' + guide_text + '</span>' +
			'<button type="button" class="btn btn-default btn-xs" id="btn-mfg-tour-trigger">' + btn_label + '</button>' +
			'</div>';

		frm.fields_dict["tour_btn_html"].$wrapper.html(banner_html);
		frm.fields_dict["tour_btn_html"].$wrapper.find("#btn-mfg-tour-trigger").on("click", function() {
			frm.trigger("start_guided_tour");
		});
	},

	start_guided_tour: function(frm) {
		if (frappe.show_form_tour) {
			frappe.show_form_tour("Manufacturing Wizard Tour");
		} else {
			var msg = "<h4>" + __("Manufacturing Wizard Guide") + "</h4>" +
				"<p><strong>1. " + __("Operational Modes") + ":</strong> " + __("Choose Create New Cycle to build a fresh BOM and Work Order, Update Existing BOM to revise recipes, or Track & Execute Work Order for live floor monitoring.") + "</p>" +
				"<p><strong>2. " + __("Raw Materials & Scrap") + ":</strong> " + __("Define components in Step 2. Use the Scrap table for recovered by-products (such as egg yolks) to automatically credit and reduce your cake unit cost.") + "</p>" +
				"<p><strong>3. " + __("Workstations & Machines") + ":</strong> " + __("Assign machines and operation durations in Step 3 to compute accurate electricity and labor overheads.") + "</p>" +
				"<p><strong>4. " + __("Quality Inspections") + ":</strong> " + __("Define mandatory inspection checkpoints in Step 4 to ensure production compliance.") + "</p>" +
				"<p><strong>5. " + __("Execution & Cockpit") + ":</strong> " + __("In Step 5 or Tracker Mode, launch cycles and execute material transfers and receipts with a single click.") + "</p>";
			frappe.msgprint({
				title: __("Interactive User Guidance"),
				message: msg,
				indicator: "blue"
			});
		}
	},

	update_mode_view: function(frm) {
		var is_tracker = frm.doc.mode === "Track & Execute Work Order";

		frm.toggle_display("stepper_section", !is_tracker);
		frm.toggle_display("step_1_section", !is_tracker);
		frm.toggle_display("step_2_section", !is_tracker);
		frm.toggle_display("step_3_section", !is_tracker);
		frm.toggle_display("step_4_section", !is_tracker);
		frm.toggle_display("step_5_section", !is_tracker);
		frm.toggle_display("tracker_section", is_tracker);

		if (!is_tracker) {
			frm.trigger("render_stepper");
			frm.trigger("show_current_step");
		} else {
			if (frm.doc.selected_work_order) {
				frm.trigger("load_work_order_tracker");
			} else {
				var placeholder_msg = __("Please select a Work Order above to load the live operational cockpit.");
				frm.fields_dict["work_order_status_html"].$wrapper.html(
					'<div class="mfg-tracker-card text-center text-muted" style="padding: 30px;">' + placeholder_msg + '</div>'
				);
			}
		}
	},

	render_stepper: function(frm) {
		var steps = [
			{ num: 1, label: __("Item Definition") },
			{ num: 2, label: __("Materials & Scrap") },
			{ num: 3, label: __("Workstations") },
			{ num: 4, label: __("Quality") },
			{ num: 5, label: __("Cost & Launch") }
		];

		var html = '<div class="mfg-stepper">';
		for (var i = 0; i < steps.length; i++) {
			var st = steps[i];
			var active_class = (frm.current_step === st.num) ? " active" : "";
			var completed_class = (frm.current_step > st.num) ? " completed" : "";
			html += '<div class="mfg-step-item' + active_class + completed_class + '" data-step="' + st.num + '">' +
				'<span class="mfg-step-num">' + st.num + '</span>' +
				'<span>' + st.label + '</span>' +
				'</div>';
		}
		html += '</div>';

		// Stepper Navigation Buttons
		var prev_label = __("Previous Step");
		var next_label = __("Next Step");
		var launch_label = (frm.doc.mode === "Update Existing BOM") ? __("Update & Submit BOM Revision") : __("Launch Production Cycle");

		html += '<div class="mfg-stepper-actions">';
		if (frm.current_step > 1) {
			html += '<button type="button" class="btn btn-default btn-sm" id="mfg-btn-prev">' + prev_label + '</button>';
		} else {
			html += '<div></div>';
		}

		if (frm.current_step < 5) {
			html += '<button type="button" class="btn btn-primary btn-sm" id="mfg-btn-next">' + next_label + '</button>';
		} else {
			html += '<button type="button" class="btn btn-primary btn-sm" id="mfg-btn-launch">' + launch_label + '</button>';
		}
		html += '</div>';

		frm.fields_dict["stepper_html"].$wrapper.html(html);

		// Event handlers
		frm.fields_dict["stepper_html"].$wrapper.find(".mfg-step-item").on("click", function() {
			var target_step = parseInt($(this).attr("data-step"));
			frm.current_step = target_step;
			frm.trigger("update_mode_view");
		});

		frm.fields_dict["stepper_html"].$wrapper.find("#mfg-btn-prev").on("click", function() {
			if (frm.current_step > 1) {
				frm.current_step--;
				frm.trigger("update_mode_view");
			}
		});

		frm.fields_dict["stepper_html"].$wrapper.find("#mfg-btn-next").on("click", function() {
			if (frm.current_step < 5) {
				frm.current_step++;
				frm.trigger("update_mode_view");
			}
		});

		frm.fields_dict["stepper_html"].$wrapper.find("#mfg-btn-launch").on("click", function() {
			if (frm.doc.mode === "Update Existing BOM") {
				frm.trigger("execute_bom_update");
			} else {
				frm.trigger("execute_cycle_launch");
			}
		});
	},

	show_current_step: function(frm) {
		for (var s = 1; s <= 5; s++) {
			var is_visible = (frm.current_step === s);
			frm.toggle_display("step_" + s + "_section", is_visible);
		}
	},

	calculate_totals: function(frm) {
		var raw_total = 0.0;
		(frm.doc.items || []).forEach(function(d) {
			if (!d.amount && d.qty && d.rate) {
				d.amount = flt(d.qty) * flt(d.rate);
			}
			raw_total += flt(d.amount);
		});

		var scrap_total = 0.0;
		(frm.doc.scrap_items || []).forEach(function(d) {
			if (!d.amount && d.stock_qty && d.rate) {
				d.amount = flt(d.stock_qty) * flt(d.rate);
			}
			scrap_total += flt(d.amount);
		});

		var op_total = 0.0;
		(frm.doc.operations || []).forEach(function(d) {
			if (!d.operating_cost && d.time_in_mins && d.hour_rate) {
				d.operating_cost = (flt(d.time_in_mins) / 60.0) * flt(d.hour_rate);
			}
			op_total += flt(d.operating_cost);
		});

		frm.set_value("raw_material_cost", raw_total);
		frm.set_value("scrap_deduction_cost", scrap_total);
		frm.set_value("operating_cost", op_total);

		var total = raw_total + op_total - scrap_total;
		frm.set_value("total_cost", (total > 0) ? total : 0.0);

		var qty = flt(frm.doc.qty);
		frm.set_value("unit_cost", (qty > 0) ? (total / qty) : 0.0);
	},

	load_bom_data: function(frm) {
		frappe.call({
			method: "managely_terminal.managely_manufacturing.doctype.manufacturing_wizard.manufacturing_wizard.load_existing_bom",
			args: {
				bom_name: frm.doc.selected_bom
			},
			freeze: true,
			freeze_message: __("Loading BOM Data..."),
			callback: function(r) {
				if (r.message) {
					var data = r.message;
					frm.set_value("production_item", data.production_item);
					frm.set_value("item_name", data.item_name);
					frm.set_value("qty", data.qty);
					frm.set_value("uom", data.uom);
					frm.set_value("company", data.company);
					frm.set_value("currency", data.currency);
					frm.set_value("with_quality_inspection", data.with_quality_inspection);
					frm.set_value("quality_inspection_template", data.quality_inspection_template);

					frm.clear_table("items");
					(data.items || []).forEach(function(it) {
						frm.add_child("items", it);
					});

					frm.clear_table("scrap_items");
					(data.scrap_items || []).forEach(function(sc) {
						frm.add_child("scrap_items", sc);
					});

					frm.clear_table("operations");
					(data.operations || []).forEach(function(op) {
						frm.add_child("operations", op);
					});

					frm.refresh_fields();
					frm.trigger("calculate_totals");
					frappe.show_alert({
						message: __("BOM {0} loaded successfully.", [frm.doc.selected_bom]),
						indicator: "green"
					});
				}
			}
		});
	},

	execute_cycle_launch: function(frm) {
		frappe.confirm(
			__("Are you sure you want to validate and launch this production cycle?"),
			function() {
				frappe.call({
					method: "managely_terminal.managely_manufacturing.doctype.manufacturing_wizard.manufacturing_wizard.execute_create",
					args: {
						doc: frm.doc
					},
					freeze: true,
					freeze_message: __("Creating BOM and Work Order..."),
					callback: function(r) {
						if (r.message && r.message.status === "success") {
							frm.set_value("created_bom", r.message.bom);
							frm.set_value("created_work_order", r.message.work_order);
							frm.save();

							var msg = "<p><strong>" + __("BOM Created") + ":</strong> " + r.message.bom + "</p>" +
								"<p><strong>" + __("Work Order Created") + ":</strong> " + r.message.work_order + "</p>";

							frappe.msgprint({
								title: __("Cycle Launched Successfully"),
								message: msg,
								indicator: "green"
							});
						}
					}
				});
			}
		);
	},

	execute_bom_update: function(frm) {
		frappe.confirm(
			__("Are you sure you want to submit a new BOM revision?"),
			function() {
				frappe.call({
					method: "managely_terminal.managely_manufacturing.doctype.manufacturing_wizard.manufacturing_wizard.execute_update",
					args: {
						doc: frm.doc
					},
					freeze: true,
					freeze_message: __("Updating BOM Revision..."),
					callback: function(r) {
						if (r.message && r.message.status === "success") {
							frm.set_value("created_bom", r.message.bom);
							frm.save();

							frappe.msgprint({
								title: __("BOM Updated Successfully"),
								message: r.message.message,
								indicator: "green"
							});
						}
					}
				});
			}
		);
	},

	load_work_order_tracker: function(frm) {
		frappe.call({
			method: "managely_terminal.managely_manufacturing.doctype.manufacturing_wizard.manufacturing_wizard.get_work_order_live_status",
			args: {
				work_order_name: frm.doc.selected_work_order
			},
			callback: function(r) {
				if (r.message) {
					frm.trigger("render_work_order_cockpit", r.message);
				}
			}
		});
	},

	render_work_order_cockpit: function(frm, data) {
		var status_color = (data.status === "Completed") ? "green" : (data.status === "In Process" ? "blue" : "orange");
		
		var html = '<div class="mfg-tracker-card">' +
			'<div class="mfg-tracker-header">' +
			'<div>' +
			'<span class="mfg-tracker-title">' + __("Work Order") + ': ' + data.work_order + '</span>' +
			'<div class="text-muted" style="margin-top:4px;">' + data.item_name + ' (' + data.production_item + ')</div>' +
			'</div>' +
			'<span class="indicator-pill ' + status_color + '">' + __(data.status) + '</span>' +
			'</div>' +

			// Progress Overview
			'<div class="mfg-grid-2">' +
			'<div class="mfg-metric-box">' +
			'<div class="mfg-metric-label">' + __("Planned Quantity") + '</div>' +
			'<div class="mfg-metric-value">' + data.planned_qty + '</div>' +
			'</div>' +
			'<div class="mfg-metric-box">' +
			'<div class="mfg-metric-label">' + __("Produced Quantity") + '</div>' +
			'<div class="mfg-metric-value">' + data.produced_qty + '</div>' +
			'</div>' +
			'</div>' +

			// Material Transfer Section
			'<div style="margin-top:16px;">' +
			'<div class="bold" style="margin-bottom:8px;">' + __("Material Transfer Status") + '</div>' +
			'<table class="mfg-table">' +
			'<thead><tr>' +
			'<th>' + __("Item Code") + '</th>' +
			'<th>' + __("Required Qty") + '</th>' +
			'<th>' + __("Transferred Qty") + '</th>' +
			'</tr></thead><tbody>';

		(data.items_summary || []).forEach(function(it) {
			html += '<tr>' +
				'<td>' + it.item_code + '</td>' +
				'<td>' + it.required_qty + '</td>' +
				'<td>' + it.transferred_qty + '</td>' +
				'</tr>';
		});
		html += '</tbody></table></div>' +

			// Job Cards / Machines Section
			'<div style="margin-top:16px;">' +
			'<div class="bold" style="margin-bottom:8px;">' + __("Workstations & Job Cards") + '</div>';

		if (data.job_cards && data.job_cards.length > 0) {
			html += '<table class="mfg-table">' +
				'<thead><tr>' +
				'<th>' + __("Job Card") + '</th>' +
				'<th>' + __("Operation") + '</th>' +
				'<th>' + __("Workstation") + '</th>' +
				'<th>' + __("Completed Qty") + '</th>' +
				'<th>' + __("Status") + '</th>' +
				'</tr></thead><tbody>';
			data.job_cards.forEach(function(jc) {
				html += '<tr>' +
					'<td>' + jc.name + '</td>' +
					'<td>' + jc.operation + '</td>' +
					'<td>' + jc.workstation + '</td>' +
					'<td>' + jc.total_completed_qty + ' / ' + jc.for_quantity + '</td>' +
					'<td>' + __(jc.status) + '</td>' +
					'</tr>';
			});
			html += '</tbody></table>';
		} else {
			html += '<div class="text-muted italic" style="padding:8px 0;">' + __("No job cards created for this work order.") + '</div>';
		}
		html += '</div>' +

			// Live Actions Bar
			'<div style="display:flex; gap:8px; margin-top:16px; padding-top:12px; border-top:1px solid var(--border-color);">';

		if (data.can_transfer) {
			html += '<button type="button" class="btn btn-primary btn-sm" id="btn-action-transfer">' + __("Transfer Raw Materials to Floor") + '</button>';
		}
		if (data.can_finish) {
			html += '<button type="button" class="btn btn-primary btn-sm" id="btn-action-finish">' + __("Complete & Receive Finished Goods") + '</button>';
		}
		html += '<button type="button" class="btn btn-default btn-sm" id="btn-action-inspection">' + __("New Quality Inspection") + '</button>';
		html += '<button type="button" class="btn btn-default btn-sm" id="btn-action-refresh">' + __("Refresh Status") + '</button>';
		html += '</div></div>';

		frm.fields_dict["work_order_status_html"].$wrapper.html(html);

		// Bind actions
		frm.fields_dict["work_order_status_html"].$wrapper.find("#btn-action-transfer").on("click", function() {
			frm.trigger("trigger_tracker_action", "transfer_materials");
		});
		frm.fields_dict["work_order_status_html"].$wrapper.find("#btn-action-finish").on("click", function() {
			frm.trigger("trigger_tracker_action", "finish_manufacturing");
		});
		frm.fields_dict["work_order_status_html"].$wrapper.find("#btn-action-inspection").on("click", function() {
			frm.trigger("trigger_tracker_action", "create_inspection");
		});
		frm.fields_dict["work_order_status_html"].$wrapper.find("#btn-action-refresh").on("click", function() {
			frm.trigger("load_work_order_tracker");
		});
	},

	trigger_tracker_action: function(frm, action_type) {
		frappe.call({
			method: "managely_terminal.managely_manufacturing.doctype.manufacturing_wizard.manufacturing_wizard.execute_tracker_action",
			args: {
				action_type: action_type,
				work_order_name: frm.doc.selected_work_order
			},
			freeze: true,
			callback: function(r) {
				if (r.message && r.message.status === "success") {
					frappe.show_alert({
						message: r.message.message,
						indicator: "green"
					});
					frm.trigger("load_work_order_tracker");
				}
			}
		});
	}
});

// Child Table Triggers for Real-time recalculation
frappe.ui.form.on("Manufacturing Wizard Item", {
	qty: function(frm) { frm.trigger("calculate_totals"); },
	rate: function(frm) { frm.trigger("calculate_totals"); },
	items_remove: function(frm) { frm.trigger("calculate_totals"); }
});

frappe.ui.form.on("Manufacturing Wizard Scrap", {
	stock_qty: function(frm) { frm.trigger("calculate_totals"); },
	rate: function(frm) { frm.trigger("calculate_totals"); },
	scrap_items_remove: function(frm) { frm.trigger("calculate_totals"); }
});

frappe.ui.form.on("Manufacturing Wizard Operation", {
	time_in_mins: function(frm) { frm.trigger("calculate_totals"); },
	hour_rate: function(frm) { frm.trigger("calculate_totals"); },
	operations_remove: function(frm) { frm.trigger("calculate_totals"); }
});
