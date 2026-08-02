frappe.pages['pos_closing_monitor'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('POS Closing Monitor'),
		single_column: true
	});

	page.pos_monitor = new POSClosingMonitor(page);
};

class POSClosingMonitor {
	constructor(page) {
		this.page = page;
		this.wrapper = $(page.body);
		this.filters = {};
		this.entries = [];
		this.currency = '';
		this.datatable = null;
		this.is_ready = false;
		this.page_size = 25;
		this.current_page = 1;
		this.total_count = 0;
		this.setup_styles();
		this.setup_page_actions();
		this.render_template();
		this.setup_filters();
		this.bind_table_actions();
		this.is_ready = true;
		this.refresh();
	}

	setup_styles() {
		if ($('#pos-monitor-custom-styles').length === 0) {
			$('head').append(`
				<style id="pos-monitor-custom-styles">
					.polished-datatable-wrapper .datatable {
						width: 100% !important;
						background-color: #ffffff !important;
						flex: 1 !important;
						display: flex !important;
						flex-direction: column !important;
					}
					.polished-datatable-wrapper .datatable .dt-header {
						background-color: #f3f4f6 !important;
						border-bottom: 2px solid #d1d5db !important;
						flex-shrink: 0 !important;
					}
					.polished-datatable-wrapper .dt-header .dt-cell {
						background-color: #f3f4f6 !important;
						color: #111827 !important;
						font-weight: 700 !important;
						font-size: 13px !important;
						border-right: 1px solid #e5e7eb !important;
					}
					.polished-datatable-wrapper .dt-row .dt-cell {
						font-size: 13px !important;
						color: #1f2937 !important;
						border-bottom: 1px solid #f3f4f6 !important;
						border-right: 1px solid #f3f4f6 !important;
					}
					.polished-datatable-wrapper .dt-row:hover .dt-cell {
						background-color: #f9fafb !important;
					}
					.polished-datatable-wrapper a:hover {
						text-decoration: underline !important;
					}
					.polished-datatable-wrapper .dt-scrollable {
						max-height: calc(100vh - 360px) !important;
						overflow-y: auto !important;
						overflow-x: hidden !important;
						flex: 1 !important;
					}
					.badge-status {
						display: inline-flex;
						align-items: center;
						justify-content: center;
						padding: 4px 10px;
						font-size: 11px;
						font-weight: 600;
						border-radius: 9999px;
						text-transform: uppercase;
						letter-spacing: 0.4px;
					}
					.badge-closed {
						background-color: #dcfce7;
						color: #16a34a;
						border: 1px solid #86efac;
					}
					.badge-open {
						background-color: #e0f2fe;
						color: #2563eb;
						border: 1px solid #7dd3fc;
					}
					.badge-draft {
						background-color: #f3f4f6;
						color: #4b5563;
						border: 1px solid #d1d5db;
					}
					.badge-cancelled {
						background-color: #fee2e2;
						color: #dc2626;
						border: 1px solid #fca5a5;
					}
					.action-btn {
						padding: 5px 12px;
						font-size: 12px;
						border-radius: 6px;
						cursor: pointer;
						border: 1px solid #d1d5db;
						background-color: #ffffff;
						color: #1f2937;
						font-weight: 600;
						transition: all 0.15s ease;
						box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
					}
					.action-btn:hover:not(:disabled) {
						background-color: #f3f4f6;
						border-color: #9ca3af;
						color: #111827;
					}
					.action-btn:disabled {
						opacity: 0.5;
						cursor: not-allowed;
						background-color: #f9fafb;
						border-color: #e5e7eb;
						box-shadow: none;
					}
					.popup-section-card {
						background: #ffffff;
						border: 1px solid #d1d5db;
						border-radius: 8px;
						padding: 16px;
						margin-bottom: 16px;
						box-shadow: 0 1px 2px rgba(0,0,0,0.02);
					}
					.popup-table {
						width: 100%;
						border-collapse: collapse;
					}
					.popup-table th {
						background-color: #f3f4f6;
						color: #111827;
						font-weight: 700;
						font-size: 12px;
						text-align: left;
						padding: 10px 12px;
						border-bottom: 2px solid #d1d5db;
					}
					.popup-table td {
						font-size: 13px;
						color: #1f2937;
						padding: 10px 12px;
						border-bottom: 1px solid #e5e7eb;
					}
					.popup-table tr:hover td {
						background-color: #f9fafb;
					}
				</style>
			`);
		}
	}

