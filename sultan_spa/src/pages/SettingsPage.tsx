import { useState, useEffect } from "react"
import { useAuth } from "../hooks/useAuth"
import { useNavigate, useLocation } from "react-router-dom"
import { useI18n } from "../hooks/useI18n"
import { ArrowLeft, User, LogOut, KeyRound, Loader2 } from "lucide-react"
import { setPosPin } from "../services/pinAuth"
import { toast } from "react-toastify"

export default function SettingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, user: authUser } = useAuth()
  const { isRTL } = useI18n()
  const [activeSection, setActiveSection] = useState("profile")
  const [newPin, setNewPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [pinLoading, setPinLoading] = useState(false)

  // Handle ?tab= param
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tab = params.get("tab")
    if (tab && ["profile", "pin"].includes(tab)) {
      setActiveSection(tab)
    }
  }, [location])

  const handleLogout = async () => {
    try { await logout() } catch (e) { console.error(e) }
    navigate("/login")
  }

  const sections = [
    { id: "profile", name: "My Profile", icon: User },
    { id: "pin", name: "Cashier PIN", icon: KeyRound },
  ]

  const handleSetPin = async () => {
    if (!/^\d{4,8}$/.test(newPin)) { toast.error("PIN must be 4–8 digits."); return }
    if (newPin !== confirmPin) { toast.error("PINs do not match."); return }
    setPinLoading(true)
    try {
      const res = await setPosPin(newPin)
      if (res.success) { toast.success("PIN updated successfully"); setNewPin(""); setConfirmPin("") }
      else toast.error(res.error || "Failed to set PIN")
    } catch { toast.error("Connection error") }
    finally { setPinLoading(false) }
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

              {/* PIN Section */}
              {activeSection === "pin" && (
                <div className="space-y-6 animate-in fade-in duration-300 max-w-md">
                  <p className="text-sm text-gray-600">
                    Set a 4–8 digit PIN that will be required each time you open a new POS session.
                    If no PIN is set, sessions can be opened without verification.
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">New PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={newPin}
                      onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="4–8 digits"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-ziditech-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Confirm PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={confirmPin}
                      onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="Re-enter PIN"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-ziditech-500"
                    />
                  </div>
                  <button
                    onClick={handleSetPin}
                    disabled={pinLoading || !newPin || !confirmPin}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all disabled:bg-gray-300 disabled:cursor-not-allowed"
                    style={{ backgroundColor: '#1e2d6b' }}
                  >
                    {pinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    {pinLoading ? "Saving..." : "Set PIN"}
                  </button>
                </div>
              )}

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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
