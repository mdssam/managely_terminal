import { useState, useEffect } from 'react';
import { dbGet, dbSet, APP_CACHE_STORE } from '../services/offlineDB';

interface CustomerStatistics {
  total_orders: number;
  total_spent: number;
  last_visit: string | null;
}

interface UseCustomerStatisticsReturn {
  statistics: CustomerStatistics | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCustomerStatistics(customerId: string | null): UseCustomerStatisticsReturn {
  const [statistics, setStatistics] = useState<CustomerStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatistics = async () => {
    if (!customerId) {
      setStatistics(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const cacheKey = `cached_customer_stats_${customerId}`;
    if (typeof window !== "undefined" && !navigator.onLine) {
      const cached = await dbGet<CustomerStatistics>(APP_CACHE_STORE, cacheKey);
      setStatistics(cached ?? { total_orders: 0, total_spent: 0, last_visit: null });
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/method/sultan.sultan.api.customer.get_customer_statistics?customer_id=${encodeURIComponent(customerId)}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result?.message?.success) {
        setStatistics(result.message.data);
        await dbSet(APP_CACHE_STORE, cacheKey, result.message.data);
      } else {
        throw new Error(result?.message?.error || 'Failed to fetch customer statistics');
      }
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error('Error fetching customer statistics:', err);
      const cached = await dbGet<CustomerStatistics>(APP_CACHE_STORE, cacheKey);
      if (cached) {
        setStatistics(cached);
        setError(null);
      } else {
        setError(err.message || 'Failed to fetch customer statistics');
        setStatistics({ total_orders: 0, total_spent: 0, last_visit: null });
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatistics();
  }, [customerId]);

  return {
    statistics,
    isLoading,
    error,
    refetch: fetchStatistics,
  };
}
