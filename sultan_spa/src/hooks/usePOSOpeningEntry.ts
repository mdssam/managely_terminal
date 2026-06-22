

import { useEffect, useState, useCallback } from "react";
import { dbGet, dbSet, APP_CACHE_STORE } from "../services/offlineDB";

// HOOK 1: Check if POS Opening Entry Exists
export function usePOSOpeningStatus() {
  const [hasOpenEntry, setHasOpenEntry] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    const cacheKey = 'cached_has_open_entry';
    try {
      if (typeof window !== 'undefined' && !navigator.onLine) {
        const cached = await dbGet<boolean>(APP_CACHE_STORE, cacheKey);
        if (cached !== null) {
          setHasOpenEntry(cached);
        } else {
          setHasOpenEntry(true); // Default to true offline to bypass block
        }
        setIsLoading(false);
        return;
      }
      const res = await fetch("/api/method/sultan.sultan.api.pos_entry.open_pos");
      const data = await res.json();
      if (typeof data.message === "boolean") {
        setHasOpenEntry(data.message);
        dbSet(APP_CACHE_STORE, cacheKey, data.message).catch(() => {});
      } else {
        throw new Error("Unexpected response");
      }
    } catch (err: any) {
      console.error("Error checking POS Opening Entry:", err);
      const cached = await dbGet<boolean>(APP_CACHE_STORE, cacheKey);
      if (cached !== null) {
        setHasOpenEntry(cached);
      } else {
        setHasOpenEntry(true); // Default to true offline to bypass block
      }
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    hasOpenEntry,
    isLoading,
    error,
    refetch: fetchStatus,
  };
}
