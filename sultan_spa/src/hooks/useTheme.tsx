"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

interface ThemeContextType {
  theme: "light" | "dark"
  setTheme: (theme: "light" | "dark") => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    // Enforce light mode at all times
    setTheme("light")
    document.documentElement.classList.remove("dark")
    localStorage.setItem("theme", "light")
  }, [mounted])

  useEffect(() => {
    if (!mounted) return

    // Keep it light
    document.documentElement.classList.remove("dark")
    localStorage.setItem("theme", "light")
  }, [theme, mounted])

  const toggleTheme = () => {
    // No-op to prevent switching to dark theme
    setTheme("light")
  }

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
