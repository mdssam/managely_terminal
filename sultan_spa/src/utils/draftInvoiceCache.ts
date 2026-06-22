import { useCartStore } from '../stores/cartStore';
import type { CartItem, Customer } from '../../types';
import { dbGet, dbSet, dbRemove, DRAFT_STORE } from '../services/offlineDB';

interface DraftInvoiceCache {
  items: CartItem[];
  timestamp: number;
  invoiceId: string;
  customer: Customer | null;
  originalDraftInvoiceId: string;
}

const CACHE_KEY = 'draft-invoice-cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function cacheDraftInvoiceItems(invoiceId: string, items: CartItem[], customer: Customer | null): Promise<void> {
  const cache: DraftInvoiceCache = {
    items,
    timestamp: Date.now(),
    invoiceId,
    customer,
    originalDraftInvoiceId: invoiceId,
  };
  console.log("cacheDraftInvoiceItems - storing cache:", cache);
  await dbSet(DRAFT_STORE, CACHE_KEY, cache);
}

export async function getCachedDraftInvoiceItems(): Promise<DraftInvoiceCache | null> {
  try {
    const cache = await dbGet<DraftInvoiceCache>(DRAFT_STORE, CACHE_KEY);
    if (!cache) return null;

    const age = Date.now() - cache.timestamp;
    if (age > CACHE_DURATION) {
      await clearDraftInvoiceCache();
      return null;
    }
    return cache;
  } catch (error) {
    console.error('Error retrieving cached draft invoice items:', error);
    await clearDraftInvoiceCache();
    return null;
  }
}

export async function clearDraftInvoiceCache(): Promise<void> {
  await dbRemove(DRAFT_STORE, CACHE_KEY);
}

export async function loadCachedItemsToCart(): Promise<boolean> {
  const cachedData = await getCachedDraftInvoiceItems();
  if (!cachedData || cachedData.items.length === 0) return false;

  const { setSelectedCustomer, addToCartWithQuantity } = useCartStore.getState();

  if (cachedData.customer) {
    setSelectedCustomer(cachedData.customer);
  }

  for (const item of cachedData.items) {
    const cartItem = {
      id:         item.id,
      name:       item.name,
      category:   item.category,
      price:      item.price,
      image:      item.image,
      available:  item.available,
      uom:        item.uom,
      item_code:  item.id,
    };
    await addToCartWithQuantity(cartItem, item.quantity);
  }
  await clearDraftInvoiceCache();
  return true;
}

export async function hasCachedDraftInvoiceItems(): Promise<boolean> {
  const cache = await dbGet<DraftInvoiceCache>(DRAFT_STORE, CACHE_KEY);
  if (!cache) return false;
  return Date.now() - cache.timestamp <= CACHE_DURATION;
}

export async function getOriginalDraftInvoiceId(): Promise<string | null> {
  const cachedData = await getCachedDraftInvoiceItems();
  return cachedData?.originalDraftInvoiceId || null;
}