	setup_page_actions() {
		this.page.set_primary_action(__('Refresh'), () => {
			this.refresh();
		}, 'refresh');

		this.page.add_inner_button(__('Export'), () => {
			this.export_to_csv();
		});
	}

	render_template() {
		this.wrapper.html(frappe.render_template("pos_closing_monitor", {}));
	}

	setup_filters() {
		const default_from_date = frappe.datetime.add_days(frappe.datetime.get_today(), -30);
		this.from_date_field = frappe.ui.form.make_control({
			parent: this.wrapper.find('.filter-from-date'),
			df: {
				fieldname: 'from_date',
				label: __('From Date'),
				fieldtype: 'Date',
				default: default_from_date,
				onchange: () => this.on_filter_change()
			},
			render_input: true
		});
		if (this.from_date_field) {
			this.from_date_field.set_value(default_from_date);
		}

		this.to_date_field = frappe.ui.form.make_control({
			parent: this.wrapper.find('.filter-to-date'),
			df: {
				fieldname: 'to_date',
				label: __('To Date'),
				fieldtype: 'Date',
				default: frappe.datetime.get_today(),
				onchange: () => this.on_filter_change()
			},
			render_input: true
		});
		if (this.to_date_field) {
			this.to_date_field.set_value(frappe.datetime.get_today());
		}

		this.pos_profile_field = frappe.ui.form.make_control({
			parent: this.wrapper.find('.filter-pos-profile'),
			df: {
				fieldname: 'pos_profile',
				label: __('Branch'),
				fieldtype: 'Select',
				options: [ { label: __('All Branches'), value: '' } ],
				default: '',
				onchange: () => this.on_filter_change()
			},
			render_input: true
		});

		frappe.db.get_list('POS Profile', {
			fields: ['name', 'custom_branch_name'],
			limit: 500
		}).then((profiles) => {
			if (profiles && this.pos_profile_field) {
				let unique_branches = new Map();
				profiles.forEach((p) => {
					let raw_branch = p.custom_branch_name || p.name || '';
					let clean_branch = raw_branch.toString().trim();
					if (clean_branch && !unique_branches.has(clean_branch.toLowerCase())) {
						unique_branches.set(clean_branch.toLowerCase(), clean_branch);
					}
				});

				let options = [ { label: __('All Branches'), value: '' } ];
				let sorted_branches = Array.from(unique_branches.values()).sort();
				sorted_branches.forEach((branch_name) => {
					options.push({
						label: branch_name,
						value: branch_name
					});
				});
				this.pos_profile_field.df.options = options;
				if (this.pos_profile_field.set_options) {
					this.pos_profile_field.set_options(options);
				}
			}
		});

		this.status_field = frappe.ui.form.make_control({
			parent: this.wrapper.find('.filter-status'),
			df: {
				fieldname: 'status',
				label: __('Status'),
				fieldtype: 'Select',
				options: "All\nOpen\nClosed\nDraft\nCancelled",
				default: 'All',
				onchange: () => this.on_filter_change()
			},
			render_input: true
		});
		if (this.status_field) {
			this.status_field.set_value('All');
		}

		this.user_field = frappe.ui.form.make_control({
			parent: this.wrapper.find('.filter-user'),
			df: {
				fieldname: 'cashier',
				label: __('Cashier'),
				fieldtype: 'Select',
				options: [ { label: __('All Cashiers'), value: '' } ],
				default: '',
				onchange: () => this.on_filter_change()
			},
			render_input: true
		});

		frappe.db.get_list('Employee', {
			fields: ['name', 'custom_pos_username', 'employee_name', 'user_id'],
			limit: 1000
		}).then((employees) => {
			if (employees && this.user_field) {
				let unique_cashiers = new Map();
				employees.forEach((emp) => {
					let raw_name = emp.custom_pos_username || emp.employee_name || emp.user_id || '';
					let clean_name = raw_name.toString().trim();
					if (clean_name && !unique_cashiers.has(clean_name.toLowerCase())) {
						unique_cashiers.set(clean_name.toLowerCase(), { label: clean_name, value: emp.name });
					}
				});

				let options = [ { label: __('All Cashiers'), value: '' } ];
				let sorted_cashiers = Array.from(unique_cashiers.values()).sort((a, b) => a.label.localeCompare(b.label));
				options.push(...sorted_cashiers);
				this.user_field.df.options = options;
				if (this.user_field.set_options) {
					this.user_field.set_options(options);
				}
			}
		});

		this.company_field = frappe.ui.form.make_control({
			parent: this.wrapper.find('.filter-company'),
			df: {
				fieldname: 'company',
				label: __('Company'),
				fieldtype: 'Link',
				options: 'Company',
				default: frappe.defaults.get_user_default('Company') || '',
				onchange: () => this.on_filter_change()
			},
			render_input: true
		});
		if (this.company_field && frappe.defaults.get_user_default('Company')) {
			this.company_field.set_value(frappe.defaults.get_user_default('Company'));
		}
	}

