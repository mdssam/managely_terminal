import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Store,
  TrendingDown,
  TrendingUp,
  User,
  Clock,
  ArrowLeft,
  ArrowLeftRight,
} from "lucide-react"
import BottomNavigation from "../components/BottomNavigation"
import { useMediaQuery } from "../hooks/useMediaQuery"
import { usePOSDetails } from "../hooks/usePOSProfile"
import { useUserInfo } from "../hooks/useUserInfo"
import { useAuth } from "../hooks/useAuth"
import { formatCurrency } from "../utils/currency"
import { toast } from "react-toastify"
import erpnextAPI from "../services/erpnext-api"
import { dbGet, dbSet, APP_CACHE_STORE } from "../services/offlineDB"
import CashIOModal from "../components/CashIOModal"
import { useCashIOFeature } from "../hooks/useCashIOFeature"

interface CashTransaction {
  name: string
  transaction_type: "Cash In" | "Cash Out"
  amount: number
  description: string
  mode_of_payment: string
  posting_date: string
  posting_time: string
  session: string
  pos_profile: string
  cashier: string
}

const formatTime = (timeStr: string): string => {
  if (!timeStr) return "00:00:00"
  const timeWithoutMs = timeStr.split(".")[0]
  const parts = timeWithoutMs.split(":")
  if (parts.length >= 2) {
    const hh = parts[0].padStart(2, "0")
    const mm = parts[1].padStart(2, "0")
    const ss = parts[2] ? parts[2].padStart(2, "0") : "00"
    return `${hh}:${mm}:${ss}`
  }
  return timeStr
}

