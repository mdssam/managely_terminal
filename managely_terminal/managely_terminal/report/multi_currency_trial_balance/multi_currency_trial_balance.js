// Copyright (c) 2026, Managely Terminal and Contributors
// License: MIT. See license.txt

frappe.query_reports["Multi Currency Trial Balance"] = {
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			reqd: 1,
			default: frappe.defaults.get_user_default("Company"),
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			reqd: 1,
			default: frappe.datetime.year_start(),
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			reqd: 1,
			default: frappe.datetime.get_today(),
		},
		{
			fieldname: "cost_center",
			label: __("Cost Center"),
			fieldtype: "Link",
			options: "Cost Center",
			get_query: function () {
				var company = frappe.query_report.get_filter_value("company");
				return {
					doctype: "Cost Center",
					filters: {
						company: company,
					},
				};
			},
		},
		{
			fieldname: "exchange_rate",
			label: __("Exchange Rate"),
			fieldtype: "Float",
			reqd: 1,
		},
		{
			fieldname: "show_zero_values",
			label: __("Show zero values"),
			fieldtype: "Check",
			default: 0,
		},
	],
	onload: function(report) {
		const company = report.get_filter_value("company");
		frappe.call({
			method: "managely_terminal.managely_terminal.accounting.customizations.get_company_dual_rate",
			args: { company: company },
			callback: function(r) {
				if (r.message && !report.get_filter_value("exchange_rate")) {
					report.set_filter_value("exchange_rate", r.message);
				}
			}
		});
	},
	tree: true,
	name_field: "account",
	parent_field: "parent_account",
	initial_depth: 3,
};
