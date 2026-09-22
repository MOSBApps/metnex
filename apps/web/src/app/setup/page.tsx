'use client'

import { FormEvent, useState } from 'react'
import { getApiBase } from '../../lib/api-base'

export default function SetupPage() {
  const [tenantName, setTenantName] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`${getApiBase()}/api/v1/platform/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantName, tenantSlug, displayName, email, password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const message = Array.isArray(data.message) ? data.message[0] : data.message
        setError(message ?? 'Kurulum başarısız.')
        return
      }

      window.location.href = '/login'
    } catch {
      setError('Sunucuya ulaşılamıyor.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-page flex items-center justify-center p-6">
      <div className="app-card w-full max-w-xl p-8">
        <h1 className="m-0 text-2xl font-semibold text-ink">İlk Kurulum</h1>
        <p className="mt-2 text-sm text-ink-muted">Platform tenant ve ilk sistem yöneticisini oluşturur.</p>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
          {error ? <div className="sm:col-span-2 rounded-lg border border-status-danger bg-status-danger_bg px-3 py-3 text-sm text-status-danger">{error}</div> : null}
          <label className="space-y-2 sm:col-span-2"><span className="app-label">Platform Tenant Adı</span><input value={tenantName} onChange={e => setTenantName(e.target.value)} placeholder="Platform tenant adı" className="app-input" /></label>
          <label className="space-y-2"><span className="app-label">Tenant Slug</span><input value={tenantSlug} onChange={e => setTenantSlug(e.target.value)} placeholder="tenant-slug" className="app-input" /></label>
          <label className="space-y-2"><span className="app-label">Yönetici Adı</span><input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Yönetici adı" className="app-input" /></label>
          <label className="space-y-2"><span className="app-label">E-posta</span><input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="admin@example.com" className="app-input" /></label>
          <label className="space-y-2"><span className="app-label">Şifre</span><input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Şifre" className="app-input" /></label>
          <div className="sm:col-span-2 flex justify-end border-t border-surface-border pt-4">
            <button type="submit" disabled={loading} className="app-button-primary">{loading ? 'Kuruluyor...' : 'Kurulumu Tamamla'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
