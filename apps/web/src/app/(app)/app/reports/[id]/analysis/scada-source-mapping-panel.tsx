'use client'

import type { CatalogSource } from './scada-catalog.types'

interface Props {
  left: CatalogSource | null
  right: CatalogSource | null
  /** The selected series of the LEFT source. */
  leftSeriesKeys: readonly string[]
  mapping: Readonly<Record<string, string>>
  locked: boolean
  onChange: (mapping: Record<string, string>) => void
}

/**
 * TASK-027.59-R1 — explicit series mapping of a SOURCE comparison: one row per selected LEFT series → a series of the RIGHT source.
 * Nothing is chosen by position or by similarity of names; a right series already used by another row is not offered again, so the same
 * right series can never be bound twice. A row without a choice stops the analysis (the series is never silently dropped).
 */
export function ScadaSourceMappingPanel({ left, right, leftSeriesKeys, mapping, locked, onChange }: Props) {
  if (!left || !right) return null
  const rightSeries = right.series.filter(s => s.available)
  const usedBy = (rightKey: string) => Object.entries(mapping).find(([l, r]) => leftSeriesKeys.includes(l) && r === rightKey)?.[0] ?? null
  const label = (key: string) => left.series.find(s => s.seriesKey === key)?.label ?? key

  if (leftSeriesKeys.length === 0) return <p className="text-xs text-ink-muted">Eşleme için önce sol kaynaktan en az bir seri seçin.</p>
  return (
    <div className="space-y-2" data-testid="source-mapping-panel">
      <span className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Seri eşleme (sol kaynak serisi → sağ kaynak serisi)</span>
      {leftSeriesKeys.map(l => (
        <div key={l} className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
          <span className="text-xs text-ink">{label(l)}</span>
          <span aria-hidden className="text-ink-subtle">→</span>
          <select
            className="app-input-dense"
            aria-label={`Sağ seri: ${label(l)}`}
            disabled={locked}
            value={mapping[l] ?? ''}
            onChange={e => {
              const next = { ...mapping }
              if (e.target.value === '') delete next[l]
              else next[l] = e.target.value
              onChange(next)
            }}
          >
            <option value="">-- Sağ seri seçin --</option>
            {rightSeries.map(s => {
              const other = usedBy(s.seriesKey)
              return (
                <option key={s.seriesKey} value={s.seriesKey} disabled={other !== null && other !== l}>
                  {s.label} ({s.unit ? s.unit : 'Birim belirtilmemiş'})
                </option>
              )
            })}
          </select>
        </div>
      ))}
    </div>
  )
}
