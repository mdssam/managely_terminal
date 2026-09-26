// Copyright (c) 2026, Managely and contributors
// For license information, please see license.txt

frappe.ui.form.on("BOM", {
	refresh: function (frm) {
		if (!frm.is_new() && frm.doc.docstatus === 1) {
			frm.add_custom_button(__("Revise Recipe"), function () {
				managely_open_recipe_update_dialog(frm);
			});
		}
	},
});

function managely_open_recipe_update_dialog(frm) {
	frappe.call({
		method: "managely_terminal.managely_manufacturing.recipe_updater.get_recipe_details",
		args: {
			bom_name: frm.doc.name
		},
		freeze: true,
		freeze_message: __("Loading recipe details..."),
		callback: function(r) {
			if (!r.message) return;
			var data = r.message;

			var parent_list_html = "";
			if (data.parent_count > 0) {
				var parent_names = (data.parents || []).map(function(p) {
					return "<b>" + (p.finished_item_name || p.finished_item || p.parent_bom) + "</b> (" + p.parent_bom + ")";
				}).join(", ");

				parent_list_html = '<div class="alert alert-warning" style="margin-bottom: 15px; font-size: 13px; line-height: 1.5;">' +
					'<strong>' + __("Active Parent Dishes Found") + ':</strong> ' +
					__("This recipe is currently linked as a sub-component inside {0} dish(es):", [data.parent_count]) +
					'<div style="margin-top: 5px;">' + parent_names + '</div>' +
					'<div style="margin-top: 8px; font-weight: 500;">' +
					__("Updating quantities below will automatically create a new revision and update all linked dishes without breaking connections.") +
					'</div></div>';
			} else {
				parent_list_html = '<div class="alert alert-info" style="margin-bottom: 15px; font-size: 13px;">' +
					__("This recipe is not currently used as a sub-component in any parent dishes. Saving will create a new revision and set it as default.") +
					'</div>';
			}

			var d = new frappe.ui.Dialog({
				title: __("Revise Recipe: {0} ({1})", [data.item_name || data.item, data.bom_name]),
				size: "large",
				fields: [
					{
						fieldname: "info_html",
						fieldtype: "HTML",
						options: parent_list_html
					},
					{
						fieldname: "batch_qty",
						fieldtype: "Float",
						label: __("Batch Output Quantity"),
						default: data.quantity || 1.0,
						reqd: 1
					},
					{
						fieldname: "section_items",
						fieldtype: "Section Break",
						label: __("Recipe Ingredients")
					},
					{
						fieldname: "items",
						fieldtype: "Table",
						label: __("Ingredients"),
						in_place_edit: true,
						reqd: 1,
						data: data.items || [],
						get_data: function() {
							return data.items || [];
						},
						fields: [
							{
								fieldname: "item_code",
								fieldtype: "Link",
								options: "Item",
								label: __("Item Code"),
								in_list_view: 1,
								reqd: 1,
								change: function() {
									var row = this.doc;
									if (row.item_code) {
										frappe.db.get_value("Item", row.item_code, ["item_name", "stock_uom", "valuation_rate"], function(val) {
											if (val) {
												row.item_name = val.item_name;
												row.uom = val.stock_uom;
												if (!row.rate && val.valuation_rate) {
													row.rate = val.valuation_rate;
												}
												d.fields_dict.items.grid.refresh();
											}
										});
									}
								}
							},
							{
								fieldname: "item_name",
								fieldtype: "Data",
								label: __("Item Name"),
								in_list_view: 1,
								read_only: 1
							},
							{
								fieldname: "qty",
								fieldtype: "Float",
								label: __("Quantity"),
								in_list_view: 1,
								reqd: 1
							},
							{
								fieldname: "uom",
								fieldtype: "Link",
								options: "UOM",
								label: __("UOM"),
								in_list_view: 1
							},
							{
								fieldname: "rate",
								fieldtype: "Currency",
								label: __("Rate"),
								in_list_view: 1
							}
						]
					}
				],
				primary_action_label: __("Save & Propagate Revision"),
				primary_action: function(values) {
					var raw_items = d.fields_dict.items.grid.get_data();
					if (!raw_items || raw_items.length === 0) {
						frappe.msgprint({
							title: __("Validation Error"),
							indicator: "red",
							message: __("Please add at least one ingredient.")
						});
						return;
					}

					var valid_items = raw_items.filter(function(it) {
						return it.item_code && flt(it.qty) > 0;
					});

					if (valid_items.length === 0) {
						frappe.msgprint({
							title: __("Validation Error"),
							indicator: "red",
							message: __("At least one ingredient must have a quantity greater than zero.")
						});
						return;
					}

					var confirm_msg = (data.parent_count > 0)
						? __("Are you sure you want to create a new revision and automatically update {0} linked parent dish(es)?", [data.parent_count])
						: __("Are you sure you want to submit a new revision for this recipe?");

					frappe.confirm(confirm_msg, function() {
						frappe.call({
							method: "managely_terminal.managely_manufacturing.recipe_updater.update_recipe_and_propagate",
							args: {
								current_bom: frm.doc.name,
								items: valid_items,
								new_quantity: values.batch_qty
							},
							freeze: true,
							freeze_message: __("Updating recipe and propagating to parent dishes..."),
							callback: function(res) {
								if (res.message && res.message.status === "success") {
									d.hide();

									var success_html = '<p><strong>' + __("New Revision") + ':</strong> <a href="/app/bom/' + res.message.new_bom + '">' + res.message.new_bom + '</a></p>' +
										'<p><strong>' + __("Replaced Old Revision") + ':</strong> ' + res.message.old_bom + '</p>';

									if (res.message.parent_count > 0) {
										success_html += '<p><strong>' + __("Dishes Updated") + ':</strong> ' + res.message.parent_count + ' ' + __("parent dish(es) queued and updated in background.") + '</p>' +
											'<p class="text-muted small">' + __("Costs and sub-assembly links were recalculated automatically.") + '</p>';
									} else {
										success_html += '<p class="text-muted small">' + __("No parent dishes required rebinding.") + '</p>';
									}

									frappe.msgprint({
										title: __("Recipe Updated Successfully"),
										indicator: "green",
										message: success_html
									});

									frappe.set_route("Form", "BOM", res.message.new_bom);
								}
							}
						});
					});
				}
			});

			d.show();

			// Preload grid data properly
			if (data.items && data.items.length > 0) {
				d.fields_dict.items.df.data = data.items;
				d.fields_dict.items.grid.refresh();
			}
		}
	});
}