	on_filter_change() {
		if (this.is_ready) {
			this.current_page = 1;
			this.refresh();
		}
	}

	get_filter_values() {
		return {
			from_date: this.from_date_field ? (this.from_date_field.get_value() || '') : '',
			to_date: this.to_date_field ? (this.to_date_field.get_value() || '') : '',
			pos_profile: this.pos_profile_field ? (this.pos_profile_field.get_value() || '') : '',
			status: this.status_field ? (this.status_field.get_value() || 'All') : 'All',
			user: this.user_field ? (this.user_field.get_value() || '') : '',
			cashier: this.user_field ? (this.user_field.get_value() || '') : '',
			company: this.company_field ? (this.company_field.get_value() || '') : ''
		};
	}

	refresh() {
		let filters = this.get_filter_values();
		const wrapper_dom = this.wrapper.find('#pos-datatable-wrapper');
		const empty_headers_dom = this.wrapper.find('#empty-table-headers');
		const no_data_dom = this.wrapper.find('#no-pos-sessions');
		
		no_data_dom.hide();
		empty_headers_dom.hide();

		frappe.call({
			method: 'managely_terminal.managely_terminal.page.pos_closing_monitor.pos_closing_monitor.get_closing_sessions',
			args: filters,
			callback: (res) => {
				if (res && res.message) {
					this.entries = res.message.entries || [];
					this.currency = res.message.summary ? (res.message.summary.currency || '') : '';
					this.total_count = this.entries.length;
					this.current_page = 1;
					this.render_datatable();
				}
			},
			error: (err) => {
				frappe.show_alert({ message: __('Error loading sessions data.'), indicator: 'red' });
			}
		});
	}

