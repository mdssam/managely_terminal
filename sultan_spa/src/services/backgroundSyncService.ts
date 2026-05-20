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

class BackgroundSyncService {
  private isOnline = navigator.onLine;
  private lastSync: Date | null = null;
  private pendingUpdates = 0;
  private isSyncing = false;        // for stock updates
  private isSyncingInvoices = false; // separate flag so stock sync can't block invoice sync
  private lastSyncError: string | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private listeners: Map<string, ((status: SyncStatus) => void)[]> = new Map();
  private stockUpdateQueue: StockUpdate[] = [];

  constructor() {
    this.setupEventListeners();
    this.startPeriodicSync();
    this.updatePendingCount();
    // Attempt sync immediately on startup if online
    if (this.isOnline) {
      this.syncOfflineInvoices();
    }
  }

  private getUnsyncedCustomerCount(): number {
    try {
      const stored = localStorage.getItem('sultan_offline_customers');
      const customers: any[] = stored ? JSON.parse(stored) : [];
      return customers.filter(c => !c.synced).length;
    } catch {
      return 0;
    }
  }

  private updatePendingCount(): void {
    const offlineInvoices = this.getOfflineInvoices();
    const unsyncedInvoices = offlineInvoices.filter(inv => !inv.synced).length;
    this.pendingUpdates = this.stockUpdateQueue.length + unsyncedInvoices + this.getUnsyncedCustomerCount();
    this.notifyListeners();
  }

  public getOfflineInvoices(): OfflineInvoice[] {
    try {
      const stored = localStorage.getItem('sultan_offline_invoices');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Error loading offline invoices:', e);
      return [];
    }
  }

  public saveOfflineInvoice(data: any): OfflineInvoice {
    const offlineInvoices = this.getOfflineInvoices();
    const newInvoice: OfflineInvoice = {
      id: 'OFFLINE-' + Date.now(),
      data,
      timestamp: Date.now(),
      synced: false
    };
    offlineInvoices.push(newInvoice);
    localStorage.setItem('sultan_offline_invoices', JSON.stringify(offlineInvoices));
    this.updatePendingCount();

    // Trigger sync automatically if online
    if (this.isOnline) {
      this.syncOfflineInvoices();
    }

    return newInvoice;
  }

