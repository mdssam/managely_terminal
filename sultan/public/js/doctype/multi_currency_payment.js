// Multi Currency Payment — form client script
// Handles: MOP filter by currency, auto exchange-rate fetch, live amount_base_currency

frappe.ui.form.on("Multi Currency Payment", {
	company(frm) {
		frm.set_value("company_currency",
			frappe.get_doc("Company", frm.doc.company)?.default_currency || "");
		refresh_child_mop_filters(frm);
	},
	payment_type(frm) {
		frm.set_df_property("lines", "description",
			frm.doc.payment_type === "Receive"
				? "Receive: MOP rows → Debit  |  Party → Credit (auto)"
				: "Pay: MOP rows → Credit  |  Party → Debit (auto)");
	},
});

frappe.ui.form.on("Multi Currency Payment Line", {
	currency(frm, cdt, cdn) {
		const row = frappe.get_doc(cdt, cdn);
		if (!row.currency) return;

		// 1. Filter Mode of Payment to those whose GL account uses this currency
		set_mop_filter(frm, cdt, cdn, row.currency);

		// 2. Auto-fetch exchange rate
		if (row.currency === frm.doc.company_currency) {
			frappe.model.set_value(cdt, cdn, "exchange_rate", 1.0);
			recalc_base(frm, cdt, cdn);
			return;
		}
		frappe.call({
			method: "sultan.sultan.sultan.doctype.multi_currency_payment.multi_currency_payment.get_exchange_rate",
			args: { from_currency: row.currency, to_currency: frm.doc.company_currency },
			callback(r) {
				const rate = r.message || frm.doc.exchange_rate || 89500;
				frappe.model.set_value(cdt, cdn, "exchange_rate", rate);
				recalc_base(frm, cdt, cdn);
			},
		});
	},

	amount(frm, cdt, cdn) {
		recalc_base(frm, cdt, cdn);
	},

	exchange_rate(frm, cdt, cdn) {
		recalc_base(frm, cdt, cdn);
	},

	// Restrict mode_of_payment via get_query whenever the row is focused
	mode_of_payment(frm, cdt, cdn) {
		const row = frappe.get_doc(cdt, cdn);
		if (row.currency) set_mop_filter(frm, cdt, cdn, row.currency);
	},

	lines_add(frm, cdt, cdn) {
		// Pre-fill currency from company currency on new rows
		if (frm.doc.company_currency) {
			frappe.model.set_value(cdt, cdn, "currency", frm.doc.company_currency);
			frappe.model.set_value(cdt, cdn, "exchange_rate", 1.0);
		}
	},
});

function set_mop_filter(frm, cdt, cdn, currency) {
	frm.set_query("mode_of_payment", "lines", function (doc, child) {
		if (child.name !== cdn) return {};
		return {
			query: "sultan.sultan.sultan.doctype.multi_currency_payment.multi_currency_payment.get_mop_for_currency",
			filters: { company: doc.company, currency: child.currency || currency },
		};
	});
	// Also clear stale MOP selection if currency changed
	const row = frappe.get_doc(cdt, cdn);
	if (row.mode_of_payment) {
		frappe.model.set_value(cdt, cdn, "mode_of_payment", "");
	}
}

function refresh_child_mop_filters(frm) {
	(frm.doc.lines || []).forEach(row => {
		if (row.currency) set_mop_filter(frm, row.doctype, row.name, row.currency);
	});
}

function recalc_base(frm, cdt, cdn) {
	const row = frappe.get_doc(cdt, cdn);
	const amount = flt(row.amount);
	const rate   = flt(row.exchange_rate) || flt(frm.doc.exchange_rate) || 89500;
	const base   = (row.currency === frm.doc.company_currency) ? amount : amount * rate;
	frappe.model.set_value(cdt, cdn, "amount_base_currency", base);
	frm.refresh_field("lines");
}
