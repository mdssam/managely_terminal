// ── Parent form ───────────────────────────────────────────────────────────────
frappe.ui.form.on("Multi Currency Payment", {

	async validate(frm) {
		const companyCurrency = getCompanyCurrency(frm);

		for (const row of (frm.doc.lines || [])) {
			if (!row.mode_of_payment) {
				frappe.validated = false;
				frappe.throw(__("Row {0}: Mode of Payment is required.", [row.idx]));
				return false;
			}
			if (!row.currency) {
				frappe.validated = false;
				frappe.throw(__("Row {0}: Currency is required.", [row.idx]));
				return false;
			}
			if (!flt(row.amount) || flt(row.amount) <= 0) {
				frappe.validated = false;
				frappe.throw(__("Row {0}: Amount must be greater than zero.", [row.idx]));
				return false;
			}

			if (row.currency === companyCurrency) {
				if (flt(row.exchange_rate) !== 1.0) {
					frappe.model.set_value(row.doctype, row.name, "exchange_rate", 1.0);
					_recalcBase(frm, row.doctype, row.name);
				}
			} else {
				// Fetch latest exchange rate from Currency Exchange to match and override
				const res = await frappe.call({
					method: "managely_terminal.managely_terminal.doctype.multi_currency_payment.multi_currency_payment.get_exchange_rate",
					args: {
						from_currency: row.currency,
						to_currency: companyCurrency,
						transaction_date: frm.doc.posting_date,
						company: frm.doc.company
					}
				});

				let latestRate = flt(res.message);
				if (!latestRate || latestRate <= 0) {
					const secCurr = frm.doc._secondary_currency;
					if (secCurr && (row.currency === secCurr || companyCurrency === secCurr)) {
						latestRate = flt(frm.doc.exchange_rate);
					}
				}

				if (latestRate && latestRate > 0) {
					// Check if row rate differs from latest exchange rate or is defaulted to 1.0
					if (Math.abs(flt(row.exchange_rate) - latestRate) > 0.000001 || flt(row.exchange_rate) === 1.0) {
						frappe.model.set_value(row.doctype, row.name, "exchange_rate", latestRate);
						_recalcBase(frm, row.doctype, row.name);
					}
				} else {
					if (!flt(row.exchange_rate) || flt(row.exchange_rate) <= 0 || flt(row.exchange_rate) === 1.0) {
						frappe.validated = false;
						frappe.throw(__(
							"Row {0}: No valid exchange rate found for currency {1} to {2}. Please configure it under Accounts → Currency Exchange.",
							[row.idx, row.currency, companyCurrency]
						));
						return false;
					}
				}
			}
		}

		_recalcTotalPayments(frm);
	},

	onload_post_render(frm) {
		const priCurr = getCompanyCurrency(frm);
		if (priCurr) {
			toggleSecondaryFields(frm, !!frm.doc._secondary_currency, priCurr, frm.doc._secondary_currency);
		}
	},

	refresh(frm) {
		frm.set_query("party_type", () => ({
			filters: [["Party Type", "name", "in", ["Customer", "Supplier", "Employee", "Shareholder"]]]
		}));

		frm.set_query("party_account", () => {
			if (!frm.doc.company) {
				return { filters: {} };
			}
			const filters = {
				company: frm.doc.company,
				is_group: 0
			};
			if (frm.doc.party_type === "Customer") {
				filters.account_type = "Receivable";
			} else if (frm.doc.party_type === "Supplier") {
				filters.account_type = "Payable";
			}
			return { filters: filters };
		});

		frm.set_query("reference_name", "references", (doc, cdt, cdn) => {
			const child = locals[cdt][cdn];
			if (!doc.party || !doc.party_type) {
				return { filters: { name: "No Party Selected" } };
			}
			const filters = {
				docstatus: 1,
				company: doc.company,
				outstanding_amount: [">", 0]
			};
			if (child.reference_doctype === "Sales Invoice") {
				filters.customer = doc.party;
			} else if (child.reference_doctype === "Purchase Invoice") {
				filters.supplier = doc.party;
			}
			return { filters: filters };
		});

		// Legacy: open linked Journal Entry if one exists
		if (frm.doc.journal_entry) {
			frm.add_custom_button(__("Journal Entry"), () => {
				frappe.set_route("Form", "Journal Entry", frm.doc.journal_entry);
			}, __("View"));
		}

		// GL Entries button (always visible for submitted docs)
		if (frm.doc.docstatus === 1) {
			frm.add_custom_button(__("GL Entries"), () => {
				frappe.route_options = {
					voucher_no: frm.doc.name,
					from_date: frm.doc.posting_date,
					to_date: frm.doc.posting_date,
					company: frm.doc.company,
				};
				frappe.set_route("query-report", "General Ledger");
			}, __("View"));
		}

		// Synchronous currency resolution for immediate UI display
		const priCurr = frm.doc.company_currency || (frm.doc.company ? erpnext.get_currency(frm.doc.company) : null);
		if (priCurr) {
			toggleSecondaryFields(frm, !!frm.doc._secondary_currency, priCurr, frm.doc._secondary_currency);
		}

		if (frm.doc.company) {
			frappe.call({
				method: "managely_terminal.managely_terminal.accounting.customizations.get_company_currency_config",
				args: { company: frm.doc.company },
				callback: function (r) {
					const cfg = r.message || {};
					const primary = cfg.default_currency || priCurr;
					if (frm.doc.docstatus === 0 && !frm.doc.company_currency && primary) {
						frm.set_value("company_currency", primary);
					}
					if (cfg.custom_secondary_currency) {
						frm.doc._secondary_currency = cfg.custom_secondary_currency;
						frm.doc._secondary_currency_precision = cfg.fraction_units === 0 ? 0 : 2;
						toggleSecondaryFields(frm, true, primary, cfg.custom_secondary_currency);
					} else {
						frm.doc._secondary_currency = null;
						frm.doc._secondary_currency_precision = 2;
						toggleSecondaryFields(frm, false, primary, null);
					}
					if (frm.is_new() && !frm.doc.exchange_rate && cfg.exchange_rate) {
						frm.set_value("exchange_rate", cfg.exchange_rate);
					}
				},
			});
		} else {
			toggleSecondaryFields(frm, false, null, null);
		}
	},

	get_outstanding_invoices(frm) {
		if (!frm.doc.company || !frm.doc.party_type || !frm.doc.party) {
			frappe.msgprint(__("Please select Company, Party Type and Party first."));
			return;
		}
		frappe.call({
			method: "managely_terminal.managely_terminal.doctype.multi_currency_payment.multi_currency_payment.get_outstanding_invoices",
			args: {
				company: frm.doc.company,
				party_type: frm.doc.party_type,
				party: frm.doc.party
			},
			callback(r) {
				frm.clear_table("references");
				if (r.message && r.message.length > 0) {
					r.message.forEach(d => {
						const row = frm.add_child("references");
						row.reference_doctype = d.reference_doctype;
						row.reference_name = d.reference_name;
						row.total_amount = d.total_amount;
						row.outstanding_amount = d.outstanding_amount;
						row.due_date = d.due_date;
						row.bill_no = d.bill_no;
						row.allocated_amount = 0;
					});

					// Perform FIFO auto-allocation
					autoAllocatePayments(frm);
				} else {
					frappe.msgprint(__("No outstanding invoices found for this Party."));
				}
				frm.refresh_field("references");
				_recalcDifference(frm);
			}
		});
	},

	auto_allocate(frm) {
		if (!frm.doc.references || frm.doc.references.length === 0) {
			frappe.msgprint(__("No payment references to allocate."));
			return;
		}
		autoAllocatePayments(frm);
		frappe.show_alert({
			message: __("Payments allocated against invoices."),
			indicator: "green"
		});
	},

	company(frm) {
		if (!frm.doc.company) {
			toggleSecondaryFields(frm, false);
			return;
		}
		frappe.call({
			method: "managely_terminal.managely_terminal.accounting.customizations.get_company_currency_config",
			args: { company: frm.doc.company },
			callback: function (r) {
				const cfg = r.message || {};
				if (cfg.default_currency) {
					frm.set_value("company_currency", cfg.default_currency);
				}
				if (cfg.custom_secondary_currency) {
					frm.doc._secondary_currency = cfg.custom_secondary_currency;
					frm.doc._secondary_currency_precision = cfg.fraction_units === 0 ? 0 : 2;
					toggleSecondaryFields(frm, true, cfg.default_currency, cfg.custom_secondary_currency);
					if (cfg.exchange_rate) {
						frm.set_value("exchange_rate", cfg.exchange_rate);
					}
				} else {
					frm.doc._secondary_currency = null;
					frm.doc._secondary_currency_precision = 2;
					toggleSecondaryFields(frm, false);
					frm.set_value("exchange_rate", 0);
				}
			},
		});
	},

	party_type(frm) {
		frm.set_value("party", null);
		frm.set_value("party_account", null);
		frm.clear_table("references");
		frm.refresh_field("references");
		_recalcDifference(frm);
	},

	party(frm) {
		if (!frm.doc.party || !frm.doc.party_type || !frm.doc.company) {
			frm.set_value("party_account", null);
			frm.clear_table("references");
			frm.refresh_field("references");
			_recalcDifference(frm);
			return;
		}
		frappe.call({
			method: "managely_terminal.managely_terminal.doctype.multi_currency_payment.multi_currency_payment.get_default_party_account",
			args: {
				company: frm.doc.company,
				party_type: frm.doc.party_type,
				party: frm.doc.party
			},
			callback(r) {
				if (r.message) {
					frm.set_value("party_account", r.message);
				} else {
					frm.set_value("party_account", null);
				}
			}
		});
	},

	// When parent exchange_rate changes → recalculate ALL lines (amount_usd, amount_lbp change)
	exchange_rate(frm) {
		_recalcAllLines(frm);
	},
});

