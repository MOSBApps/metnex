'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, EmptyState, PageIntro, SectionHeader, StatCard } from '@/components/platform-admin-ui'
import { useTenantPermissions } from '@/contexts/tenant-permission-context'
import { ApiError, tenantApiDownload, tenantApiGet } from '@/lib/api'
import { TENANT_CHANGE_EVENT } from '@/lib/tenant-context'
import { type AnalysisRow, buildDailyTotals, buildStatusBreakdown } from './chart-data'
import { buildCsv, buildCsvFileName, buildPngFileName } from './csv-export'
import { createExportGuard } from './export-guard'
import { buildPngCaptionLines, renderSvgToPngBlob } from './png-export'

interface AnalysisData {
  artifact: { code: string; title: string }
  rows: AnalysisRow[]
  totalAmount: number
}

/** Must match apps/api/src/reporting/dataset/dev-fixture-dataset.provider.ts's
 * DEV_FIXTURE_ARTIFACT_CODE — no shared types package between apps/api and apps/web in this repo,
 * same convention as STATUS_LABEL below mirroring the backend's status enum values. */
const DEV_FIXTURE_ARTIFACT_CODE = 'DEV_REPORTING_FIXTURE'

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Tamamlandı',
  PENDING: 'Beklemede',
  FAILED: 'Başarısız',
}

/** Mirrors docs/ui-contract/foundations/colors.md's status token hex values — Recharts marks
 * are SVG attributes, not Tailwind classes, so the token's literal color is used directly. */
const STATUS_COLOR: Record<string, string> = {
  COMPLETED: '#16a34a',
  PENDING: '#d97706',
  FAILED: '#dc2626',
}

type SortKey = 'occurredAt' | 'amount'