	get_dt_columns() {
		return [
			{
				name: __('Details'),
				editable: false,
				width: 75,
				align: 'center',
				format: (val, row, col, row_data) => {
					if (!row_data) return '';
					const session_name = row_data._session_name || row_data[1];
					const eye_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; pointer-events: none;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
					return `<button class="action-btn btn-view-details" data-session="${session_name}" style="padding: 4px 8px; display: inline-flex; align-items: center; justify-content: center; height: 28px; width: 34px;" title="${__('View Session Details')}">${eye_svg}</button>`;
				}
			},
			{
				name: __('Opening Session'),
				editable: false,
				width: 210,
				format: (val) => `<a href="/app/pos-opening-entry/${val}" target="_blank" rel="noopener noreferrer" style="font-weight: 600; color: #111827; text-decoration: none;">${(val || '').toString().trim()}</a>`
			},
			{
				name: __('Branch'),
				editable: false,
				width: 150,
				format: (val) => `<span style="font-weight: 600; color: #111827;">${(val || '').toString().trim()}</span>`
			},
			{
				name: __('Closing Entry'),
				editable: false,
				width: 150,
				format: (val) => val ? `<a href="/app/pos-closing-entry/${val}" target="_blank" rel="noopener noreferrer" style="font-weight: 600; color: #111827; text-decoration: none;">${(val || '').toString().trim()}</a>` : `<span style="color: #6b7280; font-weight: 500;">${__('In Progress')}</span>`
			},
			{
				name: __('Cashier'),
				editable: false,
				width: 150,
				format: (val, row, col, row_data) => {
					const display = row_data ? (row_data._cashier_display || val) : val;
					return `<span style="font-weight: 600; color: #111827;">${(display || '').toString().trim()}</span>`;
				}
			},
			{
				name: __('Posting Date'),
				editable: false,
				width: 110,
				format: (val) => frappe.datetime.str_to_user((val || '').toString().trim())
			},
			{
				name: __('Status'),
				editable: false,
				width: 100,
				align: 'center',
				format: (val, row, col, row_data) => {
					if (!row_data) return '';
					const st = row_data._status_raw;
					const doc_status = row_data._docstatus;
					const has_closing = row_data._has_closing;
					if (st === 'Closed' || (doc_status === 1 && has_closing)) {
						return `<span class="badge-status badge-closed">${__('Closed')}</span>`;
					} else if (st === 'Open' || (doc_status === 1 && !has_closing)) {
						return `<span class="badge-status badge-open">${__('Open')}</span>`;
					} else if (doc_status === 2 || st === 'Cancelled') {
						return `<span class="badge-status badge-cancelled">${__('Cancelled')}</span>`;
					}
					return `<span class="badge-status badge-draft">${__('Draft')}</span>`;
				}
			},
			{
				name: __('Expected'),
				editable: false,
				width: 120,
				align: 'right',
				format: (val) => `<span style="font-weight: 600;">${format_currency(val || 0, this.currency)}</span>`
			},
			{
				name: __('Actual'),
				editable: false,
				width: 120,
				align: 'right',
				format: (val) => `<span style="font-weight: 600;">${format_currency(val || 0, this.currency)}</span>`
			},
			{
				name: __('Difference'),
				editable: false,
				width: 120,
				align: 'right',
				format: (val) => {
					let diff = flt(val || 0);
					let color = '#111827';
					if (diff < 0) color = '#dc2626';
					else if (diff > 0) color = '#16a34a';
					return `<span style="color: ${color}; font-weight: 700;">${format_currency(diff, this.currency)}</span>`;
				}
			}
		];
	}

	format_data_rows(dataset) {
		const rows = dataset || this.entries;
		return rows.map((row) => {
			let cashier_display = (row.cashier_name || row.custom_employee_name || row.custom_employee || row.user || '').toString().trim();
			let session_name = (row.name || '').toString().trim();
			let row_array = [
				'', // placeholder for Details icon column
				session_name,
				(row.custom_branch_name || row.pos_profile || '').toString().trim(),
				(row.pos_closing_entry || '').toString().trim(),
				cashier_display,
				(row.posting_date || '').toString().trim(),
				row.status,
				flt(row.expected_amount),
				flt(row.closing_amount),
				flt(row.difference)
			];
			
			row_array._session_name = session_name;
			row_array._status_raw = row.status;
			row_array._docstatus = row.docstatus;
			row_array._has_closing = !!row.pos_closing_entry;
			row_array._pos_profile = row.pos_profile;
			row_array._cashier_display = cashier_display;
			
			return row_array;
		});
	}

