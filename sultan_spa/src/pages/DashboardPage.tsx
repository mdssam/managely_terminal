import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { formatCurrency } from "../utils/currency"
import {

  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Users,
  CreditCard,
  Gift,
  Calendar,
  Clock,
  BarChart3,
  PieChart,
  Activity,
  Filter,


} from "lucide-react"
import type { SalesInvoice } from "../../types"

import BottomNavigation from "../components/BottomNavigation"
import { useMediaQuery } from "../hooks/useMediaQuery"
import { usePOSDetails } from "../hooks/usePOSProfile"
import { useAllPaymentModes } from "../hooks/usePaymentModes"
import { useSalesInvoices } from "../hooks/useSalesInvoices"
import { useUserInfo } from "../hooks/useUserInfo"

export default function DashboardPage() {
  const navigate = useNavigate()
  const isMobile = useMediaQuery("(max-width: 1024px)")
  const { posDetails } = usePOSDetails()

  // Only fetch submitted invoices for dashboard (exclude Draft and Cancelled)
  const { invoices, isLoading: invoicesLoading } = useSalesInvoices("", false, undefined, true)
  const { userInfo, isLoading: userInfoLoading } = useUserInfo()
  // Blank => current POS opening session
  const [timeRange, setTimeRange] = useState("")
  // Current session payment summary from backend (includes zero-amount methods)
  const { modes: sessionPaymentSummary } = useAllPaymentModes()



  // Role-based access control
  const isAdminUser = userInfo?.is_admin_user || false
  const currentUserCashier = userInfo?.full_name || "Unknown"
  const [cashierFilter, setCashierFilter] = useState("all")
  const [paymentFilter, setPaymentFilter] = useState("all")
  const [showFilters, setShowFilters] = useState(false)
  const [salesByHourGraphType, setSalesByHourGraphType] = useState<"bar" | "line">("bar")

  // Default stats for gift card and sales by day (not currently implemented)
  const stats = {
    giftCardUsage: {
      totalRedeemed: 0,
      totalTransactions: 0,
      averageDiscount: 0
    },
    salesByDay: [
      { day: "Mon", sales: 0 },
      { day: "Tue", sales: 0 },
      { day: "Wed", sales: 0 },
      { day: "Thu", sales: 0 },
      { day: "Fri", sales: 0 },
      { day: "Sat", sales: 0 },
      { day: "Sun", sales: 0 }
    ]
  }

  // Only submitted invoices (exclude Draft and Cancelled) for dashboard stats and cashier list
  const submittedInvoices = invoices.filter(
    (inv) => inv.status !== "Draft" && inv.status !== "Cancelled"
  )
  const uniqueCashiers = [...new Set(submittedInvoices.map((invoice: SalesInvoice) => invoice.cashier))]

  // Set default cashier filter based on user role
  useEffect(() => {
    if (userInfo && !isAdminUser) {
      // For non-admin users, set cashier filter to current user
      setCashierFilter(currentUserCashier)
    }
  }, [userInfo, isAdminUser, currentUserCashier])

  // Loading state - must be after all hooks
  if (userInfoLoading || invoicesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#eef1f8' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: '#1e2d6b' }}></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Sales Dashboard is only for Sales Manager, System Manager or Administrator
  if (userInfo && !userInfo.is_admin_user) {
    navigate("/pos", { replace: true });
    return null;
  }

  // Filter data based on selected filters and user role
  const filteredInvoices = submittedInvoices.filter((invoice) => {
    const matchesCashier = cashierFilter === "all" || invoice.cashier === cashierFilter
    const matchesPayment = paymentFilter === "all" || invoice.paymentMethod === paymentFilter

    // Apply time range filter (blank = current session → do not restrict by date)
    const today = new Date().toISOString().split("T")[0]
    const matchesTime =
      (timeRange === "" && true) ||
      (timeRange === "today" && invoice.date === today) ||
      (timeRange === "week" && new Date(invoice.date) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) ||
      (timeRange === "month" && new Date(invoice.date) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))

    // For current session: restrict to current POS opening entry
    const matchesOpening =
      timeRange !== "" || !posDetails?.current_opening_entry
        ? true
        : invoice.custom_pos_opening_entry === posDetails.current_opening_entry

    // Role-based filtering: Non-admin users only see invoices for their POS profile
    const matchesPOSProfile = isAdminUser || !posDetails?.name || invoice.posProfile === posDetails.name

    return matchesCashier && matchesPayment && matchesTime && matchesOpening && matchesPOSProfile
  })

  // Inline debug logs (no hooks added)
  // try {

  //   const summary = filteredInvoices.map((inv: SalesInvoice) => ({
  //     id: inv.id,
  //     date: inv.date,
  //     time: inv.time,
  //     posOpening: (inv as any).custom_pos_opening_entry,
  //     total: inv.totalAmount,
  //     paymentMethod: inv.paymentMethod,
  //   }))

  // } catch {}

  const filteredStats = (() => {
    // Always derive core stats from the filtered invoices (respects current opening entry when blank)
    const totalRevenue = filteredInvoices.reduce((sum: number, inv: SalesInvoice) => sum + inv.totalAmount, 0)
    const totalTransactions = filteredInvoices.length
    const averageOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0
    const totalItems = filteredInvoices.reduce((sum: number, inv: SalesInvoice) => sum + inv.items.length, 0)
    return { totalRevenue, totalTransactions, averageOrderValue, totalItems }
  })()

  // Calculate sales by hour for today only using posting_time
  const calculateSalesByHour = () => {
    if (timeRange !== "today") return []

    const today = new Date().toISOString().split("T")[0]
    const todayInvoices = filteredInvoices.filter(inv => inv.date === today)
    const hourlySales: { [key: string]: number } = {}

    // Initialize all hours with 0 (9 AM to 8 PM)
    for (let i = 9; i <= 20; i++) {
      const hour = `${i.toString().padStart(2, '0')}:00`
      hourlySales[hour] = 0
    }
    // Aggregate total revenue by hour using posting_time
    todayInvoices.forEach(invoice => {
      // Extract hour from posting_time (format: HH:MM:SS)
      const timeParts = invoice.time.split(':')
      if (timeParts.length >= 2) {
        // @ts-expect-error just ignore
        const hour = `${timeParts[0].padStart(2, '0')}:00`

if (Object.prototype.hasOwnProperty.call(hourlySales, hour)) {
   // @ts-expect-error just ignore
          hourlySales[hour] += invoice.totalAmount
        }
      }
    })

    return Object.entries(hourlySales).map(([hour, sales]) => ({ hour, sales }))
  }

  const salesByHourData = calculateSalesByHour()

  // Calculate payment methods - show all POS profile methods, even with zero amounts
  const calculatePaymentMethods = () => {
    const methodMap: { [key: string]: { amount: number; transactions: number } } = {}

    // Initialize with all POS profile payment methods (from session summary)
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allMethods = (sessionPaymentSummary || []) as any[]
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    allMethods.forEach((m: any) => {
      const key = m.name || m.mode_of_payment
      methodMap[key] = { amount: 0, transactions: 0 }
    })

    // Aggregate from filtered invoices (respects current opening entry)
    filteredInvoices.forEach(invoice => {

      // Check if invoice has multiple payment methods
      if (invoice.payment_methods && Array.isArray(invoice.payment_methods)) {
        // Distribute amounts across all payment methods
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        invoice.payment_methods.forEach((payment: any) => {
          const method = payment.mode_of_payment
          if (!methodMap[method]) {
            methodMap[method] = { amount: 0, transactions: 0 }
          }
          methodMap[method].amount += payment.amount
          // Only count transaction once per invoice, not per payment method
          // @ts-expect-error just ignore
          if (invoice.payment_methods.indexOf(payment) === 0) {
            methodMap[method].transactions += 1
          }
        })
      } else {
        // Fallback to single payment method (backward compatibility)
        const method = invoice.paymentMethod || 'Cash'
        if (!methodMap[method]) {
          methodMap[method] = { amount: 0, transactions: 0 }
        }
        methodMap[method].amount += invoice.totalAmount
        methodMap[method].transactions += 1
      }
    })

    const totalAmount = Object.values(methodMap).reduce((sum, m) => sum + m.amount, 0)
    return Object.entries(methodMap).map(([method, data]) => ({
      method,
      amount: data.amount,
      percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      transactions: data.transactions,
    }))
  }

  const paymentMethodsData = calculatePaymentMethods()

  // Inline debug: log the exact invoices used for metrics (respects current opening entry when timeRange is blank)
  // try {
  //   // Summarize to keep console readable

  //   const summary = filteredInvoices.map((inv: SalesInvoice) => ({
  //     id: inv.id,
  //     date: inv.date,
  //     time: inv.time,
  //     posOpening: (inv as any).custom_pos_opening_entry || inv.custom_pos_opening_entry,
  //     total: inv.totalAmount,
  //     paymentMethod: inv.paymentMethod,
  //   }))
  // } catch (_) {}


  // ZATCA status distribution from invoices
  const calculateZatcaStatus = () => {
    const statusCounts: { [key: string]: number } = {}
    filteredInvoices.forEach(inv => {
      const status = (inv.custom_zatca_submit_status || 'Draft') as string
      statusCounts[status] = (statusCounts[status] || 0) + 1
    })
    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0)

    // Match colors used in Invoice History badges
    const colorMapByNormalized: { [key: string]: string } = {
      'pending': '#f59e0b',       // yellow-500
      'reported': '#3b82f6',      // ziditech-500
      'not reported': '#9ca3af',  // gray-400/500
      'cleared': '#16a34a',       // ziditech-600
      'not cleared': '#ef4444',   // red-500
      'draft': '#6b7280',         // gray-500
    }

    const segments = Object.entries(statusCounts).map(([status, count]) => {
      const normalized = status.toLowerCase()
      const color = colorMapByNormalized[normalized] || '#9ca3af'
      return {
        status,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
        color,
      }
    })

    return {
      total,
      segments: segments.sort((a, b) => b.count - a.count),
    }
  }

  const zatcaData = calculateZatcaStatus()

  // Calculate top performer based on doc owner (cashier)
  const calculateTopPerformer = () => {
    const cashierStats: { [key: string]: { name: string; sales: number; transactions: number } } = {}

    filteredInvoices.forEach(invoice => {
      const cashier = invoice.cashier || 'Unknown'
      if (!cashierStats[cashier]) {
        cashierStats[cashier] = { name: cashier, sales: 0, transactions: 0 }
      }
      cashierStats[cashier].sales += invoice.totalAmount
      cashierStats[cashier].transactions += 1
    })

    const sortedCashiers = Object.values(cashierStats).sort((a, b) => b.sales - a.sales)
    return sortedCashiers[0] || null
  }

  const topPerformer = calculateTopPerformer()

  // Calculate top selling products from invoices
  const calculateTopProducts = () => {
    const productStats: { [key: string]: { name: string; sales: number; revenue: number } } = {}

    filteredInvoices.forEach(invoice => {
      invoice.items.forEach(item => {
        const productKey = item.item_code || item.item_name || 'Unknown'
        if (!productStats[productKey]) {
          productStats[productKey] = { name: item.item_name || item.item_code || 'Unknown', sales: 0, revenue: 0 }
        }
        productStats[productKey].sales += item.qty || 0
        productStats[productKey].revenue += (item.rate || 0) * (item.qty || 0)
      })
    })

    return Object.entries(productStats)
      .map(([key, data]) => ({ id: key, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
  }

  const topProducts = calculateTopProducts()

  // Get recent transactions (last 5 invoices)
  const recentTransactions = filteredInvoices
    .sort((a, b) => new Date(b.date + ' ' + b.time).getTime() - new Date(a.date + ' ' + a.time).getTime())
    .slice(0, 5)

  // Mobile layout: full-width content and persistent bottom navigation
  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#eef1f8' }}>
        {/* Mobile Header */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-gray-900">Sales Dashboard</h1>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  <span className="text-sm">Filters</span>
                </button>
                {/* <button className="flex items-center space-x-2 px-3 py-2 bg-ziditech-600 text-white rounded-lg hover:bg-ziditech-700 transition-colors">
                  <RefreshCw className="w-4 h-4" />
                  <span className="text-sm">Refresh</span>
                </button> */}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-20 w-[98%] mx-auto px-2 py-4">
          {/* Enhanced Filters */}
          {showFilters && (
            <div className="bg-white rounded-xl p-4 border border-gray-200 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Dashboard Filters</h3>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time Range</label>
                  <select
                    value={timeRange}
                    onChange={(e) => setTimeRange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 bg-white text-gray-900"
                  >
                    <option value="">Current POS Session</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cashier</label>
                  <select
                    value={cashierFilter}
                    onChange={(e) => setCashierFilter(e.target.value)}
                    disabled={!isAdminUser}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 bg-white text-gray-900 ${
                      !isAdminUser ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <option value="all">All Cashiers</option>
                    {uniqueCashiers.map((cashier: string) => (
                      <option key={cashier} value={cashier}>
                        {cashier}
                      </option>
                    ))}
                  </select>
                  {!isAdminUser && (
                    <p className="text-xs text-gray-500 mt-1">
                      Showing only your transactions
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Method
                  </label>
                  <select
                    value={paymentFilter}
                    onChange={(e) => setPaymentFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 bg-white text-gray-900"
                  >
                    <option value="all">All Methods</option>
                    <option value="Cash">Cash</option>
                    <option value="Debit Card">Debit Card</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setTimeRange("today")
                      setCashierFilter("all")
                      setPaymentFilter("all")
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-900"
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Enhanced Key Metrics */}
          <div className="grid grid-cols-1 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Revenue</p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatCurrency(filteredStats.totalRevenue, posDetails?.currency || 'USD')}
                  </p>
                  <div className="flex items-center mt-2">
                    <TrendingUp className="w-4 h-4 text-orange-500 mr-1" />
                    <span className="text-sm text-orange-600">+12.5%</span>
                    <span className="text-xs text-gray-500 ml-1">vs last period</span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#eef1f8' }}>
                  <DollarSign className="w-6 h-6" style={{ color: '#1e2d6b' }} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Transactions</p>
                  <p className="text-xl font-bold text-gray-900">
                    {filteredStats.totalTransactions}
                  </p>
                  <div className="flex items-center mt-2">
                    <TrendingUp className="w-4 h-4 text-orange-500 mr-1" />
                    <span className="text-sm text-orange-600">+8.2%</span>
                    <span className="text-xs text-gray-500 ml-1">vs last period</span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#eef1f8' }}>
                  <ShoppingCart className="w-6 h-6" style={{ color: '#1e2d6b' }} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Avg Order Value</p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatCurrency(filteredStats.averageOrderValue, posDetails?.currency || 'USD')}
                  </p>
                  <div className="flex items-center mt-2">
                    <TrendingUp className="w-4 h-4 text-orange-500 mr-1" />
                    <span className="text-sm text-orange-600">+3.8%</span>
                    <span className="text-xs text-gray-500 ml-1">vs last period</span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#eef1f8' }}>
                  <BarChart3 className="w-6 h-6" style={{ color: '#1e2d6b' }} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Items Sold</p>
                  <p className="text-xl font-bold text-gray-900">
                    {filteredStats.totalItems}
                  </p>
                  <div className="flex items-center mt-2">
                    <TrendingUp className="w-4 h-4 text-orange-500 mr-1" />
                    <span className="text-sm text-orange-600">+5.1%</span>
                    <span className="text-xs text-gray-500 ml-1">vs last period</span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#eef1f8' }}>
                  <Activity className="w-6 h-6" style={{ color: '#1e2d6b' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 gap-4 mb-6">
            {/* Sales by Hour Chart - Only show for today */}
            {timeRange === "today" && salesByHourData.length > 0 && (
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Sales by Hour (Today)</h3>
                  <div className="flex items-center space-x-3">
                    {/* Graph Type Toggle */}
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => setSalesByHourGraphType("bar")}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          salesByHourGraphType === "bar"
                            ? "text-white"
                            : "bg-gray-200 text-gray-600"
                        }`}
                        style={salesByHourGraphType === "bar" ? { backgroundColor: '#1e2d6b' } : {}}
                      >
                        Bar
                      </button>
                      <button
                        onClick={() => setSalesByHourGraphType("line")}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          salesByHourGraphType === "line"
                            ? "text-white"
                            : "bg-gray-200 text-gray-600"
                        }`}
                        style={salesByHourGraphType === "line" ? { backgroundColor: '#1e2d6b' } : {}}
                      >
                        Line
                      </button>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-500">
                                                                        {/* @ts-expect-error just ignore */}
                        Peak: {salesByHourData.reduce((max, item) => item.sales > max.sales ? item : max, salesByHourData[0])?.hour || "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="h-48 flex items-end justify-between space-x-1">
                  {salesByHourData.map((item: { hour: string; sales: number }, index: number) => {
                    const maxSales = Math.max(...salesByHourData.map(s => s.sales))
                    const height = maxSales > 0 ? (item.sales / maxSales) * 180 : 4

                    return (
                      <div key={index} className="flex flex-col items-center flex-1 group">
                        <div className="relative w-full">
                          {salesByHourGraphType === "bar" ? (
                            <div
                              className="w-full rounded-t cursor-pointer transition-opacity hover:opacity-80"
                              style={{
                                height: `${height}px`,
                                minHeight: "4px",
                                backgroundColor: '#1e2d6b',
                              }}
                              title={`${item.hour}: ${formatCurrency(item.sales, posDetails?.currency || 'USD')}`}
                            ></div>
                          ) : (
                            <div className="relative w-full h-full">
                              {/* Line graph implementation */}
                              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                {index > 0 && (
                                  <line
                                    x1="0"
                                    // @ts-expect-error just ignore
                                    y1={`${100 - (salesByHourData[index - 1].sales / maxSales) * 100}`}
                                    x2="100"
                                    y2={`${100 - (item.sales / maxSales) * 100}`}
                                    stroke="#1e2d6b"
                                    strokeWidth="2"
                                  />
                                )}
                                <circle
                                  cx="100"
                                  cy={`${100 - (item.sales / maxSales) * 100}`}
                                  r="2"
                                  fill="#1e2d6b"
                                />
                              </svg>
                            </div>
                          )}
                          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                            {formatCurrency(item.sales, posDetails?.currency || 'USD')}
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 mt-2 transform -rotate-45 origin-top-left">
                          {item.hour}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-3 text-center">
                  <div className="text-sm text-gray-600">
                    Total Revenue: <span className="font-semibold" style={{ color: '#1e2d6b' }}>
                      {formatCurrency(salesByHourData.reduce((sum, item) => sum + item.sales, 0), posDetails?.currency || 'USD')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Methods Chart */}
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Payment Methods</h3>
                <PieChart className="w-5 h-5 text-gray-400" />
              </div>
              <div className="space-y-4">
                {paymentMethodsData.map((method, index) => {
                  const hexColors = ['#1e2d6b', '#3b82f6', '#6366f1', '#8b5cf6', '#a78bfa']
                  const color = hexColors[index % hexColors.length]
                  return (
                    <div key={method.method} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: color }}></div>
                        <span className="text-sm text-gray-700">{method.method}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-900">
                          {formatCurrency(method.amount, posDetails?.currency || 'USD')}
                        </div>
                        <div className="text-sm text-gray-500">
                          {method.percentage.toFixed(1)}% • {method.transactions} txns
                        </div>
                      </div>
                    </div>
                  )
                })}
                {paymentMethodsData.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No payment data available for selected period
                  </div>
                )}
              </div>
              <div className="mt-4">
                <div className="flex rounded-lg overflow-hidden h-4">
                  {paymentMethodsData.map((method, index) => {
                    const hexColors = ['#f97316', '#1e2d6b', '#6366f1', '#8b5cf6', '#ec4899']
                    const color = hexColors[index % hexColors.length]
                    return (
                      <div
                        key={method.method}
                        style={{ width: `${method.percentage}%`, backgroundColor: color }}
                      ></div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Additional Stats Row */}
          <div className="grid grid-cols-1 gap-4 mb-6">
            {/* ZATCA Status Bar Chart (mobile) */}
            {posDetails?.is_zatca_enabled && zatcaData.total > 0 && (
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">ZATCA Status</h3>
                  <BarChart3 className="w-5 h-5 text-gray-400" />
                </div>
                <div className="h-48 flex items-end justify-between space-x-2 mb-4">
                  {zatcaData.segments.map((segment) => {
                    const maxCount = Math.max(...zatcaData.segments.map(s => s.count))
                    const height = maxCount > 0 ? (segment.count / maxCount) * 180 : 4

                    return (
                      <div key={segment.status} className="flex flex-col items-center flex-1 group">
                        <div className="relative w-full">
                          <div
                            className="w-full rounded-t hover:opacity-80 transition-opacity cursor-pointer"
                            style={{
                              height: `${height}px`,
                              minHeight: "4px",
                              backgroundColor: segment.color
                            }}
                            title={`${segment.status}: ${segment.count} (${Math.round(segment.percentage)}%)`}
                          ></div>
                          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                            {segment.count}
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 mt-2 text-center leading-tight">
                          {segment.status}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="space-y-2">
                  {zatcaData.segments.map(segment => (
                    <div key={segment.status} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: segment.color }}></span>
                        <span className="text-gray-700">{segment.status}</span>
                      </div>
                      <span className="text-gray-600">
                        {segment.count} ({Math.round(segment.percentage)}%)
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="text-center text-sm text-gray-600">
                    Total Invoices: <span className="font-semibold" style={{ color: '#1e2d6b' }}>{zatcaData.total}</span>
                  </div>
                </div>
              </div>
            )}
            {/* Gift Card Usage */}
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Gift Card Usage</h3>
                <Gift className="w-5 h-5" style={{ color: '#1e2d6b' }} />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between p-2 rounded-lg" style={{ backgroundColor: '#eef1f8' }}>
                  <span className="text-sm text-gray-600">Total Redeemed</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(stats.giftCardUsage.totalRedeemed, posDetails?.currency || 'USD')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Transactions</span>
                  <span className="font-semibold text-gray-900">
                    {stats.giftCardUsage.totalTransactions}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Avg Discount</span>
                  <span className="font-semibold text-orange-600">
                    {formatCurrency(stats.giftCardUsage.averageDiscount, posDetails?.currency || 'USD')}
                  </span>
                </div>
                <div className="pt-2 border-t border-gray-200">
                  <div className="text-xs text-gray-500">
                    {((stats.giftCardUsage.totalTransactions / (filteredStats.totalTransactions || 1)) * 100).toFixed(1)}% of all
                    transactions
                  </div>
                </div>
              </div>
            </div>

            {/* Top Cashier */}
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Top Performer</h3>
                <Users className="w-5 h-5" style={{ color: '#1e2d6b' }} />
              </div>
              {topPerformer ? (
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 relative" style={{ backgroundColor: '#1e2d6b' }}>
                    <span className="text-white font-bold text-xl">
                      {topPerformer.name
                        .split(" ")
                        .map((n: string) => n[0])
                        .join("")}
                    </span>
                    <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
                      <span className="text-xs">👑</span>
                    </div>
                  </div>
                  <h4 className="font-semibold text-gray-900">{topPerformer.name}</h4>
                  <p className="text-sm text-gray-500 mb-2">
                    {topPerformer.transactions} transactions
                  </p>
                  <p className="text-lg font-bold" style={{ color: '#1e2d6b' }}>
                    {formatCurrency(topPerformer.sales, posDetails?.currency || 'USD')}
                  </p>
                  <div className="mt-3 text-xs text-gray-500">
                    {filteredStats.totalRevenue > 0 ? ((topPerformer.sales / filteredStats.totalRevenue) * 100).toFixed(1) : 0}% of total sales
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No sales data available for selected period
                </div>
              )}
            </div>

            {/* Weekly Trend */}
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Weekly Trend</h3>
                <Calendar className="w-5 h-5 text-gray-400" />
              </div>
              <div className="h-24 flex items-end justify-between space-x-1 mb-4">
                {stats.salesByDay.map((item: { day: string; sales: number }, index: number) => (
                  <div key={index} className="flex flex-col items-center flex-1 group">
                    <div className="relative">
                      <div
                        className="w-full rounded-t cursor-pointer transition-opacity hover:opacity-80"
                        style={{
                          height: `${(item.sales / Math.max(...stats.salesByDay.map((s: { day: string; sales: number }) => s.sales))) * 60}px`,
                          minHeight: "4px",
                          backgroundColor: '#1e2d6b',
                        }}
                        title={`${item.day}: ${formatCurrency(item.sales, posDetails?.currency || 'USD')}`}
                      ></div>
                      <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        {formatCurrency(item.sales, posDetails?.currency || 'USD')}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 mt-1">{item.day}</span>
                  </div>
                ))}
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-600">
                  Best day: <span className="font-semibold" style={{ color: '#1e2d6b' }}>Friday</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="grid grid-cols-1 gap-4">
            {/* Top Products */}
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Top Selling Products</h3>
                <button className="text-sm hover:underline" style={{ color: '#1e2d6b' }}>View All</button>
              </div>
              <div className="space-y-3">
                {topProducts.map((product, index) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#eef1f8' }}>
                        <span className="text-sm font-bold" style={{ color: '#1e2d6b' }}>{index + 1}</span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{product.name}</div>
                        <div className="text-sm text-gray-500 capitalize">
                          {product.sales} sold
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">{formatCurrency(product.revenue, posDetails?.currency || 'USD')}</div>
                      <div className="text-xs text-gray-500">
                        {formatCurrency(product.sales > 0 ? (product.revenue / product.sales) : 0, posDetails?.currency || 'USD')} avg
                      </div>
                    </div>
                  </div>
                ))}
                {topProducts.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No product data available for selected period
                  </div>
                )}
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
                <button
                  onClick={() => navigate("/closing_shift")}
                  className="text-sm hover:underline"
                  style={{ color: '#1e2d6b' }}
                >
                  View All Reports
                </button>
              </div>
              <div className="space-y-3">
                {recentTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                        {transaction.paymentMethod === "Cash" ? (
                          <span className="text-lg">💵</span>
                        ) : (
                          <CreditCard className="w-4 h-4 text-gray-600" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{transaction.id}</div>
                        <div className="text-sm text-gray-500">
                          {transaction.customer} • {transaction.time}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(transaction.totalAmount, transaction.currency || posDetails?.currency || 'USD')}
                      </div>
                      <div
                        className={`text-xs ${
                          transaction.status === "Completed"
                            ? ""
                            : transaction.status === "Refunded"
                              ? "text-red-600"
                              : "text-yellow-600"
                        }`}
                        style={transaction.status === "Completed" ? { color: '#1e2d6b' } : {}}
                      >
                        {transaction.status}
                      </div>
                    </div>
                  </div>
                ))}
                {recentTransactions.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No transactions available for selected period
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Navigation */}
        <BottomNavigation />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex pb-12" style={{ backgroundColor: '#eef1f8' }}>

      <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">

              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Sales Dashboard</h1>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
              </button>
              {/* <button className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-ziditech-600 text-white rounded-lg hover:bg-ziditech-700 transition-colors">
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Refresh</span>
              </button> */}
              {/* <button className="hidden sm:flex items-center space-x-2 px-4 py-2 bg-ziditech-600 text-white rounded-lg hover:bg-orange-700 transition-colors">
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button> */}
            </div>
          </div>
        </div>
      </div>

        <div className="flex-1 px-6 py-8">
        {/* Enhanced Filters */}
        {showFilters && (
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200 mb-6 sm:mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Dashboard Filters</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Time Range</label>
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 bg-white text-gray-900"
                >
                  <option value="">Current POS Session</option>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cashier</label>
                <select
                  value={cashierFilter}
                  onChange={(e) => setCashierFilter(e.target.value)}
                  disabled={!isAdminUser}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 bg-white text-gray-900 ${
                    !isAdminUser ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <option value="all">All Cashiers</option>
                  {uniqueCashiers.map((cashier: string) => (
                    <option key={cashier} value={cashier}>
                      {cashier}
                    </option>
                  ))}
                </select>
                {!isAdminUser && (
                  <p className="text-xs text-gray-500 mt-1">
                    Showing only your transactions
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method
                </label>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 bg-white text-gray-900"
                >
                  <option value="all">All Methods</option>
                  <option value="Cash">Cash</option>
                  <option value="Debit Card">Debit Card</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setTimeRange("today")
                    setCashierFilter("all")
                    setPaymentFilter("all")
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-900"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Revenue</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {formatCurrency(filteredStats.totalRevenue, posDetails?.currency || 'USD')}
                </p>
                <div className="flex items-center mt-2">
                  <TrendingUp className="w-4 h-4 text-orange-500 mr-1" />
                  <span className="text-sm text-orange-600">+12.5%</span>
                  <span className="text-xs text-gray-500 ml-1 hidden sm:inline">vs last period</span>
                </div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Transactions</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {filteredStats.totalTransactions}
                </p>
                <div className="flex items-center mt-2">
                  <TrendingUp className="w-4 h-4 text-orange-500 mr-1" />
                  <span className="text-sm text-orange-600">+8.2%</span>
                  <span className="text-xs text-gray-500 ml-1 hidden sm:inline">vs last period</span>
                </div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#eef1f8' }}>
                <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: '#1e2d6b' }} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Order Value</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {formatCurrency(filteredStats.averageOrderValue, posDetails?.currency || 'USD')}
                </p>
                <div className="flex items-center mt-2">
                  <TrendingUp className="w-4 h-4 text-orange-500 mr-1" />
                  <span className="text-sm text-orange-600">+3.8%</span>
                  <span className="text-xs text-gray-500 ml-1 hidden sm:inline">vs last period</span>
                </div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Items Sold</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {filteredStats.totalItems}
                </p>
                <div className="flex items-center mt-2">
                  <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                  <span className="text-sm text-red-600">-2.1%</span>
                  <span className="text-xs text-gray-500 ml-1 hidden sm:inline">vs last period</span>
                </div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Sales by Hour Chart - Only show for today */}
          {timeRange === "today" && salesByHourData.length > 0 && (
            <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Sales by Hour (Today)</h3>
                <div className="flex items-center space-x-4">
                  {/* Graph Type Toggle */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setSalesByHourGraphType("bar")}
                      className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                        salesByHourGraphType === "bar"
                          ? "text-white"
                          : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                      }`}
                      style={salesByHourGraphType === "bar" ? { backgroundColor: '#1e2d6b' } : {}}
                    >
                      Bar
                    </button>
                    <button
                      onClick={() => setSalesByHourGraphType("line")}
                      className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                        salesByHourGraphType === "line"
                          ? "text-white"
                          : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                      }`}
                      style={salesByHourGraphType === "line" ? { backgroundColor: '#1e2d6b' } : {}}
                    >
                      Line
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-500 hidden sm:inline">
                                                                      {/* @ts-expect-error just ignore */}
                      Peak: {salesByHourData.reduce((max, item) => item.sales > max.sales ? item : max, salesByHourData[0])?.hour || "N/A"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="h-48 sm:h-64 flex items-end justify-between space-x-1">
                {salesByHourData.map((item: { hour: string; sales: number }, index: number) => {
                  const maxSales = Math.max(...salesByHourData.map(s => s.sales))
                  const height = maxSales > 0 ? (item.sales / maxSales) * 180 : 4

                  return (
                    <div key={index} className="flex flex-col items-center flex-1 group">
                      <div className="relative w-full">
                        {salesByHourGraphType === "bar" ? (
                          <div
                            className="w-full rounded-t cursor-pointer transition-opacity hover:opacity-80"
                            style={{
                              height: `${height}px`,
                              minHeight: "4px",
                              backgroundColor: '#1e2d6b',
                            }}
                            title={`${item.hour}: ${formatCurrency(item.sales, posDetails?.currency || 'USD')}`}
                          ></div>
                        ) : (
                          <div className="relative w-full h-full">
                            {/* Line graph implementation */}
                            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                              {index > 0 && (
                                <line
                                  x1="0"
                                  // @ts-expect-error just ignore
                                  y1={`${100 - (salesByHourData[index - 1].sales / maxSales) * 100}`}
                                  x2="100"
                                  y2={`${100 - (item.sales / maxSales) * 100}`}
                                  stroke="#1e2d6b"
                                  strokeWidth="2"
                                />
                              )}
                              <circle
                                cx="100"
                                cy={`${100 - (item.sales / maxSales) * 100}`}
                                r="3"
                                fill="#1e2d6b"
                              />
                            </svg>
                          </div>
                        )}
                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                          {formatCurrency(item.sales, posDetails?.currency || 'USD')}
                        </div>
                      </div>
                      <span className="text-xs text-gray-500 mt-2 transform -rotate-45 origin-top-left">
                        {item.hour}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 text-center">
                <div className="text-sm text-gray-600">
                  Total Revenue: <span className="font-semibold" style={{ color: '#1e2d6b' }}>
                    {formatCurrency(salesByHourData.reduce((sum, item) => sum + item.sales, 0), posDetails?.currency || 'USD')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Enhanced Payment Methods Chart */}
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Payment Methods</h3>
              <PieChart className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-4">
              {paymentMethodsData.map((method, index) => {
                const hexColors = ['#f97316', '#1e2d6b', '#6366f1', '#8b5cf6', '#ec4899']
                const color = hexColors[index % hexColors.length]
                return (
                  <div key={method.method} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: color }}></div>
                      <span className="text-sm text-gray-700">{method.method}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(method.amount, posDetails?.currency || 'USD')}
                      </div>
                      <div className="text-sm text-gray-500">
                        {method.percentage.toFixed(1)}% • {method.transactions} txns
                      </div>
                    </div>
                  </div>
                )
              })}
              {paymentMethodsData.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No payment data available for selected period
                </div>
              )}
            </div>
            <div className="mt-4">
              <div className="flex rounded-lg overflow-hidden h-4">
                {paymentMethodsData.map((method, index) => {
                  const hexColors = ['#f97316', '#1e2d6b', '#6366f1', '#8b5cf6', '#ec4899']
                  const color = hexColors[index % hexColors.length]
                  return (
                    <div
                      key={method.method}
                      style={{ width: `${method.percentage}%`, backgroundColor: color }}
                    ></div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Additional Stats Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* ZATCA Status Bar Chart (desktop) */}
          {posDetails?.is_zatca_enabled && zatcaData.total > 0 && (
            <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">ZATCA Status</h3>
                <BarChart3 className="w-5 h-5 text-gray-400" />
              </div>
              <div className="h-64 flex items-end justify-between space-x-3 mb-6">
                {zatcaData.segments.map((segment) => {
                  const maxCount = Math.max(...zatcaData.segments.map(s => s.count))
                  const height = maxCount > 0 ? (segment.count / maxCount) * 200 : 4

                  return (
                    <div key={segment.status} className="flex flex-col items-center flex-1 group">
                      <div className="relative w-full">
                        <div
                          className="w-full rounded-t hover:opacity-80 transition-opacity cursor-pointer"
                          style={{
                            height: `${height}px`,
                            minHeight: "4px",
                            backgroundColor: segment.color
                          }}
                          title={`${segment.status}: ${segment.count} (${Math.round(segment.percentage)}%)`}
                        ></div>
                        <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                          {segment.count}
                        </div>
                      </div>
                      <span className="text-xs text-gray-500 mt-3 text-center leading-tight">
                        {segment.status}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="space-y-3">
                {zatcaData.segments.map(segment => (
                  <div key={segment.status} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: segment.color }}></span>
                      <span className="text-gray-700">{segment.status}</span>
                    </div>
                    <span className="text-gray-600">
                      {segment.count} ({Math.round(segment.percentage)}%)
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="text-center text-sm text-gray-600">
                  Total Invoices: <span className="font-semibold" style={{ color: '#1e2d6b' }}>{zatcaData.total}</span>
                </div>
              </div>
            </div>
          )}


          {/* Enhanced Top Cashier */}
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Top Performer</h3>
              <Users className="w-5 h-5" style={{ color: '#1e2d6b' }} />
            </div>
            {topPerformer ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 relative" style={{ backgroundColor: '#1e2d6b' }}>
                  <span className="text-white font-bold text-xl">
                    {topPerformer.name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")}
                  </span>
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
                    <span className="text-xs">👑</span>
                  </div>
                </div>
                <h4 className="font-semibold text-gray-900">{topPerformer.name}</h4>
                <p className="text-sm text-gray-500 mb-2">
                  {topPerformer.transactions} transactions
                </p>
                <p className="text-lg font-bold" style={{ color: '#1e2d6b' }}>
                  {formatCurrency(topPerformer.sales, posDetails?.currency || 'USD')}
                </p>
                <div className="mt-3 text-xs text-gray-500">
                  {filteredStats.totalRevenue > 0 ? ((topPerformer.sales / filteredStats.totalRevenue) * 100).toFixed(1) : 0}% of total sales
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No sales data available for selected period
              </div>
            )}
          </div>


        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Enhanced Top Products */}
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Top Selling Products</h3>
              <button className="text-sm hover:underline" style={{ color: '#1e2d6b' }}>View All</button>
            </div>
            <div className="space-y-4">
              {topProducts.map((product, index) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#eef1f8' }}>
                      <span className="text-sm font-bold" style={{ color: '#1e2d6b' }}>{index + 1}</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{product.name}</div>
                      <div className="text-sm text-gray-500 capitalize">
                        {product.sales} sold
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{formatCurrency(product.revenue, posDetails?.currency || 'USD')}</div>
                    <div className="text-xs text-gray-500">
                      {formatCurrency(product.sales > 0 ? (product.revenue / product.sales) : 0, posDetails?.currency || 'USD')} avg
                    </div>
                  </div>
                </div>
              ))}
              {topProducts.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No product data available for selected period
                </div>
              )}
            </div>
          </div>

          {/* Enhanced Recent Transactions */}
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
              <button
                onClick={() => navigate("/closing_shift")}
                className="text-sm hover:underline"
                style={{ color: '#1e2d6b' }}
              >
                View All Reports
              </button>
            </div>
            <div className="space-y-4">
              {recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                      {transaction.paymentMethod === "Cash" ? (
                        <span className="text-lg">💵</span>
                      ) : (
                        <CreditCard className="w-4 h-4 text-gray-600" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{transaction.id}</div>
                      <div className="text-sm text-gray-500">
                        {transaction.customer} • {transaction.time}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">
                      {formatCurrency(transaction.totalAmount, transaction.currency || posDetails?.currency || 'USD')}
                    </div>
                    <div
                      className={`text-xs ${
                        transaction.status === "Completed"
                          ? ""
                          : transaction.status === "Refunded"
                            ? "text-red-600"
                            : "text-yellow-600"
                      }`}
                      style={transaction.status === "Completed" ? { color: '#1e2d6b' } : {}}
                    >
                      {transaction.status}
                    </div>
                  </div>
                </div>
              ))}
              {recentTransactions.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No transactions available for selected period
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
