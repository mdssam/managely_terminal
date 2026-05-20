import { useState, useEffect } from "react";

export interface DeliveryPersonnel {
  name: string;
  delivery_personnel: string;
}

export function useDeliveryPersonnel() {
  const [personnel, setPersonnel] = useState<DeliveryPersonnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDeliveryPersonnel = async () => {
      const cacheKey = "cached_delivery_personnel";
      if (typeof window !== "undefined" && !navigator.onLine) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setPersonnel(JSON.parse(cached));
          setLoading(false);
          return;
        }
      }

      try {
        setLoading(true);
        const response = await fetch(
          "/api/method/sultan.sultan.api.delivery_personnel.get_delivery_personnel_list",
          {
            method: "GET",
            headers: {
              "Accept": "application/json",
            },
            credentials: "include",
          }
        );

        const data = await response.json();
        if (response.ok && data.message && data.message.success) {
          const list = data.message.data || [];
          setPersonnel(list);
          if (typeof window !== "undefined") {
            localStorage.setItem(cacheKey, JSON.stringify(list));
          }
        } else {
          throw new Error(data.message?.error || "Failed to fetch delivery personnel");
        }
      } catch (err: unknown) {
        console.error("Error loading delivery personnel:", err);
        const cached = typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null;
        if (cached) {
          setPersonnel(JSON.parse(cached));
        } else {
          setPersonnel([]);
        }
        setError(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDeliveryPersonnel();
  }, []);

  return { personnel, loading, error };
}