	render_datatable() {
		const wrapper_dom = this.wrapper.find('#pos-datatable-wrapper');
		const empty_headers_dom = this.wrapper.find('#empty-table-headers');
		const no_data_dom = this.wrapper.find('#no-pos-sessions');

		if (!this.entries || this.entries.length === 0) {
			if (this.datatable) {
				this.datatable.destroy();
				this.datatable = null;
			}
			wrapper_dom.hide();
			empty_headers_dom.show();
			no_data_dom.show();
			no_data_dom.css('display', 'flex');
			this.update_pager();
			return;
		}

		empty_headers_dom.hide();
		no_data_dom.hide();
		wrapper_dom.show();

		const start_idx = (this.current_page - 1) * this.page_size;
		const end_idx = start_idx + this.page_size;
		const paged_entries = this.entries.slice(start_idx, end_idx);

		const dt_data = this.format_data_rows(paged_entries);
		const dt_columns = this.get_dt_columns();
		const container = wrapper_dom.get(0);

		if (this.datatable) {
			this.datatable.destroy();
		}

		const datatable_options = {
			columns: dt_columns,
			data: dt_data,
			cellHeight: 44,
			dynamicRowHeight: false,
			checkboxColumn: false,
			inlineFilters: false,
			layout: 'fluid',
			serialNoColumn: false,
			direction: frappe.utils.is_rtl() ? 'rtl' : 'ltr'
		};

		this.datatable = new frappe.DataTable(container, datatable_options);
		if (this.datatable && this.datatable.style && this.datatable.style.scopeClass) {
			$(`.${this.datatable.style.scopeClass} .dt-scrollable`).css({
				"max-height": "calc(100vh - 360px)",
				"flex": "1",
				"overflow-y": "auto",
				"overflow-x": "hidden"
			});
		}
		this.update_pager();
	}

	update_pager() {
		const start_idx_dom = this.wrapper.find('#pager-start-idx');
		const end_idx_dom = this.wrapper.find('#pager-end-idx');
		const total_count_dom = this.wrapper.find('#pager-total-count');
		const page_display_dom = this.wrapper.find('#pager-page-display');
		const btn_first = this.wrapper.find('#pager-btn-first');
		const btn_prev = this.wrapper.find('#pager-btn-prev');
		const btn_next = this.wrapper.find('#pager-btn-next');
		const btn_last = this.wrapper.find('#pager-btn-last');

		if (this.total_count === 0) {
			start_idx_dom.text('0');
			end_idx_dom.text('0');
			total_count_dom.text('0');
			page_display_dom.text(__('Page 0 of 0'));
			btn_first.prop('disabled', true);
			btn_prev.prop('disabled', true);
			btn_next.prop('disabled', true);
			btn_last.prop('disabled', true);
			return;
		}

		const total_pages = Math.ceil(this.total_count / this.page_size) || 1;
		if (this.current_page > total_pages) {
			this.current_page = total_pages;
		}

		const start_idx = (this.current_page - 1) * this.page_size + 1;
		const end_idx = Math.min(this.current_page * this.page_size, this.total_count);

		start_idx_dom.text(start_idx);
		end_idx_dom.text(end_idx);
		total_count_dom.text(this.total_count);
		page_display_dom.text(__(`Page ${this.current_page} of ${total_pages}`));

		btn_first.prop('disabled', this.current_page === 1);
		btn_prev.prop('disabled', this.current_page === 1);
		btn_next.prop('disabled', this.current_page === total_pages);
		btn_last.prop('disabled', this.current_page === total_pages);
	}

