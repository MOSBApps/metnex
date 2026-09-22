'use client'

import { useEffect, useState } from 'react'
import { ImpersonationBanner } from '../../components/impersonation-banner'
import { LogoutButton } from '../../components/logout-button'
import { loadAccessibleTenants, switchActiveTenant, type AccessibleTenant } from '../../lib/tenant-switch'

export default function TenantSelectPage() {
  const [tenants, setTenants] = useState<AccessibleTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadAccessibleTenants()
      .then(rows => {
        setTenants(rows)
        setLoading(false)
      })
      .catch(() => {
        setError('Kiracı listesi yüklenemedi.')
        setLoading(false)
      })
  }, [])

  async function handleSelect(tenant: AccessibleTenant) {
    setActivating(tenant.id)
    setError(null)
    try {
      await switchActiveTenant(tenant.id)
      window.location.href = '/app'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kiracı seçilemedi')
      setActivating(null)
    }
  }

  return (
    <div className="app-page flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <ImpersonationBanner />
        <div className="app-card p-6">
          <h1 className="m-0 text-xl font-semibold text-ink">Çalışma Alanı Seç</h1>
          {loading ? <p className="mt-4 text-sm text-ink-muted">Yükleniyor...</p> : null}
          {!loading &&
            tenants.map(tenant => (
              <button
                key={tenant.id}
                onClick={() => void handleSelect(tenant)}
                disabled={activating !== null}
                className="mt-3 flex w-full items-start justify-between rounded-lg border border-surface-border bg-surface px-4 py-3 text-left transition-colors duration-150 ease-in-out hover:bg-surface-subtle disabled:opacity-50"
              >
                <span className="text-sm font-medium text-ink">{tenant.name}</span>
                <span className="font-mono text-xs text-ink-subtle">{tenant.slug}</span>
              </button>
            ))}
          {error ? (
            <div className="mt-3 rounded-lg border border-status-danger bg-status-danger_bg px-3 py-3 text-sm text-status-danger">
              {error}
            </div>
          ) : null}
          <div className="mt-4">
            <LogoutButton label="Oturumu Kapat" />
          </div>
        </div>
      </div>
    </div>
  )
}
