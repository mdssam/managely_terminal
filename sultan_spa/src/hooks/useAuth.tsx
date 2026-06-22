import type React from "react"
import { useState, useEffect, createContext, useContext } from "react"
import erpnextAPI from "../services/erpnext-api"
import { dbGet, dbSet, dbRemove, dbClearStore, AUTH_STORE, APP_CACHE_STORE } from "../services/offlineDB"

interface User {
  name: string
  email: string
  full_name: string
  role?: string
  first_name?: string
  last_name?: string
  user_image?: string
  is_employee?: boolean
  allowed_pos_profiles?: string[]
}

interface AuthContextType {
  user: User | null
  login: (
    username: string,
    password: string,
    otp?: string,
    tmpId?: string
  ) => Promise<{
    success: boolean
    message: string
    requires_otp?: boolean
    tmp_id?: string
    verification?: {
      method?: string
      prompt?: string
      setup?: boolean
      token_delivery?: boolean
    }
  }>
  loginAsEmployee: (employeeId: string, employeeDisplayName: string, role?: string, allowedPosProfiles?: string[]) => Promise<void>
  logout: () => Promise<void>
  lockEmployee: () => Promise<void>
  checkSession: () => Promise<boolean>
  loading: boolean
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    const initAuth = async () => {
      try {
        // Initialize ERPNext API session from IndexedDB
        await erpnextAPI.initializeSession()

        // Check if user has cached credentials in IndexedDB
        const token    = await dbGet<string>(AUTH_STORE, "erpnext_token")
        const userData = await dbGet<User>(AUTH_STORE, "user_data")

        if (token && userData) {
          // If offline, trust cached credentials — don't call the server
          if (!navigator.onLine) {
            console.log("[Auth] Offline: using cached session without server validation")
            setUser(userData)
            return
          }

          // Online: validate session with server
          let isSessionValid = false
          try {
            isSessionValid = await erpnextAPI.validateSession()
          } catch (networkErr) {
            // Network error during validation — treat as offline, keep session
            console.warn("[Auth] Session validation network error, keeping cached session:", networkErr)
            setUser(userData)
            return
          }

          if (isSessionValid) {
            setUser(userData)

            // Attempt a profile refresh passively to capture updates
            try {
              const freshUserData = await erpnextAPI.getCurrentUserProfile()
              if (freshUserData) {
                const updatedUser: User = {
                  name:       userData.is_employee ? userData.name : (freshUserData.name || userData.name),
                  email:      userData.is_employee ? userData.email : (freshUserData.email || freshUserData.name || userData.email),
                  full_name:  userData.is_employee ? userData.full_name : (freshUserData.full_name || `${freshUserData.first_name} ${freshUserData.last_name || ""}`.trim() || userData.full_name),
                  role:       userData.is_employee ? userData.role : (freshUserData.role_profile_name || freshUserData.role || userData.role || "User"),
                  first_name: freshUserData.first_name as string | undefined,
                  last_name:  freshUserData.last_name  as string | undefined,
                  user_image: freshUserData.user_image as string | undefined,
                  is_employee: userData.is_employee
                }
                setUser(updatedUser)
                await dbSet(AUTH_STORE, "user_data", updatedUser)
              }
            } catch (e) {
              console.warn("Passive user profile sync failed:", e)
            }
          } else {
            // Server explicitly said session is invalid — purge cached auth
            console.warn("Stale session detected on boot, purging auth cache")
            await dbClearStore(AUTH_STORE)
            setUser(null)
          }
        } else if (navigator.onLine) {
          // No cached data, but user might be logged in via Frappe desk (session cookie)
          try {
            const isSessionValid = await erpnextAPI.validateSession()
            if (isSessionValid) {
              const freshUserData = await erpnextAPI.getCurrentUserProfile()
              if (freshUserData) {
                const newUser: User = {
                  name: freshUserData.name,
                  email: freshUserData.email || freshUserData.name,
                  full_name: freshUserData.full_name || `${freshUserData.first_name} ${freshUserData.last_name || ""}`.trim(),
                  role: freshUserData.role_profile_name || freshUserData.role || "User",
                  first_name: freshUserData.first_name,
                  last_name: freshUserData.last_name,
                  user_image: freshUserData.user_image,
                  is_employee: false
                }
                setUser(newUser)
                await dbSet(AUTH_STORE, "user_data", newUser)
                // Use a dummy token or standard "session" token
                await dbSet(AUTH_STORE, "erpnext_token", "frappe-session")
              }
            }
          } catch (e) {
            console.warn("No active session cookie found:", e)
          }
        }
      } catch (error) {
        console.error("Auth init error:", error)
      } finally {
        setLoading(false)
      }
    }

    initAuth()
  }, [mounted])

  const login = async (username: string, password: string, otp?: string, tmpId?: string) => {
    try {
      setLoading(true)

      const result = await erpnextAPI.login(username, password, otp, tmpId)

      if (result.requires_otp) {
        return {
          success: false,
          message: result.message,
          requires_otp: true,
          tmp_id: result.tmp_id,
          verification: result.verification,
        }
      }

      if (result.success && result.user) {
        const userData: User = {
          name:      result.user.name      || username,
          email:     result.user.email     || username,
          full_name: result.user.full_name || result.user.name || username,
          role:      result.user.role      || "User",
        }

        setUser(userData)
        await dbSet(AUTH_STORE, "erpnext_token", "authenticated")
        await dbSet(AUTH_STORE, "user_data",     userData)
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("pos_db_preloaded")
        }

        return { success: true, message: result.message }
      } else {
        return { success: false, message: result.message }
      }
    } catch (error) {
      console.error("Login error:", error)
      return { success: false, message: "Login failed. Please try again." }
    } finally {
      setLoading(false)
    }
  }

  const loginAsEmployee = async (employeeId: string, employeeDisplayName: string, role?: string, allowedPosProfiles?: string[]) => {
    const userData: User = {
      name:      employeeId,
      email:     employeeId,
      full_name: employeeDisplayName,
      role:      role || "Cashier",
      is_employee: true,
      allowed_pos_profiles: allowedPosProfiles,
    }
    setUser(userData)
    await dbSet(AUTH_STORE, "erpnext_token", "authenticated")
    await dbSet(AUTH_STORE, "user_data",     userData)
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("pos_db_preloaded")
    }
  }

  const logout = async () => {
    await erpnextAPI.logout()
    setUser(null)
    await dbClearStore(AUTH_STORE)
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("pos_db_preloaded")
    }
  }

  const lockEmployee = async () => {
    try {
      await dbRemove(APP_CACHE_STORE, 'pos_employee')
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("pos_db_preloaded")
      }
      const userData = await dbGet<User>(AUTH_STORE, "user_data")
      if (userData) {
        userData.is_employee = false
        await dbSet(AUTH_STORE, "user_data", userData)
        setUser({ ...userData, is_employee: false })
      } else {
        setUser(null)
      }
    } catch (e) {
      console.error("lockEmployee error:", e)
    }
  }

  const checkSession = async () => {
    if (!user) return false
    try {
      const isValid = await erpnextAPI.validateSession()
      if (!isValid) {
        console.log("Session expired, logging out")
        await logout()
        return false
      }
      return true
    } catch (error) {
      console.error("Session check failed:", error)
      return false
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        loginAsEmployee,
        logout,
        lockEmployee,
        checkSession,
        loading,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
