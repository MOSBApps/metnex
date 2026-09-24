'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, EmptyState, PageIntro, SectionHeader, StatCard } from '@/components/platform-admin-ui'
import { useTenantPermissions } from '@/contexts/tenant-permission-context'
import { ApiError, tenantApiDownload, tenantApiGet, tenantApiPost } from '@/lib/api'
import { getActiveTenantId, TENANT_CHANGE_EVENT } from '@/lib/tenant-context'
import { type AnalysisRow, buildDailyTotals } from './chart-data'
import { buildCsv, buildCsvFileName, buildPngFileName } from './csv-export'
import { createExportGuard } from './export-guard'
import { buildPngCaptionLines, renderSvgToPngBlob } from './png-export'
import { completeScadaPngExport, downloadScadaFile, fetchScadaPngCaption, hasExportableData, scadaExportErrorMessage, type ScadaExportFormat, type ScadaExportRequest } from './scada-export-client'
import { ScadaCatalogPanel, type CatalogPanelState } from './scada-catalog-panel'
import { ScadaPresetPanel } from './scada-preset-panel'
import { ScadaSourceMappingPanel } from './scada-source-mapping-panel'
import { autoMapSeries, buildSeriesMapping, HYDRATION_MESSAGE, hydratePreset, MAPPING_MESSAGE } from './scada-preset-hydration'
import { buildPresetRequest, type PresetDraft } from './scada-preset-request'
import { ScadaVirtualColumnPanel } from './scada-virtual-column-panel'
import { PROBLEM_MESSAGE, buildQueryBody, resolveWallRange, wallBounds } from './scada-catalog-selection'
import type {
  AnalysisFormState,
  PresetDetail,
  PresetList,
  PresetSummary,
  ProjectedAnalysis,
  ProjectedComparison,
} from './scada-analysis.types'
import {
  formatPercentageDelta,
  formatValue,
  getSeriesColor,
  transformAnalysisToChartData,
  transformComparisonToChartData,
} from './scada-chart-helpers'

interface GenericAnalysisData {
  artifact: { code: string; title: string }
  rows: AnalysisRow[]
  totalAmount: number
}

const DEV_FIXTURE_ARTIFACT_CODE = 'DEV_REPORTING_FIXTURE'

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Tamamlandı',
  PENDING: 'Beklemede',
  FAILED: 'Başarısız',
}

const ALL_STATISTICS = ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'VALID_COUNT', 'MISSING_COUNT', 'INVALID_COUNT', 'INCOMPLETE_COUNT'] as const