  private async syncOfflineCustomers(): Promise<Map<string, string>> {
    // Returns a map of offlineId → realId for resolved customers
    const resolved = new Map<string, string>();
    try {
      const stored = localStorage.getItem('sultan_offline_customers');
      const customers: any[] = stored ? JSON.parse(stored) : [];

      // Always populate from already-synced customers first so invoices can resolve IDs
      // even when there are no remaining unsynced customers
      for (const cust of customers) {
        if (cust.realId) resolved.set(cust.id, cust.realId);
      }

      const unsynced = customers.filter(c => !c.synced);
      if (unsynced.length === 0) return resolved;

      const { useCustomerActions } = await import('./customerService');

      for (const cust of unsynced) {
        // If already has a realId recorded, just use it
        if (cust.realId) {
          resolved.set(cust.id, cust.realId);
          continue;
        }
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
            // Mark synced
            const current: any[] = JSON.parse(localStorage.getItem('sultan_offline_customers') || '[]');
            localStorage.setItem('sultan_offline_customers', JSON.stringify(
              current.map(c => c.id === cust.id ? { ...c, synced: true, realId } : c)
            ));
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
    // Use a dedicated flag so stock-update syncing never blocks invoice syncing
    if (this.isSyncingInvoices || !this.isOnline) {
      return;
    }

    const offlineInvoices = this.getOfflineInvoices();
    const unsynced = offlineInvoices.filter(inv => !inv.synced);

    if (unsynced.length === 0 && this.getUnsyncedCustomerCount() === 0) {
      return;
    }

    this.isSyncingInvoices = true;
    this.lastSyncError = null;
    this.notifyListeners();

    // First, sync pending offline customers and get their real IDs
    const customerIdMap = await this.syncOfflineCustomers();

    if (unsynced.length === 0) {
      this.isSyncingInvoices = false;
      this.updatePendingCount();
      return;
    }

    console.log(`[Offline Sync] Found ${unsynced.length} unsynced offline invoices. Starting sync...`);

    let anyFailed = false;
    try {
      const { createSalesInvoice } = await import('./salesInvoice');

      for (const inv of unsynced) {
        try {
          // Resolve offline customer ID to real ID if needed
          let invoiceData = inv.data;
          const custId = invoiceData?.customer?.id;
          if (custId && custId.startsWith('OFFLINE_CUST-') && customerIdMap.has(custId)) {
            const realId = customerIdMap.get(custId)!;
            invoiceData = {
              ...invoiceData,
              customer: { ...invoiceData.customer, id: realId },
            };
          }

          // If customer ID is still an offline ID, first try to create the customer
          // in ERPNext using the data embedded in the invoice, then update the reference
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

            // Last resort: use the POS default customer so the invoice still syncs
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
              } catch { /* keep original — backend will substitute via its own fallback */ }
            }
          }

          console.log(`[Offline Sync] Syncing invoice ${inv.id}...`);
          const result = await createSalesInvoice(invoiceData);

          // Success — remove from offline list
          const currentInvoices = this.getOfflineInvoices();
          const filtered = currentInvoices.filter(item => item.id !== inv.id);
          localStorage.setItem('sultan_offline_invoices', JSON.stringify(filtered));

          console.log(`[Offline Sync] Invoice ${inv.id} successfully synced as ${result.invoice?.name}`);
        } catch (err: any) {
          anyFailed = true;
          const errMsg = err.message || 'Unknown sync error';
          console.error(`[Offline Sync] Failed to sync invoice ${inv.id}:`, err);
          const currentInvoices = this.getOfflineInvoices();
          const updated = currentInvoices.map(item =>
            item.id === inv.id ? { ...item, syncError: errMsg } : item
          );
          localStorage.setItem('sultan_offline_invoices', JSON.stringify(updated));
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
    // Listen for online/offline events
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

    // Listen for visibility changes to sync when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline) {
        this.syncStockUpdates();
        this.syncOfflineInvoices();
      }
    });

    // Listen for focus events
    window.addEventListener('focus', () => {
      if (this.isOnline) {
        this.syncStockUpdates();
        this.syncOfflineInvoices();
      }
    });
  }

  private startPeriodicSync(): void {
    // Sync every 30 seconds when online
    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.syncStockUpdates();
        this.syncOfflineInvoices();
      }
    }, 30000);
  }

  private async syncStockUpdates(): Promise<void> {
    if (this.isSyncing || !this.isOnline) {
      return;
    }

    this.isSyncing = true;
    this.notifyListeners();

    try {
      const response = await fetch('/api/method/sultan.sultan.api.item.get_stock_updates');
      const resData = await response.json();

      if (resData?.message && typeof resData.message === 'object') {
        const stockUpdates = resData.message;
        const updateCount = Object.keys(stockUpdates).length;

        if (updateCount > 0) {
          // Convert to our format and queue for processing
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

    // Process updates immediately
    this.processQueuedUpdates();
  }

  private processQueuedUpdates(): void {
    if (this.stockUpdateQueue.length === 0) {
      return;
    }

    // Emit updates to listeners
    const updates = [...this.stockUpdateQueue];
    this.stockUpdateQueue = [];
    this.updatePendingCount();

    // Notify listeners about the updates
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
        try {
          listener(data);
        } catch (error) {
          console.error('Error in background sync listener:', error);
        }
      });
    }
  }
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  public on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  public off(event: string, callback: (data: any) => void): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
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
    // Reset error state so a manual retry always attempts
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

// Export singleton instance
export const backgroundSyncService = new BackgroundSyncService();
export default backgroundSyncService;
