"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Search } from "lucide-react"
import ProductCard from "./ProductCard"
import ProductLineView from "./ProductLineView"
import type { MenuItem } from "../../types"

interface ProductGridProps {
  items: MenuItem[]
  onAddToCart: (item: MenuItem) => void
  isMobile?: boolean
  scannerOnly?: boolean
  viewMode?: 'grid' | 'list'
  // Infinite scroll props
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
  totalCount?: number
  // Starred
  isStarred?: (itemCode: string) => boolean
  onToggleStar?: (itemCode: string) => void
  allowZeroStockSale?: boolean
}

export default function ProductGrid({
  items,
  onAddToCart,
  isMobile = false,
  scannerOnly = false,
  viewMode = 'grid',
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  totalCount = 0,
  isStarred,
  onToggleStar,
  allowZeroStockSale = false,
}: ProductGridProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(80)

  // Reset visibleCount when items length or viewMode changes
  useEffect(() => {
    setVisibleCount(80)
  }, [items.length, viewMode])

  // Intersection Observer for infinite scroll
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const target = entries[0]
    if (target.isIntersecting) {
      if (visibleCount < items.length) {
        setVisibleCount(prev => Math.min(prev + 40, items.length))
      } else if (hasMore && !isLoadingMore && onLoadMore) {
        onLoadMore()
      }
    }
  }, [visibleCount, items.length, hasMore, isLoadingMore, onLoadMore])

  useEffect(() => {
    const option = {
      root: null,
      rootMargin: "200px", // Load more before reaching the bottom
      threshold: 0,
    }

    const observer = new IntersectionObserver(handleObserver, option)

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current)
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current)
      }
    }
  }, [handleObserver])

  const visibleItems = items.slice(0, visibleCount)

  // If viewMode is 'list', render the line view
  if (viewMode === 'list') {
    return (
      <div className="flex flex-col">
        <ProductLineView items={visibleItems} onAddToCart={onAddToCart} isMobile={isMobile} scannerOnly={scannerOnly} />

        {/* Load more trigger and indicator */}
        {onLoadMore && (
          <div ref={loadMoreRef} className="py-4 flex justify-center">
            {isLoadingMore && (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: '#1e2d6b' }}></div>
                <span className="text-gray-600 text-sm">Loading more items...</span>
              </div>
            )}
            {!isLoadingMore && (hasMore || visibleCount < items.length) && (
              <span className="text-gray-500 text-sm">
                Showing {visibleItems.length} of {items.length === totalCount || totalCount === 0 ? items.length : totalCount} items
              </span>
            )}
            {!(hasMore || visibleCount < items.length) && items.length > 0 && (
              <span className="text-gray-500 text-sm">
                All {items.length} items loaded
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  // Default grid view
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Search size={64} className="text-gray-500" strokeWidth={1.5} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No items found</h3>
          <p className="text-gray-500">Try adjusting your search or filters</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${isMobile ? "p-4" : "p-6"}`} style={{ backgroundColor: '#eef1f8' }}>
      <div
        className={`grid gap-4 ${isMobile
            ? "grid-cols-2 sm:grid-cols-3"
            : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          }`}
      >
        {visibleItems.map((item) => (
          <ProductCard
            key={item.id}
            item={item}
            onAddToCart={onAddToCart}
            isMobile={isMobile}
            scannerOnly={scannerOnly}
            isStarred={isStarred ? isStarred(item.id) : false}
            onToggleStar={onToggleStar}
            allowZeroStockSale={allowZeroStockSale}
          />
        ))}
      </div>

      {/* Load more trigger and indicator */}
      {onLoadMore && (
        <div ref={loadMoreRef} className="py-6 flex justify-center">
          {isLoadingMore && (
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: '#1e2d6b' }}></div>
              <span className="text-gray-600 text-sm">Loading more items...</span>
            </div>
          )}
          {!isLoadingMore && (hasMore || visibleCount < items.length) && (
            <span className="text-gray-500 text-sm">
              Showing {visibleItems.length} of {items.length === totalCount || totalCount === 0 ? items.length : totalCount} items • Scroll for more
            </span>
          )}
          {!(hasMore || visibleCount < items.length) && items.length > 0 && totalCount > 0 && (
            <span className="text-gray-500 text-sm">
              All {items.length} items loaded
            </span>
          )}
        </div>
      )}
    </div>
  )
}
