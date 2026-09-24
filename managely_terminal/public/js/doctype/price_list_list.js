// Copyright (c) 2026, Tati and contributors
// For license information, please see license.txt

frappe.listview_settings["Price List"] = {
	onload: function (listview) {
		listview.page.add_inner_button(__("Duplicate / Adjust Prices"), function () {
			frappe.prompt(
				[
					{
						fieldname: "source_price_list",
						label: __("Select Price List"),
						fieldtype: "Link",
						options: "Price List",
						reqd: 1,
					},
				],
				function (data) {
					frappe.set_route("Form", "Price List", data.source_price_list);
				},
				__("Select Price List to Adjust"),
				__("Open Price List")
			);
		});
	},
};
