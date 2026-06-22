import { useCartStore } from '../stores/cartStore';
import { clearDraftInvoiceCache } from './draftInvoiceCache';
import { dbClearStore, APP_CACHE_STORE, DRAFT_STORE } from '../services/offlineDB';

export async function clearAllCache(): Promise<void> {
  try {
    console.log('🧹 Clearing all application cache...');

    // Clear app caches in IndexedDB (categories, delivery, pos details, etc.)
    await dbClearStore(APP_CACHE_STORE);
    console.log('✅ App cache (IndexedDB) cleared');

    // Clear draft invoice cache
    await clearDraftInvoiceCache();
    console.log('✅ Draft invoice cache cleared');

    // Clear cart state in memory (Zustand IDB store cleared on next persist)
    const { clearCart } = useCartStore.getState();
    clearCart();
    console.log('✅ Cart state cleared');

    // Also clear draft store in IDB
    await dbClearStore(DRAFT_STORE);
    console.log('✅ Draft store cleared');

    console.log('🎉 All cache cleared successfully!');
  } catch (error) {
    console.error('❌ Error clearing cache:', error);
    throw error;
  }
}

/**
 * Clears backend cache via API call
 */
async function clearBackendCache(): Promise<void> {
  try {
    console.log('🧹 Clearing backend cache...');

    const response = await fetch('/api/method/sultan.sultan.api.cache.clear_backend_cache', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Frappe-CSRF-Token': (window as any).csrf_token || '',
      },
      credentials: 'include',
      body: '{}',
    });

    const data = await response.json();

    if (data.message?.success) {
      console.log('✅ Backend cache cleared successfully');
    } else {
      console.warn('⚠️ Backend cache clear failed:', data.message?.error || 'Unknown error');
    }
  } catch (error) {
    console.error('❌ Error clearing backend cache:', error);
  }
}

/**
 * Clears cache and reloads the page to ensure fresh data
 */
export async function clearCacheAndReload(): Promise<void> {
  try {
    await clearAllCache();
    await clearBackendCache();

    console.log('🔄 Reloading page with fresh data...');
    setTimeout(() => {
      window.location.reload();
    }, 100);
  } catch (error) {
    console.error('❌ Error during cache clear and reload:', error);
    window.location.reload();
  }
}
