// Cache of valid Modes of Payment per currency (populated on demand)
const _mopCache = {};

// ── Parent form ───────────────────────────────────────────────────────────────
frappe.ui.form.on("Multi Currency Payment", {

	refresh(frm) {
		// Party Type: restrict to the standard Party Type doctype options
		frm.set_query("party_type", () => ({
			filters: [["Party Type", "name", "in", ["Customer", "Supplier", "Employee", "Shareholder"]]]
		}));

		// Mode of Payment per row: filtered dynamically by the row's currency
		frm.set_query("mode_of_payment", "lines", (doc, cdt, cdn) => {
			const row = locals[cdt][cdn];
			const validMops = _mopCache[`${frm.doc.company}::${row.currency}`] || [];
			if (validMops.length) {
				return { filters: [["Mode of Payment", "name", "in", validMops]] };
			}
			return {};   // no restriction until cache is populated
		});

		if (frm.doc.journal_entry) {
			frm.add_custom_button(__("Journal Entry"), () => {
				frappe.set_route("Form", "Journal Entry", frm.doc.journal_entry);
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

	currency(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.currency) return;

		const companyCurrency = frm.doc.company_currency;

		// 1. Auto-fetch exchange rate from ERPNext currency exchange table
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

		// Refresh the MoP filter cache for the new currency.
		// Do NOT auto-clear mode_of_payment here: Frappe re-fires the currency
		// event when the row gains focus (e.g. when the user clicks into the MoP
		// cell), which would erase the value the user just picked.
		// The get_query filter already prevents invalid selections.
		_loadMopCache(frm, row.currency);
	},

	amount(frm, cdt, cdn) {
		_recalcBase(frm, cdt, cdn);
	},

	exchange_rate(frm, cdt, cdn) {
		_recalcBase(frm, cdt, cdn);
	},
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function _recalcBase(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	const amt = flt(row.amount);
	const rate = flt(row.exchange_rate);
	const companyCurrency = frm.doc.company_currency;

	let base = (row.currency === companyCurrency) ? amt : amt * rate;
	frappe.model.set_value(cdt, cdn, "amount_base_currency", base);
	frm.refresh_field("lines");
}

function _loadMopCache(frm, currency) {
	if (!frm.doc.company || !currency) return;
	const key = `${frm.doc.company}::${currency}`;
	if (_mopCache[key] !== undefined) return;   // already loaded

	_mopCache[key] = [];   // mark as loading
	frappe.call({
		method: "sultan.sultan.doctype.multi_currency_payment.multi_currency_payment.get_mop_for_currency",
		args: { company: frm.doc.company, currency },
		callback(r) {
			_mopCache[key] = r.message || [];
		},
	});
}
