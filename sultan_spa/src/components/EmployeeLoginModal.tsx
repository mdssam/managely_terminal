import { useState, useRef, useEffect } from "react"
import { Loader2, Eye, EyeOff, UserCircle2 } from "lucide-react"
import { verifyEmployeeLogin } from "../services/employeeAuth"

interface Props {
  isOpen: boolean
  onSuccess: (employee: string, employeeName: string) => void
  onCancel: () => void
  title?: string
}

export default function EmployeeLoginModal({
  isOpen, onSuccess, onCancel, title = "Cashier Login",
}: Props) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setUsername("")
      setPassword("")
      setError("")
      setTimeout(() => usernameRef.current?.focus(), 100)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      setError("Please enter username and password.")
      return
    }
    setLoading(true)
    setError("")
    try {
      const result = await verifyEmployeeLogin(username.trim(), password)
      if (result.success && result.employee) {
        onSuccess(result.employee, result.employee_name ?? result.employee)
      } else {
        setError(result.error || "Invalid credentials. Try again.")
        setPassword("")
      }
    } catch {
      setError("Connection error. Try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
        {/* Header */}
        <div className="px-6 pt-6 pb-2 text-center">
          <div className="w-14 h-14 rounded-full bg-ziditech-100 dark:bg-ziditech-900/30 flex items-center justify-center mx-auto mb-3">
            <UserCircle2 className="w-8 h-8 text-gray-900" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Enter your POS credentials to continue
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Username */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
              Username
            </label>
            <input
              ref={usernameRef}
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError("") }}
              onKeyDown={handleKey}
              placeholder="POS username"
              autoComplete="off"
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ziditech-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => { setPassword(e.target.value); setError("") }}
                onKeyDown={handleKey}
                placeholder="POS password"
                autoComplete="off"
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ziditech-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowPass(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !username.trim() || !password}
            className="flex-1 py-3 rounded-xl bg-ziditech-600 hover:bg-ziditech-700 disabled:bg-ziditech-300 text-white font-bold transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? "Verifying..." : "Login"}
          </button>
        </div>
      </div>
    </div>
  )
}