export function ReportAnalysisClient({ artifactId }: { artifactId: string }) {
  // TASK-027.57 — UX only: hides PDF/XLSX ("gerçek" export, backend REPORT:ARTIFACT:EXPORT-gated)
  // when the user visibly lacks the permission, matching this app's existing nav-config convention
  // for permission-based visibility. This is never the authorization boundary — PermissionGuard is
  // — a user with a forged/stale client state still gets a real 403 with a safe message (below).
  const { can: canPerform } = useTenantPermissions()
  const canExportFile = canPerform('REPORT:ARTIFACT:EXPORT')

  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [data, setData] = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('occurredAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const pageSize = 10

  const [exportingCsv, setExportingCsv] = useState(false)
  const [exportingPng, setExportingPng] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingXlsx, setExportingXlsx] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  // CSV work is synchronous — a 400ms cooldown is what makes its guard double-click-safe (see
  // export-guard.ts's own doc comment). PNG/PDF/XLSX work is async — each lock already spans the
  // whole operation, so no cooldown is needed for them.
  const csvGuardRef = useRef(createExportGuard(400))
  const pngGuardRef = useRef(createExportGuard())
  const pdfGuardRef = useRef(createExportGuard())
  const xlsxGuardRef = useRef(createExportGuard())
  const chartWrapperRef = useRef<HTMLDivElement>(null)

  const load = useCallback(
    async (filters: { q: string; status: string }) => {
      setLoading(true)
      setError(null)
      setExportError(null)
      setNotFound(false)
      setData(null)
      setPage(0)
      try {
        const query = new URLSearchParams()
        if (filters.q) query.set('q', filters.q)
        if (filters.status) query.set('status', filters.status)
        const queryString = query.toString()
        const result = await tenantApiGet<AnalysisData>(
          `/api/v1/reports/${artifactId}/data${queryString ? `?${queryString}` : ''}`,
        )
        setData(result)
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true)
        } else if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setError('Bu rapora erişim yetkiniz yok.')
        } else if (err instanceof ApiError && err.status >= 500) {
          setError('Rapor sunucusunda bir sorun oluştu. Lütfen daha sonra tekrar deneyin.')
        } else {
          setError('Rapor verisi yüklenemedi. Lütfen tekrar deneyin.')
        }
      } finally {
        setLoading(false)
      }
    },
    [artifactId],
  )

  useEffect(() => {
    void load({ q: '', status: '' })
    function handleTenantChange() {
      setQ('')
      setStatus('')
      void load({ q: '', status: '' })
    }
    window.addEventListener(TENANT_CHANGE_EVENT, handleTenantChange)
    return () => window.removeEventListener(TENANT_CHANGE_EVENT, handleTenantChange)
  }, [load])

  const rows = data?.rows ?? []
  const dailyTotals = buildDailyTotals(rows)
  const statusBreakdown = buildStatusBreakdown(rows)

  const sortedRows = [...rows].sort((a, b) => {
    const cmp = sortKey === 'amount' ? a.amount - b.amount : new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
    return sortDir === 'asc' ? cmp : -cmp
  })
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const pageRows = sortedRows.slice(page * pageSize, page * pageSize + pageSize)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(dir => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
    setPage(0)
  }

  const isDevFixture = data?.artifact.code === DEV_FIXTURE_ARTIFACT_CODE

  function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function handleExportCsv() {
    if (!data || sortedRows.length === 0) return
    csvGuardRef.current.tryRun(() => {
      setExportingCsv(true)
      setExportError(null)
      try {
        const csv = buildCsv(sortedRows)
        downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), buildCsvFileName(data.artifact.code))
      } catch {
        setExportError('CSV oluşturulurken bir sorun oluştu.')
      } finally {
        setExportingCsv(false)
      }
    })
  }

  async function handleExportPng() {
    if (!data || dailyTotals.length === 0) return
    const svg = chartWrapperRef.current?.querySelector('svg')
    if (!svg) return
    await pngGuardRef.current.tryRunAsync(async () => {
      setExportingPng(true)
      setExportError(null)
      try {
        const rect = svg.getBoundingClientRect()
        const captionLines = buildPngCaptionLines({ title: data.artifact.title, q, status, isDevFixture })
        const blob = await renderSvgToPngBlob(svg, {
          captionLines,
          width: Math.max(1, Math.round(rect.width) || 800),
          height: Math.max(1, Math.round(rect.height) || 360),
        })
        downloadBlob(blob, buildPngFileName(data.artifact.code))
      } catch {
        setExportError('PNG oluşturulurken bir sorun oluştu.')
      } finally {
        setExportingPng(false)
      }
    })
  }

  /**
   * TASK-027.56 — PDF/XLSX reuse the existing `GET /reports/:code/export/:format` endpoint
   * (`REPORT:ARTIFACT:EXPORT`, Jasper-configured or the safe in-process fallback — both server
   * side, unchanged here). Unlike CSV/PNG (generated client-side from already-fetched rows), the
   * file itself and its Content-Disposition filename come from the backend — this only forwards
   * the active q/status filters and downloads whatever comes back.
   */
  async function handleExportFile(format: 'PDF' | 'XLSX') {
    if (!data || rows.length === 0) return
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
          `/api/v1/reports/${encodeURIComponent(data.artifact.code)}/export/${format}${queryString ? `?${queryString}` : ''}`,
        )
        downloadBlob(result.blob, result.fileName)
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setExportError('Bu export işlemi için yetkiniz yok.')
        } else if (err instanceof ApiError && err.status === 404) {
          setExportError('Rapor artifact\'ı bulunamadı.')
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

  return (
    <div className="space-y-5">
      <PageIntro
        eyebrow="Reports"
        title={data?.artifact.title ?? 'Analiz'}
        description="Filtrelenebilir zaman serisi grafiği ve tablo görünümü ile işlem analizi."
        density="compact"
        actions={isDevFixture ? <Badge tone="warning">Geliştirme simülasyon verisi</Badge> : undefined}
      />

      <section className="app-card-dense space-y-3 p-3">
        <SectionHeader title="Filtreler" density="compact" />
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_auto]">
          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Arama</span>
            <input className="app-input-dense" value={q} onChange={event => setQ(event.target.value)} placeholder="Ara..." />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Durum</span>
            <select className="app-input-dense" value={status} onChange={event => setStatus(event.target.value)}>
              <option value="">Tümü</option>
              <option value="COMPLETED">Tamamlandı</option>
              <option value="PENDING">Beklemede</option>
              <option value="FAILED">Başarısız</option>
            </select>
          </label>
          <button
            type="button"
            className="app-button-primary-dense self-end px-4"
            onClick={() => void load({ q, status })}
            disabled={loading}
          >
            {loading ? 'Yükleniyor...' : 'Uygula'}
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-status-danger bg-status-danger_bg px-3 py-2 text-sm text-status-danger">{error}</div>
      ) : null}
      {exportError ? (
        <div className="rounded-md border border-status-danger bg-status-danger_bg px-3 py-2 text-sm text-status-danger">{exportError}</div>
      ) : null}

      {loading ? (
        <EmptyState title="Yükleniyor" description="Rapor verisi getiriliyor..." />
      ) : notFound ? (
        <EmptyState
          title="Veri kaynağı yapılandırılmamış"
          description="Bu rapor artifact'ı tanımlı değil veya bu artifact için henüz bir veri kaynağı (dataset provider) kayıtlı değil. Bir domain modülü kendi ReportDatasetProvider'ını kaydettiğinde bu ekran veri gösterecektir."
        />
      ) : !data ? null : rows.length === 0 ? (
        <EmptyState title="Sonuç yok" description="Seçili filtrelerle eşleşen kayıt bulunamadı." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Kayıt Sayısı" value={rows.length.toLocaleString('tr-TR')} density="compact" />
            <StatCard label="Toplam Tutar" value={data.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} density="compact" tone="accent" />
            <StatCard label="Gün Aralığı" value={dailyTotals.length.toLocaleString('tr-TR')} density="compact" />
          </div>

          <section className="app-card p-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <SectionHeader title="Zaman Serisi — Günlük Toplam Tutar" density="compact" />
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="app-button-outline-dense px-3"
                  onClick={() => void handleExportPng()}
                  disabled={exportingPng || dailyTotals.length === 0}
                >
                  {exportingPng ? 'PNG oluşturuluyor...' : 'PNG indir'}
                </button>
                <button
                  type="button"
                  className="app-button-outline-dense px-3"
                  onClick={handleExportCsv}
                  disabled={exportingCsv || sortedRows.length === 0}
                >
                  {exportingCsv ? 'CSV oluşturuluyor...' : 'CSV indir'}
                </button>
                {canExportFile ? (
                  <button
                    type="button"
                    className="app-button-outline-dense px-3"
                    onClick={() => void handleExportFile('PDF')}
                    disabled={exportingPdf || rows.length === 0}
                  >
                    {exportingPdf ? 'PDF oluşturuluyor...' : 'PDF indir'}
                  </button>
                ) : null}
                {canExportFile ? (
                  <button
                    type="button"
                    className="app-button-outline-dense px-3"
                    onClick={() => void handleExportFile('XLSX')}
                    disabled={exportingXlsx || rows.length === 0}
                  >
                    {exportingXlsx ? 'XLSX oluşturuluyor...' : 'XLSX indir'}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="h-64 w-full" ref={chartWrapperRef}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyTotals} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={64} />
                  <Tooltip
                    formatter={(value: unknown) => Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    labelFormatter={label => `Tarih: ${label}`}
                  />
                  <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name="Toplam Tutar" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="app-card p-5">
            <SectionHeader title="Durum Dağılımı" density="compact" />
            <div className="flex flex-wrap gap-4">
              {statusBreakdown.map(item => (
                <div key={item.status} className="flex items-center gap-2 text-sm text-ink">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: STATUS_COLOR[item.status] ?? '#475569' }}
                    aria-hidden
                  />
                  <span>
                    {STATUS_LABEL[item.status] ?? item.status}: <strong>{item.count.toLocaleString('tr-TR')}</strong>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="app-card p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-left text-[11px] uppercase tracking-wider text-ink-subtle">
                    <th className="px-4 py-2.5">No</th>
                    <th className="px-4 py-2.5">Definition</th>
                    <th className="px-4 py-2.5">
                      <button type="button" className="flex items-center gap-1" onClick={() => toggleSort('occurredAt')}>
                        Tarih {sortKey === 'occurredAt' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th className="px-4 py-2.5">Durum</th>
                    <th className="px-4 py-2.5 text-right">Miktar</th>
                    <th className="px-4 py-2.5 text-right">
                      <button type="button" className="flex w-full items-center justify-end gap-1" onClick={() => toggleSort('amount')}>
                        Toplam {sortKey === 'amount' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(row => (
                    <tr key={row.no} className="border-b border-surface-border last:border-0">
                      <td className="px-4 py-2.5 text-ink-muted">{row.no}</td>
                      <td className="px-4 py-2.5">{row.label}</td>
                      <td className="px-4 py-2.5 text-ink-muted">{new Date(row.occurredAt).toLocaleDateString('tr-TR')}</td>
                      <td className="px-4 py-2.5">{STATUS_LABEL[row.status] ?? row.status}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.quantity.toLocaleString('tr-TR')}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 ? (
              <div className="flex items-center justify-between border-t border-surface-border px-4 py-2.5 text-xs text-ink-muted">
                <span>
                  Sayfa {page + 1} / {pageCount}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="app-button-outline-dense px-3"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    Önceki
                  </button>
                  <button
                    type="button"
                    className="app-button-outline-dense px-3"
                    onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                    disabled={page >= pageCount - 1}
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}
