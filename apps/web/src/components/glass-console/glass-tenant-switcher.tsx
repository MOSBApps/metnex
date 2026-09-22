'use client'

import { useEffect, useRef, useState } from 'react'
import { getActiveTenantId, getActiveTenantName, TENANT_CHANGE_EVENT } from '@/lib/tenant-context'
import { loadAccessibleTenants, switchActiveTenant, type AccessibleTenant } from '@/lib/tenant-switch'

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`h-3 w-3 shrink-0 text-glass-text-muted transition-transform duration-150 ease-in-out ${open ? 'rotate-180' : ''}`}
    >
      <path d="M5 7l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function GlassTenantSwitcher() {
  const [open, setOpen] = useState(false)
  const [tenants, setTenants] = useState<AccessibleTenant[]>([])
  const [tenantsLoading, setTenantsLoading] = useState(true)
  const [activeTenantId, setActiveTenantId] = useState<string>(() => getActiveTenantId() ?? '')
  const [tenantName, setTenantName] = useState<string | null>(() => getActiveTenantName())
  const [switchingTenantId, setSwitchingTenantId] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function syncTenant() {
      setActiveTenantId(getActiveTenantId() ?? '')
      setTenantName(getActiveTenantName())
      setSwitchError(null)
    }
    window.addEventListener(TENANT_CHANGE_EVENT, syncTenant)
    return () => window.removeEventListener(TENANT_CHANGE_EVENT, syncTenant)
  }, [])

  useEffect(() => {
    if (!open || tenants.length > 0) return
    let cancelled = false
    setTenantsLoading(true)
    void loadAccessibleTenants()
      .then(rows => {
        if (!cancelled) setTenants(rows)
      })
      .catch(() => {
        if (!cancelled) setSwitchError('Tenant listesi yüklenemedi.')
      })
      .finally(() => {
        if (!cancelled) setTenantsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, tenants.length])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
        if (!items || items.length === 0) return
        const currentIndex = Array.from(items).findIndex(item => item === document.activeElement)
        const delta = event.key === 'ArrowDown' ? 1 : -1
        const nextIndex = (currentIndex + delta + items.length) % items.length
        items[nextIndex]?.focus()
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

  async function handleSelect(tenant: AccessibleTenant) {
    if (tenant.id === activeTenantId || switchingTenantId) return
    setSwitchingTenantId(tenant.id)
    setSwitchError(null)
    try {
      await switchActiveTenant(tenant.id)
      const targetPath = tenant.type === 'PLATFORM_ROOT' ? '/system' : '/app'
      window.location.href = targetPath
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : 'Tenant değiştirilemedi.')
      setSwitchingTenantId(null)
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(prev => !prev)}
        className="flex min-w-0 items-center gap-1.5 rounded-md border border-glass-border-default bg-glass-elevated px-2.5 py-1.5 text-[12.5px] font-medium text-glass-text-primary shadow-glass transition-colors duration-150 ease-in-out hover:bg-glass-subtle focus-visible:outline-none focus-visible:shadow-glass-focus"
      >
        <span className="max-w-[4.5rem] truncate sm:max-w-[8rem] md:max-w-[12rem]">{tenantName ?? '—'}</span>
        <ChevronDown open={open} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Tenant değiştir"
          className="absolute right-0 top-full z-30 mt-1 max-h-80 min-w-[220px] overflow-y-auto rounded-lg border border-glass-border-default bg-glass-elevated py-1 shadow-glass backdrop-blur-glass"
        >
          {tenantsLoading ? (
            <p className="px-3 py-2 text-[12px] text-glass-text-muted">Tenantlar yükleniyor...</p>
          ) : tenants.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-glass-text-muted">{switchError ?? 'Erişilebilir tenant bulunamadı.'}</p>
          ) : (
            tenants.map(tenant => (
              <button
                key={tenant.id}
                type="button"
                role="menuitemradio"
                aria-checked={tenant.id === activeTenantId}
                disabled={switchingTenantId !== null}
                onClick={() => void handleSelect(tenant)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] transition-colors duration-150 ease-in-out focus-visible:outline-none focus-visible:shadow-glass-focus disabled:opacity-glass-disabled ${
                  tenant.id === activeTenantId
                    ? 'bg-glass-subtle font-medium text-glass-text-primary'
                    : 'text-glass-text-secondary hover:bg-glass-subtle hover:text-glass-text-primary'
                }`}
              >
                <span className="truncate">{tenant.name}</span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-glass-text-muted">
                  {switchingTenantId === tenant.id ? '…' : tenant.type}
                </span>
              </button>
            ))
          )}
          {switchError && tenants.length > 0 ? <p className="px-3 py-2 text-[11px] text-glass-status-danger">{switchError}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
