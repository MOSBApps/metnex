import type { ProjectedAnalysis, ProjectedComparison } from './scada-analysis.types'

/**
 * Deterministic color palette. Uses semantic hex colors from foundation tokens.
 * Same series key ALWAYS gets the exact same hex color across renders.
 */
const COLOR_PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#d97706', // amber
  '#9333ea', // purple
  '#dc2626', // red
  '#0891b2', // cyan
  '#c026d3', // fuchsia
  '#4f46e5', // indigo
  '#059669', // emerald
  '#ea580c', // orange
]

export function getSeriesColor(seriesKey: string): string {
  let hash = 0
  for (let i = 0; i < seriesKey.length; i++) {
    hash = (hash << 5) - hash + seriesKey.charCodeAt(i)
    hash |= 0
  }
  const idx = Math.abs(hash) % COLOR_PALETTE.length
  return COLOR_PALETTE[idx]!
}

/** Formats a numeric value for display. Null or undefined is returned as '—', NEVER 0. */
export function formatValue(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—'
  return val.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Formats percentage delta.
 * If baseline is 0 or null/undefined, or if delta is null/undefined, returns '—'.
 * Baseline 0 MUST NOT produce 0% or NaN/Infinity.
 */
export function formatPercentageDelta(delta: number | null | undefined, baseline: number | null | undefined): string {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return '—'
  if (baseline === null || baseline === undefined || baseline === 0 || Number.isNaN(baseline)) return '—'
  const prefix = delta > 0 ? '+' : ''
  return `${prefix}${delta.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`
}

export interface TransformedChartData {
  chartRows: Array<Record<string, unknown>>
  seriesKeys: string[]
  seriesMeta: Record<string, { label: string; unit: string; valueType: string; analysisAllowed: boolean; color: string }>
}

/**
 * Transforms a SCADA query response into Recharts line chart data.
 * Recharts line data format: array of objects `{ timeKey: '2026-01-01...', series1: val1, series2: val2, ... }`.
 * Null values are kept as null (NOT 0) so Recharts won't plot them as 0 when connectNulls={false}.
 */
export function transformAnalysisToChartData(analysis: ProjectedAnalysis): TransformedChartData {
  const seriesKeys: string[] = []
  const seriesMeta: TransformedChartData['seriesMeta'] = {}
  const timeMap = new Map<string, Record<string, unknown>>()

  for (const s of analysis.series) {
    seriesKeys.push(s.seriesKey)
    seriesMeta[s.seriesKey] = {
      label: s.virtual ? `${s.label || s.seriesKey} (sanal)` : s.label || s.seriesKey,
      unit: s.unit || '',
      valueType: s.valueType,
      analysisAllowed: s.analysisAllowed,
      color: getSeriesColor(s.seriesKey),
    }

    for (const p of s.points) {
      const timeKey = p.localWallTime || p.t || 'Bilinmeyen Zaman'
      if (!timeMap.has(timeKey)) {
        timeMap.set(timeKey, { timeKey, _rawUtc: p.t })
      }
      const row = timeMap.get(timeKey)!
      // Keep value as number or null (never convert null to 0)
      row[s.seriesKey] = p.value
      // Store point metadata for tooltips
      row[`_meta_${s.seriesKey}`] = {
        quality: p.quality,
        qualityFlags: p.qualityFlags,
        isComplete: p.isComplete,
        classification: p.classification,
      }
    }
  }

  const chartRows = Array.from(timeMap.values()).sort((a, b) => {
    const ta = String(a._rawUtc || a.timeKey)
    const tb = String(b._rawUtc || b.timeKey)
    return ta.localeCompare(tb)
  })

  return { chartRows, seriesKeys, seriesMeta }
}

export interface TransformedComparisonChartData {
  chartRows: Array<Record<string, unknown>>
  seriesLabels: string[]
  hasUnmatched: boolean
}

/**
 * Transforms a SCADA comparison response into Recharts chart data.
 */
export function transformComparisonToChartData(comparison: ProjectedComparison): TransformedComparisonChartData {
  const seriesLabelsSet = new Set<string>()
  const timeMap = new Map<string, Record<string, unknown>>()

  for (const r of comparison.rows) {
    const key = r.seriesLabel || 'Seri'
    seriesLabelsSet.add(key)

    const timeKey = r.t || 'Bilinmeyen Zaman'
    if (!timeMap.has(timeKey)) {
      timeMap.set(timeKey, { timeKey, _comparisonT: r.comparisonT })
    }
    const row = timeMap.get(timeKey)!
    row[`baseline_${key}`] = r.baseline
    row[`comparison_${key}`] = r.comparison
    row[`delta_${key}`] = r.absoluteDelta
    row[`_meta_${key}`] = {
      quality: r.quality,
      status: r.status,
      reasonCode: r.reasonCode,
      baselineReason: r.baselineReason,
      comparisonReason: r.comparisonReason,
      percentageDelta: r.percentageDelta,
    }
  }

  const chartRows = Array.from(timeMap.values()).sort((a, b) => String(a.timeKey).localeCompare(String(b.timeKey)))

  return {
    chartRows,
    seriesLabels: Array.from(seriesLabelsSet),
    hasUnmatched: comparison.unmatchedSeries.length > 0,
  }
}
