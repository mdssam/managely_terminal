import { dbGetAll, dbPut, dbDelete, dbPutBatch, INVOICES_STORE, CUSTOMERS_STORE } from './offlineDB';

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
      if (this.isOnline) this.syncOfflineInvoices();
    });
  }

  private async initFromDB(): Promise<void> {
    try {
      // --- Invoices ---
      let invoices = await dbGetAll<OfflineInvoice>(INVOICES_STORE);
      if (invoices.length === 0) {
        try {
          const raw = localStorage.getItem('sultan_offline_invoices');
          if (raw) {
            invoices = JSON.parse(raw);
            if (invoices.length > 0) {
              await dbPutBatch(INVOICES_STORE, invoices);
              localStorage.removeItem('sultan_offline_invoices');
              console.log(`[OfflineDB] Migrated ${invoices.length} invoices from localStorage → IndexedDB`);
            }
          }
        } catch { /* ignore migration errors */ }
      }
      this.invoiceCache = invoices;

      // --- Customers ---
      let customers = await dbGetAll<OfflineCustomer>(CUSTOMERS_STORE);
      if (customers.length === 0) {
        try {
          const raw = localStorage.getItem('sultan_offline_customers');
          if (raw) {
            customers = JSON.parse(raw);
            if (customers.length > 0) {
              await dbPutBatch(CUSTOMERS_STORE, customers);
              localStorage.removeItem('sultan_offline_customers');
              console.log(`[OfflineDB] Migrated ${customers.length} customers from localStorage → IndexedDB`);
            }
          }
        } catch { /* ignore migration errors */ }
      }
      this.customerCache = customers;
    } catch (e) {
      console.error('[OfflineDB] IndexedDB init failed, falling back to localStorage:', e);
      try { this.invoiceCache = JSON.parse(localStorage.getItem('sultan_offline_invoices') || '[]'); } catch { this.invoiceCache = []; }
      try { this.customerCache = JSON.parse(localStorage.getItem('sultan_offline_customers') || '[]'); } catch { this.customerCache = []; }
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

    const unsynced = this.invoiceCache.filter(inv => !inv.synced);
    if (unsynced.length === 0 && this.getUnsyncedCustomerCount() === 0) return;

    this.isSyncingInvoices = true;
    this.lastSyncError = null;
    this.notifyListeners();

    const customerIdMap = await this.syncOfflineCustomers();

    if (unsynced.length === 0) {
      this.isSyncingInvoices = false;
      this.updatePendingCount();
      return;
    }

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
                const cachedDetails = localStorage.getItem('cached_pos_details');
                if (cachedDetails) {
                  const posDetails = JSON.parse(cachedDetails);
                  if (posDetails?.default_customer?.id) {
                    console.warn(`[Offline Sync] Falling back to POS default customer for invoice ${inv.id}`);
                    invoiceData = { ...invoiceData, customer: posDetails.default_customer };
                  }
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
      if (!anyFailed) this.lastSync = new Date();
    } catch (e: any) {
      console.error('[Offline Sync] Error during import/sync:', e);
      this.lastSyncError = e?.message || 'Sync failed';
    } finally {
      this.isSyncingInvoices = false;
      this.updatePendingCount();
    }
  }

  private setupEventListeners(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyListeners();
      this.processQueuedUpdates();
      this.syncOfflineInvoices();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyListeners();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline) {
        this.syncStockUpdates();
        this.syncOfflineInvoices();
      }
    });

    window.addEventListener('focus', () => {
      if (this.isOnline) {
        this.syncStockUpdates();
        this.syncOfflineInvoices();
      }
    });
  }

  private startPeriodicSync(): void {
    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.syncStockUpdates();
        this.syncOfflineInvoices();
      }
    }, 30000);
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
