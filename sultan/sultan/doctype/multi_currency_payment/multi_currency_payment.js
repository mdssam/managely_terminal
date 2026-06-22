// ── Parent form ───────────────────────────────────────────────────────────────
frappe.ui.form.on("Multi Currency Payment", {

	refresh(frm) {
		frm.set_query("party_type", () => ({
			filters: [["Party Type", "name", "in", ["Customer", "Supplier", "Employee", "Shareholder"]]]
		}));

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

	company(frm) {
		if (!frm.doc.company) return;
		frappe.db.get_value("Company", frm.doc.company, "default_currency").then(r => {
			frm.set_value("company_currency", r.message.default_currency);
		});
	},
});

// ── Child table ───────────────────────────────────────────────────────────────
frappe.ui.form.on("Multi Currency Payment Line", {

	mode_of_payment(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.mode_of_payment || !frm.doc.company) return;

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
});

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function _recalcBase(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	const amt = flt(row.amount);
	const rate = flt(row.exchange_rate);
	const companyCurrency = frm.doc.company_currency;

	const base = convertCurrency(amt, row.currency, companyCurrency, rate);
	frappe.model.set_value(cdt, cdn, "amount_base_currency", base);
}
