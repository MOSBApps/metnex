'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiGet } from '@/lib/api'
import {
  Badge,
  DetailPanel,
  EmptyState,
  PageIntro,
  SectionHeader,
  StatCard,
  formatDate,
} from '@/components/platform-admin-ui'

interface AuditRow {
  id: string
  actorId: string | null
  actorSnapshot: { id: string; email: string; displayName: string } | null
  actionCode: string
  entityType: string
  entityId: string
  summary: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

interface AuditResponse {
  rows: AuditRow[]
  total: number
}

function categoryLabel(actionCode: string) {
  if (actionCode.startsWith('LOGIN') || actionCode.startsWith('SESSION') || actionCode === 'LOGOUT') return 'Kimlik'
  if (actionCode.startsWith('USER_')) return 'Kullanıcı'
  if (actionCode.includes('ROLE') || actionCode.includes('MEMBERSHIP')) return 'Yetki'
  return 'Platform'
}

function categoryTone(actionCode: string): 'info' | 'brand' | 'warning' | 'default' {
  if (actionCode.startsWith('LOGIN') || actionCode.startsWith('SESSION') || actionCode === 'LOGOUT') return 'info'
  if (actionCode.startsWith('USER_')) return 'brand'
  if (actionCode.includes('ROLE') || actionCode.includes('MEMBERSHIP')) return 'warning'
  return 'default'
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('tr-TR')
}

export default function SystemAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [actionCode, setActionCode] = useState('')
  const [entityType, setEntityType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null)

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ limit: '100' })
      if (query.trim()) params.set('q', query.trim())
      if (actionCode.trim()) params.set('actionCode', actionCode.trim())
      if (entityType.trim()) params.set('entityType', entityType.trim())
      if (from) params.set('from', from)
      if (to) params.set('to', to)

      const data = await apiGet<AuditResponse>(`/api/v1/platform-audit-logs?${params.toString()}`)
      setRows(data.rows)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audit kayıtları yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [actionCode, entityType, from, query, to])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const authCount = useMemo(
    () => rows.filter(row => categoryLabel(row.actionCode) === 'Kimlik').length,
    [rows],
  )
  const userCount = useMemo(
    () => rows.filter(row => categoryLabel(row.actionCode) === 'Kullanıcı').length,
    [rows],
  )
  const accessCount = useMemo(
    () => rows.filter(row => categoryLabel(row.actionCode) === 'Yetki').length,
    [rows],
  )

  return (
    <div className="space-y-4">
      <PageIntro
        eyebrow="Platform Ops"
        title="Audit Log"
        description="Kimlik, kullanıcı ve yetki seviyesindeki platform operasyon olayları. Yalnızca system admin yüzeyi."
        density="compact"
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Toplam Kayıt" value={total} tone="accent" density="compact" />
        <StatCard label="Kimlik Olayı" value={authCount} density="compact" />
        <StatCard label="Kullanıcı Olayı" value={userCount} density="compact" />
        <StatCard label="Yetki Olayı" value={accessCount} density="compact" />
      </section>

      <section className="app-card-dense space-y-3 p-4">
        <SectionHeader
          title="Filtreler"
          description="Özet, aksiyon kodu, varlık tipi ve tarih aralığı ile audit akışını daraltın."
          density="compact"
        />
        <div className="grid gap-2 md:grid-cols-5">
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Özet, entity id, kod..."
            className="app-input-dense px-3"
          />
          <input
            value={actionCode}
            onChange={event => setActionCode(event.target.value)}
            placeholder="Aksiyon kodu"
            className="app-input-dense px-3"
          />
          <input
            value={entityType}
            onChange={event => setEntityType(event.target.value)}
            placeholder="Entity type"
            className="app-input-dense px-3"
          />
          <input value={from} onChange={event => setFrom(event.target.value)} type="date" className="app-input-dense px-3" />
          <input value={to} onChange={event => setTo(event.target.value)} type="date" className="app-input-dense px-3" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadRows()} className="app-button-primary-dense px-3.5">
            Filtrele
          </button>
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setActionCode('')
              setEntityType('')
              setFrom('')
              setTo('')
            }}
            className="app-button-outline-dense px-3.5"
          >
            Temizle
          </button>
        </div>
      </section>

      {error ? <div className="app-card-dense border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">{error}</div> : null}

      {loading ? (
        <div className="app-card-dense px-4 py-10 text-sm text-ink-muted">Audit kayıtları yükleniyor...</div>
      ) : rows.length === 0 ? (
        <EmptyState title="Audit kaydı yok" description="Bu filtrelerle eşleşen platform audit olayı bulunamadı." />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-surface-border bg-surface">
          <div className="overflow-auto">
            <table className="app-table min-w-full">
              <thead>
                <tr>
                  <th>Zaman</th>
                  <th>Kategori</th>
                  <th>Aksiyon</th>
                  <th>Aktör</th>
                  <th>Özet</th>
                  <th>Entity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="cursor-pointer" onClick={() => setSelectedRow(row)}>
                    <td className="whitespace-nowrap text-[12px] text-ink-muted">{formatDateTime(row.createdAt)}</td>
                    <td>
                      <Badge tone={categoryTone(row.actionCode)} density="compact">
                        {categoryLabel(row.actionCode)}
                      </Badge>
                    </td>
                    <td className="font-mono text-[12px] text-ink">{row.actionCode}</td>
                    <td className="text-[12px] text-ink-muted">
                      {row.actorSnapshot ? `${row.actorSnapshot.displayName} • ${row.actorSnapshot.email}` : 'Sistem / Anonim'}
                    </td>
                    <td className="min-w-[24rem] text-[13px] text-ink">{row.summary}</td>
                    <td className="text-[12px] text-ink-muted">
                      <div className="font-medium text-ink">{row.entityType}</div>
                      <div className="font-mono">{row.entityId}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <DetailPanel
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title={selectedRow?.summary ?? 'Audit detayı'}
        subtitle={selectedRow ? `${selectedRow.actionCode} • ${formatDate(selectedRow.createdAt)}` : undefined}
        density="compact"
      >
        {selectedRow ? (
          <div className="space-y-4">
            <section className="grid gap-3 rounded-2xl border border-surface-border bg-surface-subtle/50 p-4 md:grid-cols-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-subtle">Aktör</div>
                <div className="mt-1 text-sm text-ink">
                  {selectedRow.actorSnapshot ? `${selectedRow.actorSnapshot.displayName} • ${selectedRow.actorSnapshot.email}` : 'Sistem / anonim'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-subtle">Entity</div>
                <div className="mt-1 text-sm text-ink">
                  {selectedRow.entityType} <span className="font-mono text-[12px] text-ink-muted">{selectedRow.entityId}</span>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <SectionHeader title="Metadata" description="Scrubbed context payload." density="compact" />
              <pre className="overflow-auto rounded-2xl border border-surface-border bg-surface-subtle/60 p-4 text-[12px] leading-5 text-ink">
                {JSON.stringify(selectedRow.metadata ?? {}, null, 2)}
              </pre>
            </section>
          </div>
        ) : null}
      </DetailPanel>
    </div>
  )
}
