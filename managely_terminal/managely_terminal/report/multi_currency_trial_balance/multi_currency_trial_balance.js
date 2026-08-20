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
			label: __("LBP/USD Rate"),
			fieldtype: "Float",
			default: 89500,
			reqd: 1,
		},
	],
};
