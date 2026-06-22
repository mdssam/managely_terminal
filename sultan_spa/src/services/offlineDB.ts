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
export function sha256Fallback(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  const utf8 = unescape(encodeURIComponent(ascii));
  const bytes = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    bytes[i] = utf8.charCodeAt(i);
  }

  const l = bytes.length;
  const bitLen = l * 8;
  const paddingLen = (l % 64 < 56) ? (56 - l % 64) : (120 - l % 64);
  const paddedBytes = new Uint8Array(l + paddingLen + 8);
  paddedBytes.set(bytes);
  paddedBytes[l] = 0x80;

  const view = new DataView(paddedBytes.buffer);
  view.setUint32(paddedBytes.length - 4, bitLen & 0xffffffff);
  view.setUint32(paddedBytes.length - 8, Math.floor(bitLen / 0x100000000));

  for (let i = 0; i < paddedBytes.length; i += 64) {
    const w = new Uint32Array(64);
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4);
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let j = 0; j < 64; j++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + k[j] + w[j]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  return hash.map(val => (val >>> 0).toString(16).padStart(8, '0')).join('');
}

async function computeSignature(key: string, dataStr: string): Promise<string> {
  const inputStr = dataStr + key + "sultan-pos-obfuscation-salt-2026";
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(inputStr);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('[Crypto] subtle digest failed, falling back to JS SHA-256:', e);
    }
  }
  return sha256Fallback(inputStr);
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


