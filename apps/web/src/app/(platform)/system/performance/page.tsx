'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPatch } from '@/lib/api'
import {
  Badge,
  DetailPanel,
  EmptyState,
  PageIntro,
  SectionHeader,
  StatCard,
  Tabs,
} from '@/components/platform-admin-ui'

interface PerfOverview {
  databaseSizeMb: number | null
  databaseSizeLabel: string
  slowRequestCount24h: number
  slowQueryCount24h: number
  settings: {
    slowRequestThresholdMs: number
    dbTraceEnabled: boolean
  }
  topTablesBySize: { tableName: string; totalSizeMb: number | null; totalSizeLabel: string }[]
  topRoutes: { route: string; count: number; avgDurationMs: number; maxDurationMs: number }[]
  suspectedIssues: string[]
}

interface TableStat {
  schema: string
  tableName: string
  estimatedRows: number
  tableSizeMb: number | null
  indexSizeMb: number | null
  totalSizeMb: number | null
  seqScanCount: number
  indexScanCount: number
  deadTuples: number
  lastVacuum: string | null
  lastAutovacuum: string | null
  lastAnalyze: string | null
  lastAutoanalyze: string | null
}

interface IndexStat {
  schema: string
  tableName: string
  indexName: string
  indexDef: string
  sizeMb: number | null
  isUnique: boolean
  isPrimary: boolean
  scanCount: number
  unusedIndex: boolean
}

interface SlowRequestRow {
  id: string
  createdAt: string
  method: string
  route: string
  statusCode: number
  durationMs: number
  dbTotalMs: number | null
  queryCount: number | null
  tenantId: string | null
  tenantName: string | null
  userId: string | null
  userLabel: string | null
}

interface SlowRequestDetail extends SlowRequestRow {
  traceWasActive: boolean
  queryLogs: Array<{
    id: string
    durationMs: number
    model: string | null
    operation: string | null
    queryHash: string | null
    queryText: string | null
    createdAt: string
  }>
}

interface SlowQueryRow {
  queryHash: string | null
  queryText: string | null
  model: string | null
  operation: string | null
  count: number
  avgMs: number
  maxMs: number
  requestCount: number
}

interface RecommendationRow {
  kind: string
  target: string
  reason: string
  confidence: 'low' | 'medium' | 'high'
}

type TabId = 'overview' | 'slow-requests' | 'slow-queries' | 'tables' | 'indexes' | 'recommendations' | 'settings'

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('tr-TR')
}

