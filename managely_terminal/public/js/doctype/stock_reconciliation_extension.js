frappe.ui.form.on("Stock Reconciliation", {
	refresh(frm) {
		if (frm.doc.docstatus < 1) {
			frm.events.get_items = function (frm) {
				let fields = [
					{
						label: __("Warehouse"),
						fieldname: "warehouse",
						fieldtype: "Link",
						options: "Warehouse",
						reqd: 1,
						default: frm.doc.set_warehouse || undefined,
						get_query: function () {
							return {
								filters: {
									company: frm.doc.company,
								},
							};
						},
					},
					{
						label: __("Item Group"),
						fieldname: "item_group",
						fieldtype: "Link",
						options: "Item Group",
					},
					{
						label: __("Item Code"),
						fieldname: "item_code",
						fieldtype: "Link",
						options: "Item",
						get_query: function () {
							let dialog = cur_dialog;
							let item_group = dialog ? dialog.get_value("item_group") : null;
							let filters = {
								is_stock_item: 1,
								has_variants: 0,
								disabled: 0,
							};
							if (item_group) {
								filters["item_group"] = item_group;
							}
							return {
								filters: filters,
							};
						},
					},
					{
						label: __("Ignore Empty Stock"),
						fieldname: "ignore_empty_stock",
						fieldtype: "Check",
					},
				];

				frappe.prompt(
					fields,
					function (data) {
						frappe.call({
							method: "managely_terminal.managely_terminal.stock_automation.get_items_for_stock_reconciliation",
							args: {
								warehouse: data.warehouse,
								posting_date: frm.doc.posting_date,
								posting_time: frm.doc.posting_time,
								company: frm.doc.company,
								item_code: data.item_code,
								item_group: data.item_group,
								ignore_empty_stock: data.ignore_empty_stock,
							},
							callback: function (r) {
								if (r.exc || !r.message || !r.message.length) {
									frappe.msgprint(__("No items found matching the selected criteria."));
									return;
								}

								frm.clear_table("items");

								r.message.forEach((row) => {
									let item = frm.add_child("items");
									$.extend(item, row);

									item.qty = item.qty || 0;
									item.valuation_rate = item.valuation_rate || 0;
									item.use_serial_batch_fields = cint(
										frappe.user_defaults?.use_serial_batch_fields
									);
								});
								frm.refresh_field("items");
							},
						});
					},
					__("Get Items"),
					__("Update")
				);
			};
		}
	},
});
