import type React from "react"
import { useState, useEffect, createContext, useContext } from "react"
import erpnextAPI from "../services/erpnext-api"

interface User {
  name: string
  email: string
  full_name: string
  role?: string
  first_name?: string
  last_name?: string
  user_image?: string
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
  logout: () => Promise<void>
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
        // Initialize ERPNext API session
        erpnextAPI.initializeSession()

        // Check if user has local credentials
        const token = localStorage.getItem("erpnext_token")
        const userData = localStorage.getItem("user_data")

        if (token && userData) {
          try {
            const parsedUser = JSON.parse(userData)
            
            // IMMEDIATELY validate session synchronously BEFORE releasing lock
            const isSessionValid = await erpnextAPI.validateSession()
            
            if (isSessionValid) {
              // Session verified, establish safe authenticated state
              setUser(parsedUser)
              
              // Attempt a profile refresh passively to capture updates
              try {
                const freshUserData = await erpnextAPI.getCurrentUserProfile()
                if (freshUserData) {
                  const updatedUser = {
                    name: freshUserData.name || parsedUser.name,
                    email: freshUserData.email || freshUserData.name || parsedUser.email,
                    full_name: freshUserData.full_name || freshUserData.first_name + ' ' + (freshUserData.last_name || '') || parsedUser.full_name,
                    role: freshUserData.role_profile_name || freshUserData.role || parsedUser.role || "User",
                    first_name: freshUserData.first_name,
                    last_name: freshUserData.last_name,
                    user_image: freshUserData.user_image
                  }
                  setUser(updatedUser)
                  localStorage.setItem("user_data", JSON.stringify(updatedUser))
                }
              } catch (e) {
                console.warn("Passive user profile sync failed:", e)
              }
            } else {
              // Remote session died, purge cache instantly
              console.warn("Stale session detected on boot, purging local cache")
              localStorage.removeItem("erpnext_token")
              localStorage.removeItem("user_data")
              localStorage.removeItem("erpnext_sid")
              setUser(null)
            }
          } catch (error) {
            console.error("Malformed cached auth data:", error)
            localStorage.removeItem("erpnext_token")
            localStorage.removeItem("user_data")
            localStorage.removeItem("erpnext_sid")
          }
        }
      } finally {
        // Safe to unblock UI only after true deterministic state reached
        setLoading(false)
      }
    }

    initAuth()
  }, [mounted])

  const login = async (username: string, password: string, otp?: string, tmpId?: string) => {
    try {
      setLoading(true)

      // Use the real ERPNext API
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
        console.log("Login successful:", result.user)
        const userData = {
          name: result.user.name || username,
          email: result.user.email || username,
          full_name: result.user.full_name || result.user.name || username,
          role: result.user.role || "User",
        }

        setUser(userData)
        localStorage.setItem("erpnext_token", "authenticated")
        localStorage.setItem("user_data", JSON.stringify(userData))

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

  const logout = async () => {
    await erpnextAPI.logout()
    setUser(null)
    localStorage.removeItem("erpnext_token")
    localStorage.removeItem("user_data")
    localStorage.removeItem("erpnext_sid")
  }

  // Method to check if session is still valid
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
        logout,
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
