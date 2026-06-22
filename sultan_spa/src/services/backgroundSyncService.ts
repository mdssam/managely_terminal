import { dbGetAll, dbPut, dbDelete, dbPutBatch, dbGet, dbSet, INVOICES_STORE, CUSTOMERS_STORE, APP_CACHE_STORE, openDB } from './offlineDB';

interface SyncStatus {
  isOnline: boolean;
  lastSync: Date | null;
  pendingUpdates: number;
  isSyncing: boolean;
  isSyncingInvoices: boolean;
  lastSyncError: string | null;
}

interface StockUpdate {
  item_code: string;
  available: number;
  timestamp: number;
}

export interface OfflineInvoice {
  id: string;
  data: any;
  timestamp: number;
  synced: boolean;
  syncError?: string;
}

export interface OfflineCustomer {
  id: string;
  data: any;
  timestamp: number;
  synced: boolean;
  realId?: string;
}

class BackgroundSyncService {
  private isOnline = navigator.onLine;
  private lastSync: Date | null = null;
  private pendingUpdates = 0;
  private isSyncing = false;
  private isSyncingInvoices = false;
  private lastSyncError: string | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private listeners: Map<string, ((status: SyncStatus) => void)[]> = new Map();
  private stockUpdateQueue: StockUpdate[] = [];

  // In-memory caches — loaded from IndexedDB at startup, kept in sync on every write
  private invoiceCache: OfflineInvoice[] = [];
  private customerCache: OfflineCustomer[] = [];

  constructor() {
    this.setupEventListeners();
    this.startPeriodicSync();
    // Load from IndexedDB (migrating localStorage if needed), then trigger initial sync
    this.initFromDB().then(() => {
      this.updatePendingCount();
      if (this.isOnline) {
        this.syncOfflineInvoices();
        this.syncOfflineCashTransactions();
      }
    });
  }

  private async initFromDB(): Promise<void> {
    try {
      this.invoiceCache  = await dbGetAll<OfflineInvoice>(INVOICES_STORE);
      this.customerCache = await dbGetAll<OfflineCustomer>(CUSTOMERS_STORE);
      await this.cleanupOldOfflineData();
    } catch (e) {
      console.error('[OfflineDB] IndexedDB init failed:', e);
      this.invoiceCache  = [];
      this.customerCache = [];
    }
  }

