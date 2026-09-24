'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, SectionHeader } from '@/components/platform-admin-ui'
import { ApiError, tenantApiGet, tenantApiPost } from '@/lib/api'
import { getActiveTenantId, TENANT_CHANGE_EVENT } from '@/lib/tenant-context'
import { DEV_CSV_LABEL, type ScadaCatalog, type VirtualColumnSummary } from './scada-catalog.types'

/** Static, credential-free messages by API code — the server's text (and the user's expression) is never shown or logged. */
const ERROR_MESSAGE: Record<string, string> = {
  SCADA_VIRTUAL_COLUMN_INVALID: 'Formül doğrulanamadı: izin verilen işlemler, doğrulanmış girdi serileri ve limitler dışında.',
  SCADA_REQUEST_INVALID: 'Alanlar geçersiz. Ad, birim, seri anahtarı ve formülü kontrol edin.',
  SCADA_REQUEST_UNKNOWN_FIELD: 'Alanlar geçersiz.',
  SCADA_LIMIT_EXCEEDED: 'Formül veya alan sayısı izin verilen sınırı aşıyor.',
  SCADA_MIXED_VALUE_TYPES: 'Girdi serileri aynı değer tipinde olmalıdır.',
  SCADA_SCOPE_DENIED: 'Bu işlem için yetkiniz yok (yalnızca sistem yöneticisi veya kök TENANT_ADMIN).',
  SCADA_NOT_FOUND: 'Kaynak veya sanal kolon bulunamadı.',
  SCADA_LIMITS_NOT_CONFIGURED: 'Limit yapılandırılmamış.',
  SCADA_SOURCE_NOT_CONFIGURED: 'Sanal kolon deposu yapılandırılmamış.',
  SCADA_AUDIT_FAILED: 'Audit hatası oluştu; işlem tamamlanmadı.',
}
const STATUS_TONE: Record<string, 'info' | 'warning' | 'danger'> = { ACTIVE: 'info', DRAFT: 'warning', DISABLED: 'warning', BLOCKED: 'danger' }

interface Props {
  artifactId: string
  catalog: ScadaCatalog | null
  /** The source currently selected in the analysis form (its ACTIVE columns can be used). */
  selectedSourceId: string
  locked: boolean
  onUseChange: (virtualColumnIds: string[]) => void
  /** A validated preset asks for these columns: applied once per token, only after the preset's source is the selected one and the list is loaded. */
  hydrate?: { token: number; sourceId: string; ids: string[] } | null
}

interface FormState {
  label: string
  unit: string
  catalogId: string
  seriesKey: string
  expression: string
  inputSeriesKeys: string[]
}
const EMPTY_FORM: FormState = { label: '', unit: '', catalogId: '', seriesKey: '', expression: '', inputSeriesKeys: [] }

/**
 * TASK-027.71-R1 — DEVELOPMENT-ONLY virtual column section. It renders ONLY when the catalog itself carries the development label
 * (fixture on) and the list endpoint exists (a 404 hides it), so it never appears in production. The expression lives only in
 * this component's form state until it is sent: it is cleared after a successful save, never put in a URL, storage, log or
 * analytics call, and never shown again (the server does not return it).
 */