// ── Payment Lines child table ─────────────────────────────────────────────────
frappe.ui.form.on("Multi Currency Payment Line", {

	lines_add(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (row && row.currency) {
			fetchLineExchangeRate(frm, cdt, cdn);
		}
	},

	mode_of_payment(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.mode_of_payment || !frm.doc.company) return;

		// Check for duplicate mode_of_payment in other rows
		const duplicate = (frm.doc.lines || []).some(
			r => r.name !== row.name && r.mode_of_payment === row.mode_of_payment
		);
		if (duplicate) {
			frappe.model.set_value(cdt, cdn, "mode_of_payment", null);
			frappe.msgprint(__("Mode of Payment '{0}' is already used in another row.",
				[row.mode_of_payment]));
			return;
		}

		// Fetch the account currency from the MOP's default account for this company
		frappe.call({
			method: "managely_terminal.managely_terminal.doctype.multi_currency_payment.multi_currency_payment.get_mop_account_currency",
			args: { company: frm.doc.company, mode_of_payment: row.mode_of_payment },
			callback(r) {
				const currency = r.message;
				if (!currency) {
					frappe.msgprint(__("No account currency configured for Mode of Payment '{0}'.", [row.mode_of_payment]));
					return;
				}
				frappe.model.set_value(cdt, cdn, "currency", currency);
				fetchLineExchangeRate(frm, cdt, cdn);
			},
		});
	},

	currency(frm, cdt, cdn) {
		fetchLineExchangeRate(frm, cdt, cdn);
	},

	amount(frm, cdt, cdn) {
		_recalcBase(frm, cdt, cdn);
	},

	exchange_rate(frm, cdt, cdn) {
		_recalcBase(frm, cdt, cdn);
	},

	lines_remove(frm) {
		_recalcTotalPayments(frm);
	},
});

