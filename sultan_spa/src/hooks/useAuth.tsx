import type React from "react"
import { useState, useEffect, createContext, useContext } from "react"
import erpnextAPI from "../services/erpnext-api"
import { dbGet, dbSet, dbRemove, dbClearStore, AUTH_STORE, APP_CACHE_STORE } from "../services/offlineDB"
import { dbSQLiteGet, dbSQLiteInsert, auditLogSQLite } from "../services/sqliteClient"

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
  custom_allow_returns?: boolean | number
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
  loginAsEmployee: (employeeId: string, employeeDisplayName: string, role?: string, allowedPosProfiles?: string[], customAllowReturns?: boolean | number) => Promise<void>
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
        // Initialize session from local storage/IndexedDB
        await erpnextAPI.initializeSession()

        // Check if user has cached credentials
        const token    = await dbGet<string>(AUTH_STORE, "erpnext_token")
        const userData = await dbGet<User>(AUTH_STORE, "user_data")

        if (token && userData) {
          console.log("[Auth] Boot: using cached session without server validation")
          if (userData.is_employee) {
            userData.is_employee = false
            await dbSet(AUTH_STORE, "user_data", userData)
            await dbRemove(APP_CACHE_STORE, 'pos_employee')
          }
          setUser(userData)
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
    console.log("[Auth Debug] login function called. username:", username);
    try {
      setLoading(true)

      let cachedBranch = null

      // Try reading from SQLite users table first (always, online or offline)
      try {
        console.log("[Auth Debug] Querying SQLite users table for username:", username);
        const row = await dbSQLiteGet<any>(
          "users", 
          "LOWER(username) = ? OR LOWER(email) = ? OR email LIKE ?", 
          [username.toLowerCase(), username.toLowerCase(), username.toLowerCase() + '@%']
        )
        console.log("[Auth Debug] Query result row:", row);
        if (row) {
          cachedBranch = {
            username: row.username,
            hash: row.password_hash,
            userData: {
              name: row.username,
              email: row.email,
              full_name: row.full_name,
              role: row.role || "User"
            }
          }
        }
      } catch (sqliteErr) {
        console.warn("[Auth Debug] Failed to read user from SQLite users table", sqliteErr)
      }

      if (cachedBranch) {
        const normUsername = username.toLowerCase()
        const cachedNormUsername = cachedBranch.username.toLowerCase()
        const cachedNormEmail = (cachedBranch.userData.email || "").toLowerCase()
        const isUserMatched = (normUsername === cachedNormUsername || 
                               normUsername === cachedNormEmail || 
                               cachedNormEmail.startsWith(normUsername + "@"));
        console.log("[Auth Debug] User matched status:", isUserMatched, "cachedNormUsername:", cachedNormUsername, "cachedNormEmail:", cachedNormEmail);
                               
        if (isUserMatched) {
          let passwordMatched = false;

          // Check if stored hash is a PBKDF2-SHA256 string ($pbkdf2-sha256$iterations$salt$hash)
          if (cachedBranch.hash && cachedBranch.hash.startsWith('$pbkdf2')) {
            try {
              console.log("[Auth Debug] Verifying PBKDF2 hash...");
              const parts = cachedBranch.hash.split('$');
              if (parts.length >= 5) {
                const iterations = parseInt(parts[2], 10);
                const saltStr = parts[3];
                const targetHashBase64 = parts[4];

                const encoder = new TextEncoder();
                const passwordKey = await window.crypto.subtle.importKey(
                  'raw',
                  encoder.encode(password),
                  { name: 'PBKDF2' },
                  false,
                  ['deriveBits']
                );

                // Base64-decode the saltStr, since Django/passlib stores it base64-encoded
                let base64Salt = saltStr.replace(/-/g, '+').replace(/_/g, '/');
                while (base64Salt.length % 4) {
                  base64Salt += '=';
                }
                const binaryStr = atob(base64Salt);
                const saltBytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                  saltBytes[i] = binaryStr.charCodeAt(i);
                }

                const derivedBits = await window.crypto.subtle.deriveBits(
                  {
                    name: 'PBKDF2',
                    salt: saltBytes,
                    iterations: iterations,
                    hash: 'SHA-256'
                  },
                  passwordKey,
                  256
                );

                const derivedArray = new Uint8Array(derivedBits);
                const derivedBase64 = btoa(String.fromCharCode(...derivedArray));
                const normalize = (s: string) => s.replace(/=/g, '').trim();

                passwordMatched = (normalize(derivedBase64) === normalize(targetHashBase64));
              }
            } catch (pbkdf2Err) {
              console.error("[Auth Debug] PBKDF2 verification failed:", pbkdf2Err);
            }
          } else if (cachedBranch.hash) {
            console.log("[Auth Debug] Stored hash is NOT PBKDF2, testing standard SHA-256 fallbacks...", cachedBranch.hash);
            // 1. Salted SHA-256 (password + username)
            const msgBuffer = new TextEncoder().encode(password + cachedNormUsername)
            const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgBuffer)
            const hashArray = Array.from(new Uint8Array(hashBuffer))
            const computedHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
            
            // 2. Plain SHA-256 (just password)
            const msgBufferPlain = new TextEncoder().encode(password)
            const hashBufferPlain = await window.crypto.subtle.digest("SHA-256", msgBufferPlain)
            const hashArrayPlain = Array.from(new Uint8Array(hashBufferPlain))
            const computedHashPlain = hashArrayPlain.map(b => b.toString(16).padStart(2, "0")).join("")

            passwordMatched = (computedHash === cachedBranch.hash || computedHashPlain === cachedBranch.hash);
          }

          console.log("[Auth Debug] Password matched:", passwordMatched);
          if (passwordMatched) {
            setUser(cachedBranch.userData)
            await dbSet(AUTH_STORE, "erpnext_token", "authenticated")
            await dbSet(AUTH_STORE, "user_data",     cachedBranch.userData)
            
            // Log offline login to audit log
            await auditLogSQLite('BRANCH_LOGIN_OFFLINE', 'user', cachedBranch.userData.name, 'system', 'Branch user logged in offline').catch(() => {});
            
            if (typeof window !== "undefined") {
              sessionStorage.removeItem("pos_db_preloaded")
            }
            console.log("[Auth Debug] SQLite local login successful!");
            return { success: true, message: "Logged in successfully" }
          }
        }
      }
      // If user not found in SQLite: check if the SQLite users table is completely empty
      let isDbEmpty = false;
      try {
        const { dbSQLiteGetAll } = await import("../services/sqliteClient");
        const allUsers = await dbSQLiteGetAll<any>("users");
        if (!allUsers || allUsers.length === 0) {
          isDbEmpty = true;
        }
      } catch (err) {
        isDbEmpty = true;
      }

      if (isDbEmpty && typeof window !== "undefined" && navigator.onLine) {
        console.log("[Auth Debug] SQLite users table is empty. Attempting online login for setup...");
        let onlineResult = null;
        try {
          onlineResult = await erpnextAPI.login(username, password, otp, tmpId);
        } catch (onlineErr) {
          console.warn("[Auth Debug] Online login failed:", onlineErr);
          return { success: false, message: "Connection to server failed. Please check network." };
        }

        if (onlineResult && onlineResult.requires_otp) {
          return {
            success: false,
            message: onlineResult.message,
            requires_otp: true,
            tmp_id: onlineResult.tmp_id,
            verification: onlineResult.verification,
          };
        }

        if (onlineResult && onlineResult.success && onlineResult.user) {
          const userData: User = {
            name:      onlineResult.user.name      || username,
            email:     onlineResult.user.email     || username,
            full_name: onlineResult.user.full_name || onlineResult.user.name || username,
            role:      onlineResult.user.role      || "User",
          };

          setUser(userData);
          await dbSet(AUTH_STORE, "erpnext_token", "authenticated");
          await dbSet(AUTH_STORE, "user_data",     userData);

          // Cache the branch user credentials hash in SQLite users table
          try {
            const normUser = (onlineResult.user.name || username).toLowerCase();
            const msgBuffer = new TextEncoder().encode(password + normUser);
            const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const computedHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

            // Save directly to SQLite users table
            const { dbSQLiteInsert } = await import("../services/sqliteClient");
            await dbSQLiteInsert("users", {
              username: normUser,
              password_hash: computedHash,
              full_name: userData.full_name,
              email: userData.email,
              role: userData.role || "User",
              last_sync: Date.now()
            });
          } catch (hashErr) {
            console.warn("Failed to compute and cache branch credentials hash", hashErr);
          }

          if (typeof window !== "undefined") {
            sessionStorage.removeItem("pos_db_preloaded");
          }

          return { success: true, message: onlineResult.message };
        } else {
          return { success: false, message: onlineResult?.message || "Login failed" };
        }
      }

      console.log("[Auth Debug] SQLite local login failed: Invalid username or password");
      return { success: false, message: "Invalid username or password." }
    } catch (error) {
      console.error("Login error:", error)
      return { success: false, message: "Login failed. Please try again." }
    } finally {
      setLoading(false)
    }
  }

  const loginAsEmployee = async (employeeId: string, employeeDisplayName: string, role?: string, allowedPosProfiles?: string[], customAllowReturns?: boolean | number) => {
    const userData: User = {
      name:      employeeId,
      email:     employeeId,
      full_name: employeeDisplayName,
      role:      role || "Cashier",
      is_employee: true,
        allowed_pos_profiles: allowedPosProfiles,
        custom_allow_returns: customAllowReturns,
      }
      setUser(userData)
      await dbSet(AUTH_STORE, "erpnext_token", "authenticated")
      await dbSet(AUTH_STORE, "user_data",     userData)
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("pos_db_preloaded")
      }
      try {
        const { clearGuardMemoryCache } = await import("../components/POSOpeningEntryGuard");
        clearGuardMemoryCache();
      } catch (e) {}
    }
  
    const logout = async () => {
      await erpnextAPI.logout()
      setUser(null)
      await dbClearStore(AUTH_STORE)
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("pos_db_preloaded")
      }
      try {
        const { clearGuardMemoryCache } = await import("../components/POSOpeningEntryGuard");
        clearGuardMemoryCache();
      } catch (e) {}
    }
  
    const lockEmployee = async () => {
      try {
        await dbRemove(APP_CACHE_STORE, 'pos_employee')
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("pos_db_preloaded")
        }
        try {
          const { clearGuardMemoryCache } = await import("../components/POSOpeningEntryGuard");
          clearGuardMemoryCache();
        } catch (e) {}
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
