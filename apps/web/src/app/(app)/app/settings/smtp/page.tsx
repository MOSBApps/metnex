'use client'

import { FormEvent, useEffect, useState } from 'react'
import { tenantApiGet, tenantApiPut } from '../../../../../lib/api'

export default function SmtpSettingsPage() {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('587')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [fromName, setFromName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void tenantApiGet<{ host: string | null; port: number | null; username: string | null; fromEmail: string | null; fromName: string | null }>('/api/v1/settings/smtp/effective')
      .then(data => {
        setHost(data.host ?? '')
        setPort(String(data.port ?? 587))
        setUsername(data.username ?? '')
        setFromEmail(data.fromEmail ?? '')
        setFromName(data.fromName ?? '')
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      await tenantApiPut('/api/v1/settings/smtp/override', {
        host,
        port: Number(port),
        username,
        password,
        fromEmail,
        fromName,
        notificationsEnabled: true,
      })
      setPassword('')
      setMessage('SMTP override kaydedildi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="app-card max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold text-ink">Tenant SMTP</h1>
      <Field label="Host" value={host} onChange={setHost} />
      <Field label="Port" value={port} onChange={setPort} />
      <Field label="Kullanıcı" value={username} onChange={setUsername} />
      <Field label="Şifre" value={password} onChange={setPassword} type="password" />
      <Field label="Gönderen E-posta" value={fromEmail} onChange={setFromEmail} />
      <Field label="Gönderen Adı" value={fromName} onChange={setFromName} />
      <div className="flex items-center justify-end gap-3 border-t border-surface-border pt-4">
        <button type="submit" disabled={saving} className="app-button-primary">{saving ? 'Kaydediliyor...' : 'Kaydet'}</button>
      </div>
      {message ? <p className="text-sm text-status-success">{message}</p> : null}
    </form>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return <label className="block space-y-2"><span className="app-label">{label}</span><input type={type} value={value} onChange={e => onChange(e.target.value)} className="app-input" /></label>
}
