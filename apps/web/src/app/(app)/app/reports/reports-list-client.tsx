'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, PageIntro, SectionHeader, StatusBadge } from '@/components/platform-admin-ui'
import { ApiError, tenantApiGet } from '@/lib/api'
import { TENANT_CHANGE_EVENT } from '@/lib/tenant-context'

interface ReportArtifact {
  code: string
  title: string
  description: string | null
  isActive: boolean
}

function analysisHref(code: string) {
  return `/app/reports/${encodeURIComponent(code)}/analysis`
}

export function ReportsListClient() {
  const [artifacts, setArtifacts] = useState<ReportArtifact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setArtifacts([])
    try {
      const result = await tenantApiGet<{ artifacts: ReportArtifact[] }>('/api/v1/reports/artifacts')
      setArtifacts(result.artifacts)
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setError('Bu rapor listesine erişim yetkiniz yok.')
      } else if (err instanceof ApiError && err.status >= 500) {
        setError('Rapor sunucusunda bir sorun oluştu. Lütfen daha sonra tekrar deneyin.')
      } else {
        setError('Rapor listesi yüklenemedi. Lütfen tekrar deneyin.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    function handleTenantChange() {
      void load()
    }
    window.addEventListener(TENANT_CHANGE_EVENT, handleTenantChange)
    return () => window.removeEventListener(TENANT_CHANGE_EVENT, handleTenantChange)
  }, [load])

  return (
    <div className="space-y-5">
      <PageIntro eyebrow="Reports" title="Raporlar" description="Kullanılabilir rapor artifact'ları ve analiz ekranlarına giriş noktası." density="compact" />

      {error ? (
        <div className="rounded-md border border-status-danger bg-status-danger_bg px-3 py-2 text-sm text-status-danger">{error}</div>
      ) : null}

      {loading ? (
        <EmptyState title="Yükleniyor" description="Rapor listesi getiriliyor..." />
      ) : error ? null : artifacts.length === 0 ? (
        <EmptyState title="Rapor bulunamadı" description="Henüz kullanılabilir bir rapor tanımlanmamış." />
      ) : (
        <section className="app-card p-5">
          <SectionHeader title="Rapor Artifact'ları" density="compact" />
          <div className="divide-y divide-surface-border">
            {artifacts.map(artifact => (
              <div key={artifact.code} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium text-ink">{artifact.title}</p>
                  <p className="font-mono text-xs text-ink-subtle">{artifact.code}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={artifact.isActive ? 'ACTIVE' : 'INACTIVE'} density="compact" />
                  {artifact.isActive ? (
                    <Link href={analysisHref(artifact.code)} className="app-button-outline-dense px-3">
                      Analiz
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
