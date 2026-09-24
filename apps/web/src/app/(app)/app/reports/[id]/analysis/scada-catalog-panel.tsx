'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, EmptyState, SectionHeader } from '@/components/platform-admin-ui'
import { ApiError, tenantApiGet } from '@/lib/api'
import { getActiveTenantId, TENANT_CHANGE_EVENT } from '@/lib/tenant-context'
import { DEV_CSV_LABEL, type CatalogSelection, type CatalogSource, type Interval, type ScadaCatalog } from './scada-catalog.types'
import { EMPTY_SELECTION, PROBLEM_MESSAGE, resolveSelection, selectSource, toggleSeries, wallBounds, type SelectionResult } from './scada-catalog-selection'

export type DiscoveryFailure = 'CLOSED' | 'NOT_CONFIGURED' | 'LIMITS' | 'FORBIDDEN' | 'BLOCKED' | 'FAILED'

const FAILURE_MESSAGE: Record<DiscoveryFailure, { title: string; description: string }> = {
  CLOSED: { title: 'Kaynak kataloğu kapalı', description: 'Bu rapor için kaynak kataloğu sunulmuyor (geliştirme CSV verisi etkin değil).' },
  NOT_CONFIGURED: { title: 'Veri kaynağı yapılandırılmamış', description: 'Bu ortamda bir veri kaynağı sağlayıcısı bağlı değil.' },
  LIMITS: { title: 'Limit yapılandırılmamış', description: 'Analiz limitleri tanımlı olmadığı için kaynaklar listelenemiyor.' },
  FORBIDDEN: { title: 'Erişim yok', description: 'Bu raporun kaynaklarına erişim yetkiniz yok ya da aktif tenant eşleşmiyor.' },
  BLOCKED: { title: 'Katalog erişilemiyor', description: 'Kaynak kataloğu şu anda okunamıyor veya bloklu.' },
  FAILED: { title: 'Kaynaklar yüklenemedi', description: 'Kaynak listesi yüklenemedi. Lütfen tekrar deneyin.' },
}

const BLOCKED_REASON: Record<string, string> = {
  SOURCE_INACTIVE: 'Kaynak pasif',
  MAPPING_UNRESOLVED: 'Tenant eşlemesi çözümsüz',
  TENANT_NOT_MAPPABLE: 'Tenant eşleşmiyor',
  TIMEZONE_UNVERIFIED: 'Saat dilimi tanımlı değil',
  NO_SERIES: 'Doğrulanmış seri yok',
}

function classify(err: unknown): DiscoveryFailure {
  if (!(err instanceof ApiError)) return 'FAILED'
  const code = String(err.body?.['code'] ?? '')
  if (err.status === 404 || code === 'SCADA_NOT_FOUND') return 'CLOSED'
  if (code === 'SCADA_SOURCE_NOT_CONFIGURED') return 'NOT_CONFIGURED'
  if (code === 'SCADA_LIMITS_NOT_CONFIGURED') return 'LIMITS'
  if (err.status === 401 || err.status === 403 || code === 'SCADA_SCOPE_DENIED') return 'FORBIDDEN'
  if (code === 'SCADA_SOURCE_UNAVAILABLE' || code === 'SCADA_AUDIT_FAILED') return 'BLOCKED'
  return 'FAILED'
}

export interface CatalogPanelState {
  /** null until the discovery succeeded (and again after every tenant change). */
  catalog: ScadaCatalog | null
  failure: DiscoveryFailure | null
  loading: boolean
  selection: CatalogSelection
  source: CatalogSource | null
  resolved: SelectionResult
}

interface Props {
  artifactId: string
  /** A preset that was validated against THIS catalog: applied once per token, replacing the whole selection (all-or-nothing is decided by the caller). */
  hydrate?: { token: number; selection: CatalogSelection } | null
  /** The analysis is running: every control is locked. */
  locked: boolean
  onChange: (state: CatalogPanelState) => void
}

