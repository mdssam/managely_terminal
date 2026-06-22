frappe.listview_settings['POS Suspended Transaction'] = {
	onload: function(listview) {
		listview.page.clear_primary_action();
		setTimeout(() => {
			$('.empty-state .btn-primary').hide();
			$('.empty-state').find('button').hide();
		}, 100);
	},
	refresh: function(listview) {
		listview.page.clear_primary_action();
		setTimeout(() => {
			$('.empty-state .btn-primary').hide();
			$('.empty-state').find('button').hide();
		}, 100);
	},
	formatters: {
		posting_date_time: function(value) {
			if (value) {
				let cleaned = value.split('.')[0];
				return frappe.datetime.str_to_user(cleaned);
			}
			return value;
		}
	}
};
