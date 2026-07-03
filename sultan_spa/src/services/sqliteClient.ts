/**
 * sqliteClient.ts — Renderer Process
 * Thin wrapper around Electron IPC calls to the SQLite Main Process.
 * Falls back gracefully if not running in Electron.
 */

// Detect Electron renderer context
export const isElectron = typeof window !== 'undefined' && !!(window as any).require;

function ipcRenderer() {
  if (isElectron) {
    try {
      return (window as any).require('electron').ipcRenderer;
    } catch {}
  }
  return null;
}

async function invoke(channel: string, ...args: any[]): Promise<any> {
  const ipc = ipcRenderer();
  if (!ipc) return { success: false, error: 'Not running in Electron' };
  return ipc.invoke(channel, ...args);
}

// ─── SQLite CRUD ──────────────────────────────────────────────────────────────

export async function dbSQLiteGetAll<T>(table: string, where?: string, params?: any[]): Promise<T[]> {
  const result = await invoke('sqlite:getAll', table, where, params);
  if (!result.success) { console.error('[SQLite Client]', result.error); return []; }
  return result.data as T[];
}

export async function dbSQLiteGet<T>(table: string, where: string, params?: any[]): Promise<T | null> {
  const result = await invoke('sqlite:get', table, where, params);
  if (!result.success) { console.error('[SQLite Client]', result.error); return null; }
  return result.data as T | null;
}

export async function dbSQLiteInsert(table: string, obj: Record<string, any>): Promise<boolean> {
  const result = await invoke('sqlite:insert', table, obj);
  if (!result.success) console.error('[SQLite Client] Insert failed:', result.error);
  return result.success;
}

export async function dbSQLiteUpdate(table: string, obj: Record<string, any>, where: string, params?: any[]): Promise<boolean> {
  const result = await invoke('sqlite:update', table, obj, where, params);
  if (!result.success) console.error('[SQLite Client] Update failed:', result.error);
  return result.success;
}

export async function dbSQLiteDelete(table: string, where: string, params?: any[]): Promise<boolean> {
  const result = await invoke('sqlite:delete', table, where, params);
  if (!result.success) console.error('[SQLite Client] Delete failed:', result.error);
  return result.success;
}

export async function dbSQLiteRun(sql: string, params?: any[]): Promise<{ success: boolean; changes?: number }> {
  return invoke('sqlite:run', sql, params);
}

export async function dbSQLiteStats(): Promise<Record<string, number>> {
  const result = await invoke('sqlite:stats');
  return result.success ? result.data : {};
}

// ─── Domain helpers ───────────────────────────────────────────────────────────

export async function upsertProductsToSQLite(products: any[]): Promise<boolean> {
  const result = await invoke('sqlite:upsertProducts', products);
  if (!result.success) {
    console.error('[SQLite Client] upsertProducts failed:', result.error);
    throw new Error(result.error || 'Failed to upsert products to SQLite');
  }
  return result.success;
}

export async function upsertEmployeesToSQLite(employees: any[]): Promise<boolean> {
  const result = await invoke('sqlite:upsertEmployees', employees);
  if (!result.success) {
    console.error('[SQLite Client] upsertEmployees failed:', result.error);
    throw new Error(result.error || 'Failed to upsert employees to SQLite');
  }
  return result.success;
}

export async function upsertCustomersToSQLite(customers: any[]): Promise<boolean> {
  const result = await invoke('sqlite:upsertCustomers', customers);
  if (!result.success) {
    console.error('[SQLite Client] upsertCustomers failed:', result.error);
    throw new Error(result.error || 'Failed to upsert customers to SQLite');
  }
  return result.success;
}

export async function upsertItemGroupsToSQLite(groups: any[]): Promise<boolean> {
  const result = await invoke('sqlite:upsertItemGroups', groups);
  if (!result.success) {
    console.error('[SQLite Client] upsertItemGroups failed:', result.error);
    throw new Error(result.error || 'Failed to upsert item groups to SQLite');
  }
  return result.success;
}

