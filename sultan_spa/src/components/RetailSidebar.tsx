import { Receipt, Grid3X3, BarChart3, Users, MonitorX, Factory, Settings, WifiOff, Wifi, ArrowLeftRight, Store, ChefHat, Lock, FileText, ShieldAlert } from "lucide-react"
import { useNavigate, useLocation } from "react-router-dom"
import { useUserInfo } from "../hooks/useUserInfo"
import { useAuth } from "../hooks/useAuth"
import { useState, useEffect } from "react"
import backgroundSyncService from "../services/backgroundSyncService"
import { usePOSDetails } from "../hooks/usePOSProfile"

// Inside your component
export default function RetailSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { userInfo } = useUserInfo()
  const [syncStatus, setSyncStatus] = useState(backgroundSyncService.getStatus())
  const { posDetails } = usePOSDetails()

  useEffect(() => {
    const handler = (status: typeof syncStatus) => setSyncStatus({ ...status })
    backgroundSyncService.on('status_change', handler)
    return () => backgroundSyncService.off('status_change', handler)
  }, [])

  const { user, lockEmployee } = useAuth()
  const roleLower = user?.role?.toLowerCase() || userInfo?.role?.toLowerCase() || "";
  const isAuditor = roleLower === "auditor";
  const isBranchManager = roleLower === "branch manager";
  const isAdmin = user?.is_employee
    ? roleLower === "administrator"
    : (roleLower === "administrator" || user?.name === "Administrator" || userInfo?.is_admin_user || user?.is_admin_user);

  const isMenuUser = (userInfo as any)?.role === "Menu User"

  const menuItems = isMenuUser ? [
    { icon: ChefHat, path: "/order-station", label: "Order" }
  ] : [
    { icon: Grid3X3, path: "/pos", label: "POS" },
    { icon: Receipt, path: "/invoice", label: "Invoices" },
    { icon: BarChart3, path: "/sales_dashboard", label: "Dashboard" },
    { icon: ArrowLeftRight, path: "/cash_transactions_report", label: "IN/OUT" },
    { icon: Store, path: "/branch-sessions", label: "Branch" },
    { icon: MonitorX, path: "/closing_shift", label: "Closing Shift" },
    ...(isAdmin ? [{ icon: ShieldAlert, path: "/security_audit", label: "Security" }] : []),
  ].filter(item => {
    if (isAdmin) return true;
    if (isAuditor || isBranchManager) {
      return ["/invoice", "/sales_dashboard", "/cash_transactions_report"].includes(item.path);
    }
    // Cashier
    return ["/pos", "/invoice", "/cash_transactions_report"].includes(item.path);
  })

  const isActive = (path: string) => {
    if (path === "/pos") {
      return location.pathname === "/" || location.pathname === "/pos"
    }
    return location.pathname.startsWith(path)
  }

  const handleNav = (item: (typeof menuItems)[0]) => {
    navigate(item.path)
  }

  return (
    <>
    <div className="hidden lg:flex fixed h-screen w-28 top-0 left-0 flex-col z-50 sultan-sidebar" style={{ background: 'linear-gradient(135deg, #3a76fc 0%, #1a53d3 100%)', color: 'white' }}>
      {/* Logo Section */}
      <div
        className="h-20 flex items-center justify-center cursor-pointer active:scale-90 transition-transform duration-150 border-b border-white/10"
        onClick={() => navigate("/")}
      >
        <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center border border-white/20 overflow-hidden">
          <img src="/assets/sultan/sultan_spa/managelyLogo.webp" alt="Managely" className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Menu Items */}
      <div className="flex-1 flex flex-col items-center py-5 space-y-1">
        {menuItems.map((item, index) => {
          const disabled = false;
          const active = isActive(item.path)

          return (
            <div key={index} className="flex flex-col items-center space-y-1 w-full">
              <button
                onClick={() => handleNav(item)}
                disabled={disabled}
                title={item.label}
                style={{ color: 'white' }}
                className={`w-13 h-13 px-2 py-2.5 rounded-xl flex flex-col items-center justify-center transition-all duration-150 ${disabled
                    ? "opacity-25 cursor-not-allowed"
                    : "cursor-pointer active:scale-90 " + (active ? "bg-white/25" : "hover:bg-white/10")
                  }`}
              >
                <item.icon size={20} strokeWidth={2.5} />
                <span style={{ color: 'white' }} className="text-[10px] font-bold mt-1 uppercase tracking-wide whitespace-nowrap">{item.label}</span>
              </button>
            </div>
          )
        })}
      </div>

      {/* Connection status indicator */}
      <div className="px-3 py-2 border-t border-white/10 flex flex-col items-center">
        <button
          onClick={() => { if (syncStatus.isOnline) backgroundSyncService.forceSync() }}
          title={syncStatus.isOnline ? `Online${syncStatus.pendingUpdates > 0 ? ` — ${syncStatus.pendingUpdates} pending` : ''}` : 'Offline — sales are queued'}
          className="w-full flex flex-col items-center py-2 rounded-xl transition-all duration-150 hover:bg-white/10 active:scale-90"
        >
          {syncStatus.isOnline ? (
            <Wifi size={18} className={syncStatus.isSyncing ? 'text-yellow-300 animate-pulse' : 'text-green-300'} />
          ) : (
            <WifiOff size={18} className="text-red-300" />
          )}
          {syncStatus.pendingUpdates > 0 && (
            <span className="mt-1 text-[9px] font-bold bg-orange-500 text-white rounded-full px-1.5 leading-4">
              {syncStatus.pendingUpdates}
            </span>
          )}
          <span style={{ color: 'white' }} className="text-[10px] font-bold mt-1 uppercase tracking-wide">
            {syncStatus.isOnline ? (syncStatus.isSyncing ? 'SYNC' : 'LIVE') : 'OFFLINE'}
          </span>
        </button>
      </div>

      {/* Settings at bottom */}
      <div className="p-4 pb-8 border-t border-white/10 flex flex-col gap-2">
        <button
          onClick={() => navigate("/settings")}
          style={{ color: 'white' }}
          className={`w-full px-2 py-2.5 rounded-xl flex flex-col items-center justify-center transition-all duration-150 ${location.pathname === "/settings" ? "bg-white/25" : "hover:bg-white/10"
            }`}
        >
          <Settings size={20} strokeWidth={2} />
          <span style={{ color: 'white' }} className="text-[10px] font-bold mt-1 uppercase tracking-wide">SET</span>
        </button>

        <button
          onClick={async () => {
            await lockEmployee();
            navigate("/employee-login");
          }}
          style={{ color: 'white' }}
          className="w-full px-2 py-2.5 rounded-xl flex flex-col items-center justify-center transition-all duration-150 hover:bg-white/10"
        >
          <Lock size={20} strokeWidth={2} />
          <span style={{ color: 'white' }} className="text-[10px] font-bold mt-1 uppercase tracking-wide">LOCK</span>
        </button>
      </div>
    </div>
    </>
  )
}