// ── Payment References child table ────────────────────────────────────────────
frappe.ui.form.on("Multi Currency Payment Reference", {

	reference_name(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.reference_doctype || !row.reference_name) return;

		// Check for duplicate reference in other rows
		const duplicate = (frm.doc.references || []).some(
			r => r.name !== row.name && r.reference_name === row.reference_name
		);
		if (duplicate) {
			frappe.model.set_value(cdt, cdn, "reference_name", null);
			frappe.msgprint(__(
				"Reference '{0}' is already added in another row.",
				[row.reference_name]
			));
			return;
		}

		frappe.call({
			method: "managely_terminal.managely_terminal.doctype.multi_currency_payment.multi_currency_payment.get_reference_details",
			args: {
				reference_doctype: row.reference_doctype,
				reference_name: row.reference_name,
			},
			callback(r) {
				if (!r.message) return;
				const d = r.message;
				frappe.model.set_value(cdt, cdn, "total_amount", d.total_amount || 0);
				frappe.model.set_value(cdt, cdn, "outstanding_amount", d.outstanding_amount || 0);
				frappe.model.set_value(cdt, cdn, "due_date", d.due_date || null);
				frappe.model.set_value(cdt, cdn, "bill_no", d.bill_no || null);

				// If allocated is not set, set to remaining payment or full outstanding
				if (!flt(row.allocated_amount)) {
					const otherAllocated = (frm.doc.references || [])
						.filter(ref => ref.name !== row.name)
						.reduce((s, ref) => s + flt(ref.allocated_amount), 0);
					const available = Math.max(0, flt(frm.doc.total_payments) - otherAllocated);
					const outstanding = flt(d.outstanding_amount) || 0;

					if (flt(frm.doc.total_payments) > 0) {
						frappe.model.set_value(cdt, cdn, "allocated_amount", Math.min(outstanding, available));
					} else {
						frappe.model.set_value(cdt, cdn, "allocated_amount", outstanding);
					}
				}
				frm.refresh_field("references");
				_recalcDifference(frm);
			},
		});
	},

	// Clear read-only fields when reference_doctype changes
	reference_doctype(frm, cdt, cdn) {
		frappe.model.set_value(cdt, cdn, "reference_name", null);
		frappe.model.set_value(cdt, cdn, "total_amount", 0);
		frappe.model.set_value(cdt, cdn, "outstanding_amount", 0);
		frappe.model.set_value(cdt, cdn, "due_date", null);
		frappe.model.set_value(cdt, cdn, "bill_no", null);
		frappe.model.set_value(cdt, cdn, "allocated_amount", 0);
		_recalcDifference(frm);
	},

	allocated_amount(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (row && flt(row.outstanding_amount) && flt(row.allocated_amount) > flt(row.outstanding_amount)) {
			frappe.msgprint(__(
				"Allocated Amount ({0}) cannot exceed Outstanding Amount ({1}) in row {2}.",
				[row.allocated_amount, row.outstanding_amount, row.idx]
			));
		}
		_recalcDifference(frm);
	},

	references_remove(frm) {
		_recalcDifference(frm);
	},
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCompanyCurrency(frm) {
	return frm.doc.company_currency || (frm.doc.company ? erpnext.get_currency(frm.doc.company) : null);
}

function fetchLineExchangeRate(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	if (!row || !row.currency) return;

	const companyCurrency = getCompanyCurrency(frm);
	if (!companyCurrency) return;

	if (row.currency === companyCurrency) {
		frappe.model.set_value(cdt, cdn, "exchange_rate", 1.0);
		_recalcBase(frm, cdt, cdn);
		return;
	}

	frappe.call({
		method: "managely_terminal.managely_terminal.doctype.multi_currency_payment.multi_currency_payment.get_exchange_rate",
		args: {
			from_currency: row.currency,
			to_currency: companyCurrency,
			transaction_date: frm.doc.posting_date,
			company: frm.doc.company
		},
		callback(res) {
			let rate = flt(res.message);
			if (!rate || rate <= 0) {
				const secCurr = frm.doc._secondary_currency;
				if (secCurr && (row.currency === secCurr || companyCurrency === secCurr)) {
					rate = flt(frm.doc.exchange_rate);
				}
			}
			if (rate && rate > 0) {
				frappe.model.set_value(cdt, cdn, "exchange_rate", rate);
			} else {
				frappe.msgprint(__(
					"No exchange rate configured for {0} to {1}. Please enter rate manually in row {2} or configure under Accounts → Currency Exchange.",
					[row.currency, companyCurrency, row.idx]
				));
			}
			_recalcBase(frm, cdt, cdn);
		},
	});
}

function toggleSecondaryFields(frm, enabled, priCurr, secCurr) {
	const isHidden = enabled ? 0 : 1;

	// Always hide duplicate total_company_amount (total_usd displays company currency total)
	if (frm.fields_dict.total_company_amount) {
		frm.set_df_property("total_company_amount", "hidden", 1);
	}

	// Dual currency totals & exchange rate
	if (frm.fields_dict.exchange_rate) {
		frm.set_df_property("exchange_rate", "hidden", isHidden);
	}
	if (frm.fields_dict.total_usd) {
		frm.set_df_property("total_usd", "hidden", isHidden);
	}
	if (frm.fields_dict.total_lbp) {
		frm.set_df_property("total_lbp", "hidden", isHidden);
	}

	// In payment lines grid: show/hide dual currency amount columns
	if (frm.fields_dict.lines && frm.fields_dict.lines.grid) {
		frm.fields_dict.lines.grid.set_column_disp("amount_usd", enabled);
		frm.fields_dict.lines.grid.set_column_disp("amount_lbp", enabled);
	}

	// Apply standard Frappe dynamic currency labels
	if (priCurr) {
		frm.set_currency_labels(["total_payments", "total_references", "unallocated_amount"], priCurr);
		if (enabled) {
			frm.set_currency_labels(["total_usd"], priCurr);
		}
		if (frm.fields_dict.lines && frm.fields_dict.lines.grid) {
			frm.set_currency_labels(["amount_base_currency"], priCurr, "lines");
			if (enabled) {
				frm.set_currency_labels(["amount_usd"], priCurr, "lines");
			}
			frm.fields_dict.lines.grid.refresh();
		}
		if (frm.fields_dict.references && frm.fields_dict.references.grid) {
			frm.set_currency_labels(["total_amount", "outstanding_amount", "allocated_amount"], priCurr, "references");
			frm.fields_dict.references.grid.refresh();
		}
	}

	if (enabled && secCurr) {
		frm.set_currency_labels(["total_lbp"], secCurr);
		if (frm.fields_dict.lines && frm.fields_dict.lines.grid) {
			frm.set_currency_labels(["amount_lbp"], secCurr, "lines");
			frm.fields_dict.lines.grid.refresh();
		}
	}

	frm.refresh_fields();
}

function autoAllocatePayments(frm) {
	let available = flt(frm.doc.total_payments) || (frm.doc.lines || []).reduce((s, r) => s + flt(r.amount_base_currency), 0);
	const refs = frm.doc.references || [];
	if (refs.length === 0) return;

	refs.forEach(row => {
		const outstanding = flt(row.outstanding_amount);
		if (available <= 0) {
			row.allocated_amount = 0;
		} else if (available >= outstanding) {
			row.allocated_amount = outstanding;
			available -= outstanding;
		} else {
			row.allocated_amount = available;
			available = 0;
		}
	});

	frm.refresh_field("references");
	_recalcDifference(frm);
}

function convertCurrency(amount, fromCurrency, toCurrency, rate, secCurrency) {
	amount = flt(amount);
	rate = flt(rate);
	if (!rate) return amount;
	if (fromCurrency === toCurrency) return amount;

	if (secCurrency && fromCurrency === secCurrency) {
		if (rate > 1.0) {
			return amount / rate;
		} else if (rate > 0) {
			return amount * rate;
		}
		return amount;
	} else if (secCurrency && toCurrency === secCurrency) {
		if (rate > 1.0) {
			return amount * rate;
		} else if (rate > 0) {
			return amount / rate;
		}
		return amount;
	}
	return amount * rate;
}

// Mirror of Python _to_dual_currency() — returns { usd, lbp }
function _toDualCurrency(amount, currency, rowRate, parentRate, companyCurrency, secCurrency) {
	amount = flt(amount);
	rowRate = flt(rowRate);
	parentRate = flt(parentRate);

	if (!secCurrency) {
		return { usd: amount, lbp: 0 };
	}

	if (currency === secCurrency) {
		let pri = 0;
		if (parentRate > 1.0) {
			pri = amount / parentRate;
		} else if (parentRate > 0) {
			pri = amount * parentRate;
		}
		return { usd: pri, lbp: amount };
	}
	if (currency === companyCurrency) {
		return { usd: amount, lbp: parentRate > 0 ? (parentRate > 1.0 ? amount * parentRate : amount / parentRate) : 0 };
	}

	// Foreign currency
	const priAmount = amount * (rowRate || 1.0);
	const secAmount = parentRate > 0 ? (parentRate > 1.0 ? priAmount * parentRate : priAmount / parentRate) : 0;
	return { usd: priAmount, lbp: secAmount };
}

const _toUsdLbp = _toDualCurrency;

// Recalculate one row: base currency and dual currency amounts
function _recalcBase(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	const amt = flt(row.amount);
	const rowRate = flt(row.exchange_rate);
	const parentRate = flt(frm.doc.exchange_rate);
	const companyCurrency = frm.doc.company_currency;
	const secCurrency = frm.doc._secondary_currency;

	// Base currency amount
	const base = convertCurrency(amt, row.currency, companyCurrency, rowRate, secCurrency);
	row.amount_base_currency = base;

	// Dual currency amounts
	const { usd, lbp } = _toDualCurrency(amt, row.currency, rowRate, parentRate, companyCurrency, secCurrency);
	const precision = frm.doc._secondary_currency_precision != null ? frm.doc._secondary_currency_precision : 2;
	row.amount_usd = flt(usd, 2);
	row.amount_lbp = precision === 0 ? Math.round(lbp) : flt(lbp, precision);

	frm.refresh_field("lines");
	_recalcTotalPayments(frm);
}

// Recalculate all lines (used when parent exchange_rate changes)
function _recalcAllLines(frm) {
	(frm.doc.lines || []).forEach(row => {
		_recalcBase(frm, row.doctype, row.name);
	});
}

// Sum all lines → update total_payments, total_company_amount, total_usd, total_lbp
function _recalcTotalPayments(frm) {
	const lines = frm.doc.lines || [];
	const totalBase = lines.reduce((s, r) => s + flt(r.amount_base_currency), 0);
	const totalUsd  = lines.reduce((s, r) => s + flt(r.amount_usd), 0);
	const totalLbp  = lines.reduce((s, r) => s + flt(r.amount_lbp), 0);
	const precision = frm.doc._secondary_currency_precision != null ? frm.doc._secondary_currency_precision : 2;

	frm.set_value("total_payments", totalBase);
	frm.set_value("total_company_amount", totalBase);
	frm.set_value("total_usd", flt(totalUsd, 2));
	frm.set_value("total_lbp", precision === 0 ? Math.round(totalLbp) : flt(totalLbp, precision));

	_recalcDifference(frm);
}

// Difference = total_payments − total_references
function _recalcDifference(frm) {
	const totalPayments = (frm.doc.lines || []).reduce(
		(s, r) => s + flt(r.amount_base_currency), 0
	);
	const totalRefs = (frm.doc.references || []).reduce(
		(s, r) => s + flt(r.allocated_amount), 0
	);
	const diff = totalPayments - totalRefs;
	const unallocated = Math.max(0, diff);

	frm.set_value("total_references", totalRefs);
	frm.set_value("difference", diff);
	if (frm.fields_dict.unallocated_amount) {
		frm.set_value("unallocated_amount", unallocated);
	}
}
