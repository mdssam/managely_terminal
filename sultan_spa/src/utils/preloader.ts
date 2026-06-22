import { secureDbSet, APP_CACHE_STORE, dbGet, AUTH_STORE } from "../services/offlineDB";
import { makeAPICall } from "./apiUtils";
import type { MenuItem, SalesInvoice, SalesInvoiceItem } from "../../types";
import type { Customer } from "../types/customer";

export interface PreloadProgress {
  status: "idle" | "loading" | "success" | "error";
  step: string;
  percentage: number;
  errorMessage?: string;
}

export async function preloadOfflineDatabase(
  onProgress?: (progress: PreloadProgress) => void
): Promise<void> {
  const updateProgress = (step: string, percentage: number) => {
    console.log(`[Preloader] ${step} (${percentage}%)`);
    if (onProgress) {
      onProgress({ status: "loading", step, percentage });
    }
  };

  try {
    if (!navigator.onLine) {
      throw new Error("Cannot preload offline database: device is offline");
    }

    // ─── Step 1: User Info ──────────────────────────────────────────────────
    updateProgress("Fetching user permissions...", 10);
    const userInfoRes = await makeAPICall("/api/method/sultan.sultan.api.user.get_current_user_info", { timeout: 5000 });
    const userInfoData = await userInfoRes.json();
    if (!userInfoData?.message?.success) {
      throw new Error("Failed to fetch user permissions");
    }
    await secureDbSet(APP_CACHE_STORE, "cached_user_info", userInfoData.message.data);

    // ─── Step 2: POS Details ────────────────────────────────────────────────
    updateProgress("Fetching POS profile details...", 25);
    const posDetailsRes = await makeAPICall("/api/method/sultan.sultan.api.pos_profile.get_pos_details", { timeout: 5000 });
    const posDetailsData = await posDetailsRes.json();
    const posDetails = posDetailsData?.message;
    if (!posDetails) {
      throw new Error("Failed to fetch POS details");
    }
    
    // Cache POS details (ignore System Default synthetic value if present)
    if (posDetails.name && posDetails.name !== "System Default") {
      await secureDbSet(APP_CACHE_STORE, "cached_pos_details", posDetails);
      
      // Fetch POS Profile resource and Payment Modes based on this profile
      const posName = posDetails.name;
      
      updateProgress(`Fetching profile: ${posName}...`, 35);
      const posProfileRes = await makeAPICall(`/api/resource/POS Profile/${encodeURIComponent(posName)}`, { timeout: 5000 });
      const posProfileData = await posProfileRes.json();
      if (posProfileData?.data) {
        await secureDbSet(APP_CACHE_STORE, `cached_pos_profile_${posName}`, posProfileData.data);
      }

      updateProgress("Fetching payment modes...", 45);
      const paymentModesRes = await makeAPICall(
        `/api/method/sultan.sultan.api.payment.get_payment_modes?pos_profile=${encodeURIComponent(posName)}`,
        { timeout: 5000 }
      );
      const paymentModesData = await paymentModesRes.json();
      if (paymentModesData?.message?.success) {
        await secureDbSet(APP_CACHE_STORE, `cached_payment_modes_${posName}`, paymentModesData.message.data || []);
      }
    }

    // ─── Step 3: Tax Categories ─────────────────────────────────────────────
    updateProgress("Fetching VAT categories...", 55);
    const taxesRes = await makeAPICall("/api/method/sultan.sultan.api.tax.get_sales_tax_categories", { timeout: 5000 });
    const taxesData = await taxesRes.json();
    if (!taxesData?.message?.success) {
      throw new Error("Failed to fetch VAT categories");
    }
    await secureDbSet(APP_CACHE_STORE, "cached_sales_tax_charges", {
      data: taxesData.message.data || [],
      default: taxesData.message.default || null,
    });

    // ─── Step 4: Delivery Personnel ──────────────────────────────────────────
    updateProgress("Fetching delivery personnel...", 65);
    const deliveryRes = await makeAPICall(
      "/api/method/sultan.sultan.api.delivery_personnel.get_delivery_personnel_list",
      { timeout: 5000 }
    );
    const deliveryData = await deliveryRes.json();
    if (deliveryData?.message?.success) {
      await secureDbSet(APP_CACHE_STORE, "cached_delivery_personnel", deliveryData.message.data || []);
    }

    // ─── Step 5: Customers (Up to 1000) ──────────────────────────────────────
    updateProgress("Fetching customer database...", 75);
    const customersRes = await makeAPICall("/api/method/sultan.sultan.api.customer.get_customers?limit=1000", { timeout: 10000 });
    const customersData = await customersRes.json();
    if (customersData?.message?.success) {
      const rawCustomers = customersData.message.data || [];
      const mappedCustomers: Customer[] = rawCustomers.map((customer: any): Customer => ({
        id: customer.name,
        type: customer.customer_type === "Company" ? "company" : "individual",
        name: customer.customer_name || `Customer ${customer.name.slice(0, 5)}`,
        email: customer.contact?.email_id || "",
        phone: customer.contact?.mobile_no || customer.contact?.phone || "",
        address: {
          street: customer.address?.address_line1 || "",
          city: customer.address?.city || "",
          state: customer.address?.state || "",
          zipCode: customer.address?.pincode || "",
          country: customer.address?.country || ""
        },
        dateOfBirth: "",
        gender: "other",
        loyaltyPoints: 0,
        totalSpent: customer.custom_total_spent || 0,
        totalOrders: customer.custom_total_orders || 0,
        preferredPaymentMethod: "Cash",
        notes: "",
        tags: [],
        status: "active",
        createdAt: new Date().toISOString()
      }));
      await secureDbSet(APP_CACHE_STORE, "sultan_customers_cache", {
        data: mappedCustomers,
        totalCount: customersData.message.total_count || mappedCustomers.length
      });
    }

    // ─── Step 6: Products (Fetch all items recursively) ──────────────────────
    updateProgress("Syncing complete products catalog...", 85);
    const allProducts: MenuItem[] = [];
    let limit = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      updateProgress(`Syncing products (offset: ${offset})...`, 85 + Math.min(10, offset / 2000));
      const res = await makeAPICall(
        `/api/method/sultan.sultan.api.item.get_items_with_balance_and_price?limit=${limit}&offset=${offset}`,
        { timeout: 10000 }
      );
      if (!res.ok) {
        throw new Error(`HTTP Error fetching items: ${res.status}`);
      }
      const resData = await res.json();
      const message = resData?.message ?? resData;
      
      if (message && typeof message === 'object') {
        const maybeItems = message.items ?? message.data ?? message.results ?? resData.items;
        if (Array.isArray(maybeItems) && maybeItems.length > 0) {
          allProducts.push(...maybeItems);
          offset += maybeItems.length;
          hasMore = Boolean(message.has_more);
        } else {
          hasMore = false;
        }
      } else if (Array.isArray(message) && message.length > 0) {
        allProducts.push(...message);
        offset += message.length;
        hasMore = false;
      } else {
        hasMore = false;
      }
    }

    if (allProducts.length > 0) {
      await secureDbSet(APP_CACHE_STORE, "sultan_products_cache", {
        items: allProducts,
        total_count: allProducts.length,
        timestamp: Date.now()
      });
      console.log(`[Preloader] Successfully cached and signed ${allProducts.length} items.`);
    }

    // ─── Step 7: Cash Transactions (Last 14 Days) ──────────────────────────
    updateProgress("Syncing cash transactions (last 14 days)...", 90);
    try {
      const userData = await dbGet<any>(AUTH_STORE, "user_data");
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split("T")[0];
      const todayStr = new Date().toISOString().split("T")[0];
      const historyParams = new URLSearchParams();
      historyParams.append("from_date", fourteenDaysAgoStr);
      historyParams.append("to_date", todayStr);
      historyParams.append("time_range", "custom");
      if (userData?.is_employee) {
        historyParams.append("employee", userData.name || "");
      }

      const historyUrl = `/api/method/sultan.sultan.api.cash_transaction.get_cash_io_report_data?${historyParams.toString()}`;
      const cashRes = await makeAPICall(historyUrl, { timeout: 10000 });
      if (cashRes.ok) {
        const cashData = await cashRes.json();
        if (cashData?.message?.success) {
          const cashTxList = cashData.message.data || [];
          await secureDbSet(APP_CACHE_STORE, "cash_io_report_14_days", cashTxList);
          console.log(`[Preloader] Successfully cached ${cashTxList.length} cash transactions.`);
        }
      }
    } catch (cashErr) {
      console.warn("[Preloader] Failed to cache 14-day cash report history:", cashErr);
    }

    // ─── Step 8: Sales Invoices (Last 14 Days) ──────────────────────────────
    updateProgress("Syncing sales invoices (last 14 days)...", 95);
    try {
      const userData = await dbGet<any>(AUTH_STORE, "user_data");
      const employeeParam = userData?.is_employee ? `&employee=${encodeURIComponent(userData.name || "")}` : "";
      const posName = posDetails?.name;
      const posProfileParam = posName ? `&pos_profile=${encodeURIComponent(posName)}` : "";

      // Fetch last 500 invoices to cover 14 days
      const invoiceUrl = `/api/method/sultan.sultan.api.sales_invoice.get_sales_invoices?limit=500&start=0&skip_opening_entry_filter=true${posProfileParam}${employeeParam}`;
      const invRes = await makeAPICall(invoiceUrl, { timeout: 10000 });
      if (invRes.ok) {
        const invData = await invRes.json();
        if (invData?.message?.success) {
          const rawInvoices = invData.message.data || [];
          const totalCountFromAPI = invData.message.total_count || rawInvoices.length;

          const transformed: SalesInvoice[] = rawInvoices.map((invoice: any) => {
            const status = invoice.status as string;
            const items: SalesInvoiceItem[] = Array.isArray(invoice.items) ? invoice.items : [];
            let canReturn = true;
            if (status === "Credit Note Issued" || status === "Consolidated") {
              const itemsWithAvailableQty = items.filter((item: any) => (item.available_qty || 0) > 0);
              canReturn = itemsWithAvailableQty.length > 0;
            }

            return {
              id: invoice.name,
              date: invoice.posting_date || new Date().toISOString().split("T")[0],
              time: invoice.posting_time || "00:00:00",
              cashier: invoice.cashier_name,
              cashierId: invoice.owner || "",
              customer: invoice.customer_name || "",
              customerId: invoice.customer || "",
              items: items,
              subtotal:
                (Number(invoice.base_grand_total) || 0) -
                (Number(invoice.total_taxes_and_charges) || 0) +
                (Number(invoice.discount_amount) || 0),
              giftCardDiscount: Number(invoice.discount_amount) || 0,
              giftCardCode: String(invoice.discount_code) || "",
              taxAmount: Number(invoice.total_taxes_and_charges) || 0,
              totalAmount: Number(invoice.base_grand_total) || 0,
              paymentMethod: invoice.mode_of_payment || "-",
              payment_methods: invoice.payment_methods || [],
              amountPaid: Number(invoice.base_rounded_total) || 0,
              changeGiven: Number(invoice.change_amount) || 0,
              status: status || "Completed",
              refundAmount: status === "Refunded" ? Number(invoice.base_grand_total) || 0 : 0,
              custom_zatca_submit_status: invoice.custom_zatca_submit_status || "Draft",
              currency: invoice.currency || (typeof window !== 'undefined' ? sessionStorage.getItem('pos_currency') : null) || "",
              notes: invoice.remarks || "",
              posProfile: invoice.pos_profile || "",
              custom_pos_opening_entry: invoice.custom_pos_opening_entry || "",
              canReturn: canReturn,
              is_return: !!invoice.is_return,
            };
          });

          // Cache for the Invoice History page
          const cacheData = {
            invoices: transformed,
            totalCount: totalCountFromAPI,
            timestamp: Date.now(),
          };

          if (posName) {
            // For general invoice history
            await secureDbSet(APP_CACHE_STORE, `sultan_invoices_cache_true__false_${posName}`, cacheData);
            await secureDbSet(APP_CACHE_STORE, `sultan_invoices_cache_false__false_${posName}`, cacheData);
            
            // For dashboard views (submittedOnly=true)
            const submittedInvoices = transformed.filter(inv => inv.status !== "Draft" && inv.status !== "Cancelled");
            const submittedCacheData = {
              invoices: submittedInvoices,
              totalCount: submittedInvoices.length,
              timestamp: Date.now(),
            };
            await secureDbSet(APP_CACHE_STORE, `sultan_invoices_cache_true__true_${posName}`, submittedCacheData);
            await secureDbSet(APP_CACHE_STORE, `sultan_invoices_cache_false__true_${posName}`, submittedCacheData);
          }

          // General key without POS Profile fallback
          await secureDbSet(APP_CACHE_STORE, `sultan_invoices_cache_true__false_`, cacheData);
          await secureDbSet(APP_CACHE_STORE, `sultan_invoices_cache_false__false_`, cacheData);

          console.log(`[Preloader] Successfully cached ${transformed.length} invoices across history keys.`);
        }
      }
    } catch (invErr) {
      console.warn("[Preloader] Failed to cache 14-day invoices history:", invErr);
    }

    // ─── Step 9: Cashier Hashes (For Offline Login) ──────────────────────────
    updateProgress("Syncing cashier offline credentials...", 98);
    try {
      const posName = posDetails?.name;
      if (posName && posName !== "System Default") {
        const hashUrl = `/api/method/sultan.sultan.api.employee_auth.get_branch_employees_hashes?pos_profile=${encodeURIComponent(posName)}`;
        const hashRes = await makeAPICall(hashUrl, { timeout: 10000 });
        if (hashRes.ok) {
          const hashData = await hashRes.json();
          if (hashData?.message?.success) {
            const employeesList = hashData.message.data || [];
            await secureDbSet(APP_CACHE_STORE, "cached_branch_employees", employeesList);
            console.log(`[Preloader] Successfully cached ${employeesList.length} cashier offline credential hashes.`);
          }
        }
      }
    } catch (hashErr) {
      console.warn("[Preloader] Failed to cache cashier offline hashes:", hashErr);
    }

    // Done
    if (onProgress) {
      onProgress({ status: "success", step: "Database synchronization complete!", percentage: 100 });
    }
  } catch (error: any) {
    console.error("[Preloader] Preloading offline database failed:", error);
    if (onProgress) {
      onProgress({
        status: "error",
        step: "Failed to initialize offline database",
        percentage: 100,
        errorMessage: error.message || "Unknown preloading error"
      });
    }
    throw error;
  }
}
