import { useState } from "react";
import { extractErrorMessage } from "../utils/errorExtraction";
import { refreshCSRFToken } from "../utils/csrf";

// HOOK: Create POS Closing Entry
interface ClosingBalance {
  mode_of_payment: string;
  closing_amount: number;
}

interface UseCreateClosingReturn {
  createClosingEntry: (closingBalance: ClosingBalance[]) => Promise<void>;
  isCreating: boolean;
  error: string | null;
  success: boolean;
}

export function useCreatePOSClosingEntry(): UseCreateClosingReturn {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const createClosingEntry = async (closingBalance: ClosingBalance[]) => {
    setIsCreating(true);
    setError(null);
    setSuccess(false);
    const csrfToken = await refreshCSRFToken() || window.csrf_token;

    try {
      // console.log('Creating closing entry with:', closingBalance);

      const res = await fetch("/api/method/sultan.sultan.api.pos_entry.create_closing_entry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Frappe-CSRF-Token": csrfToken,
          "Accept": "application/json",
        },
        body: JSON.stringify({ closing_balance: closingBalance }),
        credentials: "include",
      });

      console.log('Closing entry response:', {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok
      });

      const data = await res.json();
      console.log('Closing entry data:', data);

      if (!res.ok) {
        const errorMessage = extractErrorMessage(data, `HTTP ${res.status}: ${res.statusText}`);
        throw new Error(errorMessage);
      }

      if (data.message) {
        setSuccess(true);
      } else {
        throw new Error("Failed to create closing entry");
      }
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error("Error creating POS Closing Entry:", err);
      setError(err.message || "Unexpected error occurred");
      throw err; // Re-throw to allow component to handle it
    } finally {
      setIsCreating(false);
    }
  };

  return {
    createClosingEntry,
    isCreating,
    error,
    success,
  };
}
