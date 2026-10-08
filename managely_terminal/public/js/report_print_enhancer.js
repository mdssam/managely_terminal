// =========================================================
// REPORT PRINT & LANDSCAPE ENHANCER (managely_terminal)
// Automatically enforces landscape orientation and auto-fit
// for reports with more than 8 columns (e.g. General Ledger).
// =========================================================

frappe.provide("managely_terminal");

(function () {
    // 1. Hook frappe.render_grid to enforce landscape for wide tables
    const original_render_grid = frappe.render_grid;
    if (typeof original_render_grid === "function") {
        frappe.render_grid = function (opts) {
            if (opts && opts.columns && opts.columns.length > 8) {
                opts.landscape = true;
                if (opts.print_settings) {
                    opts.print_settings.orientation = "Landscape";
                }
            }
            return original_render_grid.apply(this, arguments);
        };
    }

    // 2. Enhance print settings dialog for query reports
    const original_get_print_settings = frappe.ui.get_print_settings;
    if (typeof original_get_print_settings === "function") {
        frappe.ui.get_print_settings = function (pdf, callback, letter_head, pick_columns, has_filters) {
            const wrapped_callback = function (data) {
                if (pick_columns && pick_columns.length > 8 && (!data.orientation || data.orientation === "Portrait")) {
                    data.orientation = "Landscape";
                }
                if (data.with_letter_head && !data.letter_head) {
                    data.letter_head = "Sultan Bakery";
                }
                if (callback) {
                    callback(data);
                }
            };

            const dialog = original_get_print_settings.call(
                frappe.ui,
                pdf,
                wrapped_callback,
                letter_head || "Sultan Bakery",
                pick_columns,
                has_filters
            );

            // Pre-select Landscape if report columns > 8, and pre-select Letter Head
            if (dialog && typeof dialog.set_value === "function") {
                try {
                    if (pick_columns && pick_columns.length > 8) {
                        dialog.set_value("orientation", "Landscape");
                    }
                    dialog.set_value("with_letter_head", 1);
                    dialog.set_value("letter_head", "Sultan Bakery");
                } catch (e) {
                    // Ignore if field is not initialized yet
                }
            }

            return dialog;
        };
    }
})();
