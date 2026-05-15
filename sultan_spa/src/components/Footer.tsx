"use client"

import { useMediaQuery } from "../hooks/useMediaQuery"

export default function Footer() {
  // Hide footer on mobile/tablet screens (same breakpoint as mobile layout)
  const isMobile = useMediaQuery("(max-width: 1024px)")

  // Don't render footer on mobile devices
  if (isMobile) {
    return null
  }

  return (
    <footer className="fixed bottom-0 left-20 right-0 z-50 backdrop-blur-md border-t" style={{ backgroundColor: 'rgba(24,8,85,0.85)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="w-full py-2 flex justify-between items-center px-6">

        <div className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
          Sultan POS <span className="text-ziditech-400 ml-2">Control Center</span>
        </div>

        <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">
          © {new Date().getFullYear()} Powered by{" "}
          <span className="text-ziditech-400">
            Sultan
          </span>
        </div>
      </div>
    </footer>

  )
}
