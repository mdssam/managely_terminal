import { useEffect, useState } from "react"
import { useFrappeGetDoc } from "frappe-react-sdk";
import { dbGet, dbSet, APP_CACHE_STORE } from "../services/offlineDB"
import { makeAPICall } from "../utils/apiUtils"

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
  const [profile, setProfile] = useState<POSProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfile = async () => {
    if (!profileName) return;
    setIsLoading(true);
    const cacheKey = `cached_pos_profile_${profileName}`;

    // Read cache first if offline
    if (typeof window !== 'undefined' && !navigator.onLine) {
      const cached = await dbGet<POSProfile>(APP_CACHE_STORE, cacheKey);
      if (cached) {
        setProfile(cached);
        setIsLoading(false);
        return;
      }
    }

    try {
      const response = await makeAPICall(`/api/resource/POS Profile/${encodeURIComponent(profileName)}`, {
        timeout: 2000,
        retries: 0
      });
      const resData = await response.json();
      const profileData = resData.data;

      if (profileData) {
        setProfile(profileData);
        setError(null);
        await dbSet(APP_CACHE_STORE, cacheKey, profileData);
      } else {
        throw new Error("Invalid POS Profile data");
      }
    } catch (err: any) {
      console.error("Error loading POS Profile:", err);
      const cached = await dbGet<POSProfile>(APP_CACHE_STORE, cacheKey);
      if (cached) {
        setProfile(cached);
        setError(null);
      } else {
        setError(err instanceof Error ? err : new Error(err?.message || "Unknown error"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [profileName]);

  const paymentModes = profile?.payment_methods || [];
  const defaultPaymentMode = paymentModes.find(mode => mode.default === 1)?.mode_of_payment;

  return {
    profile,
    paymentModes,
    defaultPaymentMode,
    isLoading,
    error,
    refetch: fetchProfile
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
        const cached = await dbGet<POSProfileOption[]>(APP_CACHE_STORE, cacheKey);
        if (cached) {
          setProfiles(cached);
          setLoading(false);
          return;
        }
      }

      try {
        setLoading(true)

        const response = await makeAPICall("/api/method/sultan.sultan.api.pos_profile.get_pos_profiles_for_user", {
          method: "GET",
          headers: {
            "Accept": "application/json",
          },
          credentials: "include",
          timeout: 2000,
          retries: 0
        })

        const data = await response.json()
        if (response.ok && data.message) {
          setProfiles(data.message)
          dbSet(APP_CACHE_STORE, cacheKey, data.message).catch(() => {});
        } else {
          throw new Error(data._server_messages || "Failed to fetch POS Profiles")
        }
      } catch (err: unknown) {
        console.error("Error loading POS Profiles:", err)
        const cached = await dbGet<POSProfileOption[]>(APP_CACHE_STORE, cacheKey);
        if (cached) {
          setProfiles(cached);
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
  custom_pos_print_format_en?: string;
  custom_pos_print_format_ar?: string;
  [key: string]: unknown;
}

export function usePOSDetails() {
  const [posDetails, setPOSDetails] = useState<POSDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPOSDetails = async () => {
      const cacheKey = 'cached_pos_details';
      try {
        setLoading(true)

        if (typeof window !== 'undefined' && !navigator.onLine) {
          const cached = await dbGet<POSDetails>(APP_CACHE_STORE, cacheKey);
          if (cached) {
            setPOSDetails(cached);
            setLoading(false);
            return;
          }
        }

        const response = await makeAPICall("/api/method/sultan.sultan.api.pos_profile.get_pos_details", {
          method: "GET",
          headers: {
            "Accept": "application/json",
          },
          credentials: "include",
          timeout: 2000,
          retries: 0
        })

        const data = await response.json()
        if (response.ok && data.message) {
          setPOSDetails(data.message as POSDetails)
          // Don't cache the synthetic System Default placeholder — it lacks a real profile
          if (data.message?.name && data.message.name !== 'System Default') {
            dbSet(APP_CACHE_STORE, cacheKey, data.message).catch(() => {});
          }
        } else {
          throw new Error(data._server_messages || "Failed to fetch POS details")
        }
      } catch (err: unknown) {
        console.error("Error loading POS details:", err)
        const cached = await dbGet<POSDetails>(APP_CACHE_STORE, 'cached_pos_details');
        if (cached) {
          setPOSDetails(cached);
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
