import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"
import { useTheme } from "../hooks/useTheme"
import { usePOSDetails } from "../hooks/usePOSProfile"
import { Settings, LogOut, Moon, Sun, Grid3X3, List, Store, RefreshCw, LayoutGrid } from "lucide-react"
import { clearCacheAndReload } from "../utils/clearCache"
import CategoryTabs from "./CategoryTabs"
import ProductGrid from "./ProductGrid"
import SearchBar from "./SearchBar"
import type { MenuItem } from "../../types"

interface MenuGridProps {
  items: MenuItem[]
  selectedCategory: string
  onCategoryChange: (category: string) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  onSearchKeyPress?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onAddToCart: (item: MenuItem) => void
  onScanBarcode?: () => void
  scannerOnly?: boolean
  // Pagination props
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
  totalCount?: number
  isSearching?: boolean
  hideHeader?: boolean
}

export default function MenuGrid({
  items,
  selectedCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  onSearchKeyPress,
  onAddToCart,
  onScanBarcode,
  scannerOnly = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  totalCount = 0,
  isSearching = false,
  hideHeader = false,
}: MenuGridProps) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { posDetails, loading: posLoading } = usePOSDetails()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Initialize viewMode based on POS profile
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Initialize viewMode when POS details finish loading
  useEffect(() => {
    if (!posLoading && posDetails) {
      const defaultView = posDetails.custom_default_view
      if (defaultView === 'List View') {
        setViewMode('list')
      } else if (defaultView === 'Grid View') {
        setViewMode('grid')
      }
      // If no custom_default_view is set, keep the default 'grid'
    }
  }, [posDetails, posLoading])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownRef])

  const handleLogout = async () => {
    try {
      await logout()
      window.location.href = "/sultan_spa/login"
    } catch (error) {
      console.error('Logout error:', error)
      window.location.href = "/sultan_spa/login"
    }
  }

  // Generate initials from user's full name
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(word => word.charAt(0).toUpperCase())
      .join("")
      .substring(0, 2)
  }

  const displayName = user?.full_name || user?.name || "Guest User"
  const posProfileName = posDetails?.name || "POS Profile"
  const initials = getInitials(displayName)

  const [showUserDetail, setShowUserDetail] = useState(false)

  return (
    <div className="flex flex-col h-full bg-white">
      {!hideHeader && (
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
          {/* Header content */}
          <div className="px-4 py-3 sm:px-6">
            <div className="flex flex-col space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: '#eef1f8' }}>
                    <LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: '#1e2d6b' }} />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-gray-900">
                      Available Items
                    </h2>
                    <p className="text-xs text-gray-500 font-medium">
                      {totalCount} items
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 relative" ref={dropdownRef}>
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-semibold text-gray-800">{posProfileName}</div>
                    <div className="text-xs text-gray-500">{displayName}</div>
                  </div>
                  <button
                    ref={buttonRef}
                    onClick={() => {
                      setShowUserMenu(!showUserMenu)
                    }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 active:scale-95 transition-all"
                    style={{ backgroundColor: '#1e2d6b' }}
                    aria-label="User menu"
                    type="button"
                  >
                    <span className="text-white text-sm font-bold pointer-events-none">{initials}</span>
                  </button>

                  {/* User dropdown — rendered via Portal */}
                  {showUserMenu && createPortal(
                    <div
                      className="fixed w-72 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-[9999999]"
                      style={{
                        top: buttonRef.current ? buttonRef.current.getBoundingClientRect().bottom + 8 : '72px',
                        right: buttonRef.current ? window.innerWidth - buttonRef.current.getBoundingClientRect().right : '20px'
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {/* User info header */}
                      <div className="px-4 py-4 border-b border-gray-100" style={{ backgroundColor: '#eef1f8' }}>
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#1e2d6b' }}>
                            <span className="text-white font-bold text-base">{initials}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 truncate text-sm">{displayName}</p>
                            <div className="flex items-center space-x-1.5 mt-0.5">
                              <Store size={11} className="text-gray-400 flex-shrink-0" />
                              <p className="text-xs text-gray-500 truncate">{posProfileName}</p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowUserMenu(false);
                                navigate('/settings');
                              }}
                              className="text-[10px] text-blue-600 hover:text-blue-700 mt-1 underline underline-offset-2 transition-colors text-left"
                            >
                              View profile details →
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Menu items */}
                      <div className="py-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowUserMenu(false);
                            navigate('/settings');
                          }}
                          className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          type="button"
                        >
                          <Settings size={15} className="mr-3 text-gray-400" />
                          <span className="font-medium">Settings</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTheme()
                            setShowUserMenu(false)
                          }}
                          className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          type="button"
                        >
                          {theme === "dark" ? <Sun size={15} className="mr-3 text-gray-400" /> : <Moon size={15} className="mr-3 text-gray-400" />}
                          <span className="font-medium">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                        </button>

                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setShowUserMenu(false)
                            await clearCacheAndReload()
                          }}
                          className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          type="button"
                        >
                          <RefreshCw size={15} className="mr-3 text-gray-400" />
                          <span className="font-medium">Clear Cache</span>
                        </button>

                        <div className="border-t border-gray-100 my-1"></div>

                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setShowUserMenu(false)
                            handleLogout()
                          }}
                          className="flex items-center w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          type="button"
                        >
                          <LogOut size={15} className="mr-3" />
                          <span className="font-semibold">Logout</span>
                        </button>
                      </div>
                    </div>,
                    document.body
                  )}
                </div>
              </div>

              {/* Search and View Toggle */}
              <div className="flex items-center space-x-3">
                <div className="flex-1 max-w-md">
                  <SearchBar
                    searchQuery={searchQuery}
                    onSearchChange={onSearchChange}
                    onSearchKeyPress={onSearchKeyPress}
                    onScanBarcode={onScanBarcode}
                  />
                </div>
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-md transition-colors ${
                      viewMode === 'grid'
                        ? 'bg-white text-gray-800 shadow-sm'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                    title="Grid View"
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-md transition-colors ${
                      viewMode === 'list'
                        ? 'bg-white text-gray-800 shadow-sm'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                    title="List View"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Categories Bar */}
      <div className={`sticky top-0 z-10 bg-white border-b border-gray-200 px-4 ${hideHeader ? 'py-2' : 'pb-2'}`}>
        <CategoryTabs selectedCategory={selectedCategory} onCategoryChange={onCategoryChange} />
      </div>

      {/* Products Grid */}
      <div className="flex-1 overflow-y-auto" style={{ backgroundColor: '#eef1f8' }}>
        {posLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#1e2d6b] border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-500 font-medium">Loading...</p>
            </div>
          </div>
        ) : isSearching ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#1e2d6b] border-t-transparent"></div>
              <span className="text-gray-500 font-medium">Searching...</span>
            </div>
          </div>
        ) : (
          <ProductGrid
            items={items}
            onAddToCart={onAddToCart}
            scannerOnly={scannerOnly}
            viewMode={viewMode}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={onLoadMore}
            totalCount={totalCount}
          />
        )}
      </div>

      {showUserDetail && createPortal(
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 w-full max-w-md animate-in zoom-in-95 duration-200">
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowUserDetail(false)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: '#1e2d6b' }}>
                <span className="text-white font-bold text-xl">{initials}</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900">{displayName}</h2>
              <span className="text-xs text-gray-500 mt-1">{user?.role || 'Operator'}</span>
            </div>
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Email</div>
                <div className="text-sm font-medium text-gray-800">{user?.email || user?.name || 'Not set'}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">POS Station</div>
                <div className="text-sm font-medium text-gray-800">{posProfileName}</div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => { setShowUserDetail(false); handleLogout(); }}
                className="py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors"
              >
                Logout
              </button>
              <button
                onClick={() => setShowUserDetail(false)}
                className="py-2.5 rounded-xl text-white text-sm font-semibold transition-colors"
                style={{ backgroundColor: '#1e2d6b' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
