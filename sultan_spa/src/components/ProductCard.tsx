"use client"

import type { MenuItem } from "../../types"
import { ChefHat } from "lucide-react"

interface ProductCardProps {
  item: MenuItem
  onAddToCart: (item: MenuItem) => void
  isMobile?: boolean
  scannerOnly?: boolean
}

export default function ProductCard({ item, onAddToCart, isMobile = false, scannerOnly = false }: ProductCardProps) {
  const isStockTracking = item.is_stock_item === 1 || item.is_stock_item === true
  const isOutOfStock = isStockTracking && item.available <= 0
  const canBeManufactured = !!item.is_fresh_produce
  const isDisabled = (isOutOfStock && !canBeManufactured) || scannerOnly

  const formattedPrice = item.currency_symbol
    ? `${item.currency_symbol}${item.price.toFixed(2)}`
    : item.price > 0
      ? item.price.toFixed(2)
      : "—"

  return (
    <div
      className={`bg-white rounded-xl border overflow-hidden transition-all duration-200 flex flex-col ${
        isDisabled
          ? "border-gray-200 cursor-not-allowed"
          : canBeManufactured && isOutOfStock
            ? "hover:shadow-md hover:scale-[1.02] cursor-pointer active:scale-95"
            : "border-gray-200 hover:shadow-md hover:scale-[1.02] cursor-pointer active:scale-95"
      } ${isMobile ? "touch-manipulation" : ""}`}
      style={canBeManufactured && isOutOfStock ? { borderColor: '#1e2d6b' } : {}}
      onClick={() => !isDisabled && onAddToCart(item)}
    >
      {/* Image area */}
      <div className={`relative w-full ${isMobile ? "h-24" : "h-28"} flex-shrink-0`}>
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center gap-1">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
            </svg>
          </div>
        )}

        {/* Badges — top-right corner */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-10">
          {!isStockTracking ? (
            <div className="text-white px-3 py-1.5 rounded-lg text-xs font-black shadow-md border border-white/20" style={{ backgroundColor: '#10b981' }}>
              SERVICE
            </div>
          ) : (item.available <= 0 && !canBeManufactured) ? (
            <div className="text-white px-3 py-1.5 rounded-lg text-xs font-black shadow-md border-2 border-white" style={{ backgroundColor: '#1e59db' }}>
              OUT OF STOCK
            </div>
          ) : null}
        </div>

        {/* Discount badge — top-left */}
        {item.discount && (
          <div className="absolute top-2 left-2 text-white px-2 py-1 rounded-lg text-[10px] font-black shadow-md z-10" style={{ backgroundColor: '#1e59db' }}>
            -{item.discount}% OFF
          </div>
        )}

        {/* Out of stock overlay — only for non-fresh items */}
        {isOutOfStock && !canBeManufactured && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center z-20">
            <div className="bg-[#1e59db] text-white px-4 py-2 rounded-xl font-black text-sm shadow-xl border-2 border-white rotate-[-5deg]">
              OUT OF STOCK
            </div>
          </div>
        )}

        {/* Scanner only overlay */}
        {scannerOnly && !isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <span className="font-black text-xs bg-white text-[#1e59db] px-3 py-1.5 rounded-xl shadow-lg border-2 border-[#1e59db]">
              SCAN ONLY
            </span>
          </div>
        )}
      </div>

      {/* Card info */}
      <div className={`p-3 flex flex-col gap-1 flex-1 ${isOutOfStock && !canBeManufactured ? "opacity-50" : ""}`}>
        <div className="flex items-start justify-between gap-1">
          <h3 className={`font-black text-gray-900 leading-tight ${isMobile ? "text-xs" : "text-sm"} line-clamp-2 uppercase`}>
            {item.name}
          </h3>
          {canBeManufactured && (
            <ChefHat size={16} className="text-[#1e59db] shrink-0" title="Made to Order" />
          )}
        </div>
        <p className={`text-[10px] text-gray-600 font-bold uppercase tracking-wider`}>{item.category}</p>
        <div className="mt-auto pt-2 flex items-center justify-between border-t border-gray-100">
          <span className={`font-black ${isMobile ? "text-sm" : "text-base"}`} style={{ color: '#111827' }}>
            {formattedPrice}
          </span>
          {/* removed bottom badge */}
        </div>
      </div>
    </div>
  )
}
