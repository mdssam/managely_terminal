frappe.pages['terminal_monitor'].on_page_load = function(wrapper) {
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
	`;
	$('<style>').prop('type', 'text/css').html(css).appendTo('head');

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
	var $btn_refresh = $('#btn-refresh-terminals');
	var $btn_pull = $('#btn-pull-logs');

	/* Date Filters Defaults */
	var today = new Date();
	var sevenDaysAgo = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
	$('#filter-from-date').val(formatDateForInput(sevenDaysAgo));
	$('#filter-to-date').val(formatDateForInput(today));

	/* Load registered terminals */
	function load_terminals() {
		$list_group.html('<div class="p-4 text-center text-muted"><i class="fa fa-spinner fa-spin"></i> Fetching terminals...</div>');
		
		frappe.call({
			method: 'sultan.sultan.api.electron.terminals.get_active_terminals',
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

					var item_html = 
						'<a href="#" class="list-group-item list-group-item-action flex-column align-items-start p-3 terminal-item" data-id="' + term.terminal_id + '">' +
							'<div class="d-flex w-100 justify-content-between align-items-center">' +
								'<h6 class="mb-1 font-weight-bold text-dark">' + term.branch_name + '</h6>' +
								status_badge +
							'</div>' +
							'<p class="mb-1 small text-muted">Profile: ' + term.pos_profile + '</p>' +
							'<div class="d-flex justify-content-between align-items-center mt-2 small text-secondary">' +
								'<span>Active User: <strong>' + (term.username || 'None') + '</strong></span>' +
								'<span>v' + term.app_version + '</span>' +
							'</div>' +
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
		} else {
			$btn_pull.prop('disabled', false).text('Pull Logs');
		}

		/* Clear existing logs view */
		$('#sync-history-tbody').html('<tr><td colspan="7" class="text-center py-4 text-muted">Select pull logs to retrieve data.</td></tr>');
		$('#sync-queue-tbody').html('<tr><td colspan="7" class="text-center py-4 text-muted">Select pull logs to retrieve data.</td></tr>');
		$('#audit-logs-tbody').html('<tr><td colspan="6" class="text-center py-4 text-muted">Select pull logs to retrieve data.</td></tr>');

		$('#sync-history-pager').hide();
		$('#sync-queue-pager').hide();
		$('#audit-logs-pager').hide();
	}

	/* Pull Logs action */
	$btn_pull.on('click', function() {
		if (!selected_terminal_id) return;

		$btn_pull.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Querying...');
		
		var from_date = $('#filter-from-date').val();
		var to_date = $('#filter-to-date').val();
		var limit = $('#filter-limit').val();

		frappe.call({
			method: 'sultan.sultan.api.electron.terminals.trigger_pull_logs',
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
				method: 'sultan.sultan.api.electron.terminals.get_pulled_logs',
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
						method: 'sultan.sultan.api.electron.terminals.force_requeue',
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
					method: 'sultan.sultan.api.electron.terminals.force_requeue',
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
						'<td>#' + log.id + '</td>' +
						'<td class="font-mono text-truncate" style="max-width: 150px;" title="' + displayLocalId + '">' + displayLocalId + '</td>' +
						'<td class="font-weight-bold text-uppercase">' + log.payload_type + '</td>' +
						'<td>' + status_badge + '</td>' +
						'<td style="text-align: center;">' + details_btn + '</td>' +
						'<td>' + new Date(log.sync_time).toLocaleString() + '</td>' +
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
						'<td>#' + log.id + '</td>' +
						'<td class="font-mono text-truncate" style="max-width: 150px;" title="' + displayLocalId + '">' + displayLocalId + '</td>' +
						'<td class="font-weight-bold text-uppercase">' + log.payload_type + '</td>' +
						'<td>' + status_badge + '</td>' +
						'<td style="text-align: center;">' + details_btn + '</td>' +
						'<td>' + new Date(log.sync_time).toLocaleString() + '</td>' +
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
						'<td>#' + log.id + '</td>' +
						'<td class="font-weight-bold">' + log.action + '</td>' +
						'<td>' + (log.entity_type || '-') + '</td>' +
						'<td class="text-info font-mono">' + (log.entity_id || '-') + '</td>' +
						'<td>' + (log.details || '-') + '</td>' +
						'<td>' + new Date(log.created_at).toLocaleString() + '</td>' +
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
	$btn_refresh.on('click', load_terminals);

	/* Load on startup */
	load_terminals();
};

