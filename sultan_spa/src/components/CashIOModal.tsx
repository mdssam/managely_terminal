import { useState, useEffect } from "react"
import { X, ArrowDownCircle, ArrowUpCircle, Loader2 } from "lucide-react"
import { createCashTransaction } from "../services/cashTransaction"
import { toast } from "react-toastify"
import { formatNumberWithCommas, parseNumberFromCommas } from "../utils/currency"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  currency?: string
  allowedModes?: Array<{ name: string; currency: string; symbol: string }>
  posSession?: string
}

export default function CashIOModal({
  isOpen, onClose, onSuccess, currency = "SAR", allowedModes = [], posSession,
}: Props) {
  const [type, setType] = useState<"Cash In" | "Cash Out">("Cash In")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [modeOfPayment, setModeOfPayment] = useState(allowedModes[0]?.name ?? "")
  const [loading, setLoading] = useState(false)

  // allowedModes loads async — sync the selected mode whenever the list arrives or modal is opened
  useEffect(() => {
    if (isOpen && allowedModes.length > 0) {
      setModeOfPayment(allowedModes[0].name)
    }
  }, [isOpen, allowedModes])

  if (!isOpen) return null

  const handleSubmit = async () => {
    const amt = parseFloat(parseNumberFromCommas(amount))
    if (!amt || amt <= 0) { toast.error("Please enter a valid amount greater than zero."); return }
    if (!description.trim()) { toast.error("Please enter a description / reason."); return }
    if (!modeOfPayment) { toast.error("Please select a payment method."); return }

    setLoading(true)
    try {
      const result = await createCashTransaction(type, amt, description.trim(), modeOfPayment, posSession)
      if (result.success) {
        toast.success(result.message || `${type} recorded successfully`)
        setAmount("")
        setDescription("")
        onSuccess?.()
        onClose()
      } else {
        toast.error(result.error || "Failed to record transaction")
      }
    } catch (err: any) {
      toast.error(err.message || "Unexpected error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Cash In / Cash Out</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Transaction type toggle */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setType("Cash In")}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold transition-all ${
                type === "Cash In"
                  ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-green-300"
              }`}
            >
              <ArrowDownCircle className="w-5 h-5" />
              Cash In
            </button>
            <button
              type="button"
              onClick={() => setType("Cash Out")}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold transition-all ${
                type === "Cash Out"
                  ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                  : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-red-300"
              }`}
            >
              <ArrowUpCircle className="w-5 h-5" />
              Cash Out
            </button>
          </div>

          {/* Payment method */}
          {allowedModes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Payment Method
              </label>
              <select
                value={modeOfPayment}
                onChange={(e) => setModeOfPayment(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-ziditech-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {allowedModes.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Amount ({(() => {
                const selected = allowedModes.find((m) => m.name === modeOfPayment);
                return selected?.symbol || selected?.currency || currency;
              })()})
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(formatNumberWithCommas(e.target.value))}
              placeholder="0.00"
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-ziditech-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description / Reason
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Petty cash for office supplies"
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-ziditech-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={`flex-1 py-3 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 ${
                type === "Cash In"
                  ? "bg-green-600 hover:bg-green-700 disabled:bg-green-400"
                  : "bg-red-600 hover:bg-red-700 disabled:bg-red-400"
              } disabled:cursor-not-allowed`}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
              ) : (
                `Record ${type}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
