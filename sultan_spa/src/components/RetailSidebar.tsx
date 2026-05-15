import { Receipt, Grid3X3, BarChart3, Users, MonitorX, Factory, Settings } from "lucide-react"
import { useNavigate, useLocation } from "react-router-dom"
import { useUserInfo } from "../hooks/useUserInfo"

// Inside your component
export default function RetailSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { userInfo } = useUserInfo()

  const canAccessSalesDashboard = userInfo?.is_admin_user ?? false

  const isMenuUser = (userInfo as any)?.role === "Menu User"

  const menuItems = [
    { icon: Grid3X3, path: "/pos", label: "POS" },
    ...(!isMenuUser ? [
      { icon: Receipt, path: "/invoice", label: "Invoices" },
      { icon: Users, path: "/customers", label: "Customers" },
      { icon: BarChart3, path: "/dashboard", label: "Dashboard", requiresSalesDashboard: true },
      { icon: Factory, path: "/manufacturing", label: "Manufacturing" },
      { icon: MonitorX, path: "/closing_shift", label: "Closing Shift" },
    ] : [])
  ]

  const isActive = (path: string) => {
    if (path === "/pos") {
      return location.pathname === "/" || location.pathname === "/pos"
    }
    return location.pathname.startsWith(path)
  }

  const handleNav = (item: (typeof menuItems)[0]) => {
    if (item.requiresSalesDashboard && !canAccessSalesDashboard) return
    navigate(item.path)
  }

  return (
    <div className="hidden lg:flex fixed h-screen w-20 top-0 left-0 bg-ziditech-950/80 backdrop-blur-2xl flex-col border-r border-white/10 z-50">
      {/* Logo Section */}
      <div
          className="h-24 flex items-center justify-center cursor-pointer active:scale-90 transition-transform duration-150"
          onClick={() => navigate("/")}
        >
          <div className="w-14 h-14 rounded-2xl bg-ziditech-600 flex items-center justify-center shadow-lg shadow-ziditech-600/20">
            <span className="text-white font-black text-xl tracking-tighter">S</span>
          </div>
        </div>

      {/* Menu Items */}
      <div className="flex-1 flex flex-col items-center py-6 space-y-4">
        {menuItems.map((item, index) => {
          const disabled = item.requiresSalesDashboard && !canAccessSalesDashboard
          const active = isActive(item.path)
          return (
          <button
            key={index}
            onClick={() => handleNav(item)}
            disabled={disabled}
            title={disabled ? "Sales Dashboard Restricted" : item.label}
            className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all duration-200 ${
              disabled
                ? "opacity-30 cursor-not-allowed text-gray-600"
                : "cursor-pointer active:scale-90 " + (
              active
                ? "bg-ziditech-600 text-white shadow-2xl shadow-ziditech-600/40"
                : "text-ziditech-400 hover:bg-white/5"
            )
            }`}
          >
            <item.icon size={22} strokeWidth={2.5} />
            <span className="text-[9px] font-black mt-1 uppercase tracking-tighter">{item.label.substring(0, 5)}</span>
          </button>
        )})}
      </div>

      {/* Settings at bottom */}
      <div className="mt-auto p-6 pb-12 border-t border-white/10">
        <button
          onClick={() => navigate("/settings")}
          className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all duration-200 ${
            location.pathname === "/settings"
              ? "bg-ziditech-600 text-white shadow-2xl shadow-ziditech-600/40"
              : "text-gray-500 hover:bg-white/5"
          } mx-auto`}
        >
          <Settings size={22} strokeWidth={2.5} />
          <span className="text-[9px] font-black mt-1 uppercase tracking-tighter">SETTS</span>
        </button>
      </div>
    </div>
  )
}