export default function SystemPerformancePage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [overview, setOverview] = useState<PerfOverview | null>(null)
  const [tables, setTables] = useState<TableStat[]>([])
  const [indexes, setIndexes] = useState<IndexStat[]>([])
  const [slowRequests, setSlowRequests] = useState<SlowRequestRow[]>([])
  const [slowQueries, setSlowQueries] = useState<SlowQueryRow[]>([])
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([])
  const [selectedRequest, setSelectedRequest] = useState<SlowRequestDetail | null>(null)
  const [settingsForm, setSettingsForm] = useState({ slowRequestThresholdMs: '1000', dbTraceEnabled: false })
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [overviewData, tablesData, indexesData, slowRequestsData, slowQueriesData, recommendationsData] = await Promise.all([
        apiGet<PerfOverview>('/api/v1/admin/perf/overview'),
        apiGet<{ rows: TableStat[] }>('/api/v1/admin/perf/tables'),
        apiGet<{ rows: IndexStat[] }>('/api/v1/admin/perf/indexes'),
        apiGet<{ rows: SlowRequestRow[] }>('/api/v1/admin/perf/slow-requests?limit=50'),
        apiGet<{ rows: SlowQueryRow[] }>('/api/v1/admin/perf/slow-queries?limit=30'),
        apiGet<{ rows: RecommendationRow[] }>('/api/v1/admin/perf/recommendations'),
      ])

      setOverview(overviewData)
      setTables(tablesData.rows)
      setIndexes(indexesData.rows)
      setSlowRequests(slowRequestsData.rows)
      setSlowQueries(slowQueriesData.rows)
      setRecommendations(recommendationsData.rows)
      setSettingsForm({
        slowRequestThresholdMs: String(overviewData.settings.slowRequestThresholdMs),
        dbTraceEnabled: overviewData.settings.dbTraceEnabled,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Performance verileri yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function openSlowRequest(id: string) {
    try {
      const detail = await apiGet<SlowRequestDetail>(`/api/v1/admin/perf/slow-requests/${id}`)
      setSelectedRequest(detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İstek detayı yüklenemedi')
    }
  }

  async function saveSettings() {
    setSavingSettings(true)
    setError(null)
    try {
      await apiPatch('/api/v1/admin/perf/settings', {
        slowRequestThresholdMs: Math.max(100, Number(settingsForm.slowRequestThresholdMs) || 1000),
        dbTraceEnabled: settingsForm.dbTraceEnabled,
      })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Performance ayarları kaydedilemedi')
    } finally {
      setSavingSettings(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageIntro
        eyebrow="Platform Ops"
        title="Performance & Diagnostics"
        description="DB snapshot, yavaş istek izi ve platform-genel trace/threshold kontrolü."
        density="compact"
      />

      {overview ? (
        <section className="grid gap-3 md:grid-cols-4">
          <StatCard label="DB Boyutu" value={overview.databaseSizeLabel} tone="accent" density="compact" />
          <StatCard label="24s Slow Request" value={overview.slowRequestCount24h} density="compact" />
          <StatCard label="24s Slow Query" value={overview.slowQueryCount24h} density="compact" />
          <StatCard label="Threshold" value={`${overview.settings.slowRequestThresholdMs} ms`} density="compact" />
        </section>
      ) : null}

      <section className="app-card-dense p-4">
        <Tabs
          density="compact"
          activeTab={activeTab}
          onTabChange={tab => setActiveTab(tab as TabId)}
          tabs={[
            { id: 'overview', label: 'Özet' },
            { id: 'slow-requests', label: 'Yavaş İstekler' },
            { id: 'slow-queries', label: 'Yavaş Sorgular' },
            { id: 'tables', label: 'Tablolar' },
            { id: 'indexes', label: 'İndeksler' },
            { id: 'recommendations', label: 'Öneriler' },
            { id: 'settings', label: 'Ayarlar' },
          ]}
        />

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">{error}</div> : null}

        {loading ? (
          <div className="py-10 text-sm text-ink-muted">Performance verileri yükleniyor...</div>
        ) : activeTab === 'overview' && overview ? (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
              <section className="space-y-3 rounded-2xl border border-surface-border bg-surface-subtle/50 p-4">
                <SectionHeader title="En Büyük Tablolar" description="Fiziksel boyuta göre ilk beş kullanıcı tablosu." density="compact" />
                <div className="space-y-2">
                  {overview.topTablesBySize.map(table => (
                    <div key={table.tableName} className="flex items-center justify-between rounded-xl border border-surface-border bg-surface px-3 py-2">
                      <span className="font-mono text-[12px] text-ink">{table.tableName}</span>
                      <span className="text-[12px] text-ink-muted">{table.totalSizeLabel}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="space-y-3 rounded-2xl border border-surface-border bg-surface-subtle/50 p-4">
                <SectionHeader title="Şüpheli Noktalar" description="Heuristik bazlı ilk operasyon notları." density="compact" />
                {overview.suspectedIssues.length === 0 ? (
                  <div className="text-sm text-ink-muted">Belirgin bir bulgu görünmüyor.</div>
                ) : (
                  <div className="space-y-2">
                    {overview.suspectedIssues.map(issue => (
                      <div key={issue} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                        {issue}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="space-y-3 rounded-2xl border border-surface-border bg-surface-subtle/50 p-4">
              <SectionHeader title="En Yavaş Route'lar" description="Persist edilen slow request kayıtlarından route bazlı özet." density="compact" />
              <div className="overflow-auto">
                <table className="app-table min-w-full">
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Kayıt</th>
                      <th>Ort.</th>
                      <th>Maks.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.topRoutes.map(route => (
                      <tr key={route.route}>
                        <td className="font-mono text-[12px] text-ink">{route.route}</td>
                        <td>{route.count}</td>
                        <td>{route.avgDurationMs} ms</td>
                        <td>{route.maxDurationMs} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : activeTab === 'slow-requests' ? (
          slowRequests.length === 0 ? (
            <EmptyState title="Slow request kaydı yok" description="Threshold üstü ya da 5xx request henüz persist edilmedi." />
          ) : (
            <div className="overflow-auto">
              <table className="app-table min-w-full">
                <thead>
                  <tr>
                    <th>Zaman</th>
                    <th>Route</th>
                    <th>HTTP</th>
                    <th>Süre</th>
                    <th>DB</th>
                    <th>Tenant</th>
                    <th>Kullanıcı</th>
                  </tr>
                </thead>
                <tbody>
                  {slowRequests.map(row => (
                    <tr key={row.id} className="cursor-pointer" onClick={() => void openSlowRequest(row.id)}>
                      <td className="whitespace-nowrap text-[12px] text-ink-muted">{formatDateTime(row.createdAt)}</td>
                      <td className="font-mono text-[12px] text-ink">{row.route}</td>
                      <td>
                        <Badge tone={row.statusCode >= 500 ? 'danger' : row.statusCode >= 400 ? 'warning' : 'info'} density="compact">
                          {row.method} {row.statusCode}
                        </Badge>
                      </td>
                      <td>{row.durationMs} ms</td>
                      <td>{row.dbTotalMs === null ? 'Trace yok' : `${row.dbTotalMs} ms / ${row.queryCount ?? 0} q`}</td>
                      <td>{row.tenantName ?? '—'}</td>
                      <td className="text-[12px] text-ink-muted">{row.userLabel ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : activeTab === 'slow-queries' ? (
          <div className="overflow-auto">
            <table className="app-table min-w-full">
              <thead>
                <tr>
                  <th>Query</th>
                  <th>Model</th>
                  <th>Op</th>
                  <th>Count</th>
                  <th>Avg</th>
                  <th>Max</th>
                </tr>
              </thead>
              <tbody>
                {slowQueries.map((row, index) => (
                  <tr key={`${row.queryHash ?? 'q'}-${index}`}>
                    <td className="min-w-[28rem] font-mono text-[12px] text-ink">{row.queryText ?? row.queryHash ?? '—'}</td>
                    <td>{row.model ?? '—'}</td>
                    <td>{row.operation ?? '—'}</td>
                    <td>{row.count}</td>
                    <td>{row.avgMs} ms</td>
                    <td>{row.maxMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'tables' ? (
          <div className="overflow-auto">
            <table className="app-table min-w-full">
              <thead>
                <tr>
                  <th>Tablo</th>
                  <th>Rows</th>
                  <th>Total</th>
                  <th>Seq</th>
                  <th>Idx</th>
                  <th>Analyze</th>
                </tr>
              </thead>
              <tbody>
                {tables.map(table => (
                  <tr key={`${table.schema}.${table.tableName}`}>
                    <td className="font-mono text-[12px] text-ink">{table.schema}.{table.tableName}</td>
                    <td>{table.estimatedRows.toLocaleString('tr-TR')}</td>
                    <td>{table.totalSizeMb?.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) ?? '—'} MB</td>
                    <td>{table.seqScanCount.toLocaleString('tr-TR')}</td>
                    <td>{table.indexScanCount.toLocaleString('tr-TR')}</td>
                    <td className="text-[12px] text-ink-muted">{formatDateTime(table.lastAnalyze ?? table.lastAutoanalyze)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'indexes' ? (
          <div className="overflow-auto">
            <table className="app-table min-w-full">
              <thead>
                <tr>
                  <th>Index</th>
                  <th>Tablo</th>
                  <th>Size</th>
                  <th>Scan</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {indexes.map(index => (
                  <tr key={`${index.schema}.${index.indexName}`}>
                    <td className="font-mono text-[12px] text-ink">{index.indexName}</td>
                    <td className="text-[12px] text-ink-muted">{index.tableName}</td>
                    <td>{index.sizeMb?.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) ?? '—'} MB</td>
                    <td>{index.scanCount.toLocaleString('tr-TR')}</td>
                    <td>
                      {index.isPrimary ? (
                        <Badge tone="info" density="compact">PK</Badge>
                      ) : index.unusedIndex ? (
                        <Badge tone="warning" density="compact">Unused</Badge>
                      ) : index.isUnique ? (
                        <Badge tone="brand" density="compact">Unique</Badge>
                      ) : (
                        <Badge density="compact">Normal</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'recommendations' ? (
          recommendations.length === 0 ? (
            <EmptyState title="Öneri yok" description="Heuristik motor belirgin bir operasyon notu üretmedi." />
          ) : (
            <div className="space-y-3">
              {recommendations.map((row, index) => (
                <div key={`${row.kind}-${row.target}-${index}`} className="rounded-2xl border border-surface-border bg-surface-subtle/50 p-4">
                  <div className="flex items-center gap-2">
                    <Badge tone={row.confidence === 'high' ? 'danger' : row.confidence === 'medium' ? 'warning' : 'default'} density="compact">
                      {row.confidence}
                    </Badge>
                    <span className="font-mono text-[12px] text-ink">{row.kind}</span>
                    <span className="text-sm text-ink-muted">{row.target}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink">{row.reason}</p>
                </div>
              ))}
            </div>
          )
        ) : (
          <section className="space-y-4 rounded-2xl border border-surface-border bg-surface-subtle/50 p-4">
            <SectionHeader title="Trace & Threshold" description="Platform-genel slow request eşiği ve DB trace toggle." density="compact" />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-subtle">Slow Request Threshold</span>
                <input
                  value={settingsForm.slowRequestThresholdMs}
                  onChange={event => setSettingsForm(current => ({ ...current, slowRequestThresholdMs: event.target.value }))}
                  type="number"
                  min={100}
                  step={100}
                  className="app-input-dense px-3"
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-surface-border bg-surface px-4 py-3">
                <input
                  checked={settingsForm.dbTraceEnabled}
                  onChange={event => setSettingsForm(current => ({ ...current, dbTraceEnabled: event.target.checked }))}
                  type="checkbox"
                  className="h-4 w-4"
                />
                <div>
                  <div className="text-sm font-medium text-ink">DB trace aktif</div>
                  <div className="text-[12px] text-ink-muted">Slow request anında sorgu satırlarını da persist eder.</div>
                </div>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void saveSettings()} className="app-button-primary-dense px-3.5" disabled={savingSettings}>
                {savingSettings ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
              </button>
              <button type="button" onClick={() => void loadData()} className="app-button-outline-dense px-3.5">
                Yenile
              </button>
            </div>
          </section>
        )}
      </section>

      <DetailPanel
        isOpen={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        title={selectedRequest ? `${selectedRequest.method} ${selectedRequest.route}` : 'Slow request'}
        subtitle={selectedRequest ? `${selectedRequest.durationMs} ms • ${formatDateTime(selectedRequest.createdAt)}` : undefined}
        density="compact"
      >
        {selectedRequest ? (
          <div className="space-y-4">
            <section className="grid gap-3 rounded-2xl border border-surface-border bg-surface-subtle/50 p-4 md:grid-cols-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-subtle">Tenant</div>
                <div className="mt-1 text-sm text-ink">{selectedRequest.tenantName ?? '—'}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-subtle">Kullanıcı</div>
                <div className="mt-1 text-sm text-ink">{selectedRequest.userLabel ?? '—'}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-subtle">Trace</div>
                <div className="mt-1 text-sm text-ink">{selectedRequest.traceWasActive ? 'Aktif' : 'Kapalı'}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-subtle">DB Total</div>
                <div className="mt-1 text-sm text-ink">{selectedRequest.dbTotalMs === null ? 'Trace yok' : `${selectedRequest.dbTotalMs} ms`}</div>
              </div>
            </section>
            <section className="space-y-3">
              <SectionHeader title="Query Logs" description="İlk 50 query trace satırı." density="compact" />
              {selectedRequest.queryLogs.length === 0 ? (
                <div className="rounded-2xl border border-surface-border bg-surface-subtle/50 px-4 py-3 text-sm text-ink-muted">
                  Trace aktif değildi ya da bu request DB sorgusu üretmedi.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedRequest.queryLogs.map(query => (
                    <div key={query.id} className="rounded-2xl border border-surface-border bg-surface-subtle/50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="warning" density="compact">{query.durationMs} ms</Badge>
                        <span className="text-[12px] text-ink-muted">{query.model ?? 'SQL'} {query.operation ?? ''}</span>
                        {query.queryHash ? <span className="font-mono text-[11px] text-ink-subtle">{query.queryHash}</span> : null}
                      </div>
                      <pre className="mt-2 overflow-auto text-[12px] leading-5 text-ink">{query.queryText ?? '—'}</pre>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </DetailPanel>
    </div>
  )
}
