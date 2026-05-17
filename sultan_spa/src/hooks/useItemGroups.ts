import { useEffect, useState } from "react";

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
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [totalItemCount, setTotalItemCount] = useState<number>(0); // <-- track total

  const fetchItemGroups = async () => {
    setIsLoading(true);

    if (!navigator.onLine) {
      const cached = localStorage.getItem('sultan_categories_cache');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          console.log(`[Offline POS] Loading ${parsed.groups.length} categories from cache...`);
          setItemGroups(parsed.groups);
          setTotalItemCount(parsed.total_items);
          setIsLoading(false);
          return;
        } catch (e) {
          console.error('[Offline POS] Failed to parse cached categories:', e);
        }
      }
    }

    try {
      const response = await fetch(`/api/method/sultan.sultan.api.item.get_item_groups_for_pos`);
      const resData = await response.json();

      if (
        resData?.message &&
        Array.isArray(resData.message.groups) &&
        typeof resData.message.total_items === "number"
      ) {
        setItemGroups(resData.message.groups);
        setTotalItemCount(resData.message.total_items);
        localStorage.setItem('sultan_categories_cache', JSON.stringify({
          groups: resData.message.groups,
          total_items: resData.message.total_items
        }));
      } else {
        throw new Error("Invalid response format");
      }
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Error fetching item groups:", error);

      const cached = localStorage.getItem('sultan_categories_cache');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          console.log(`[Offline POS Fallback] Loading ${parsed.groups.length} categories from cache...`);
          setItemGroups(parsed.groups);
          setTotalItemCount(parsed.total_items);
          setErrorMessage(null);
          return;
        } catch (e) {
          console.error('[Offline POS Fallback] Failed to parse cached categories:', e);
        }
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
    total_item_count: totalItemCount, // ✅ returned here
    error: errorMessage,
    refetch: fetchItemGroups,
    count: itemGroups.length,
  };
}
