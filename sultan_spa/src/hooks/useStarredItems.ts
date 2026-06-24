import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY_PREFIX = "sultan_starred_items";

function getStorageKey(posProfile?: string): string {
  return posProfile ? `${STORAGE_KEY_PREFIX}_${posProfile}` : STORAGE_KEY_PREFIX;
}

function loadFromStorage(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed as string[]);
  } catch {
    // ignore
  }
  return new Set();
}

function saveToStorage(key: string, codes: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...codes]));
  } catch {
    // ignore
  }
}

interface UseStarredItemsReturn {
  starredCodes: Set<string>;
  isStarred: (itemCode: string) => boolean;
  toggleStar: (itemCode: string) => void;
  init: (posProfile: string) => void;
}

export function useStarredItems(): UseStarredItemsReturn {
  const [storageKey, setStorageKey] = useState<string>(STORAGE_KEY_PREFIX);
  const [starredCodes, setStarredCodes] = useState<Set<string>>(() =>
    loadFromStorage(STORAGE_KEY_PREFIX)
  );

  const init = useCallback((posProfile: string) => {
    const key = getStorageKey(posProfile);
    setStorageKey(key);
    setStarredCodes(loadFromStorage(key));
  }, []);

  const isStarred = useCallback(
    (itemCode: string) => starredCodes.has(itemCode),
    [starredCodes]
  );

  const toggleStar = useCallback(
    (itemCode: string) => {
      setStarredCodes((prev) => {
        const next = new Set(prev);
        if (next.has(itemCode)) {
          next.delete(itemCode);
        } else {
          next.add(itemCode);
        }
        saveToStorage(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  useEffect(() => {
    setStarredCodes(loadFromStorage(storageKey));
  }, [storageKey]);

  return { starredCodes, isStarred, toggleStar, init };
}
