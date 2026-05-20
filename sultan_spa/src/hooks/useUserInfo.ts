import { useEffect, useState } from "react";

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
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setUserInfo(JSON.parse(cached));
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
        setUserInfo(data.message.data);
        setError(null);
        if (typeof window !== "undefined") {
          localStorage.setItem(cacheKey, JSON.stringify(data.message.data));
        }
      } else {
        throw new Error(data.message?.error || "Failed to fetch user info");
      }
    } catch (err: any) {
      console.error("Error loading user info:", err);
      const cached = typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null;
      if (cached) {
        setUserInfo(JSON.parse(cached));
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
