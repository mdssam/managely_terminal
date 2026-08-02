frappe.provide("frappe.dashboards.chart_sources");

frappe.dashboards.chart_sources["Branch Payment Mode Balance"] = {
	method: "managely_terminal.managely_terminal.dashboard_chart_source.branch_payment_mode_balance.branch_payment_mode_balance.get",
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company"),
		},
	],
};
