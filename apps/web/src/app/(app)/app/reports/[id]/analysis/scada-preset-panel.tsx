'use client'

import { useEffect, useState } from 'react'
import { Badge, SectionHeader } from '@/components/platform-admin-ui'
import { TENANT_CHANGE_EVENT } from '@/lib/tenant-context'
import type { PresetSummary } from './scada-analysis.types'
import type { PresetDraft } from './scada-preset-request'

export const DEV_PRESET_LABEL = 'Geliştirme ortamı — bellek içi preset'

interface Props {
  presets: PresetSummary[]
  /** The development in-memory store exists (and so does its create route) — the label and the save form render only then. */
  developmentStore: boolean
  canShare: boolean
  appliedPresetId: string
  message: string | null
  locked: boolean
  onSelect: (presetId: string) => void
  /** Resolves to an error message, or null when saved. */
  onSave: (draft: PresetDraft) => Promise<string | null>
}

/**
 * TASK-027.59-R1 — preset selection (hydrates the analysis form) and, in development only, "Preset olarak kaydet". Without the
 * development store nothing here exists except the plain selector of the presets the API already lists; no demo preset is ever made up.
 */
export function ScadaPresetPanel({ presets, developmentStore, canShare, appliedPresetId, message, locked, onSelect, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<PresetDraft>({ name: '', description: '', scope: 'PRIVATE' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // a tenant change discards the open form, the draft and any message at once
  useEffect(() => {
    function reset() {
      setOpen(false)
      setDraft({ name: '', description: '', scope: 'PRIVATE' })
      setError(null)
      setSaved(false)
      setBusy(false)
    }
    window.addEventListener(TENANT_CHANGE_EVENT, reset)
    return () => window.removeEventListener(TENANT_CHANGE_EVENT, reset)
  }, [])
  const applied = presets.find(p => p.presetId === appliedPresetId) ?? null

  if (presets.length === 0 && !developmentStore) return null

  async function save() {
    setBusy(true)
    setError(null)
    setSaved(false)
    const result = await onSave(draft)
    setBusy(false)
    if (result) {
      setError(result)
      return
    }
    setSaved(true)
    setOpen(false)
    setDraft({ name: '', description: '', scope: 'PRIVATE' })
  }

  return (
    <div className="space-y-2 rounded-md border border-surface-border bg-surface p-3" data-testid="preset-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeader title="Presetler" density="compact" />
        {developmentStore ? <Badge tone="warning">{DEV_PRESET_LABEL}</Badge> : null}
      </div>
      {developmentStore ? <p className="text-[11px] text-ink-subtle">Presetler yalnız API belleğinde tutulur; API yeniden başlatılınca silinir.</p> : null}

      {presets.length > 0 ? (
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Kayıtlı Preset Şablonu</span>
          <select className="app-input-dense" aria-label="Kayıtlı Preset Şablonu" disabled={locked} value={appliedPresetId} onChange={e => onSelect(e.target.value)}>
            <option value="">-- Özel Seçim (Preset Yok) --</option>
            {presets.map(p => (
              <option key={p.presetId} value={p.presetId}>
                {p.name} (v{p.version} - {p.scope}) {p.status !== 'ACTIVE' ? '[PASİF]' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-xs text-ink-muted">Kayıtlı preset yok.</p>
      )}

      {applied ? (
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <Badge tone="info">Uygulanan: {applied.name} • v{applied.version}</Badge>
        </div>
      ) : null}
      {message ? (
        <p className="text-xs font-medium text-status-warning" role="status">
          {message}
        </p>
      ) : null}
      {saved ? (
        <p className="text-xs font-medium text-status-success" role="status">
          Preset kaydedildi.
        </p>
      ) : null}

      {developmentStore ? (
        <div className="space-y-2">
          {!open ? (
            <button type="button" className="app-button-outline-dense px-3" disabled={locked} onClick={() => setOpen(true)}>
              Preset olarak kaydet
            </button>
          ) : (
            <div className="space-y-2 rounded-md border border-dashed border-surface-border p-3">
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Preset adı</span>
                <input className="app-input-dense" aria-label="Preset adı" maxLength={80} value={draft.name} disabled={busy} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Açıklama (isteğe bağlı)</span>
                <input className="app-input-dense" aria-label="Preset açıklaması" maxLength={200} value={draft.description} disabled={busy} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Kapsam</span>
                <select className="app-input-dense" aria-label="Preset kapsamı" value={draft.scope} disabled={busy} onChange={e => setDraft(d => ({ ...d, scope: e.target.value as PresetDraft['scope'] }))}>
                  <option value="PRIVATE">Yalnız ben (PRIVATE)</option>
                  {canShare ? <option value="TENANT_SHARED">Tenant ile paylaş (TENANT_SHARED)</option> : null}
                </select>
              </label>
              {error ? (
                <p className="text-xs font-medium text-status-danger" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button type="button" className="app-button-primary-dense px-3" disabled={busy} onClick={() => void save()}>
                  {busy ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
                <button type="button" className="app-button-outline-dense px-3" disabled={busy} onClick={() => { setOpen(false); setError(null) }}>
                  Vazgeç
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
