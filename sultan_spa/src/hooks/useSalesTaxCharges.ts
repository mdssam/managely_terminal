// hooks/useTaxCategories.ts
import { useEffect, useState } from "react"
import { secureDbGet, secureDbSet, APP_CACHE_STORE } from "../services/offlineDB"
import { makeAPICall } from "../utils/apiUtils"

export interface TaxCategory {
  id: string
  name: string
  rate: number
  is_inclusive: boolean
  type: "inclusive" | "exclusive"
}

export function useSalesTaxCharges() {
  const [salesTaxCharges, setTaxCategories] = useState<TaxCategory[]>([])
  const [defaultTax, setDefaultTax] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTaxes = async () => {
      setIsLoading(true)

      const cacheKey = "cached_sales_tax_charges";
      if (typeof window !== "undefined" && !navigator.onLine) {
        try {
          const cached = await secureDbGet<{ data: TaxCategory[]; default: string | null }>(APP_CACHE_STORE, cacheKey);
          if (cached) {
            setTaxCategories(cached.data || []);
            setDefaultTax(cached.default || null);
            setIsLoading(false);
            return;
          }
        } catch (secErr) {
          console.error("Security check failed for cached taxes:", secErr);
        }
      }

      try {
        const res = await makeAPICall("/api/method/sultan.sultan.api.tax.get_sales_tax_categories", { timeout: 2000, retries: 0 })
        const data = await res.json()

        if (!data.message?.success) {
          throw new Error(data.message?.error || "Failed to fetch tax categories")
        }

        const categories = data.message.data || [];
        const defaultTx = data.message.default || null;
        setTaxCategories(categories)
        setDefaultTax(defaultTx)
        secureDbSet(APP_CACHE_STORE, cacheKey, { data: categories, default: defaultTx }).catch(() => {});
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.error("Error loading tax categories:", err);
        try {
          const cached = await secureDbGet<{ data: TaxCategory[]; default: string | null }>(APP_CACHE_STORE, cacheKey);
          if (cached) {
            setTaxCategories(cached.data || []);
            setDefaultTax(cached.default || null);
            setError(null);
          } else {
            setError(err.message)
          }
        } catch (secErr) {
          setError("Tamper verification failed or connection error");
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchTaxes()
  }, [])


  return { salesTaxCharges, defaultTax, isLoading, error }
}
