/**
 * Sultan Custom ERPNext POS Interceptor
 * Dynamically injects ingredient modifier logic into the standard POS.
 */

// ── One-time stale meta purge ────────────────────────────────────────────────
// Frappe caches form metadata in localStorage.  When we reposition custom
// fields the browser may still render the old layout.  This block runs once
// per session, clears every localStorage key that contains the affected
// doctype names, and forces a page reload so the fresh metadata is fetched.
(function purgeStaleMeta() {
    var VER = "sultan_meta_v9_pos_profile_js";
    if (sessionStorage.getItem(VER)) return;
    sessionStorage.setItem(VER, "1");
    try {
        Object.keys(localStorage).forEach(function (k) {
            if (
                k.indexOf("Sales Invoice") !== -1 ||
                k.indexOf("Purchase Invoice") !== -1 ||
                k.indexOf("sales_invoice") !== -1 ||
                k.indexOf("purchase_invoice") !== -1 ||
                k.indexOf("POS Profile") !== -1 ||
                k.indexOf("pos_profile") !== -1 ||
                k.indexOf("Multi Currency Payment") !== -1 ||
                k.indexOf("multi_currency_payment") !== -1
            ) {
                localStorage.removeItem(k);
            }
        });
    } catch (e) { /* ignore quota / security errors */ }
    // Reload so Frappe re-fetches fresh metadata from the server.
    window.location.reload(true);
})();
// ────────────────────────────────────────────────────────────────────────────

console.log("Sultan POS Interceptor loading...");

// ─── Shortcut Redirect: /app/sultan_pos → /sultan_spa/ ───────────────────────
// The ERPNext desk shortcut tries to render sultan_pos inline (via AJAX+eval),
// which throws a SyntaxError from the Jinja template. We intercept the route
// and hard-redirect to the SPA before the desk renderer gets a chance to eval.
(function interceptSultanPosRoute() {
  // If we're already being routed to sultan_pos, redirect now.
  function checkAndRedirect() {
    const hash = window.location.hash || "";
    const path = window.location.pathname || "";
    if (
      hash.includes("sultan_pos") ||
      path.endsWith("/sultan_pos") ||
      path.includes("/sultan_pos")
    ) {
      window.location.href = "/sultan_spa/";
      return true;
    }
    return false;
  }

  // Check immediately on load
  if (checkAndRedirect()) return;

  // Also intercept frappe.set_route and push_state calls before they fire
  if (typeof frappe !== "undefined") {
    if (frappe.router && frappe.router.push_state) {
      const _origPushState = frappe.router.push_state.bind(frappe.router);
      frappe.router.push_state = function(...args) {
        const route = (args[0] || "").toString();
        if (route.includes("sultan_pos")) {
          window.location.href = "/sultan_spa/";
          return;
        }
        return _origPushState.apply(this, args);
      };
    }

    if (frappe.set_route) {
      const _origSetRoute = frappe.set_route.bind(frappe);
      frappe.set_route = function(...args) {
        const route = (args[0] || "").toString();
        if (route.includes("sultan_pos")) {
          window.location.href = "/sultan_spa/";
          return Promise.resolve();
        }
        return _origSetRoute.apply(this, args);
      };
    }
  }

  // Listen for hashchange (Frappe desk uses hash routing)
  window.addEventListener("hashchange", checkAndRedirect);

  // Poll briefly on startup in case frappe isn't ready yet
  let pollCount = 0;
  const poll = setInterval(function() {
    if (checkAndRedirect()) { clearInterval(poll); return; }
    if (++pollCount > 20) clearInterval(poll);
  }, 200);
})();


// ─── ERPNext POS Controller Patch ────────────────────────────────────────────
(function() {
    const patchInterval = setInterval(() => {
        if (typeof erpnext !== "undefined" && erpnext.PointOfSale && erpnext.PointOfSale.Controller) {
            setup_sultan_pos_patch();
            clearInterval(patchInterval);
        }
    }, 500);
})();

