import erpnextAPI from "./erpnext-api";
import { dbGet, dbSet, APP_CACHE_STORE } from "./offlineDB";

export interface CashTransaction {
  name: string;
  transaction_type: "Cash In" | "Cash Out";
  amount: number;
  description: string;
  mode_of_payment: string;
  posting_date: string;
  posting_time: string;
  pos_session?: string;
  synced?: boolean;
}

export interface CashTransactionSummary {
  cash_in: number;
  cash_out: number;
  net: number;
}

export interface CashIOConfig {
  installed: boolean;
  enabled: boolean;
  allowed_modes: Array<{ name: string; currency: string; symbol: string }>;
}

export async function getCashIOConfig(posProfile?: string): Promise<CashIOConfig> {
  const cacheKey = `cash_io_config_${posProfile || "default"}`;
  
  if (typeof window !== "undefined" && !navigator.onLine) {
    const cached = await dbGet<CashIOConfig>(APP_CACHE_STORE, cacheKey);
    return cached ?? { installed: false, enabled: false, allowed_modes: [] };
  }

  try {
    const params = posProfile ? `?pos_profile=${encodeURIComponent(posProfile)}` : "";
    const res = await erpnextAPI.makeAPICall(
      `/api/method/sultan.sultan.api.cash_transaction.get_cash_io_config${params}`
    );
    const data = await res.json();
    const msg = data.message ?? data;
    const config = msg ?? { installed: false, enabled: false, allowed_modes: [] };
    
    // Cache the config for offline fallback
    if (config.enabled) {
      await dbSet(APP_CACHE_STORE, cacheKey, config);
    }
    
    return config;
  } catch (err) {
    const cached = await dbGet<CashIOConfig>(APP_CACHE_STORE, cacheKey);
    return cached ?? { installed: false, enabled: false, allowed_modes: [] };
  }
}

export async function createCashTransaction(
  transaction_type: "Cash In" | "Cash Out",
  amount: number,
  description: string,
  mode_of_payment: string,
  pos_session?: string
): Promise<{ success: boolean; name?: string; message?: string; error?: string }> {
  if (typeof window !== "undefined" && !navigator.onLine) {
    const offlineId = "OFFLINE-CASH-" + Date.now();
    const posting_date = new Date().toISOString().split("T")[0];
    const posting_time = new Date().toLocaleTimeString("en-US", { hour12: false });
    const newTx: CashTransaction = {
      name: offlineId,
      transaction_type,
      amount,
      description,
      mode_of_payment,
      pos_session,
      posting_date,
      posting_time,
      synced: false,
      timestamp: Date.now()
    };
    const existing = await dbGet<any[]>(APP_CACHE_STORE, "offline_cash_transactions") || [];
    existing.push(newTx);
    await dbSet(APP_CACHE_STORE, "offline_cash_transactions", existing);
    return { success: true, name: offlineId, message: `${transaction_type} of ${amount} recorded offline.` };
  }

  const res = await erpnextAPI.makeAPICall(
    "/api/method/sultan.sultan.api.cash_transaction.create_cash_transaction",
    {
      method: "POST",
      body: JSON.stringify({ transaction_type, amount, description, mode_of_payment, pos_session }),
    }
  );
  const data = await res.json();
  return data.message ?? data;
}

export async function getCashTransactions(opening_entry?: string): Promise<{
  success: boolean;
  data: CashTransaction[];
  summary: CashTransactionSummary;
  error?: string;
}> {
  const params = opening_entry ? `?opening_entry=${encodeURIComponent(opening_entry)}` : "";

  if (typeof window !== "undefined" && !navigator.onLine) {
    const offlineList = await dbGet<any[]>(APP_CACHE_STORE, "offline_cash_transactions") || [];
    const filtered = opening_entry
      ? offlineList.filter(t => t.pos_session === opening_entry)
      : offlineList;

    const cash_in = filtered.filter(t => t.transaction_type === "Cash In").reduce((sum, t) => sum + t.amount, 0);
    const cash_out = filtered.filter(t => t.transaction_type === "Cash Out").reduce((sum, t) => sum + t.amount, 0);

    return {
      success: true,
      data: filtered,
      summary: { cash_in, cash_out, net: cash_in - cash_out }
    };
  }

  try {
    const res = await erpnextAPI.makeAPICall(
      `/api/method/sultan.sultan.api.cash_transaction.get_cash_transactions${params}`
    );
    const data = await res.json();
    const result = data.message ?? data;

    // Merge any unsynced offline transactions
    const offlineList = await dbGet<any[]>(APP_CACHE_STORE, "offline_cash_transactions") || [];
    const unsynced = offlineList.filter(t => !t.synced && (!opening_entry || t.pos_session === opening_entry));
    if (unsynced.length > 0 && result.success) {
      const mergedData = [...result.data, ...unsynced];
      const cash_in = mergedData.filter(t => t.transaction_type === "Cash In").reduce((sum, t) => sum + t.amount, 0);
      const cash_out = mergedData.filter(t => t.transaction_type === "Cash Out").reduce((sum, t) => sum + t.amount, 0);
      return {
        success: true,
        data: mergedData,
        summary: { cash_in, cash_out, net: cash_in - cash_out }
      };
    }
    return result;
  } catch (err) {
    const offlineList = await dbGet<any[]>(APP_CACHE_STORE, "offline_cash_transactions") || [];
    const filtered = opening_entry
      ? offlineList.filter(t => t.pos_session === opening_entry)
      : offlineList;

    const cash_in = filtered.filter(t => t.transaction_type === "Cash In").reduce((sum, t) => sum + t.amount, 0);
    const cash_out = filtered.filter(t => t.transaction_type === "Cash Out").reduce((sum, t) => sum + t.amount, 0);

    return {
      success: true,
      data: filtered,
      summary: { cash_in, cash_out, net: cash_in - cash_out }
    };
  }
}

