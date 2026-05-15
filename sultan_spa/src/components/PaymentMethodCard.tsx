"use client"

import { useState } from "react"
import { useI18n } from "../hooks/useI18n"

interface PaymentMethodCardProps {
  method: string
  title: string
  icon: string
  selected: boolean
  onSelect: () => void
  total: number
}

export default function PaymentMethodCard({ method, title, icon, selected, onSelect, total }: PaymentMethodCardProps) {
  const { t } = useI18n()
  const [showDetails, setShowDetails] = useState(false)

  const handleClick = () => {
    onSelect()
    setShowDetails(true)
  }

  const renderIcon = () => {
    switch (icon) {
      case "cash":
        return (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        )
      case "card":
        return (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
            />
          </svg>
        )
      case "wallet":
        return (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V6a1 1 0 00-1-1H5a1 1 0 00-1 1v1a1 1 0 001 1z"
            />
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <div
      onClick={handleClick}
      className={`p-6 border-2 rounded-lg cursor-pointer transition-all bg-card ${
        selected ? "border-ziditech-500 bg-ziditech-50/10 dark:bg-ziditech-900/20" : "border-border hover:border-muted-foreground/50"
      }`}
    >
      <div className="text-center">
        <div className={`mx-auto mb-3 ${selected ? "text-ziditech-600 dark:text-ziditech-400" : "text-muted-foreground"}`}>{renderIcon()}</div>
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>

      {selected && showDetails && (
        <div className="mt-4 pt-4 border-t border-border">
          {method === "cash" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t("AMOUNT_RECEIVED")}</label>
                <input
                  type="number"
                  defaultValue={total}
                  className="w-full px-3 py-2 bg-background border border-input text-foreground rounded focus:outline-none focus:ring-2 focus:ring-ziditech-500"
                />
              </div>
              <div className="text-sm text-muted-foreground">{t("CHANGE")}: ₨ 0.00</div>
            </div>
          )}

          {method === "card" && (
            <div className="text-center py-4">
              <div className="text-sm text-muted-foreground mb-2">{t("INSERT_OR_TAP_CARD")}</div>
              <div className="animate-pulse">
                <div className="w-16 h-10 bg-muted rounded mx-auto"></div>
              </div>
            </div>
          )}

          {method === "wallet" && (
            <div className="text-center py-4">
              <div className="w-32 h-32 bg-muted rounded mx-auto mb-2 flex items-center justify-center border border-border">
                <span className="text-muted-foreground text-xs">QR Code</span>
              </div>
              <div className="text-sm text-muted-foreground">{t("SCAN_WITH_STC_PAY")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
