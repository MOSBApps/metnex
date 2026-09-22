'use client'

import { FormEvent, useState } from 'react'
import { getApiBase } from '../../lib/api-base'
import { setAccessToken } from '../../lib/refresh'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`${getApiBase()}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const message = Array.isArray(data.message) ? data.message[0] : data.message
        setError(message ?? 'Giriş başarısız.')
        return
      }

      const { accessToken } = (await res.json()) as { accessToken: string }
      setAccessToken(accessToken)
      window.location.href = '/'
    } catch {
      setError('Sunucuya ulaşılamıyor. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-page flex items-center justify-center p-6">
      <div className="app-card w-full max-w-sm p-8">
        <div className="mb-8 text-center">
          <h1 className="m-0 text-2xl font-semibold text-ink">Metnex</h1>
          <p className="mt-2 text-sm text-ink-muted">Platform foundation starter</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <div className="rounded-lg border border-status-danger bg-status-danger_bg px-3 py-3 text-sm text-status-danger">{error}</div> : null}
          <div className="space-y-2">
            <label htmlFor="email" className="app-label">E-posta <span className="ml-0.5 text-status-danger" aria-label="zorunlu">*</span></label>
            <input
              id="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              placeholder="admin@example.com"
              className="app-input"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="app-label">Şifre <span className="ml-0.5 text-status-danger" aria-label="zorunlu">*</span></label>
            <input
              id="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className="app-input"
            />
          </div>
          <button type="submit" disabled={loading} className="app-button-primary w-full">
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </div>
  )
}
