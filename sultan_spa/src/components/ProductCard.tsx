"use client"

import type { MenuItem } from "../../types"

interface ProductCardProps {
  item: MenuItem
  onAddToCart: (item: MenuItem) => void
  isMobile?: boolean
  scannerOnly?: boolean
}

export default function ProductCard({ item, onAddToCart, isMobile = false, scannerOnly = false }: ProductCardProps) {
  const isOutOfStock = item.available <= 0
  const canBeManufactured = !!item.is_fresh_produce
  const isDisabled = (isOutOfStock && !canBeManufactured) || scannerOnly

  const formattedPrice = item.currency_symbol
    ? `${item.currency_symbol}${item.price.toFixed(2)}`
    : item.price > 0
      ? item.price.toFixed(2)
      : "—"

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl border overflow-hidden transition-all duration-200 flex flex-col ${
        isDisabled
          ? "border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed"
          : canBeManufactured && isOutOfStock
            ? "border-ziditech-300 dark:border-ziditech-700 hover:shadow-md hover:scale-[1.02] cursor-pointer active:scale-95"
            : "border-gray-200 dark:border-gray-700 hover:shadow-md hover:scale-[1.02] cursor-pointer active:scale-95"
      } ${isMobile ? "touch-manipulation" : ""}`}
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
          <div className="w-full h-full bg-gray-100 dark:bg-gray-700 flex flex-col items-center justify-center gap-1">
            <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
            </svg>
          </div>
        )}

        {/* Badges — top-right corner */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5">
        {item.available > 0 ? (
          <div className="bg-ziditech-600/90 text-white px-2 py-1 rounded-md text-[10px] font-bold shadow-sm backdrop-blur-sm">
            In Stock
          </div>
        ) : (
          <div className="bg-red-500/90 text-white px-2 py-1 rounded-md text-[10px] font-bold shadow-sm backdrop-blur-sm">
            Out of Stock
          </div>
        )}
      </div>

        {/* Discount badge — top-left */}
        {item.discount && (
          <div className="absolute top-1.5 left-1.5 bg-red-500 text-white px-1.5 py-0.5 rounded-md text-[10px] font-bold">
            -{item.discount}%
          </div>
        )}

        {/* Out of stock overlay — only for non-fresh items */}
        {isOutOfStock && !canBeManufactured && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
            <span className="text-white font-semibold text-xs tracking-wide">Out of Stock</span>
          </div>
        )}

        {/* Scanner only overlay */}
        {scannerOnly && !isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-ziditech-600 dark:text-blue-400 font-semibold text-xs bg-white/90 dark:bg-gray-800/90 px-2 py-1 rounded-md shadow-sm border border-ziditech-200">
              Scan Only
            </span>
          </div>
        )}
      </div>

      {/* Card info */}
      <div className="p-2.5 flex flex-col gap-0.5 flex-1">
        <h3 className={`font-semibold text-gray-900 dark:text-white leading-tight ${isMobile ? "text-xs" : "text-sm"} line-clamp-2`}>
          {item.name}
        </h3>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{item.category}</p>
        <div className="mt-auto pt-1 flex items-center justify-between">
          <span className={`font-bold text-ziditech-700 dark:text-ziditech-400 ${isMobile ? "text-xs" : "text-sm"}`}>
            {formattedPrice}
          </span>
          {canBeManufactured && isOutOfStock && (
            <span className="text-[10px] text-ziditech-600 dark:text-ziditech-500 font-medium">Made to order</span>
          )}
        </div>
      </div>
    </div>
  )
}
