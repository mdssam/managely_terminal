import { useState } from "react"
import { useAuth } from "../hooks/useAuth"
import { useNavigate } from "react-router-dom"
import { useI18n } from "../hooks/useI18n"
import { useTheme } from "../hooks/useTheme"
import {
  ArrowLeft,
  User,
  Globe,
  Palette,
  CreditCard,
  Shield,
  Database,
  Info,
  Moon,
  Sun,
  Monitor,
  Bell,
  Wifi,
  Download,
  Upload,
  LogOut,
  ChevronRight,
  Fingerprint,
  Cpu,
  Key,
  HardDrive,
  Zap,
  Activity
} from "lucide-react"

export default function SettingsPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { language, setLanguage, isRTL } = useI18n()
  const { theme, setTheme } = useTheme()
  const [activeSection, setActiveSection] = useState("profile")

  const handleLogout = async () => {
    try {
      await logout()
      navigate("/login")
    } catch (error) {
      console.error('Logout error:', error)
      navigate("/login")
    }
  }

  const settingsSections = [
    { id: "profile", name: "User Identity", icon: User, desc: "Entity registry & auth levels" },
    { id: "display", name: "Aesthetics", icon: Palette, desc: "Visual protocols & UI themes" },
    { id: "system", name: "Core Engine", icon: Globe, desc: "Global regional parameters" },
    { id: "pos", name: "Terminal Logic", icon: CreditCard, desc: "Settlement & receipt flows" },
    { id: "notifications", name: "Telemetry", icon: Bell, desc: "System alerts & logging" },
    { id: "security", name: "Vault Access", icon: Shield, desc: "Encryption & key management" },
    { id: "backup", name: "Persistence", icon: Database, desc: "Data archives & cloud sync" },
    { id: "about", name: "System Info", icon: Info, desc: "Kernel version & build logs" },
  ]

  const SectionHeader = ({ title, icon: Icon }: { title: string, icon: any }) => (
    <div className="flex items-center gap-4 mb-10">
       <div className="p-3 bg-ziditech-600/10 rounded-2xl border border-ziditech-500/20 text-gray-500">
         <Icon size={24} />
       </div>
       <div>
         <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">{title}</h2>
         <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Status: Node Optimized</p>
       </div>
    </div>
  )

  const SettingRow = ({ label, value, type = "text" }: { label: string, value: string, type?: string }) => (
    <div className="space-y-3">
      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">{label}</label>
      <input
        type={type}
        defaultValue={value}
        className="w-full px-6 py-5 bg-muted/30 border border-border rounded-2xl focus:ring-4 focus:ring-ziditech-500/10 focus:border-ziditech-500 outline-none transition-all font-bold text-foreground placeholder:text-muted-foreground/20 shadow-inner"
      />
    </div>
  )

  const ToggleRow = ({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) => (
    <button 
      onClick={onClick}
      className="w-full flex items-center justify-between p-6 bg-muted/20 border border-border rounded-2xl hover:bg-muted/40 transition-all group"
    >
      <span className="text-[10px] font-black text-foreground uppercase tracking-widest">{label}</span>
      <div className={`w-14 h-8 rounded-full transition-all relative ${active ? 'bg-ziditech-600 shadow-[0_0_20px_rgba(110,61,255,0.4)]' : 'bg-muted border border-border'}`}>
        <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all shadow-lg ${active ? 'left-7' : 'left-1'}`}></div>
      </div>
    </button>
  )

  const renderProfileSettings = () => (
    <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="relative overflow-hidden bg-gradient-to-br from-ziditech-600 to-ziditech-800 p-10 rounded-[3rem] text-white shadow-2xl shadow-ziditech-600/20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <div className="relative group">
             <div className="absolute inset-0 bg-white/20 rounded-3xl blur-xl group-hover:scale-110 transition-transform"></div>
             <div className="w-28 h-28 bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl flex items-center justify-center text-4xl font-black shadow-2xl group-hover:rotate-6 transition-all duration-500">
               NS
             </div>
             <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-ziditech-500 border-4 border-ziditech-700 rounded-full flex items-center justify-center shadow-lg">
                <Activity size={16} className="text-white animate-pulse" />
             </div>
          </div>
          <div className="text-center md:text-left">
            <h3 className="text-4xl font-black tracking-tighter uppercase leading-none">Nick Szabo</h3>
            <p className="text-ziditech-100 text-[10px] font-black uppercase tracking-[0.4em] mt-4 opacity-70">Terminal Architect • Authority Level 4</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-6">
               <span className="px-4 py-1.5 bg-white/10 rounded-full text-[8px] font-black uppercase tracking-widest border border-white/10">ID: SZ-892-SYS</span>
               <span className="px-4 py-1.5 bg-ziditech-400/20 text-gray-500 rounded-full text-[8px] font-black uppercase tracking-widest border border-ziditech-400/20">Node_Active</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <SettingRow label="Legal Identity" value="Nick Szabo" />
        <SettingRow label="Access Protocol" value="nick.szabo@ziditech.com" type="email" />
        <SettingRow label="Direct Telemetry" value="+1 (555) 123-4567" type="tel" />
        <div className="space-y-3">
          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Registry Role</label>
          <div className="relative group">
            <select className="w-full px-6 py-5 bg-muted/30 border border-border rounded-2xl focus:ring-4 focus:ring-ziditech-500/10 focus:border-ziditech-500 outline-none transition-all font-bold text-foreground appearance-none shadow-inner uppercase tracking-widest text-[10px]">
              <option>Store Manager</option>
              <option>Cashier Node</option>
              <option>System Administrator</option>
            </select>
            <ChevronRight size={16} className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground rotate-90" />
          </div>
        </div>
      </div>
    </div>
  )

  const renderDisplaySettings = () => (
    <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="space-y-6">
        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] ml-1">Visual Protocol</label>
        <div className="grid grid-cols-3 gap-6">
          {[
            { id: 'light', name: 'Photon', icon: Sun, desc: 'High Intensity' },
            { id: 'dark', name: 'Shadow', icon: Moon, desc: 'Deep Contrast' },
            { id: 'system', name: 'Auto', icon: Monitor, desc: 'OS Override' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id as any)}
              className={`p-8 rounded-[2rem] border-2 transition-all group relative overflow-hidden ${
                theme === t.id
                  ? "border-ziditech-600 bg-ziditech-600/5 shadow-2xl"
                  : "border-border bg-muted/20 hover:border-ziditech-500/30"
              }`}
            >
              {theme === t.id && (
                 <div className="absolute top-4 right-4 w-2 h-2 bg-ziditech-500 rounded-full animate-ping"></div>
              )}
              <t.icon className={`w-10 h-10 mx-auto mb-4 transition-all duration-500 ${theme === t.id ? 'text-gray-500 scale-125' : 'text-muted-foreground group-hover:scale-110'}`} />
              <div className="text-[10px] font-black text-foreground uppercase tracking-widest">{t.name}</div>
              <div className="text-[8px] font-bold text-muted-foreground uppercase mt-1 tracking-tighter opacity-50">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-3">
          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Interface Language</label>
          <div className="relative group">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-6 py-5 bg-muted/30 border border-border rounded-2xl focus:ring-4 focus:ring-ziditech-500/10 focus:border-ziditech-500 outline-none transition-all font-bold text-foreground appearance-none shadow-inner uppercase tracking-widest text-[10px]"
            >
              <option value="en">English [Global]</option>
              <option value="ar">العربية [MENA]</option>
            </select>
            <ChevronRight size={16} className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground rotate-90" />
          </div>
        </div>
        <div className="space-y-3">
          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Currency Symbol</label>
          <div className="relative group">
            <select className="w-full px-6 py-5 bg-muted/30 border border-border rounded-2xl focus:ring-4 focus:ring-ziditech-500/10 focus:border-ziditech-500 outline-none transition-all font-bold text-foreground appearance-none shadow-inner uppercase tracking-widest text-[10px]">
              <option>SAR [Saudi Riyal]</option>
              <option>USD [US Dollar]</option>
              <option>EUR [Euro]</option>
            </select>
            <ChevronRight size={16} className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground rotate-90" />
          </div>
        </div>
      </div>
    </div>
  )

  const renderPOSSettings = () => (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="grid grid-cols-1 gap-4">
        <ToggleRow label="Auto-Deploy Physical Receipts" active={true} onClick={() => {}} />
        <ToggleRow label="Inject Visual Assets into Output" active={false} onClick={() => {}} />
        <ToggleRow label="Enable Biometric Verification" active={true} onClick={() => {}} />
      </div>

      <div className="space-y-6">
        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] ml-1">Active Settlement Rails</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {["Cash_Vault", "Visa_Network", "Mastercard_Link", "Mada_MENA", "Digital_Wallet"].map((method) => (
            <div
              key={method}
              className="flex items-center justify-between p-6 bg-muted/20 border border-border rounded-2xl group hover:border-ziditech-500/30 transition-all"
            >
              <div className="flex items-center gap-4">
                 <div className="p-2 bg-ziditech-600/10 rounded-lg text-gray-500 group-hover:scale-110 transition-transform">
                   <Zap size={14} />
                 </div>
                 <span className="text-[10px] font-black text-foreground uppercase tracking-widest">{method}</span>
              </div>
              <div className="w-2 h-2 bg-ziditech-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.6)]"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const renderAboutSettings = () => (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="bg-muted/30 border border-border rounded-[3rem] p-12 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-ziditech-600 to-transparent"></div>
        <img src="/assets/sultan/sultan_spa/managelyLogo.webp" alt="Managely" className="w-24 h-24 mx-auto mb-8 rounded-[2rem] object-cover shadow-2xl border-2 border-border" />
        <h3 className="text-4xl font-black text-foreground uppercase tracking-tighter">Managely_X</h3>
        <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.5em] mt-4">Kernel Version 2.4.0-Stable</p>
        <div className="flex justify-center gap-4 mt-8">
           <div className="px-4 py-2 bg-muted/50 rounded-xl border border-border text-[8px] font-black uppercase tracking-widest">Build_Hash: 8f2a1c</div>
           <div className="px-4 py-2 bg-muted/50 rounded-xl border border-border text-[8px] font-black uppercase tracking-widest text-gray-500">Node_Synced</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          { label: "Hardware Protocol", value: "Cloud_Edge_v4", icon: Cpu },
          { label: "Storage Load", value: "2.4 GB / 10 GB", icon: HardDrive },
          { label: "Network Latency", value: "14ms [Optimal]", icon: Wifi },
          { label: "Encryption Grade", value: "AES-512_Quantum", icon: Shield },
        ].map((stat, idx) => (
          <div key={idx} className="p-6 bg-muted/20 border border-border rounded-2xl flex items-center gap-5">
            <div className="p-3 bg-muted rounded-xl text-gray-500 border border-border"><stat.icon size={18} /></div>
            <div>
               <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">{stat.label}</p>
               <p className="text-[10px] font-black text-foreground uppercase tracking-tight mt-1">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const renderContent = () => {
    switch (activeSection) {
      case "profile": return renderProfileSettings()
      case "display": return renderDisplaySettings()
      case "pos": return renderPOSSettings()
      case "about": return renderAboutSettings()
      default: return (
        <div className="py-20 text-center space-y-6">
           <div className="w-20 h-20 bg-muted/50 rounded-3xl mx-auto flex items-center justify-center border border-border shadow-inner">
             <Cpu size={32} className="text-muted-foreground/30 animate-pulse" />
           </div>
           <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em]">Protocol Expansion in Progress...</p>
        </div>
      )
    }
  }

  return (
    <div className={`min-h-screen bg-[#0a0a0c] font-inconsolata text-foreground selection:bg-ziditech-600/30 ${isRTL ? "rtl" : "ltr"} relative overflow-hidden`}>
      {/* Dynamic Background */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_20%,rgba(110,61,255,0.03)_0%,transparent_50%)] pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_80%_80%,rgba(110,61,255,0.02)_0%,transparent_50%)] pointer-events-none"></div>

      {/* Header */}
      <div className="bg-[#111115]/80 backdrop-blur-3xl border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-8 py-8 sm:py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-8">
              <button
                onClick={() => navigate(-1)}
                className="w-16 h-16 bg-[#1a1a20] hover:bg-ziditech-600 hover:text-white rounded-[1.5rem] transition-all shadow-2xl border border-white/5 flex items-center justify-center active:scale-90 group"
              >
                <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
              </button>
              <div>
                 <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Control Center</h1>
                 <div className="flex items-center gap-3 mt-3">
                    <div className="w-2 h-2 bg-ziditech-500 rounded-full animate-pulse"></div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em]">System Orchestration • Build 8F2A1C</p>
                 </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full sm:w-auto flex items-center justify-center space-x-4 px-8 py-5 bg-red-600/5 text-red-400 hover:bg-red-600 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border border-red-600/20 active:scale-95 shadow-xl shadow-red-900/10 group"
            >
              <LogOut className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              <span>Terminate Session</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 lg:gap-20">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-[#111115]/50 backdrop-blur-2xl rounded-[3rem] shadow-2xl border border-white/5 p-8 sticky top-40">
              <div className="mb-10 px-4">
                 <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">Master Nodes</p>
              </div>
              <nav className="space-y-4">
                {settingsSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-5 px-6 py-5 rounded-2xl text-left transition-all duration-500 relative group overflow-hidden ${
                      activeSection === section.id
                        ? "bg-ziditech-600 text-white shadow-[0_20px_40px_-10px_rgba(110,61,255,0.4)] scale-105 z-10"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    }`}
                  >
                    <section.icon size={22} className={`transition-all duration-700 ${activeSection === section.id ? 'scale-110 rotate-3' : 'group-hover:scale-110'}`} />
                    <div className="flex-1 min-w-0">
                       <span className="block text-[10px] font-black uppercase tracking-widest truncate">{section.name}</span>
                       <span className={`block text-[7px] font-bold uppercase tracking-widest mt-1 opacity-40 group-hover:opacity-60 transition-opacity truncate`}>{section.desc}</span>
                    </div>
                    {activeSection === section.id && (
                       <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-white/20 rounded-l-full"></div>
                    )}
                  </button>
                ))}
              </nav>

              <div className="mt-12 pt-10 border-t border-white/5 px-4">
                 <div className="flex items-center gap-3">
                    <Fingerprint size={16} className="text-gray-900" />
                    <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Biometric_Lock: ACTIVE</span>
                 </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <div className="bg-[#111115]/50 backdrop-blur-2xl rounded-[4rem] shadow-2xl border border-white/5 p-12 lg:p-20 relative overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-1000">
              <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-ziditech-600/5 rounded-full -mr-[20rem] -mt-[20rem] blur-[150px] pointer-events-none"></div>
              
              <div className="relative z-10">
                <SectionHeader 
                   title={settingsSections.find((s) => s.id === activeSection)?.name || ""} 
                   icon={settingsSections.find((s) => s.id === activeSection)?.icon || Info} 
                />
                {renderContent()}
              </div>

              {/* Save Button */}
              <div className="mt-24 pt-16 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-10">
                <div className="flex items-center gap-4 text-muted-foreground/30">
                   <Key size={16} />
                   <p className="text-[10px] font-bold uppercase tracking-[0.2em] max-w-[200px] leading-relaxed">
                     Administrative override required for parametric commits
                   </p>
                </div>
                <div className="flex items-center gap-6 w-full sm:w-auto">
                  <button className="flex-1 sm:flex-none px-10 py-5 bg-white/5 hover:bg-white/10 text-foreground rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10 active:scale-95">
                    Discard
                  </button>
                  <button className="flex-1 sm:flex-none px-14 py-5 bg-ziditech-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-[0_20px_40px_-10px_rgba(110,61,255,0.4)] hover:bg-ziditech-500 active:scale-95 group relative overflow-hidden">
                    <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                    <span className="relative z-10">Commit Changes</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
