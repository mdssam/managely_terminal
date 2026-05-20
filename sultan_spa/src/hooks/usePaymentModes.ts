import { useEffect, useState } from "react";

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
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setModes(JSON.parse(cached));
          setIsLoading(false);
          return;
        }
      }

      try {
        const res = await fetch(`/api/method/sultan.sultan.api.payment.get_payment_modes?pos_profile=${encodeURIComponent(posProfile)}`);
        const data = await res.json();

        if (!data.message.success) {
          throw new Error(data.message.error || "Failed to fetch payment modes");
        }

        const modesData = data.message.data || [];
        setModes(modesData);
        setError(null);
        if (typeof window !== 'undefined') {
          localStorage.setItem(cacheKey, JSON.stringify(modesData));
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.error("Error fetching payment modes:", err);
        const cached = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
        if (cached) {
          setModes(JSON.parse(cached));
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
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setModes(JSON.parse(cached));
          setIsLoading(false);
          return;
        }
      }

      try {
        const res = await fetch(`/api/method/sultan.sultan.api.payment.get_opening_entry_payment_summary`);
        const data = await res.json();

        if (!data.message.data) {
          throw new Error(data.message.error || "Failed to fetch payment modes");
        }

        const modesData = data.message.data || [];
        setModes(modesData);
        setError(null);
        if (typeof window !== 'undefined') {
          localStorage.setItem(cacheKey, JSON.stringify(modesData));
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.error("Error fetching opening entry payment summary:", err);
        const cached = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
        if (cached) {
          setModes(JSON.parse(cached));
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
