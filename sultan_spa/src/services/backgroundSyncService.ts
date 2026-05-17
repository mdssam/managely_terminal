interface SyncStatus {
  isOnline: boolean;
  lastSync: Date | null;
  pendingUpdates: number;
  isSyncing: boolean;
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
  private isSyncing = false;
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

  private updatePendingCount(): void {
    const offlineInvoices = this.getOfflineInvoices();
    const unsyncedCount = offlineInvoices.filter(inv => !inv.synced).length;
    this.pendingUpdates = this.stockUpdateQueue.length + unsyncedCount;
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

  public async syncOfflineInvoices(): Promise<void> {
    if (this.isSyncing || !this.isOnline) {
      return;
    }

    const offlineInvoices = this.getOfflineInvoices();
    const unsynced = offlineInvoices.filter(inv => !inv.synced);

    if (unsynced.length === 0) {
      return;
    }

    this.isSyncing = true;
    this.notifyListeners();

    console.log(`[Offline Sync] Found ${unsynced.length} unsynced offline invoices. Starting sync...`);

    try {
      const { createSalesInvoice } = await import('./salesInvoice');

      for (const inv of unsynced) {
        try {
          console.log(`[Offline Sync] Syncing invoice ${inv.id}...`);
          const result = await createSalesInvoice(inv.data);

          // Success - remove from offline list
          const currentInvoices = this.getOfflineInvoices();
          const filtered = currentInvoices.filter(item => item.id !== inv.id);
          localStorage.setItem('sultan_offline_invoices', JSON.stringify(filtered));

          console.log(`[Offline Sync] Invoice ${inv.id} successfully synced as ${result.invoice?.name}`);
        } catch (err: any) {
          console.error(`[Offline Sync] Failed to sync invoice ${inv.id}:`, err);
          // Store error to prevent blocking other syncs
          const currentInvoices = this.getOfflineInvoices();
          const updated = currentInvoices.map(item => {
            if (item.id === inv.id) {
              return { ...item, syncError: err.message || 'Unknown sync error' };
            }
            return item;
          });
          localStorage.setItem('sultan_offline_invoices', JSON.stringify(updated));
        }
      }
      this.lastSync = new Date();
    } catch (e) {
      console.error('[Offline Sync] Error during import/sync:', e);
    } finally {
      this.isSyncing = false;
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
      isSyncing: this.isSyncing
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
      isSyncing: this.isSyncing
    };
  }

  public forceSync(): Promise<void> {
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
