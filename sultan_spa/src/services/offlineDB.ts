/**
 * offlineDB.ts
 * Central IndexedDB layer for Sultan POS.
 * Replaces ALL localStorage usage — supports auth, cart, caches, drafts, invoices, customers.
 */

const DB_NAME = 'sultan-pos-db';
const DB_VERSION = 2; // bumped from 1 → 2 to add new stores

// ─── Store names ──────────────────────────────────────────────────────────────
export const INVOICES_STORE    = 'offline_invoices';
export const CUSTOMERS_STORE   = 'offline_customers';
export const AUTH_STORE        = 'auth_store';      // replaces localStorage auth keys
export const APP_CACHE_STORE   = 'app_cache';       // replaces localStorage UI caches
export const DRAFT_STORE       = 'draft_invoices';  // replaces localStorage draft cache

let _db: IDBDatabase | null = null;

// ─── Open / init DB ───────────────────────────────────────────────────────────
export function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(req.error);
    req.onsuccess = () => { _db = req.result; resolve(_db!); };

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      // v1 stores (keep as-is)
      if (!db.objectStoreNames.contains(INVOICES_STORE))
        db.createObjectStore(INVOICES_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CUSTOMERS_STORE))
        db.createObjectStore(CUSTOMERS_STORE, { keyPath: 'id' });

      // v2 stores (new)
      if (!db.objectStoreNames.contains(AUTH_STORE))
        db.createObjectStore(AUTH_STORE);      // key-value: key = string
      if (!db.objectStoreNames.contains(APP_CACHE_STORE))
        db.createObjectStore(APP_CACHE_STORE); // key-value: key = string
      if (!db.objectStoreNames.contains(DRAFT_STORE))
        db.createObjectStore(DRAFT_STORE);     // key-value: key = string
    };
  });
}

// ─── Generic list helpers (for stores with keyPath) ───────────────────────────
export async function dbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror  = () => reject(req.error);
  });
}

export async function dbPut(store: string, item: object): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(item);
    req.onsuccess = () => resolve();
    req.onerror  = () => reject(req.error);
  });
}

export async function dbDelete(store: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror  = () => reject(req.error);
  });
}

export async function dbPutBatch(store: string, items: object[]): Promise<void> {
  if (!items.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    items.forEach(item => s.put(item));
    t.oncomplete = () => resolve();
    t.onerror    = () => reject(t.error);
  });
}

// ─── Key-value helpers (for AUTH_STORE, APP_CACHE_STORE, DRAFT_STORE) ─────────
export async function dbGet<T = unknown>(store: string, key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror  = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function dbSet(store: string, key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror  = () => reject(req.error);
    });
  } catch (e) {
    console.error('[IDB] dbSet failed:', store, key, e);
  }
}

export async function dbRemove(store: string, key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
      req.onsuccess = () => resolve();
      req.onerror  = () => reject(req.error);
    });
  } catch (e) {
    console.error('[IDB] dbRemove failed:', store, key, e);
  }
}

export async function dbClearStore(store: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).clear();
      req.onsuccess = () => resolve();
      req.onerror  = () => reject(req.error);
    });
  } catch (e) {
    console.error('[IDB] dbClearStore failed:', store, e);
  }
}

// ─── Zustand-compatible async storage adapter (replaces localStorage) ─────────
/**
 * Use this as the `storage` option in Zustand `persist()` middleware.
 * Always JSON-stringifies on write and JSON-parses on read so that
 * IndexedDB never sees non-cloneable values (functions, class instances…).
 * Example:
 *   persist(stateCreator, { name: 'my-store', storage: idbStorage })
 */
export const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const raw = await dbGet<unknown>(APP_CACHE_STORE, `zustand:${name}`);
    if (raw === null || raw === undefined) return null;
    // Already a string means it was stored stringified
    if (typeof raw === 'string') return raw;
    // Stored as object — re-stringify for Zustand
    try { return JSON.stringify(raw); } catch { return null; }
  },
  setItem: async (name: string, value: unknown): Promise<void> => {
    // Zustand v5 passes StorageValue<State> (object); v4 may pass a string.
    // Always stringify to guarantee only JSON-safe primitives reach IDB.
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return dbSet(APP_CACHE_STORE, `zustand:${name}`, serialized);
  },
  removeItem: async (name: string): Promise<void> => {
    return dbRemove(APP_CACHE_STORE, `zustand:${name}`);
  },
};

// ─── Cryptographic signature helper functions for tamper-proofing ──────────────
async function computeSignature(key: string, dataStr: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(dataStr + key + "sultan-pos-obfuscation-salt-2026");
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function secureDbSet(store: string, key: string, value: unknown): Promise<void> {
  try {
    const userData = await dbGet<any>(AUTH_STORE, "user_data");
    const userIdentifier = userData?.name || userData?.email || "anonymous";
    const dataStr = JSON.stringify(value);
    const signature = await computeSignature(userIdentifier, dataStr);
    const payload = {
      data: value,
      timestamp: Date.now(),
      signature
    };
    await dbSet(store, key, payload);
  } catch (e) {
    console.error('[IDB] secureDbSet failed:', store, key, e);
  }
}

export async function secureDbGet<T = unknown>(store: string, key: string): Promise<T | null> {
  try {
    const payload = await dbGet<{ data: T; timestamp: number; signature: string }>(store, key);
    if (!payload) return null;

    // Handle legacy unsigned cache seamlessly
    if (payload && typeof payload === 'object' && !('signature' in payload)) {
      return payload as unknown as T;
    }

    const userData = await dbGet<any>(AUTH_STORE, "user_data");
    const userIdentifier = userData?.name || userData?.email || "anonymous";
    const dataStr = JSON.stringify(payload.data);
    const expectedSignature = await computeSignature(userIdentifier, dataStr);

    if (payload.signature !== expectedSignature) {
      console.error(`[Security Check] Tampering detected in store "${store}" key "${key}"!`);
      
      // Log silently using dynamically imported logSecurityIncident to avoid circular dependency
      if (key !== "security_incidents_log") {
        import("../utils/securityIncidents").then(({ logSecurityIncident }) => {
          logSecurityIncident(
            "Database Tampered",
            `Tampering detected in store "${store}" under key "${key}". Signature mismatch.`
          );
        }).catch(err => console.error("Error logging database tampering:", err));
      }

      // Return null silently instead of throwing, so the cashier's modified data is ignored
      // and they are not alerted with error screens.
      return null;
    }

    return payload.data;
  } catch (e) {
    console.error('[IDB] secureDbGet verification failed:', store, key, e);
    return null;
  }
}

export async function findInvoiceInCache(invoiceId: string): Promise<any | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(APP_CACHE_STORE, 'readonly');
      const store = transaction.objectStore(APP_CACHE_STORE);
      const request = store.openCursor();
      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          const key = cursor.key as string;
          if (key.startsWith("zustand:sultan_invoices_cache_") || key.startsWith("sultan_invoices_cache_")) {
            const val = cursor.value;
            let parsed: any = val;
            if (typeof val === "string") {
              try { parsed = JSON.parse(val); } catch {}
            }
            const list = parsed?.invoices || parsed?.state?.invoices;
            if (Array.isArray(list)) {
              const found = list.find((inv: any) => inv.id === invoiceId || inv.name === invoiceId);
              if (found) {
                resolve(found);
                return;
              }
            }
          }
          cursor.continue();
        } else {
          resolve(null);
        }
      };
      request.onerror = () => {
        resolve(null);
      };
    });
  } catch (e) {
    console.error("Error searching cached invoices:", e);
    return null;
  }
}