export function ReportAnalysisClient({ artifactId }: { artifactId: string }) {
  const { can: canPerform } = useTenantPermissions()
  const canExportFile = canPerform('REPORT:ARTIFACT:EXPORT')

  // Mode & Form state
  const [form, setForm] = useState<AnalysisFormState>({
    startAt: '',
    endAt: '',
    bucketInterval: 'HOURLY',
    timezone: '',
    sourceCatalogIds: '',
    seriesKeys: '',
    statistics: ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'VALID_COUNT', 'MISSING_COUNT'],
    presetId: '',
    comparisonMode: 'NONE',
    comparisonStartAt: '',
    comparisonEndAt: '',
    leftSourceCatalogId: '',
    rightSourceCatalogId: '',
  })

  // Discovery-driven selection (source / series / range / interval) reported by the catalog panel
  const [panel, setPanel] = useState<CatalogPanelState | null>(null)
  const [virtualIds, setVirtualIds] = useState<string[]>([])
  const [presets, setPresets] = useState<PresetSummary[]>([])
  const [selectedPresetSummary, setSelectedPresetSummary] = useState<PresetSummary | null>(null)
  // Preset hydration / development store (TASK-027.59-R1)
  const [presetMeta, setPresetMeta] = useState<{ developmentStore: boolean; canShare: boolean }>({ developmentStore: false, canShare: false })
  const [appliedPresetId, setAppliedPresetId] = useState('')
  const [presetMessage, setPresetMessage] = useState<string | null>(null)
  const [catalogHydration, setCatalogHydration] = useState<{ token: number; selection: import('./scada-catalog.types').CatalogSelection } | null>(null)
  const [vcHydration, setVcHydration] = useState<{ token: number; sourceId: string; ids: string[] } | null>(null)
  const hydrationTokenRef = useRef(0)
  const presetSeqRef = useRef(0)
  // SOURCE comparison: explicit left series key → right series key
  const [sourceMapping, setSourceMapping] = useState<Record<string, string>>({})
  const [validationError, setValidationError] = useState<string | null>(null)

  // Data states
  const [analysisData, setAnalysisData] = useState<ProjectedAnalysis | null>(null)
  const [comparisonData, setComparisonData] = useState<ProjectedComparison | null>(null)
  const [genericData, setGenericData] = useState<GenericAnalysisData | null>(null)
  // The body of the last SUCCESSFUL query / compare call: the SCADA export repeats exactly this request (the server re-runs it).
  const [exportRequest, setExportRequest] = useState<ScadaExportRequest | null>(null)

  // Generic filter state
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [, setPage] = useState(0)

  // Export state & guards
  const [exportingCsv, setExportingCsv] = useState(false)
  const [exportingPng, setExportingPng] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingXlsx, setExportingXlsx] = useState(false)
  const csvGuardRef = useRef(createExportGuard(400))
  const pngGuardRef = useRef(createExportGuard())
  const pdfGuardRef = useRef(createExportGuard())
  const xlsxGuardRef = useRef(createExportGuard())
  const chartWrapperRef = useRef<HTMLDivElement>(null)

  // Request race-condition counter
  const requestSeqRef = useRef(0)

  // Load Presets from API
  const loadPresets = useCallback(async () => {
    try {
      const result = await tenantApiGet<PresetList | PresetSummary[]>(`/api/v1/reports/${encodeURIComponent(artifactId)}/analysis/presets`)
      const list = Array.isArray(result) ? result : Array.isArray(result?.presets) ? result.presets : []
      setPresets(list)
      setPresetMeta(Array.isArray(result) ? { developmentStore: false, canShare: false } : { developmentStore: result?.developmentStore === true, canShare: result?.canShare === true })
    } catch {
      setPresets([])
      setPresetMeta({ developmentStore: false, canShare: false })
    }
  }, [artifactId])

  // Map SCADA API errors safely to Turkish messages with ZERO leak of internal details
  const handleScadaApiError = (err: unknown) => {
    if (err instanceof ApiError) {
      const code = String(err.body?.['code'] ?? err.message ?? '')
      if (err.status === 404 || code === 'SCADA_NOT_FOUND') {
        setNotFound(true)
      } else if (err.status === 401 || err.status === 403 || code === 'SCADA_SCOPE_DENIED') {
        setError('Bu rapora erişim yetkiniz yok.')
      } else if (code === 'SCADA_SOURCE_NOT_CONFIGURED') {
        setError('Veri kaynağı yapılandırılmamış.')
        setNotFound(true)
      } else if (code === 'SCADA_LIMITS_NOT_CONFIGURED') {
        setError('Limit yapılandırılmamış.')
      } else if (code === 'SCADA_PRESET_NOT_ACTIVE') {
        setError('Preset aktif değil.')
      } else if (code === 'SCADA_SOURCE_UNAVAILABLE') {
        setError('Veri kaynağı erişilebilir değil.')
      } else if (code === 'SCADA_AUDIT_FAILED') {
        setError('Audit hatası oluştu.')
      } else if (code === 'SCADA_ANALYSIS_BLOCKED' || code === 'NO_VALID_DATA') {
        setError('Analiz verisi bulunamadı veya tüm veriler bloklandı.')
      } else if (code === 'SCADA_TIME_RANGE_INVALID') {
        setError('Başlangıç tarihi bitiş tarihinden önce olmalıdır.')
      } else if (err.status >= 500) {
        setError('Rapor sunucusunda bir sorun oluştu. Lütfen daha sonra tekrar deneyin.')
      } else {
        setError('Rapor verisi yüklenemedi. Lütfen tekrar deneyin.')
      }
    } else {
      setError('Rapor verisi yüklenemedi. Lütfen tekrar deneyin.')
    }
  }

  // Run SCADA Query or Compare API call
  const runScadaAnalysis = useCallback(
    async (overrideForm?: Partial<AnalysisFormState>) => {
      const activeForm = { ...form, ...overrideForm }
      const currentSeq = ++requestSeqRef.current
      const activeTenant = getActiveTenantId()

      setLoading(true)
      setError(null)
      setExportError(null)
      setExportRequest(null)
      setValidationError(null)
      setNotFound(false)
      setPage(0)

      // The analysis is built ONLY from the discovered selection (or a preset reference): no free text, no defaults.
      const usingPreset = Boolean(activeForm.presetId)
      const resolved = panel?.resolved
      if (!usingPreset && (!resolved || !resolved.ok)) {
        setValidationError(resolved && !resolved.ok ? PROBLEM_MESSAGE[resolved.problem] : PROBLEM_MESSAGE.NO_SOURCE)
        setLoading(false)
        return // nothing is sent for a selection that is missing or outside the data range
      }
      const selection = panel?.selection
      const range = resolved && resolved.ok ? resolved : null
      const source = panel?.source ?? null
      const sources = selection ? [selection.sourceCatalogId] : []
      const series = selection ? selection.seriesKeys : []
      const interval = selection?.interval ?? activeForm.bucketInterval
      const zone = range?.timezone ?? activeForm.timezone

      try {
        let comparisonRange: { startAt: string; endAt: string } | null = null
        if (!usingPreset && activeForm.comparisonMode === 'PERIOD') {
          const cmp = resolveWallRange(activeForm.comparisonStartAt, activeForm.comparisonEndAt, interval, zone, source ? wallBounds(source) : null)
          if (!cmp.ok) {
            setValidationError(PROBLEM_MESSAGE[cmp.problem])
            setLoading(false)
            return
          }
          comparisonRange = { startAt: cmp.startAt, endAt: cmp.endAt }
        }
        let sourcePairs: Array<{ leftSeriesKey: string; rightSeriesKey: string }> = []
        if (!usingPreset && activeForm.comparisonMode === 'SOURCE') {
          if (!activeForm.rightSourceCatalogId || activeForm.rightSourceCatalogId === sources[0]) {
            setValidationError('Karşılaştırma için ikinci bir kaynak seçin.')
            setLoading(false)
            return
          }
          // the mapping is EXPLICIT: every selected series needs its right partner, none is paired by name or position, none is dropped silently
          const right = panel?.catalog?.sources.find(x => x.catalogId === activeForm.rightSourceCatalogId) ?? null
          const mapped = buildSeriesMapping(series, right, sourceMapping)
          if (!mapped.ok) {
            setValidationError(MAPPING_MESSAGE[mapped.problem])
            setLoading(false)
            return
          }
          sourcePairs = mapped.pairs
        }
        if (activeForm.comparisonMode === 'PERIOD') {
          const body = activeForm.presetId
            ? { artifactCode: artifactId, presetId: activeForm.presetId }
            : {
                artifactCode: artifactId,
                mode: 'PERIOD',
                sourceCatalogIds: sources,
                seriesKeys: series,
                statistics: activeForm.statistics.length > 0 ? activeForm.statistics : null,
                baseline: { startAt: range!.startAt, endAt: range!.endAt },
                comparison: comparisonRange!,
                bucketInterval: interval,
                timezone: zone,
              }
          const result = await tenantApiPost<ProjectedComparison>(
            `/api/v1/reports/${encodeURIComponent(artifactId)}/analysis/compare`,
            body,
          )
          if (getActiveTenantId() === activeTenant) {
            setComparisonData(result)
            setAnalysisData(null)
            setGenericData(null)
            setExportRequest({ comparison: body })
          }
        } else if (activeForm.comparisonMode === 'SOURCE') {
          const body = {
            artifactCode: artifactId,
            mode: 'SOURCE',
            leftSourceCatalogId: sources[0],
            rightSourceCatalogId: activeForm.rightSourceCatalogId,
            statistics: activeForm.statistics.length > 0 ? activeForm.statistics : null,
            period: { startAt: range!.startAt, endAt: range!.endAt },
            seriesMapping: sourcePairs,
            bucketInterval: interval,
            timezone: zone,
          }
          const result = await tenantApiPost<ProjectedComparison>(
            `/api/v1/reports/${encodeURIComponent(artifactId)}/analysis/compare`,
            body,
          )
          if (getActiveTenantId() === activeTenant) {
            setComparisonData(result)
            setAnalysisData(null)
            setGenericData(null)
            setExportRequest({ comparison: body })
          }
        } else {
          // Standard Query
          const body = activeForm.presetId
            ? { artifactCode: artifactId, presetId: activeForm.presetId, mode: 'EXPLICIT' }
            : buildQueryBody(artifactId, selection!, range!, activeForm.statistics, virtualIds)
          const result = await tenantApiPost<ProjectedAnalysis>(
            `/api/v1/reports/${encodeURIComponent(artifactId)}/analysis/query`,
            body,
          )
          setAnalysisData(result)
          setComparisonData(null)
          setGenericData(null)
          setExportRequest({ analysis: body })
        }
      } catch (err) {
        if (requestSeqRef.current === currentSeq && getActiveTenantId() === activeTenant) {
          // Attempt legacy dataset provider fallback if 404
          if (err instanceof ApiError && err.status === 404) {
            try {
              const query = new URLSearchParams()
              if (q) query.set('q', q)
              if (status) query.set('status', status)
              const queryString = query.toString()
              const legacyResult = await tenantApiGet<GenericAnalysisData>(
                `/api/v1/reports/${encodeURIComponent(artifactId)}/data${queryString ? `?${queryString}` : ''}`,
              )
              setGenericData(legacyResult)
              setAnalysisData(null)
              setComparisonData(null)
              return
            } catch (fallbackErr) {
              handleScadaApiError(fallbackErr)
              return
            }
          }
          handleScadaApiError(err)
        }
      } finally {
        if (requestSeqRef.current === currentSeq) {
          setLoading(false)
        }
      }
    },
    [artifactId, form, q, status, panel, virtualIds, sourceMapping],
  )

  // Handle preset selection: the WHOLE preset is fetched and validated against the discovered catalog first; only then is the form
  // changed (source, series, range, interval, statistics, virtual columns, comparison, mapping). A stale / invalid preset changes nothing.
  const handleSelectPreset = async (presetId: string) => {
    setPresetMessage(null)
    if (!presetId) {
      setAppliedPresetId('')
      setSelectedPresetSummary(null)
      return
    }
    const seq = ++presetSeqRef.current
    const tenant = getActiveTenantId()
    try {
      const detail = await tenantApiGet<PresetDetail>(`/api/v1/reports/${encodeURIComponent(artifactId)}/analysis/presets/${encodeURIComponent(presetId)}`)
      if (presetSeqRef.current !== seq || getActiveTenantId() !== tenant) return // another selection / another tenant owns the state now
      const catalog = panel?.catalog
      if (!detail || !detail.preset || !catalog) {
        setPresetMessage('Preset uygulanamadı: kaynak kataloğu yüklenmemiş.')
        return
      }
      const hydrated = hydratePreset(detail, catalog)
      if (!hydrated.ok) {
        setPresetMessage(HYDRATION_MESSAGE[hydrated.problem])
        return
      }
      const h = hydrated.value
      const token = ++hydrationTokenRef.current
      setAppliedPresetId(presetId)
      setSelectedPresetSummary(detail.preset)
      setForm(prev => ({
        ...prev,
        presetId: '',
        bucketInterval: h.selection.interval,
        timezone: detail.preset.timezone,
        statistics: h.statistics,
        comparisonMode: h.comparison.mode,
        comparisonStartAt: h.comparison.comparisonStartWall,
        comparisonEndAt: h.comparison.comparisonEndWall,
        rightSourceCatalogId: h.comparison.rightSourceCatalogId,
      }))
      setSourceMapping(h.comparison.mapping)
      setCatalogHydration({ token, selection: h.selection })
      setVcHydration({ token, sourceId: h.selection.sourceCatalogId, ids: h.virtualIds })
    } catch {
      if (presetSeqRef.current === seq && getActiveTenantId() === tenant) setPresetMessage('Preset detayları yüklenemedi veya preset aktif değil.')
    }
  }

  // "Preset olarak kaydet": the plan is built from the CURRENT form state; an empty / invalid plan is never sent; the server generates id, version and owner
  const handleSavePreset = async (draft: PresetDraft): Promise<string | null> => {
    const catalog = panel?.catalog
    if (!catalog || !panel) return 'Kaynak kataloğu yüklenmemiş.'
    const built = buildPresetRequest(draft, {
      selection: panel.selection,
      catalog,
      statistics: form.statistics,
      virtualIds,
      comparison: { mode: form.comparisonMode, comparisonStartWall: form.comparisonStartAt, comparisonEndWall: form.comparisonEndAt, rightSourceCatalogId: form.rightSourceCatalogId, mapping: sourceMapping },
    })
    if (!built.ok) return built.message
    const tenant = getActiveTenantId()
    try {
      await tenantApiPost(`/api/v1/reports/${encodeURIComponent(artifactId)}/analysis/presets`, built.body)
      if (getActiveTenantId() === tenant) await loadPresets()
      return null
    } catch (err) {
      const code = err instanceof ApiError ? String(err.body?.['code'] ?? '') : ''
      if (code === 'SCADA_SCOPE_DENIED') return 'Tenant ile paylaşmak için yetkiniz yok.'
      if (code === 'SCADA_SOURCE_NOT_CONFIGURED' || (err instanceof ApiError && err.status === 404)) return 'Preset deposu bu ortamda yok.'
      if (code === 'SCADA_AUDIT_FAILED') return 'Audit hatası oluştu; preset kaydedilmedi.'
      return 'Preset kaydedilemedi: plan geçersiz veya kaynak/seri artık mevcut değil.'
    }
  }

  // Initial load and Tenant Change handling
  useEffect(() => {
    void loadPresets()

    function handleTenantChange() {
      // Clear all state to ensure strict tenant isolation & prevent stale state
      requestSeqRef.current++
      presetSeqRef.current++
      setForm(prev => ({ ...prev, presetId: '', comparisonMode: 'NONE', rightSourceCatalogId: '', comparisonStartAt: '', comparisonEndAt: '' }))
      setSourceMapping({})
      setAppliedPresetId('')
      setPresetMessage(null)
      setPresetMeta({ developmentStore: false, canShare: false })
      setCatalogHydration(null)
      setVcHydration(null)
      setSelectedPresetSummary(null)
      setAnalysisData(null)
      setComparisonData(null)
      setGenericData(null)
      setExportRequest(null)
      setError(null)
      setExportError(null)
      setValidationError(null)
      setQ('')
      setStatus('')
      setPanel(null)
      setVirtualIds([])
      void loadPresets()
    }

    window.addEventListener(TENANT_CHANGE_EVENT, handleTenantChange)
    return () => window.removeEventListener(TENANT_CHANGE_EVENT, handleTenantChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifactId])

  // An artifact the SCADA catalog does not serve (discovery closed) keeps the legacy generic dataset view — never a SCADA chart.
  const catalogClosed = panel?.failure === 'CLOSED'
  useEffect(() => {
    if (!catalogClosed) return
    const seq = ++requestSeqRef.current
    const tenant = getActiveTenantId()
    setLoading(true)
    void (async () => {
      try {
        const legacyResult = await tenantApiGet<GenericAnalysisData>(`/api/v1/reports/${encodeURIComponent(artifactId)}/data`)
        if (requestSeqRef.current === seq && getActiveTenantId() === tenant) {
          setGenericData(legacyResult)
          setAnalysisData(null)
          setComparisonData(null)
        }
      } catch (err) {
        if (requestSeqRef.current === seq && getActiveTenantId() === tenant) handleScadaApiError(err)
      } finally {
        if (requestSeqRef.current === seq) setLoading(false)
      }
    })()
  }, [catalogClosed, artifactId])

  // SOURCE comparison: the mapping follows the selected left series; a pair is auto-made ONLY for an identical series key of the right source
  const leftSeriesSignature = (panel?.selection.seriesKeys ?? []).join('\u0000')
  const rightCatalogSource = panel?.catalog?.sources.find(x => x.catalogId === form.rightSourceCatalogId) ?? null
  useEffect(() => {
    if (form.comparisonMode !== 'SOURCE') return
    // additive: an entry of a series that is not (yet) selected is kept (a preset is applied in two steps); only what is selected is ever sent
    setSourceMapping(prev => ({ ...prev, ...autoMapSeries(panel?.selection.seriesKeys ?? [], rightCatalogSource, prev) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.comparisonMode, leftSeriesSignature, rightCatalogSource])

  // the right source can never be the left one
  useEffect(() => {
    if (form.rightSourceCatalogId && form.rightSourceCatalogId === panel?.selection.sourceCatalogId) {
      setForm(prev => ({ ...prev, rightSourceCatalogId: '' }))
      setSourceMapping({})
    }
  }, [form.rightSourceCatalogId, panel?.selection.sourceCatalogId])

  // Dev Fixture Simulation Badge check
  const isDevFixture =
    analysisData?.artifactCode === DEV_FIXTURE_ARTIFACT_CODE ||
    comparisonData?.artifactCode === DEV_FIXTURE_ARTIFACT_CODE ||
    genericData?.artifact.code === DEV_FIXTURE_ARTIFACT_CODE ||
    artifactId === DEV_FIXTURE_ARTIFACT_CODE

  // Helper downloads
  function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  // Export handlers
  const isScadaResult = Boolean(analysisData || comparisonData)

  async function handleScadaExport(format: ScadaExportFormat) {
    const guard = format === 'CSV' ? csvGuardRef : format === 'PNG' ? pngGuardRef : format === 'PDF' ? pdfGuardRef : xlsxGuardRef
    const setExporting = format === 'CSV' ? setExportingCsv : format === 'PNG' ? setExportingPng : format === 'PDF' ? setExportingPdf : setExportingXlsx
    // nothing is requested without a shown, non-empty result (an empty chart / table is never downloaded as a success)
    if (!exportRequest || !hasExportableData(analysisData, comparisonData)) {
      setExportError('Dışa aktarılacak veri yok.')
      return
    }
    const svg = format === 'PNG' ? chartWrapperRef.current?.querySelector('svg') : null
    if (format === 'PNG' && !svg) {
      setExportError('Dışa aktarılacak grafik yok.')
      return
    }
    await guard.current.tryRunAsync(async () => {
      setExporting(true)
      setExportError(null)
      try {
        if (format === 'PNG') {
          const caption = await fetchScadaPngCaption(artifactId, exportRequest)
          const rect = svg!.getBoundingClientRect()
          let blob: Blob
          try {
            blob = await renderSvgToPngBlob(svg!, {
              captionLines: caption.captionLines,
              width: Math.max(1, Math.round(rect.width) || 800),
              height: Math.max(1, Math.round(rect.height) || 360),
            })
          } catch (renderErr) {
            await completeScadaPngExport(artifactId, caption.exportId, 'FAILED').catch(() => undefined) // best effort: the failure is recorded, never a success
            throw renderErr
          }
          // the success audit is written by the server only now that the bytes exist; if it cannot be recorded the file is NOT delivered
          await completeScadaPngExport(artifactId, caption.exportId, 'SUCCEEDED')
          downloadBlob(blob, caption.fileName)
        } else {
          const result = await downloadScadaFile(artifactId, format, exportRequest)
          downloadBlob(result.blob, result.fileName)
        }
      } catch (err) {
        setExportError(scadaExportErrorMessage(err, format))
      } finally {
        setExporting(false)
      }
    })
  }

  function handleExportCsv() {
    if (isScadaResult) {
      void handleScadaExport('CSV')
      return
    }
    if (!genericData || genericData.rows.length === 0) return
    csvGuardRef.current.tryRun(() => {
      setExportingCsv(true)
      setExportError(null)
      try {
        const csv = buildCsv(genericData.rows)
        downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), buildCsvFileName(genericData.artifact.code))
      } catch {
        setExportError('CSV oluşturulurken bir sorun oluştu.')
      } finally {
        setExportingCsv(false)
      }
    })
  }

  async function handleExportPng() {
    if (isScadaResult) {
      await handleScadaExport('PNG')
      return
    }
    const svg = chartWrapperRef.current?.querySelector('svg')
    if (!svg) return
    await pngGuardRef.current.tryRunAsync(async () => {
      setExportingPng(true)
      setExportError(null)
      try {
        const rect = svg.getBoundingClientRect()
        const title = genericData?.artifact.title ?? artifactId
        const captionLines = buildPngCaptionLines({ title, q, status, isDevFixture })
        const blob = await renderSvgToPngBlob(svg, {
          captionLines,
          width: Math.max(1, Math.round(rect.width) || 800),
          height: Math.max(1, Math.round(rect.height) || 360),
        })
        downloadBlob(blob, buildPngFileName(title))
      } catch {
        setExportError('PNG oluşturulurken bir sorun oluştu.')
      } finally {
        setExportingPng(false)
      }
    })
  }

  async function handleExportFile(format: 'PDF' | 'XLSX') {
    if (isScadaResult) {
      await handleScadaExport(format)
      return
    }
    const guard = format === 'PDF' ? pdfGuardRef : xlsxGuardRef
    const setExporting = format === 'PDF' ? setExportingPdf : setExportingXlsx
    await guard.current.tryRunAsync(async () => {
      setExporting(true)
      setExportError(null)
      try {
        const query = new URLSearchParams()
        if (q) query.set('q', q)
        if (status) query.set('status', status)
        const queryString = query.toString()
        const result = await tenantApiDownload(
          `/api/v1/reports/${encodeURIComponent(artifactId)}/export/${format}${queryString ? `?${queryString}` : ''}`,
        )
        downloadBlob(result.blob, result.fileName)
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setExportError('Bu export işlemi için yetkiniz yok.')
        } else if (err instanceof ApiError && err.status === 404) {
          setExportError("Rapor artifact'ı bulunamadı.")
        } else if (err instanceof ApiError && (err.status === 502 || err.status >= 500)) {
          setExportError(`${format} oluşturulurken sunucu tarafında bir sorun oluştu. Lütfen daha sonra tekrar deneyin.`)
        } else {
          setExportError(`${format} oluşturulamadı. Lütfen tekrar deneyin.`)
        }
      } finally {
        setExporting(false)
      }
    })
  }

  // The development label exists only while the catalog itself says so (fixture on) — never on a closed / production catalog
  const devLabel = panel?.catalog?.developmentLabel ?? null
  const panelBounds = panel?.source ? wallBounds(panel.source) : null

  // Transformed Chart Data
  const analysisChart = analysisData ? transformAnalysisToChartData(analysisData) : null
  const comparisonChart = comparisonData ? transformComparisonToChartData(comparisonData) : null
  const genericDailyTotals = genericData ? buildDailyTotals(genericData.rows) : []

  // Check if any analysis is allowed
  const hasAllowedAnalysis = analysisData ? analysisData.series.some(s => s.analysisAllowed) : true

  return (
    <div className="space-y-5">
      <PageIntro
        eyebrow="Reports"
        title={genericData?.artifact.title ?? `SCADA Analizi (${artifactId})`}
        description="Zaman serisi analizi, çoklu seri karşılaştırmaları, kalite durumu kontrolü ve istatistik özeti."
        density="compact"
        actions={
          devLabel ? <Badge tone="warning">{devLabel}</Badge> : isDevFixture ? <Badge tone="warning">Geliştirme simülasyon verisi</Badge> : undefined
        }
      />

      {/* Filter and Analysis Form */}
      <section className="app-card-dense space-y-4 p-4">
        <SectionHeader title="SCADA Analiz ve Filtre Formu" density="compact" />

        <ScadaPresetPanel
          presets={presets}
          developmentStore={presetMeta.developmentStore}
          canShare={presetMeta.canShare}
          appliedPresetId={appliedPresetId}
          message={presetMessage}
          locked={loading}
          onSelect={id => void handleSelectPreset(id)}
          onSave={handleSavePreset}
        />

        <ScadaCatalogPanel artifactId={artifactId} locked={loading} onChange={setPanel} hydrate={catalogHydration} />
        <ScadaVirtualColumnPanel artifactId={artifactId} catalog={panel?.catalog ?? null} selectedSourceId={panel?.selection.sourceCatalogId ?? ''} locked={loading} onUseChange={setVirtualIds} hydrate={vcHydration} />

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Karşılaştırma Modu</span>
            <select
              className="app-input-dense"
              aria-label="Karşılaştırma Modu"
              disabled={loading || !panel?.catalog}
              value={form.comparisonMode}
              onChange={e => {
                // a new mode starts clean: an old period, right source or mapping is never carried over
                const mode = e.target.value as 'NONE' | 'PERIOD' | 'SOURCE'
                setForm(prev => ({ ...prev, comparisonMode: mode, comparisonStartAt: '', comparisonEndAt: '', rightSourceCatalogId: '' }))
                setSourceMapping({})
              }}
            >
              <option value="NONE">Tek Dönem (Karşılaştırma Yok)</option>
              <option value="PERIOD">Dönem Karşılaştırması (PERIOD)</option>
              <option value="SOURCE">Kaynak Karşılaştırması (SOURCE)</option>
            </select>
          </label>
        </div>

        {/* Dynamic Comparison Mode Fields */}
        {form.comparisonMode === 'PERIOD' ? (
          <div className="rounded-md border border-surface-border bg-surface p-3 space-y-2">
            <span className="text-xs font-bold text-ink">Karşılaştırılacak Dönem Parametreleri</span>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Karşılaştırma Başlangıcı</span>
                <input
                  type="datetime-local"
                  className="app-input-dense"
                  min={panelBounds?.min}
                  max={panelBounds?.max}
                  disabled={loading}
                  value={form.comparisonStartAt}
                  onChange={e => setForm(prev => ({ ...prev, comparisonStartAt: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Karşılaştırma Bitişi</span>
                <input
                  type="datetime-local"
                  className="app-input-dense"
                  min={panelBounds?.min}
                  max={panelBounds?.max}
                  disabled={loading}
                  value={form.comparisonEndAt}
                  onChange={e => setForm(prev => ({ ...prev, comparisonEndAt: e.target.value }))}
                />
              </label>
            </div>
          </div>
        ) : form.comparisonMode === 'SOURCE' ? (
          <div className="rounded-md border border-surface-border bg-surface p-3 space-y-2">
            <span className="text-xs font-bold text-ink">Karşılaştırılacak İkinci Kaynak</span>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Karşılaştırma Kaynağı</span>
              <select
                className="app-input-dense"
                aria-label="Karşılaştırma Kaynağı"
                disabled={loading}
                value={form.rightSourceCatalogId}
                onChange={e => {
                  setForm(prev => ({ ...prev, rightSourceCatalogId: e.target.value }))
                  setSourceMapping({})
                }}
              >
                <option value="">-- Kaynak seçin --</option>
                {(panel?.catalog?.sources ?? [])
                  .filter(src => src.selectable && src.catalogId !== panel?.selection.sourceCatalogId)
                  .map(src => (
                    <option key={src.catalogId} value={src.catalogId}>
                      {src.name}
                    </option>
                  ))}
              </select>
            </label>
            <ScadaSourceMappingPanel
              left={panel?.source ?? null}
              right={rightCatalogSource}
              leftSeriesKeys={panel?.selection.seriesKeys ?? []}
              mapping={sourceMapping}
              locked={loading}
              onChange={setSourceMapping}
            />
          </div>
        ) : null}

        {/* Statistics Selection Checkboxes */}
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Hesaplanacak İstatistikler</span>
          <div className="flex flex-wrap gap-3 pt-1">
            {ALL_STATISTICS.map(stat => {
              const checked = form.statistics.includes(stat)
              return (
                <label key={stat} className="flex items-center gap-1.5 text-xs text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => {
                      if (e.target.checked) {
                        setForm(prev => ({ ...prev, statistics: [...prev.statistics, stat] }))
                      } else {
                        setForm(prev => ({ ...prev, statistics: prev.statistics.filter(s => s !== stat) }))
                      }
                    }}
                  />
                  <span>{stat}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            className="app-button-primary-dense px-6 py-2"
            onClick={() => void runScadaAnalysis()}
            disabled={loading || !(form.presetId || panel?.catalog)}
          >
            {loading ? 'Analiz Yapılıyor...' : 'Analiz Çalıştır'}
          </button>
        </div>
      </section>

      {/* Validation or API error display without leaking raw exception */}
      {validationError ? (
        <div className="rounded-md border border-status-danger bg-status-danger_bg px-3 py-2 text-sm text-status-danger">
          {validationError}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-status-danger bg-status-danger_bg px-3 py-2 text-sm text-status-danger font-medium">
          {error}
        </div>
      ) : null}

      {exportError ? (
        <div className="rounded-md border border-status-danger bg-status-danger_bg px-3 py-2 text-sm text-status-danger">
          {exportError}
        </div>
      ) : null}

      {/* Loading & Empty States */}
      {loading ? (
        <EmptyState title="Yükleniyor" description="SCADA verileri getiriliyor ve analiz ediliyor..." />
      ) : notFound ? (
        <EmptyState
          title="Veri kaynağı yapılandırılmamış"
          description="Bu rapor artifact'ı veya SCADA veri kaynağı tanımlı değil. Uygun bir provider bağlandığında veri gösterilecektir."
        />
      ) : !analysisData && !comparisonData && !genericData ? (
        <EmptyState
          title="Analiz bekleniyor"
          description={panel?.failure ? 'Kaynak kataloğu olmadan analiz çalıştırılamaz.' : 'Kaynak, seri ve tarih aralığı seçip Analiz Çalıştır düğmesine basın.'}
        />
      ) : analysisData && analysisData.status === 'BLOCKED' ? (
        <div className="rounded-md border border-status-warning bg-status-warning_bg p-4 text-status-warning space-y-1">
          <h4 className="font-bold text-sm">Analiz verisi üretilemedi</h4>
          <p className="text-xs">Seçili kaynak ve tarih aralığında analiz edilebilir veri yok ({analysisData.code ?? 'NO_VALID_DATA'}).</p>
        </div>
      ) : analysisData && !hasAllowedAnalysis ? (
        <div className="rounded-md border border-status-warning bg-status-warning_bg p-4 text-status-warning space-y-1">
          <h4 className="font-bold text-sm">Analiz Bloklandı (analysisAllowed=false)</h4>
          <p className="text-xs">
            Seçili zaman serilerinin veya aralığın veri kalitesi analiz yapılmasına izin vermiyor.
          </p>
        </div>
      ) : analysisData && analysisData.series.length === 0 ? (
        <EmptyState title="Sonuç yok" description="Seçili parametreler ile eşleşen veri serisi bulunamadı." />
      ) : comparisonData && comparisonData.rows.length === 0 ? (
        <EmptyState title="Sonuç yok" description="Karşılaştırılacak veri satırı bulunamadı." />
      ) : genericData && genericData.rows.length === 0 ? (
        <EmptyState title="Sonuç yok" description="Seçili filtrelerle eşleşen kayıt bulunamadı." />
      ) : (
        <>
          {/* Section 5: Statistics Cards (TASK-027.68 output) */}
          {analysisData ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <SectionHeader title={devLabel ? `İstatistik Özet Kartları — ${devLabel}` : 'İstatistik Özet Kartları'} density="compact" />
                {analysisData.status === 'PARTIAL' ? (
                  <Badge tone="warning">Kısmi sonuç</Badge>
                ) : (
                  <Badge tone="info">Tam Sonuç ({analysisData.status})</Badge>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                {analysisData.series.map(s => {
                  const stats = s.statistics
                  return (
                    <div key={s.seriesKey} className="app-card-dense p-3 space-y-1.5 border border-surface-border">
                      <div className="flex items-center justify-between border-b border-surface-border pb-1">
                        <span className="text-xs font-bold text-ink" style={{ color: getSeriesColor(s.seriesKey) }}>
                          {s.label || s.seriesKey}
                          {s.virtual ? ' (sanal)' : ''}
                        </span>
                        <span className="text-[10px] text-ink-subtle">{s.unit}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-[11px]">
                        <div>SUM: <strong className="text-ink">{formatValue(stats.sum as number)}</strong></div>
                        <div>AVG: <strong className="text-ink">{formatValue(stats.average as number)}</strong></div>
                        <div>MIN: <strong className="text-ink">{formatValue(stats.min as number)}</strong></div>
                        <div>MAX: <strong className="text-ink">{formatValue(stats.max as number)}</strong></div>
                        <div>Geçerli: <strong className="text-status-success">{stats.validCount ?? '—'}</strong></div>
                        <div>Eksik: <strong className="text-status-warning">{stats.missingCount ?? '—'}</strong></div>
                        <div>Geçersiz: <strong className="text-status-danger">{stats.invalidCount ?? '—'}</strong></div>
                        <div>Eksik Kova: <strong className="text-ink-muted">{stats.incompleteCount ?? '—'}</strong></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : genericData ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Kayıt Sayısı" value={genericData.rows.length.toLocaleString('tr-TR')} density="compact" />
              <StatCard label="Toplam Tutar" value={genericData.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} density="compact" tone="accent" />
              <StatCard label="Gün Aralığı" value={genericDailyTotals.length.toLocaleString('tr-TR')} density="compact" />
            </div>
          ) : null}

          {/* Section 3 & 7: Chart View (Recharts) */}
          <section className="app-card p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <SectionHeader
                title={
                  comparisonData
                    ? `SCADA Karşılaştırma Grafiği (${comparisonData.mode})${devLabel ? ` — ${devLabel}` : ''}`
                    : `SCADA Zaman Serisi Grafiği${devLabel ? ` — ${devLabel}` : ''}`
                }
                density="compact"
              />
              <div className="flex shrink-0 gap-2">
                {!isScadaResult || canExportFile ? (
                  <button
                    type="button"
                    className="app-button-outline-dense px-3"
                    onClick={() => void handleExportPng()}
                    disabled={exportingPng}
                  >
                    {exportingPng ? 'PNG oluşturuluyor...' : 'PNG indir'}
                  </button>
                ) : null}
                {!isScadaResult || canExportFile ? (
                  <button
                    type="button"
                    className="app-button-outline-dense px-3"
                    onClick={handleExportCsv}
                    disabled={exportingCsv}
                  >
                    {exportingCsv ? 'CSV oluşturuluyor...' : 'CSV indir'}
                  </button>
                ) : null}
                {canExportFile ? (
                  <button
                    type="button"
                    className="app-button-outline-dense px-3"
                    onClick={() => void handleExportFile('PDF')}
                    disabled={exportingPdf}
                  >
                    {exportingPdf ? 'PDF oluşturuluyor...' : 'PDF indir'}
                  </button>
                ) : null}
                {canExportFile ? (
                  <button
                    type="button"
                    className="app-button-outline-dense px-3"
                    onClick={() => void handleExportFile('XLSX')}
                    disabled={exportingXlsx}
                  >
                    {exportingXlsx ? 'XLSX oluşturuluyor...' : 'XLSX indir'}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="h-72 w-full overflow-x-auto" ref={chartWrapperRef}>
              <ResponsiveContainer width="100%" height="100%">
                {analysisChart ? (
                  <LineChart data={analysisChart.chartRows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="timeKey" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={64} />
                    <Tooltip
                      formatter={(val: unknown, name: unknown, item: unknown) => {
                        const meta = (item as { payload?: Record<string, unknown> })?.payload?.[`_meta_${String(name)}`] as
                          | { quality?: string; qualityFlags?: string[]; isComplete?: boolean }
                          | undefined
                        const formattedVal = formatValue(Number(val))
                        const flags = meta?.qualityFlags?.length ? ` [${meta.qualityFlags.join(', ')}]` : ''
                        return [`${formattedVal}${flags}`, String(name)]
                      }}
                      labelFormatter={label => `Zaman: ${label}`}
                    />
                    {analysisChart.seriesKeys.map(key => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={analysisChart.seriesMeta[key]?.label || key}
                        stroke={analysisChart.seriesMeta[key]?.color || '#2563eb'}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls={false} // Crucial requirement: null values MUST NOT be drawn as 0
                      />
                    ))}
                  </LineChart>
                ) : comparisonChart ? (
                  <LineChart data={comparisonChart.chartRows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="timeKey" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={64} />
                    <Tooltip />
                    {comparisonChart.seriesLabels.map(label => (
                      <Line
                        key={`baseline_${label}`}
                        type="monotone"
                        dataKey={`baseline_${label}`}
                        name={`Baseline (${label})`}
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls={false}
                      />
                    ))}
                    {comparisonChart.seriesLabels.map(label => (
                      <Line
                        key={`comparison_${label}`}
                        type="monotone"
                        dataKey={`comparison_${label}`}
                        name={`Karşılaştırma (${label})`}
                        stroke="#d97706"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={{ r: 3 }}
                        connectNulls={false}
                      />
                    ))}
                  </LineChart>
                ) : (
                  <LineChart data={genericDailyTotals} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={64} />
                    <Tooltip
                      formatter={(value: unknown) => Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      labelFormatter={label => `Tarih: ${label}`}
                    />
                    <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name="Toplam Tutar" />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </section>

          {/* Section 4: Table View */}
          <section className="app-card p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-left text-[11px] uppercase tracking-wider text-ink-subtle">
                    {analysisData ? (
                      <>
                        <th className="px-4 py-2.5">Seri</th>
                        <th className="px-4 py-2.5">Zaman Kovası</th>
                        <th className="px-4 py-2.5 text-right">Değer</th>
                        <th className="px-4 py-2.5">Birim</th>
                        <th className="px-4 py-2.5">Kalite</th>
                        <th className="px-4 py-2.5">Kalite Bayrakları</th>
                        <th className="px-4 py-2.5">Tamamlanma</th>
                        <th className="px-4 py-2.5">Kaynak ID</th>
                      </>
                    ) : comparisonData ? (
                      <>
                        <th className="px-4 py-2.5">Seri</th>
                        <th className="px-4 py-2.5">Baseline Zaman</th>
                        <th className="px-4 py-2.5">Karşılaştırma Zaman</th>
                        <th className="px-4 py-2.5 text-right">Baseline</th>
                        <th className="px-4 py-2.5 text-right">Karşılaştırma</th>
                        <th className="px-4 py-2.5 text-right">Mutlak Fark</th>
                        <th className="px-4 py-2.5 text-right">Yüzde Fark</th>
                        <th className="px-4 py-2.5">Kalite</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-2.5">No</th>
                        <th className="px-4 py-2.5">Definition</th>
                        <th className="px-4 py-2.5">Tarih</th>
                        <th className="px-4 py-2.5">Durum</th>
                        <th className="px-4 py-2.5 text-right">Miktar</th>
                        <th className="px-4 py-2.5 text-right">Toplam</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {analysisData ? (
                    analysisData.series.flatMap(s =>
                      s.points.map((p, idx) => (
                        <tr key={`${s.seriesKey}-${idx}`} className="border-b border-surface-border last:border-0">
                          <td className="px-4 py-2.5 font-medium text-ink" style={{ color: getSeriesColor(s.seriesKey) }}>
                            {s.label || s.seriesKey}
                            {s.virtual ? <span className="ml-1 text-[10px] font-normal text-ink-subtle">(sanal)</span> : null}
                          </td>
                          <td className="px-4 py-2.5 text-ink-muted">{p.localWallTime || p.t || '—'}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-ink">
                            {formatValue(p.value)}
                          </td>
                          <td className="px-4 py-2.5 text-ink-subtle">{s.unit || '—'}</td>
                          <td className="px-4 py-2.5">
                            <Badge tone={p.quality === 'VALID' ? 'info' : p.quality === 'MISSING' ? 'warning' : 'danger'}>
                              {p.quality}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-ink-muted">
                            {p.qualityFlags.length > 0 ? p.qualityFlags.join(', ') : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-ink-muted">
                            {p.isComplete ? 'Tamamlandı' : 'Eksik Kova'}
                          </td>
                          <td className="px-4 py-2.5 text-ink-muted">{s.sourceCatalogId || '—'}</td>
                        </tr>
                      )),
                    )
                  ) : comparisonData ? (
                    comparisonData.rows.map((r, idx) => (
                      <tr key={`comp-${idx}`} className="border-b border-surface-border last:border-0">
                        <td className="px-4 py-2.5 font-medium text-ink">{r.seriesLabel}</td>
                        <td className="px-4 py-2.5 text-ink-muted">{r.t || '—'}</td>
                        <td className="px-4 py-2.5 text-ink-muted">{r.comparisonT || '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatValue(r.baseline)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatValue(r.comparison)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatValue(r.absoluteDelta)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatPercentageDelta(r.percentageDelta, r.baseline)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={r.status === 'OK' ? 'info' : 'warning'}>{r.status}</Badge>
                        </td>
                      </tr>
                    ))
                  ) : genericData ? (
                    genericData.rows.map(row => (
                      <tr key={row.no} className="border-b border-surface-border last:border-0">
                        <td className="px-4 py-2.5 text-ink-muted">{row.no}</td>
                        <td className="px-4 py-2.5">{row.label}</td>
                        <td className="px-4 py-2.5 text-ink-muted">{new Date(row.occurredAt).toLocaleDateString('tr-TR')}</td>
                        <td className="px-4 py-2.5">{STATUS_LABEL[row.status] ?? row.status}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{row.quantity.toLocaleString('tr-TR')}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{row.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
