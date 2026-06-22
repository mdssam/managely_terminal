import { useState, useEffect } from "react";
import type { SalesInvoice } from "../../types";
import { backgroundSyncService } from "../services/backgroundSyncService";
import { dbGet, AUTH_STORE, findInvoiceInCache } from "../services/offlineDB";

async function getOfflineCashier(data: any) {
  const user = await dbGet<{ full_name?: string; name?: string; email?: string }>(AUTH_STORE, "user_data");
  const currentUserName = user?.full_name || user?.name || user?.email || "";
  return {
    name: data.cashier_name || data.employee_name || data.customer?.owner || currentUserName || "Unknown",
    id:   data.cashier_id  || data.employee     || currentUserName || "Unknown",
  };
}

export function useInvoiceDetails(invoiceId: string | null) {
  const [invoice, setInvoice] = useState<SalesInvoice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) return;

    const fetchInvoice = async () => {
      setIsLoading(true);
      try {
        console.log("Fetching invoice details for:", invoiceId);

        if (invoiceId.startsWith("OFFLINE-") || (typeof window !== "undefined" && !navigator.onLine)) {
          const offlineList = backgroundSyncService.getOfflineInvoices();
          const found = offlineList.find(inv => inv.id === invoiceId);
          if (found) {
            const data = found.data;
            const offlineCashier = await getOfflineCashier(data);
            const transformed: SalesInvoice = {
              id: found.id,
              date: new Date(found.timestamp).toISOString().split("T")[0],
              time: new Date(found.timestamp).toLocaleTimeString("en-US", { hour12: false }),
              cashier: offlineCashier.name,
              cashierId: offlineCashier.id,
              customer: data.customer?.name || "Walk-in Customer",
              customerId: data.customer?.id || "",
              items: data.items.map((item: any) => ({
                id: item.item_code || item.id,
                item_code: item.item_code || item.id,
                item_name: item.name,
                qty: item.quantity || 1,
                rate: item.price,
                amount: (item.quantity || 1) * item.price,
              })),
              subtotal: data.subtotal || data.grandTotal,
              giftCardDiscount: 0,
              giftCardCode: "",
              taxAmount: data.taxAmount || 0,
              totalAmount: data.grandTotal,
              paymentMethod: data.paymentMethods?.[0]?.method || "-",
              payment_methods: data.paymentMethods || [],
              amountPaid: data.amountPaid || data.grandTotal,
              changeGiven: 0,
              status: "Pending",
              refundAmount: 0,
              custom_zatca_submit_status: "Pending",
              currency: data.currency || (typeof window !== 'undefined' ? sessionStorage.getItem('pos_currency') : null) || "",
              notes: "Offline Order - Pending Sync",
              posProfile: data.posProfile || "",
              custom_pos_opening_entry: "",
              canReturn: false,
            };
            setInvoice(transformed);
            setIsLoading(false);
            return;
          }

          // Fallback to searching the cached list of invoices
          const cachedInvoice = await findInvoiceInCache(invoiceId);
          if (cachedInvoice) {
            setInvoice(cachedInvoice);
            setIsLoading(false);
            return;
          }
        }

        const response = await fetch(`/api/method/sultan.sultan.api.sales_invoice.get_invoice_details?invoice_id=${invoiceId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          credentials: 'include'
        });

        console.log('Invoice details response:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const resData = await response.json();
        console.log("Invoice details data:", resData);

        if (!resData.message || !resData.message.success) {
          throw new Error(resData.message?.error || resData.error || "Failed to fetch invoice");
        }

        setInvoice(resData.message.data);
      } catch (err: unknown) {
        console.error("Error fetching invoice details:", err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Unknown error");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvoice();
  }, [invoiceId]);

  return { invoice, isLoading, error };
}
