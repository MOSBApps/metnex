'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useTenantPermissions } from '@/contexts/tenant-permission-context'
import { logout } from '@/lib/auth'

export function GlassUserMenu() {
  const { can } = useTenantPermissions()
  const canViewOrgAdmin = can('CUSTOMER:ADMIN:VIEW')
  const canViewSmtp = can('SETTINGS:SMTP:VIEW')
  const canViewAiProvider = can('SETTINGS:AI_PROVIDER:VIEW')
  const hasAnySystemSettingsAccess = canViewOrgAdmin || canViewSmtp || canViewAiProvider

  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current?.contains(event.target as Node)) return
      if (triggerRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    await logout()
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Kullanıcı menüsü"
        onClick={() => setOpen(prev => !prev)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-glass-border-default bg-glass-elevated text-glass-text-secondary shadow-glass transition-colors duration-150 ease-in-out hover:bg-glass-subtle hover:text-glass-text-primary focus-visible:outline-none focus-visible:shadow-glass-focus"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
          <path
            d="M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 7a6 6 0 0 1 12 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Kullanıcı menüsü"
          className="absolute right-0 top-full z-30 mt-1 min-w-[200px] rounded-lg border border-glass-border-default bg-glass-elevated p-2 shadow-glass backdrop-blur-glass"
        >
          {hasAnySystemSettingsAccess ? (
            <div role="group" aria-label="Sistem Ayarları">
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-glass-text-muted">Sistem Ayarları</p>
              {canViewOrgAdmin ? (
                <Link
                  href="/app/admin"
                  role="menuitem"
                  className="block rounded-md px-3 py-2 text-[13px] text-glass-text-secondary transition-colors duration-150 ease-in-out hover:bg-glass-subtle hover:text-glass-text-primary"
                >
                  Organizasyon Yönetimi
                </Link>
              ) : null}
              {canViewSmtp ? (
                <Link
                  href="/app/settings/smtp"
                  role="menuitem"
                  className="block rounded-md px-3 py-2 text-[13px] text-glass-text-secondary transition-colors duration-150 ease-in-out hover:bg-glass-subtle hover:text-glass-text-primary"
                >
                  SMTP
                </Link>
              ) : null}
              {canViewAiProvider ? (
                <Link
                  href="/app/settings/ai-provider"
                  role="menuitem"
                  className="block rounded-md px-3 py-2 text-[13px] text-glass-text-secondary transition-colors duration-150 ease-in-out hover:bg-glass-subtle hover:text-glass-text-primary"
                >
                  AI Provider
                </Link>
              ) : null}
              <div className="my-1 border-t border-glass-border-subtle" />
            </div>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="block w-full rounded-md px-3 py-2 text-left text-[13px] text-glass-text-secondary transition-colors duration-150 ease-in-out hover:bg-glass-subtle hover:text-glass-text-primary disabled:opacity-glass-disabled"
          >
            {loggingOut ? 'Çıkılıyor...' : 'Çıkış Yap'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
