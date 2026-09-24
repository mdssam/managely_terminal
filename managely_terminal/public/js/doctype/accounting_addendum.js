(function () {
	let latestExchangeRate = null;

	function fetchLatestExchangeRate(company, callback) {
		if (!company) {
			if (callback) callback(null);
			return;
		}
		frappe.call({
			method: "managely_terminal.managely_terminal.accounting.customizations.get_company_dual_rate",
			args: { company: company },
			callback: function (r) {
				latestExchangeRate = r.message ? flt(r.message) : null;
				if (callback) callback(latestExchangeRate);
			},
		});
	}

	const transactionTables = {
		"Sales Invoice": ["items"],
		"Purchase Invoice": ["items"],
		"Payment Entry": ["references"],
		"Journal Entry": ["accounts"],
	};

	function getRate(frm) {
		return flt(frm && frm.doc && frm.doc.custom_exchange_rate_override) || latestExchangeRate || 0.0;
	}

	function toggleDualCurrencyFields(frm, enabled, priCurr, secCurr) {
		const isHidden = enabled ? 0 : 1;

		if (frm.fields_dict.custom_exchange_rate_override) {
			frm.set_df_property("custom_exchange_rate_override", "hidden", isHidden);
			if (enabled) {
				frm.set_df_property("custom_exchange_rate_override", "label", __("Exchange Rate"));
			}
		}
		if (frm.fields_dict.custom_total_usd) {
			frm.set_df_property("custom_total_usd", "hidden", isHidden);
		}
		if (frm.fields_dict.custom_total_lbp) {
			frm.set_df_property("custom_total_lbp", "hidden", isHidden);
		}

		(transactionTables[frm.doctype] || []).forEach((tableField) => {
			const grid = frm.fields_dict[tableField] && frm.fields_dict[tableField].grid;
			if (!grid) return;
			grid.set_column_disp("custom_usd_amount", enabled);
			grid.set_column_disp("custom_lbp_amount", enabled);
		});

		if (frm.fields_dict.taxes && frm.fields_dict.taxes.grid) {
			frm.fields_dict.taxes.grid.set_column_disp("custom_is_stamp", enabled);
			frm.fields_dict.taxes.grid.set_column_disp("custom_stamp_amount_lbp", enabled);
		}

		// Dynamic currency labels using standard Frappe set_currency_labels
		if (enabled && priCurr) {
			frm.set_currency_labels(["custom_total_usd"], priCurr);
			(transactionTables[frm.doctype] || []).forEach((tableField) => {
				const grid = frm.fields_dict[tableField] && frm.fields_dict[tableField].grid;
				if (grid) {
					frm.set_currency_labels(["custom_usd_amount"], priCurr, tableField);
					grid.refresh();
				}
			});
		}

		if (enabled && secCurr) {
			frm.set_currency_labels(["custom_total_lbp"], secCurr);
			(transactionTables[frm.doctype] || []).forEach((tableField) => {
				const grid = frm.fields_dict[tableField] && frm.fields_dict[tableField].grid;
				if (grid) {
					frm.set_currency_labels(["custom_lbp_amount"], secCurr, tableField);
					grid.refresh();
				}
			});
			if (frm.fields_dict.taxes && frm.fields_dict.taxes.grid) {
				frm.set_currency_labels(["custom_stamp_amount_lbp"], secCurr, "taxes");
				frm.fields_dict.taxes.grid.refresh();
			}
		}

		frm.refresh_fields();
	}

	function syncCompanyCurrencies(frm, callback) {
		if (!frm.doc.company) {
			frm.doc._primary_currency = null;
			frm.doc._secondary_currency = null;
			frm.doc._secondary_currency_precision = 2;
			toggleDualCurrencyFields(frm, false);
			if (callback) callback(null);
			return;
		}

		frappe.call({
			method: "managely_terminal.managely_terminal.accounting.customizations.get_company_currency_config",
			args: { company: frm.doc.company },
			callback: function (r) {
				const cfg = r.message || {};
				if (cfg.custom_secondary_currency) {
					frm.doc._primary_currency = cfg.default_currency;
					frm.doc._secondary_currency = cfg.custom_secondary_currency;
					frm.doc._secondary_currency_precision = cfg.fraction_units === 0 ? 0 : 2;
					toggleDualCurrencyFields(frm, true, cfg.default_currency, cfg.custom_secondary_currency);
					if (callback) callback(cfg);
				} else {
					frm.doc._primary_currency = cfg.default_currency || null;
					frm.doc._secondary_currency = null;
					frm.doc._secondary_currency_precision = 2;
					toggleDualCurrencyFields(frm, false, cfg.default_currency, null);
					if (callback) callback(cfg);
				}
			},
		});
	}

	function recalculateStampTaxes(frm) {
		if (frm.doctype !== "Sales Invoice" && frm.doctype !== "Purchase Invoice") return;
		if (!frm.doc._secondary_currency) return;

		const taxes = frm.doc.taxes || [];
		const currency = frm.doc.currency || frm.doc._primary_currency;
		const rate = getRate(frm);
		if (!rate) return;
		let changed = false;

		taxes.forEach((tax) => {
			if (!tax.custom_is_stamp || !flt(tax.custom_stamp_amount_lbp)) return;
			const stampAmount = flt(tax.custom_stamp_amount_lbp);
			const secCurr = frm.doc._secondary_currency;
			const taxAmount = (currency === secCurr) ? stampAmount : (rate > 1.0 ? flt(stampAmount / rate) : flt(stampAmount * rate));

			if (
				tax.charge_type !== "Actual" ||
				flt(tax.rate) !== 0 ||
				Math.abs(flt(tax.tax_amount) - taxAmount) > 0.001
			) {
				frappe.model.set_value(tax.doctype, tax.name, "charge_type", "Actual");
				frappe.model.set_value(tax.doctype, tax.name, "rate", 0);
				frappe.model.set_value(tax.doctype, tax.name, "tax_amount", taxAmount);
				changed = true;
			}
		});

		if (changed) frm.refresh_field("taxes");
	}

	function getCurrency(frm) {
		return frm.doc.currency || frm.doc.paid_from_account_currency || frm.doc._primary_currency;
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
		if (!row || !frm.doc._secondary_currency) return;
		const amount = getLineAmount(row);
		const rate = getRate(frm);
		if (!rate) return;

		const currency = row.account_currency || getCurrency(frm);
		const companyCurrency = frm.doc._primary_currency || frm.doc.company_currency;
		if (!companyCurrency) return;

		const secCurrency = frm.doc._secondary_currency;
		let priAmount = amount;
		let secAmount = amount;

		if (currency === secCurrency) {
			priAmount = (rate > 1.0) ? (amount / rate) : (amount * rate);
			secAmount = amount;
		} else if (currency === companyCurrency) {
			priAmount = amount;
			secAmount = (rate > 1.0) ? (amount * rate) : (amount / rate);
		} else {
			const rowExchangeRate = flt(row.exchange_rate) || flt(frm.doc.conversion_rate) || 1.0;
			priAmount = amount * rowExchangeRate;
			secAmount = (rate > 1.0) ? (priAmount * rate) : (priAmount / rate);
		}

		const precision = frm.doc._secondary_currency_precision != null ? frm.doc._secondary_currency_precision : 2;
		const roundedSec = precision === 0 ? Math.round(secAmount) : flt(secAmount, precision);

		if (Math.abs(flt(row.custom_usd_amount) - priAmount) > 0.001) {
			frappe.model.set_value(row.doctype, row.name, "custom_usd_amount", priAmount);
		}
		if (flt(row.custom_lbp_amount) !== roundedSec) {
			frappe.model.set_value(row.doctype, row.name, "custom_lbp_amount", roundedSec);
		}
	}

	function refreshDualCurrency(frm) {
		if (!frm.doc._secondary_currency) return;

		let totalPri = 0;
		let totalSec = 0;
		let totalPriDebit = 0;
		let totalSecDebit = 0;
		let totalPriCredit = 0;
		let totalSecCredit = 0;
		const isJe = frm.doctype === "Journal Entry";

		(transactionTables[frm.doctype] || []).forEach((tableField) => {
			(frm.doc[tableField] || []).forEach((row) => {
				setDualCurrencyValues(frm, row);
				if (isJe) {
					const isDebit = flt(row.debit) > 0 || flt(row.debit_in_account_currency) > 0;
					if (isDebit) {
						totalPriDebit += flt(row.custom_usd_amount);
						totalSecDebit += flt(row.custom_lbp_amount);
					} else {
						totalPriCredit += flt(row.custom_usd_amount);
						totalSecCredit += flt(row.custom_lbp_amount);
					}
				} else {
					totalPri += flt(row.custom_usd_amount);
					totalSec += flt(row.custom_lbp_amount);
				}
			});
			frm.refresh_field(tableField);
		});

		if (isJe) {
			totalPri = totalPriDebit > 0 ? totalPriDebit : totalPriCredit;
			totalSec = totalSecDebit > 0 ? totalSecDebit : totalSecCredit;
		} else if (frm.doctype === "Sales Invoice" || frm.doctype === "Purchase Invoice") {
			const finalAmount = flt(frm.doc.rounded_total) || flt(frm.doc.grand_total);
			const currency = getCurrency(frm);
			const rate = getRate(frm);
			const companyCurrency = frm.doc._primary_currency || frm.doc.company_currency;
			const secCurrency = frm.doc._secondary_currency;

			if (currency === secCurrency) {
				totalPri = rate > 1.0 ? finalAmount / rate : finalAmount * rate;
				totalSec = finalAmount;
			} else if (currency === companyCurrency) {
				totalPri = finalAmount;
				totalSec = rate > 1.0 ? finalAmount * rate : finalAmount / rate;
			} else {
				const rowExchangeRate = flt(frm.doc.conversion_rate) || 1.0;
				totalPri = finalAmount * rowExchangeRate;
				totalSec = rate > 1.0 ? totalPri * rate : totalPri / rate;
			}
		} else if (frm.doctype === "Payment Entry") {
			const finalAmount = flt(frm.doc.paid_amount) || flt(frm.doc.received_amount) || totalPri;
			const currency = frm.doc.payment_type === "Pay"
				? (frm.doc.paid_from_account_currency || getCurrency(frm))
				: (frm.doc.paid_to_account_currency || getCurrency(frm));
			const rate = getRate(frm);
			const companyCurrency = frm.doc._primary_currency || frm.doc.company_currency;
			const secCurrency = frm.doc._secondary_currency;

			if (currency === secCurrency) {
				totalPri = rate > 1.0 ? finalAmount / rate : finalAmount * rate;
				totalSec = finalAmount;
			} else if (currency === companyCurrency) {
				totalPri = finalAmount;
				totalSec = rate > 1.0 ? finalAmount * rate : finalAmount / rate;
			} else {
				const rowExchangeRate = flt(frm.doc.source_exchange_rate) || flt(frm.doc.target_exchange_rate) || 1.0;
				totalPri = finalAmount * rowExchangeRate;
				totalSec = rate > 1.0 ? totalPri * rate : totalPri / rate;
			}
		}

		const precision = frm.doc._secondary_currency_precision != null ? frm.doc._secondary_currency_precision : 2;
		const roundedSec = precision === 0 ? Math.round(totalSec) : flt(totalSec, precision);
		if (frappe.meta.has_field(frm.doctype, "custom_total_usd") && Math.abs(flt(frm.doc.custom_total_usd) - totalPri) > 0.001) {
			frm.set_value("custom_total_usd", totalPri);
		}
		if (frappe.meta.has_field(frm.doctype, "custom_total_lbp") && flt(frm.doc.custom_total_lbp) !== roundedSec) {
			frm.set_value("custom_total_lbp", roundedSec);
		}
	}

	function syncPaymentEntryAmounts(frm) {
		if (frm.doctype !== "Payment Entry" || frm.doc.payment_type === "Internal Transfer") return;

		const total = (frm.doc.references || []).reduce((sum, row) => sum + flt(row.allocated_amount), 0);
		if (total <= 0) return;

		if (!flt(frm.doc.paid_amount)) {
			frm.set_value("paid_amount", total);
		}
		if (!flt(frm.doc.received_amount)) {
			frm.set_value("received_amount", total);
		}
	}

	function attachEnterToAddRows(frm) {
		(transactionTables[frm.doctype] || []).forEach((tableField) => {
			const grid = frm.fields_dict[tableField] && frm.fields_dict[tableField].grid;
			if (!grid || !grid.wrapper) return;

			grid.wrapper.off("keydown.managely_enter_add_row");
			grid.wrapper.on("keydown.managely_enter_add_row", "input, textarea, select", function (event) {
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
				syncCompanyCurrencies(frm, () => {
					if (frm.doc._secondary_currency) {
						if (frm.is_new() && !frm.doc.custom_exchange_rate_override && frm.doc.company) {
							fetchLatestExchangeRate(frm.doc.company, (rate) => {
								if (!frm.doc.custom_exchange_rate_override && rate) {
									frm.set_value("custom_exchange_rate_override", rate);
									refreshDualCurrency(frm);
									recalculateStampTaxes(frm);
								}
							});
						}
						refreshDualCurrency(frm);
					}
				});

				attachEnterToAddRows(frm);

				// Add custom "Add Stamp" button to taxes grid if secondary currency exists
				if (frm.doctype === "Sales Invoice" || frm.doctype === "Purchase Invoice") {
					if (frm.fields_dict.taxes && frm.fields_dict.taxes.grid) {
						frm.fields_dict.taxes.grid.add_custom_button(__("Add Stamp"), function () {
							if (!frm.doc._secondary_currency) {
								frappe.msgprint(__("Secondary currency is not configured for this company."));
								return;
							}
							frappe.call({
								method: "frappe.client.get",
								args: { doctype: "Terminal Settings" },
								callback: function (r) {
									if (r.message && r.message.stamps) {
										const child_doctype = frm.doctype === "Sales Invoice" ? "Sales Taxes and Charges" : "Purchase Taxes and Charges";
										let added = false;
										r.message.stamps.forEach((setting) => {
											const exists = (frm.doc.taxes || []).some(
												(t) => t.account_head === setting.account && t.custom_is_stamp
											);
											if (!exists) {
												const row = frappe.model.add_child(frm.doc, child_doctype, "taxes");
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
											frappe.show_alert({ message: __("Stamps added successfully"), indicator: "green" });
										} else {
											frappe.show_alert({ message: __("Stamps are already in the table"), indicator: "orange" });
										}
									}
								},
							});
						});
					}
				}
			},
			company(frm) {
				syncCompanyCurrencies(frm, () => {
					if (frm.doc._secondary_currency) {
						fetchLatestExchangeRate(frm.doc.company, (rate) => {
							if (rate) frm.set_value("custom_exchange_rate_override", rate);
							refreshDualCurrency(frm);
							recalculateStampTaxes(frm);
						});
					} else {
						frm.set_value("custom_exchange_rate_override", 0);
					}
				});
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
			async validate(frm) {
				await reconcileTransactionExchangeRates(frm);
				refreshDualCurrency(frm);
				recalculateStampTaxes(frm);
			},
		});
	}

	async function reconcileTransactionExchangeRates(frm) {
		if (frm.doc.docstatus === 1 || !frm.doc.company) return;

		const companyCurrency = frm.doc._primary_currency || frm.doc.company_currency || (frm.doc.company ? erpnext.get_currency(frm.doc.company) : null);
		if (!companyCurrency) return;

		const postingDate = frm.doc.posting_date || frappe.datetime.nowdate();

		async function fetchRate(fromCurr) {
			if (!fromCurr || fromCurr === companyCurrency) return 1.0;
			const res = await frappe.call({
				method: "managely_terminal.managely_terminal.accounting.exchange_rate_utils.get_standard_erpnext_rate",
				args: {
					from_currency: fromCurr,
					to_currency: companyCurrency,
					transaction_date: postingDate,
					company: frm.doc.company
				}
			});
			return res.message ? flt(res.message) : null;
		}

		if (frm.doctype === "Payment Entry") {
			let changed = false;
			// Source side (paid_from)
			if (frm.doc.paid_from_account_currency) {
				const fromCurr = frm.doc.paid_from_account_currency;
				if (fromCurr === companyCurrency) {
					if (flt(frm.doc.source_exchange_rate) !== 1.0) {
						frm.doc.source_exchange_rate = 1.0;
						changed = true;
					}
				} else {
					const latest = await fetchRate(fromCurr);
					if (!latest || latest <= 0) {
						frappe.validated = false;
						frappe.throw(__("Exchange rate not found for {0} to {1}. Please configure under Accounts → Currency Exchange.", [fromCurr, companyCurrency]));
						return false;
					}
					if (!flt(frm.doc.source_exchange_rate) || flt(frm.doc.source_exchange_rate) === 1.0 || Math.abs(flt(frm.doc.source_exchange_rate) - latest) > 0.000001) {
						frm.doc.source_exchange_rate = latest;
						if (flt(frm.doc.paid_amount)) {
							frm.doc.base_paid_amount = flt(flt(frm.doc.paid_amount) * flt(latest), 2);
						}
						changed = true;
					}
				}
			}

			// Target side (paid_to)
			if (frm.doc.paid_to_account_currency) {
				const toCurr = frm.doc.paid_to_account_currency;
				if (toCurr === companyCurrency) {
					if (flt(frm.doc.target_exchange_rate) !== 1.0) {
						frm.doc.target_exchange_rate = 1.0;
						changed = true;
					}
				} else {
					const latest = await fetchRate(toCurr);
					if (!latest || latest <= 0) {
						frappe.validated = false;
						frappe.throw(__("Exchange rate not found for {0} to {1}. Please configure under Accounts → Currency Exchange.", [toCurr, companyCurrency]));
						return false;
					}
					if (!flt(frm.doc.target_exchange_rate) || flt(frm.doc.target_exchange_rate) === 1.0 || Math.abs(flt(frm.doc.target_exchange_rate) - latest) > 0.000001) {
						frm.doc.target_exchange_rate = latest;
						if (flt(frm.doc.received_amount)) {
							frm.doc.base_received_amount = flt(flt(frm.doc.received_amount) * flt(latest), 2);
						}
						changed = true;
					}
				}
			}

			if (changed) {
				if (typeof frm.set_difference_amount === "function") {
					frm.set_difference_amount();
				}
				frm.refresh_fields(["source_exchange_rate", "base_paid_amount", "target_exchange_rate", "base_received_amount", "difference_amount"]);
			}
		} else if (frm.doctype === "Journal Entry") {
			let changed = false;
			let hasForeign = false;

			for (const row of (frm.doc.accounts || [])) {
				const rowCurr = row.account_currency;
				if (!rowCurr) continue;
				if (rowCurr === companyCurrency) {
					if (flt(row.exchange_rate) !== 1.0) {
						row.exchange_rate = 1.0;
						if (flt(row.debit_in_account_currency)) row.debit = flt(row.debit_in_account_currency);
						if (flt(row.credit_in_account_currency)) row.credit = flt(row.credit_in_account_currency);
						changed = true;
					}
				} else {
					hasForeign = true;
					const latest = await fetchRate(rowCurr);
					if (!latest || latest <= 0) {
						frappe.validated = false;
						frappe.throw(__("Row #{0}: Exchange rate not found for currency {1} to {2}. Please configure under Accounts → Currency Exchange.", [row.idx, rowCurr, companyCurrency]));
						return false;
					}
					if (!flt(row.exchange_rate) || flt(row.exchange_rate) === 1.0 || Math.abs(flt(row.exchange_rate) - latest) > 0.000001) {
						row.exchange_rate = latest;
						if (flt(row.debit_in_account_currency)) {
							row.debit = flt(flt(row.debit_in_account_currency) * flt(latest), 2);
						}
						if (flt(row.credit_in_account_currency)) {
							row.credit = flt(flt(row.credit_in_account_currency) * flt(latest), 2);
						}
						changed = true;
					}
				}
			}

			if (hasForeign && !frm.doc.multi_currency) {
				frm.doc.multi_currency = 1;
				frm.refresh_field("multi_currency");
			}

			if (changed) {
				frm.doc.total_debit = flt((frm.doc.accounts || []).reduce((acc, r) => acc + flt(r.debit), 0), 2);
				frm.doc.total_credit = flt((frm.doc.accounts || []).reduce((acc, r) => acc + flt(r.credit), 0), 2);
				frm.doc.difference = flt(frm.doc.total_debit - frm.doc.total_credit, 2);
				frm.refresh_fields(["accounts", "total_debit", "total_credit", "difference"]);
			}
		} else if (frm.doctype === "Sales Invoice" || frm.doctype === "Purchase Invoice") {
			const invCurr = frm.doc.currency || companyCurrency;
			if (invCurr === companyCurrency) {
				if (flt(frm.doc.conversion_rate) !== 1.0) {
					frm.doc.conversion_rate = 1.0;
					frm.refresh_field("conversion_rate");
				}
			} else {
				const latest = await fetchRate(invCurr);
				if (!latest || latest <= 0) {
					frappe.validated = false;
					frappe.throw(__("Exchange rate not found for invoice currency {0} to {1}. Please configure under Accounts → Currency Exchange.", [invCurr, companyCurrency]));
					return false;
				}
				if (!flt(frm.doc.conversion_rate) || flt(frm.doc.conversion_rate) === 1.0 || Math.abs(flt(frm.doc.conversion_rate) - latest) > 0.000001) {
					frm.doc.conversion_rate = latest;
					frm.refresh_field("conversion_rate");
				}
			}
		}
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
		account(frm, cdt, cdn) {
			const row = locals[cdt][cdn];
			if (!row) return;
			setTimeout(() => {
				setDualCurrencyValues(frm, row);
				refreshDualCurrency(frm);
			}, 300);
		},
		exchange_rate(frm, cdt, cdn) {
			setRowDualCurrency(frm, cdt, cdn);
			refreshDualCurrency(frm);
		},
		debit_in_account_currency: setRowDualCurrency,
		credit_in_account_currency: setRowDualCurrency,
		debit: setRowDualCurrency,
		credit: setRowDualCurrency,
	});

	function setRowDualCurrency(frm, cdt, cdn) {
		setDualCurrencyValues(frm, locals[cdt][cdn]);
	}

	["Sales Taxes and Charges", "Purchase Taxes and Charges"].forEach((childDt) => {
		frappe.ui.form.on(childDt, {
			custom_is_stamp(frm) {
				recalculateStampTaxes(frm);
			},
			custom_stamp_amount_lbp(frm) {
				recalculateStampTaxes(frm);
			},
		});
	});
})();
