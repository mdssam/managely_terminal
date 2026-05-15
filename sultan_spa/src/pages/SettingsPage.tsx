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
    <div className={`min-h-screen ${isRTL ? "rtl" : "ltr"} pb-24 lg:pb-0 lg:pl-20`} style={{ backgroundColor: '#eef1f8' }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate(-1)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all active:scale-90">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Settings</h1>
              <p className="text-xs text-gray-500">Sultan POS Management</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center space-x-2 px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl font-semibold text-sm border border-red-100 transition-all active:scale-95">
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sticky top-24">
              <nav className="space-y-1">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-left transition-all duration-150 ${
                      activeSection === s.id
                        ? "text-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                    style={activeSection === s.id ? { backgroundColor: '#1e2d6b' } : {}}
                  >
                    <s.icon className={`w-4 h-4 ${activeSection === s.id ? "text-white" : "text-gray-400"}`} />
                    <span className="font-semibold text-sm">{s.name}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 min-h-[500px]">
              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900">
                  {sections.find(s => s.id === activeSection)?.name}
                </h2>
                <div className="h-1 w-10 rounded-full mt-2" style={{ backgroundColor: '#1e2d6b' }} />
              </div>

              {/* Profile Section */}
              {activeSection === "profile" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#1e2d6b' }}>
                      <span className="text-white font-bold text-xl">{authUser?.full_name?.charAt(0) || "U"}</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{authUser?.full_name || "Sultan User"}</h3>
                      <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg inline-block mt-1">{authUser?.role || "Operator"}</span>
                      <p className="text-sm text-gray-500 mt-1">{authUser?.email || "-"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {[
                      { label: "Full Name", value: authUser?.full_name },
                      { label: "Email", value: authUser?.email || authUser?.name },
                      { label: "User ID", value: authUser?.name },
                      { label: "Role", value: authUser?.role || "Operator" },
                    ].map(f => (
                      <div key={f.label}>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">{f.label}</label>
                        <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 font-medium">{f.value || "—"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* User Management */}
              {activeSection === "users" && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">System Operators</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Manage roles for ERPNext staff accounts</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button onClick={fetchUsers} className="p-2 bg-white hover:bg-gray-100 rounded-xl border border-gray-200 text-gray-500 transition-all">
                        <RefreshCw size={15} className={loadingUsers ? "animate-spin" : ""} />
                      </button>
                      <button onClick={() => setShowAddUserModal(true)} className="px-4 py-2 text-white rounded-xl font-semibold text-sm flex items-center space-x-2 transition-all shadow-sm" style={{ backgroundColor: '#1e2d6b' }}>
                        <UserPlus size={15} /><span>New User</span>
                      </button>
                    </div>
                  </div>

                  {loadingUsers ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="animate-spin rounded-full h-7 w-7 border-2 border-t-transparent" style={{ borderColor: '#1e2d6b', borderTopColor: 'transparent' }} />
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-left">User</th>
                            <th className="py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-left">Role</th>
                            <th className="py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {erpUsers.map(u => (
                            <tr key={u.name} className="hover:bg-gray-50 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-sm shrink-0 text-white" style={{ backgroundColor: '#1e2d6b' }}>
                                    {(u.full_name || u.name).charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="font-medium text-gray-900 text-sm">{u.full_name || u.name}</div>
                                    <div className="text-xs text-gray-400">{u.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${roleColors[u.role_profile_name || ""] || "bg-gray-100 text-gray-500"}`}>
                                  {u.role_profile_name || "No Role"}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end space-x-2">
                                  <select
                                    value={u.role_profile_name || ""}
                                    onChange={e => handleChangeRole(u, e.target.value)}
                                    className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[12px] font-medium text-gray-700 focus:border-[#1e2d6b] outline-none appearance-none cursor-pointer hover:bg-gray-100 transition-all"
                                    title="Change role"
                                  >
                                    <option value="">— No Role —</option>
                                    <option value="Cashier">Cashier</option>
                                    <option value="Menu User">Menu User</option>
                                    <option value="Administrator">Administrator</option>
                                  </select>
                                  <button
                                    onClick={() => handleChangeRole(u, "")}
                                    className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-500 rounded-lg transition-all"
                                    title="Remove role"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {erpUsers.length === 0 && !loadingUsers && (
                            <tr><td colSpan={3} className="py-10 text-center text-gray-400 text-sm">No users found</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Warehouses */}
              {activeSection === "warehouses" && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">Inventory Locations</h3>
                      <p className="text-xs text-gray-500 mt-0.5">ERPNext warehouses linked to Sultan POS</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button onClick={fetchWarehouses} className="p-2 bg-white hover:bg-gray-100 rounded-xl border border-gray-200 text-gray-500 transition-all">
                        <RefreshCw size={15} className={loadingWarehouses ? "animate-spin" : ""} />
                      </button>
                      <button onClick={() => setShowAddWarehouseModal(true)} className="px-4 py-2 text-white rounded-xl font-semibold text-sm flex items-center space-x-2 transition-all shadow-sm" style={{ backgroundColor: '#1e2d6b' }}>
                        <Plus size={15} /><span>New Warehouse</span>
                      </button>
                    </div>
                  </div>

                  {loadingWarehouses ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="animate-spin rounded-full h-7 w-7 border-2 border-t-transparent" style={{ borderColor: '#1e2d6b', borderTopColor: 'transparent' }} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {warehouses.map(w => (
                        <div key={w.name} className="bg-gray-50 border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-all">
                          <div className="flex items-center space-x-3 mb-3">
                            <div className="p-2.5 rounded-xl" style={{ backgroundColor: '#eef1f8' }}>
                              <MapPin size={18} style={{ color: '#1e2d6b' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-gray-900 text-sm truncate">{w.warehouse_name}</h4>
                              <div className="flex items-center space-x-1 mt-0.5">
                                <Package size={11} className="text-gray-400" />
                                <span className="text-[11px] text-gray-400">{w.warehouse_type || "General"}</span>
                              </div>
                            </div>
                            <CheckCircle2 size={16} style={{ color: '#1e2d6b' }} className="shrink-0" />
                          </div>
                          <div className="border-t border-gray-200 pt-2.5 flex items-center justify-between">
                            <span className="text-xs text-gray-400">{w.city || w.name}</span>
                            <span className="text-[11px] font-semibold text-green-600">Active</span>
                          </div>
                        </div>
                      ))}
                      {warehouses.length === 0 && !loadingWarehouses && (
                        <div className="col-span-2 py-10 text-center text-gray-400 text-sm">No warehouses found</div>
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-7 w-full max-w-md shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5" style={{ backgroundColor: '#eef1f8' }}>
              <UserPlus size={22} style={{ color: '#1e2d6b' }} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-0.5">Register Operator</h3>
            <p className="text-sm text-gray-500 mb-5">Creates a real ERPNext user account.</p>
            <div className="space-y-4">
              {[
                { label: "Full Name", key: "first_name", placeholder: "e.g. Ahmed Ali", type: "text" },
                { label: "Email Address", key: "email", placeholder: "operator@sultan.com", type: "email" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={(newUser as any)[f.key]}
                    onChange={e => setNewUser(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:border-[#1e2d6b] outline-none transition-all"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Role Profile</label>
                <select
                  value={newUser.role_profile_name}
                  onChange={e => setNewUser(p => ({ ...p, role_profile_name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:border-[#1e2d6b] outline-none transition-all"
                >
                  <option value="Cashier">Cashier</option>
                  <option value="Menu User">Menu User</option>
                  <option value="Administrator">Administrator</option>
                </select>
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <button onClick={() => setShowAddUserModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all">Cancel</button>
              <button onClick={handleAddUser} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all active:scale-95" style={{ backgroundColor: '#1e2d6b' }}>Create in ERPNext</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Warehouse Modal */}
      {showAddWarehouseModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-7 w-full max-w-md shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5" style={{ backgroundColor: '#eef1f8' }}>
              <Home size={22} style={{ color: '#1e2d6b' }} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-0.5">Add Warehouse</h3>
            <p className="text-sm text-gray-500 mb-5">Creates a real ERPNext Warehouse document.</p>
            <div className="space-y-4">
              {[
                { label: "Warehouse Name", key: "warehouse_name", placeholder: "e.g. Main Cold Storage", type: "text" },
                { label: "City / Location", key: "city", placeholder: "e.g. Doha", type: "text" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={(newWarehouse as any)[f.key]}
                    onChange={e => setNewWarehouse(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:border-[#1e2d6b] outline-none transition-all"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Type</label>
                <select
                  value={newWarehouse.warehouse_type}
                  onChange={e => setNewWarehouse(p => ({ ...p, warehouse_type: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:border-[#1e2d6b] outline-none transition-all"
                >
                  {["Retail", "Production", "Cold Storage", "Transit"].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <button onClick={() => setShowAddWarehouseModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all">Cancel</button>
              <button onClick={handleAddWarehouse} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all active:scale-95" style={{ backgroundColor: '#1e2d6b' }}>Deploy to ERPNext</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
