'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface BreadcrumbContextValue {
  segments: Record<string, string | null>
  setSegment: (key: string, label: string | null) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [segments, setSegments] = useState<Record<string, string | null>>({})
  function setSegment(key: string, label: string | null) {
    setSegments(prev => (prev[key] === label ? prev : { ...prev, [key]: label }))
  }
  return <BreadcrumbContext.Provider value={{ segments, setSegment }}>{children}</BreadcrumbContext.Provider>
}

export function useBreadcrumbContext(): BreadcrumbContextValue {
  const ctx = useContext(BreadcrumbContext)
  if (!ctx) {
    throw new Error('useBreadcrumbContext must be used within a BreadcrumbProvider')
  }
  return ctx
}

export function useBreadcrumbSegment(key: string, label: string | null): void {
  const { setSegment } = useBreadcrumbContext()
  useEffect(() => {
    setSegment(key, label)
    return () => setSegment(key, null)
  }, [key, label, setSegment])
}
