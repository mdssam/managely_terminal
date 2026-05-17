"use client"

import type { MenuItem } from "../../types"

interface ProductLineViewProps {
  items: MenuItem[]
  onAddToCart: (item: MenuItem) => void
  isMobile?: boolean
  scannerOnly?: boolean
}

export default function ProductLineView({ items, onAddToCart, isMobile = false, scannerOnly = false }: ProductLineViewProps) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No items found</h3>
          <p className="text-gray-500">Try adjusting your search or filters</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${isMobile ? "p-4" : "p-2"}`} style={{ backgroundColor: '#eef1f8' }}>
      {/* Header Row */}
      <div className="bg-white rounded-lg border border-gray-200 mb-4 overflow-hidden">
        <div className={`${isMobile ? "grid grid-cols-8 gap-2 px-3 py-3" : "grid grid-cols-12 gap-4 px-4 py-3"} bg-gray-50 border-b border-gray-200`}>
          <div className={`${isMobile ? "col-span-3" : "col-span-4"}`}>
            <span className="text-xs font-semibold text-gray-700">Product</span>
          </div>
          <div className={`${isMobile ? "col-span-2" : "col-span-2"} text-center`}>
            <span className="text-xs font-semibold text-gray-700">Rate</span>
          </div>
          <div className={`${isMobile ? "col-span-2" : "col-span-2"} text-center`}>
            <span className="text-xs font-semibold text-gray-700">Qty</span>
          </div>
          {!isMobile && (
            <div className="col-span-2 text-center">
              <span className="text-sm font-semibold text-gray-700">UOM</span>
            </div>
          )}
          <div className={`${isMobile ? "col-span-1" : "col-span-2"} text-center`}>
            <span className="text-xs font-semibold text-gray-700">Action</span>
          </div>
        </div>

        {/* Product Rows */}
        <div className="divide-y divide-gray-200">
          {items.map((item) => {
            const isStockTracking = item.is_stock_item !== 0 && item.is_stock_item !== false
            const isOutOfStock = isStockTracking && item.available <= 0
            const canBeManufactured = item.is_fresh_produce === true
            const isDisabled = (isOutOfStock && !canBeManufactured) || scannerOnly
            const formattedPrice = `${item.currency_symbol}${item.price.toFixed(2)}`

            return (
              <div
                key={item.id}
                className={`${isMobile ? "grid grid-cols-8 gap-2 px-3 py-3" : "grid grid-cols-12 gap-4 px-4 py-3"} hover:bg-gray-50 transition-colors ${
                  isDisabled ? "cursor-not-allowed" : "cursor-pointer"
                }`}
                onClick={() => !isDisabled && onAddToCart(item)}
              >
                {/* Product Name */}
                <div className={`${isMobile ? "col-span-3" : "col-span-4"} flex items-start`}>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-medium text-gray-900 ${isMobile ? "text-xs leading-tight" : "text-sm"} ${
                      isMobile ? "break-words" : "truncate"
                    } ${isDisabled ? "text-gray-500" : ""}`}>
                      {item.name}
                    </h3>
                    <p className={`text-gray-500 ${isMobile ? "text-xs leading-tight" : "text-sm"} ${
                      isMobile ? "break-words" : "truncate"
                    }`}>
                      {item.category}
                    </p>
                  </div>
                </div>

                {/* Rate */}
                <div className={`${isMobile ? "col-span-2" : "col-span-2"} flex items-center justify-center`}>
                  <span className={`font-semibold ${isMobile ? "text-xs" : "text-sm"}`} style={{ color: '#1e2d6b' }}>
                    {formattedPrice}
                  </span>
                </div>

                {/* Available Qty */}
                <div className={`${isMobile ? "col-span-2" : "col-span-2"} flex items-center justify-center`}>
                  <span className={`font-medium ${isMobile ? "text-xs" : "text-sm"} ${
                    isOutOfStock ? "text-red-600" : "text-gray-900"
                  }`}>
                    {!isStockTracking ? "—" : (isOutOfStock ? "0" : item.available)}
                  </span>
                </div>

                {/* UOM - Desktop only */}
                {!isMobile && (
                  <div className="col-span-2 flex items-center justify-center">
                    <span className="text-sm text-gray-600">
                      {item.uom || "Nos"}
                    </span>
                  </div>
                )}

                {/* Action */}
                <div className={`${isMobile ? "col-span-1" : "col-span-2"} flex items-center justify-center`}>
                  {isDisabled ? (
                    <span className={`text-gray-400 ${isMobile ? "text-xs" : "text-xs"}`}>
                      {isOutOfStock ? "—" : "S"}
                    </span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onAddToCart(item)
                      }}
                      className={`border font-medium rounded-md transition-colors hover:opacity-90 text-white ${
                        isMobile ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
                      }`}
                      style={{ backgroundColor: '#1e2d6b', borderColor: '#1e2d6b' }}
                    >
                      {isMobile ? "+" : "Add"}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
