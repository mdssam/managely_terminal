import { dbGet, APP_CACHE_STORE } from "./offlineDB"

export interface PriceInfo {
  success: boolean;
  price: number;
  currency: string;
  currency_symbol: string;
  error?: string;
}

/**
 * Get item price for a specific customer
 */
export async function getItemPriceForCustomer(itemCode: string, customerId?: string, uom?: string): Promise<PriceInfo> {
  if (typeof window !== "undefined" && !navigator.onLine) {
    const cachedDetails = await dbGet<any>(APP_CACHE_STORE, 'cached_pos_details').catch(() => null);
    return {
      success: false,
      price: 0,
      currency: cachedDetails?.currency || '',
      currency_symbol: cachedDetails?.currency_symbol || cachedDetails?.currency || '',
      error: 'Offline'
    };
  }
  try {
    const customerParam = customerId ? `&customer=${customerId}` : '';
    const uomParam = uom ? `&uom=${encodeURIComponent(uom)}` : '';
    const response = await fetch(`/api/method/sultan.sultan.api.item.get_item_price_for_customer?item_code=${itemCode}${customerParam}${uomParam}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result.message || result;
  } catch (error) {
    console.error('Error fetching item price for customer:', error);
    const cachedDetails = await dbGet<any>(APP_CACHE_STORE, 'cached_pos_details').catch(() => null);
    return {
      success: false,
      price: 0,
      currency: cachedDetails?.currency || '',
      currency_symbol: cachedDetails?.currency_symbol || cachedDetails?.currency || '',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Update prices for multiple items based on customer
 */
export async function updateItemPricesForCustomer(items: Array<{id: string, item_code?: string, uom?: string}>, customerId?: string): Promise<Record<string, PriceInfo>> {
  const priceUpdates: Record<string, PriceInfo> = {};

  // Process items in parallel for better performance
  const promises = items.map(async (item) => {
    const itemCode = item.item_code || item.id;
    // Pass the item's UOM to ensure we get the price for the correct UOM
    const priceInfo = await getItemPriceForCustomer(itemCode, customerId, item.uom);
    priceUpdates[item.id] = priceInfo;
  });

  await Promise.all(promises);
  return priceUpdates;
}

/**
 * Apply pricing rules to cart items
 * This uses ERPNext's pricing rules to get discounted prices
 */
export interface PricingRuleResult {
  id: string;
  price: number;
  original_price?: number;
  discount_percentage?: number;
  discount_amount?: number;
  pricing_rules?: string;
  has_pricing_rule?: number;
  free_item_data?: Array<any>;
  [key: string]: any; // Allow other item properties
}

export async function applyPricingRulesToCart(
  cartItems: Array<{id: string, item_code?: string, quantity: number, price: number, uom?: string, [key: string]: any}>,
  customerId?: string
): Promise<PricingRuleResult[]> {
  if (typeof window !== "undefined" && !navigator.onLine) {
    return cartItems;
  }
  try {
    const customerParam = customerId ? `&customer=${customerId}` : '';
    const response = await fetch(`/api/method/sultan.sultan.api.item.apply_pricing_rules_to_cart?cart_items=${encodeURIComponent(JSON.stringify(cartItems))}${customerParam}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const data = result.message || result;
    if (Array.isArray(data)) {
      return data;
    }
    return cartItems;
  } catch (error) {
    console.error('Error applying pricing rules to cart:', error);
    // Return original items if pricing rule application fails
    return cartItems;
  }
}
