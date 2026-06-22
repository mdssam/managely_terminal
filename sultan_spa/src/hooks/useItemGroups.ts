import { useEffect, useState } from "react";
import { dbGet, dbSet, APP_CACHE_STORE } from "../services/offlineDB";
import { makeAPICall } from "../utils/apiUtils";

const CACHE_KEY = 'sultan_categories_cache';

interface ItemGroup {
  id: string;
  name: string;
  parent?: string;
  icon?: string;
  count?: number;
}

interface UseItemGroupsReturn {
  itemGroups: ItemGroup[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  count: number;
  total_item_count: number;
}

export function useItemGroups(): UseItemGroupsReturn {
  const [itemGroups, setItemGroups]       = useState<ItemGroup[]>([]);
  const [isLoading, setIsLoading]         = useState<boolean>(true);
  const [errorMessage, setErrorMessage]   = useState<string | null>(null);
  const [totalItemCount, setTotalItemCount] = useState<number>(0);

  const fetchItemGroups = async () => {
    setIsLoading(true);

    if (!navigator.onLine) {
      const cached = await dbGet<{ groups: ItemGroup[]; total_items: number }>(APP_CACHE_STORE, CACHE_KEY);
      if (cached) {
        console.log(`[Offline POS] Loading ${cached.groups.length} categories from IndexedDB...`);
        setItemGroups(cached.groups);
        setTotalItemCount(cached.total_items);
        setIsLoading(false);
        return;
      }
    }

    try {
      const response = await makeAPICall(`/api/method/sultan.sultan.api.item.get_item_groups_for_pos`, { timeout: 2000, retries: 0 });
      const resData = await response.json();

      if (
        resData?.message &&
        Array.isArray(resData.message.groups) &&
        typeof resData.message.total_items === "number"
      ) {
        setItemGroups(resData.message.groups);
        setTotalItemCount(resData.message.total_items);
        await dbSet(APP_CACHE_STORE, CACHE_KEY, {
          groups:      resData.message.groups,
          total_items: resData.message.total_items,
        });
      } else {
        throw new Error("Invalid response format");
      }
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Error fetching item groups:", error);

      const cached = await dbGet<{ groups: ItemGroup[]; total_items: number }>(APP_CACHE_STORE, CACHE_KEY);
      if (cached) {
        console.log(`[Offline POS Fallback] Loading ${cached.groups.length} categories from IndexedDB...`);
        setItemGroups(cached.groups);
        setTotalItemCount(cached.total_items);
        setErrorMessage(null);
        return;
      }

      setErrorMessage(error.message || "Unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItemGroups();
  }, []);

  return {
    itemGroups,
    isLoading,
    total_item_count: totalItemCount,
    error: errorMessage,
    refetch: fetchItemGroups,
    count: itemGroups.length,
  };
}
