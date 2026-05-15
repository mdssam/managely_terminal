import { useState, useEffect } from "react"
import { useAuth } from "../hooks/useAuth"
import { useNavigate, useLocation } from "react-router-dom"
import { useI18n } from "../hooks/useI18n"
import {
  ArrowLeft, User, LogOut, UserPlus, Trash2,
  Home, Plus, MapPin, Package, RefreshCw, CheckCircle2,
} from "lucide-react"
import erpnextAPI from "../services/erpnext-api"
import { toast } from "react-toastify"

interface ERPUser {
  name: string
  full_name: string
  email: string
  role_profile_name?: string
  enabled: number
}

interface Warehouse {
  name: string
  warehouse_name: string
  city?: string
  warehouse_type?: string
  is_group?: number
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, user: authUser } = useAuth()
  const { isRTL } = useI18n()
  const [activeSection, setActiveSection] = useState("profile")

  // Handle ?tab= param
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tab = params.get("tab")
    if (tab && ["profile", "users", "warehouses"].includes(tab)) {
      setActiveSection(tab)
    }
  }, [location])

  const getCSRFToken = () => {
    // 1. Try global variables
    const token = (window as any).csrf_token || (window as any).frappe?.csrf_token || (window as any).frappe?.boot?.csrf_token;
    if (token) return token;

    // 2. Try cookies
    const cookieToken = document.cookie
      .split("; ")
      .find((row) => row.startsWith("frappe_csrf_token="))
      ?.split("=")[1];
    if (cookieToken) return decodeURIComponent(cookieToken);

    return "";
  }

  // ERPNext Users state
  const [erpUsers, setErpUsers] = useState<ERPUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [newUser, setNewUser] = useState({ first_name: "", email: "", role_profile_name: "Cashier" })

  // ERPNext Warehouses state
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loadingWarehouses, setLoadingWarehouses] = useState(false)
  const [showAddWarehouseModal, setShowAddWarehouseModal] = useState(false)
  const [newWarehouse, setNewWarehouse] = useState({ warehouse_name: "", city: "", warehouse_type: "Retail" })

  // Fetch ERPNext users
  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch(`/api/resource/User?fields=["name","full_name","email","role_profile_name","enabled"]&limit=100`, {
        credentials: "include",
        headers: { "Accept": "application/json" }
      })
      const data = await res.json()
      if (data.data) setErpUsers(data.data)
    } catch (e) {
      console.error("Failed to load users", e)
    } finally {
      setLoadingUsers(false)
    }
  }

  // Fetch ERPNext warehouses
  const fetchWarehouses = async () => {
    setLoadingWarehouses(true)
    try {
      const res = await fetch(`/api/resource/Warehouse?fields=["name","warehouse_name","city","warehouse_type","is_group"]&filters=[["is_group","=",0]]&limit=50`, {
        credentials: "include",
        headers: { "Accept": "application/json" }
      })
      const data = await res.json()
      if (data.data) setWarehouses(data.data)
    } catch (e) {
      console.error("Failed to load warehouses", e)
    } finally {
      setLoadingWarehouses(false)
    }
  }

  useEffect(() => {
    if (activeSection === "users") fetchUsers()
    if (activeSection === "warehouses") fetchWarehouses()
  }, [activeSection])

  const handleLogout = async () => {
    try { await logout() } catch (e) { console.error(e) }
    navigate("/login")
  }

  // Change role to any target role (including blank to remove)
  const handleChangeRole = async (user: ERPUser, newRole: string) => {
    try {
      await erpnextAPI.updateDoc("User", user.name, { role_profile_name: newRole })
      setErpUsers(prev => prev.map(u => u.name === user.name ? { ...u, role_profile_name: newRole } : u))
      toast.success(newRole ? `Role → ${newRole}` : `Role removed from ${user.full_name || user.name}`)
    } catch (e: any) {
      console.error("Role update failed:", e)
      toast.error("Failed to update role")
    }
  }

  // Add new ERPNext user
  const handleAddUser = async () => {
    if (!newUser.first_name || !newUser.email) return
    try {
      await erpnextAPI.createDoc("User", {
        first_name: newUser.first_name,
        email: newUser.email,
        role_profile_name: newUser.role_profile_name,
        send_welcome_email: 0,
      })
      toast.success("User created in ERPNext")
      setNewUser({ first_name: "", email: "", role_profile_name: "Cashier" })
      setShowAddUserModal(false)
      fetchUsers()
    } catch (e: any) {
      console.error("Add user failed:", e)
      toast.error("Failed to create user")
    }
  }

  // Add new ERPNext warehouse
  const handleAddWarehouse = async () => {
    if (!newWarehouse.warehouse_name) return
    try {
      await erpnextAPI.createDoc("Warehouse", {
        warehouse_name: newWarehouse.warehouse_name,
        city: newWarehouse.city,
        warehouse_type: newWarehouse.warehouse_type,
      })
      toast.success("Warehouse created in ERPNext")
      setNewWarehouse({ warehouse_name: "", city: "", warehouse_type: "Retail" })
      setShowAddWarehouseModal(false)
      fetchWarehouses()
    } catch (e: any) {
      console.error("Add warehouse failed:", e)
      toast.error("Failed to create warehouse")
    }
  }

  const sections = [
    { id: "profile", name: "My Profile", icon: User },
    { id: "users", name: "User Management", icon: UserPlus },
    { id: "warehouses", name: "Warehouses", icon: Home },
  ]

  const roleColors: Record<string, string> = {
    "Administrator": "bg-indigo-500/20 text-indigo-400",
    "Cashier": "bg-sky-500/20 text-sky-400",
    "Menu User": "bg-amber-500/20 text-amber-400",
  }

  return (
    <div className={`min-h-screen bg-ziditech-950 text-white ${isRTL ? "rtl" : "ltr"} pb-24 lg:pb-0 lg:pl-20`}>
      <div className="fixed inset-0 bg-grid-pattern opacity-5 pointer-events-none" />

      {/* Header */}
      <div className="bg-ziditech-950/80 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center space-x-5">
            <button onClick={() => navigate(-1)} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all active:scale-90">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight uppercase">Control Center</h1>
              <p className="text-[10px] font-black text-ziditech-400 uppercase tracking-[0.2em]">Sultan POS Management</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center space-x-2 px-5 py-2.5 text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded-2xl font-black border border-red-400/10 transition-all active:scale-95">
            <LogOut className="w-4 h-4" />
            <span className="text-xs uppercase tracking-widest">Sign Out</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-10 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white/5 backdrop-blur-xl rounded-[32px] border border-white/10 p-5 sticky top-28">
              <nav className="space-y-2">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`w-full flex items-center space-x-3 px-5 py-4 rounded-2xl text-left transition-all duration-200 ${
                      activeSection === s.id
                        ? "bg-ziditech-600 text-white shadow-xl shadow-ziditech-600/30"
                        : "text-gray-400 hover:bg-white/5"
                    }`}
                  >
                    <s.icon className={`w-5 h-5 ${activeSection === s.id ? "text-white" : "text-gray-500"}`} />
                    <span className="font-black text-xs uppercase tracking-widest">{s.name}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <div className="bg-white/5 backdrop-blur-xl rounded-[40px] border border-white/10 p-10 min-h-[600px] relative overflow-hidden">
              <div className="absolute -top-20 -right-20 w-56 h-56 bg-ziditech-600/10 rounded-full blur-3xl" />

              <div className="mb-10 relative z-10">
                <h2 className="text-3xl font-black text-white tracking-tight uppercase">
                  {sections.find(s => s.id === activeSection)?.name}
                </h2>
                <div className="h-1.5 w-12 bg-ziditech-600 rounded-full mt-3" />
              </div>

              {/* Profile Section */}
              {activeSection === "profile" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="flex items-center space-x-5">
                    <div className="w-20 h-20 bg-gradient-to-br from-ziditech-500 to-ziditech-700 rounded-2xl flex items-center justify-center shadow-xl shadow-ziditech-600/20 shrink-0">
                      <span className="text-white font-black text-2xl">{authUser?.full_name?.charAt(0) || "U"}</span>
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-white">{authUser?.full_name || "Sultan User"}</h3>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-ziditech-400 bg-ziditech-600/20 px-3 py-1 rounded-lg inline-block mt-1">{authUser?.role || "Operator"}</span>
                      <p className="text-gray-400 mt-1 text-sm">{authUser?.email || "-"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                    {[
                      { label: "Full Name", value: authUser?.full_name },
                      { label: "Email", value: authUser?.email || authUser?.name },
                      { label: "User ID", value: authUser?.name },
                      { label: "Role", value: authUser?.role || "Operator" },
                    ].map(f => (
                      <div key={f.label} className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{f.label}</label>
                        <div className="px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-white font-medium">{f.value || "—"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* User Management */}
              {activeSection === "users" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="flex justify-between items-center bg-white/5 p-5 rounded-2xl border border-white/10">
                    <div>
                      <h3 className="font-black text-white">System Operators</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Manage roles for ERPNext staff accounts</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <button onClick={fetchUsers} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 text-gray-400 transition-all">
                        <RefreshCw size={16} className={loadingUsers ? "animate-spin" : ""} />
                      </button>
                      <button onClick={() => setShowAddUserModal(true)} className="px-5 py-2.5 bg-ziditech-600 text-white rounded-xl font-bold flex items-center space-x-2 hover:bg-ziditech-500 transition-all shadow-lg shadow-ziditech-600/20">
                        <UserPlus size={18} /><span>New User</span>
                      </button>
                    </div>
                  </div>

                  {loadingUsers ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-ziditech-600 border-t-transparent" />
                    </div>
                  ) : (
                    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-white/5">
                            <th className="py-4 px-5 text-[10px] font-black text-gray-500 uppercase tracking-widest text-left">User</th>
                            <th className="py-4 px-5 text-[10px] font-black text-gray-500 uppercase tracking-widest text-left">Role</th>
                            <th className="py-4 px-5 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Toggle Role</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {erpUsers.map(u => (
                            <tr key={u.name} className="hover:bg-white/5 transition-colors">
                              <td className="py-4 px-5">
                                <div className="flex items-center space-x-3">
                                  <div className="w-9 h-9 rounded-xl bg-ziditech-600/20 text-ziditech-400 flex items-center justify-center font-black text-sm shrink-0">
                                    {(u.full_name || u.name).charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="font-bold text-white text-sm">{u.full_name || u.name}</div>
                                    <div className="text-xs text-gray-500">{u.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-5">
                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${roleColors[u.role_profile_name || ""] || "bg-white/5 text-gray-400"}`}>
                                  {u.role_profile_name || "No Role"}
                                </span>
                              </td>
                              <td className="py-4 px-5 text-right">
                                <div className="flex items-center justify-end space-x-2">
                                  <select
                                    value={u.role_profile_name || ""}
                                    onChange={e => handleChangeRole(u, e.target.value)}
                                    className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[11px] font-bold text-gray-300 focus:border-ziditech-500 outline-none appearance-none cursor-pointer hover:bg-white/10 transition-all"
                                    title="Change role"
                                  >
                                    <option value="" className="bg-ziditech-900">— No Role —</option>
                                    <option value="Cashier" className="bg-ziditech-900">Cashier</option>
                                    <option value="Menu User" className="bg-ziditech-900">Menu User</option>
                                    <option value="Administrator" className="bg-ziditech-900">Administrator</option>
                                  </select>
                                  <button
                                    onClick={() => handleChangeRole(u, "")}
                                    className="p-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg transition-all"
                                    title="Remove role"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {erpUsers.length === 0 && !loadingUsers && (
                            <tr><td colSpan={3} className="py-10 text-center text-gray-500 text-sm">No users found</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Warehouses */}
              {activeSection === "warehouses" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="flex justify-between items-center bg-white/5 p-5 rounded-2xl border border-white/10">
                    <div>
                      <h3 className="font-black text-white">Inventory Locations</h3>
                      <p className="text-xs text-gray-400 mt-0.5">ERPNext warehouses linked to Sultan POS</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <button onClick={fetchWarehouses} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 text-gray-400 transition-all">
                        <RefreshCw size={16} className={loadingWarehouses ? "animate-spin" : ""} />
                      </button>
                      <button onClick={() => setShowAddWarehouseModal(true)} className="px-5 py-2.5 bg-ziditech-600 text-white rounded-xl font-bold flex items-center space-x-2 hover:bg-ziditech-500 transition-all shadow-lg shadow-ziditech-600/20">
                        <Plus size={18} /><span>New Warehouse</span>
                      </button>
                    </div>
                  </div>

                  {loadingWarehouses ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-ziditech-600 border-t-transparent" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {warehouses.map(w => (
                        <div key={w.name} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-ziditech-500/40 transition-all group">
                          <div className="flex items-center space-x-4 mb-4">
                            <div className="p-3 bg-ziditech-600/20 text-ziditech-400 rounded-xl group-hover:bg-ziditech-600/30 transition-all">
                              <MapPin size={22} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-black text-white truncate">{w.warehouse_name}</h4>
                              <div className="flex items-center space-x-1.5 mt-0.5">
                                <Package size={12} className="text-gray-500" />
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{w.warehouse_type || "General"}</span>
                              </div>
                            </div>
                            <CheckCircle2 size={18} className="text-ziditech-500 shrink-0" />
                          </div>
                          <div className="border-t border-white/5 pt-3 flex items-center justify-between">
                            <span className="text-xs text-gray-500">{w.city || w.name}</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-ziditech-500">Active</span>
                          </div>
                        </div>
                      ))}
                      {warehouses.length === 0 && !loadingWarehouses && (
                        <div className="col-span-2 py-10 text-center text-gray-500 text-sm">No warehouses found</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-ziditech-950/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-ziditech-900 border border-white/10 rounded-[32px] p-8 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-ziditech-600/20 rounded-2xl flex items-center justify-center mb-6 text-ziditech-400">
              <UserPlus size={28} />
            </div>
            <h3 className="text-2xl font-black text-white mb-1">Register Operator</h3>
            <p className="text-gray-400 text-sm mb-6">Creates a real ERPNext user account.</p>
            <div className="space-y-4">
              {[
                { label: "Full Name", key: "first_name", placeholder: "e.g. Ahmed Ali", type: "text" },
                { label: "Email Address", key: "email", placeholder: "operator@sultan.com", type: "email" },
              ].map(f => (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={(newUser as any)[f.key]}
                    onChange={e => setNewUser(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:border-ziditech-500 outline-none transition-all font-medium"
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Role Profile</label>
                <select
                  value={newUser.role_profile_name}
                  onChange={e => setNewUser(p => ({ ...p, role_profile_name: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-ziditech-500 outline-none transition-all font-bold appearance-none"
                >
                  <option value="Cashier" className="bg-ziditech-900">Cashier</option>
                  <option value="Menu User" className="bg-ziditech-900">Menu User</option>
                  <option value="Administrator" className="bg-ziditech-900">Administrator</option>
                </select>
              </div>
            </div>
            <div className="flex space-x-3 mt-8">
              <button onClick={() => setShowAddUserModal(false)} className="flex-1 py-3 rounded-xl border border-white/10 font-black text-xs uppercase tracking-widest text-gray-400 hover:bg-white/5 transition-all">Cancel</button>
              <button onClick={handleAddUser} className="flex-1 py-3 rounded-xl bg-ziditech-600 text-white font-black text-xs uppercase tracking-widest hover:bg-ziditech-500 shadow-xl shadow-ziditech-600/20 transition-all active:scale-95">Create in ERPNext</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Warehouse Modal */}
      {showAddWarehouseModal && (
        <div className="fixed inset-0 bg-ziditech-950/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-ziditech-900 border border-white/10 rounded-[32px] p-8 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-ziditech-600/20 rounded-2xl flex items-center justify-center mb-6 text-ziditech-400">
              <Home size={28} />
            </div>
            <h3 className="text-2xl font-black text-white mb-1">Deploy Warehouse</h3>
            <p className="text-gray-400 text-sm mb-6">Creates a real ERPNext Warehouse document.</p>
            <div className="space-y-4">
              {[
                { label: "Warehouse Name", key: "warehouse_name", placeholder: "e.g. Main Cold Storage", type: "text" },
                { label: "City / Location", key: "city", placeholder: "e.g. Doha", type: "text" },
              ].map(f => (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={(newWarehouse as any)[f.key]}
                    onChange={e => setNewWarehouse(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:border-ziditech-500 outline-none transition-all font-medium"
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Type</label>
                <select
                  value={newWarehouse.warehouse_type}
                  onChange={e => setNewWarehouse(p => ({ ...p, warehouse_type: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-ziditech-500 outline-none transition-all font-bold appearance-none"
                >
                  {["Retail", "Production", "Cold Storage", "Transit"].map(t => (
                    <option key={t} value={t} className="bg-ziditech-900">{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex space-x-3 mt-8">
              <button onClick={() => setShowAddWarehouseModal(false)} className="flex-1 py-3 rounded-xl border border-white/10 font-black text-xs uppercase tracking-widest text-gray-400 hover:bg-white/5 transition-all">Cancel</button>
              <button onClick={handleAddWarehouse} className="flex-1 py-3 rounded-xl bg-ziditech-600 text-white font-black text-xs uppercase tracking-widest hover:bg-ziditech-500 shadow-xl shadow-ziditech-600/20 transition-all active:scale-95">Deploy to ERPNext</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
