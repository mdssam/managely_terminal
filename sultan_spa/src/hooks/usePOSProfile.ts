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
  custom_hide_tax_in_cart?: number | boolean;
  custom_prices_include_vat?: number | boolean;
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
    const cacheKey = `cached_pos_profile_${profileName}`;

    // Read cache first (SWR pattern)
    if (typeof window !== 'undefined') {
      const cached = await dbGet<POSProfile>(APP_CACHE_STORE, cacheKey);
      if (cached) {
        setProfile(cached);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
    }

    if (typeof window !== 'undefined' && !navigator.onLine) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await makeAPICall(`/api/resource/POS Profile/${encodeURIComponent(profileName)}`, {
        timeout: 5000,
        retries: 1
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
      let cached: POSProfileOption[] | null = null;
      
      if (typeof window !== "undefined") {
        cached = await dbGet<POSProfileOption[]>(APP_CACHE_STORE, cacheKey);
        
        // Fallback 1: construct from cached POS details if empty
        if (!cached || cached.length === 0) {
          const cachedDetails = await dbGet<any>(APP_CACHE_STORE, 'cached_pos_details');
          const details = (cachedDetails && typeof cachedDetails === 'object' && 'data' in cachedDetails) ? cachedDetails.data : cachedDetails;
          if (details && details.name) {
            cached = [{ name: details.name, is_default: true }];
          }
        }
        
        // Fallback 2: construct from SQLite device config
        if (!cached || cached.length === 0) {
          try {
            const { readDeviceConfig } = await import('../services/sqliteClient');
            const devConfig = await readDeviceConfig();
            if (devConfig && (devConfig.pos_profile || devConfig.posProfile)) {
              cached = [{ name: devConfig.pos_profile || devConfig.posProfile, is_default: true }];
            }
          } catch {}
        }

        if (cached && cached.length > 0) {
          setProfiles(cached);
          setLoading(false);
        } else {
          setLoading(true);
        }
      }

      if (typeof window !== "undefined" && !navigator.onLine) {
        setLoading(false);
        return;
      }

      try {
        const response = await makeAPICall("/api/method/sultan.sultan.api.pos_profile.get_pos_profiles_for_user", {
          method: "GET",
          headers: {
            "Accept": "application/json",
          },
          credentials: "include",
          timeout: 5000,
          retries: 1
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
        if (cached && cached.length > 0) {
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

let cachedPOSDetails: POSDetails | null = null;
let activePOSDetailsPromise: Promise<POSDetails | null> | null = null;

export function usePOSDetails() {
  const [posDetails, setPOSDetails] = useState<POSDetails | null>(cachedPOSDetails)
  const [loading, setLoading] = useState(!cachedPOSDetails)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true;
    
    if (cachedPOSDetails) {
      if (isMounted) {
        setPOSDetails(cachedPOSDetails);
        setLoading(false);
      }
      return;
    }

    const fetchPOSDetails = async () => {
      const cacheKey = 'cached_pos_details';
      try {
        if (!cachedPOSDetails) {
          setLoading(true)
        }

        // Try reading from SQLite app_settings first
        let details = null;
        try {
          const { getPOSDetailsFromSQLite } = await import('../services/sqliteClient');
          details = await getPOSDetailsFromSQLite();
        } catch (sqliteErr) {
          console.warn('[usePOSProfile] Failed to read POS details from SQLite:', sqliteErr);
        }

        // Fallback to IndexedDB cache
        if (!details) {
          const cached = await dbGet<any>(APP_CACHE_STORE, cacheKey);
          if (cached) {
            details = (cached && typeof cached === 'object' && 'data' in cached) ? cached.data : cached;
          }
        }

        if (details && !cachedPOSDetails) {
          // Inject actual SQLite open session ID as the source of truth
          try {
            const { isElectron, dbSQLiteGetAll } = await import('../services/sqliteClient');
            if (isElectron) {
              const openLocalSessions = await dbSQLiteGetAll<any>('pos_sessions', "status = 'Open'");
              details = {
                ...details,
                current_opening_entry: openLocalSessions.length > 0 ? openLocalSessions[0].id : null
              };
            }
          } catch (e) {
            console.warn('[usePOSProfile] Failed to override cache details from SQLite:', e);
          }

          cachedPOSDetails = details;
          if (isMounted) {
            setPOSDetails(details);
            setLoading(false);
          }
          if (typeof window !== 'undefined' && !navigator.onLine) {
            return;
          }
        }

        if (!activePOSDetailsPromise) {
          activePOSDetailsPromise = (async () => {
            const response = await makeAPICall("/api/method/sultan.sultan.api.pos_profile.get_pos_details", {
              method: "GET",
              headers: {
                "Accept": "application/json",
              },
              credentials: "include",
              timeout: 5000,
              retries: 1
            });

            const data = await response.json()
            if (response.ok && data.message) {
              let details = data.message as POSDetails;
              
              // Inject actual SQLite open session ID as the source of truth
              try {
                const { isElectron, dbSQLiteGetAll } = await import('../services/sqliteClient');
                if (isElectron) {
                  const openLocalSessions = await dbSQLiteGetAll<any>('pos_sessions', "status = 'Open'");
                  details = {
                    ...details,
                    current_opening_entry: openLocalSessions.length > 0 ? openLocalSessions[0].id : null
                  };
                }
              } catch (err) {
                console.warn('[usePOSProfile] Failed to check local open sessions:', err);
              }

              if (details?.name && details.name !== 'System Default') {
                dbSet(APP_CACHE_STORE, cacheKey, details).catch(() => {});
                
                // Save to SQLite app_settings
                try {
                  const { savePOSDetailsToSQLite } = await import('../services/sqliteClient');
                  await savePOSDetailsToSQLite(details);
                } catch (sqliteSaveErr) {
                  console.warn('[usePOSProfile] Failed to save POS details to SQLite:', sqliteSaveErr);
                }
              }
              return details;
            } else {
              throw new Error(data._server_messages || "Failed to fetch POS details")
            }
          })();
        }

        const data = await activePOSDetailsPromise;
        if (data) {
          cachedPOSDetails = data;
          if (isMounted) {
            setPOSDetails(data);
            setError(null);
          }
        }
      } catch (err: unknown) {
        console.error("Error loading POS details:", err)
        const cached = await dbGet<any>(APP_CACHE_STORE, 'cached_pos_details');
        if (cached) {
          const details = (cached && typeof cached === 'object' && 'data' in cached) ? cached.data : cached;
          cachedPOSDetails = details;
          if (isMounted) {
            setPOSDetails(details);
            setError(null);
          }
        } else {
          if (isMounted) {
            setError(err instanceof Error ? err.message : "Unknown error")
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
        activePOSDetailsPromise = null;
      }
    }

    fetchPOSDetails()

    return () => {
      isMounted = false;
    }
  }, [])

  return { posDetails, loading, error }
}
