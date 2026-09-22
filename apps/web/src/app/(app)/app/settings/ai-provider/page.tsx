'use client'

import { FormEvent, useEffect, useState } from 'react'
import { tenantApiGet, tenantApiPut } from '../../../../../lib/api'

export default function AiProviderPage() {
  const [providerType, setProviderType] = useState('OPENAI')
  const [endpoint, setEndpoint] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void tenantApiGet<{ providerType: string; endpoint: string | null; defaultModel: string | null }>('/api/v1/settings/ai-provider/effective')
      .then(data => {
        setProviderType(data.providerType)
        setEndpoint(data.endpoint ?? '')
        setDefaultModel(data.defaultModel ?? '')
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      await tenantApiPut('/api/v1/settings/ai-provider/override', {
        providerType,
        endpoint,
        defaultModel,
        apiKey,
        isActive: true,
      })
      setApiKey('')
      setMessage('AI provider override kaydedildi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="app-card max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold text-ink">Tenant AI Provider</h1>
      <Field label="Provider" value={providerType} onChange={setProviderType} />
      <Field label="Endpoint" value={endpoint} onChange={setEndpoint} />
      <Field label="Default Model" value={defaultModel} onChange={setDefaultModel} />
      <Field label="API Key" value={apiKey} onChange={setApiKey} type="password" />
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
