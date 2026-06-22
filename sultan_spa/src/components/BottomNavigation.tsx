import { Receipt, FileText, Grid3X3, BarChart3, Users, ChefHat } from "lucide-react"
import { useNavigate, useLocation } from "react-router-dom"
import { useUserInfo } from "../hooks/useUserInfo"
import { useAuth } from "../hooks/useAuth"

export default function BottomNavigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const { userInfo } = useUserInfo()

  const { user } = useAuth()
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
    { icon: Receipt, path: "/invoice", label: "Invoice" },
    { icon: BarChart3, path: "/sales_dashboard", label: "Dashboard" },
    { icon: FileText, path: "/closing_shift", label: "Closing" },
  ].filter(item => {
    if (isAdmin) return true;
    if (isAuditor || isBranchManager) {
      return ["/invoice", "/sales_dashboard"].includes(item.path);
    }
    // Cashier
    return ["/pos", "/invoice"].includes(item.path);
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
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50 safe-area-pb">
      <div className="flex items-center justify-around py-2 px-4">
        {menuItems.map((item, index) => {
          const disabled = false;
          return (
          <button
            key={index}
            onClick={() => handleNav(item)}
            disabled={disabled}
            title={item.label}
            className={`flex flex-col items-center justify-center min-w-0 flex-1 py-2 px-1 transition-colors ${
              disabled
                ? "opacity-50 cursor-not-allowed text-gray-400 dark:text-gray-500"
                : (isActive(item.path)
                ? "text-gray-900 dark:text-gray-500"
                : "text-gray-400 dark:text-gray-500")
            }`}
          >
            <item.icon
              size={20}
              className={`mb-1 ${
                disabled
                  ? "text-gray-400 dark:text-gray-500"
                  : (isActive(item.path)
                  ? "text-gray-900 dark:text-gray-500"
                  : "text-gray-400 dark:text-gray-500")
              }`}
            />
            <span
              className={`text-xs font-medium truncate ${
                disabled
                  ? "text-gray-400 dark:text-gray-500"
                  : (isActive(item.path)
                  ? "text-gray-900 dark:text-gray-500"
                  : "text-gray-400 dark:text-gray-500")
              }`}
            >
              {item.label}
            </span>
          </button>
        )})}
      </div>
    </div>
  )
}