	bind_table_actions() {
		const self = this;
		this.wrapper.on('click', '.btn-view-details', function(e) {
			e.stopPropagation();
			const session_name = $(this).attr('data-session');
			if (session_name) {
				self.show_session_details_popup(session_name);
			}
		});

		this.wrapper.on('click', '#btn-clear-date-filter', function(e) {
			e.stopPropagation();
			if (self.from_date_field) {
				self.from_date_field.set_value('');
			}
			if (self.to_date_field) {
				self.to_date_field.set_value('');
			}
		});

		this.wrapper.on('change', '#pager-page-size', function(e) {
			e.stopPropagation();
			self.page_size = parseInt($(this).val()) || 25;
			self.current_page = 1;
			self.render_datatable();
		});

		this.wrapper.on('click', '#pager-btn-first', function(e) {
			e.stopPropagation();
			if (self.current_page !== 1 && !$(this).prop('disabled')) {
				self.current_page = 1;
				self.render_datatable();
			}
		});

		this.wrapper.on('click', '#pager-btn-prev', function(e) {
			e.stopPropagation();
			if (self.current_page > 1 && !$(this).prop('disabled')) {
				self.current_page--;
				self.render_datatable();
			}
		});

		this.wrapper.on('click', '#pager-btn-next', function(e) {
			e.stopPropagation();
			const total_pages = Math.ceil(self.total_count / self.page_size) || 1;
			if (self.current_page < total_pages && !$(this).prop('disabled')) {
				self.current_page++;
				self.render_datatable();
			}
		});

		this.wrapper.on('click', '#pager-btn-last', function(e) {
			e.stopPropagation();
			const total_pages = Math.ceil(self.total_count / self.page_size) || 1;
			if (self.current_page !== total_pages && !$(this).prop('disabled')) {
				self.current_page = total_pages;
				self.render_datatable();
			}
		});
	}

