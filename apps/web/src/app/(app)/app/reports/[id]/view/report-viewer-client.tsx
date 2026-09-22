'use client'

import { useState } from 'react'
import { PageIntro, SectionHeader } from '@/components/platform-admin-ui'
import { ApiError, tenantApiDownload, tenantApiGet } from '@/lib/api'

interface RenderedReport {
  artifact: {
    code: string
    title: string
    viewMode: string
    defaultPreviewFormat: string
    primaryOutputFormat: string | null
    printStrategy: string
    supportedOutputFormats: string[]
  }
  html: string
  rowCount: number
  totalAmount: number
}

export function ReportViewerClient({ artifactId }: { artifactId: string }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [rendered, setRendered] = useState<RenderedReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  function buildQuery() {
    const query = new URLSearchParams()
    if (q) query.set('q', q)
    if (status) query.set('status', status)
    return query.toString()
  }

  async function showReport() {
    setLoading(true)
    setError(null)
    setNotFound(false)
    try {
      const query = buildQuery()
      const result = await tenantApiGet<RenderedReport>(
        `/api/v1/reports/${artifactId}/render${query ? `?${query}` : ''}`,
      )
      setRendered(result)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true)
      } else {
        setError(err instanceof Error ? err.message : 'Rapor render edilemedi')
      }
    } finally {
      setLoading(false)
    }
  }

  async function download(format: 'PDF' | 'XLSX') {
    setError(null)
    setNotFound(false)
    try {
      const query = buildQuery()
      const result = await tenantApiDownload(`/api/v1/reports/${artifactId}/export/${format}${query ? `?${query}` : ''}`)
      const url = URL.createObjectURL(result.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.fileName
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true)
      } else {
        setError(err instanceof Error ? err.message : 'Rapor indirilemedi')
      }
    }
  }

  return (
    <div className="space-y-5">
      <PageIntro
        eyebrow="Reports"
        title={rendered?.artifact.title ?? artifactId}
        description="Route-based HTML preview ve Jasper-compatible PDF/XLSX çıktı yüzeyi."
        density="compact"
      />

      <section className="sticky top-0 z-10 app-card-dense space-y-3 p-3">
        <SectionHeader title="Filtreler" density="compact" />
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_auto_auto_auto]">
          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Arama</span>
            <input className="app-input-dense" value={q} onChange={event => setQ(event.target.value)} placeholder="Ara..." />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Durum</span>
            <input className="app-input-dense" value={status} onChange={event => setStatus(event.target.value)} placeholder="Durum" />
          </label>
          <button type="button" className="app-button-primary-dense self-end px-4" onClick={() => void showReport()} disabled={loading}>
            {loading ? 'Render...' : 'Show'}
          </button>
          <button type="button" className="app-button-outline-dense self-end px-3" onClick={() => void download('PDF')}>
            PDF
          </button>
          <button type="button" className="app-button-outline-dense self-end px-3" onClick={() => void download('XLSX')}>
            XLSX
          </button>
        </div>
      </section>

      {error ? <div className="rounded-md border border-status-danger bg-status-danger_bg px-3 py-2 text-sm text-status-danger">{error}</div> : null}

      {notFound ? (
        <section className="app-card border-dashed p-10 text-center text-sm text-ink-muted">
          Bu rapor artifact&apos;ı bulunamadı. Artifact tanımlı değil veya bu artifact için bir dataset provider kayıtlı değil.
        </section>
      ) : rendered ? (
        <section className="app-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-surface-border pb-3 text-xs text-ink-muted">
            <span>Rows: {rendered.rowCount.toLocaleString('tr-TR')}</span>
            <span>View: {rendered.artifact.viewMode}</span>
            <span>Print: {rendered.artifact.printStrategy}</span>
          </div>
          <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
        </section>
      ) : (
        <section className="app-card border-dashed p-10 text-center text-sm text-ink-muted">
          Filtreleri seçip Show ile HTML raporu aynı sayfada oluşturun.
        </section>
      )}
    </div>
  )
}
