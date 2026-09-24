// Copyright (c) 2026, Tati and contributors
// For license information, please see license.txt

frappe.ui.form.on("Price List", {
	refresh: function (frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Duplicate / Adjust Prices"), function () {
				show_price_adjustment_dialog(frm);
			});

			frm.add_custom_button(__("Adjustment History & Restore"), function () {
				show_adjustment_history_dialog(frm);
			});
		}
	},
});

function show_price_adjustment_dialog(frm) {
	const default_new_name = `${frm.doc.name} - ${frappe.datetime.now_date()}`;

	const d = new frappe.ui.Dialog({
		title: __("Duplicate or Adjust Item Prices"),
		size: "large",
		fields: [
			{
				fieldname: "operation_type",
				label: __("Operation Type"),
				fieldtype: "Select",
				options: [
					{ label: __("Duplicate to New Price List"), value: "duplicate" },
					{ label: __("Update Current Price List In-Place"), value: "update_inplace" },
				],
				default: "duplicate",
				change: function () {
					update_preview();
				},
			},
			{
				fieldname: "new_price_list_name",
				label: __("New Price List Name"),
				fieldtype: "Data",
				default: default_new_name,
				depends_on: "eval:doc.operation_type=='duplicate'",
				mandatory_depends_on: "eval:doc.operation_type=='duplicate'",
			},
			{
				fieldname: "col_break_1",
				fieldtype: "Column Break",
			},
			{
				fieldname: "adjustment_method",
				label: __("Adjustment Method"),
				fieldtype: "Select",
				options: [
					{ label: __("Percentage (%)"), value: "percentage" },
					{ label: __("Fixed Amount"), value: "fixed_amount" },
					{ label: __("Exact Copy (No Change)"), value: "exact_copy" },
				],
				default: "percentage",
				change: function () {
					update_preview();
				},
			},
			{
				fieldname: "adjustment_direction",
				label: __("Direction"),
				fieldtype: "Select",
				options: [
					{ label: __("Increase (+)"), value: "increase" },
					{ label: __("Decrease (-)"), value: "decrease" },
				],
				default: "increase",
				depends_on: "eval:doc.adjustment_method!='exact_copy'",
				change: function () {
					update_preview();
				},
			},
			{
				fieldname: "adjustment_value",
				label: __("Adjustment Value (Percentage or Amount)"),
				fieldtype: "Float",
				default: 10,
				precision: 2,
				depends_on: "eval:doc.adjustment_method!='exact_copy'",
				change: function () {
					update_preview();
				},
			},
			{
				fieldname: "section_filter",
				label: __("Filter by Category / Item Group"),
				fieldtype: "Section Break",
			},
			{
				fieldname: "item_group",
				label: __("Item Group (Optional - leave blank for all items)"),
				fieldtype: "Link",
				options: "Item Group",
				change: function () {
					update_preview();
				},
			},
			{
				fieldname: "include_other_items",
				label: __("Keep Other Items at Original Price (When Duplicating)"),
				fieldtype: "Check",
				default: 1,
				depends_on: "eval:doc.operation_type=='duplicate' && doc.item_group",
			},
			{
				fieldname: "col_break_2",
				fieldtype: "Column Break",
			},
			{
				fieldname: "rounding_rule",
				label: __("Rounding Rule"),
				fieldtype: "Select",
				options: [
					{ label: __("Round to 2 Decimals (0.00)"), value: "2_decimals" },
					{ label: __("Round to Integer (1)"), value: "integer" },
					{ label: __("Exact (No Rounding)"), value: "none" },
				],
				default: "2_decimals",
				change: function () {
					update_preview();
				},
			},
			{
				fieldname: "section_preview",
				label: __("Adjustment Impact & Insights"),
				fieldtype: "Section Break",
			},
			{
				fieldname: "preview_box",
				fieldtype: "HTML",
			},
		],
		primary_action_label: __("Apply Price Adjustment"),
		primary_action: function (values) {
			if (values.operation_type === "duplicate" && !values.new_price_list_name) {
				frappe.msgprint(__("Please enter the new Price List name."));
				return;
			}

			const confirm_msg = values.operation_type === "duplicate"
				? __("Are you sure you want to duplicate '{0}' and generate new prices for '{1}'?", [frm.doc.name, values.new_price_list_name])
				: __("Warning: Prices in the current Price List '{0}' will be updated in-place. You can restore them anytime from History. Proceed?", [frm.doc.name]);

			frappe.confirm(confirm_msg, function () {
				d.get_primary_btn().prop("disabled", true);
				frappe.call({
					method: "managely_terminal.managely_terminal.api.price_list_tools.preview_or_apply_adjustment",
					args: {
						price_list: frm.doc.name,
						operation_type: values.operation_type,
						new_price_list_name: values.new_price_list_name,
						adjustment_method: values.adjustment_method,
						adjustment_direction: values.adjustment_direction,
						adjustment_value: values.adjustment_value,
						item_group: values.item_group,
						include_other_items: values.include_other_items ? 1 : 0,
						rounding_rule: values.rounding_rule,
						is_preview: 0,
					},
					freeze: true,
					freeze_message: __("Processing price adjustments..."),
					callback: function (r) {
						d.hide();
						if (r.message && r.message.status === "success") {
							frappe.show_alert({
								message: __("Success! Adjusted {0} items.", [r.message.adjusted_count]),
								indicator: "green",
							}, 5);

							if (r.message.operation_type === "duplicate") {
								frappe.set_route("Form", "Price List", r.message.target_price_list);
							} else {
								frm.reload_doc();
							}
						}
					},
				});
			});
		},
		secondary_action_label: __("Refresh Insights"),
		secondary_action: function () {
			update_preview();
		},
	});

	function update_preview() {
		const values = d.get_values();
		if (!values) return;

		const wrapper = d.get_field("preview_box").$wrapper;
		wrapper.html("<div class='text-muted small p-2'>" + __("Calculating insights...") + "</div>");

		frappe.call({
			method: "managely_terminal.managely_terminal.api.price_list_tools.preview_or_apply_adjustment",
			args: {
				price_list: frm.doc.name,
				operation_type: values.operation_type,
				new_price_list_name: values.new_price_list_name || "Preview",
				adjustment_method: values.adjustment_method,
				adjustment_direction: values.adjustment_direction,
				adjustment_value: values.adjustment_value,
				item_group: values.item_group,
				include_other_items: values.include_other_items ? 1 : 0,
				rounding_rule: values.rounding_rule,
				is_preview: 1,
			},
			callback: function (r) {
				if (!r.message) return;
				const data = r.message;

				const html = `
					<div class="row text-center my-1">
						<div class="col-sm-4 mb-2">
							<div class="p-3 border rounded bg-light">
								<div class="text-muted small text-uppercase font-weight-bold">${__("Source Total Items")}</div>
								<div class="h4 mt-2 font-weight-bold text-dark">${frappe.format(data.total_source_items, { fieldtype: "Int" })}</div>
							</div>
						</div>
						<div class="col-sm-4 mb-2">
							<div class="p-3 border rounded bg-light border-primary" style="border-width: 2px !important;">
								<div class="text-primary small text-uppercase font-weight-bold">${__("Items To Be Adjusted")}</div>
								<div class="h4 mt-2 font-weight-bold text-primary">${frappe.format(data.adjusted_count, { fieldtype: "Int" })}</div>
							</div>
						</div>
						<div class="col-sm-4 mb-2">
							<div class="p-3 border rounded bg-light">
								<div class="text-muted small text-uppercase font-weight-bold">${__("Target Total Items")}</div>
								<div class="h4 mt-2 font-weight-bold text-dark">${frappe.format(data.total_target_items, { fieldtype: "Int" })}</div>
							</div>
						</div>
					</div>
				`;
				wrapper.html(html);
			},
		});
	}

	d.show();
	setTimeout(update_preview, 300);
}

