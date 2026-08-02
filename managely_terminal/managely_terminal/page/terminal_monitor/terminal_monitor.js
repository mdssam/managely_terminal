frappe.pages['terminal_monitor'].on_page_load = function(wrapper) {
	if (frappe.session.user !== 'Administrator') {
		frappe.msgprint({
			title: 'Not Permitted',
			message: 'This page is accessible only by Administrator.',
			indicator: 'red'
		});
		frappe.set_route('Workspaces');
		return;
	}

	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Terminal Monitor',
		single_column: true
	});

	/* Render HTML Template directly from cache to bypass template compilation errors */
	$(frappe.templates['terminal_monitor'] || '').appendTo(page.body);

	/* Programmatically inject page styles to prevent template parsing issues with CSS braces */
	var css = `
		.terminal-monitor-container .list-group-item.active {
			background-color: #f1f3f5 !important;
			border-color: #dee2e6 !important;
			border-left: 4px solid #1b85b8 !important;
		}
		.terminal-monitor-container .nav-tabs .nav-link.active {
			color: #1b85b8 !important;
			border-bottom: 2px solid #1b85b8 !important;
			background: transparent !important;
		}
		.terminal-monitor-container .nav-tabs .nav-link:hover {
			border-color: transparent !important;
			color: #1b85b8 !important;
		}
		.terminal-monitor-container .font-mono {
			font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
		}
		.indicator-pill.black, .indicator-pill.dark {
			background-color: #111827 !important;
			color: #ffffff !important;
			border-radius: 9999px !important;
		}
		.terminal-monitor-container .badge-dark {
			background-color: #111827 !important;
			color: #ffffff !important;
		}
	`;
	$('<style>').prop('type', 'text/css').html(css).appendTo('head');

	page.add_inner_button('Deploy POS Update', function() {
		let d = new frappe.ui.Dialog({
			title: 'Deploy POS Update',
			fields: [
				{
					fieldname: 'html',
					fieldtype: 'HTML',
					options: `
						<div class="p-4 bg-white rounded">
							<div class="alert alert-secondary py-2 px-3 small font-weight-bold mb-3 d-flex justify-content-between align-items-center" style="border-radius: 6px; background-color: #f8f9fa; border: 1px solid #dee2e6;">
								<span class="text-secondary"><i class="fa fa-cloud-upload mr-1 text-primary"></i> Current Uploaded Release on Server:</span>
								<span id="current-deployed-ver" class="badge badge-light border font-weight-bold px-2 py-1 text-dark">Checking...</span>
							</div>
							<div class="alert alert-info py-2 px-3 small font-weight-bold mb-4" style="border-radius: 6px;">
								<i class="fa fa-info-circle mr-1"></i> Please select the <b>latest.yml</b>, the <b>.exe</b> setup file, and the <b>.blockmap</b> file.
							</div>
							
							<div class="form-group mb-4">
								<label class="text-secondary small font-weight-bold text-uppercase tracking-wider mb-2">Select Update Files</label>
								<div class="custom-file" style="border-radius: 6px; overflow: hidden;">
									<input type="file" id="pos_update_files" multiple accept=".yml,.exe,.blockmap" class="custom-file-input" />
									<label class="custom-file-label" for="pos_update_files" style="padding-top: 8px;">Choose files...</label>
								</div>
							</div>
							
							<div id="upload_progress_container" style="display:none; margin-top: 25px;">
								<div class="d-flex justify-content-between mb-1">
									<span class="text-secondary small font-weight-bold text-uppercase" id="upload_status">Uploading...</span>
									<span class="text-secondary small font-weight-bold" id="upload_percentage">0%</span>
								</div>
								<div class="progress" style="height: 8px; border-radius: 4px; background-color: #e9ecef;">
									<div id="upload_progress_bar" class="progress-bar progress-bar-striped progress-bar-animated bg-primary" role="progressbar" style="width: 0%; transition: width 0.3s ease;"></div>
								</div>
							</div>
						</div>
					`
				}
			],
			primary_action_label: 'Start Deployment',
			primary_action: function() {
				let input = d.get_field('html').$wrapper.find('#pos_update_files')[0];
				if(!input.files || input.files.length === 0) {
					frappe.msgprint('Please select files first.');
					return;
				}

				let files = Array.from(input.files);
				
				let exeFile = files.find(f => f.name.endsWith('.exe'));
				if(!exeFile) {
					frappe.msgprint('Please select the .exe setup file.');
					return;
				}

				d.get_primary_btn().prop('disabled', true);
				d.get_field('html').$wrapper.find('#upload_progress_container').show();
				let $status = d.get_field('html').$wrapper.find('#upload_status');
				let $bar = d.get_field('html').$wrapper.find('#upload_progress_bar');

				const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
				
				async function uploadFileChunked(file) {
					const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
					
					for (let i = 0; i < totalChunks; i++) {
						const start = i * CHUNK_SIZE;
						const end = Math.min(start + CHUNK_SIZE, file.size);
						const chunk = file.slice(start, end);
						const isLast = (i === totalChunks - 1);
						
						const percentage = Math.round((i / totalChunks) * 100);
						$status.text('Uploading ' + file.name + ' (Chunk ' + (i + 1) + '/' + totalChunks + ')...');
						$bar.css('width', percentage + '%');
						d.get_field('html').$wrapper.find('#upload_percentage').text(percentage + '%');
						
						try {
							await new Promise((resolve, reject) => {
								let url = '/api/method/managely_terminal.managely_terminal.api.electron.updater.upload_update' + 
									'?filename=' + encodeURIComponent(file.name) + 
									'&chunk_index=' + i + 
									'&is_last=' + (isLast ? '1' : '0');

								$.ajax({
									url: url,
									type: 'POST',
									data: chunk,
									processData: false,
									contentType: 'application/octet-stream',
									headers: {
										'X-Frappe-CSRF-Token': frappe.csrf_token
									},
									success: function(r) {
										resolve(r);
									},
									error: function(err) {
										reject(err);
									}
								});
							});
						} catch (error) {
							throw new Error('Upload failed for chunk ' + (i + 1));
						}
					}
					$bar.css('width', '100%');
					d.get_field('html').$wrapper.find('#upload_percentage').text('100%');
				}

				async function processDeploy() {
					try {
						for(let file of files) {
							await uploadFileChunked(file);
						}
						$status.text('Deployment Complete!');
						frappe.show_alert({message: 'Update deployed successfully!', indicator: 'green'});
						setTimeout(() => {
							d.hide();
							if (typeof load_latest_pos_version === 'function') load_latest_pos_version();
							if (typeof load_terminals === 'function') load_terminals();
						}, 2000);
					} catch(e) {
						$status.text('Error: ' + e.message);
						$status.removeClass('text-secondary').addClass('text-danger');
						d.get_primary_btn().prop('disabled', false);
						frappe.msgprint('Deployment failed: ' + e.message);
					}
				}

				processDeploy();
			}
		});
		
		d.get_field('html').$wrapper.find('#pos_update_files').on('change', function(e) {
			let files = Array.from(e.target.files).map(f => f.name);
			let label = d.get_field('html').$wrapper.find('.custom-file-label');
			if (files.length > 0) {
				label.text(files.join(', '));
			} else {
				label.text('Choose files...');
			}
		});

		frappe.call({
			method: 'managely_terminal.managely_terminal.api.electron.terminals.get_latest_pos_version',
			callback: function(r) {
				let ver = r.message || '';
				let $ver_el = d.get_field('html').$wrapper.find('#current-deployed-ver');
				if (ver) {
					$ver_el.removeClass('badge-light border text-dark').addClass('badge-success text-white').html('<i class="fa fa-check-circle mr-1"></i>v' + ver);
				} else {
					$ver_el.html('<i class="fa fa-exclamation-circle mr-1"></i>No Release Uploaded');
				}
			}
		});

		d.show();
	});
	var selected_terminal_id = null;
	var terminals_data = [];
	var polling_interval = null;

	/* Pagination state */
	var page_size = 15;
	var logs_cache = {
		sync_history: [],
		sync_queue: [],
		audit_logs: []
	};
	var pages_state = {
		sync_history: 1,
		sync_queue: 1,
		audit_logs: 1
	};

	/* Initialize UI references */
	var $list_group = $('#terminals-list-group');
	var $placeholder = $('#diagnostics-panel-placeholder');
	var $content = $('#diagnostics-panel-content');
	var $badge = $('#selected-terminal-badge');
	var $btn_pull = $('#btn-pull-logs');
	var $btn_db = $('#btn-pull-db');
	var $btn_restore = $('#btn-restore-db');
	var $file_input = $('#db-file-input');
	var $btn_relaunch = $('#btn-relaunch-app');
	var sql_polling_interval = null;
	var restore_polling_interval = null;
	var db_polling_interval = null;

	/* Date Filters Defaults */
	var today = new Date();
	var sevenDaysAgo = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
	$('#filter-from-date').val(formatDateForInput(sevenDaysAgo));
	$('#filter-to-date').val(formatDateForInput(today));

	/* Load latest POS version from update path */
	function load_latest_pos_version() {
		frappe.call({
			method: 'managely_terminal.managely_terminal.api.electron.terminals.get_latest_pos_version',
			callback: function(r) {
				var ver = r.message || '';
				if (ver) {
					page.set_indicator('Latest: v' + ver, 'black');
				} else {
					page.set_indicator('No Update Uploaded', 'gray');
				}
			}
		});
	}

	/* Load server app update status */
	function load_server_app_status() {
		$('#app-update-badge').html('Server App: Checking...');
		frappe.call({
			method: 'managely_terminal.managely_terminal.api.electron.terminals.check_app_update_status',
			callback: function(r) {
				var res = r.message || {};
				if (res.update_available) {
					$('#app-update-badge').removeClass('badge-light text-secondary').addClass('badge-danger text-white')
						.html('Server App: Update Available');
				} else {
					$('#app-update-badge').removeClass('badge-danger text-white').addClass('badge-light text-secondary')
						.html('Server App: Up to date');
				}
			}
		});
	}

	/* Load registered terminals */
	function load_terminals() {
		$list_group.html('<div class="p-4 text-center text-muted"><i class="fa fa-spinner fa-spin"></i> Fetching terminals...</div>');
		
		frappe.call({
			method: 'managely_terminal.managely_terminal.api.electron.terminals.get_active_terminals',
			callback: function(r) {
				$list_group.empty();
				terminals_data = r.message || [];
				
				if (terminals_data.length === 0) {
					$list_group.html('<div class="p-4 text-center text-muted">No registered terminals found.</div>');
					return;
				}

				terminals_data.forEach(function(term) {
					var is_online = term.status === 'Online';
					var status_badge = is_online 
						? '<span class="badge badge-success px-2 py-1">Online</span>' 
						: '<span class="badge badge-danger px-2 py-1">Offline</span>';

						var telemetry_info = '';
						if (is_online) {
							var invoices_badge = (term.pending_invoices || 0) > 0 ? '<span class="badge badge-warning text-white px-1.5 py-0.5" title="Pending Invoices">' + term.pending_invoices + ' Invoices</span>' : '<span class="badge badge-light border text-muted px-1.5 py-0.5" title="No Pending Invoices">0 Invoices</span>';
							var queue_badge = (term.pending_sync_queue || 0) > 0 ? '<span class="badge badge-danger text-white px-1.5 py-0.5 ml-1" title="Sync Queue (Stuck)">' + term.pending_sync_queue + ' Queue</span>' : '<span class="badge badge-light border text-muted px-1.5 py-0.5 ml-1" title="Sync Queue Empty">0 Queue</span>';
							var size_text = '<span class="badge badge-light border text-muted px-1.5 py-0.5 ml-1" title="Database Size">' + (term.db_size_mb || 0) + ' MB DB</span>';
							var ram_text = '<span class="badge badge-light border text-muted px-1.5 py-0.5 ml-1" title="POS Memory Usage">' + (term.ram_usage_mb || 0) + ' MB RAM</span>';
							telemetry_info = '<div class="mt-2 d-flex flex-wrap gap-1 align-items-center">' + invoices_badge + queue_badge + size_text + ram_text + '</div>';
						}

						var item_html = 
							'<a href="#" class="list-group-item list-group-item-action flex-column align-items-start p-3 terminal-item" data-id="' + term.terminal_id + '">' +
								'<div class="d-flex w-100 justify-content-between align-items-center">' +
									'<h5 class="mb-1 font-weight-bold text-dark">' + term.branch_name + '</h5>' +
									status_badge +
								'</div>' +
								'<p class="mb-2 small text-muted">Profile: <span class="text-dark">' + term.pos_profile + '</span></p>' +
								'<div class="d-flex justify-content-between align-items-center mt-2 small">' +
									'<span class="text-secondary">Active User: <strong class="text-dark">' + (term.username || 'None') + '</strong></span>' +
									(function() {
										if (term.is_outdated) {
											return '<span class="badge badge-danger text-white px-2 py-1" title="Outdated! Latest version is v' + (term.latest_version || '') + '"><i class="fa fa-exclamation-triangle mr-1"></i>v' + term.app_version + ' (Outdated - Latest: v' + term.latest_version + ')</span>';
										} else if (term.latest_version) {
											return '<span class="badge badge-success text-white px-2 py-1" title="Up to date"><i class="fa fa-check-circle mr-1"></i>v' + term.app_version + ' (Latest)</span>';
										} else {
											return '<span class="badge badge-light border text-secondary">v' + (term.app_version || '1.0.0') + '</span>';
										}
									})() +
								'</div>' +
								telemetry_info +
							'</a>';

					$list_group.append(item_html);
				});

				/* Bind select event */
				$('.terminal-item').on('click', function(e) {
					e.preventDefault();
					$('.terminal-item').removeClass('active bg-light');
					$(this).addClass('active bg-light');

					var term_id = $(this).attr('data-id');
					var term = terminals_data.find(function(t) { return t.terminal_id === term_id; });
					if (term) {
						select_terminal(term);
					}
				});
			}
		});
	}

	function select_terminal(term) {
		selected_terminal_id = (term.terminal_id || '').trim();
		$badge.text(term.branch_name).show();
		$placeholder.hide();
		$content.show();

		/* Reset Telemetry display */
		$('#device-insights-card').hide();

		/* Enable/disable pull based on online status */
		if (term.status !== 'Online') {
			$btn_pull.prop('disabled', true).text('Terminal Offline');
			$btn_db.prop('disabled', true).text('Terminal Offline');
			$btn_restore.prop('disabled', true).text('Terminal Offline');
			$btn_relaunch.prop('disabled', true).text('Terminal Offline');
		} else {
			$btn_pull.prop('disabled', false).text('Pull Logs');
			$btn_db.prop('disabled', false).text('Download DB');
			$btn_restore.prop('disabled', false).text('Restore DB');
			$btn_relaunch.prop('disabled', false).text('Relaunch POS');
		}

		/* Clear existing logs view */
		$('#sync-history-tbody').html('<tr><td colspan="7" class="text-center py-4 text-muted">Select pull logs to retrieve data.</td></tr>');
		$('#sync-queue-tbody').html('<tr><td colspan="7" class="text-center py-4 text-muted">Select pull logs to retrieve data.</td></tr>');
		$('#audit-logs-tbody').html('<tr><td colspan="6" class="text-center py-4 text-muted">Select pull logs to retrieve data.</td></tr>');

		$('#sync-history-pager').hide();
		$('#sync-queue-pager').hide();
		$('#audit-logs-pager').hide();
		$('#sql-result-container').hide();
		$('#sql-empty-state').text('Enter query and click Execute.').show();
		$('#sql-query-input').val('');
	}

	/* Relaunch app action */
	$btn_relaunch.on('click', function() {
		if (!selected_terminal_id) return;
		frappe.confirm(__('Are you sure you want to relaunch the Sultan POS app on this terminal device remotely?'), function() {
			$btn_relaunch.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Relaunching...');
			frappe.call({
				method: 'managely_terminal.managely_terminal.api.electron.terminals.trigger_relaunch_app',
				args: { terminal_id: selected_terminal_id },
				callback: function(r) {
					if (r.message && r.message.success) {
						frappe.show_alert({ message: __('Relaunch command sent successfully to terminal'), indicator: 'green' });
					} else {
						frappe.msgprint({
							title: 'Failed',
							indicator: 'red',
							message: r.message?.error || 'Failed to send relaunch command.'
						});
					}
					setTimeout(function() {
						$btn_relaunch.prop('disabled', false).text('Relaunch POS');
					}, 5000);
				}
			});
		});
	});

	/* Restore DB action */
	$btn_restore.on('click', function() {
		if (!selected_terminal_id) return;
		$file_input.click();
	});

	$file_input.on('change', function(e) {
		var file = e.target.files[0];
		if (!file) return;
		
		var reader = new FileReader();
		reader.onload = function(evt) {
			var file_data = evt.target.result.split(',')[1]; // get base64
			
			$btn_restore.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Restoring...');
			
			frappe.call({
				method: 'managely_terminal.managely_terminal.api.electron.terminals.upload_restore_db',
				args: {
					terminal_id: selected_terminal_id,
					file_name: file.name,
					file_data: file_data
				},
				callback: function(r) {
					if (r.message && r.message.success) {
						frappe.show_alert({ message: __('Database uploaded. Waiting for terminal to apply it...'), indicator: 'orange' });
						start_restore_polling();
					} else {
						frappe.msgprint({
							title: 'Failed',
							indicator: 'red',
							message: r.message?.error || 'Failed to initiate database restore.'
						});
						reset_restore_button();
					}
				}
			});
		};
		reader.readAsDataURL(file);
	});

	function reset_restore_button() {
		$btn_restore.prop('disabled', false).text('Restore DB');
		$file_input.val('');
	}

	function start_restore_polling() {
		var poll_count = 0;
		var max_polls = 15; // 45s
		if (restore_polling_interval) clearInterval(restore_polling_interval);
		
		restore_polling_interval = setInterval(function() {
			poll_count++;
			if (poll_count > max_polls) {
				clearInterval(restore_polling_interval);
				reset_restore_button();
				frappe.msgprint({
					title: 'Response Pending',
					indicator: 'orange',
					message: 'Terminal device did not reload after database restore. Check terminal logs.'
				});
				return;
			}

			frappe.call({
				method: 'managely_terminal.managely_terminal.api.electron.terminals.get_restore_status',
				args: { terminal_id: selected_terminal_id },
				callback: function(res) {
					if (res.message && res.message.success && res.message.restore_info) {
						clearInterval(restore_polling_interval);
						reset_restore_button();
						if (res.message.restore_info.success) {
							frappe.msgprint({
								title: 'Success',
								indicator: 'green',
								message: 'Database restored and cashier terminal restarted successfully!'
							});
						} else {
							frappe.msgprint({
								title: 'Failed',
								indicator: 'red',
								message: res.message.restore_info.error || 'Failed to restore database.'
							});
						}
					}
				}
			});
		}, 3000);
	}

	/* Socket display restore status event handler */
	frappe.realtime.on('server:display_restore_status', function(data) {
		if (data && data.terminal_id === selected_terminal_id) {
			if (restore_polling_interval) clearInterval(restore_polling_interval);
			reset_restore_button();
			if (data.success) {
				frappe.msgprint({
					title: 'Success',
					indicator: 'green',
					message: 'Database restored and cashier terminal restarted successfully!'
				});
			} else {
				frappe.msgprint({
					title: 'Failed',
					indicator: 'red',
					message: data.error || 'Failed to restore database.'
				});
			}
		}
	});

	/* Download DB action */
	$btn_db.on('click', function() {
		if (!selected_terminal_id) return;
		$btn_db.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Triggering...');
		
		frappe.call({
			method: 'managely_terminal.managely_terminal.api.electron.terminals.trigger_pull_db',
			args: { terminal_id: selected_terminal_id },
			callback: function(r) {
				if (r.message && r.message.success) {
					start_db_polling();
				} else {
					frappe.msgprint({
						title: 'Failed',
						indicator: 'red',
						message: r.message?.error || 'Failed to trigger database request.'
					});
					reset_db_button();
				}
			}
		});
	});

	function reset_db_button() {
		$btn_db.prop('disabled', false).text('Download DB');
	}

	function start_db_polling() {
		var poll_count = 0;
		var max_polls = 15; // 15 * 3s = 45s
		if (db_polling_interval) clearInterval(db_polling_interval);
		
		db_polling_interval = setInterval(function() {
			poll_count++;
			if (poll_count > max_polls) {
				clearInterval(db_polling_interval);
				reset_db_button();
				frappe.msgprint({
					title: 'Response Pending',
					indicator: 'orange',
					message: 'Terminal device did not upload database file in time. Please try again.'
				});
				return;
			}

			frappe.call({
				method: 'managely_terminal.managely_terminal.api.electron.terminals.get_pulled_db',
				args: { terminal_id: selected_terminal_id },
				callback: function(res) {
					if (res.message && res.message.success && res.message.db_info) {
						clearInterval(db_polling_interval);
						reset_db_button();
						if (res.message.db_info.success) {
							frappe.show_alert({
								message: __('Database file uploaded successfully'),
								indicator: 'green'
							});
							// Trigger file download
							var a = document.createElement('a');
							a.href = res.message.db_info.download_url;
							a.download = res.message.db_info.download_url.split('/').pop();
							document.body.appendChild(a);
							a.click();
							document.body.removeChild(a);
						} else {
							frappe.msgprint({
								title: 'Failed',
								indicator: 'red',
								message: res.message.db_info.error || 'Failed to upload database file from terminal.'
							});
						}
					}
				}
			});
		}, 3000);
	}

	/* SQL Console execution action */
	$('#btn-execute-sql').on('click', function() {
		if (!selected_terminal_id) return;
		var query = $('#sql-query-input').val().trim();
		if (!query) {
			frappe.msgprint(__('Please enter a valid SQL query.'));
			return;
		}

		$('#btn-execute-sql').prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Running...');
		$('#sql-empty-state').html('<i class="fa fa-spinner fa-spin"></i> Executing query on local device database...').show();
		$('#sql-result-container').hide();

		frappe.call({
			method: 'managely_terminal.managely_terminal.api.electron.terminals.trigger_execute_sql',
			args: { terminal_id: selected_terminal_id, query: query },
			callback: function(r) {
				if (r.message && r.message.success) {
					start_sql_polling();
				} else {
					$('#sql-empty-state').text(r.message?.error || 'Failed to trigger SQL execution.').show();
					$('#btn-execute-sql').prop('disabled', false).text('Execute');
				}
			}
		});
	});

	function start_sql_polling() {
		var poll_count = 0;
		var max_polls = 10;
		if (sql_polling_interval) clearInterval(sql_polling_interval);

		sql_polling_interval = setInterval(function() {
			poll_count++;
			if (poll_count > max_polls) {
				clearInterval(sql_polling_interval);
				$('#btn-execute-sql').prop('disabled', false).text('Execute');
				$('#sql-empty-state').text(__('Query timed out. Device did not respond with results.')).show();
				return;
			}

			frappe.call({
				method: 'managely_terminal.managely_terminal.api.electron.terminals.get_sql_result',
				args: { terminal_id: selected_terminal_id },
				callback: function(res) {
					if (res.message && res.message.success && res.message.sql_info) {
						clearInterval(sql_polling_interval);
						$('#btn-execute-sql').prop('disabled', false).text('Execute');
						render_sql_results(res.message.sql_info);
					}
				}
			});
		}, 2500);
	}

	function render_sql_results(info) {
		if (!info.success) {
			$('#sql-empty-state').html('<div class="text-danger font-weight-bold">Error: ' + (info.error || 'Execution failed') + '</div>').show();
			$('#sql-result-container').hide();
			return;
		}

		var rows = info.data || [];
		if (rows.length === 0) {
			$('#sql-empty-state').text(__('Query returned successfully with 0 rows.')).show();
			$('#sql-result-container').hide();
			return;
		}

		$('#sql-empty-state').hide();
		var columns = Object.keys(rows[0]);
		
		// Render Thead
		var $thead = $('#sql-result-thead').empty();
		var tr_head = '<tr>';
		columns.forEach(function(col) {
			tr_head += '<th class="border-0 py-2">' + col + '</th>';
		});
		tr_head += '</tr>';
		$thead.append(tr_head);

		// Render Tbody
		var $tbody = $('#sql-result-tbody').empty();
		rows.forEach(function(row) {
			var tr_row = '<tr>';
			columns.forEach(function(col) {
				var val = row[col];
				if (val === null || val === undefined) val = '<span class="text-muted">NULL</span>';
				else if (typeof val === 'object') val = JSON.stringify(val);
				tr_row += '<td class="py-2">' + val + '</td>';
			});
			tr_row += '</tr>';
			$tbody.append(tr_row);
		});

		$('#sql-result-container').show();
	}

	/* Socket display sql result event handler */
	frappe.realtime.on('server:display_sql_result', function(data) {
		if (data && data.terminal_id === selected_terminal_id) {
			if (sql_polling_interval) clearInterval(sql_polling_interval);
			$('#btn-execute-sql').prop('disabled', false).text('Execute');
			render_sql_results(data);
		}
	});

	/* Socket display db file event handler */
	frappe.realtime.on('server:display_db_file', function(data) {
		if (data && data.terminal_id === selected_terminal_id) {
			if (db_polling_interval) clearInterval(db_polling_interval);
			reset_db_button();
			if (data.success) {
				frappe.show_alert({
					message: __('Database file uploaded successfully'),
					indicator: 'green'
				});
				var a = document.createElement('a');
				a.href = data.download_url;
				a.download = data.download_url.split('/').pop();
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
			} else {
				frappe.msgprint({
					title: 'Failed',
					indicator: 'red',
					message: data.error || 'Failed to upload database file from terminal.'
				});
			}
		}
	});

	/* Pull Logs action */
	$btn_pull.on('click', function() {
		if (!selected_terminal_id) return;

		$btn_pull.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Querying...');
		
		var from_date = $('#filter-from-date').val();
		var to_date = $('#filter-to-date').val();
		var limit = $('#filter-limit').val();

		frappe.call({
			method: 'managely_terminal.managely_terminal.api.electron.terminals.trigger_pull_logs',
			args: {
				terminal_id: selected_terminal_id,
				limit: limit,
				from_date: from_date,
				to_date: to_date
			},
			freeze: false,
			callback: function(r) {
				if (r.message && r.message.success) {
					// Start polling fallback mechanism
					start_polling();
				} else {
					frappe.msgprint({
						title: 'Failed',
						indicator: 'red',
						message: r.message?.error || 'Failed to trigger logs request.'
					});
					reset_pull_button();
				}
			}
		});
	});

	function reset_pull_button() {
		$btn_pull.prop('disabled', false).text('Pull Logs');
	}

	function start_polling() {
		var poll_count = 0;
		var max_polls = 12; // 12 * 2.5s = 30s
		if (polling_interval) clearInterval(polling_interval);
		
		polling_interval = setInterval(function() {
			poll_count++;
			if (poll_count > max_polls) {
				clearInterval(polling_interval);
				reset_pull_button();
				frappe.msgprint({
					title: 'Response Pending',
					indicator: 'orange',
					message: 'Device did not reply via instant Socket connection. Still listening in background.'
				});
				return;
			}

			frappe.call({
				method: 'managely_terminal.managely_terminal.api.electron.terminals.get_pulled_logs',
				args: { terminal_id: selected_terminal_id },
				callback: function(res) {
					if (res.message && res.message.success && res.message.logs) {
						clearInterval(polling_interval);
						reset_pull_button();
						frappe.show_alert({
							message: __('Diagnostics logs retrieved successfully'),
							indicator: 'green'
						});
						cache_and_render(res.message.logs.data);
					}
				}
			});
		}, 2500);
	}

	/* Listen for the real-time response event from Socket.io / ERPNext */
	frappe.realtime.on('server:display_logs', function(data) {
		if (data && data.terminal_id === selected_terminal_id) {
			if (polling_interval) clearInterval(polling_interval);
			reset_pull_button();
			frappe.show_alert({
				message: __('Diagnostics logs retrieved successfully'),
				indicator: 'green'
			});
			cache_and_render(data.data);
		}
	});

	function formatUptime(seconds) {
		if (!seconds) return '-';
		var d = Math.floor(seconds / (3600*24));
		var h = Math.floor((seconds % (3600*24)) / 3600);
		var m = Math.floor((seconds % 3600) / 60);
		var res = [];
		if (d > 0) res.push(d + 'd');
		if (h > 0) res.push(h + 'h');
		if (m > 0 || res.length === 0) res.push(m + 'm');
		return res.join(' ');
	}

	function formatMemory(free, total) {
		if (!total) return '-';
		var usedBytes = total - free;
		var usedGB = (usedBytes / (1024*1024*1024)).toFixed(1);
		var totalGB = (total / (1024*1024*1024)).toFixed(1);
		var pct = Math.round((usedBytes / total) * 100);
		return usedGB + ' / ' + totalGB + ' GB (' + pct + '%)';
	}

	/* Safe Modal Details display: Fetch directly from memory array cache using numeric ID */
	$(document).on('click', '.btn-view-log-details', function() {
		var $btn = $(this);
		var logId = parseInt($btn.attr('data-log-id'));
		var section = $btn.attr('data-section'); // 'sync_history' or 'sync_queue'

		var list = logs_cache[section] || [];
		var log = list.find(function(item) {
			return item.id === logId;
		});

		var preview = '';
		var rawJsonData = '';
		var displayLocalId = '-';
		var displayType = '-';

		// Reset state
		$('#details-modal-sync-error-box').hide().text('');
		$('#details-modal-json-editor').hide().val('');
		$('#details-modal-json').show();
		$('#btn-modal-requeue-edited').hide();
		$('#btn-edit-payload-toggle').text('Toggle Edit Mode');

		if (log) {
			displayLocalId = log.payload_id;
			if (displayLocalId && displayLocalId.indexOf('{') === 0) {
				try {
					var p = JSON.parse(displayLocalId);
					displayLocalId = p.id || p.name || p.pre_assigned_name || 'JSON Object';
				} catch(e) {}
			}
			displayType = log.payload_type;

			if (log.error_message) {
				$('#details-modal-sync-error-box').show().text('SYNC ERROR: ' + log.error_message);
			}
			
			if (log.details) {
				if (log.payload_type === 'invoice') {
					preview += 'CASHIER: ' + (log.details.cashier || '-') + '\n';
					preview += 'TOTAL AMOUNT: ' + (log.details.total || 0) + '\n\n';
				} else if (log.payload_type === 'customer') {
					preview += 'CUSTOMER NAME: ' + (log.details.name || '-') + '\n';
					preview += 'PHONE: ' + (log.details.phone || '-') + '\n\n';
				} else if (log.payload_type === 'cash_transaction') {
					preview += 'TRANSACTION TYPE: ' + (log.details.type || '-') + '\n';
					preview += 'AMOUNT: ' + (log.details.amount || 0) + '\n';
					preview += 'REASON: ' + (log.details.reason || '-') + '\n\n';
				}

				if (log.details.raw) {
					rawJsonData = JSON.stringify(log.details.raw, null, 2);
					preview += 'PAYLOAD RAW DATA:\n' + rawJsonData;
				}
			} else {
				// If no details, but payload_id is a JSON string
				if (log.payload_id && log.payload_id.indexOf('{') === 0) {
					try {
						var parsed = JSON.parse(log.payload_id);
						rawJsonData = JSON.stringify(parsed, null, 2);
						preview += 'PAYLOAD RAW DATA:\n' + rawJsonData;
						displayLocalId = parsed.id || parsed.name || parsed.pre_assigned_name || 'JSON Object';
					} catch(e) {
						rawJsonData = log.payload_id;
						preview += 'PAYLOAD RAW DATA:\n' + log.payload_id;
					}
				} else {
					preview += 'No metadata payload available.';
				}
			}
		} else {
			preview = 'Error: Log item not found in page memory.';
		}

		$('#details-modal-title').text('Transaction Log Details');
		$('#details-modal-local-id').text(displayLocalId);
		$('#details-modal-type').text(displayType);
		$('#details-modal-json').text(preview);

		// Configure Toggle Button
		$('#btn-edit-payload-toggle').off('click').on('click', function() {
			if ($('#details-modal-json-editor').is(':visible')) {
				$('#details-modal-json-editor').hide();
				$('#details-modal-json').show();
				$('#btn-modal-requeue-edited').hide();
				$(this).text('Toggle Edit Mode');
			} else {
				if (!rawJsonData) {
					frappe.msgprint('No editable raw JSON data is associated with this item.');
					return;
				}
				$('#details-modal-json-editor').show().val(rawJsonData);
				$('#details-modal-json').hide();
				$('#btn-modal-requeue-edited').show();
				$(this).text('Toggle View Mode');
			}
		});

		// Configure Save and Re-Sync button action
		$('#btn-modal-requeue-edited').off('click').on('click', function() {
			var editedJson = $('#details-modal-json-editor').val();
			try {
				JSON.parse(editedJson); // validation
			} catch(e) {
				frappe.msgprint('Invalid JSON syntax: ' + e.message);
				return;
			}

			frappe.confirm(
				'Are you sure you want to save this updated JSON payload and emit a force re-sync command to the terminal?',
				function() {
					$('#log-details-modal').modal('hide');
					frappe.call({
						method: 'managely_terminal.managely_terminal.api.electron.terminals.force_requeue',
						args: {
							terminal_id: selected_terminal_id,
							payload_type: displayType,
							payload_id: log.payload_id, // Send original payload string to backend so it updates the matching record
							new_payload: editedJson
						},
						freeze: true,
						freeze_message: 'Emitting re-sync command with updated payload...',
						callback: function(r) {
							if (r.message && r.message.success) {
								frappe.msgprint({
									title: 'Command Acknowledged',
									indicator: 'green',
									message: 'Successfully sent edited payload re-sync command to terminal.'
								});
							} else {
								frappe.msgprint({
									title: 'Command Failed',
									indicator: 'red',
									message: r.message?.error || 'Target terminal did not receive the command.'
								});
							}
						}
					});
				}
			);
		});

		$('#log-details-modal').modal('show');
	});

	/* Trigger re-sync command directly from row button */
	window.triggerForceResyncRow = function(section, logId) {
		if (!selected_terminal_id) return;
		
		var list = logs_cache[section] || [];
		var log = list.find(function(item) { return item.id === logId; });
		if (!log) return;

		var type = log.payload_type;
		var id = log.payload_id;

		// If ID is a complex JSON string (starts with {), extract the name or id property to trigger force_requeue correctly
		var cleanId = id;
		if (id && id.indexOf('{') === 0) {
			try {
				var parsed = JSON.parse(id);
				cleanId = parsed.id || parsed.name || parsed.pre_assigned_name || id;
			} catch(e) {}
		}

		frappe.confirm(
			`Are you sure you want to force re-queue ${type} (ID: ${cleanId})? This will instruct the terminal to override and re-add this transaction as Pending in its sync queue.`,
			function() {
				frappe.call({
					method: 'managely_terminal.managely_terminal.api.electron.terminals.force_requeue',
					args: {
						terminal_id: selected_terminal_id,
						payload_type: type,
						payload_id: id // Send original payload string to backend so it updates the matching record
					},
					freeze: true,
					freeze_message: 'Emitting re-sync command to terminal...',
					callback: function(r) {
						if (r.message && r.message.success) {
							frappe.msgprint({
								title: 'Command Acknowledged',
								indicator: 'green',
								message: `Successfully forced device to queue ${type} ID: ${cleanId}.`
							});
						} else {
							frappe.msgprint({
								title: 'Command Failed',
								indicator: 'red',
								message: r.message?.error || 'Target terminal did not receive the command.'
							});
						}
					}
				});
			}
		);
	};

	function cache_and_render(data) {
		logs_cache.sync_history = data.sync_history || [];
		logs_cache.sync_queue = data.sync_queue || [];
		logs_cache.audit_logs = data.audit_logs || [];

		pages_state.sync_history = 1;
		pages_state.sync_queue = 1;
		pages_state.audit_logs = 1;

		/* Render Telemetry info if available */
		if (data.stats) {
			$('#device-insights-card').show();
			$('#stat-last-updated').text('Last Telemetry: ' + new Date(data.stats.timestamp || Date.now()).toLocaleTimeString());
			$('#stat-app-platform').text('v' + (data.stats.app_version || '1.0.0') + ' (' + (data.stats.platform || 'OS') + ')');
			$('#stat-uptime').text(formatUptime(data.stats.uptime));
			$('#stat-ram').text(formatMemory(data.stats.free_mem, data.stats.total_mem));
			$('#stat-arch').text(data.stats.arch || '-');
		} else {
			$('#device-insights-card').hide();
		}

		render_sync_history();
		render_sync_queue();
		render_audit_logs();
	}

	/* Paginated Renderers */
	function render_sync_history() {
		var list = logs_cache.sync_history;
		var page = pages_state.sync_history;
		var total_pages = Math.ceil(list.length / page_size) || 1;
		var start = (page - 1) * page_size;
		var end = start + page_size;
		var page_items = list.slice(start, end);

		var $tbody = $('#sync-history-tbody').empty();
		if (page_items.length > 0) {
			page_items.forEach(function(log) {
				var is_success = log.status === 'Synced';
				var status_badge = is_success 
					? '<span class="badge badge-success px-2 py-1">Synced</span>' 
					: '<span class="badge badge-danger px-2 py-1">Failed</span>';
				
				var details_btn = '<button class="btn btn-xs btn-link btn-view-log-details" data-section="sync_history" data-log-id="' + log.id + '"><i class="fa fa-eye"></i></button>';
				
				// Handle display of Local ID if it is a JSON string
				var displayLocalId = log.payload_id;
				if (log.payload_id && log.payload_id.indexOf('{') === 0) {
					try {
						var parsed = JSON.parse(log.payload_id);
						displayLocalId = parsed.id || parsed.name || parsed.pre_assigned_name || 'JSON Object';
					} catch(e) {}
				}

				var row = 
					'<tr>' +
						'<td class="text-muted">#' + log.id + '</td>' +
						'<td class="text-truncate" style="max-width: 150px;" title="' + displayLocalId + '"><span class="badge badge-light border text-secondary font-mono">' + displayLocalId + '</span></td>' +
						'<td class="font-weight-bold text-uppercase">' + log.payload_type + '</td>' +
						'<td>' + status_badge + '</td>' +
						'<td style="text-align: center;">' + details_btn + '</td>' +
						'<td style="white-space: nowrap;" class="text-muted small">' + new Date(log.sync_time).toLocaleString() + '</td>' +
					'</tr>';

				$tbody.append(row);
			});

			/* Setup pager controls */
			var $pager = $('#sync-history-pager').show();
			$pager.find('.pager-info').text('Showing ' + (start+1) + '-' + Math.min(end, list.length) + ' of ' + list.length);
			$pager.find('.pager-prev').prop('disabled', page === 1);
			$pager.find('.pager-next').prop('disabled', page === total_pages);
		} else {
			$tbody.html('<tr><td colspan="6" class="text-center py-4 text-muted font-italic">No sync history logs match filters.</td></tr>');
			$('#sync-history-pager').hide();
		}
	}

	function render_sync_queue() {
		var list = logs_cache.sync_queue;
		var page = pages_state.sync_queue;
		var total_pages = Math.ceil(list.length / page_size) || 1;
		var start = (page - 1) * page_size;
		var end = start + page_size;
		var page_items = list.slice(start, end);

		var $tbody = $('#sync-queue-tbody').empty();
		if (page_items.length > 0) {
			page_items.forEach(function(log) {
				var status_badge = '<span class="badge badge-warning text-white px-2 py-1">' + (log.status || 'Pending') + '</span>';
				
				var details_btn = '<button class="btn btn-xs btn-link btn-view-log-details" data-section="sync_queue" data-log-id="' + log.id + '"><i class="fa fa-eye"></i></button>';
				
				// Handle display of Local ID if it is a JSON string
				var displayLocalId = log.payload_id;
				if (log.payload_id && log.payload_id.indexOf('{') === 0) {
					try {
						var parsed = JSON.parse(log.payload_id);
						displayLocalId = parsed.id || parsed.name || parsed.pre_assigned_name || 'JSON Object';
					} catch(e) {}
				}

				var row = 
					'<tr>' +
						'<td class="text-muted">#' + log.id + '</td>' +
						'<td class="text-truncate" style="max-width: 150px;" title="' + displayLocalId + '"><span class="badge badge-light border text-secondary font-mono">' + displayLocalId + '</span></td>' +
						'<td class="font-weight-bold text-uppercase">' + log.payload_type + '</td>' +
						'<td>' + status_badge + '</td>' +
						'<td style="text-align: center;">' + details_btn + '</td>' +
						'<td style="white-space: nowrap;" class="text-muted small">' + new Date(log.sync_time).toLocaleString() + '</td>' +
					'</tr>';

				$tbody.append(row);
			});

			/* Setup pager controls */
			var $pager = $('#sync-queue-pager').show();
			$pager.find('.pager-info').text('Showing ' + (start+1) + '-' + Math.min(end, list.length) + ' of ' + list.length);
			$pager.find('.pager-prev').prop('disabled', page === 1);
			$pager.find('.pager-next').prop('disabled', page === total_pages);
		} else {
			$tbody.html('<tr><td colspan="6" class="text-center py-4 text-muted font-italic">Sync queue is clean. No pending/stuck transactions.</td></tr>');
			$('#sync-queue-pager').hide();
		}
	}

	function render_audit_logs() {
		var list = logs_cache.audit_logs;
		var page = pages_state.audit_logs;
		var total_pages = Math.ceil(list.length / page_size) || 1;
		var start = (page - 1) * page_size;
		var end = start + page_size;
		var page_items = list.slice(start, end);

		var $tbody = $('#audit-logs-tbody').empty();
		if (page_items.length > 0) {
			page_items.forEach(function(log) {
				var row = 
					'<tr>' +
						'<td class="text-muted">#' + log.id + '</td>' +
						'<td><span class="badge badge-light border text-secondary font-weight-bold" style="font-size: 0.85em;">' + log.action + '</span></td>' +
						'<td class="text-capitalize text-secondary">' + (log.entity_type || '-') + '</td>' +
						'<td>' + (log.entity_id ? '<span class="badge badge-info text-white font-mono">' + log.entity_id + '</span>' : '-') + '</td>' +
						'<td class="text-truncate text-secondary" style="max-width: 250px;" title="' + (log.details || '').replace(/"/g, '&quot;') + '">' + (log.details || '-') + '</td>' +
						'<td style="white-space: nowrap;" class="text-muted small">' + new Date(log.created_at).toLocaleString() + '</td>' +
					'</tr>';

				$tbody.append(row);
			});

			/* Setup pager controls */
			var $pager = $('#audit-logs-pager').show();
			$pager.find('.pager-info').text('Showing ' + (start+1) + '-' + Math.min(end, list.length) + ' of ' + list.length);
			$pager.find('.pager-prev').prop('disabled', page === 1);
			$pager.find('.pager-next').prop('disabled', page === total_pages);
		} else {
			$tbody.html('<tr><td colspan="6" class="text-center py-4 text-muted font-italic">No audit logs match filters.</td></tr>');
			$('#audit-logs-pager').hide();
		$('#sql-result-container').hide();
		$('#sql-empty-state').text('Enter query and click Execute.').show();
		$('#sql-query-input').val('');
		}
	}

	/* Bind Pager Buttons Click Handlers */
	$('#sync-history-pager .pager-prev').on('click', function() {
		if (pages_state.sync_history > 1) {
			pages_state.sync_history--;
			render_sync_history();
		}
	});
	$('#sync-history-pager .pager-next').on('click', function() {
		var total = Math.ceil(logs_cache.sync_history.length / page_size);
		if (pages_state.sync_history < total) {
			pages_state.sync_history++;
			render_sync_history();
		}
	});

	$('#sync-queue-pager .pager-prev').on('click', function() {
		if (pages_state.sync_queue > 1) {
			pages_state.sync_queue--;
			render_sync_queue();
		}
	});
	$('#sync-queue-pager .pager-next').on('click', function() {
		var total = Math.ceil(logs_cache.sync_queue.length / page_size);
		if (pages_state.sync_queue < total) {
			pages_state.sync_queue++;
			render_sync_queue();
		}
	});

	$('#audit-logs-pager .pager-prev').on('click', function() {
		if (pages_state.audit_logs > 1) {
			pages_state.audit_logs--;
			render_audit_logs();
		}
	});
	$('#audit-logs-pager .pager-next').on('click', function() {
		var total = Math.ceil(logs_cache.audit_logs.length / page_size);
		if (pages_state.audit_logs < total) {
			pages_state.audit_logs++;
			render_audit_logs();
		}
	});

	/* Helper for date formatting */
	function formatDateForInput(date) {
		var pad = function(num) { return String(num).padStart(2, '0'); };
		return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
	}

	/* Refresh action */
	page.add_inner_button('Refresh Terminals', function() {
		load_latest_pos_version();
		load_server_app_status();
		load_terminals();
	});

	/* Clear Cache & Reload App Resources */
	page.add_inner_button('Migrate & Clear Cache', function() {
		$('#migrate-log-modal').modal('show');
		$('#migrate-log-spinner').show();
		$('#migrate-log-result').hide();
		$('#btn-close-migrate-modal').hide();
		
		// Disable Frappe's version-update popup temporarily so it doesn't interrupt our modal
		if (frappe.realtime) {
			frappe.realtime.off('version-update');
		}
		
		frappe.call({
			method: 'managely_terminal.managely_terminal.api.electron.terminals.migrate_and_clear_cache',
			callback: function(r) {
				$('#migrate-log-spinner').hide();
				$('#migrate-log-result').show();
				$('#btn-close-migrate-modal').show();
				
				var msg = r.message || {};
				if (msg.success) {
					$('#migrate-status-badge').removeClass('badge-danger').addClass('badge-success').text('Success');
					$('#migrate-log-output').removeClass('text-danger').addClass('text-success').text(msg.log || 'Done');
				} else {
					$('#migrate-status-badge').removeClass('badge-success').addClass('badge-danger').text('Failed');
					$('#migrate-log-output').removeClass('text-success').addClass('text-danger').text(msg.log || msg.error || 'Failed to run migration');
				}
			}
		});
	});

	$('#btn-close-migrate-modal').on('click', function() {
		window.location.reload();
	});

	/* Load on startup */
	load_latest_pos_version();
	load_server_app_status();
	load_terminals();
};

