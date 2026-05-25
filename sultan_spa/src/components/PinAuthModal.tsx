import { useState, useRef, useEffect } from "react"
import { Loader2, Delete } from "lucide-react"
import { verifyPosPin } from "../services/pinAuth"

interface Props {
  isOpen: boolean
  onSuccess: () => void
  onCancel: () => void
  title?: string
}

export default function PinAuthModal({ isOpen, onSuccess, onCancel, title = "Enter PIN" }: Props) {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setDigits(["", "", "", "", "", ""])
      setError("")
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  if (!isOpen) return null

  const pinStr = digits.join("").trim()

  const handleDigit = (d: string) => {
    if (!/^\d$/.test(d)) return
    setError("")
    const next = [...digits]
    const idx = next.findIndex(v => v === "")
    if (idx === -1) return
    next[idx] = d
    setDigits(next)
    if (next.every(v => v !== "") && next.filter(v => v !== "").length >= 4) {
      submitPin(next.join(""))
    }
  }

  const handleBackspace = () => {
    const next = [...digits]
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i] !== "") { next[i] = ""; break }
    }
    setDigits(next)
    setError("")
  }

  const submitPin = async (pin: string) => {
    setLoading(true)
    setError("")
    try {
      const result = await verifyPosPin(pin)
      if (result.success) {
        onSuccess()
      } else {
        setError(result.error || "Incorrect PIN. Try again.")
        setDigits(["", "", "", "", "", ""])
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    } catch {
      setError("Connection error. Try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = () => {
    const filled = digits.filter(v => v !== "")
    if (filled.length < 4) { setError("PIN must be at least 4 digits."); return }
    submitPin(filled.join(""))
  }

  const PAD = ["1","2","3","4","5","6","7","8","9","","0","⌫"]

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      {/* hidden keyboard catcher for mobile */}
      <input
        ref={inputRef}
        type="number"
        inputMode="numeric"
        className="sr-only"
        onKeyDown={e => {
          if (e.key === "Backspace") handleBackspace()
          else if (/^\d$/.test(e.key)) handleDigit(e.key)
          else if (e.key === "Enter") handleSubmit()
        }}
      />

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xs">
        {/* Header */}
        <div className="px-6 pt-6 pb-2 text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Enter your cashier PIN to continue</p>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-3 py-5">
          {digits.slice(0, Math.max(4, digits.filter(v => v !== "").length + 1)).map((v, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all ${
                v !== ""
                  ? "bg-ziditech-600 border-ziditech-600"
                  : "bg-transparent border-gray-300 dark:border-gray-600"
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="text-center text-sm text-red-600 px-6 -mt-2 mb-2">{error}</p>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2 px-6 pb-4">
          {PAD.map((key, i) => {
            if (key === "") return <div key={i} />
            if (key === "⌫") return (
              <button
                key={i}
                onClick={handleBackspace}
                disabled={loading}
                className="h-14 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-all"
              >
                <Delete className="w-5 h-5" />
              </button>
            )
            return (
              <button
                key={i}
                onClick={() => handleDigit(key)}
                disabled={loading}
                className="h-14 rounded-xl text-xl font-bold text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-all"
              >
                {key}
              </button>
            )
          })}
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
            disabled={loading || pinStr.length < 4}
            className="flex-1 py-3 rounded-xl bg-ziditech-600 hover:bg-ziditech-700 disabled:bg-ziditech-300 text-white font-bold transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? "Verifying..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  )
}