  private async cleanupOldOfflineData(): Promise<void> {
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - fourteenDaysMs;

    // 1. Cleanup old offline invoices
    const toKeepInvoices: OfflineInvoice[] = [];
    for (const inv of this.invoiceCache) {
      if (inv.timestamp < cutoff) {
        console.log(`[Offline Cleanup] Deleting offline invoice ${inv.id} older than 2 weeks.`);
        dbDelete(INVOICES_STORE, inv.id).catch(e => console.error(e));
      } else {
        toKeepInvoices.push(inv);
      }
    }
    this.invoiceCache = toKeepInvoices;

    // 2. Cleanup old offline cash transactions
    try {
      const cashList = await dbGet<any[]>(APP_CACHE_STORE, "offline_cash_transactions") || [];
      const toKeepCash = cashList.filter(t => {
        let ts = t.timestamp;
        if (!ts && t.name && typeof t.name === 'string' && t.name.startsWith('OFFLINE-CASH-')) {
          const parts = t.name.split('-');
          const lastPart = parts[parts.length - 1];
          ts = parseInt(lastPart, 10);
        }
        if (!ts && t.posting_date && t.posting_time) {
          ts = new Date(`${t.posting_date}T${t.posting_time}`).getTime();
        }
        return (ts || Date.now()) >= cutoff;
      });

      if (toKeepCash.length !== cashList.length) {
        console.log(`[Offline Cleanup] Cleaned up ${cashList.length - toKeepCash.length} cash transactions older than 2 weeks.`);
        await dbSet(APP_CACHE_STORE, "offline_cash_transactions", toKeepCash);
      }
    } catch (e) {
      console.error('[Offline Cleanup] Failed to cleanup cash transactions:', e);
    }

    // 3. Cleanup old cached online invoices in APP_CACHE_STORE
    try {
      const db = await openDB();
      const transaction = db.transaction(APP_CACHE_STORE, 'readwrite');
      const store = transaction.objectStore(APP_CACHE_STORE);
      const request = store.openCursor();
      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          const key = cursor.key as string;
          if (key.startsWith("zustand:sultan_invoices_cache_") || key.startsWith("sultan_invoices_cache_")) {
            const val = cursor.value;
            let parsed: any = val;
            let isZustand = false;
            if (typeof val === "string") {
              try { 
                parsed = JSON.parse(val); 
                if (parsed && typeof parsed === 'object' && 'state' in parsed) {
                  isZustand = true;
                }
              } catch {}
            }
            
            const invoices = isZustand ? parsed?.state?.invoices : parsed?.invoices;
            if (Array.isArray(invoices)) {
              const filtered = invoices.filter((inv: any) => {
                const dateStr = inv.posting_date || inv.date;
                const timeStr = inv.posting_time || inv.time || "00:00:00";
                if (dateStr) {
                  const ts = new Date(`${dateStr}T${timeStr}`).getTime();
                  return ts >= cutoff;
                }
                return true;
              });

              if (filtered.length !== invoices.length) {
                if (isZustand) {
                  parsed.state.invoices = filtered;
                  cursor.update(JSON.stringify(parsed));
                } else {
                  parsed.invoices = filtered;
                  cursor.update(parsed);
                }
              }
            }
          }
          cursor.continue();
        }
      };
    } catch (e) {
      console.error('[Offline Cleanup] Failed to cleanup cached invoices:', e);
    }
  }

  private getUnsyncedCustomerCount(): number {
    return this.customerCache.filter(c => !c.synced).length;
  }

  private updatePendingCount(): void {
    const unsyncedInvoices = this.invoiceCache.filter(inv => !inv.synced).length;
    this.pendingUpdates = this.stockUpdateQueue.length + unsyncedInvoices + this.getUnsyncedCustomerCount();
    this.notifyListeners();
  }

  // --- Public invoice API ---

  public getOfflineInvoices(): OfflineInvoice[] {
    return this.invoiceCache;
  }

  public saveOfflineInvoice(data: any): OfflineInvoice {
    const newInvoice: OfflineInvoice = {
      id: 'OFFLINE-' + Date.now(),
      data,
      timestamp: Date.now(),
      synced: false,
    };
    this.invoiceCache.push(newInvoice);
    dbPut(INVOICES_STORE, newInvoice).catch(e => console.error('[OfflineDB] Save invoice failed:', e));
    this.updatePendingCount();
    if (this.isOnline) this.syncOfflineInvoices();
    return newInvoice;
  }

  // --- Public customer API ---

  public getOfflineCustomers(): OfflineCustomer[] {
    return this.customerCache;
  }

  public saveOfflineCustomer(data: any): OfflineCustomer {
    const newCust: OfflineCustomer = {
      id: 'OFFLINE_CUST-' + Date.now(),
      data,
      timestamp: Date.now(),
      synced: false,
    };
    this.customerCache.push(newCust);
    dbPut(CUSTOMERS_STORE, newCust).catch(e => console.error('[OfflineDB] Save customer failed:', e));
    this.updatePendingCount();
    return newCust;
  }

  // --- Sync logic ---

  private async syncOfflineCustomers(): Promise<Map<string, string>> {
    const resolved = new Map<string, string>();
    try {
      for (const cust of this.customerCache) {
        if (cust.realId) resolved.set(cust.id, cust.realId);
      }

      const unsynced = this.customerCache.filter(c => !c.synced && !c.realId);
      if (unsynced.length === 0) return resolved;

      for (const cust of unsynced) {
        try {
          const csrfToken = (window as any).csrf_token || '';
          const response = await fetch('/api/method/sultan.sultan.api.customer.create_or_update_customer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': csrfToken },
            body: JSON.stringify({ customer_data: cust.data }),
            credentials: 'include',
          });
          const result = await response.json();
          if (result.message?.success && result.message?.name) {
            const realId = result.message.name;
            resolved.set(cust.id, realId);
            console.log(`[Offline Sync] Customer ${cust.id} synced as ${realId}`);
            this.customerCache = this.customerCache.map(c =>
              c.id === cust.id ? { ...c, synced: true, realId } : c
            );
            const updated = this.customerCache.find(c => c.id === cust.id);
            if (updated) dbPut(CUSTOMERS_STORE, updated).catch(() => {});
          }
        } catch (err) {
          console.error(`[Offline Sync] Failed to sync customer ${cust.id}:`, err);
        }
      }
    } catch (e) {
      console.error('[Offline Sync] Error syncing customers:', e);
    }
    return resolved;
  }

  public async syncOfflineInvoices(): Promise<void> {
    if (this.isSyncingInvoices || !this.isOnline) return;

    this.isSyncingInvoices = true;
    this.lastSyncError = null;
    this.notifyListeners();

    // First, sync any opening entries to get the real session IDs and relink local orders
    await this.syncOfflineSessions();

    const unsynced = this.invoiceCache.filter(inv => !inv.synced);
    if (unsynced.length === 0 && this.getUnsyncedCustomerCount() === 0) {
      this.isSyncingInvoices = false;
      this.updatePendingCount();
      return;
    }

    const customerIdMap = await this.syncOfflineCustomers();

    console.log(`[Offline Sync] Found ${unsynced.length} unsynced invoices. Starting sync...`);

    let anyFailed = false;
    try {
      const { createSalesInvoice } = await import('./salesInvoice');

      for (const inv of unsynced) {
        try {
          let invoiceData = inv.data;
          const custId = invoiceData?.customer?.id;

          // Resolve offline customer ID to real ERPNext ID if we already have it
          if (custId?.startsWith('OFFLINE_CUST-') && customerIdMap.has(custId)) {
            invoiceData = { ...invoiceData, customer: { ...invoiceData.customer, id: customerIdMap.get(custId)! } };
          }

          // Still unresolved — try to create the customer on the fly
          if (invoiceData?.customer?.id?.startsWith('OFFLINE_CUST-')) {
            const offlineCust = invoiceData.customer;
            let resolved = false;
            try {
              const csrfToken = (window as any).csrf_token || '';
              const custPayload = {
                name: offlineCust.name || offlineCust.customer_name || '',
                customer_name: offlineCust.name || offlineCust.customer_name || '',
                phone: offlineCust.phone || '',
                email: offlineCust.email || '',
                customer_type: offlineCust.type === 'company' ? 'Company' : 'Individual',
                customer_group: offlineCust.customer_group || 'Individual',
                territory: offlineCust.territory || 'All Territories',
              };
              const resp = await fetch('/api/method/sultan.sultan.api.customer.create_or_update_customer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': csrfToken },
                body: JSON.stringify({ customer_data: custPayload }),
                credentials: 'include',
              });
              const result = await resp.json();
              if (result.message?.success && result.message?.name) {
                const realId = result.message.name;
                console.log(`[Offline Sync] Customer created from invoice data: ${offlineCust.id} → ${realId}`);
                invoiceData = { ...invoiceData, customer: { ...offlineCust, id: realId } };
                resolved = true;
              }
            } catch (custErr) {
              console.warn(`[Offline Sync] Could not create customer ${offlineCust.id}:`, custErr);
            }

            // Last resort: fall back to POS default customer
            if (!resolved) {
              try {
                const posDetails = await dbGet<any>(APP_CACHE_STORE, 'cached_pos_details');
                if (posDetails?.default_customer?.id) {
                  console.warn(`[Offline Sync] Falling back to POS default customer for invoice ${inv.id}`);
                  invoiceData = { ...invoiceData, customer: posDetails.default_customer };
                }
              } catch { /* keep original — backend will substitute */ }
            }
          }

          console.log(`[Offline Sync] Syncing invoice ${inv.id}...`);
          const result = await createSalesInvoice(invoiceData);

          // Remove from cache and IndexedDB on success
          this.invoiceCache = this.invoiceCache.filter(item => item.id !== inv.id);
          dbDelete(INVOICES_STORE, inv.id).catch(() => {});
          console.log(`[Offline Sync] Invoice ${inv.id} successfully synced as ${result.invoice?.name}`);
        } catch (err: any) {
          anyFailed = true;
          const errMsg = err.message || 'Unknown sync error';
          console.error(`[Offline Sync] Failed to sync invoice ${inv.id}:`, err);
          this.invoiceCache = this.invoiceCache.map(item =>
            item.id === inv.id ? { ...item, syncError: errMsg } : item
          );
          const updated = this.invoiceCache.find(item => item.id === inv.id);
          if (updated) dbPut(INVOICES_STORE, updated).catch(() => {});
          this.lastSyncError = errMsg;
        }
      }
      if (!anyFailed) {
        this.lastSync = new Date();
        await this.syncOfflineClosingEntries();
      }
    } catch (e: any) {
      console.error('[Offline Sync] Error during import/sync:', e);
      this.lastSyncError = e?.message || 'Sync failed';
    } finally {
      this.isSyncingInvoices = false;
      this.updatePendingCount();
    }
  }

  private async syncOfflineSessions(): Promise<void> {
    if (!this.isOnline) return;

    // Process Offline POS Opening Entries
    try {
      const openingQueue = await dbGet<any[]>(APP_CACHE_STORE, "offline_opening_entries") || [];
      if (openingQueue.length > 0) {
        console.log(`[Offline Sync] Found ${openingQueue.length} offline POS Opening Entries. Syncing...`);
        const csrfToken = (window as any).csrf_token || '';
        const toKeepOpenings = [];

        for (const entry of openingQueue) {
          try {
            const response = await fetch('/api/method/sultan.sultan.api.pos_entry.create_opening_entry', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': csrfToken },
              body: JSON.stringify({
                opening_balance: entry.opening_balance,
                pos_profile: entry.pos_profile,
                employee: entry.employee,
                employee_name: entry.employee_name
              }),
              credentials: 'include',
            });

            const result = await response.json();
            if (response.ok && result.message) {
              const realSessionId = typeof result.message === 'string'
                ? result.message
                : (result.message.name || result.message.name);

              console.log(`[Offline Sync] POS Opening Entry synced successfully as ${realSessionId}. Relinking offline orders...`);

              // Relink Invoices in memory and IndexedDB
              this.invoiceCache = this.invoiceCache.map(inv => {
                if (inv.data?.custom_pos_opening_entry === entry.id) {
                  const updatedData = { ...inv.data, custom_pos_opening_entry: realSessionId };
                  const updatedInv = { ...inv, data: updatedData };
                  dbPut(INVOICES_STORE, updatedInv).catch(e => console.error(e));
                  return updatedInv;
                }
                return inv;
              });

              // Relink Cash Transactions
              const cashList = await dbGet<any[]>(APP_CACHE_STORE, "offline_cash_transactions") || [];
              const updatedCashList = cashList.map(tx => {
                if (tx.pos_session === entry.id) {
                  return { ...tx, pos_session: realSessionId };
                }
                return tx;
              });
              await dbSet(APP_CACHE_STORE, "offline_cash_transactions", updatedCashList);

            } else {
              console.error('[Offline Sync] Failed to sync POS Opening Entry:', result);
              toKeepOpenings.push(entry);
            }
          } catch (err) {
            console.error('[Offline Sync] Network error syncing POS Opening Entry:', err);
            toKeepOpenings.push(entry);
          }
        }

        await dbSet(APP_CACHE_STORE, "offline_opening_entries", toKeepOpenings);
      }
    } catch (e) {
      console.error('[Offline Sync] Error processing offline opening entries:', e);
    }
  }

  private async syncOfflineClosingEntries(): Promise<void> {
    if (!this.isOnline) return;

    // Process Offline POS Closing Entries
    try {
      const closingQueue = await dbGet<any[]>(APP_CACHE_STORE, "offline_closing_entries") || [];
      if (closingQueue.length > 0) {
        console.log(`[Offline Sync] Found ${closingQueue.length} offline POS Closing Entries. Syncing...`);
        const csrfToken = (window as any).csrf_token || '';
        const toKeepClosings = [];

        for (const entry of closingQueue) {
          try {
            const response = await fetch('/api/method/sultan.sultan.api.pos_entry.create_closing_entry', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': csrfToken },
              body: JSON.stringify({
                closing_balance: entry.closing_balance
              }),
              credentials: 'include',
            });

            const result = await response.json();
            if (response.ok && result.message) {
              console.log(`[Offline Sync] POS Closing Entry synced successfully.`);
            } else {
              console.error('[Offline Sync] Failed to sync POS Closing Entry:', result);
              toKeepClosings.push(entry);
            }
          } catch (err) {
            console.error('[Offline Sync] Network error syncing POS Closing Entry:', err);
            toKeepClosings.push(entry);
          }
        }

        await dbSet(APP_CACHE_STORE, "offline_closing_entries", toKeepClosings);
      }
    } catch (e) {
      console.error('[Offline Sync] Error processing offline closing entries:', e);
    }
  }

  private setupEventListeners(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyListeners();
      this.processQueuedUpdates();
      this.syncOfflineInvoices();
      this.syncSecurityIncidents();
      this.syncOfflineCashTransactions();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyListeners();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline) {
        this.syncStockUpdates();
        this.syncOfflineInvoices();
        this.syncSecurityIncidents();
        this.syncOfflineCashTransactions();
      }
    });

    window.addEventListener('focus', () => {
      if (this.isOnline) {
        this.syncStockUpdates();
        this.syncOfflineInvoices();
        this.syncSecurityIncidents();
        this.syncOfflineCashTransactions();
      }
    });
  }

  private startPeriodicSync(): void {
    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.syncStockUpdates();
        this.syncOfflineInvoices();
        this.syncSecurityIncidents();
        this.syncOfflineCashTransactions();
      }
    }, 30000);
  }

  public async syncSecurityIncidents(): Promise<void> {
    if (!this.isOnline) return;

    try {
      const incidents = await dbGet<any[]>(APP_CACHE_STORE, "security_incidents_log") || [];
      if (incidents.length === 0) return;

      const unsynced = incidents.filter(inc => !inc.synced);
      if (unsynced.length === 0) return;

      console.log(`[Security Sync] Found ${unsynced.length} unsynced incidents. Syncing to server...`);
      const csrfToken = (window as any).csrf_token || '';

      const response = await fetch('/api/method/sultan.sultan.api.security.log_security_incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': csrfToken },
        body: JSON.stringify({ incidents: unsynced }),
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.message?.success) {
        const loggedIds = new Set(result.message.logged || []);
        // Mark synced incidents in local IndexedDB
        const updatedIncidents = incidents.map(inc => {
          if (loggedIds.has(inc.id) || result.message.logged.includes(inc.id)) {
            return { ...inc, synced: true };
          }
          return inc;
        });
        await dbSet(APP_CACHE_STORE, "security_incidents_log", updatedIncidents);
        console.log(`[Security Sync] Successfully synced ${loggedIds.size} incidents to server.`);
      }
    } catch (err) {
      console.error('[Security Sync] Failed to sync security incidents:', err);
    }
  }

  public async syncOfflineCashTransactions(): Promise<void> {
    if (!this.isOnline) return;

    try {
      const offlineList = await dbGet<any[]>(APP_CACHE_STORE, "offline_cash_transactions") || [];
      const unsynced = offlineList.filter(t => !t.synced);
      if (unsynced.length === 0) return;

      console.log(`[Offline Sync] Found ${unsynced.length} unsynced cash transactions. Syncing...`);
      const csrfToken = (window as any).csrf_token || '';

      const updatedList = [...offlineList];
      let hasChanges = false;

      for (const tx of unsynced) {
        try {
          const response = await fetch('/api/method/sultan.sultan.api.cash_transaction.create_cash_transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': csrfToken },
            body: JSON.stringify({
              transaction_type: tx.transaction_type,
              amount: tx.amount,
              description: tx.description,
              mode_of_payment: tx.mode_of_payment,
              pos_session: tx.pos_session
            }),
            credentials: 'include',
          });
          const result = await response.json();
          const msg = result.message ?? result;
          if (msg.success) {
            console.log(`[Offline Sync] Cash transaction ${tx.name} synced successfully as ${msg.name}`);
            const idx = updatedList.findIndex(item => item.name === tx.name);
            if (idx > -1) {
              updatedList.splice(idx, 1);
              hasChanges = true;
            }
          }
        } catch (err) {
          console.error(`[Offline Sync] Failed to sync cash transaction ${tx.name}:`, err);
        }
      }

      if (hasChanges) {
        await dbSet(APP_CACHE_STORE, "offline_cash_transactions", updatedList);
      }
    } catch (e) {
      console.error('[Offline Sync] Error syncing cash transactions:', e);
    }
  }

  private async syncStockUpdates(): Promise<void> {
    if (this.isSyncing || !this.isOnline) return;
    this.isSyncing = true;
    this.notifyListeners();
    try {
      const response = await fetch('/api/method/sultan.sultan.api.item.get_stock_updates');
      const resData = await response.json();
      if (resData?.message && typeof resData.message === 'object') {
        const stockUpdates = resData.message;
        const updateCount = Object.keys(stockUpdates).length;
        if (updateCount > 0) {
          const updates: StockUpdate[] = Object.entries(stockUpdates).map(([item_code, available]) => ({
            item_code,
            available: available as number,
            timestamp: Date.now()
          }));
          this.queueStockUpdates(updates);
          this.lastSync = new Date();
          console.log(`Background sync: Updated ${updateCount} items`);
        }
      }
    } catch (error) {
      console.error('Background sync failed:', error);
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  private queueStockUpdates(updates: StockUpdate[]): void {
    this.stockUpdateQueue.push(...updates);
    this.updatePendingCount();
    this.processQueuedUpdates();
  }

  private processQueuedUpdates(): void {
    if (this.stockUpdateQueue.length === 0) return;
    const updates = [...this.stockUpdateQueue];
    this.stockUpdateQueue = [];
    this.updatePendingCount();
    this.emit('stock_updates', updates);
  }

  private notifyListeners(): void {
    const status: SyncStatus = {
      isOnline: this.isOnline,
      lastSync: this.lastSync,
      pendingUpdates: this.pendingUpdates,
      isSyncing: this.isSyncing || this.isSyncingInvoices,
      isSyncingInvoices: this.isSyncingInvoices,
      lastSyncError: this.lastSyncError,
    };
    this.emit('status_change', status);
  }

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  private emit(event: string, data: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try { listener(data); } catch (error) { console.error('Error in background sync listener:', error); }
      });
    }
  }

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  public on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(callback);
  }

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  public off(event: string, callback: (data: any) => void): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
    }
  }

  public getStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      lastSync: this.lastSync,
      pendingUpdates: this.pendingUpdates,
      isSyncing: this.isSyncing || this.isSyncingInvoices,
      isSyncingInvoices: this.isSyncingInvoices,
      lastSyncError: this.lastSyncError,
    };
  }

  public forceSync(): Promise<void> {
    this.lastSyncError = null;
    this.syncOfflineInvoices();
    return this.syncStockUpdates();
  }

  public destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.listeners.clear();
  }
}

export const backgroundSyncService = new BackgroundSyncService();
export default backgroundSyncService;
