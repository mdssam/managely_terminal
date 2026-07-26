// ── Parent form ───────────────────────────────────────────────────────────────
frappe.ui.form.on("Multi Currency Payment", {

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
		if (frm.is_new() && !frm.doc.exchange_rate) {
			frappe.call({
				method: "sultan.sultan.accounting.customizations.get_lbp_usd_rate",
				callback: function(r) {
					if (r.message && !frm.doc.exchange_rate) {
						frm.set_value("exchange_rate", r.message);
					}
				}
			});
		}
	},

	get_outstanding_invoices(frm) {
		if (!frm.doc.company || !frm.doc.party_type || !frm.doc.party) {
			frappe.msgprint(__("Please select Company, Party Type and Party first."));
			return;
		}
		frappe.call({
			method: "sultan.sultan.doctype.multi_currency_payment.multi_currency_payment.get_outstanding_invoices",
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
						row.allocated_amount = d.outstanding_amount;
					});
				} else {
					frappe.msgprint(__("No outstanding invoices found for this Party."));
				}
				frm.refresh_field("references");
				_recalcDifference(frm);
			}
		});
	},

	company(frm) {
		if (!frm.doc.company) return;
		frappe.db.get_value("Company", frm.doc.company, "default_currency").then(r => {
			frm.set_value("company_currency", r.message.default_currency);
		});
	},

	party_type(frm) {
		frm.set_value("party", null);
		frm.set_value("party_account", null);
	},

	party(frm) {
		if (!frm.doc.party || !frm.doc.party_type || !frm.doc.company) {
			frm.set_value("party_account", null);
			return;
		}
		frappe.call({
			method: "sultan.sultan.doctype.multi_currency_payment.multi_currency_payment.get_default_party_account",
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
			method: "sultan.sultan.doctype.multi_currency_payment.multi_currency_payment.get_mop_account_currency",
			args: { company: frm.doc.company, mode_of_payment: row.mode_of_payment },
			callback(r) {
				const currency = r.message;
				if (!currency) return;
				// Setting currency triggers the currency handler which fetches exchange rate
				frappe.model.set_value(cdt, cdn, "currency", currency);
			},
		});
	},

	currency(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.currency) return;
		const companyCurrency = frm.doc.company_currency;

		if (row.currency === companyCurrency) {
			frappe.model.set_value(cdt, cdn, "exchange_rate", 1.0);
			_recalcBase(frm, cdt, cdn);
		} else {
			frappe.call({
				method: "sultan.sultan.doctype.multi_currency_payment.multi_currency_payment.get_exchange_rate",
				args: { from_currency: row.currency, to_currency: companyCurrency },
				callback(r) {
					const rate = r.message || flt(frm.doc.exchange_rate) || 89500;
					frappe.model.set_value(cdt, cdn, "exchange_rate", rate);
					_recalcBase(frm, cdt, cdn);
				},
			});
		}
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
			method: "sultan.sultan.doctype.multi_currency_payment.multi_currency_payment.get_reference_details",
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
				// Default allocated to the full outstanding if not already set
				if (!flt(row.allocated_amount)) {
					frappe.model.set_value(cdt, cdn, "allocated_amount", d.outstanding_amount || 0);
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

	allocated_amount(frm) {
		_recalcDifference(frm);
	},
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_LBP_PER_USD = 89500;

function convertCurrency(amount, fromCurrency, toCurrency, rate) {
	amount = flt(amount);
	rate = flt(rate);
	if (!rate) return amount;
	if (fromCurrency === toCurrency) return amount;

	if (fromCurrency === "LBP" && toCurrency === "USD") {
		return rate > 1.0 ? amount / rate : amount * rate;
	} else if (fromCurrency === "USD" && toCurrency === "LBP") {
		return rate > 1.0 ? amount * rate : amount / rate;
	}
	return amount * rate;
}

// Mirror of Python _to_usd_lbp() — returns { usd, lbp }
function _toUsdLbp(amount, currency, rowRate, parentRate, companyCurrency) {
	amount = flt(amount);
	rowRate = flt(rowRate);
	parentRate = flt(parentRate) || DEFAULT_LBP_PER_USD;

	if (currency === "LBP") {
		return { usd: parentRate ? amount / parentRate : 0, lbp: amount };
	}
	if (currency === "USD") {
		return { usd: amount, lbp: amount * parentRate };
	}

	// Generic currency
	let usdAmount;
	if (companyCurrency === "USD") {
		usdAmount = convertCurrency(amount, currency, "USD", rowRate);
	} else {
		const baseAmount = convertCurrency(amount, currency, companyCurrency, rowRate);
		usdAmount = parentRate ? baseAmount / parentRate : 0;
	}
	return { usd: usdAmount, lbp: usdAmount * parentRate };
}

// Recalculate one row: base currency, USD, LBP amounts
function _recalcBase(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	const amt = flt(row.amount);
	const rowRate = flt(row.exchange_rate);
	const parentRate = flt(frm.doc.exchange_rate) || DEFAULT_LBP_PER_USD;
	const companyCurrency = frm.doc.company_currency;

	// Base currency amount
	const base = convertCurrency(amt, row.currency, companyCurrency, rowRate);
	row.amount_base_currency = base;

	// USD and LBP amounts
	const { usd, lbp } = _toUsdLbp(amt, row.currency, rowRate, parentRate, companyCurrency);
	row.amount_usd = usd;
	row.amount_lbp = lbp;

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

	frm.set_value("total_payments", totalBase);
	frm.set_value("total_company_amount", totalBase);
	frm.set_value("total_usd", totalUsd);
	frm.set_value("total_lbp", totalLbp);

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
	frm.set_value("total_references", totalRefs);
	frm.set_value("difference", totalPayments - totalRefs);
}
