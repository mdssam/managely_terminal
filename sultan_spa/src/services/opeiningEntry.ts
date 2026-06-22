import { useState } from "react";
import { extractErrorMessage } from "../utils/errorExtraction";
import { refreshCSRFToken } from "../utils/csrf";
import { dbGet, dbSet, APP_CACHE_STORE } from "../services/offlineDB";

// HOOK 2: Create POS Opening Entry
interface OpeningBalance {
  mode_of_payment: string;
  opening_amount: number;
}

interface EmployeeInfo { employee: string; employee_name: string }

interface UseCreateOpeningReturn {
  createOpeningEntry: (openingBalance: OpeningBalance[], posProfile?: string, employeeInfo?: EmployeeInfo) => Promise<void>;
  isCreating: boolean;
  error: string | null;
  success: boolean;
}

export function useCreatePOSOpeningEntry(): UseCreateOpeningReturn {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const createOpeningEntry = async (openingBalance: OpeningBalance[], posProfile?: string, employeeInfo?: EmployeeInfo) => {
    setIsCreating(true);
    setError(null);
    setSuccess(false);

    if (typeof window !== "undefined" && !navigator.onLine) {
      try {
        const offlineSessionId = "OFFLINE-OPE-" + Date.now();

        // 1. Save to offline_opening_entries queue
        const existingQueue = await dbGet<any[]>(APP_CACHE_STORE, "offline_opening_entries") || [];
        existingQueue.push({
          id: offlineSessionId,
          opening_balance: openingBalance,
          pos_profile: posProfile,
          employee: employeeInfo?.employee,
          employee_name: employeeInfo?.employee_name,
          timestamp: Date.now(),
        });
        await dbSet(APP_CACHE_STORE, "offline_opening_entries", existingQueue);

        // 2. Update cached_pos_details
        const cachedDetails = await dbGet<any>(APP_CACHE_STORE, "cached_pos_details") || {};
        cachedDetails.current_opening_entry = offlineSessionId;
        await dbSet(APP_CACHE_STORE, "cached_pos_details", cachedDetails);

        // 3. Update cached_has_open_entry
        await dbSet(APP_CACHE_STORE, "cached_has_open_entry", true);

        setSuccess(true);
      } catch (err: any) {
        console.error("Error creating offline POS Opening Entry:", err);
        setError(err.message || "Unexpected error occurred");
        throw err;
      } finally {
        setIsCreating(false);
      }
      return;
    }

    const csrfToken = await refreshCSRFToken() || window.csrf_token;

    try {
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestBody: any = { opening_balance: openingBalance };
      if (posProfile) requestBody.pos_profile = posProfile;
      if (employeeInfo) {
        requestBody.employee = employeeInfo.employee;
        requestBody.employee_name = employeeInfo.employee_name;
      }

      const res = await fetch("/api/method/sultan.sultan.api.pos_entry.create_opening_entry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          'X-Frappe-CSRF-Token': csrfToken
        },
        body: JSON.stringify(requestBody),
        credentials: "include"
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMessage = extractErrorMessage(data, "Failed to create opening entry");
        throw new Error(errorMessage);
      }

      if (data.message) {
        setSuccess(true);
      } else {
        throw new Error("Failed to create opening entry");
      }
            //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error("Error creating POS Opening Entry:", err);
      setError(err.message || "Unexpected error occurred");
      throw err;
    } finally {
      setIsCreating(false);
    }
  };

  return {
    createOpeningEntry,
    isCreating,
    error,
    success,
  };
}