function setup_sultan_pos_patch() {
    if (typeof erpnext === "undefined" || !erpnext.PointOfSale || !erpnext.PointOfSale.Controller) return;
    
    // Prevent double patching
    if (erpnext.PointOfSale.Controller.prototype.sultan_patched) return;
    erpnext.PointOfSale.Controller.prototype.sultan_patched = true;

    console.log("👑 Sultan POS Interceptor Activated - Patching Controller...");

    const original_on_cart_update = erpnext.PointOfSale.Controller.prototype.on_cart_update;

    // 1. Override the cart update method to intercept new item additions
    erpnext.PointOfSale.Controller.prototype.on_cart_update = async function(args) {
        let { item, field, value } = args;
        const self = this;

        // Run original core code to place item into cart first
        const result = await original_on_cart_update.apply(this, arguments);

        // If adding a new item row or changing it, and item details are present
        if (item && item.item_code && (!field || field === "qty")) {
            // Check if it's marked as Fresh Produce
            frappe.db.get_value("Item", item.item_code, "is_fresh_produce").then(r => {
                if (r && r.message && r.message.is_fresh_produce) {
                    // Launch Sultan Modifier Dialog!
                    launch_ingredient_dialog(item, self);
                }
            });
        }

        return result;
    };

    // 2. Override ItemSelector to intercept dynamic weighted barcodes (Delimited Format)
    const original_filter_items = erpnext.PointOfSale.ItemSelector.prototype.filter_items;

    erpnext.PointOfSale.ItemSelector.prototype.filter_items = function(args = {}) {
        const search_term = args.search_term || "";
        
        // Syntax: ITEM_CODE | BATCH | EXPIRY | WEIGHT
        // Example: "Steak|B-999|2026-12-31|2.35"
        if (search_term && search_term.includes('|')) {
            const parts = search_term.split('|');
            
            if (parts.length >= 2) {
                const item_code = parts[0].trim();
                const batch_no = parts[1].trim();
                const weight = parseFloat(parts[3]) || 1.0;
                
                // CRITICAL FIX: Kill any pending native ERPNext searches to prevent collisions
                if (this.last_search) clearTimeout(this.last_search);
                
                frappe.show_alert({
                    message: `⚖️ Smart Scan: ${item_code} (${weight} kg)`,
                    indicator: 'blue'
                });


                // 1. Resolve core item data by cloning EXACT logic used in native click events
                let resolvedItem = null;
                
                // Strategy A: Attempt to scrape dynamically from existing UI Tiles (100% guaranteed accuracy if visible!)
                const $domItem = $(`.item-wrapper[data-item-code="${escape(item_code)}"]`);
                
                if ($domItem.length > 0) {
                    console.log(`👑 DOM SCRAPE SUCCESS FOR ${item_code}`);
                    resolvedItem = {
                        price_list_rate: parseFloat(unescape($domItem.attr("data-rate"))) || 0,
                        uom: unescape($domItem.attr("data-uom")),
                        stock_uom: unescape($domItem.attr("data-stock-uom"))
                    };
                } 
                
                // Strategy B: Fallback to memory cache lookup if tile is scrolled out of view
                if (!resolvedItem || resolvedItem.price_list_rate === 0) {
                    const cachedItem = (this.items || []).find(i => i.item_code === item_code);
                    if (cachedItem) {
                        console.log(`👑 MEMORY CACHE HIT FOR ${item_code}`);
                        resolvedItem = cachedItem;
                    }
                }

                // 2. High-fidelity Dispatcher
                const dispatchEvent = (data) => {
                    this.events.item_selected({
                        field: "qty",
                        value: weight.toString(),
                        item: { 
                            item_code: item_code, 
                            batch_no: batch_no !== "" ? batch_no : undefined,
                            uom: data.uom || data.stock_uom,
                            rate: data.price_list_rate || data.standard_rate || 0,
                            stock_uom: data.stock_uom
                        }
                    });
                };

                // 3. Action Execution
                if (resolvedItem && (resolvedItem.price_list_rate || resolvedItem.standard_rate)) {
                    dispatchEvent(resolvedItem);
                } else {
                    console.log(`👑 FETCHING BACKEND RATES FOR ${item_code}...`);
                    frappe.call({
                        method: 'erpnext.selling.page.point_of_sale.point_of_sale.get_items',
                        args: {
                            search_term: item_code,
                            price_list: this.events.get_frm().doc.selling_price_list,
                            pos_profile: this.pos_profile,
                            page_length: 1
                        },
                        callback: (r) => {
                            if (r.message && r.message.items && r.message.items.length > 0) {
                                dispatchEvent(r.message.items[0]);
                            } else {
                                frappe.msgprint(`❌ Cannot load price for ${item_code}. Verify Item Price is set.`);
                            }
                        }
                    });
                }
                
                // 3. Clear the input SILENTLY to avoid triggering native 'input' event loop
                if (this.search_field && this.search_field.$input) {
                    this.search_field.$input.val(""); 
                }
                
                frappe.utils.play_sound("submit");
                return; // Completely halt the native search chain
            }
        }
        
        // Fallback to core search functionality
        return original_filter_items.apply(this, arguments);
    };
}

function launch_ingredient_dialog(item, controller) {
    // Create standard Frappe Dialog
    const d = new frappe.ui.Dialog({
        title: `👑 Customize: ${item.item_name || item.item_code}`,
        fields: [
            {
                label: 'Premium Add-ons',
                fieldname: 'addons',
                fieldtype: 'MultiCheck',
                options: [
                    { label: 'Extra Cheese (+1.50)', value: 'Extra Cheese' },
                    { label: 'Extra Patty (+2.50)', value: 'Extra Patty' },
                    { label: 'Premium Sauce (+0.50)', value: 'Extra Sauce' }
                ]
            },
            {
                label: 'Removals',
                fieldname: 'removals',
                fieldtype: 'MultiCheck',
                options: [
                    { label: 'Remove Onions', value: 'Remove Onions' },
                    { label: 'Remove Pickles', value: 'Remove Pickles' }
                ]
            }
        ],
        primary_action_label: 'Save Customization',
        primary_action(values) {
            const modifiers = [];
            
            if (values.addons && values.addons.length > 0) {
                values.addons.forEach(a => modifiers.push({ "item_code": a, "action": "add" }));
            }
            
            if (values.removals && values.removals.length > 0) {
                values.removals.forEach(r => modifiers.push({ "item_code": r, "action": "remove" }));
            }

            if (modifiers.length > 0) {
                // Save values to specific cart row
                const row = controller.get_item_from_frm(item);
                if (row) {
                    frappe.model.set_value(row.doctype, row.name, "custom_ingredients", JSON.stringify(modifiers))
                        .then(() => {
                            frappe.show_alert({
                                message: `Successfully customized ${item.item_code}`,
                                indicator: 'green'
                            });
                        });
                }
            }
            
            d.hide();
        }
    });

    d.show();
}
