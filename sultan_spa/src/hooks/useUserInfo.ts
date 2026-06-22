import { useEffect, useState } from "react";
import { secureDbGet, secureDbSet, dbGet, AUTH_STORE, APP_CACHE_STORE } from "../services/offlineDB";

interface UserInfo {
  user: string;
  full_name: string;
  email: string;
  roles: string[];
  is_admin_user: boolean;
  admin_roles: string[];
  pos_profile: string | null;
  pos_profile_name: string | null;
}

interface UseUserInfoReturn {
  userInfo: UserInfo | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useUserInfo(): UseUserInfoReturn {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserInfo = async () => {
    setIsLoading(true);

    const cacheKey = "cached_user_info";
    if (typeof window !== "undefined" && !navigator.onLine) {
      const cached = await secureDbGet<UserInfo>(APP_CACHE_STORE, cacheKey);
      if (cached) {
        setUserInfo(cached);
        setIsLoading(false);
        return;
      }
    }

    try {
      const response = await fetch("/api/method/sultan.sultan.api.user.get_current_user_info", {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
        credentials: "include",
      });

      const data = await response.json();

      if (response.ok && data.message?.success) {
        // OVERRIDE with employee role if applicable
        const userData = await dbGet<any>(AUTH_STORE, "user_data");
        if (userData && userData.is_employee) {
          if (userData.role) {
            data.message.data.role = userData.role;
          }
          if (userData.full_name) {
            data.message.data.full_name = userData.full_name;
          }
        }

        setUserInfo(data.message.data);
        setError(null);
        secureDbSet(APP_CACHE_STORE, cacheKey, data.message.data).catch(() => {});
      } else {
        throw new Error(data.message?.error || "Failed to fetch user info");
      }
    } catch (err: any) {
      console.error("Error loading user info:", err);
      const cached = await secureDbGet<UserInfo>(APP_CACHE_STORE, cacheKey);
      if (cached) {
        setUserInfo(cached);
        setError(null);
      } else {
        setError(err.message || "Unknown error");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserInfo();
  }, []);

  return {
    userInfo,
    isLoading,
    error,
    refetch: fetchUserInfo,
  };
}
