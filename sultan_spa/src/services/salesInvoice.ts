
import { extractErrorMessage } from "../utils/errorExtraction";
import { refreshCSRFToken } from "../utils/csrf";
import { backgroundSyncService } from "./backgroundSyncService";
import { dbGet, AUTH_STORE } from "./offlineDB";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOfflineCashier(data: any) {
  const user = await dbGet<{ full_name?: string; name?: string; email?: string }>(AUTH_STORE, "user_data");
  const currentUserName = user?.full_name || user?.name || user?.email || "";

  const cashierName =
    data.cashier_name ||
    data.employee_name ||
    data.customer?.owner ||
    currentUserName ||
    "Unknown";

  const cashierId = data.cashier_id || data.employee || currentUserName || "Unknown";

  return { cashierName, cashierId };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createDraftSalesInvoice(data: any) {
  const csrfToken = await refreshCSRFToken() || window.csrf_token;
  const response = await fetch('/api/method/sultan.sultan.api.sales_invoice.create_draft_invoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': csrfToken
    },
    body: JSON.stringify({ data }),
    credentials: 'include'
  });

  const result = await response.json();

  if (!response.ok || !result.message || result.message.success === false) {
    const errorMessage = result.message?.message || result.message?.error || extractErrorMessage(result, 'Failed to create invoice');
    throw new Error(errorMessage);
  }

  return result.message;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createSalesInvoice(data: any) {
  if (!navigator.onLine) {
    console.log('[Offline Detection] Browser is offline. Saving invoice to offline sync queue...', data);
    const offlineInv = backgroundSyncService.saveOfflineInvoice(data);
    const { cashierName, cashierId } = await getOfflineCashier(data);

    // Return a mock success message structured identically to the real backend payload
    return {
      success: true,
      message: 'Payment queued offline successfully!',
      invoice: {
        name: offlineInv.id,
        posting_date: new Date().toISOString().split('T')[0],
        posting_time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        cashier_name: cashierName,
        owner: cashierId,
        customer_name: data.customer?.name || 'Walk-in Customer',
        customer: data.customer?.id || '',
        items: data.items.map((item: any) => ({
          item_code: item.item_code || item.id,
          item_name: item.name,
          qty: item.quantity || 1,
          rate: item.price,
          amount: (item.quantity || 1) * item.price,
        })),
        base_grand_total: data.grandTotal,
        base_rounded_total: data.grandTotal,
        change_amount: 0,
        mode_of_payment: data.paymentMethods?.[0]?.method || 'Cash',
        payment_methods: data.paymentMethods || [],
        remarks: 'Offline Transaction (Pending Sync)',
        status: 'Pending',
        pos_profile: data.posProfile || '',
      }
    };
  }

  const csrfToken = await refreshCSRFToken() || window.csrf_token;

  try {
    const response = await fetch('/api/method/sultan.sultan.api.sales_invoice.create_and_submit_invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ data }),
      credentials: 'include'
    });

    const result = await response.json();

    if (!response.ok || !result.message || result.message.success === false) {
      const errorMessage = extractErrorMessage(result, 'Failed to create invoice');
      throw new Error(errorMessage);
    }

    return result.message;
  } catch (err: any) {
    // Network error (e.g. LAN connected but no internet) — queue offline
    if (err instanceof TypeError && err.message.includes('fetch')) {
      console.log('[Offline Detection] Network unavailable. Saving invoice to offline sync queue...', data);
      const offlineInv = backgroundSyncService.saveOfflineInvoice(data);
      const { cashierName, cashierId } = await getOfflineCashier(data);
      return {
        success: true,
        message: 'Payment queued offline successfully!',
        invoice: {
          name: offlineInv.id,
          posting_date: new Date().toISOString().split('T')[0],
          posting_time: new Date().toLocaleTimeString('en-US', { hour12: false }),
          cashier_name: cashierName,
          owner: cashierId,
          customer_name: data.customer?.name || 'Walk-in Customer',
          customer: data.customer?.id || '',
          items: data.items.map((item: any) => ({
            item_code: item.item_code || item.id,
            item_name: item.name,
            qty: item.quantity || 1,
            rate: item.price,
            amount: (item.quantity || 1) * item.price,
          })),
          base_grand_total: data.grandTotal,
          base_rounded_total: data.grandTotal,
          change_amount: 0,
          mode_of_payment: data.paymentMethods?.[0]?.method || 'Cash',
          payment_methods: data.paymentMethods || [],
          remarks: 'Offline Transaction (Pending Sync)',
          status: 'Pending',
          pos_profile: data.posProfile || '',
        }
      };
    }
    throw err;
  }
}

