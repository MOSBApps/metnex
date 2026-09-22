'use client'

import { FormEvent, useEffect, useState } from 'react'
import { apiGet, apiPut } from '../../../../../lib/api'

export default function GeneralSettingsPage() {
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void apiGet<{ name: string; shortName: string | null; address: string | null }>('/api/v1/platform/settings/general')
      .then(data => {
        setName(data.name)
        setShortName(data.shortName ?? '')
        setAddress(data.address ?? '')
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      await apiPut('/api/v1/platform/settings/general', { name, shortName, address })
      setMessage('Kaydedildi.')
    } finally {
      setSaving(false)
    }
  }

  return <SettingsForm title="Platform Genel Ayarlar" fields={[{label:'Ad', value:name, setter:setName},{label:'Kısa Ad', value:shortName, setter:setShortName},{label:'Adres', value:address, setter:setAddress}]} onSubmit={handleSubmit} saving={saving} message={message} />
}

function SettingsForm({ title, fields, onSubmit, saving, message }: { title: string; fields: {label: string; value: string; setter: (value: string) => void}[]; onSubmit: (event: FormEvent) => void; saving: boolean; message: string | null }) {
  return (
    <form onSubmit={onSubmit} className="app-card max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      {fields.map(field => <label key={field.label} className="block space-y-2"><span className="app-label">{field.label}</span><input value={field.value} onChange={e => field.setter(e.target.value)} className="app-input" /></label>)}
      <div className="flex items-center justify-end gap-3 border-t border-surface-border pt-4">
        <button type="submit" disabled={saving} className="app-button-primary">{saving ? 'Kaydediliyor...' : 'Kaydet'}</button>
      </div>
      {message ? <p className="text-sm text-status-success">{message}</p> : null}
    </form>
  )
}
