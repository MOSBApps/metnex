'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTenantPermissions } from '@/contexts/tenant-permission-context'
import { tenantApiGet } from '@/lib/api'
import { getActiveTenantId, TENANT_CHANGE_EVENT } from '@/lib/tenant-context'

const POLL_INTERVAL_MS = 30_000

export function GlassNotificationBell() {
  const { can, loading: permissionsLoading } = useTenantPermissions()
  const [unreadCount, setUnreadCount] = useState(0)
  const canView = can('NOTIFICATION:VIEW') || can('*')

  useEffect(() => {
    if (permissionsLoading || !canView) return
    let cancelled = false

    async function loadUnreadCount() {
      if (!getActiveTenantId()) return
      try {
        const result = await tenantApiGet<{ total: number }>('/api/v1/notifications?unreadOnly=true&limit=1')
        if (!cancelled && typeof result?.total === 'number') setUnreadCount(result.total)
      } catch {
        // Silently swallow background notification polling errors
      }
    }

    void loadUnreadCount()
    const interval = window.setInterval(loadUnreadCount, POLL_INTERVAL_MS)
    window.addEventListener(TENANT_CHANGE_EVENT, loadUnreadCount)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener(TENANT_CHANGE_EVENT, loadUnreadCount)
    }
  }, [permissionsLoading, canView])

  if (permissionsLoading || !canView) return null

  const badge = unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : null

  return (
    <Link
      href="/app/notifications"
      aria-label={badge ? `Bildirimler, ${badge} okunmamış` : 'Bildirimler'}
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-glass-border-default bg-glass-elevated text-glass-text-secondary shadow-glass transition-colors duration-150 ease-in-out hover:bg-glass-subtle hover:text-glass-text-primary focus-visible:outline-none focus-visible:shadow-glass-focus"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
        <path
          d="M10 2a5 5 0 00-5 5v2.4c0 .5-.15 1-.44 1.4L3.3 12.9c-.5.7 0 1.6.8 1.6h11.8c.8 0 1.3-.9.8-1.6l-1.26-2.1a2.5 2.5 0 01-.44-1.4V7a5 5 0 00-5-5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8 16.5a2 2 0 004 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      {badge ? (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-glass-status-danger px-1 text-[9px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  )
}
