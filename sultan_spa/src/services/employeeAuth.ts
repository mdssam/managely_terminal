import { refreshCSRFToken } from "../utils/csrf";

export interface EmployeeAuthResult {
  success: boolean;
  employee?: string;
  employee_name?: string;
  error?: string;
}

export async function verifyEmployeeLogin(
  username: string,
  password: string
): Promise<EmployeeAuthResult> {
  const token = (await refreshCSRFToken()) || (window as any).csrf_token || "";
  const res = await fetch(
    "/api/method/sultan.sultan.api.employee_auth.verify_employee_login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": token },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    }
  );
  const data = await res.json();
  return data.message ?? data;
}
