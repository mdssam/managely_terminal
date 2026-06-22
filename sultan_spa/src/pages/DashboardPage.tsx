import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { formatCurrency } from "../utils/currency"
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  CreditCard,
  Calendar,
  Clock,
  BarChart3,
  PieChart,
  Activity,
  Users,
  Package,
  ArrowRight,
  ChevronDown,
  Store,
  Download,
} from "lucide-react"
import type { SalesInvoice } from "../../types"
import { toast } from "react-toastify"

import BottomNavigation from "../components/BottomNavigation"
import { useMediaQuery } from "../hooks/useMediaQuery"
import { usePOSDetails } from "../hooks/usePOSProfile"
import { useAllPaymentModes } from "../hooks/usePaymentModes"
import { useSalesInvoices } from "../hooks/useSalesInvoices"
import { useUserInfo } from "../hooks/useUserInfo"
import { useAuth } from "../hooks/useAuth"

/* ─────────────────────────────────────────────
   NOTE ON COLORS:
   The global CSS forces `div { color: black !important }`.
   To bypass this, we apply color via inline style directly on
   the <svg> Icon element (not on the wrapper div) because SVG
   is not in the selector list. Trend % spans avoid font-semibold
   which is also forced to black by the global CSS.
───────────────────────────────────────────── */

interface StatCardProps {
  label: string
  value: string
  trendUp: boolean
  trendVal: string
  icon: React.ElementType
  accentColor: string
}

