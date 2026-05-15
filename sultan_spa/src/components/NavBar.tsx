import { useState, useRef, useEffect } from "react"
import { Link } from "react-router-dom"
import { useI18n } from "../hooks/useI18n"
import { useAuth } from "../hooks/useAuth"
import { useTheme } from "../hooks/useTheme"
import { usePOSDetails } from "../hooks/usePOSProfile"
import { Search, Settings, LogOut, Moon, Sun, Store, Monitor } from "lucide-react"

export default function NavBar() {
  const { language, setLanguage } = useI18n()
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { posDetails } = usePOSDetails()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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
      // Still redirect even if logout fails
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

  return (
    <nav className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-100 dark:border-gray-800 relative z-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center h-16">
          {/* Left - Search */}
          <div className="flex items-center flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search menu"
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-ziditech-500 text-sm font-medium text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Center - User Info */}
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <h3 className="font-semibold text-gray-800 dark:text-white">{posProfileName}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{displayName}</p>
            </div>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-10 h-10 bg-ziditech-600 rounded-full flex items-center justify-center hover:bg-ziditech-700 transition-colors focus:outline-none focus:ring-2 focus:ring-ziditech-300 cursor-pointer"
                aria-label="User menu"
                type="button"
              >
                <span className="text-white font-medium text-sm pointer-events-none">{initials}</span>
              </button>

              {/* User dropdown menu */}
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 z-[100] overflow-hidden animate-in fade-in zoom-in duration-150">
                  {/* User info header */}
                  <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-ziditech-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-medium text-base">{initials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white truncate">{posProfileName}</p>
                        <div className="flex items-center space-x-1 mt-1">
                          <Store size={14} className="text-ziditech-500 flex-shrink-0" />
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            {displayName}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div className="py-2">
                    <Link
                      to="/settings"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-ziditech-50 dark:hover:bg-ziditech-900/10 transition-colors"
                    >
                      <Settings size={18} className="mr-3 text-ziditech-500" />
                      <span className="font-medium">Settings</span>
                    </Link>

                    <button
                      onClick={() => {
                        toggleTheme()
                        setShowUserMenu(false)
                      }}
                      className="flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-ziditech-50 dark:hover:bg-ziditech-900/10 transition-colors"
                      type="button"
                    >
                      {theme === 'dark' ? (
                        <Sun size={18} className="mr-3 text-ziditech-500" />
                      ) : (
                        <Moon size={18} className="mr-3 text-ziditech-500" />
                      )}
                      <span className="font-medium">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setLanguage(language === "en" ? "ar" : "en")
                        setShowUserMenu(false)
                      }}
                      className="flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-ziditech-50 dark:hover:bg-ziditech-900/10 transition-colors"
                      type="button"
                    >
                      <Globe className="mr-3 text-ziditech-500" size={18} />
                      <span className="font-medium">{language === "en" ? "Switch to Arabic" : "Switch to English"}</span>
                    </button>

                    {(user as any)?.role !== "Menu User" && (
                      <Link
                        to="/closing_shift"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-ziditech-50 dark:hover:bg-ziditech-900/10 transition-colors"
                      >
                        <Monitor size={18} className="mr-3 text-ziditech-500" />
                        <span className="font-medium">Closing Shift</span>
                      </Link>
                    )}

                    <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>

                    <button
                      onClick={() => {
                        handleLogout()
                        setShowUserMenu(false)
                      }}
                      className="flex items-center w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                      type="button"
                    >
                      <LogOut size={18} className="mr-3" />
                      <span className="font-bold">Logout</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right - Empty space for balance */}
          <div className="flex-1 max-w-md"></div>
        </div>
      </div>
    </nav>
  )
}

import { Globe } from "lucide-react"
