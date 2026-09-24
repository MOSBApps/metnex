'use client'

import { FormEvent, useEffect, useState } from 'react'
import { apiGet, apiPost } from '@/lib/api'
import { PageIntro } from '@/components/platform-admin-ui'

interface SetupResponse {
  otpauthUri: string
  qrDataUri: string
  secret: string
}

type View = 'loading' | 'disabled' | 'setup' | 'recovery-codes' | 'enabled' | 'disabling' | 'regenerating'

export default function SecuritySettingsPage() {
  const [view, setView] = useState<View>('loading')
  const [setup, setSetup] = useState<SetupResponse | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void refreshStatus()
  }, [])

  async function refreshStatus() {
    setError(null)
    try {
      const status = await apiGet<{ enabled: boolean }>('/api/v1/auth/mfa/status')
      setView(status.enabled ? 'enabled' : 'disabled')
    } catch {
      setError('MFA durumu okunamadı.')
    }
  }

  async function startSetup() {
    setError(null)
    setBusy(true)
    try {
      const data = await apiPost<SetupResponse>('/api/v1/auth/mfa/totp/setup')
      setSetup(data)
      setView('setup')
    } catch {
      setError('MFA kurulumu başlatılamadı.')
    } finally {
      setBusy(false)
    }
  }

  async function handleVerifySetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    const code = new FormData(event.currentTarget).get('code') as string
    try {
      const { recoveryCodes: codes } = await apiPost<{ recoveryCodes: string[] }>('/api/v1/auth/mfa/totp/verify-setup', { code })
      setRecoveryCodes(codes)
      setView('recovery-codes')
    } catch {
      setError('Kod doğrulanamadı. Authenticator uygulamanızdaki kodu kontrol edip tekrar deneyin.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    const form = new FormData(event.currentTarget)
    try {
      await apiPost('/api/v1/auth/mfa/totp/disable', { password: form.get('password'), code: form.get('code') })
      setView('disabled')
    } catch {
      setError('MFA devre dışı bırakılamadı. Parola ve kodu kontrol edin.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRegenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    const code = new FormData(event.currentTarget).get('code') as string
    try {
      const { recoveryCodes: codes } = await apiPost<{ recoveryCodes: string[] }>('/api/v1/auth/mfa/recovery-codes/regenerate', { code })
      setRecoveryCodes(codes)
      setView('recovery-codes')
    } catch {
      setError('Kurtarma kodları yenilenemedi. Kodu kontrol edin.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Güvenlik"
        title="Çok Faktörlü Doğrulama (MFA)"
        description="Hesabınıza authenticator uygulaması (TOTP) ile ikinci bir doğrulama katmanı ekleyin."
      />

      {error ? <div className="rounded-lg border border-status-danger bg-status-danger_bg px-3 py-3 text-sm text-status-danger">{error}</div> : null}

      {view === 'loading' ? <div className="app-card p-6 text-sm text-ink-muted">Yükleniyor...</div> : null}

      {view === 'disabled' ? (
        <div className="app-card max-w-xl space-y-4 p-6">
          <p className="text-sm text-ink-muted">MFA şu anda hesabınızda etkin değil.</p>
          <button type="button" disabled={busy} onClick={startSetup} className="app-button-primary">
            {busy ? 'Başlatılıyor...' : 'MFA Kurulumunu Başlat'}
          </button>
        </div>
      ) : null}

      {view === 'setup' && setup ? (
        <form onSubmit={handleVerifySetup} className="app-card max-w-xl space-y-4 p-6">
          <p className="text-sm text-ink-muted">
            Authenticator uygulamanızla (Google Authenticator, 1Password, Authy vb.) aşağıdaki QR kodu okutun,
            veya kodu elle girin.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- server-generated data: URI, not an optimizable asset */}
          <img src={setup.qrDataUri} alt="MFA QR kodu" className="h-48 w-48 rounded-lg border border-surface-border bg-white p-2" />
          <div className="space-y-1">
            <span className="app-label">Manuel giriş anahtarı</span>
            <code className="block break-all rounded-lg border border-surface-border bg-surface-subtle px-3 py-2 text-xs">{setup.secret}</code>
          </div>
          <label className="block space-y-2">
            <span className="app-label">Authenticator uygulamasındaki 6 haneli kod <span className="text-status-danger">*</span></span>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="app-input" placeholder="123456" />
          </label>
          <div className="flex items-center justify-end gap-3 border-t border-surface-border pt-4">
            <button type="submit" disabled={busy} className="app-button-primary">{busy ? 'Doğrulanıyor...' : 'Doğrula ve Etkinleştir'}</button>
          </div>
        </form>
      ) : null}

      {view === 'recovery-codes' ? (
        <div className="app-card max-w-xl space-y-4 p-6">
          <p className="text-sm font-medium text-status-danger">
            Bu kurtarma kodlarını güvenli bir yerde saklayın — bir daha gösterilmeyecekler. Her biri yalnızca bir kez kullanılabilir.
          </p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
            {recoveryCodes.map(code => (
              <li key={code} className="rounded-lg border border-surface-border bg-surface-subtle px-3 py-2">{code}</li>
            ))}
          </ul>
          <div className="flex items-center justify-end gap-3 border-t border-surface-border pt-4">
            <button type="button" className="app-button-primary" onClick={() => void refreshStatus()}>Kaydettim, Devam Et</button>
          </div>
        </div>
      ) : null}

      {view === 'enabled' ? (
        <div className="app-card max-w-xl space-y-4 p-6">
          <p className="text-sm text-status-success">MFA hesabınızda etkin.</p>
          <div className="flex flex-wrap gap-3 border-t border-surface-border pt-4">
            <button type="button" className="app-button-outline" onClick={() => setView('regenerating')}>Kurtarma Kodlarını Yenile</button>
            <button type="button" className="app-button-outline" onClick={() => setView('disabling')}>MFA&apos;yı Devre Dışı Bırak</button>
          </div>
        </div>
      ) : null}

      {view === 'disabling' ? (
        <form onSubmit={handleDisable} className="app-card max-w-xl space-y-4 p-6">
          <p className="text-sm text-ink-muted">MFA&apos;yı devre dışı bırakmak için parolanızı ve güncel authenticator kodunuzu girin.</p>
          <label className="block space-y-2">
            <span className="app-label">Parola <span className="text-status-danger">*</span></span>
            <input name="password" type="password" autoComplete="current-password" className="app-input" />
          </label>
          <label className="block space-y-2">
            <span className="app-label">Authenticator kodu <span className="text-status-danger">*</span></span>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="app-input" placeholder="123456" />
          </label>
          <div className="flex items-center justify-end gap-3 border-t border-surface-border pt-4">
            <button type="button" className="app-button-outline" onClick={() => setView('enabled')}>Vazgeç</button>
            <button type="submit" disabled={busy} className="app-button-primary">{busy ? 'Devre dışı bırakılıyor...' : 'Devre Dışı Bırak'}</button>
          </div>
        </form>
      ) : null}

      {view === 'regenerating' ? (
        <form onSubmit={handleRegenerate} className="app-card max-w-xl space-y-4 p-6">
          <p className="text-sm text-ink-muted">
            Yeni kurtarma kodları üretmek için güncel authenticator kodunuzu girin. Mevcut kodlar geçersiz olacak.
          </p>
          <label className="block space-y-2">
            <span className="app-label">Authenticator kodu <span className="text-status-danger">*</span></span>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="app-input" placeholder="123456" />
          </label>
          <div className="flex items-center justify-end gap-3 border-t border-surface-border pt-4">
            <button type="button" className="app-button-outline" onClick={() => setView('enabled')}>Vazgeç</button>
            <button type="submit" disabled={busy} className="app-button-primary">{busy ? 'Yenileniyor...' : 'Kurtarma Kodlarını Yenile'}</button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