function StatCard({ label, value, trendUp, trendVal, icon: Icon, accentColor }: StatCardProps) {
  return (
    <div
      className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-all duration-200"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          {/* label: use inline style, not a Tailwind class that'd get overridden */}
          <p className="text-xs font-medium tracking-wide uppercase" style={{ color: "#64748b" }}>
            {label}
          </p>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${accentColor}1a` }}
          >
            {/* Color on SVG directly — not on parent div — bypasses global CSS */}
            <Icon className="w-4 h-4" style={{ color: accentColor }} />
          </div>
        </div>
        <p className="text-2xl font-bold" style={{ color: "#000000" }}>{value}</p>
        <div className="flex items-center gap-1 mt-2">
          {trendUp
            ? <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            : <TrendingDown className="w-3.5 h-3.5 text-red-500" />
          }
          {/* Avoid font-semibold — global CSS forces font-semibold to black */}
          <span style={{ fontSize: "12px", fontWeight: 600, color: trendUp ? "#16a34a" : "#ef4444" }}>
            {trendVal}
          </span>
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>vs last period</span>
        </div>
      </div>
    </div>
  )
}

interface SectionCardProps {
  title: string
  icon: React.ElementType
  children: React.ReactNode
  action?: string
  onAction?: () => void
}

function SectionCard({ title, icon: Icon, children, action, onAction }: SectionCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#eef1f8" }}>
            {/* Color directly on SVG */}
            <Icon className="w-4 h-4" style={{ color: "#1e2d6b" }} />
          </div>
          <h3 className="text-sm font-bold" style={{ color: "#000000" }}>{title}</h3>
        </div>
        {action && onAction && (
          <button
            onClick={onAction}
            className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-gray-50"
            style={{ color: "#1e2d6b" }}
          >
            {action}
            <ArrowRight className="w-3 h-3" style={{ color: "#1e2d6b" }} />
          </button>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

interface FilterPillProps {
  label: string
  active: boolean
  onClick: () => void
}

function FilterPill({ label, active, onClick }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs transition-all duration-150 whitespace-nowrap"
      style={
        active
          ? { backgroundColor: "#1e2d6b", color: "#ffffff", fontWeight: 600 }
          : { backgroundColor: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", fontWeight: 500 }
      }
    >
      {label}
    </button>
  )
}

/* ════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════ */
export default function DashboardPage() {
  const navigate = useNavigate()
  const isMobile = useMediaQuery("(max-width: 1024px)")
  const { posDetails } = usePOSDetails()

  const [branchFilter, setBranchFilter] = useState("all")
  const [branches, setBranches] = useState<string[]>([])
  const [showBranchDropdown, setShowBranchDropdown] = useState(false)
  const [timeRange, setTimeRange] = useState("")
  const [cashierFilter, setCashierFilter] = useState("all")
  const [paymentFilter, setPaymentFilter] = useState("all")
  const [showCashierDropdown, setShowCashierDropdown] = useState(false)
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false)
  const [salesByHourGraphType, setSalesByHourGraphType] = useState<"bar" | "line">("bar")

  const { invoices, isLoading: invoicesLoading } = useSalesInvoices(
    "",
    timeRange !== "",
    undefined,
    true,
    branchFilter === "all" ? undefined : branchFilter
  )
  const { user } = useAuth()
  const { userInfo, isLoading: userInfoLoading } = useUserInfo()
  const { modes: sessionPaymentSummary } = useAllPaymentModes()

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

  const roleLower = user?.role?.toLowerCase() || userInfo?.role?.toLowerCase() || "";
  const isAuditor = roleLower === "auditor" || roleLower === "branch manager";
  const isAdminUser = user?.is_employee
    ? roleLower === "administrator"
    : ((userInfo?.is_admin_user || false) || roleLower === "administrator");
  const currentUserCashier = userInfo?.full_name || "Unknown"

  const submittedInvoices = invoices.filter(
    (inv) => inv.status !== "Draft" && inv.status !== "Cancelled"
  )
  const uniqueCashiers = [...new Set(submittedInvoices.map((inv: SalesInvoice) => inv.cashier))]

  useEffect(() => {
    if (userInfo && !isAdminUser && !isAuditor) setCashierFilter(currentUserCashier)
  }, [userInfo, isAdminUser, isAuditor, currentUserCashier])

  // ── Loading ──
  if (userInfoLoading || invoicesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#eef1f8" }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: "#1e2d6b" }} />
          <p className="mt-4 text-sm" style={{ color: "#64748b" }}>Loading dashboard…</p>
        </div>
      </div>
    )
  }

  // ── Access guard ──
  if (userInfo && !isAdminUser && !isAuditor) {
    navigate("/pos", { replace: true })
    return null
  }

  // ── Build payment type map early (used by both filter & display) ──
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _allModes = (sessionPaymentSummary || []) as any[]
  const modeToType: { [key: string]: string } = {}
  _allModes.forEach((m: any) => {
    const name = m.name || m.mode_of_payment
    if (name && m.type) modeToType[name] = m.type
  })
  const inferType = (modeName: string): string => {
    if (modeToType[modeName]) return modeToType[modeName]
    const l = modeName.toLowerCase()
    if (l.includes("cash") || l.includes("نقد")) return "Cash"
    if (l.includes("mada") || l.includes("مدى")) return "Mada"
    if (l.includes("stc")) return "STC Pay"
    if (l.includes("apple")) return "Apple Pay"
    if (l.includes("visa") || l.includes("master") || l.includes("credit")) return "Credit Card"
    if (l.includes("card") || l.includes("debit")) return "Card"
    if (l.includes("bank") || l.includes("transfer") || l.includes("تحويل")) return "Bank"
    return modeName
  }

  // ── Filter invoices ──
  const filteredInvoices = submittedInvoices.filter((invoice) => {
    const matchesCashier = cashierFilter === "all" || invoice.cashier === cashierFilter

    // Match by TYPE (Cash / Bank / etc.) not by raw mode name
    const matchesPayment = paymentFilter === "all" || (() => {
      if (invoice.payment_methods && Array.isArray(invoice.payment_methods)) {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        return invoice.payment_methods.some((p: any) => inferType(p.mode_of_payment) === paymentFilter)
      }
      return inferType(invoice.paymentMethod || "Cash") === paymentFilter
    })()

    const today = new Date().toISOString().split("T")[0]
    const matchesTime =
      timeRange === "" ||
      (timeRange === "today" && invoice.date === today) ||
      (timeRange === "week" && new Date(invoice.date) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) ||
      (timeRange === "month" && new Date(invoice.date) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    const matchesOpening =
      timeRange !== "" || isAdminUser || isAuditor || !posDetails?.current_opening_entry
        ? true
        : invoice.custom_pos_opening_entry === posDetails.current_opening_entry
    const matchesPOSProfile = true
    return matchesCashier && matchesPayment && matchesTime && matchesOpening && matchesPOSProfile
  })

  // ── Core stats ──
  const totalRevenue = filteredInvoices.reduce((s: number, inv: SalesInvoice) => s + inv.totalAmount, 0)
  const totalTransactions = filteredInvoices.length
  const averageOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0
  const totalItems = filteredInvoices.reduce((s: number, inv: SalesInvoice) => s + inv.items.length, 0)
  const currency = posDetails?.currency || (typeof window !== 'undefined' ? sessionStorage.getItem('pos_currency') : null) || ""

  const handleExportCSV = () => {
    if (!filteredInvoices.length) {
      toast.info("No records to export")
      return
    }
    const headers = ["Invoice ID", "Date", "Time", "Customer", "Cashier", "Payment Method", "Amount", "Status"]
    const rows = filteredInvoices.map((inv) => [
      inv.id,
      inv.date,
      inv.time,
      `"${(inv.customer || "").replace(/"/g, '""')}"`,
      `"${(inv.cashier || "").replace(/"/g, '""')}"`,
      inv.paymentMethod,
      inv.totalAmount,
      inv.status,
    ])
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `sales_dashboard_export_${new Date().toISOString().split("T")[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ── Sales by hour (today only) ──
  const salesByHourData = (() => {
    if (timeRange !== "today") return []
    const today = new Date().toISOString().split("T")[0]
    const todayInvoices = filteredInvoices.filter((inv) => inv.date === today)
    const hourlySales: { [key: string]: number } = {}
    for (let i = 9; i <= 20; i++) hourlySales[`${i.toString().padStart(2, "0")}:00`] = 0
    todayInvoices.forEach((invoice) => {
      const parts = invoice.time.split(":")
      if (parts.length >= 2) {
        // @ts-expect-error just ignore
        const hour = `${parts[0].padStart(2, "0")}:00`
        if (Object.prototype.hasOwnProperty.call(hourlySales, hour)) {
          // @ts-expect-error just ignore
          hourlySales[hour] += invoice.totalAmount
        }
      }
    })
    return Object.entries(hourlySales).map(([hour, sales]) => ({ hour, sales }))
  })()

  // ── Payment methods — grouped by TYPE (Cash / Bank / etc.) ──
  const paymentMethodsData = (() => {
    // Accumulate by type (uses inferType defined above)
    const typeMap: { [key: string]: { amount: number; transactions: number } } = {}

    filteredInvoices.forEach((invoice) => {
      if (invoice.payment_methods && Array.isArray(invoice.payment_methods)) {
        const typesInInvoice = new Set<string>()
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        invoice.payment_methods.forEach((payment: any) => {
          const type = inferType(payment.mode_of_payment)
          if (!typeMap[type]) typeMap[type] = { amount: 0, transactions: 0 }
          typeMap[type].amount += payment.amount
          typesInInvoice.add(type)
        })
        typesInInvoice.forEach((type) => { typeMap[type].transactions += 1 })
      } else {
        const type = inferType(invoice.paymentMethod || "Cash")
        if (!typeMap[type]) typeMap[type] = { amount: 0, transactions: 0 }
        typeMap[type].amount += invoice.totalAmount
        typeMap[type].transactions += 1
      }
    })

    const totalAmount = Object.values(typeMap).reduce((s, m) => s + m.amount, 0)
    return Object.entries(typeMap)
      .map(([method, data]) => ({
        method,
        amount: data.amount,
        percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
        transactions: data.transactions,
      }))
      .sort((a, b) => b.amount - a.amount)
  })()

  // ── All payment types (from ALL submitted invoices — stable list for dropdown) ──
  const allPaymentTypes = (() => {
    const types = new Set<string>()
    submittedInvoices.forEach((invoice) => {
      if (invoice.payment_methods && Array.isArray(invoice.payment_methods)) {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        invoice.payment_methods.forEach((p: any) => types.add(inferType(p.mode_of_payment)))
      } else {
        types.add(inferType(invoice.paymentMethod || "Cash"))
      }
    })
    return [...types].sort()
  })()

  // ── ZATCA ──
  const zatcaData = (() => {
    const statusCounts: { [key: string]: number } = {}
    filteredInvoices.forEach((inv) => {
      const status = (inv.custom_zatca_submit_status || "Draft") as string
      statusCounts[status] = (statusCounts[status] || 0) + 1
    })
    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0)
    const colorMap: { [key: string]: string } = {
      pending: "#f59e0b",
      reported: "#3b82f6",
      "not reported": "#9ca3af",
      cleared: "#16a34a",
      "not cleared": "#ef4444",
      draft: "#6b7280",
    }
    const segments = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
      color: colorMap[status.toLowerCase()] || "#9ca3af",
    }))
    return { total, segments: segments.sort((a, b) => b.count - a.count) }
  })()

  // ── Cashier leaderboard ──
  const cashierLeaderboard = (() => {
    const stats: { [key: string]: { name: string; sales: number; transactions: number } } = {}
    filteredInvoices.forEach((invoice) => {
      const cashier = invoice.cashier || "Unknown"
      if (!stats[cashier]) stats[cashier] = { name: cashier, sales: 0, transactions: 0 }
      stats[cashier].sales += invoice.totalAmount
      stats[cashier].transactions += 1
    })
    return Object.values(stats).sort((a, b) => b.sales - a.sales).slice(0, 5)
  })()

  // ── Top products ──
  const topProducts = (() => {
    const ps: { [k: string]: { name: string; sales: number; revenue: number } } = {}
    filteredInvoices.forEach((invoice) => {
      invoice.items.forEach((item) => {
        const k = item.item_code || item.item_name || "Unknown"
        if (!ps[k]) ps[k] = { name: item.item_name || item.item_code || "Unknown", sales: 0, revenue: 0 }
        ps[k].sales += item.qty || 0
        ps[k].revenue += (item.rate || 0) * (item.qty || 0)
      })
    })
    return Object.entries(ps)
      .map(([key, data]) => ({ id: key, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
  })()

  // ── Recent transactions ──
  const recentTransactions = [...filteredInvoices]
    .sort((a, b) => new Date(b.date + " " + b.time).getTime() - new Date(a.date + " " + a.time).getTime())
    .slice(0, 6)

  const paymentColors = ["#1e2d6b", "#3b82f6", "#6366f1", "#8b5cf6", "#a78bfa"]
  const medals = ["🥇", "🥈", "🥉"]

  // ── Time range labels ──
  const timeRangeOptions = [
    { label: "Current Session", value: "" },
    { label: "Today", value: "today" },
    { label: "This Week", value: "week" },
    { label: "This Month", value: "month" },
  ]

  /* ════════════════════════════════════════
     FILTER BAR
  ════════════════════════════════════════ */
  const FilterBar = () => (
    <div className="flex flex-wrap items-center gap-2">
      {/* Time pills */}
      <div className="flex items-center gap-1 rounded-xl border border-gray-200 p-1" style={{ backgroundColor: "#f8fafc" }}>
        <Calendar className="w-3.5 h-3.5 mx-1" style={{ color: "#64748b" }} />
        {timeRangeOptions.map((opt) => (
          <FilterPill key={opt.value} label={opt.label} active={timeRange === opt.value} onClick={() => setTimeRange(opt.value)} />
        ))}
      </div>

      {/* Cashier dropdown — admin or auditor only */}
      {(isAdminUser || isAuditor) && (
        <div className="relative">
          <button
            onClick={() => setShowCashierDropdown(!showCashierDropdown)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-xs transition-colors hover:bg-gray-50"
            style={{ backgroundColor: "#f8fafc", color: "#475569", fontWeight: 500 }}
          >
            <Users className="w-3.5 h-3.5" style={{ color: "#475569" }} />
            {cashierFilter === "all" ? "All Cashiers" : cashierFilter}
            <ChevronDown className="w-3 h-3" style={{ color: "#475569" }} />
          </button>
          {showCashierDropdown && (
            <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[180px]">
              <button
                onClick={() => { setCashierFilter("all"); setShowCashierDropdown(false) }}
                className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors"
                style={{ color: cashierFilter === "all" ? "#1e2d6b" : "#475569", fontWeight: cashierFilter === "all" ? 600 : 400 }}
              >
                All Cashiers
              </button>
              {uniqueCashiers.map((c: string) => (
                <button
                  key={c}
                  onClick={() => { setCashierFilter(c); setShowCashierDropdown(false) }}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors"
                  style={{ color: cashierFilter === c ? "#1e2d6b" : "#475569", fontWeight: cashierFilter === c ? 600 : 400 }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payment method dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowPaymentDropdown(!showPaymentDropdown)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-xs transition-colors hover:bg-gray-50"
          style={{ backgroundColor: "#f8fafc", color: "#475569", fontWeight: 500 }}
        >
          <CreditCard className="w-3.5 h-3.5" style={{ color: "#475569" }} />
          {paymentFilter === "all" ? "All Payments" : paymentFilter}
          <ChevronDown className="w-3 h-3" style={{ color: "#475569" }} />
        </button>
        {showPaymentDropdown && (
          <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[180px]">
            <button
              onClick={() => { setPaymentFilter("all"); setShowPaymentDropdown(false) }}
              className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors"
              style={{ color: paymentFilter === "all" ? "#1e2d6b" : "#475569", fontWeight: paymentFilter === "all" ? 600 : 400 }}
            >
              All Payments
            </button>
            {allPaymentTypes.map((type) => (
              <button
                key={type}
                onClick={() => { setPaymentFilter(type); setShowPaymentDropdown(false) }}
                className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors"
                style={{ color: paymentFilter === type ? "#1e2d6b" : "#475569", fontWeight: paymentFilter === type ? 600 : 400 }}
              >
                {type}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Branch dropdown */}
      {branches.length > 0 && (
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
                onClick={() => { setBranchFilter("all"); setShowBranchDropdown(false) }}
                className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors"
                style={{ color: branchFilter === "all" ? "#1e2d6b" : "#475569", fontWeight: branchFilter === "all" ? 600 : 400 }}
              >
                All Branches
              </button>
              {branches.map((b) => (
                <button
                  key={b}
                  onClick={() => { setBranchFilter(b); setShowBranchDropdown(false) }}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors"
                  style={{ color: branchFilter === b ? "#1e2d6b" : "#475569", fontWeight: branchFilter === b ? 600 : 400 }}
                >
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )

  /* ════════════════════════════════════════
     METRIC CARDS
  ════════════════════════════════════════ */
  const MetricCards = () => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="Total Revenue" value={formatCurrency(totalRevenue, currency)} trendUp={true} trendVal="+12.5%" icon={DollarSign} accentColor="#16a34a" />
      <StatCard label="Transactions" value={totalTransactions.toString()} trendUp={true} trendVal="+8.2%" icon={ShoppingCart} accentColor="#2563eb" />
      <StatCard label="Avg Order Value" value={formatCurrency(averageOrderValue, currency)} trendUp={true} trendVal="+3.8%" icon={BarChart3} accentColor="#7c3aed" />
      <StatCard label="Items Sold" value={totalItems.toString()} trendUp={false} trendVal="-2.1%" icon={Activity} accentColor="#ea580c" />
    </div>
  )

  /* ════════════════════════════════════════
     PAYMENT METHODS
  ════════════════════════════════════════ */
  const PaymentMethodsSection = () => (
    <SectionCard title="Payment Methods" icon={PieChart}>
      {paymentMethodsData.length === 0 ? (
        <div className="text-center py-8">
          <PieChart className="w-8 h-8 mx-auto mb-2" style={{ color: "#cbd5e1" }} />
          <p className="text-sm" style={{ color: "#94a3b8" }}>No payment data for selected period</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Stacked bar */}
          <div className="flex rounded-full overflow-hidden h-2 mb-5">
            {paymentMethodsData.map((method, i) => (
              <div
                key={method.method}
                style={{ width: `${method.percentage}%`, backgroundColor: paymentColors[i % paymentColors.length] }}
                title={`${method.method}: ${method.percentage.toFixed(1)}%`}
              />
            ))}
          </div>
          {paymentMethodsData.map((method, i) => (
            <div key={method.method} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: paymentColors[i % paymentColors.length] }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs truncate" style={{ color: "#000000", fontWeight: 500 }}>{method.method}</span>
                  <span className="text-xs ml-2" style={{ color: "#000000", fontWeight: 700 }}>{formatCurrency(method.amount, currency)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-full h-1.5" style={{ backgroundColor: "#f1f5f9" }}>
                    <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${method.percentage}%`, backgroundColor: paymentColors[i % paymentColors.length] }} />
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: "#94a3b8" }}>
                    {method.percentage.toFixed(1)}% · {method.transactions} txns
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )

  /* ════════════════════════════════════════
     CASHIER LEADERBOARD
  ════════════════════════════════════════ */
  const CashierLeaderboard = () => (
    <SectionCard title="Cashier Performance" icon={Users}>
      {cashierLeaderboard.length === 0 ? (
        <div className="text-center py-8">
          <Users className="w-8 h-8 mx-auto mb-2" style={{ color: "#cbd5e1" }} />
          <p className="text-sm" style={{ color: "#94a3b8" }}>No data for selected period</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cashierLeaderboard.map((cashier, index) => {
            const maxSales = cashierLeaderboard[0]?.sales || 1
            const pct = (cashier.sales / maxSales) * 100
            return (
              <div key={cashier.name} className="flex items-center gap-3">
                <span className="w-5 flex-shrink-0 text-center" style={{ fontSize: index < 3 ? "16px" : "11px", color: "#94a3b8", fontWeight: 700 }}>
                  {index < 3 ? medals[index] : index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs truncate" style={{ color: "#000000", fontWeight: 600 }}>{cashier.name}</span>
                    <span className="text-xs ml-2" style={{ color: "#000000", fontWeight: 700 }}>{formatCurrency(cashier.sales, currency)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-full h-1.5" style={{ backgroundColor: "#f1f5f9" }}>
                      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: "#1e2d6b" }} />
                    </div>
                    <span className="text-xs flex-shrink-0" style={{ color: "#94a3b8" }}>{cashier.transactions} inv</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )

  /* ════════════════════════════════════════
     SALES BY HOUR
  ════════════════════════════════════════ */
  const SalesByHourChart = () => {
    if (timeRange !== "today" || salesByHourData.length === 0) return null
    const maxSales = Math.max(...salesByHourData.map((s) => s.sales), 1)
    // @ts-expect-error just ignore
    const peakHour = salesByHourData.reduce((max, item) => (item.sales > max.sales ? item : max), salesByHourData[0])

    return (
      <SectionCard title="Sales by Hour" icon={Clock}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-lg p-1" style={{ backgroundColor: "#f1f5f9" }}>
            {(["bar", "line"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setSalesByHourGraphType(type)}
                className="px-3 py-1 text-xs rounded-md transition-all capitalize"
                style={salesByHourGraphType === type
                  ? { backgroundColor: "#1e2d6b", color: "#ffffff", fontWeight: 600 }
                  : { color: "#64748b", fontWeight: 400 }}
              >
                {type}
              </button>
            ))}
          </div>
          <div style={{ fontSize: "11px", color: "#64748b" }}>
            Peak: <span style={{ fontWeight: 700, color: "#000000" }}>{peakHour?.hour || "N/A"}</span>
          </div>
        </div>
        <div className="flex items-end justify-between gap-0.5 px-1" style={{ height: "140px" }}>
          {salesByHourData.map((item, index) => {
            const heightPct = maxSales > 0 ? (item.sales / maxSales) * 100 : 0
            return (
              <div key={index} className="flex flex-col items-center flex-1 group" style={{ height: "140px" }}>
                <div className="relative w-full flex items-end justify-center flex-1">
                  {salesByHourGraphType === "bar" ? (
                    <div
                      className="w-full rounded-t cursor-pointer transition-all duration-300"
                      style={{
                        height: `${Math.max(heightPct, 2)}%`,
                        background: item.sales > 0 ? "linear-gradient(to top, #1e2d6b, #3a76fc)" : "#e2e8f0",
                        opacity: 0.9,
                      }}
                      title={`${item.hour}: ${formatCurrency(item.sales, currency)}`}
                    />
                  ) : (
                    <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 130" preserveAspectRatio="none">
                      {index > 0 && (
                        <line
                          x1="0"
                          // @ts-expect-error just ignore
                          y1={`${130 - (salesByHourData[index - 1].sales / maxSales) * 130}`}
                          x2="100"
                          y2={`${130 - (item.sales / maxSales) * 130}`}
                          stroke="#1e2d6b"
                          strokeWidth="2"
                        />
                      )}
                      <circle cx="100" cy={`${130 - (item.sales / maxSales) * 130}`} r="3" fill="#1e2d6b" />
                    </svg>
                  )}
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                    {formatCurrency(item.sales, currency)}
                  </div>
                </div>
                <span className="mt-1.5 -rotate-45 origin-left" style={{ fontSize: "9px", color: "#94a3b8" }}>
                  {item.hour}
                </span>
              </div>
            )
          })}
        </div>
      </SectionCard>
    )
  }

  /* ════════════════════════════════════════
     TOP PRODUCTS
  ════════════════════════════════════════ */
  const TopProductsSection = () => (
    <SectionCard title="Top Selling Products" icon={Package}>
      {topProducts.length === 0 ? (
        <div className="text-center py-8">
          <Package className="w-8 h-8 mx-auto mb-2" style={{ color: "#cbd5e1" }} />
          <p className="text-sm" style={{ color: "#94a3b8" }}>No product data for selected period</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {topProducts.map((product, index) => {
            const maxRevenue = topProducts[0]?.revenue || 1
            const pct = (product.revenue / maxRevenue) * 100
            return (
              <div key={product.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#eef1f8" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#1e2d6b" }}>{index + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs truncate pr-2" style={{ color: "#000000", fontWeight: 600 }}>{product.name}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: "#000000", fontWeight: 700 }}>{formatCurrency(product.revenue, currency)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-full h-1" style={{ backgroundColor: "#f1f5f9" }}>
                      <div className="h-1 rounded-full" style={{ width: `${pct}%`, backgroundColor: "#1e2d6b" }} />
                    </div>
                    <span className="text-xs flex-shrink-0" style={{ color: "#94a3b8" }}>{product.sales} units</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )

  /* ════════════════════════════════════════
     RECENT TRANSACTIONS
  ════════════════════════════════════════ */
  const RecentTransactionsSection = () => (
    <SectionCard title="Recent Transactions" icon={CreditCard} action="All Reports" onAction={() => navigate("/closing_shift")}>
      {recentTransactions.length === 0 ? (
        <div className="text-center py-8">
          <CreditCard className="w-8 h-8 mx-auto mb-2" style={{ color: "#cbd5e1" }} />
          <p className="text-sm" style={{ color: "#94a3b8" }}>No transactions for selected period</p>
        </div>
      ) : (
        <div className="space-y-2">
          {recentTransactions.map((txn) => {
            const statusColor =
              txn.status === "Paid" ? "#16a34a" :
              txn.status === "Refunded" || txn.status === "Return" ? "#ef4444" :
              "#f59e0b"
            return (
              <div
                key={txn.id}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => navigate(`/invoice/${txn.id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#eef1f8" }}>
                    {txn.paymentMethod === "Cash"
                      ? <span style={{ fontSize: "14px" }}>💵</span>
                      : <CreditCard className="w-3.5 h-3.5" style={{ color: "#1e2d6b" }} />
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs truncate" style={{ color: "#000000", fontWeight: 600 }}>{txn.id}</p>
                    <p className="text-xs" style={{ color: "#94a3b8" }}>{txn.customer} · {txn.time}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <p className="text-xs" style={{ color: "#000000", fontWeight: 700 }}>{formatCurrency(txn.totalAmount, txn.currency || currency)}</p>
                  <p className="text-xs" style={{ color: statusColor, fontWeight: 500 }}>{txn.status}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )

  /* ════════════════════════════════════════
     ZATCA SECTION
  ════════════════════════════════════════ */
  const ZatcaSection = () => {
    if (!posDetails?.is_zatca_enabled || zatcaData.total === 0) return null
    return (
      <SectionCard title="ZATCA Status" icon={BarChart3}>
        <div className="space-y-2.5 mb-4">
          {zatcaData.segments.map((seg) => (
            <div key={seg.status} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs capitalize" style={{ color: "#000000", fontWeight: 500 }}>{seg.status}</span>
                  <span className="text-xs" style={{ color: "#000000", fontWeight: 700 }}>{seg.count}</span>
                </div>
                <div className="rounded-full h-1.5" style={{ backgroundColor: "#f1f5f9" }}>
                  <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${seg.percentage}%`, backgroundColor: seg.color }} />
                </div>
              </div>
              <span className="text-xs flex-shrink-0" style={{ color: "#94a3b8" }}>{Math.round(seg.percentage)}%</span>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-gray-100 text-center">
          <span style={{ fontSize: "12px", color: "#64748b" }}>
            Total: <span style={{ fontWeight: 700, color: "#000000" }}>{zatcaData.total}</span>
          </span>
        </div>
      </SectionCard>
    )
  }

  /* ════════════════════════════════════════
     MOBILE LAYOUT
  ════════════════════════════════════════ */
  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#eef1f8" }}>
        <div className="sticky top-0 z-30 bg-white border-b border-gray-200" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-lg font-bold" style={{ color: "#000000" }}>Sales Dashboard</h1>
                <p className="text-xs" style={{ color: "#64748b" }}>
                  {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-[#1e2d6b] text-white text-[10px] font-semibold rounded-xl transition-all duration-200 hover:opacity-90"
              >
                <Download className="w-3 h-3" />
                <span>Export</span>
              </button>
            </div>
            <div className="overflow-x-auto pb-1 -mx-1 px-1">
              <FilterBar />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pb-24 px-3 py-4 space-y-4">
          <MetricCards />
          <PaymentMethodsSection />
          <SalesByHourChart />
          <CashierLeaderboard />
          <TopProductsSection />
          <RecentTransactionsSection />
          {posDetails?.is_zatca_enabled && <ZatcaSection />}
        </div>
        <BottomNavigation />
      </div>
    )
  }

  /* ════════════════════════════════════════
     DESKTOP LAYOUT
  ════════════════════════════════════════ */
  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#eef1f8" }}>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-white border-b border-gray-200" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-xl font-bold" style={{ color: "#000000" }}>Sales Dashboard</h1>
                <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                  {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e2d6b] text-white text-xs font-semibold rounded-xl transition-all duration-200 hover:opacity-90"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: "#eef1f8" }}>
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span style={{ fontSize: "12px", fontWeight: 500, color: "#1e2d6b" }}>Live</span>
                </div>
              </div>
            </div>
            <FilterBar />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Row 1: 4 metric cards */}
          <MetricCards />

          {/* Row 2: Payment Methods (compact) + Cashier Performance (compact) side by side */}
          {posDetails?.is_zatca_enabled && zatcaData.total > 0 ? (
            <div className="grid grid-cols-3 gap-4">
              <PaymentMethodsSection />
              <CashierLeaderboard />
              <ZatcaSection />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <PaymentMethodsSection />
              <CashierLeaderboard />
            </div>
          )}

          {/* Row 3: Sales by Hour (only when Today filter is active) */}
          <SalesByHourChart />

          {/* Row 4: Top Products + Recent Transactions */}
          <div className="grid grid-cols-2 gap-6">
            <TopProductsSection />
            <RecentTransactionsSection />
          </div>
        </div>
      </div>
    </div>
  )
}
