// Cache of valid Modes of Payment per currency (populated on demand)
const _mopCache = {};

// Track the last currency processed per row (cdn) so we can skip re-fires.
// Frappe's editable grid re-fires field change events whenever the row gains
// focus (e.g. clicking the MoP cell). Without this guard the currency handler
// would call set_value + refresh_field every time, disrupting MoP selection.
const _lastCurrency = {};

// ── Parent form ───────────────────────────────────────────────────────────────
frappe.ui.form.on("Multi Currency Payment", {

	refresh(frm) {
		// Pre-initialize _lastCurrency for rows that already have a currency set
		// (e.g. new rows with a default currency, or rows loaded from the DB).
		// Without this, the first Frappe re-fire on row focus isn't caught.
		(frm.doc.lines || []).forEach(row => {
			if (row.currency) _lastCurrency[row.name] = row.currency;
		});

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

		// Frappe re-fires this event every time the row gains focus. Skip if
		// we've already processed this currency for this row so we don't
		// trigger set_value + refresh_field and disrupt MoP selection.
		if (_lastCurrency[cdn] === row.currency) {
			_loadMopCache(frm, row.currency);
			return;
		}
		_lastCurrency[cdn] = row.currency;

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
	// Do NOT call frm.refresh_field("lines") here — it re-renders the entire
	// grid and disrupts in-progress MoP selection. set_value handles the cell.
}

function _loadMopCache(frm, currency) {
	if (!frm.doc.company || !currency) return;
	const key = `${frm.doc.company}::${currency}`;
	if (_mopCache[key] !== undefined) return;   // already loaded or loading

	_mopCache[key] = [];   // mark as loading
	frappe.call({
		method: "sultan.sultan.doctype.multi_currency_payment.multi_currency_payment.get_mop_for_currency",
		args: { company: frm.doc.company, currency },
		callback(r) {
			_mopCache[key] = r.message || [];
		},
	});
}
