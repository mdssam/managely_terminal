import { useFrappeGetDoc } from "frappe-react-sdk";
import { useEffect, useState } from "react"

interface PaymentMode {
  mode_of_payment: string;
  default?: 0 | 1;
}

interface POSProfile {
  name: string;
  company: string;
  warehouse: string;
  currency: string;
  write_off_account?: string;
  write_off_cost_center?: string;
  payment_methods?: PaymentMode[];
  default_customer?: {
    id: string;
    name: string;
    email: string;
    phone: string;
    customer_type: string;
    territory: string;
    customer_group: string;
    default_currency?: string;
  };
  // Add other POS Profile fields as needed
}

interface UsePOSProfileReturn {
  profile: POSProfile | null;
  paymentModes: PaymentMode[];
  defaultPaymentMode?: string;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function usePOSProfile(profileName: string): UsePOSProfileReturn {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useFrappeGetDoc<POSProfile>("POS Profile", profileName);

  const paymentModes = data?.payment_methods || [];
  const defaultPaymentMode = paymentModes.find(mode => mode.default === 1)?.mode_of_payment;

  return {
    profile: data || null,
    paymentModes,
    defaultPaymentMode,
    isLoading,
    error: error ? new Error(error.message) : null,
    refetch: mutate,
  };
}


interface POSProfileOption {
  name: string;
  is_default: boolean;
}

export function usePOSProfiles() {
  const [profiles, setProfiles] = useState<POSProfileOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPOSProfiles = async () => {
      const cacheKey = "cached_pos_profiles";
      if (typeof window !== "undefined" && !navigator.onLine) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setProfiles(JSON.parse(cached));
          setLoading(false);
          return;
        }
      }

      try {
        setLoading(true)

        const response = await fetch("/api/method/sultan.sultan.api.pos_profile.get_pos_profiles_for_user", {
          method: "GET",
          headers: {
            "Accept": "application/json",
          },
          credentials: "include",
        })

        const data = await response.json()
        if (response.ok && data.message) {
          setProfiles(data.message)
          if (typeof window !== "undefined") {
            localStorage.setItem(cacheKey, JSON.stringify(data.message));
          }
        } else {
          throw new Error(data._server_messages || "Failed to fetch POS Profiles")
        }
      } catch (err: unknown) {
        console.error("Error loading POS Profiles:", err)
        const cached = typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null;
        if (cached) {
          setProfiles(JSON.parse(cached));
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : "Unknown error")
        }
      } finally {
        setLoading(false)
      }
    }

    fetchPOSProfiles()
  }, [])

  return { profiles, loading, error }
}


export type POSDetails = {
  name?: string;
  currency?: string;
  currency_symbol?: string;
  is_zatca_enabled?: boolean;
  current_opening_entry?: string;
  business_type?: "B2B" | "B2C" | "B2B & B2C";
  hide_unavailable_items?: boolean;
  custom_use_scanner_fully?: boolean;
  custom_hide_expected_amount?: boolean;
  write_off_limit?: number;
  write_off_account?: string;
  write_off_cost_center?: string;
  custom_delivery_required?: number;
  allow_discount_change?: boolean;
  // extend with any other server-provided fields as needed
  [key: string]: unknown;
}

export function usePOSDetails() {
  const [posDetails, setPOSDetails] = useState<POSDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPOSDetails = async () => {
      try {
        setLoading(true)

        if (typeof window !== 'undefined' && !navigator.onLine) {
          const cached = localStorage.getItem('cached_pos_details');
          if (cached) {
            setPOSDetails(JSON.parse(cached));
            setLoading(false);
            return;
          }
        }

        const response = await fetch("/api/method/sultan.sultan.api.pos_profile.get_pos_details", {
          method: "GET",
          headers: {
            "Accept": "application/json",
          },
          credentials: "include",
        })

        const data = await response.json()
        if (response.ok && data.message) {
          setPOSDetails(data.message as POSDetails)
          if (typeof window !== 'undefined') {
            localStorage.setItem('cached_pos_details', JSON.stringify(data.message));
          }
        } else {
          throw new Error(data._server_messages || "Failed to fetch POS details")
        }
      } catch (err: unknown) {
        console.error("Error loading POS details:", err)
        const cached = typeof window !== 'undefined' ? localStorage.getItem('cached_pos_details') : null;
        if (cached) {
          setPOSDetails(JSON.parse(cached));
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : "Unknown error")
        }
      } finally {
        setLoading(false)
      }
    }

    fetchPOSDetails()
  }, [])

  return { posDetails, loading, error }
}
