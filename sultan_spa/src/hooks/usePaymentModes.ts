import { useEffect, useState } from "react";
import { dbGet, dbSet, APP_CACHE_STORE } from "../services/offlineDB";
import { makeAPICall } from "../utils/apiUtils";

interface PaymentMode {
  mode_of_payment: string;
  default: number;
  amount?: number;
  type?: string;
  account?: string;
  custom_currency?: string;
  name?: string;
  openingAmount?: number;
}

export function usePaymentModes(posProfile: string) {
  const [modes, setModes] = useState<PaymentMode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!posProfile) {
      return;
    }

    const fetchPaymentModes = async () => {
      setIsLoading(true);

      const cacheKey = `cached_payment_modes_${posProfile}`;
      if (typeof window !== 'undefined' && !navigator.onLine) {
        const cached = await dbGet<any>(APP_CACHE_STORE, cacheKey);
        if (cached) {
          const modesArray = Array.isArray(cached) ? cached : (cached.data || []);
          setModes(modesArray);
          setIsLoading(false);
          return;
        }
      }

      try {
        const res = await makeAPICall(`/api/method/sultan.sultan.api.payment.get_payment_modes?pos_profile=${encodeURIComponent(posProfile)}`, { timeout: 2000, retries: 0 });
        const data = await res.json();

        if (!data.message.success) {
          throw new Error(data.message.error || "Failed to fetch payment modes");
        }

        const modesData = data.message.data || [];
        setModes(modesData);
        setError(null);
        dbSet(APP_CACHE_STORE, cacheKey, modesData).catch(() => {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.error("Error fetching payment modes:", err);
        const cached = await dbGet<any>(APP_CACHE_STORE, cacheKey);
        if (cached) {
          const modesArray = Array.isArray(cached) ? cached : (cached.data || []);
          setModes(modesArray);
        } else {
          setModes([]);
        }
        setError(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPaymentModes();
  }, [posProfile]);

  return { modes, isLoading, error };
}

export function useAllPaymentModes() {
  const [modes, setModes] = useState<PaymentMode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPaymentModes = async () => {
      setIsLoading(true);

      const cacheKey = 'cached_opening_entry_payment_summary';
      if (typeof window !== 'undefined' && !navigator.onLine) {
        const cached = await dbGet<PaymentMode[]>(APP_CACHE_STORE, cacheKey);
        if (cached) {
          setModes(cached);
          setIsLoading(false);
          return;
        }
      }

      try {
        const res = await makeAPICall(`/api/method/sultan.sultan.api.payment.get_opening_entry_payment_summary`, { timeout: 2000, retries: 0 });
        const data = await res.json();

        if (!data.message.data) {
          throw new Error(data.message.error || "Failed to fetch payment modes");
        }

        const modesData = data.message.data || [];
        setModes(modesData);
        setError(null);
        dbSet(APP_CACHE_STORE, cacheKey, modesData).catch(() => {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.error("Error fetching opening entry payment summary:", err);
        const cached = await dbGet<PaymentMode[]>(APP_CACHE_STORE, cacheKey);
        if (cached) {
          setModes(cached);
          setError(null);
        } else {
          setError(err.message);
          setModes([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchPaymentModes();
  }, []);

  return { modes, isLoading, error };
}
