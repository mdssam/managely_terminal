import { refreshCSRFToken } from "../utils/csrf";

export interface CashTransaction {
  name: string;
  transaction_type: "Cash In" | "Cash Out";
  amount: number;
  description: string;
  mode_of_payment: string;
  posting_date: string;
  posting_time: string;
}

export interface CashTransactionSummary {
  cash_in: number;
  cash_out: number;
  net: number;
}

export interface CashIOConfig {
  installed: boolean;
  enabled: boolean;
  allowed_modes: string[];
}

async function csrf() {
  return (await refreshCSRFToken()) || (window as any).csrf_token || "";
}

export async function getCashIOConfig(posProfile?: string): Promise<CashIOConfig> {
  const params = posProfile ? `?pos_profile=${encodeURIComponent(posProfile)}` : "";
  const res = await fetch(
    `/api/method/sultan.sultan.api.cash_transaction.get_cash_io_config${params}`,
    { credentials: "include" }
  );
  const data = await res.json();
  const msg = data.message ?? data;
  return msg ?? { installed: false, enabled: false, allowed_modes: [] };
}

export async function createCashTransaction(
  transaction_type: "Cash In" | "Cash Out",
  amount: number,
  description: string,
  mode_of_payment: string,
  pos_session?: string
): Promise<{ success: boolean; name?: string; message?: string; error?: string }> {
  const token = await csrf();
  const res = await fetch("/api/method/sultan.sultan.api.cash_transaction.create_cash_transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": token },
    credentials: "include",
    body: JSON.stringify({ transaction_type, amount, description, mode_of_payment, pos_session }),
  });
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
  const res = await fetch(
    `/api/method/sultan.sultan.api.cash_transaction.get_cash_transactions${params}`,
    { credentials: "include" }
  );
  const data = await res.json();
  return data.message ?? data;
}
