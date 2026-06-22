import { dbGet, dbSet, APP_CACHE_STORE, AUTH_STORE } from "../services/offlineDB";
import { backgroundSyncService } from "../services/backgroundSyncService";

export interface SecurityIncident {
  id: string;
  timestamp: number;
  cashier: string;
  type: "Console Opened" | "Database Tampered" | "Unauthorized Access";
  details: string;
  synced?: boolean;
}

let lastLoggedInMemory: { type: string; details: string; timestamp: number } | null = null;
const DUPLICATE_WINDOW = 5 * 60 * 1000; // 5 minutes duplicate window

export async function logSecurityIncident(type: SecurityIncident["type"], details: string): Promise<void> {
  const now = Date.now();
  if (lastLoggedInMemory && lastLoggedInMemory.type === type && lastLoggedInMemory.details === details && (now - lastLoggedInMemory.timestamp) < DUPLICATE_WINDOW) {
    return;
  }

  // Update memory immediately to block synchronous race conditions
  lastLoggedInMemory = { type, details, timestamp: now };

  try {
    const userData = await dbGet<any>(AUTH_STORE, "user_data");
    const cashierName = userData?.full_name || userData?.name || "Unknown Cashier";
    
    const logs = await dbGet<SecurityIncident[]>(APP_CACHE_STORE, "security_incidents_log") || [];
    
    // Check against persistent DB log in case of page reload
    const lastLog = logs[0];
    if (lastLog && lastLog.type === type && lastLog.details === details && (now - lastLog.timestamp) < DUPLICATE_WINDOW) {
      return;
    }

    const newIncident: SecurityIncident = {
      id: 'SEC-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      timestamp: Date.now(),
      cashier: cashierName,
      type,
      details,
      synced: false
    };

    logs.unshift(newIncident);
    if (logs.length > 200) {
      logs.length = 200;
    }
    await dbSet(APP_CACHE_STORE, "security_incidents_log", logs);
    console.log(`[Security Audit Logged] ${type}: ${details}`);

    // Trigger background sync immediately if connected
    if (navigator.onLine) {
      backgroundSyncService.syncSecurityIncidents().catch(() => {});
    }
  } catch (e) {
    console.error("Failed to write security incident log:", e);
  }
}

export function initDevToolsDetector(): void {
  if (typeof window === 'undefined') return;
  // @ts-expect-error vite env
  if (import.meta.env.DEV) return;

  // Method 1: Getter trigger on regexp element printed to console
  const devtoolsTest = /./;
  Object.defineProperty(devtoolsTest, 'toString', {
    get: function() {
      logSecurityIncident("Console Opened", "Developer tools console access detected.");
      return 'devtools';
    }
  });

  const originalLog = (window as any).__original_console_log || console.log;

  setInterval(() => {
    try {
      originalLog(devtoolsTest);
    } catch {}
  }, 3000);

  // Method 2: Check standard keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F12') {
      logSecurityIncident("Console Opened", "DevTools shortcut key F12 pressed.");
    }
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
      logSecurityIncident("Console Opened", `DevTools shortcut Ctrl+Shift+${e.key.toUpperCase()} pressed.`);
    }
    if (e.metaKey && e.altKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j')) {
      logSecurityIncident("Console Opened", `DevTools shortcut Cmd+Opt+${e.key.toUpperCase()} pressed.`);
    }
  });
}
