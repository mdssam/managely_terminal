/**
 * Currency utility functions for formatting and symbol mapping
 */

// Common currency symbols mapping
const CURRENCY_SYMBOLS: Record<string, string> = {
  'USD': '$',
  'SAR': 'ر.س',
  'AED': 'د.إ',
  'EUR': '€',
  'GBP': '£',
  'JPY': '¥',
  'CAD': 'C$',
  'AUD': 'A$',
  'CHF': 'CHF',
  'CNY': '¥',
  'INR': '₹',
  'KRW': '₩',
  'MXN': '$',
  'NZD': 'NZ$',
  'SGD': 'S$',
  'THB': '฿',
  'TRY': '₺',
  'ZAR': 'R',
  'BRL': 'R$',
  'RUB': '₽',
  'SEK': 'kr',
  'NOK': 'kr',
  'DKK': 'kr',
  'PLN': 'zł',
  'CZK': 'Kč',
  'HUF': 'Ft',
  'ILS': '₪',
  'EGP': '£',
  'QAR': 'ر.ق',
  'KWD': 'د.ك',
  'BHD': 'د.ب',
  'OMR': 'ر.ع',
  'JOD': 'د.أ',
  'LBP': 'ل.ل',
  'PKR': '₨',
  'BDT': '৳',
  'LKR': '₨',
  'NPR': '₨',
  'AFN': '؋',
  'IRR': '﷼',
  'IQD': 'د.ع',
  'SYP': '£',
  'YER': '﷼',
  'MAD': 'د.م',
  'TND': 'د.ت',
  'DZD': 'د.ج',
  'LYD': 'ل.د',
  'ETB': 'Br',
  'KES': 'KSh',
  'UGX': 'USh',
  'TZS': 'TSh',
  'ZMW': 'ZK',
  'BWP': 'P',
  'SZL': 'L',
  'LSL': 'L',
  'NAD': 'N$',
  'MUR': '₨',
  'SCR': '₨',
  'MVR': 'ރ',
  'NIO': 'C$',
  'GTQ': 'Q',
  'HNL': 'L',
  'SVC': '$',
  'BZD': 'BZ$',
  'JMD': 'J$',
  'TTD': 'TT$',
  'BBD': 'Bds$',
  'XCD': '$',
  'AWG': 'ƒ',
  'ANG': 'ƒ',
  'SRD': '$',
  'GYD': 'G$',
  'VEF': 'Bs',
  'COP': '$',
  'PEN': 'S/',
  'BOB': 'Bs',
  'CLP': '$',
  'ARS': '$',
  'UYU': '$U',
  'PYG': '₲',
  'FKP': '£',
  'FJD': 'FJ$',
  'PGK': 'K',
  'SBD': 'SI$',
  'VUV': 'Vt',
  'WST': 'WS$',
  'TOP': 'T$',
  'PHP': '₱',
  'IDR': 'Rp',
  'MYR': 'RM',
  'VND': '₫',
  'LAK': '₭',
  'KHR': '៛',
  'MMK': 'K',
  'BND': 'B$',
};

/**
 * Get currency symbol from currency code
 * @param currency - Currency code (e.g., 'USD', 'SAR', 'EUR')
 * @returns Currency symbol (e.g., '$', 'ر.س', '€')
 */
export const getCurrencySymbol = (currency: string): string => {
  if (!currency) {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('pos_currency_symbol') || sessionStorage.getItem('pos_currency') || '';
    }
    return '';
  }

  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()];
  return symbol !== undefined ? symbol : currency; // Return currency code if symbol not found
};

/**
 * Format amount with currency symbol
 * @param amount - Amount to format
 * @param currency - Currency code
 * @returns Formatted string (e.g., "SAR 100.00", "$50.00")
 */
export const formatCurrency = (amount: number, currency?: string): string => {
  if (!amount && amount !== 0) return '0.00';

  const activeCurrency = currency || (typeof window !== 'undefined' ? sessionStorage.getItem('pos_currency') || '' : '');
  const symbol = getCurrencySymbol(activeCurrency);
  const formattedAmount = Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol} ${formattedAmount}` : formattedAmount;
};

/**
 * Format amount with currency symbol (compact version)
 * @param amount
 * @param currency
 * @returns Formatted string (e.g., "SAR100.00", "$50.00")
 */
export const formatCurrencyCompact = (amount: number, currency?: string): string => {
  if (!amount && amount !== 0) return '0.00';

  const activeCurrency = currency || (typeof window !== 'undefined' ? sessionStorage.getItem('pos_currency') || '' : '');
  const symbol = getCurrencySymbol(activeCurrency);
  const formattedAmount = Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${formattedAmount}` : formattedAmount;
};

/**
 * Formats a string or number into a comma-separated format while typing.
 * E.g., "12345.67" -> "12,345.67"
 */
export const formatNumberWithCommas = (value: string | number): string => {
  if (value === undefined || value === null) return "";
  let str = typeof value === "number" ? value.toString() : value;
  
  const isNegative = str.startsWith("-");
  // Remove non-numeric characters except first dot
  str = str.replace(/[^0-9.]/g, "");
  const parts = str.split(".");
  
  // Add commas to integer part
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  
  if (parts.length > 2) {
    // Keep only the first dot
    return (isNegative ? "-" : "") + parts[0] + "." + parts.slice(1).join("").replace(/\./g, "");
  }
  
  return (isNegative ? "-" : "") + parts.join(".");
};

/**
 * Strips commas from a formatted number string to make it parsed by parseFloat
 * E.g., "12,345.67" -> "12345.67"
 */
export const parseNumberFromCommas = (value: string): string => {
  return value.replace(/,/g, "");
};

/**
 * Formats full payment method name to a clean version like "Cash (USD)" or "Bank (LBP)".
 * @param method - Raw payment method name from database
 * @returns Cleaned payment method name
 */
export const formatPaymentMethodName = (method: string): string => {
  if (!method || method === "-") return "-";
  
  if (method.includes("/")) {
    return method.split("/").map(m => formatPaymentMethodName(m.trim())).join("/");
  }

  const lower = method.toLowerCase();
  let type = "Cash";
  if (lower.includes("bank") || lower.includes("card") || lower.includes("credit")) {
    type = "Bank";
  }

  // Extract currency from parentheses, e.g. "(LBP)" or "(USD)"
  const match = method.match(/\(([^)]+)\)/);
  const currency = match ? match[1] : (typeof window !== 'undefined' ? sessionStorage.getItem('pos_currency') || '' : '');

  return currency ? `${type} (${currency})` : type;
};
