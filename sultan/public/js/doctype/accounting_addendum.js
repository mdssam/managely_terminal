(function () {
	const DEFAULT_LBP_PER_USD = 89500;

	const transactionTables = {
		"Sales Invoice": ["items"],
		"Purchase Invoice": ["items"],
		"Payment Entry": ["references"],
		"Journal Entry": ["accounts"],
	};

	function getRate(frm) {
		return flt(frm.doc.custom_exchange_rate_override) || DEFAULT_LBP_PER_USD;
	}

	function recalculateStampTaxes(frm) {
		if (frm.doctype !== "Sales Invoice" && frm.doctype !== "Purchase Invoice") return;
		const taxes = frm.doc.taxes || [];
		const currency = frm.doc.currency || "USD";
		const rate = getRate(frm);
		let changed = false;

		taxes.forEach(tax => {
			if (!tax.custom_is_stamp || !flt(tax.custom_stamp_amount_lbp)) return;
			const lbpAmount = flt(tax.custom_stamp_amount_lbp);
			const taxAmount = currency === "LBP" ? lbpAmount : flt(lbpAmount / rate);

			if (tax.charge_type !== "Actual" || flt(tax.rate) !== 0 ||
				Math.abs(flt(tax.tax_amount) - taxAmount) > 0.001) {
				frappe.model.set_value(tax.doctype, tax.name, "charge_type", "Actual");
				frappe.model.set_value(tax.doctype, tax.name, "rate", 0);
				frappe.model.set_value(tax.doctype, tax.name, "tax_amount", taxAmount);
				changed = true;
			}
		});

		if (changed) frm.refresh_field("taxes");
	}

	function getCurrency(frm) {
		return frm.doc.currency || frm.doc.paid_from_account_currency || "USD";
	}

	function getLineAmount(row) {
		const fields = [
			"amount",
			"allocated_amount",
			"debit_in_account_currency",
			"credit_in_account_currency",
			"debit",
			"credit",
		];
		for (const field of fields) {
			const value = Math.abs(flt(row[field]));
			if (value) return value;
		}
		return 0;
	}

	function setDualCurrencyValues(frm, row) {
		if (!row) return;
		const amount = getLineAmount(row);
		const rate = getRate(frm);
		const currency = row.account_currency || getCurrency(frm);
		const companyCurrency = frm.doc.company_currency || (frappe.boot && frappe.boot.sysdefaults && frappe.boot.sysdefaults.currency) || "USD";

		let usdAmount = amount;
		let lbpAmount = amount;

		if (currency === "LBP") {
			usdAmount = amount / rate;
			lbpAmount = amount;
		} else if (currency === "USD") {
			usdAmount = amount;
			lbpAmount = amount * rate;
		} else {
			// Generic currency: convert to USD
			const rowExchangeRate = flt(row.exchange_rate) || flt(frm.doc.conversion_rate) || 1.0;
			if (companyCurrency === "USD") {
				usdAmount = amount * rowExchangeRate;
			} else {
				const baseAmount = amount * rowExchangeRate;
				usdAmount = baseAmount / rate;
			}
			lbpAmount = usdAmount * rate;
		}

		const roundedLbp = Math.round(lbpAmount);

		// Only call set_value when the value actually changed — calling set_value
		// unconditionally (even with the same value) can mark the parent form dirty
		// which causes the "Not Saved" banner to reappear immediately after every save.
		if (Math.abs(flt(row.custom_usd_amount) - usdAmount) > 0.001) {
			frappe.model.set_value(row.doctype, row.name, "custom_usd_amount", usdAmount);
		}
		if (flt(row.custom_lbp_amount) !== roundedLbp) {
			frappe.model.set_value(row.doctype, row.name, "custom_lbp_amount", roundedLbp);
		}
	}

	function refreshDualCurrency(frm) {
		let totalUsd = 0;
		let totalLbp = 0;
		let totalUsdDebit = 0;
		let totalLbpDebit = 0;
		let totalUsdCredit = 0;
		let totalLbpCredit = 0;
		const isJe = frm.doctype === "Journal Entry";

		(transactionTables[frm.doctype] || []).forEach((tableField) => {
			(frm.doc[tableField] || []).forEach((row) => {
				setDualCurrencyValues(frm, row);
				if (isJe) {
					const isDebit = flt(row.debit) > 0 || flt(row.debit_in_account_currency) > 0;
					if (isDebit) {
						totalUsdDebit += flt(row.custom_usd_amount);
						totalLbpDebit += flt(row.custom_lbp_amount);
					} else {
						totalUsdCredit += flt(row.custom_usd_amount);
						totalLbpCredit += flt(row.custom_lbp_amount);
					}
				} else {
					totalUsd += flt(row.custom_usd_amount);
					totalLbp += flt(row.custom_lbp_amount);
				}
			});
			frm.refresh_field(tableField);
		});

		if (isJe) {
			totalUsd = totalUsdDebit > 0 ? totalUsdDebit : totalUsdCredit;
			totalLbp = totalLbpDebit > 0 ? totalLbpDebit : totalLbpCredit;
		} else if (frm.doctype === "Sales Invoice" || frm.doctype === "Purchase Invoice") {
			const finalAmount = flt(frm.doc.rounded_total) || flt(frm.doc.grand_total);
			const currency = getCurrency(frm);
			const rate = getRate(frm);
			const companyCurrency = frm.doc.company_currency || (frappe.boot && frappe.boot.sysdefaults && frappe.boot.sysdefaults.currency) || "USD";
			
			if (currency === "LBP") {
				totalUsd = finalAmount / rate;
				totalLbp = finalAmount;
			} else if (currency === "USD") {
				totalUsd = finalAmount;
				totalLbp = finalAmount * rate;
			} else {
				const rowExchangeRate = flt(frm.doc.conversion_rate) || 1.0;
				if (companyCurrency === "USD") {
					totalUsd = finalAmount * rowExchangeRate;
				} else {
					const baseAmount = finalAmount * rowExchangeRate;
					totalUsd = baseAmount / rate;
				}
				totalLbp = totalUsd * rate;
			}
		}

		const roundedLbp = Math.round(totalLbp);
		if (frappe.meta.has_field(frm.doctype, "custom_total_usd") && Math.abs(flt(frm.doc.custom_total_usd) - totalUsd) > 0.001) {
			frm.set_value("custom_total_usd", totalUsd);
		}
		if (frappe.meta.has_field(frm.doctype, "custom_total_lbp") && flt(frm.doc.custom_total_lbp) !== roundedLbp) {
			frm.set_value("custom_total_lbp", roundedLbp);
		}
	}

	function syncPaymentEntryAmounts(frm) {
		if (frm.doctype !== "Payment Entry" || frm.doc.payment_type === "Internal Transfer") return;

		const total = (frm.doc.references || []).reduce((sum, row) => sum + flt(row.allocated_amount), 0);
		if (total <= 0) return;

		frm.set_value("paid_amount", total);
		frm.set_value("received_amount", total);
		frm.set_value("total_allocated_amount", total);
	}

	function attachEnterToAddRows(frm) {
		(transactionTables[frm.doctype] || []).forEach((tableField) => {
			const grid = frm.fields_dict[tableField] && frm.fields_dict[tableField].grid;
			if (!grid || !grid.wrapper) return;

			grid.wrapper.off("keydown.sultan_enter_add_row");
			grid.wrapper.on("keydown.sultan_enter_add_row", "input, textarea, select", function (event) {
				if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
					return;
				}

				const rowName = $(event.target).closest(".grid-row").attr("data-name");
				const rows = frm.doc[tableField] || [];
				if (!rowName || !rows.length || rows[rows.length - 1].name !== rowName) return;

				event.preventDefault();
				grid.add_new_row();
			});
		});
	}
	function setupTransactionForm(doctype) {
		frappe.ui.form.on(doctype, {
			onload(frm) {
				if ((frm.doctype === "Sales Invoice" || frm.doctype === "Purchase Invoice") && frm.is_new()) {
					frm.set_value("custom_stamps_auto_inserted", 1);
				}
			},
			refresh(frm) {
				// Only set the default on new unsaved documents — the server hook sets it on save,
				// and calling frm.set_value on an already-saved doc marks it dirty immediately.
				if (frm.is_new() && !frm.doc.custom_exchange_rate_override) {
					frappe.call({
						method: "sultan.sultan.accounting.customizations.get_lbp_usd_rate",
						callback: function(r) {
							if (r.message && !frm.doc.custom_exchange_rate_override) {
								frm.set_value("custom_exchange_rate_override", r.message);
							} else if (!frm.doc.custom_exchange_rate_override) {
								frm.set_value("custom_exchange_rate_override", DEFAULT_LBP_PER_USD);
							}
						}
					});
				}
				attachEnterToAddRows(frm);
				refreshDualCurrency(frm);

				// Add custom "Add Stamp" button to taxes grid
				if (frm.doctype === "Sales Invoice" || frm.doctype === "Purchase Invoice") {
					frm.fields_dict.taxes.grid.add_custom_button(__('Add Stamp'), function() {
						frappe.call({
							method: "frappe.client.get",
							args: { doctype: "Sultan Settings" },
							callback: function(r) {
								if (r.message && r.message.stamps) {
									let child_doctype = frm.doctype === "Sales Invoice" ? "Sales Taxes and Charges" : "Purchase Taxes and Charges";
									let added = false;
									r.message.stamps.forEach(setting => {
										const exists = (frm.doc.taxes || []).some(t => t.account_head === setting.account && t.custom_is_stamp);
										if (!exists) {
											let row = frappe.model.add_child(frm.doc, child_doctype, "taxes");
											row.charge_type = "Actual";
											row.account_head = setting.account;
											row.description = setting.stamp_name;
											row.custom_is_stamp = 1;
											row.custom_stamp_amount_lbp = setting.amount_lbp;
											row.rate = 0;
											row.tax_amount = 0;
											row.category = "Total";
											if (frm.doctype === "Purchase Invoice") {
												row.add_deduct_tax = "Add";
											}
											added = true;
										}
									});
									if (added) {
										frm.refresh_field("taxes");
										recalculateStampTaxes(frm);
										frappe.show_alert({message: __("Stamps added successfully"), indicator: "green"});
									} else {
										frappe.show_alert({message: __("Stamps are already in the table"), indicator: "orange"});
									}
								}
							}
						});
					});
				}
			},
			custom_exchange_rate_override(frm) {
				refreshDualCurrency(frm);
				recalculateStampTaxes(frm);
			},
			currency(frm) {
				refreshDualCurrency(frm);
				recalculateStampTaxes(frm);
			},
			paid_from_account_currency: refreshDualCurrency,
			validate(frm) {
				refreshDualCurrency(frm);
				recalculateStampTaxes(frm);
				syncPaymentEntryAmounts(frm);
			},
		});
	}

	["Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry"].forEach(setupTransactionForm);

	frappe.ui.form.on("Purchase Invoice", {
		bill_no(frm) {
			if (frm.doc.bill_no && !frm.doc.custom_supplier_invoice_number) {
				frm.set_value("custom_supplier_invoice_number", frm.doc.bill_no);
			}
		},
		custom_supplier_invoice_number(frm) {
			if (frm.doc.custom_supplier_invoice_number && !frm.doc.bill_no) {
				frm.set_value("bill_no", frm.doc.custom_supplier_invoice_number);
			}
		},
	});

	frappe.ui.form.on("Sales Invoice Item", {
		qty: setRowDualCurrency,
		rate: setRowDualCurrency,
		amount: setRowDualCurrency,
	});

	frappe.ui.form.on("Purchase Invoice Item", {
		qty: setRowDualCurrency,
		rate: setRowDualCurrency,
		amount: setRowDualCurrency,
	});

	frappe.ui.form.on("Payment Entry Reference", {
		allocated_amount(frm, cdt, cdn) {
			setRowDualCurrency(frm, cdt, cdn);
			syncPaymentEntryAmounts(frm);
		},
	});

	frappe.ui.form.on("Journal Entry Account", {
		debit_in_account_currency: setRowDualCurrency,
		credit_in_account_currency: setRowDualCurrency,
		debit: setRowDualCurrency,
		credit: setRowDualCurrency,
	});

	function setRowDualCurrency(frm, cdt, cdn) {
		setDualCurrencyValues(frm, locals[cdt][cdn]);
	}
	// Stamp tax — child table events
	["Sales Taxes and Charges", "Purchase Taxes and Charges"].forEach(childDt => {
		frappe.ui.form.on(childDt, {
			custom_is_stamp(frm) { recalculateStampTaxes(frm); },
			custom_stamp_amount_lbp(frm) { recalculateStampTaxes(frm); },
		});
	});

})();
