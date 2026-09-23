'use client'

import Image from 'next/image'
import { FormEvent, useState } from 'react'
import { BrandLogo } from '../../components/brand-logo'
import { getApiBase } from '../../lib/api-base'
import { buildMfaChallengePayload, sanitizeNumericCode, type MfaChallengeResponse } from '../../lib/mfa-login-flow'
import { setAccessToken } from '../../lib/refresh'

// TASK-027.61 — metnex_png.png (the wide, dark hero artwork) is decorative background only, behind
// an already-opaque form card — it carries no information of its own, so it is `aria-hidden` with
// an empty alt, per the task's own accessibility requirement for decorative images.
function LoginHeroBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center overflow-hidden bg-[#060814]">
      <Image src="/brand/metnex-login.png" alt="" fill priority unoptimized className="object-contain object-center opacity-90 transition-opacity" />
      <div className="absolute inset-0 bg-black/10 dark:bg-black/30" />
    </div>
  )
}

type MfaChallenge = MfaChallengeResponse

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)

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

      const data = (await res.json()) as { accessToken: string } | MfaChallenge
      if ('requiresMfa' in data) {
        setChallenge(data)
        return
      }
      setAccessToken(data.accessToken)
      window.location.href = '/'
    } catch {
      setError('Sunucuya ulaşılamıyor. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyChallenge(event: FormEvent) {
    event.preventDefault()
    if (!challenge) return
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`${getApiBase()}/api/v1/auth/mfa/challenge/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          challengeToken: challenge.mfaChallengeToken,
          ...buildMfaChallengePayload(useRecovery, useRecovery ? recoveryCode : code),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const message = Array.isArray(data.message) ? data.message[0] : data.message
        setError(message ?? 'Kod doğrulanamadı.')
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

  if (challenge) {
    return (
      <div className="app-page relative flex items-center justify-center bg-transparent p-6">
        <LoginHeroBackground />
        <div className="app-card w-full max-w-sm p-8">
          <div className="mb-8 text-center">
            <h1 className="m-0 text-2xl font-semibold text-ink">MFA Doğrulama</h1>
            <p className="mt-2 text-sm text-ink-muted">
              {useRecovery ? 'Kurtarma kodunuzu girin.' : 'Authenticator uygulamanızdaki 6 haneli kodu girin.'}
            </p>
          </div>
          <form onSubmit={handleVerifyChallenge} className="space-y-4">
            {error ? <div className="rounded-lg border border-status-danger bg-status-danger_bg px-3 py-3 text-sm text-status-danger">{error}</div> : null}
            {useRecovery ? (
              <div className="space-y-2">
                <label htmlFor="recoveryCode" className="app-label">Kurtarma kodu</label>
                <input
                  id="recoveryCode"
                  value={recoveryCode}
                  onChange={event => setRecoveryCode(event.target.value)}
                  type="text"
                  placeholder="ABCD-2345"
                  className="app-input"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="code" className="app-label">Doğrulama kodu</label>
                <input
                  id="code"
                  value={code}
                  onChange={event => setCode(sanitizeNumericCode(event.target.value))}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  className="app-input"
                />
              </div>
            )}
            <button type="submit" disabled={loading} className="app-button-primary w-full">
              {loading ? 'Doğrulanıyor...' : 'Doğrula'}
            </button>
            <button
              type="button"
              className="w-full text-center text-sm text-ink-muted underline"
              onClick={() => { setUseRecovery(!useRecovery); setError(null) }}
            >
              {useRecovery ? 'Authenticator kodu kullan' : 'Kurtarma kodu kullan'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="app-page relative flex items-center justify-center bg-transparent p-6">
      <LoginHeroBackground />
      <div className="app-card w-full max-w-sm p-8">
        <div className="mb-8 text-center">
          <BrandLogo variant="firma" height={120} priority className="mx-auto max-w-full h-auto object-contain" />
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
