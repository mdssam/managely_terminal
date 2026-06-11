import { refreshCSRFToken } from "../utils/csrf";

async function csrf() {
  return (await refreshCSRFToken()) || (window as any).csrf_token || "";
}

export async function verifyPosPin(pin: string): Promise<{ success: boolean; no_pin_set?: boolean; error?: string }> {
  const token = await csrf();
  const res = await fetch("/api/method/sultan.sultan.api.pin_auth.verify_pos_pin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": token },
    credentials: "include",
    body: JSON.stringify({ pin }),
  });
  const data = await res.json();
  return data.message ?? data;
}

export async function setPosPin(pin: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const token = await csrf();
  const res = await fetch("/api/method/sultan.sultan.api.pin_auth.set_pos_pin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": token },
    credentials: "include",
    body: JSON.stringify({ pin }),
  });
  const data = await res.json();
  return data.message ?? data;
}

export async function hasPosPin(): Promise<boolean> {
  const res = await fetch("/api/method/sultan.sultan.api.pin_auth.has_pos_pin", { credentials: "include" });
  const data = await res.json();
  return (data.message ?? data)?.has_pin ?? false;
}
