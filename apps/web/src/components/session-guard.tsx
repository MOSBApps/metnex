'use client'

import { useEffect, useRef } from 'react'
import { getApiBase } from '../lib/api-base'
import { isImpersonating } from '../lib/impersonation'
import { clearAccessToken, coordinatedRefresh } from '../lib/refresh'

const REFRESH_BEFORE_MS = 2 * 60 * 1000

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('metnex_access_token')
}

function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
    return typeof decoded['exp'] === 'number' ? decoded['exp'] : null
  } catch {
    return null
  }
}

export function SessionGuard() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function scheduleRefresh() {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (isImpersonating()) return
      const token = getAccessToken()
      if (!token) return
      const exp = decodeJwtExp(token)
      if (!exp) return

      const delay = exp * 1000 - Date.now() - REFRESH_BEFORE_MS
      const afterRefresh = (nextToken: string | null) => {
        if (!nextToken) {
          clearAccessToken()
          return
        }
        scheduleRefresh()
      }

      if (delay <= 0) {
        void coordinatedRefresh(getApiBase()).then(afterRefresh)
        return
      }

      timerRef.current = setTimeout(() => {
        void coordinatedRefresh(getApiBase()).then(afterRefresh)
      }, delay)
    }

    scheduleRefresh()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return null
}