function show_adjustment_history_dialog(frm) {
	const d = new frappe.ui.Dialog({
		title: __("Price Adjustment History & Restore"),
		size: "large",
		fields: [
			{
				fieldname: "history_box",
				fieldtype: "HTML",
			},
		],
		primary_action_label: __("Close"),
		primary_action: function () {
			d.hide();
		},
	});

	function load_history() {
		const wrapper = d.get_field("history_box").$wrapper;
		wrapper.html("<div class='text-muted p-3'>" + __("Loading adjustment history...") + "</div>");

		frappe.call({
			method: "managely_terminal.managely_terminal.api.price_list_tools.get_adjustment_logs",
			args: {
				price_list: frm.doc.name,
			},
			callback: function (r) {
				const logs = r.message || [];
				if (logs.length === 0) {
					wrapper.html(`
						<div class="alert alert-info small mb-0">
							${__("No previous adjustments found for this Price List.")}
						</div>
					`);
					return;
				}

				let table_rows = "";
				logs.forEach(function (log) {
					let action_btn = "";
					let status_badge = "";

					if (log.operation_type === "Restore") {
						status_badge = `<span class="badge badge-info">${__("Restore Operation")}</span>`;
					} else if (log.restored) {
						status_badge = `<span class="badge badge-secondary">${__("Reverted")}</span>`;
					} else {
						status_badge = `<span class="badge badge-success">${__("Active")}</span>`;
						action_btn = `
							<button class="btn btn-xs btn-outline-danger btn-restore" data-log="${log.name}">
								${__("Restore")}
							</button>
						`;
					}

					let detail_desc = "";
					if (log.adjustment_method === "Percentage") {
						detail_desc = `${log.adjustment_direction === "Increase" ? "+" : "-"}${log.adjustment_value}%`;
					} else if (log.adjustment_method === "Fixed Amount") {
						detail_desc = `${log.adjustment_direction === "Increase" ? "+" : "-"}${log.adjustment_value}`;
					} else {
						detail_desc = __("Exact Copy");
					}

					if (log.item_group) {
						detail_desc += ` (${__("Group:")} ${log.item_group})`;
					}

					table_rows += `
						<tr>
							<td class="small text-nowrap">${frappe.datetime.str_to_user(log.creation)}</td>
							<td class="small">${log.owner}</td>
							<td class="small font-weight-bold">${__(log.operation_type)}</td>
							<td class="small">${detail_desc}</td>
							<td class="small text-center">${log.items_count}</td>
							<td class="small text-center">${status_badge}</td>
							<td class="small text-center">${action_btn}</td>
						</tr>
					`;
				});

				const html = `
					<div class="table-responsive">
						<table class="table table-bordered table-hover table-sm">
							<thead class="thead-light">
								<tr class="small">
									<th>${__("Timestamp")}</th>
									<th>${__("User")}</th>
									<th>${__("Operation")}</th>
									<th>${__("Details")}</th>
									<th class="text-center">${__("Items")}</th>
									<th class="text-center">${__("Status")}</th>
									<th class="text-center">${__("Action")}</th>
								</tr>
							</thead>
							<tbody>
								${table_rows}
							</tbody>
						</table>
					</div>
				`;
				wrapper.html(html);

				wrapper.find(".btn-restore").on("click", function () {
					const log_name = $(this).attr("data-log");
					frappe.confirm(
						__("Are you sure you want to restore previous item rates from this operation? Current rates will be reverted."),
						function () {
							frappe.call({
								method: "managely_terminal.managely_terminal.api.price_list_tools.restore_adjustment",
								args: { log_name: log_name },
								freeze: true,
								freeze_message: __("Restoring previous prices..."),
								callback: function (res) {
									if (res.message && res.message.status === "success") {
										frappe.show_alert({
											message: __("Successfully restored rates for {0} items.", [res.message.restored_count]),
											indicator: "green",
										}, 5);
										load_history();
										frm.reload_doc();
									}
								},
							});
						}
					);
				});
			},
		});
	}

	d.show();
	load_history();
}
