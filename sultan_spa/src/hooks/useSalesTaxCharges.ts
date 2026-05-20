// hooks/useTaxCategories.ts
import { useEffect, useState } from "react"

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
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          setTaxCategories(parsed.data || []);
          setDefaultTax(parsed.default || null);
          setIsLoading(false);
          return;
        }
      }

      try {
        const res = await fetch("/api/method/sultan.sultan.api.tax.get_sales_tax_categories")
        const data = await res.json()

        if (!data.message?.success) {
          throw new Error(data.message?.error || "Failed to fetch tax categories")
        }

        const categories = data.message.data || [];
        const defaultTx = data.message.default || null;
        setTaxCategories(categories)
        setDefaultTax(defaultTx)
        if (typeof window !== "undefined") {
          localStorage.setItem(cacheKey, JSON.stringify({
            data: categories,
            default: defaultTx
          }));
        }
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.error("Error loading tax categories:", err);
        const cached = typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null;
        if (cached) {
          const parsed = JSON.parse(cached);
          setTaxCategories(parsed.data || []);
          setDefaultTax(parsed.default || null);
          setError(null);
        } else {
          setError(err.message)
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchTaxes()
  }, [])

  return { salesTaxCharges, defaultTax, isLoading, error }
}