export default function CashTransactionsReportPage() {
  const navigate = useNavigate()
  const isMobile = useMediaQuery("(max-width: 1024px)")
  const { posDetails } = usePOSDetails()
  const { userInfo, isLoading: userInfoLoading } = useUserInfo()
  const { user } = useAuth()

  const [transactions, setTransactions] = useState<CashTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters state
  const [branchFilter, setBranchFilter] = useState("all")
  const [branches, setBranches] = useState<string[]>([])
  const [showBranchDropdown, setShowBranchDropdown] = useState(false)
  const [timeRange, setTimeRange] = useState("")
  const [showTimeDropdown, setShowTimeDropdown] = useState(false)
  const [customFromDate, setCustomFromDate] = useState("")
  const [customToDate, setCustomToDate] = useState("")
  const [showCustomDateModal, setShowCustomDateModal] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  const roleLower = user?.role?.toLowerCase() || userInfo?.role?.toLowerCase() || "";
  const isAuditor = roleLower === "auditor" || roleLower === "branch manager";
  const isAdminUser = user?.is_employee
    ? roleLower === "administrator"
    : ((userInfo?.is_admin_user || false) || roleLower === "administrator");
  const isPrivileged = isAdminUser || isAuditor
  const [showCashIO, setShowCashIO] = useState(false)
  const cashIO = useCashIOFeature(posDetails?.name as string | undefined)
  const canRecord = !isAuditor && cashIO.enabled;

  // Fetch branches
  useEffect(() => {
    const employeeParam = user?.is_employee ? `?employee=${encodeURIComponent(user.name)}` : '';
    fetch(`/api/method/sultan.sultan.api.pos_profile.get_dashboard_branches${employeeParam}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.message) {
          setBranches(res.message)
        }
      })
      .catch((err) => console.error("Error fetching branches:", err))
  }, [user])

  // Fetch report data
  const fetchReportData = async () => {
    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (branchFilter !== "all") params.append("pos_profile", branchFilter)
    if (timeRange) params.append("time_range", timeRange)
    if (customFromDate) params.append("from_date", customFromDate)
    if (customToDate) params.append("to_date", customToDate)
    if (user?.is_employee) params.append("employee", user.name)

    const cacheKey = `cash_io_report_${branchFilter}_${timeRange}_${customFromDate}_${customToDate}_${user?.name || 'default'}`;

    const loadOfflineFallback = async () => {
      try {
        const cached = await dbGet<CashTransaction[]>(APP_CACHE_STORE, "cash_io_report_14_days") || [];
        const offlineList = await dbGet<any[]>(APP_CACHE_STORE, "offline_cash_transactions") || [];
        const unsynced = offlineList.filter(t => !t.synced).map(t => ({
          ...t,
          session: t.session || t.pos_session || "Offline Session",
          pos_profile: t.pos_profile || "Offline Profile",
          cashier: t.cashier || "Cashier"
        }));

        // Combine all cached and unsynced
        const allTransactions = [...unsynced, ...cached.filter((c: any) => !unsynced.some(u => u.name === c.name))];

        // Apply filters locally on the combined list
        const todayStr = new Date().toISOString().split("T")[0];
        const sevenDaysAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const thirtyDaysAgoStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

        const filtered = allTransactions.filter(t => {
          // 1. Branch filter
          if (branchFilter !== "all" && t.pos_profile !== branchFilter) return false;

          // 2. Time range / Session filter
          if (timeRange === "today") {
            if (t.posting_date !== todayStr) return false;
          } else if (timeRange === "week") {
            if (t.posting_date < sevenDaysAgoStr) return false;
          } else if (timeRange === "month") {
            if (t.posting_date < thirtyDaysAgoStr) return false;
          } else if (timeRange === "") {
            // Current session
            const currentSession = posDetails?.current_opening_entry;
            if (currentSession && t.session !== currentSession) return false;
          }

          // 3. Custom Date Range filter
          if (customFromDate && t.posting_date < customFromDate) return false;
          if (customToDate && t.posting_date > customToDate) return false;

          return true;
        });

        setTransactions(filtered);
      } catch (cacheErr) {
        console.error("Failed to load cached cash report:", cacheErr);
      }
    };

    // Background cache update for 14-day history when online
    if (typeof window !== "undefined" && navigator.onLine) {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split("T")[0];
      const todayStr = new Date().toISOString().split("T")[0];
      const historyParams = new URLSearchParams();
      historyParams.append("from_date", fourteenDaysAgoStr);
      historyParams.append("to_date", todayStr);
      historyParams.append("time_range", "custom");
      if (user?.is_employee) historyParams.append("employee", user.name);

      const historyUrl = `/api/method/sultan.sultan.api.cash_transaction.get_cash_io_report_data?${historyParams.toString()}`;
      erpnextAPI.makeAPICall(historyUrl)
        .then(r => r.json())
        .then(res => {
          if (res.message && res.message.success) {
            dbSet(APP_CACHE_STORE, "cash_io_report_14_days", res.message.data || []).catch(e => console.error(e));
          }
        })
        .catch(e => console.warn("Failed to background sync 14-day cash report history:", e));
    }

    if (typeof window !== "undefined" && !navigator.onLine) {
      await loadOfflineFallback();
      setIsLoading(false);
      return;
    }

    const url = `/api/method/sultan.sultan.api.cash_transaction.get_cash_io_report_data?${params.toString()}`

    try {
      const res = await erpnextAPI.makeAPICall(url);
      const data = await res.json();
      if (data.message && data.message.success) {
        const fetchedData = data.message.data || [];
        
        // Merge any unsynced offline transactions
        const offlineList = await dbGet<any[]>(APP_CACHE_STORE, "offline_cash_transactions") || [];
        const unsynced = offlineList.filter(t => !t.synced);
        const filteredUnsynced = unsynced.filter(t => {
          if (branchFilter !== "all" && t.pos_profile !== branchFilter) return false;
          if (timeRange === "today") {
            const todayStr = new Date().toISOString().split("T")[0];
            if (t.posting_date !== todayStr) return false;
          }
          if (customFromDate && t.posting_date < customFromDate) return false;
          if (customToDate && t.posting_date > customToDate) return false;
          return true;
        }).map(t => ({
          ...t,
          session: t.session || t.pos_session || "Offline Session",
          pos_profile: t.pos_profile || "Offline Profile",
          cashier: t.cashier || "Cashier"
        }));

        const merged = [...filteredUnsynced, ...fetchedData.filter((c: any) => !filteredUnsynced.some(u => u.name === c.name))];
        setTransactions(merged);
        
        // Cache the online fetched data (without unsynced local data to avoid duplicate syncing issues in cache)
        await dbSet(APP_CACHE_STORE, cacheKey, fetchedData);
      } else {
        throw new Error(data.message?.error || data.error || "Failed to fetch data");
      }
    } catch (err: any) {
      console.warn("Error fetching cash I/O report, trying cache:", err);
      await loadOfflineFallback();
      setError(err.message || "Failed to load report data");
      toast.error(err.message || "Failed to load report data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchReportData()
  }, [branchFilter, timeRange, customFromDate, customToDate])

  // Summary statistics
  const summary = useMemo(() => {
    let totalIn = 0
    let totalOut = 0
    transactions.forEach((tx) => {
      if (tx.transaction_type === "Cash In") {
        totalIn += tx.amount
      } else if (tx.transaction_type === "Cash Out") {
        totalOut += tx.amount
      }
    })
    return {
      cashIn: totalIn,
      cashOut: totalOut,
      net: totalIn - totalOut,
    }
  }, [transactions])

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return transactions.slice(start, start + itemsPerPage)
  }, [transactions, currentPage])

  const totalPages = Math.ceil(transactions.length / itemsPerPage) || 1

  const timeRangeOptions = [
    { label: "Current Session", value: "" },
    { label: "Today", value: "today" },
    { label: "This Week", value: "week" },
    { label: "This Month", value: "month" },
    { label: "Custom Dates", value: "custom" },
  ]

  const activeTimeLabel = timeRangeOptions.find((o) => o.value === timeRange)?.label || "Period"

  const handleExportCSV = () => {
    if (!transactions.length) {
      toast.info("No records to export")
      return
    }
    const headers = ["Date", "Time", "Session", "POS Profile", "Type", "Mode", "Amount", "Description"]
    const rows = transactions.map((t) => [
      t.posting_date,
      formatTime(t.posting_time),
      t.session,
      t.pos_profile,
      t.transaction_type,
      t.mode_of_payment,
      t.amount,
      `"${(t.description || "").replace(/"/g, '""')}"`,
    ])
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `cash_in_out_report_${new Date().toISOString().split("T")[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#eef1f8" }}>
      {/* Top navbar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/sales_dashboard")}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">Cash In / Cash Out Report</h1>
            <p className="text-xs text-gray-500">View drawer movements and logs</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canRecord && (
            <button
              onClick={() => setShowCashIO(true)}
              className="flex items-center justify-center space-x-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm hover:bg-green-700 hover:opacity-90"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>Record IN/OUT</span>
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="flex items-center justify-center space-x-2 px-5 py-2.5 text-white rounded-lg text-sm font-medium transition-all shadow-sm hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #3a76fc 0%, #1a53d3 100%)' }}
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Main body content */}
      <main className="flex-1 p-4 lg:p-6 space-y-5 max-w-7xl mx-auto w-full mb-20 lg:mb-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-gray-200">
          {/* Period Selection */}
          <div className="relative">
            <button
              onClick={() => setShowTimeDropdown(!showTimeDropdown)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-xs transition-colors hover:bg-gray-50"
              style={{ backgroundColor: "#f8fafc", color: "#475569", fontWeight: 500 }}
            >
              <Calendar className="w-3.5 h-3.5" style={{ color: "#475569" }} />
              {activeTimeLabel}
              <ChevronDown className="w-3 h-3" style={{ color: "#475569" }} />
            </button>
            {showTimeDropdown && (
              <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[180px]">
                {timeRangeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setShowTimeDropdown(false)
                      if (opt.value === "custom") {
                        setShowCustomDateModal(true)
                      } else {
                        setTimeRange(opt.value)
                        setCustomFromDate("")
                        setCustomToDate("")
                      }
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors"
                    style={{
                      color: timeRange === opt.value ? "#1e2d6b" : "#475569",
                      fontWeight: timeRange === opt.value ? 600 : 400,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Branch dropdown — privileged users only */}
          {isPrivileged && branches.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-xs transition-colors hover:bg-gray-50"
                style={{ backgroundColor: "#f8fafc", color: "#475569", fontWeight: 500 }}
              >
                <Store className="w-3.5 h-3.5" style={{ color: "#475569" }} />
                {branchFilter === "all" ? "All Branches" : branchFilter}
                <ChevronDown className="w-3 h-3" style={{ color: "#475569" }} />
              </button>
              {showBranchDropdown && (
                <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[180px]">
                  <button
                    onClick={() => {
                      setBranchFilter("all")
                      setShowBranchDropdown(false)
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors"
                    style={{
                      color: branchFilter === "all" ? "#1e2d6b" : "#475569",
                      fontWeight: branchFilter === "all" ? 600 : 400,
                    }}
                  >
                    All Branches
                  </button>
                  {branches.map((b) => (
                    <button
                      key={b}
                      onClick={() => {
                        setBranchFilter(b)
                        setShowBranchDropdown(false)
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors"
                      style={{
                        color: branchFilter === b ? "#1e2d6b" : "#475569",
                        fontWeight: branchFilter === b ? 600 : 400,
                      }}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Active Custom Range Badge */}
          {timeRange === "custom" && customFromDate && customToDate && (
            <div className="text-xs text-[#1e2d6b] bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 flex items-center gap-1.5 font-medium">
              <span>
                {customFromDate} to {customToDate}
              </span>
              <button
                onClick={() => {
                  setTimeRange("")
                  setCustomFromDate("")
                  setCustomToDate("")
                }}
                className="hover:text-red-500 font-bold ml-1"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              label: "Total Cash In",
              value: formatCurrency(summary.cashIn, posDetails?.currency || ""),
              icon: TrendingUp,
              color: "#16a34a",
              bgColor: "#e8f5e9",
            },
            {
              label: "Total Cash Out",
              value: formatCurrency(summary.cashOut, posDetails?.currency || ""),
              icon: TrendingDown,
              color: "#ef4444",
              bgColor: "#ffebee",
            },
          ].map((card, idx) => (
            <div key={idx} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: card.bgColor }}>
                <card.icon className="w-5 h-5" style={{ color: card.color }} />
              </div>
            </div>
          ))}
        </div>

        {/* Report Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Transaction History ({transactions.length})</h3>
          </div>

          {isLoading ? (
            <div className="py-20 text-center flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent border-[#1e2d6b] mb-3"></div>
              <span className="text-sm font-medium text-gray-500">Loading transactions...</span>
            </div>
          ) : error ? (
            <div className="py-20 text-center text-red-500 font-medium">{error}</div>
          ) : transactions.length === 0 ? (
            <div className="py-20 text-center text-gray-400 font-medium">No Cash In or Cash Out transactions found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Date/Time", "Session ID", "Branch", "Type", "Mode", "Amount", "Description"].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedTransactions.map((tx) => (
                    <tr key={tx.name} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="text-sm font-semibold text-gray-900">{tx.posting_date}</div>
                        <div className="text-xs text-gray-400">{formatTime(tx.posting_time)}</div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-700">{tx.session}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-700">{tx.pos_profile}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            tx.transaction_type === "Cash In"
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                          }`}
                        >
                          {tx.transaction_type === "Cash In" ? "IN" : "OUT"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-700">{tx.mode_of_payment}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="text-sm font-bold text-gray-900">
                          {formatCurrency(tx.amount, posDetails?.currency || "")}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500 max-w-[200px] truncate" title={tx.description}>
                        {tx.description || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && transactions.length > 0 && (
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
              <span className="text-sm text-gray-600">
                Showing <span className="font-semibold">{(currentPage - 1) * itemsPerPage + 1}</span> to{" "}
                <span className="font-semibold">{Math.min(currentPage * itemsPerPage, transactions.length)}</span> of{" "}
                <span className="font-semibold">{transactions.length}</span> results
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm font-medium text-gray-700 px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Custom Date Modal */}
      {showCustomDateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-gray-200 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">Custom Date Range</h3>
              <p className="text-xs text-gray-500">Select start and end dates for the report</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">From Date</label>
                <input
                  type="date"
                  value={customFromDate}
                  onChange={(e) => setCustomFromDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:border-[#1e2d6b]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">To Date</label>
                <input
                  type="date"
                  value={customToDate}
                  onChange={(e) => setCustomToDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:border-[#1e2d6b]"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => {
                  setShowCustomDateModal(false)
                  setCustomFromDate("")
                  setCustomToDate("")
                }}
                className="px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!customFromDate || !customToDate) {
                    toast.warn("Please select both dates")
                    return
                  }
                  setTimeRange("custom")
                  setShowCustomDateModal(false)
                }}
                className="px-4 py-2 text-xs font-semibold bg-[#1e2d6b] text-white rounded-xl transition-colors hover:opacity-90"
              >
                Apply Range
              </button>
            </div>
          </div>
        </div>
      )}

      {isMobile && <BottomNavigation />}

      <CashIOModal
        isOpen={showCashIO}
        onClose={() => setShowCashIO(false)}
        onSuccess={fetchReportData}
        currency={posDetails?.currency}
        allowedModes={cashIO.allowed_modes}
        posSession={(posDetails as any)?.current_opening_entry}
      />
    </div>
  )
}