export async function upsertTaxesToSQLite(taxes: any[]): Promise<boolean> {
  const result = await invoke('sqlite:upsertTaxes', taxes);
  if (!result.success) {
    console.error('[SQLite Client] upsertTaxes failed:', result.error);
    throw new Error(result.error || 'Failed to upsert taxes to SQLite');
  }
  return result.success;
}

export async function upsertDeliveryPersonnelToSQLite(personnel: any[]): Promise<boolean> {
  const result = await invoke('sqlite:upsertDeliveryPersonnel', personnel);
  if (!result.success) {
    console.error('[SQLite Client] upsertDeliveryPersonnel failed:', result.error);
    throw new Error(result.error || 'Failed to upsert delivery personnel to SQLite');
  }
  return result.success;
}

export async function upsertNamingSeriesToSQLite(key: string, prefix: string, lastVal: number): Promise<boolean> {
  const result = await invoke('sqlite:upsertNamingSeries', key, prefix, lastVal);
  if (!result.success) {
    console.error('[SQLite Client] upsertNamingSeries failed:', result.error);
    throw new Error(result.error || 'Failed to upsert naming series to SQLite');
  }
  return result.success;
}

export async function getNamingSeriesFromSQLite(): Promise<any[]> {
  const result = await invoke('sqlite:getNamingSeries');
  if (!result.success) {
    console.error('[SQLite Client] getNamingSeries failed:', result.error);
    return [];
  }
  return result.data || [];
}

export async function upsertPaymentModesToSQLite(posProfile: string, modes: any[]): Promise<boolean> {
  const result = await invoke('sqlite:upsertPaymentModes', posProfile, modes);
  if (!result.success) {
    console.error('[SQLite Client] upsertPaymentModes failed:', result.error);
    throw new Error(result.error || 'Failed to upsert payment modes to SQLite');
  }
  return result.success;
}

export async function getPaymentModesFromSQLite(posProfile: string): Promise<any[]> {
  const result = await invoke('sqlite:getPaymentModes', posProfile);
  if (!result.success) {
    console.error('[SQLite Client] getPaymentModes failed:', result.error);
    return [];
  }
  return result.data || [];
}

export async function upsertInvoicesToSQLite(invoices: any[]): Promise<boolean> {
  const result = await invoke('sqlite:upsertInvoices', invoices);
  if (!result.success) {
    console.error('[SQLite Client] upsertInvoices failed:', result.error);
    throw new Error(result.error || 'Failed to upsert invoices to SQLite');
  }
  return result.success;
}

export async function upsertCashTransactionsToSQLite(transactions: any[]): Promise<boolean> {
  const result = await invoke('sqlite:upsertCashTransactions', transactions);
  if (!result.success) {
    console.error('[SQLite Client] upsertCashTransactions failed:', result.error);
    throw new Error(result.error || 'Failed to upsert cash transactions to SQLite');
  }
  return result.success;
}

export async function upsertExchangeRatesToSQLite(rates: { currency: string; rate: number }[]): Promise<boolean> {
  const result = await invoke('sqlite:upsertExchangeRates', rates);
  return result.success;
}

export async function pruneSQLiteData(): Promise<{ invoices: number; cashTx: number; sessions: number } | null> {
  const result = await invoke('sqlite:pruneOldData');
  return result.success ? result.result : null;
}

