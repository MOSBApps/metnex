'use client'

import { useEffect, useMemo, useState } from 'react'
import { getActiveTenantId, TENANT_CHANGE_EVENT } from '../lib/tenant-context'
import { loadAccessibleTenants, switchActiveTenant, type AccessibleTenant } from '../lib/tenant-switch'

interface TenantSwitcherProps {
  tenantName: string
  tenantType: string
  subtitle?: string
}

export function TenantSwitcher({ tenantName, tenantType, subtitle }: TenantSwitcherProps) {
  const [tenants, setTenants] = useState<AccessibleTenant[]>([])
  const [tenantsLoading, setTenantsLoading] = useState(true)
  const [selectedTenantId, setSelectedTenantId] = useState<string>(() => getActiveTenantId() ?? '')
  const [switchingTenantId, setSwitchingTenantId] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const activeTenant = useMemo(
    () => tenants.find(tenant => tenant.id === selectedTenantId) ?? null,
    [selectedTenantId, tenants],
  )

  useEffect(() => {
    let cancelled = false
    const currentTenantId = getActiveTenantId()

    if (currentTenantId) {
      setSelectedTenantId(currentTenantId)
    }

    void loadAccessibleTenants()
      .then(rows => {
        if (cancelled) return
        setTenants(rows)
        const firstTenant = rows[0]
        if (!currentTenantId && firstTenant) {
          setSelectedTenantId(firstTenant.id)
        }
        setTenantsLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setSwitchError('Tenant listesi yüklenemedi.')
        setTenantsLoading(false)
      })

    function handleTenantChange() {
      setSelectedTenantId(getActiveTenantId() ?? '')
      setSwitchError(null)
    }

    window.addEventListener(TENANT_CHANGE_EVENT, handleTenantChange)
    return () => {
      cancelled = true
      window.removeEventListener(TENANT_CHANGE_EVENT, handleTenantChange)
    }
  }, [])

  async function handleTenantSelect(nextTenantId: string) {
    if (!nextTenantId || nextTenantId === selectedTenantId || switchingTenantId) return

    const previousTenantId = selectedTenantId
    setSelectedTenantId(nextTenantId)
    setSwitchingTenantId(nextTenantId)
    setSwitchError(null)

    try {
      await switchActiveTenant(nextTenantId)
      window.location.href = '/app'
    } catch (error) {
      setSelectedTenantId(previousTenantId)
      setSwitchError(error instanceof Error ? error.message : 'Tenant değiştirilemedi.')
      setSwitchingTenantId(null)
    }
  }

  return (
    <div className="border-b border-surface-border px-4 py-3">
      {subtitle ? (
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">{subtitle}</div>
      ) : null}
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">Aktif tenant</div>
      <select
        value={selectedTenantId}
        onChange={event => void handleTenantSelect(event.target.value)}
        disabled={tenantsLoading || switchingTenantId !== null || tenants.length <= 1}
        className="app-input-dense pr-8"
        aria-label="Aktif tenant seç"
      >
        {tenants.map(tenant => (
          <option key={tenant.id} value={tenant.id}>
            {tenant.name}
          </option>
        ))}
      </select>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-ink-muted">
        <span className="truncate font-medium text-ink">{tenantName}</span>
        <span className="shrink-0 font-mono uppercase text-ink-subtle">{activeTenant?.type ?? tenantType}</span>
      </div>
      {activeTenant?.slug ? <div className="mt-1 truncate font-mono text-[11px] text-ink-subtle">{activeTenant.slug}</div> : null}
      {tenantsLoading ? <div className="mt-1 text-[11px] text-ink-subtle">Tenantlar yükleniyor...</div> : null}
      {!tenantsLoading && tenants.length <= 1 ? (
        <div className="mt-1 text-[11px] text-ink-subtle">Bu oturumda tek erişilebilir tenant var.</div>
      ) : null}
      {switchingTenantId ? <div className="mt-1 text-[11px] text-brand">Tenant değiştiriliyor...</div> : null}
      {switchError ? <div className="mt-1 text-[11px] text-status-danger">{switchError}</div> : null}
    </div>
  )
}