export function ScadaVirtualColumnPanel({ artifactId, catalog, selectedSourceId, locked, onUseChange, hydrate = null }: Props) {
  const [items, setItems] = useState<VirtualColumnSummary[]>([])
  const [canManage, setCanManage] = useState(false)
  const [available, setAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [used, setUsed] = useState<string[]>([])
  const seqRef = useRef(0)
  const onUseRef = useRef(onUseChange)
  onUseRef.current = onUseChange
  const base = `/api/v1/reports/${encodeURIComponent(artifactId)}/analysis/virtual-columns`
  const isDev = Boolean(catalog?.developmentLabel)

  const reset = useCallback(() => {
    setItems([])
    setCanManage(false)
    setAvailable(false)
    setError(null)
    setOpen(false)
    setForm(EMPTY_FORM)
    setUsed([])
  }, [])

  const load = useCallback(async () => {
    const seq = ++seqRef.current
    const tenant = getActiveTenantId()
    try {
      const r = await tenantApiGet<{ virtualColumns: VirtualColumnSummary[]; canManage: boolean }>(base)
      if (seqRef.current !== seq || getActiveTenantId() !== tenant) return
      setItems(Array.isArray(r?.virtualColumns) ? r.virtualColumns : [])
      setCanManage(r?.canManage === true)
      setAvailable(true)
    } catch (err) {
      if (seqRef.current !== seq || getActiveTenantId() !== tenant) return
      setItems([])
      setCanManage(false)
      setAvailable(false) // 404 (no such route in this environment) or any failure: the section stays hidden
      if (err instanceof ApiError && err.status !== 404 && err.status !== 403) setError('Sanal kolonlar yüklenemedi.')
    }
  }, [base])

  useEffect(() => {
    reset()
    if (!isDev) return
    void load()
    function onTenant() {
      seqRef.current++
      reset()
      void load()
    }
    window.addEventListener(TENANT_CHANGE_EVENT, onTenant)
    return () => window.removeEventListener(TENANT_CHANGE_EVENT, onTenant)
  }, [isDev, load, reset])

  const hydratedToken = useRef(0)
  useEffect(() => {
    if (hydrate && available && hydrate.token !== hydratedToken.current && selectedSourceId === hydrate.sourceId) {
      hydratedToken.current = hydrate.token
      setUsed(hydrate.ids)
    }
  }, [hydrate, available, selectedSourceId])

  // a column can be used only while it is ACTIVE and belongs to the selected source
  const usable = items.filter(i => i.status === 'ACTIVE' && i.catalogId === selectedSourceId)
  useEffect(() => {
    const next = used.filter(id => usable.some(u => u.virtualColumnId === id))
    if (next.length !== used.length) setUsed(next)
    onUseRef.current(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [used, items, selectedSourceId])

  async function act(run: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await run()
      await load()
    } catch (err) {
      const code = err instanceof ApiError ? String(err.body?.['code'] ?? '') : ''
      setError(ERROR_MESSAGE[code] ?? 'İşlem tamamlanamadı.')
    } finally {
      setBusy(false)
    }
  }

  if (!isDev || !available) return null

  const sources = (catalog?.sources ?? []).filter(s => s.selectable)
  const source = sources.find(s => s.catalogId === form.catalogId) ?? null
  const inputs = (source?.series ?? []).filter(s => s.available)
  const disabled = locked || busy

  return (
    <section className="space-y-3 rounded-md border border-dashed border-surface-border p-3" data-testid="virtual-column-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeader title="Sanal kolonlar" density="compact" />
        <Badge tone="warning">{catalog?.developmentLabel ?? DEV_CSV_LABEL}</Badge>
      </div>

      {error ? <p className="text-xs font-medium text-status-danger" role="alert">{error}</p> : null}

      {items.length === 0 ? (
        <p className="text-xs text-ink-muted">Bu tenant için sanal kolon tanımlı değil.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map(v => {
            const usableHere = v.status === 'ACTIVE' && v.catalogId === selectedSourceId
            return (
              <li key={v.virtualColumnId} className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    aria-label={`Kullan: ${v.label}`}
                    disabled={disabled || !usableHere}
                    checked={used.includes(v.virtualColumnId)}
                    onChange={e => setUsed(prev => (e.target.checked ? [...prev, v.virtualColumnId] : prev.filter(id => id !== v.virtualColumnId)))}
                  />
                  <span className="font-medium text-ink">{v.label}</span>
                </label>
                <span className="text-ink-subtle">{v.seriesKey} • {v.unit} • v{v.version}</span>
                <Badge tone={STATUS_TONE[v.status] ?? 'warning'}>{v.status}</Badge>
                {canManage && v.status !== 'ACTIVE' ? (
                  <button type="button" className="app-button-outline-dense px-2" disabled={disabled} onClick={() => void act(() => tenantApiPost(`${base}/${encodeURIComponent(v.virtualColumnId)}/activate`, {}))}>
                    Aktif et
                  </button>
                ) : null}
                {canManage && v.status === 'ACTIVE' ? (
                  <button type="button" className="app-button-outline-dense px-2" disabled={disabled} onClick={() => void act(() => tenantApiPost(`${base}/${encodeURIComponent(v.virtualColumnId)}/disable`, {}))}>
                    Devre dışı bırak
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {canManage ? (
        open ? (
          <form
            className="space-y-2"
            onSubmit={e => {
              e.preventDefault()
              void act(async () => {
                await tenantApiPost(base, { label: form.label, unit: form.unit, catalogId: form.catalogId, seriesKey: form.seriesKey, expression: form.expression, inputSeriesKeys: form.inputSeriesKeys })
                setForm(EMPTY_FORM) // the expression is dropped from memory as soon as it is saved
                setOpen(false)
              })
            }}
          >
            <div className="grid gap-2 md:grid-cols-4">
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Ad / Etiket</span>
                <input className="app-input-dense" aria-label="Sanal kolon etiketi" value={form.label} disabled={disabled} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Birim</span>
                <input className="app-input-dense" aria-label="Sanal kolon birimi" value={form.unit} disabled={disabled} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Seri anahtarı</span>
                <input className="app-input-dense" aria-label="Sanal kolon seri anahtarı" value={form.seriesKey} disabled={disabled} onChange={e => setForm(p => ({ ...p, seriesKey: e.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Kaynak</span>
                <select className="app-input-dense" aria-label="Sanal kolon kaynağı" value={form.catalogId} disabled={disabled} onChange={e => setForm(p => ({ ...p, catalogId: e.target.value, inputSeriesKeys: [] }))}>
                  <option value="">-- Kaynak seçin --</option>
                  {sources.map(s => (
                    <option key={s.catalogId} value={s.catalogId}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Girdi serileri (doğrulanmış)</span>
              {!source ? (
                <p className="text-xs text-ink-muted">Girdi serisi seçmek için önce bir kaynak seçin.</p>
              ) : (
                <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1 overflow-y-auto" role="group" aria-label="Girdi serileri">
                  {inputs.map(s => (
                    <label key={s.seriesKey} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={form.inputSeriesKeys.includes(s.seriesKey)}
                        onChange={e => setForm(p => ({ ...p, inputSeriesKeys: e.target.checked ? [...p.inputSeriesKeys, s.seriesKey] : p.inputSeriesKeys.filter(k => k !== s.seriesKey) }))}
                      />
                      <span>{s.seriesKey}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Formül (örn. SERI_A + SERI_B)</span>
              <textarea className="app-input-dense font-mono" aria-label="Sanal kolon formülü" rows={2} value={form.expression} disabled={disabled} spellCheck={false} autoComplete="off" onChange={e => setForm(p => ({ ...p, expression: e.target.value }))} />
            </label>
            <div className="flex gap-2">
              <button type="submit" className="app-button-primary-dense px-4" disabled={disabled || !form.label || !form.unit || !form.seriesKey || !form.catalogId || form.inputSeriesKeys.length === 0 || !form.expression}>
                Doğrula ve kaydet
              </button>
              <button type="button" className="app-button-outline-dense px-3" disabled={disabled} onClick={() => { setOpen(false); setForm(EMPTY_FORM) }}>
                Vazgeç
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="app-button-outline-dense px-3" disabled={disabled} onClick={() => setOpen(true)}>
            Yeni sanal kolon
          </button>
        )
      ) : null}
    </section>
  )
}
