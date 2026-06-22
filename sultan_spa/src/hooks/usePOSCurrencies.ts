import { useMemo } from "react"
import { usePOSDetails } from "./usePOSProfile"

export interface POSCurrencyEntry {
  currency: string
  symbol: string
  exchangeRate: number   // base units per 1 unit of this currency (e.g. 150 EGP per 1 USD)
}

export interface POSCurrencyConfig {
  enabled: boolean
  baseCurrency: string
  baseSymbol: string
  allowEditRate: boolean
  secondaryCurrencies: POSCurrencyEntry[]  // all non-base currencies
  // Legacy single-currency compat (first entry, or from old fields)
  secondaryCurrency: string | null
  secondarySymbol: string | null
  exchangeRate: number
}

export function usePOSCurrencies(): POSCurrencyConfig {
  const { posDetails } = usePOSDetails()

  return useMemo(() => {
    const enabled = !!(posDetails?.custom_enable_multi_currency)
    const baseCurrency = posDetails?.currency ?? (typeof window !== 'undefined' ? sessionStorage.getItem('pos_currency') || '' : '')
    const baseSymbol = posDetails?.currency_symbol ?? (typeof window !== 'undefined' ? sessionStorage.getItem('pos_currency_symbol') || '' : '')
    const allowEditRate = !!(posDetails?.custom_allow_edit_exchange_rate)

    // Build secondaryCurrencies from the table first
    const rateRows = (posDetails?.custom_multi_currency_rates as Array<{
      currency: string
      exchange_rate: number
      symbol?: string
    }> | undefined) ?? []

    let secondaryCurrencies: POSCurrencyEntry[] = rateRows
      .filter(r => r.currency && r.currency !== baseCurrency && (r.exchange_rate ?? 0) > 0)
      .map(r => ({
        currency: r.currency,
        symbol: r.symbol ?? r.currency,
        exchangeRate: r.exchange_rate,
      }))



    const isEnabled = enabled && secondaryCurrencies.length > 0

    const first = secondaryCurrencies[0] ?? null

    return {
      enabled: isEnabled,
      baseCurrency,
      baseSymbol,
      allowEditRate,
      secondaryCurrencies,
      secondaryCurrency: first?.currency ?? null,
      secondarySymbol: first?.symbol ?? null,
      exchangeRate: first?.exchangeRate ?? 0,
    }
  }, [posDetails])
}
