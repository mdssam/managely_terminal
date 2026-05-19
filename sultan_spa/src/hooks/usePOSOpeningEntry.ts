

import { useEffect, useState, useCallback } from "react";

// HOOK 1: Check if POS Opening Entry Exists
export function usePOSOpeningStatus() {
  const [hasOpenEntry, setHasOpenEntry] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      if (typeof window !== 'undefined' && !navigator.onLine) {
        const cached = localStorage.getItem('cached_has_open_entry');
        if (cached !== null) {
          setHasOpenEntry(JSON.parse(cached));
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
        if (typeof window !== 'undefined') {
          localStorage.setItem('cached_has_open_entry', JSON.stringify(data.message));
        }
      } else {
        throw new Error("Unexpected response");
      }
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error("Error checking POS Opening Entry:", err);
      setError(err.message || "Failed to check opening entry status");
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
