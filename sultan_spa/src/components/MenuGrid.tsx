import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { Link, useNavigate } from "react-router-dom"
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
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 })
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
      window.location.href = "/sultan/login"
    } catch (error) {
      console.error('Logout error:', error)
      window.location.href = "/sultan/login"
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
    <div className="flex flex-col h-full bg-ziditech-950">
      {!hideHeader && (
        <div className="sticky top-0 z-10 bg-ziditech-950/90 backdrop-blur-xl border-b border-white/10">
          {/* Header content */}
          <div className="p-4 sm:p-6">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="bg-ziditech-600 p-2.5 rounded-xl shadow-lg shadow-ziditech-600/30">
                    <LayoutGrid className="text-white w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                      Available Items
                    </h2>
                    <p className="text-xs text-ziditech-400 font-bold uppercase tracking-widest">
                      {totalCount} items in stock
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4 relative" ref={dropdownRef}>
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-bold text-white">{posProfileName}</div>
                    <div className="text-xs text-ziditech-400 font-medium">{displayName}</div>
                  </div>
                  <button
                    ref={buttonRef}
                    onClick={() => {
                      if (!showUserMenu && buttonRef.current) {
                        const rect = buttonRef.current.getBoundingClientRect()
                        setDropdownPos({
                          top: rect.bottom + 10,
                          right: window.innerWidth - rect.right,
                        })
                      }
                      setShowUserMenu(!showUserMenu)
                    }}
                    className="w-11 h-11 bg-ziditech-600 rounded-2xl flex items-center justify-center hover:bg-ziditech-500 transition-all focus:outline-none focus:ring-2 focus:ring-ziditech-400/50 cursor-pointer shadow-xl shadow-ziditech-600/30 active:scale-95"
                    aria-label="User menu"
                    type="button"
                  >
                    <span className="text-white text-sm font-black pointer-events-none">{initials}</span>
                  </button>

                  {/* User dropdown — rendered via Portal so it appears above ALL layers */}
                  {showUserMenu && createPortal(
                    <div
                      className="fixed w-80 bg-ziditech-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden backdrop-blur-xl"
                      style={{ top: dropdownPos.top, right: dropdownPos.right, zIndex: 999999 }}
                    >
                      {/* User info header */}
                      <div className="px-5 py-4 border-b border-white/10 bg-gradient-to-r from-ziditech-800 to-ziditech-900">
                        <div className="flex items-center space-x-3">
                          <div className="w-14 h-14 bg-ziditech-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg">
                            <span className="text-white font-black text-lg">{initials}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-white truncate text-base">{displayName}</p>
                            <div className="flex items-center space-x-1.5 mt-1">
                              <Store size={12} className="text-ziditech-400 flex-shrink-0" />
                              <p className="text-xs text-ziditech-300 font-bold uppercase tracking-wider truncate">
                                {posProfileName}
                              </p>
                            </div>
                             <button
                              onClick={() => { 
                                setShowUserMenu(false); 
                                navigate('/settings?tab=profile');
                              }}
                              className="text-[10px] text-ziditech-400 hover:text-ziditech-200 mt-1 underline underline-offset-2 transition-colors text-left"
                            >
                              View all profile details →
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Menu items */}
                      <div className="py-2">
                        <button
                          onClick={() => {
                            setShowUserMenu(false)
                            navigate("/settings")
                          }}
                          className="flex items-center w-full px-5 py-3 text-sm text-gray-300 hover:bg-white/5 transition-colors"
                          type="button"
                        >
                          <Settings size={16} className="mr-3 text-ziditech-400" />
                          <span className="font-medium">Settings</span>
                        </button>

                        <button
                          onClick={() => {
                            toggleTheme()
                            setShowUserMenu(false)
                          }}
                          className="flex items-center w-full px-5 py-3 text-sm text-gray-300 hover:bg-white/5 transition-colors"
                          type="button"
                        >
                          {theme === "dark" ? <Sun size={16} className="mr-3 text-ziditech-400" /> : <Moon size={16} className="mr-3 text-ziditech-400" />}
                          <span className="font-medium">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                        </button>

                        <button
                          onClick={async () => {
                            setShowUserMenu(false)
                            await clearCacheAndReload()
                          }}
                          className="flex items-center w-full px-5 py-3 text-sm text-gray-300 hover:bg-white/5 transition-colors"
                          type="button"
                        >
                          <RefreshCw size={16} className="mr-3 text-ziditech-400" />
                          <span className="font-medium">Clear Cache</span>
                        </button>

                        <div className="border-t border-white/10 my-1 mx-3"></div>

                        <button
                          onClick={async () => {
                            setShowUserMenu(false)
                            handleLogout()
                          }}
                          className="flex items-center w-full px-5 py-3 text-sm text-red-400 hover:bg-red-400/10 transition-colors"
                          type="button"
                        >
                          <LogOut size={16} className="mr-3" />
                          <span className="font-bold">Logout</span>
                        </button>
                      </div>
                    </div>,
                    document.getElementById("root") || document.body
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
                <div className="flex items-center bg-white/5 rounded-xl p-1 border border-white/5">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-lg transition-colors ${
                      viewMode === 'grid'
                        ? 'bg-ziditech-600 text-white shadow-lg'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                    title="Grid View"
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-lg transition-colors ${
                      viewMode === 'list'
                        ? 'bg-ziditech-600 text-white shadow-lg'
                        : 'text-gray-500 hover:text-gray-300'
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
      <div className={`sticky top-0 z-10 bg-ziditech-950/90 backdrop-blur-xl border-b border-white/10 px-6 ${hideHeader ? 'py-2' : 'pb-2'}`}>
        <CategoryTabs selectedCategory={selectedCategory} onCategoryChange={onCategoryChange} />
      </div>

      {/* Products Grid */}
      <div className="flex-1 overflow-y-auto">
        {posLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-ziditech-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-ziditech-400 font-medium">Loading view preferences...</p>
            </div>
          </div>
        ) : isSearching ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-ziditech-600 border-t-transparent"></div>
              <span className="text-ziditech-400 font-medium">Searching...</span>
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

      {/* Full-Screen User Detail Overlay — also in Portal */}
      {showUserDetail && createPortal(
        <div className="fixed inset-0 bg-ziditech-950/95 backdrop-blur-xl z-[9999] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white/5 border border-white/10 rounded-[48px] p-10 w-full max-w-lg shadow-3xl animate-in zoom-in-95 duration-200">
            {/* Close button */}
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowUserDetail(false)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-white"
              >
                ✕
              </button>
            </div>

            {/* Avatar */}
            <div className="flex flex-col items-center mb-8">
              <div className="w-24 h-24 bg-gradient-to-br from-ziditech-500 to-ziditech-700 rounded-3xl flex items-center justify-center shadow-2xl shadow-ziditech-600/30 mb-4">
                <span className="text-white font-black text-3xl">{initials}</span>
              </div>
              <h2 className="text-3xl font-black text-white tracking-tight">{displayName}</h2>
              <div className="flex items-center space-x-2 mt-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-ziditech-400 bg-ziditech-600/20 px-3 py-1 rounded-lg">
                  {user?.role || 'Operator'}
                </span>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-4">
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Email Address</div>
                <div className="text-white font-bold">{user?.email || user?.name || 'Not set'}</div>
              </div>
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">POS Station</div>
                <div className="text-white font-bold">{posProfileName}</div>
              </div>
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Access Level</div>
                <div className="text-white font-bold">{user?.role || 'Standard Operator'}</div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4">
              <button
                onClick={() => { setShowUserDetail(false); handleLogout(); }}
                className="py-3 rounded-2xl border border-red-400/30 text-red-400 font-black text-xs uppercase tracking-widest hover:bg-red-400/10 transition-all"
              >
                Logout
              </button>
              <button
                onClick={() => setShowUserDetail(false)}
                className="py-3 rounded-2xl bg-ziditech-600 text-white font-black text-xs uppercase tracking-widest hover:bg-ziditech-500 transition-all shadow-xl shadow-ziditech-600/20"
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
