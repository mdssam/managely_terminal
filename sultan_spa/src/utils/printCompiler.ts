/**
 * printCompiler.ts
 * Utility to compile offline prints using cached compiled ERPNext templates.
 * Replaces values (Invoice Name, Customer, Date, Time, Totals) and dynamically
 * reconstructs the items table rows based on the original template row styling.
 */

export function compileOfflinePrintFormat(
  cachedHtml: string,
  oldInvoice: any,
  newInvoice: any
): string {
  let html = cachedHtml;
  if (!html) return "";
  
  // Safe fallbacks for missing/undefined invoice objects
  const oldInv = oldInvoice || {};
  const newInv = newInvoice || {};

  // Helper to escape regex special characters
  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Gather text replacements
  const textReplacements: { oldVal: string; newVal: string }[] = [];

  const addReplacement = (oldVal: any, newVal: any) => {
    if (oldVal !== undefined && oldVal !== null && newVal !== undefined && newVal !== null) {
      const oldStr = typeof oldVal === 'string' ? oldVal.trim() : String(oldVal).trim();
      const newStr = typeof newVal === 'string' ? newVal.trim() : String(newVal).trim();
      if (oldStr && newStr && oldStr !== newStr && !textReplacements.some(r => r.oldVal === oldStr)) {
        textReplacements.push({ oldVal: oldStr, newVal: newStr });
      }
    }
  };

  // Add key field replacements
  addReplacement(oldInv.name, newInv.name || newInv.id);
  addReplacement(oldInv.id, newInv.name || newInv.id);

  // Customer details
  addReplacement(oldInv.customer_name, newInv.customer_name || newInv.customer);
  addReplacement(oldInv.customer, newInv.customer_name || newInv.customer);

  // Totals mapping
  const oldGrandTotal = oldInv.grand_total ?? oldInv.totalAmount ?? oldInv.base_grand_total;
  const newGrandTotal = newInv.grand_total ?? newInv.totalAmount ?? newInv.base_grand_total;
  if (typeof oldGrandTotal === 'number' && typeof newGrandTotal === 'number') {
    addReplacement(oldGrandTotal.toFixed(2), newGrandTotal.toFixed(2));
  }

  const oldNetTotal = oldInv.net_total ?? oldInv.subtotal ?? oldInv.base_net_total;
  const newNetTotal = newInv.net_total ?? newInv.subtotal ?? newInv.base_net_total;
  if (typeof oldNetTotal === 'number' && typeof newNetTotal === 'number') {
    addReplacement(oldNetTotal.toFixed(2), newNetTotal.toFixed(2));
  }

  const oldTaxTotal = oldInv.total_taxes_and_charges ?? oldInv.taxAmount ?? 0;
  const newTaxTotal = newInv.total_taxes_and_charges ?? newInv.taxAmount ?? 0;
  if (typeof oldTaxTotal === 'number' && typeof newTaxTotal === 'number') {
    addReplacement(oldTaxTotal.toFixed(2), newTaxTotal.toFixed(2));
  }

  const oldDiscount = oldInv.discount_amount ?? oldInv.discountAmount ?? 0;
  const newDiscount = newInv.discount_amount ?? newInv.discountAmount ?? 0;
  if (typeof oldDiscount === 'number' && typeof newDiscount === 'number') {
    addReplacement(oldDiscount.toFixed(2), newDiscount.toFixed(2));
  }

  // Date and Time
  addReplacement(oldInv.posting_date || oldInv.date, newInv.posting_date || newInv.date);
  addReplacement(oldInv.posting_time || oldInv.time, newInv.posting_time || newInv.time);

  // Sort replacements by length descending to prevent substring mismatching
  textReplacements.sort((a, b) => b.oldVal.length - a.oldVal.length);

  // Apply basic text replacements
  textReplacements.forEach(({ oldVal, newVal }) => {
    const regex = new RegExp(escapeRegExp(oldVal), 'g');
    html = html.replace(regex, newVal);
  });

  // Re-render items table rows dynamically
  const oldItems = oldInv.items || [];
  const newItems = newInv.items || [];

  if (oldItems.length > 0 && newItems.length > 0) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Find the row corresponding to the first old item as a template
      const firstOldItem = oldItems[0];
      const firstOldItemName = firstOldItem.item_name || firstOldItem.item_code;

      const allRows = Array.from(doc.querySelectorAll('tr'));
      let itemRowTemplate: HTMLTableRowElement | null = null;
      let itemsTableBody: HTMLElement | null = null;

      for (const row of allRows) {
        if (
          row.textContent?.includes(firstOldItemName) ||
          (firstOldItem.item_code && row.textContent?.includes(firstOldItem.item_code))
        ) {
          itemRowTemplate = row;
          itemsTableBody = row.parentElement;
          break;
        }
      }

      if (itemRowTemplate && itemsTableBody) {
        // Collect all rows in this container that represent any old items to remove them
        const rowsToRemove: HTMLTableRowElement[] = [];
        for (const row of Array.from(itemsTableBody.querySelectorAll('tr'))) {
          const isOldItemRow = oldItems.some((item: any) => {
            const name = item.item_name || item.item_code;
            const code = item.item_code;
            return row.textContent?.includes(name) || (code && row.textContent?.includes(code));
          });
          if (isOldItemRow) {
            rowsToRemove.push(row);
          }
        }

        // Generate new rows from template
        const newRowsHtml: string[] = [];

        newItems.forEach((newItem: any) => {
          let rowHtml = itemRowTemplate!.outerHTML;

          const oldQty = firstOldItem.qty ?? firstOldItem.quantity ?? 1;
          const oldRate = firstOldItem.rate ?? firstOldItem.price ?? 0;
          const oldAmt = oldQty * oldRate;

          const newQty = newItem.qty ?? newItem.quantity ?? 1;
          const newRate = newItem.rate ?? newItem.price ?? 0;
          const newAmt = newQty * newRate;

           // Substitutions for item properties
          const itemReplacements = [
            { oldVal: String(firstOldItem.item_name || ''), newVal: String(newItem.item_name || newItem.item_code || '') },
            { oldVal: String(firstOldItem.item_code || ''), newVal: String(newItem.item_code || '') },
            { oldVal: String(oldQty), newVal: String(newQty) },
            { oldVal: typeof oldRate === 'number' ? oldRate.toFixed(2) : String(oldRate), newVal: typeof newRate === 'number' ? newRate.toFixed(2) : String(newRate) },
            { oldVal: typeof oldAmt === 'number' ? oldAmt.toFixed(2) : String(oldAmt), newVal: typeof newAmt === 'number' ? newAmt.toFixed(2) : String(newAmt) },
          ];

          // Sort descending by length
          itemReplacements.sort((a, b) => b.oldVal.length - a.oldVal.length);

          itemReplacements.forEach(({ oldVal, newVal }) => {
            if (oldVal && newVal) {
              const regex = new RegExp(escapeRegExp(oldVal), 'g');
              rowHtml = rowHtml.replace(regex, newVal);
            }
          });

          newRowsHtml.push(rowHtml);
        });

        // Swap rows inside document
        if (rowsToRemove.length > 0) {
          const parent = rowsToRemove[0].parentElement;
          const nextSibling = rowsToRemove[0].nextSibling;

          // Remove old rows
          rowsToRemove.forEach(row => row.remove());

          // Build temporary container for new parsed rows
          const tempDiv = doc.createElement('div');
          tempDiv.innerHTML = `<table><tbody>${newRowsHtml.join('')}</tbody></table>`;
          const newTrs = Array.from(tempDiv.querySelectorAll('tr'));

          newTrs.forEach(tr => {
            if (parent) {
              if (nextSibling) {
                parent.insertBefore(tr, nextSibling);
              } else {
                parent.appendChild(tr);
              }
            }
          });
        }

        html = doc.documentElement.outerHTML;
      }
    } catch (e) {
      console.error('[Offline Print Compiler] Template parsing failed:', e);
    }
  }

  return html;
}
