import type React from "react"
import { useState } from "react"
import { useNavigate, useLocation, Navigate } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"
import { employeePosLogin } from "../services/employeeAuth"
import { dbSet, dbGet, APP_CACHE_STORE } from "../services/offlineDB"
import { usePOSDetails } from "../hooks/usePOSProfile"

export default function EmployeeLoginScreen() {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { loginAsEmployee } = useAuth()
  const { posDetails, loading: posLoading } = usePOSDetails()

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#eef1f8' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ziditech-700 mx-auto"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const handlePosLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    if (typeof window !== "undefined" && !navigator.onLine) {
      try {
        const cachedEmployees = await dbGet<any[]>(APP_CACHE_STORE, "cached_branch_employees") || [];
        if (cachedEmployees.length === 0) {
          setError("Offline database not preloaded. Please connect to the internet first.");
          setLoading(false);
          return;
        }

        const emp = cachedEmployees.find(
          (item: any) => item.username.toLowerCase() === username.toLowerCase()
        );

        if (!emp) {
          setError("Invalid POS credentials (Offline Mode).");
          setLoading(false);
          return;
        }

        // Salted SHA-256 password hash comparison
        const msgBuffer = new TextEncoder().encode(password + emp.employee);
        const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const computedHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        if (computedHash === emp.hash) {
          await dbSet(APP_CACHE_STORE, 'pos_employee', {
            employee: emp.employee,
            employee_name: emp.employee_name,
          });

          loginAsEmployee(
            emp.employee || username,
            emp.employee_name || username,
            emp.role || "Cashier",
            emp.allowed_pos_profiles || []
          );

          const from = (location.state as any)?.from?.pathname || "/pos";
          navigate(from, { replace: true });
        } else {
          setError("Invalid POS credentials (Offline Mode).");
        }
      } catch (err: any) {
        setError(err.message || "Offline authentication error.");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const result = await employeePosLogin(username, password)
      if (result.success) {
        await dbSet(APP_CACHE_STORE, 'pos_employee', {
          employee: result.employee,
          employee_name: result.employee_name,
        })
        if (result.csrf_token) {
          (window as any).csrf_token = result.csrf_token;
          (window as any).frappe = (window as any).frappe || {};
          (window as any).frappe.csrf_token = result.csrf_token;
        }
        
        loginAsEmployee(
          result.employee || username,
          result.employee_name || username,
          result.pos_role || "Cashier",
          result.allowed_pos_profiles
        )
        
        const from = (location.state as any)?.from?.pathname || "/pos"
        navigate(from, { replace: true })
      } else {
        setError(result.error || "Invalid POS credentials.")
      }
    } catch {
      setError("Connection error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const posProfileName = posLoading ? "..." : (posDetails?.name === "System Default" ? "Terminal" : posDetails?.name || "Terminal")

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#eef1f8' }}>
      <div className="relative z-10 w-full max-w-sm animate-in fade-in zoom-in-95 duration-500">
        <div className="rounded-[40px] shadow-xl p-10 bg-white border border-gray-100">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <div className="p-1 bg-gradient-to-tr from-ziditech-600 to-ziditech-400 rounded-3xl shadow-lg">
                <img src="/assets/sultan/sultan_spa/managelyLogo.webp" alt="Managely" className="w-20 h-20 rounded-[22px] object-cover" />
              </div>
            </div>
            <h2 className="text-lg font-bold text-[#1e2d6b] mb-1">{posProfileName}</h2>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Employee Login</p>
          </div>

          <form onSubmit={handlePosLogin} className="space-y-5">
            <div className="space-y-4">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-6 py-4 rounded-2xl focus:outline-none transition-all duration-300 font-bold bg-gray-50 border border-gray-200 text-gray-800 focus:border-ziditech-500 focus:bg-white"
                placeholder="POS Username"
                autoComplete="off"
                required
              />
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-6 py-4 pr-14 rounded-2xl focus:outline-none transition-all duration-300 font-bold bg-gray-50 border border-gray-200 text-gray-800 focus:border-ziditech-500 focus:bg-white"
                  placeholder="POS Password"
                  autoComplete="off"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-4 rounded-2xl text-center bg-red-50 border border-red-100">
                <p className="text-[10px] text-red-500 font-black uppercase tracking-wider">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ziditech-600 text-white font-black py-4 px-6 rounded-2xl hover:bg-ziditech-500 transition-all duration-300 shadow-md shadow-ziditech-600/20 disabled:opacity-50 uppercase tracking-widest text-sm mt-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function Eye({ size = 24 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOff({ size = 24 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  )
}
