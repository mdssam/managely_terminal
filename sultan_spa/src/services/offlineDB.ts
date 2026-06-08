const DB_NAME = 'sultan-pos-db';
const DB_VERSION = 1;

export const INVOICES_STORE = 'offline_invoices';
export const CUSTOMERS_STORE = 'offline_customers';

let _db: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { _db = req.result; resolve(_db!); };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(INVOICES_STORE))
        db.createObjectStore(INVOICES_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CUSTOMERS_STORE))
        db.createObjectStore(CUSTOMERS_STORE, { keyPath: 'id' });
    };
  });
}

export async function dbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function dbPut(store: string, item: object): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function dbDelete(store: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
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
    t.onerror = () => reject(t.error);
  });
}
