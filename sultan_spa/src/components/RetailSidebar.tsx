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
    <div className="hidden lg:flex fixed h-screen w-28 top-0 left-0 flex-col z-50" style={{ backgroundColor: '#4c28cc' }}>
      {/* Logo Section */}
      <div
          className="h-20 flex items-center justify-center cursor-pointer active:scale-90 transition-transform duration-150 border-b border-white/10"
          onClick={() => navigate("/")}
        >
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
            <span className="text-white font-black text-lg tracking-tighter">S</span>
          </div>
        </div>

      {/* Menu Items */}
      <div className="flex-1 flex flex-col items-center py-5 space-y-1">
        {menuItems.map((item, index) => {
          const disabled = item.requiresSalesDashboard && !canAccessSalesDashboard
          const active = isActive(item.path)
          return (
          <button
            key={index}
            onClick={() => handleNav(item)}
            disabled={disabled}
            title={disabled ? "Sales Dashboard Restricted" : item.label}
            className={`w-13 h-13 px-2 py-2.5 rounded-xl flex flex-col items-center justify-center transition-all duration-150 ${
              disabled
                ? "opacity-25 cursor-not-allowed text-white/30"
                : "cursor-pointer active:scale-90 " + (
              active
                ? "bg-white/20 text-white"
                : "text-white/50 hover:bg-white/10 hover:text-white"
            )
            }`}
          >
            <item.icon size={20} strokeWidth={2} />
            <span className="text-[8px] font-semibold mt-1 uppercase tracking-wide opacity-80">{item.label.substring(0, 5)}</span>
          </button>
        )})}
      </div>

      {/* Settings at bottom */}
      <div className="p-4 pb-8 border-t border-white/10">
        <button
          onClick={() => navigate("/settings")}
          className={`w-full px-2 py-2.5 rounded-xl flex flex-col items-center justify-center transition-all duration-150 ${
            location.pathname === "/settings"
              ? "bg-white/20 text-white"
              : "text-white/50 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Settings size={20} strokeWidth={2} />
          <span className="text-[8px] font-semibold mt-1 uppercase tracking-wide opacity-80">SET</span>
        </button>
      </div>
    </div>
  )
}