	show_session_details_popup(session_name) {
		let dialog = new frappe.ui.Dialog({
			title: __('Session Full Details & Reconciliation') + ` (${session_name})`,
			size: 'large',
			fields: [
				{
					fieldname: 'popup_html',
					fieldtype: 'HTML',
					options: `<div class="text-center p-5"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">${__('Loading details...')}</p></div>`
				}
			]
		});
		dialog.show();

		frappe.call({
			method: 'managely_terminal.managely_terminal.page.pos_closing_monitor.pos_closing_monitor.get_session_popup_details',
			args: { pos_session: session_name },
			callback: (res) => {
				if (!res || !res.message) {
					dialog.fields_dict.popup_html.$wrapper.html(`<div class="alert alert-danger">${__('Error loading session details.')}</div>`);
					return;
				}
				const data = res.message;
				const sess = data.session || {};
				const curr = sess.currency || '';
				const pay_rows = data.payment_reconciliation || [];
				const txns = data.suspended_transactions || [];

				let st_badge_class = 'badge-draft';
				if (sess.status === 'Closed') st_badge_class = 'badge-closed';
				else if (sess.status === 'Open') st_badge_class = 'badge-open';
				else if (sess.status === 'Cancelled') st_badge_class = 'badge-cancelled';

				let html = `
				<div class="session-popup-container" style="padding: 4px;">
					
					<!-- Section 1: Session Overview -->
					<div class="popup-section-card">
						<div style="font-size: 14px; font-weight: 700; color: #1e3a8a; margin-bottom: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">
							${__('Session Overview')}
						</div>
						<div class="row g-3" style="font-size: 13px;">
							<div class="col-sm-4">
								<div style="color: #6b7280; font-size: 11px; font-weight: 600; text-transform: uppercase;">${__('Opening Session')}</div>
								<div style="font-weight: 600; color: #111827; margin-top: 2px;">
									<a href="/app/pos-opening-entry/${sess.name}" target="_blank" style="color: #111827; text-decoration: underline;">${sess.name}</a>
								</div>
							</div>
							<div class="col-sm-4">
								<div style="color: #6b7280; font-size: 11px; font-weight: 600; text-transform: uppercase;">${__('Branch')}</div>
								<div style="font-weight: 600; color: #111827; margin-top: 2px;">${sess.branch || sess.pos_profile}</div>
							</div>
							<div class="col-sm-4">
								<div style="color: #6b7280; font-size: 11px; font-weight: 600; text-transform: uppercase;">${__('Cashier')}</div>
								<div style="font-weight: 600; color: #111827; margin-top: 2px;">${sess.cashier || sess.user}</div>
							</div>
							<div class="col-sm-4">
								<div style="color: #6b7280; font-size: 11px; font-weight: 600; text-transform: uppercase;">${__('Closing Entry')}</div>
								<div style="font-weight: 600; color: #111827; margin-top: 2px;">
									${sess.pos_closing_entry ? `<a href="/app/pos-closing-entry/${sess.pos_closing_entry}" target="_blank" style="color: #111827; text-decoration: underline;">${sess.pos_closing_entry}</a>` : `<span style="color: #6b7280;">${__('In Progress')}</span>`}
								</div>
							</div>
							<div class="col-sm-4">
								<div style="color: #6b7280; font-size: 11px; font-weight: 600; text-transform: uppercase;">${__('Posting Date')}</div>
								<div style="font-weight: 600; color: #111827; margin-top: 2px;">${frappe.datetime.str_to_user(sess.posting_date)}</div>
							</div>
							<div class="col-sm-4">
								<div style="color: #6b7280; font-size: 11px; font-weight: 600; text-transform: uppercase;">${__('Status')}</div>
								<div style="margin-top: 2px;">
									<span class="badge-status ${st_badge_class}">${__('Status: ' + sess.status)}</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Section 2: Payment Modes Reconciliation -->
					<div class="popup-section-card">
						<div style="font-size: 14px; font-weight: 700; color: #1e3a8a; margin-bottom: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">
							${__('POS Profile Payment Modes (Expected vs Actual)')}
						</div>
						<div style="overflow-x: auto;">
							<table class="popup-table">
								<thead>
									<tr>
										<th style="width: 40%;">${__('Mode of Payment')}</th>
										<th style="width: 20%; text-align: right;">${__('Expected Amount')}</th>
										<th style="width: 20%; text-align: right;">${__('Actual Amount')}</th>
										<th style="width: 20%; text-align: right;">${__('Difference')}</th>
									</tr>
								</thead>
								<tbody>
				`;

				let total_exp = 0, total_act = 0, total_diff = 0;
				if (pay_rows.length === 0) {
					html += `<tr><td colspan="4" class="text-center text-muted" style="padding: 16px;">${__('No modes of payment registered for this profile.')}</td></tr>`;
				} else {
					pay_rows.forEach(p => {
						let exp = flt(p.expected_amount || 0);
						let act = flt(p.actual_amount || 0);
						let diff = flt(p.difference || 0);
						total_exp += exp;
						total_act += act;
						total_diff += diff;

						let diff_color = '#111827';
						if (diff < 0) diff_color = '#dc2626';
						else if (diff > 0) diff_color = '#16a34a';

						html += `
							<tr>
								<td style="font-weight: 600;">${p.mode_of_payment || ''}</td>
								<td style="text-align: right; font-weight: 600;">${format_currency(exp, curr)}</td>
								<td style="text-align: right; font-weight: 600;">${format_currency(act, curr)}</td>
								<td style="text-align: right; font-weight: 700; color: ${diff_color};">${format_currency(diff, curr)}</td>
							</tr>
						`;
					});

					let tot_diff_color = '#111827';
					if (total_diff < 0) tot_diff_color = '#dc2626';
					else if (total_diff > 0) tot_diff_color = '#16a34a';

					html += `
						<tr style="background-color: #f9fafb; font-weight: 700; border-top: 2px solid #d1d5db;">
							<td>${__('Total')}</td>
							<td style="text-align: right;">${format_currency(total_exp, curr)}</td>
							<td style="text-align: right;">${format_currency(total_act, curr)}</td>
							<td style="text-align: right; color: ${tot_diff_color};">${format_currency(total_diff, curr)}</td>
						</tr>
					`;
				}

				html += `
								</tbody>
							</table>
						</div>
					</div>

					<!-- Section 3: POS Suspended Transactions -->
					<div class="popup-section-card" style="margin-bottom: 0;">
						<div style="font-size: 14px; font-weight: 700; color: #1e3a8a; margin-bottom: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">
							${__('POS Suspended Transactions')}
						</div>
						<div style="overflow-x: auto;">
							<table class="popup-table">
								<thead>
									<tr>
										<th style="width: 20%;">${__('Transaction ID')}</th>
										<th style="width: 12%;">${__('Type')}</th>
										<th style="width: 15%;">${__('Method')}</th>
										<th style="width: 20%;">${__('Description')}</th>
										<th style="width: 18%;">${__('Date & Time')}</th>
										<th style="width: 15%; text-align: right;">${__('Amount')}</th>
									</tr>
								</thead>
								<tbody>
				`;

				if (txns.length === 0) {
					html += `<tr><td colspan="6" class="text-center text-muted" style="padding: 24px; background: #f9fafb;">${__('No suspended transactions recorded for this session.')}</td></tr>`;
				} else {
					let total_suspended_amount = 0;
					txns.forEach(t => {
						let amt = flt(t.total_amount || 0);
						total_suspended_amount += amt;
						let raw_dt = t.posting_date_time ? t.posting_date_time.split('.')[0] : '';
						let time_str = raw_dt ? (frappe.datetime.str_to_user(raw_dt) || raw_dt) : '';

						html += `
							<tr>
								<td><a href="/app/pos-suspended-transaction/${t.name}" target="_blank" style="font-weight: 600; color: #111827; text-decoration: underline;">${t.name}</a></td>
								<td><span style="font-weight: 600; color: #4b5563;">${t.transaction_type || ''}</span></td>
								<td style="font-weight: 600;">${t.mode_of_payment || ''}</td>
								<td style="color: #4b5563;">${t.description || ''}</td>
								<td style="color: #4b5563; font-size: 12px; font-weight: 500;">${time_str}</td>
								<td style="text-align: right; font-weight: 700; color: #111827;">${format_currency(amt, curr)}</td>
							</tr>
						`;
					});

					html += `
						<tr style="background-color: #f9fafb; font-weight: 700; border-top: 2px solid #d1d5db;">
							<td colspan="5">${__('Total Suspended Amount')}</td>
							<td style="text-align: right; color: #111827;">${format_currency(total_suspended_amount, curr)}</td>
						</tr>
					`;
				}

				html += `
								</tbody>
							</table>
						</div>
					</div>

				</div>
				`;

				dialog.fields_dict.popup_html.$wrapper.html(html);
			}
		});
	}