export async function auditLogSQLite(action: string, entityType?: string, entityId?: string, employeeId?: string, details?: string): Promise<void> {
  await invoke('sqlite:auditLog', action, entityType, entityId, employeeId, details);
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function readDeviceConfig(): Promise<Record<string, any>> {
  const result = await invoke('config:read');
  return result.success ? result.config : {};
}

export async function writeDeviceConfig(data: Record<string, any>): Promise<boolean> {
  const result = await invoke('config:write', data);
  return result.success;
}

export async function isDeviceSetup(): Promise<{ isSetup: boolean; isMaster: boolean }> {
  const result = await invoke('config:isSetup');
  return result.success ? { isSetup: result.isSetup, isMaster: result.isMaster } : { isSetup: false, isMaster: false };
}

// ─── Printing ─────────────────────────────────────────────────────────────────

export async function printReceipt(htmlContent: string, printerName?: string): Promise<boolean> {
  const result = await invoke('print:receipt', htmlContent, printerName);
  return result.success;
}

export async function listPrinters(): Promise<any[]> {
  const result = await invoke('print:listPrinters');
  return result.success ? result.printers : [];
}

export async function scanNetworkPrinters(): Promise<string[]> {
  const result = await invoke('print:scanNetwork');
  return result.success ? result.ips : [];
}

/** Send ZPL data to a network barcode printer (e.g. Zebra) */
export async function printZPL(zplData: string, printerIp: string, port: number = 9100): Promise<boolean> {
  const result = await invoke('print:zpl', zplData, printerIp, port);
  if (!result.success) console.error('[Print ZPL]', result.error);
  return result.success;
}

/** Send ESC/POS plain text to a network kitchen printer */
export async function printKitchenOrder(text: string, printerIp: string, port: number = 9100): Promise<boolean> {
  const result = await invoke('print:kitchen', text, printerIp, port);
  if (!result.success) console.error('[Print Kitchen]', result.error);
  return result.success;
}

// ─── Local server ─────────────────────────────────────────────────────────────

export async function getLocalServerIP(): Promise<{ ip: string; port: number }> {
  const result = await invoke('server:localIP');
  return result.success ? { ip: result.ip, port: result.port } : { ip: '127.0.0.1', port: 3000 };
}

export async function broadcastProductsToMenus(): Promise<number> {
  const result = await invoke('server:broadcastProducts');
  return result.success ? result.count : 0;
}

// ─── System ───────────────────────────────────────────────────────────────────

export async function runManualPruning(): Promise<void> {
  const result = await invoke('system:pruneNow');
  if (result.success) {
    console.log('[System] Manual pruning complete:', result.result);
  }
}

// ─── IPC Event listeners ─────────────────────────────────────────────────────

type IPCCallback = (data: any) => void;

export function onLocalServerReady(cb: IPCCallback): () => void {
  const ipc = ipcRenderer();
  if (!ipc) return () => {};
  const handler = (_evt: any, data: any) => cb(data);
  ipc.on('local-server-ready', handler);
  return () => ipc.removeListener('local-server-ready', handler);
}

export function onPruningComplete(cb: IPCCallback): () => void {
  const ipc = ipcRenderer();
  if (!ipc) return () => {};
  const handler = (_evt: any, data: any) => cb(data);
  ipc.on('pruning-complete', handler);
  return () => ipc.removeListener('pruning-complete', handler);
}

// ─── POS Profile Config in SQLite app_cache ────────────────────────────────────
export async function savePOSDetailsToSQLite(details: any): Promise<void> {
  if (!isElectron) return;
  try {
    const existing = await dbSQLiteGet<any>('app_cache', "key = 'pos_profile_details'");
    if (existing) {
      await dbSQLiteUpdate('app_cache', { value: JSON.stringify(details), updated_at: Date.now() }, "key = 'pos_profile_details'");
    } else {
      await dbSQLiteInsert('app_cache', { key: 'pos_profile_details', value: JSON.stringify(details), updated_at: Date.now() });
    }
  } catch (e) {
    console.error('Failed to save POS details to SQLite app_cache:', e);
  }
}

export async function getPOSDetailsFromSQLite(): Promise<any | null> {
  if (!isElectron) return null;
  try {
    const record = await dbSQLiteGet<any>('app_cache', "key = 'pos_profile_details'");
    if (record && record.value) {
      return JSON.parse(record.value);
    }
  } catch (e) {
    console.error('Failed to get POS details from SQLite app_cache:', e);
  }
  return null;
}
