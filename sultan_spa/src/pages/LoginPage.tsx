import type React from "react"
import { useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [otp, setOtp] = useState("")
  const [tmpId, setTmpId] = useState("")
  const [verificationPrompt, setVerificationPrompt] = useState("")
  const [isOtpStep, setIsOtpStep] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const result = await login(username, password)

      if (result.success) {
        // Redirect to the intended route or default to /pos
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const from = (location.state as any)?.from?.pathname || "/pos"
        navigate(from, { replace: true })
      } else if (result.requires_otp && result.tmp_id) {
        setTmpId(result.tmp_id)
        setVerificationPrompt(result.verification?.prompt || "Enter the verification code to continue.")
        setIsOtpStep(true)
      } else {
        // Show user-friendly error messages
        setError(getUserFriendlyErrorMessage(result.message))
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.")
      console.error("Login error:", err)
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
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const from = (location.state as any)?.from?.pathname || "/pos"
        navigate(from, { replace: true })
      } else if (result.requires_otp && result.tmp_id) {
        // keep challenge alive if backend rotates tmp_id
        setTmpId(result.tmp_id)
        setVerificationPrompt(result.verification?.prompt || verificationPrompt)
        setError(getUserFriendlyErrorMessage(result.message))
      } else {
        setError(getUserFriendlyErrorMessage(result.message))
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.")
      console.error("OTP verify error:", err)
    } finally {
      setLoading(false)
    }
  }

  const getUserFriendlyErrorMessage = (message: string): string => {
    if (message.includes('HTTP 401') || message.includes('401')) {
      return "Invalid username or password."
    }
    if (message.includes('HTTP 403') || message.includes('403')) {
      return "Access denied."
    }
    if (message.includes('Network error') || message.includes('fetch')) {
      return "Network error. Check your connection."
    }
    if (message && !message.includes('HTTP') && !message.includes('Error:')) {
      return message
    }
    return "Login failed. Please try again."
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#0D0033' }}>
      {/* Background Pattern */}
      <div className="fixed inset-0 bg-grid-pattern opacity-5 pointer-events-none"></div>

      {/* Decorative Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-ziditech-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm animate-in fade-in zoom-in-95 duration-500">
        {/* Login Card */}
        <div className="rounded-[40px] shadow-3xl p-10 backdrop-blur-xl" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {/* Logo Section */}
          <div className="text-center mb-10">
            <div className="flex justify-center mb-6">
              <div className="p-1 bg-gradient-to-tr from-ziditech-600 to-ziditech-400 rounded-3xl shadow-2xl">
                <img src="/assets/sultan/sultan_spa/bev_logo.jpeg" alt="Sultan POS" className="w-20 h-20 rounded-[22px] object-cover" />
              </div>
            </div>
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase">Sultan POS</h1>
            <p className="text-[10px] font-black text-ziditech-400 uppercase tracking-[0.3em] mt-2">Sign in to Terminal</p>
          </div>

          <form onSubmit={isOtpStep ? handleVerifyOtp : handleLogin} className="space-y-5">
            <div className="space-y-4">
              {!isOtpStep ? (
                <>
                  <div className="relative group">
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-6 py-4 rounded-2xl focus:outline-none transition-all duration-300 font-bold"
                      style={{ 
                        backgroundColor: 'rgba(255,255,255,0.05)', 
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#f0eeff'
                      }}
                      placeholder="Username"
                      required
                    />
                  </div>

                  <div className="relative group">
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-6 py-4 rounded-2xl focus:outline-none transition-all duration-300 font-bold"
                      style={{ 
                        backgroundColor: 'rgba(255,255,255,0.05)', 
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#f0eeff'
                      }}
                      placeholder="Password"
                      required
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 rounded-2xl text-center" style={{ backgroundColor: 'rgba(124,96,245,0.1)', border: '1px solid rgba(124,96,245,0.2)' }}>
                    <p className="text-xs font-bold text-ziditech-300 uppercase tracking-wider">
                      {verificationPrompt || "Enter code to continue"}
                    </p>
                  </div>
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full px-6 py-4 rounded-2xl focus:outline-none transition-all duration-300 font-bold text-center text-2xl tracking-[0.5em]"
                    style={{ 
                      backgroundColor: 'rgba(255,255,255,0.05)', 
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#f0eeff'
                    }}
                    placeholder="••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setIsOtpStep(false)}
                    className="w-full text-[10px] font-black text-ziditech-400 hover:text-white uppercase tracking-widest transition-colors"
                  >
                    Back to Login
                  </button>
                </>
              )}
            </div>

            {error && (
              <div className="p-4 rounded-2xl text-center animate-shake" style={{ backgroundColor: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
                <p className="text-[10px] text-red-400 font-black uppercase tracking-wider">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ziditech-600 text-white font-black py-4 px-6 rounded-2xl hover:bg-ziditech-500 transition-all duration-300 shadow-xl shadow-ziditech-600/20 disabled:opacity-50 uppercase tracking-widest text-sm"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                isOtpStep ? "Verify" : "Sign In"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-[10px] font-black text-ziditech-400 uppercase tracking-[0.3em]">
            © 2026 Powered by <span className="text-ziditech-300">Sultan</span>
          </p>
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
