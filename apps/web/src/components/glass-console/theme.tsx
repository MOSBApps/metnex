'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type GlassConsoleTheme = 'dark' | 'light'

const STORAGE_KEY = 'ais-glass-console-theme'

interface GlassThemeContextValue {
  theme: GlassConsoleTheme
  setTheme: (theme: GlassConsoleTheme) => void
  toggleTheme: () => void
}

const GlassThemeContext = createContext<GlassThemeContextValue | null>(null)

function readStoredTheme(): GlassConsoleTheme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'dark' || stored === 'light' ? stored : null
  } catch {
    return null
  }
}

function detectReducedPerf(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { deviceMemory?: number }
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return true
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2) return true
  return false
}

export function GlassConsoleRoot({
  children,
  defaultTheme = 'dark',
  className = '',
}: {
  children: ReactNode
  defaultTheme?: GlassConsoleTheme
  className?: string
}) {
  const [theme, setThemeState] = useState<GlassConsoleTheme>(defaultTheme)
  const [reducedPerf, setReducedPerf] = useState(false)

  useEffect(() => {
    setThemeState(readStoredTheme() ?? defaultTheme)
    setReducedPerf(detectReducedPerf())
  }, [defaultTheme])

  const setTheme = useCallback((next: GlassConsoleTheme) => {
    setThemeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // localStorage unavailable (private mode / blocked)
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme])

  return (
    <GlassThemeContext.Provider value={value}>
      <div
        className={`glass-console min-h-screen ${theme === 'dark' ? 'dark' : ''} ${className}`}
        data-theme={theme}
        data-perf={reducedPerf ? 'reduced' : undefined}
      >
        {children}
      </div>
    </GlassThemeContext.Provider>
  )
}

export function useGlassTheme(): GlassThemeContextValue {
  const ctx = useContext(GlassThemeContext)
  if (!ctx) {
    throw new Error('useGlassTheme must be used within a GlassConsoleRoot')
  }
  return ctx
}