	export_to_csv() {
		if (!this.entries || this.entries.length === 0) {
			frappe.show_alert({ message: __('No data available to export'), indicator: 'orange' });
			return;
		}

		let headers = ['Opening Session', 'Branch', 'Closing Entry', 'Cashier', 'Posting Date', 'Status', 'Expected Amount', 'Actual Amount', 'Difference'];
		let csv_rows = [headers.join(',')];

		this.entries.forEach((row) => {
			let cashier_display = (row.cashier_name || row.custom_employee_name || row.custom_employee || row.user || '').toString().trim();
			let values = [
				(row.name || '').toString().trim(),
				(row.custom_branch_name || row.pos_profile || '').toString().trim(),
				(row.pos_closing_entry || 'In Progress').toString().trim(),
				cashier_display,
				(row.posting_date || '').toString().trim(),
				(row.status || '').toString().trim(),
				flt(row.expected_amount),
				flt(row.closing_amount),
				flt(row.difference)
			].map((val) => `"${String(val).replace(/"/g, '""')}"`);
			csv_rows.push(values.join(','));
		});

		let csv_content = csv_rows.join("\n");
		let blob = new Blob(["\uFEFF" + csv_content], { type: 'text/csv;charset=utf-8;' });
		let link = document.createElement("a");
		let url = URL.createObjectURL(blob);
		link.setAttribute("href", url);
		link.setAttribute("download", `pos_closing_monitor_${frappe.datetime.get_today()}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}
}
