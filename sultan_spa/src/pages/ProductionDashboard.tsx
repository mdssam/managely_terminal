import { useState, useEffect } from "react"
import { Activity, Box, Calendar, ClipboardList, Factory, TrendingUp } from "lucide-react"
import { usePOSDetails } from "../hooks/usePOSProfile"
import BottomNavigation from "../components/BottomNavigation"
import { useMediaQuery } from "../hooks/useMediaQuery"

interface DailyTrend {
  date: string
  total_qty: number
  total_orders: number
}

interface TopItem {
  item_code: string
  qty: number
}

interface ProductionData {
  daily_trends: DailyTrend[]
  top_produced_items: TopItem[]
}

export default function ProductionDashboard() {
  const isMobile = useMediaQuery("(max-width: 1024px)")
  const { posDetails } = usePOSDetails()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ProductionData | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/method/sultan.sultan.api.get_daily_throughput")
        const payload = await res.json()
        if (payload.message) {
          setData(payload.message)
        }
      } catch (err) {
        console.error("Failed to load throughput data:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ziditech-600 mx-auto"></div>
      </div>
    )
  }

  const trends = data?.daily_trends || []
  const topItems = data?.top_produced_items || []
  
  // Derived stats
  const totalProduced = trends.reduce((sum, t) => sum + (t.total_qty || 0), 0)
  const totalOrders = trends.reduce((sum, t) => sum + (t.total_orders || 0), 0)
  const avgPerOrder = totalOrders > 0 ? (totalProduced / totalOrders).toFixed(1) : 0
  
  const todayStr = new Date().toISOString().split("T")[0]
  const todayStats = trends.find(t => t.date === todayStr) || { total_qty: 0, total_orders: 0 }

  return (
    <div className="min-h-screen bg-gray-50 pb-12 text-gray-900">
      <header className="px-6 py-8 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-ziditech-100 dark:bg-ziditech-900/30 rounded-xl text-ziditech-600 dark:text-ziditech-400">
            <Factory size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Production Dashboard</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Live Manufacturing Throughput and Performance Analytics</p>
          </div>
        </div>
      </header>

      <main className="px-6 mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Overview Cards */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Today's Production</p>
              <h3 className="text-3xl font-bold mt-2 group-hover:text-ziditech-600 transition-colors">{todayStats.total_qty}</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 flex items-center">
                <ClipboardList size={12} className="mr-1"/> {todayStats.total_orders} work orders today
              </p>
            </div>
            <div className="p-3 bg-ziditech-50 dark:bg-ziditech-900/20 text-ziditech-600 dark:text-ziditech-400 rounded-lg">
              <Activity size={20} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Produced (30 Days)</p>
              <h3 className="text-3xl font-bold mt-2 group-hover:text-ziditech-600 transition-colors">{totalProduced}</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 flex items-center">
                <Box size={12} className="mr-1"/> Cumulative item volume
              </p>
            </div>
            <div className="p-3 bg-ziditech-50 dark:bg-ziditech-900/20 text-ziditech-600 dark:text-ziditech-400 rounded-lg">
              <Box size={20} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Completed Orders</p>
              <h3 className="text-3xl font-bold mt-2 group-hover:text-ziditech-600 transition-colors">{totalOrders}</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 flex items-center">
                <Calendar size={12} className="mr-1"/> Last 30 active days
              </p>
            </div>
            <div className="p-3 bg-ziditech-50 dark:bg-ziditech-900/20 text-ziditech-600 dark:text-ziditech-400 rounded-lg">
              <ClipboardList size={20} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Avg Yield per Order</p>
              <h3 className="text-3xl font-bold mt-2 group-hover:text-ziditech-600 transition-colors">{avgPerOrder}</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 flex items-center">
                <TrendingUp size={12} className="mr-1"/> Unit conversion metric
              </p>
            </div>
            <div className="p-3 bg-ziditech-50 dark:bg-ziditech-900/20 text-ziditech-600 dark:text-ziditech-400 rounded-lg">
              <TrendingUp size={20} />
            </div>
          </div>
        </div>
      </main>

      <div className="px-6 mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Trend Chart Component */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold">Daily Throughput History</h3>
            <span className="text-xs bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full text-gray-500 dark:text-gray-400">Last 30 Days</span>
          </div>
          
          <div className="h-64 flex items-end space-x-2 border-b border-gray-200 dark:border-gray-700 pb-1">
            {trends.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm italic h-full">
                No production history generated yet
              </div>
            ) : (
              trends.slice(-14).map((day, idx) => {
                const maxVal = Math.max(...trends.map(t => t.total_qty), 1)
                const pct = (day.total_qty / maxVal) * 100
                return (
                  <div key={idx} className="flex-1 flex flex-col justify-end items-center group cursor-pointer h-full relative">
                    <div 
                       style={{height: `${Math.max(pct, 5)}%`}}
                       className="w-full bg-ziditech-600 dark:bg-ziditech-500 rounded-t-md transition-all duration-300 group-hover:bg-ziditech-400 dark:group-hover:bg-ziditech-300"
                    ></div>
                    <div className="absolute opacity-0 group-hover:opacity-100 bottom-full mb-2 bg-gray-900 text-white text-[10px] py-1 px-2 rounded shadow-lg whitespace-nowrap pointer-events-none z-10 transition-opacity">
                       {day.total_qty} units / {day.total_orders} orders
                    </div>
                    <div className="text-[10px] text-gray-400 mt-2 rotate-45 origin-left whitespace-nowrap overflow-hidden">
                       {day.date.substring(5)}
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <div className="mt-12 text-xs text-gray-400 text-center italic">Production output visualized by date</div>
        </div>

        {/* Top Items Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col">
           <h3 className="text-lg font-bold mb-6">Top Produced Assets</h3>
           <div className="space-y-4 flex-1 overflow-y-auto">
             {topItems.length === 0 ? (
               <p className="text-gray-500 dark:text-gray-400 text-center py-10 text-sm italic">No produced items mapped</p>
             ) : (
               topItems.map((item, i) => {
                 const maxItemQty = Math.max(...topItems.map(x => x.qty), 1)
                 const widthPct = (item.qty / maxItemQty) * 100
                 return (
                   <div key={i} className="space-y-2">
                     <div className="flex justify-between items-center text-sm">
                       <span className="font-semibold truncate max-w-[160px]">{item.item_code}</span>
                       <span className="text-gray-500 dark:text-gray-400">{item.qty} units</span>
                     </div>
                     <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                       <div 
                          className="h-full bg-ziditech-600 rounded-full"
                          style={{width: `${widthPct}%`}}
                       ></div>
                     </div>
                   </div>
                 )
               })
             )}
           </div>
        </div>
      </div>
      
      {isMobile && <BottomNavigation />}
    </div>
  )
}