/**
 * TASK-027.73-R1 — discovery-driven source / series / range / interval selection. It owns the discovery request (latest request
 * wins; a tenant change discards everything at once) and reports the current selection upward; it never invents a source,
 * a series or a default range: with no discovery result there is nothing to select.
 */
export function ScadaCatalogPanel({ artifactId, locked, onChange, hydrate = null }: Props) {
  const [catalog, setCatalog] = useState<ScadaCatalog | null>(null)
  const [failure, setFailure] = useState<DiscoveryFailure | null>(null)
  const [loading, setLoading] = useState(true)
  const [selection, setSelection] = useState<CatalogSelection>(EMPTY_SELECTION)
  const seqRef = useRef(0)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const load = useCallback(async () => {
    const seq = ++seqRef.current
    const tenant = getActiveTenantId()
    setLoading(true)
    setFailure(null)
    try {
      const result = await tenantApiGet<ScadaCatalog>(`/api/v1/reports/${encodeURIComponent(artifactId)}/analysis/catalog`)
      if (seqRef.current !== seq || getActiveTenantId() !== tenant) return // a newer request / another tenant owns the state now
      setCatalog(result && Array.isArray(result.sources) ? result : null)
      if (!result || !Array.isArray(result.sources)) setFailure('FAILED')
    } catch (err) {
      if (seqRef.current !== seq || getActiveTenantId() !== tenant) return
      setCatalog(null)
      setFailure(classify(err))
    } finally {
      if (seqRef.current === seq) setLoading(false)
    }
  }, [artifactId])

  useEffect(() => {
    void load()
    function handleTenantChange() {
      seqRef.current++ // any in-flight discovery of the previous tenant is discarded
      setCatalog(null)
      setSelection(EMPTY_SELECTION)
      setFailure(null)
      void load()
    }
    window.addEventListener(TENANT_CHANGE_EVENT, handleTenantChange)
    return () => window.removeEventListener(TENANT_CHANGE_EVENT, handleTenantChange)
  }, [load])

  const hydratedToken = useRef(0)
  useEffect(() => {
    if (hydrate && catalog && hydrate.token !== hydratedToken.current) {
      hydratedToken.current = hydrate.token
      setSelection(hydrate.selection)
    }
  }, [hydrate, catalog])

  const source = useMemo(() => catalog?.sources.find(s => s.catalogId === selection.sourceCatalogId) ?? null, [catalog, selection.sourceCatalogId])
  const resolved = useMemo(() => resolveSelection(selection, source), [selection, source])

  useEffect(() => {
    onChangeRef.current({ catalog, failure, loading, selection, source, resolved })
  }, [catalog, failure, loading, selection, source, resolved])

  const bounds = source ? wallBounds(source) : null
  const dev = catalog?.developmentLabel ?? null
  const controlsLocked = locked || loading

  if (loading && !catalog) return <EmptyState title="Kaynaklar yükleniyor" description="Kaynak kataloğu getiriliyor..." />
  if (failure) return <EmptyState title={FAILURE_MESSAGE[failure].title} description={FAILURE_MESSAGE[failure].description} />
  if (!catalog) return null
  if (catalog.sources.length === 0) return <EmptyState title="Kaynak bulunamadı" description="Bu rapor için seçilebilir bir kaynak yok." />

  const anySelectable = catalog.sources.some(s => s.selectable)

  return (
    <div className="space-y-3" data-testid="scada-catalog-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeader title="Kaynak ve Seri Seçimi" density="compact" />
        {dev ? <Badge tone="warning">{dev}</Badge> : null}
      </div>

      {!anySelectable ? (
        <EmptyState title="Seçilebilir kaynak yok" description={`Kaynaklar listelendi ancak hiçbiri analiz için hazır değil (${[...new Set(catalog.sources.map(s => BLOCKED_REASON[s.blockedReason ?? ''] ?? 'Hazır değil'))].join(', ')}).`} />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 lg:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Kaynak</span>
          <select
            className="app-input-dense"
            aria-label="Kaynak"
            value={selection.sourceCatalogId}
            disabled={controlsLocked}
            onChange={e => setSelection(prev => selectSource(prev, catalog.sources.find(s => s.catalogId === e.target.value) ?? null))}
          >
            <option value="">-- Kaynak seçin --</option>
            {catalog.sources.map(s => (
              <option key={s.catalogId} value={s.catalogId} disabled={!s.selectable}>
                {s.name}
                {s.selectable ? '' : ` (${BLOCKED_REASON[s.blockedReason ?? ''] ?? 'hazır değil'})`}
                {dev ? ` — ${DEV_CSV_LABEL}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Başlangıç (dahil)</span>
          <input
            type="datetime-local"
            className="app-input-dense"
            aria-label="Başlangıç tarihi"
            disabled={controlsLocked || !source}
            min={bounds?.min}
            max={bounds?.max}
            value={selection.startWall}
            onChange={e => setSelection(prev => ({ ...prev, startWall: e.target.value }))}
          />
        </label>

        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Bitiş (dahil)</span>
          <input
            type="datetime-local"
            className="app-input-dense"
            aria-label="Bitiş tarihi"
            disabled={controlsLocked || !source}
            min={bounds?.min}
            max={bounds?.max}
            value={selection.endWall}
            onChange={e => setSelection(prev => ({ ...prev, endWall: e.target.value }))}
          />
        </label>

        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Aralık</span>
          <select
            className="app-input-dense"
            aria-label="Aralık"
            disabled={controlsLocked}
            value={selection.interval}
            onChange={e => setSelection(prev => ({ ...prev, interval: e.target.value as Interval }))}
          >
            <option value="HOURLY">Saatlik (HOURLY)</option>
            <option value="DAILY">Günlük (DAILY)</option>
          </select>
        </label>
      </div>

      {catalog.sources
        .filter(src => src.blockedReason === 'NO_SERIES' && src.series.length > 0)
        .map(src => (
          <p key={src.catalogId} className="text-[11px] text-status-warning" role="status">
            {src.name}: {src.series.length} kolon doğrulanmamış (UNVERIFIED) — değer tipi ve birim manifestte doğrulanmadığı için seçime kapalı.
          </p>
        ))}

      {source && bounds ? (
        <p className="text-[11px] text-ink-subtle">
          Veri aralığı: {bounds.min.replace('T', ' ')} – {bounds.max.replace('T', ' ')} ({source.timezone}) • {source.rowCount?.toLocaleString('tr-TR') ?? '—'} zaman damgası
        </p>
      ) : null}

      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Seriler</span>
        {!source ? (
          <p className="text-xs text-ink-muted">Seri seçmek için önce bir kaynak seçin.</p>
        ) : source.series.length === 0 ? (
          <p className="text-xs text-ink-muted">Bu kaynakta seçilebilir seri yok.</p>
        ) : (
          <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto pt-1" role="group" aria-label="Seriler">
            {source.series.map(s => (
              <label key={s.seriesKey} className="flex items-center gap-1.5 text-xs text-ink">
                <input
                  type="checkbox"
                  disabled={controlsLocked || !s.available}
                  checked={selection.seriesKeys.includes(s.seriesKey)}
                  onChange={() => setSelection(prev => toggleSeries(prev, source, s.seriesKey))}
                />
                <span>
                  {s.label}
                  {s.verificationStatus === 'UNVERIFIED' || !s.available
                    ? ' — doğrulanmamış (UNVERIFIED)'
                    : ` (${s.unit ? s.unit : 'Birim belirtilmemiş'}${s.valueType ? `, ${s.valueType}` : ''})`}
                  {s.qualityStatus === 'PARTIAL' ? ' • eksik değer var' : ''}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {source && !resolved.ok && (selection.seriesKeys.length > 0 || selection.startWall || selection.endWall) ? (
        <p className="text-xs font-medium text-status-warning" role="status">
          {PROBLEM_MESSAGE[resolved.problem]}
        </p>
      ) : null}
    </div>
  )
}
