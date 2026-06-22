import type React from "react"
import { useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"
import { useEffect } from "react"
import { dbSet, APP_CACHE_STORE } from "../services/offlineDB"

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [otp, setOtp] = useState("")
  const [tmpId, setTmpId] = useState("")
  const [verificationPrompt, setVerificationPrompt] = useState("")
  const [isOtpStep, setIsOtpStep] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isAuthenticated, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const from = (location.state as any)?.from?.pathname || "/"
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, authLoading, navigate, location])

  const handleAccountLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const result = await login(username, password)
      if (result.success) {
        const from = (location.state as any)?.from?.pathname || "/pos"
        navigate(from, { replace: true })
      } else if (result.requires_otp && result.tmp_id) {
        setTmpId(result.tmp_id)
        setVerificationPrompt(result.verification?.prompt || "Enter the verification code to continue.")
        setIsOtpStep(true)
      } else {
        setError(getUserFriendlyErrorMessage(result.message))
      }
    } catch {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const result = await login(username, password, otp, tmpId)
      if (result.success) {
        const from = (location.state as any)?.from?.pathname || "/pos"
        navigate(from, { replace: true })
      } else if (result.requires_otp && result.tmp_id) {
        setTmpId(result.tmp_id)
        setVerificationPrompt(result.verification?.prompt || verificationPrompt)
        setError(getUserFriendlyErrorMessage(result.message))
      } else {
        setError(getUserFriendlyErrorMessage(result.message))
      }
    } catch {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }



  const getUserFriendlyErrorMessage = (message: string): string => {
    if (!message) return "Login failed. Please try again."
    if (message.includes('HTTP 401') || message.includes('401')) return "Invalid username or password."
    if (message.includes('HTTP 403') || message.includes('403')) return "Access denied."
    if (message.includes('Network error') || message.includes('fetch')) return "Network error. Check your connection."
    if (!message.includes('HTTP') && !message.includes('Error:')) return message
    return "Login failed. Please try again."
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#0D0033' }}>
      <div className="fixed inset-0 bg-grid-pattern opacity-5 pointer-events-none"></div>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-ziditech-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm animate-in fade-in zoom-in-95 duration-500">
        <div className="rounded-[40px] shadow-3xl p-10 backdrop-blur-xl" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <div className="p-1 bg-gradient-to-tr from-ziditech-600 to-ziditech-400 rounded-3xl shadow-2xl">
                <img src="/assets/sultan/sultan_spa/managelyLogo.webp" alt="Managely" className="w-20 h-20 rounded-[22px] object-cover" />
              </div>
            </div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mt-2">Sign in to Terminal</p>
          </div>

          {/* Account Login Form */}
          <form onSubmit={isOtpStep ? handleVerifyOtp : handleAccountLogin} className="space-y-5">
            <div className="space-y-4">
              {!isOtpStep ? (
                <>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-6 py-4 rounded-2xl focus:outline-none transition-all duration-300 font-bold"
                    style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#f0eeff' }}
                    placeholder="Username or Email"
                    required
                  />
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-6 py-4 pr-14 rounded-2xl focus:outline-none transition-all duration-300 font-bold"
                      style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#f0eeff' }}
                      placeholder="Password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 rounded-2xl text-center" style={{ backgroundColor: 'rgba(124,96,245,0.1)', border: '1px solid rgba(124,96,245,0.2)' }}>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{verificationPrompt || "Enter code to continue"}</p>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full px-6 py-4 rounded-2xl focus:outline-none transition-all duration-300 font-bold text-center text-2xl tracking-[0.5em]"
                    style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#f0eeff' }}
                    placeholder="••••••"
                    required
                  />
                  <button type="button" onClick={() => setIsOtpStep(false)} className="w-full text-[10px] font-black text-gray-500 hover:text-white uppercase tracking-widest transition-colors">
                    Back to Login
                  </button>
                </>
              )}
            </div>

            {error && (
              <div className="p-4 rounded-2xl text-center" style={{ backgroundColor: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
                <p className="text-[10px] text-red-400 font-black uppercase tracking-wider">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ziditech-600 text-white font-black py-4 px-6 rounded-2xl hover:bg-ziditech-500 transition-all duration-300 shadow-xl shadow-ziditech-600/20 disabled:opacity-50 uppercase tracking-widest text-sm"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : isOtpStep ? "Verify" : "Sign In"}
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