export async function createSalesReturn(invoiceName: string) {
  const csrfToken = await refreshCSRFToken() || window.csrf_token;

  const response = await fetch('/api/method/sultan.sultan.api.sales_invoice.return_sales_invoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': csrfToken
    },
    body: JSON.stringify({ invoice_name: invoiceName }),
    credentials: 'include'
  });

  const result = await response.json();
  console.log("Return Invoice result:", result);

  if (!response.ok || !result.message || result.message.success === false) {
    const serverMsg = result._server_messages
      ? JSON.parse(result._server_messages)[0]
      : result.message?.message || 'Failed to return invoice';
    throw new Error(serverMsg);
  }

  return result.message;
}

export async function getInvoiceDetails(invoiceName: string) {
  try {
    // console.log('Fetching invoice details for:', invoiceName);
    const response = await fetch(`/api/method/sultan.sultan.api.sales_invoice.get_invoice_details?invoice_id=${invoiceName}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include'
    });

    const data = await response.json();
    // console.log('Invoice details response:', data);

    if (!response.ok || !data.message || data.message.success === false) {
      const errorMessage = data.message?.error || data.message?.message || 'Failed to get invoice details';
      throw new Error(errorMessage);
    }

    return {
      success: true,
      data: data.message
    };
          //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('Error getting invoice details:', error);
    return {
      success: false,
      error: error.message || 'Failed to get invoice details'
    };
  }
}

export async function deleteDraftInvoice(invoiceId: string) {
  const csrfToken = await refreshCSRFToken() || window.csrf_token;

  const response = await fetch('/api/method/sultan.sultan.api.sales_invoice.delete_draft_invoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': csrfToken
    },
    body: JSON.stringify({ invoice_id: invoiceId }),
    credentials: 'include'
  });

  const result = await response.json();
  // console.log("Delete invoice result:", result);

  if (!response.ok || !result.message || result.message.success === false) {
    const serverMsg = result._server_messages
      ? JSON.parse(result._server_messages)[0]
      : result.message?.error || 'Failed to delete invoice';
    throw new Error(serverMsg);
  }

  return result.message;
}

export async function getDraftInvoiceItems(invoiceId: string) {
  const response = await fetch(`/api/method/sultan.sultan.api.sales_invoice.get_invoice_details?invoice_id=${invoiceId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include'
  });

  const result = await response.json();
  // console.log("Draft invoice items result:", result);

  if (!response.ok || !result.message) {
    const errorMessage = extractErrorMessage(result, result.message?.error || 'Failed to fetch draft invoice items');
    throw new Error(errorMessage);
  }

  // The backend returns { success: true, data: { ... } }
  // We need to return the data part
  if (result.message.success && result.message.data) {
    return result.message.data;
  } else {
    throw new Error(result.message.error || 'Failed to fetch draft invoice items');
  }
}

export async function submitDraftInvoice(invoiceId: string) {
  const csrfToken = await refreshCSRFToken() || window.csrf_token;

  const response = await fetch('/api/method/sultan.sultan.api.sales_invoice.submit_draft_invoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': csrfToken
    },
    body: JSON.stringify({ invoice_id: invoiceId }),
    credentials: 'include'
  });

  const result = await response.json();
  console.log("Submit draft invoice result:", result);

  if (!response.ok || !result.message || result.message.success === false) {
    const errorMessage = extractErrorMessage(result, result.message?.error || 'Failed to submit draft invoice');
    throw new Error(errorMessage);
  }

  return result.message;
}

export async function getMyUnpaidDrafts() {
  const response = await fetch('/api/method/sultan.sultan.api.sales_invoice.get_my_unpaid_drafts', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include'
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message?.error || 'Failed to fetch my drafts');
  }

  return data.message?.data || [];
}
