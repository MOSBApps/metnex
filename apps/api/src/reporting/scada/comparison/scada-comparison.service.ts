import { mostCritical, type ScadaDataQualityState } from '../quality/scada-data-quality.contract'
import type { ScadaOutputBucket, ScadaSeriesInterval, ScadaSeriesOutput } from '../series/scada-series.contract'
import { compareSeries, pairSeries, periodKeyFn, unmappedRows, utcKeyFn, type KeyFn } from './comparison-core'
import { isIso, isObj, mappingShapeValid, optionsValid, seriesShapeValid, tenantGate, zoneValid } from './comparison-gates'
import { safeLabel } from './comparison-quality'
import { compensatedSumOf } from './comparison-sum'
import type {
  ComparisonBlockCode,
  ComparisonChartData,
  ComparisonRow,
  ComparisonSummary,
  PeriodComparisonRequest,
  ScadaComparisonResult,
  SourceComparisonRequest,
  UnmatchedSeries,
} from './scada-comparison.contract'

const INTERVALS: readonly string[] = ['HOURLY', 'DAILY']
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const sortNum = (r: ComparisonRow): number => r.relativeOffsetMs ?? (r.baselineBucketStartUtc ? Date.parse(r.baselineBucketStartUtc) : r.comparisonBucketStartUtc ? Date.parse(r.comparisonBucketStartUtc) : Number.POSITIVE_INFINITY)

function summarise(rows: readonly ComparisonRow[], unmatchedSeries: readonly UnmatchedSeries[]): ComparisonSummary {
  const comparable = rows.filter(r => r.status === 'COMPARABLE')
  const deltas = comparable.map(r => r.absoluteDelta as number)
  const pcts = comparable.map(r => r.percentageDelta).filter((p): p is number => p !== null)
  const flags = new Set<ScadaDataQualityState>()
  for (const r of rows) for (const f of r.qualityFlags) flags.add(f)
  const total = deltas.length ? compensatedSumOf(deltas) : null
  const finite = total !== null && Number.isFinite(total)
  const comparability: ComparisonSummary['comparability'] = comparable.length === 0 ? 'NO_COMPARABLE_DATA' : comparable.length === rows.length && unmatchedSeries.length === 0 ? 'COMPARABLE' : 'PARTIALLY_COMPARABLE'
  return {
    totalRows: rows.length,
    comparableRows: comparable.length,
    baselineMissingRows: rows.filter(r => r.baselineSide.state === 'MISSING').length,
    comparisonMissingRows: rows.filter(r => r.comparisonSide.state === 'MISSING').length,
    invalidRows: rows.filter(r => r.status === 'BASELINE_INVALID' || r.status === 'COMPARISON_INVALID').length,
    unresolvedRows: rows.filter(r => r.status === 'DST_UNRESOLVED' || r.status === 'COUNTER_RESET_UNRESOLVED').length,
    unmatchedBuckets: rows.filter(r => r.status === 'BUCKET_UNMATCHED').length,
    unmatchedSeries: unmatchedSeries.length,
    // nothing comparable ⇒ every number is null (never a misleading 0)
    totalAbsoluteDelta: finite ? total : null,
    averageAbsoluteDelta: finite ? (total as number) / deltas.length : null,
    maxSignedDelta: deltas.length ? deltas.reduce((a, b) => (b > a ? b : a)) : null,
    largestMagnitudeDelta: deltas.length ? deltas.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : null,
    maxPercentageDelta: pcts.length ? pcts.reduce((a, b) => (b > a ? b : a)) : null,
    dataQuality: mostCritical(flags.size === 0 ? ['MISSING_VALUE'] : [...flags]),
    comparability,
  }
}

function blocked(mode: 'PERIOD' | 'SOURCE', root: string, code: ComparisonBlockCode, interval: ScadaSeriesInterval | null = null): ScadaComparisonResult {
  return { status: 'BLOCKED', code, mode, customerRootTenantId: root, bucketInterval: interval, rows: [], unmatchedSeries: [], sourceLabels: {}, summary: summarise([], []) }
}

function finish(mode: 'PERIOD' | 'SOURCE', root: string, interval: ScadaSeriesInterval, rows: ComparisonRow[], unmatched: UnmatchedSeries[], labels: Record<string, string>): ScadaComparisonResult {
  rows.sort((a, b) => cmp(a.seriesKey, b.seriesKey) || cmp(a.baselineSourceCatalogId, b.baselineSourceCatalogId) || cmp(a.comparisonSeriesKey, b.comparisonSeriesKey) || cmp(a.comparisonSourceCatalogId, b.comparisonSourceCatalogId) || sortNum(a) - sortNum(b) || cmp(a.status, b.status))
  return { status: 'OK', code: null, mode, customerRootTenantId: root, bucketInterval: interval, rows, unmatchedSeries: unmatched, sourceLabels: labels, summary: summarise(rows, unmatched) }
}

const rangeFilter = (startAt: string, endAt: string) => {
  const lo = Date.parse(startAt)
  const hi = Date.parse(endAt)
  return (b: ScadaOutputBucket) => b.bucketStartUtc === null || (Date.parse(b.bucketStartUtc) >= lo && Date.parse(b.bucketStartUtc) < hi)
}

function labelsOf(input: Readonly<Record<string, string>> | undefined, ids: readonly string[]): Record<string, string> | null {
  const out: Record<string, string> = {}
  for (const id of ids) {
    const v = input?.[id]
    if (v === undefined) continue
    if (!safeLabel(v)) return null
    out[id] = v
  }
  return out
}

/**
 * Period and source comparison (TASK-027.69). PURE: no I/O, no audit, no logging, deterministic, never mutates its input.
 * Buckets are matched ONLY by explicit keys (never by array index / record order), series ONLY by the same key or the
 * mapping of the call; a missing bucket is never 0; near-equal values are never snapped together; a refusal is a static code, never a silent conversion.
 */
export class ScadaComparisonService {
  comparePeriods(req: PeriodComparisonRequest): ScadaComparisonResult {
    const root = isObj(req) && typeof req.customerRootTenantId === 'string' ? req.customerRootTenantId : ''
    const bad = (code: ComparisonBlockCode, interval: ScadaSeriesInterval | null = null) => blocked('PERIOD', root, code, interval)
    if (!isObj(req) || root === '' || !isObj(req.baselinePeriod) || !isObj(req.comparisonPeriod) || !Array.isArray(req.baselinePeriod.series) || !Array.isArray(req.comparisonPeriod.series)) return bad('PERIOD_INCOMPATIBLE')
    const { baselinePeriod: bp, comparisonPeriod: cp } = req
    if (typeof bp.customerRootTenantId !== 'string' || typeof cp.customerRootTenantId !== 'string') return bad('PERIOD_INCOMPATIBLE')
    if (![...bp.series, ...cp.series].every(seriesShapeValid)) return bad('PERIOD_INCOMPATIBLE')
    // 1) tenant gate first — nothing of another tenant is ever looked at
    if (tenantGate(root, [bp.customerRootTenantId, cp.customerRootTenantId], [...bp.series, ...cp.series])) return bad('TENANT_SCOPE_BLOCKED')
    // 2) range, 3) interval, 4) time zone
    for (const p of [bp, cp]) if (!isIso(p.startAt) || !isIso(p.endAt) || Date.parse(p.startAt) >= Date.parse(p.endAt)) return bad('PERIOD_RANGE_INVALID')
    if (!INTERVALS.includes(bp.bucketInterval) || bp.bucketInterval !== cp.bucketInterval) return bad('BUCKET_INTERVAL_MISMATCH')
    if (!zoneValid(bp.timezone) || !zoneValid(cp.timezone) || bp.timezone !== cp.timezone) return bad('TIMEZONE_MISMATCH', bp.bucketInterval)
    if (!mappingShapeValid(req.seriesMapping) || !optionsValid(req.options)) return bad('PERIOD_INCOMPATIBLE', bp.bucketInterval)
    const labels = labelsOf(req.sourceLabels, [...new Set([...bp.series, ...cp.series].map(s => s.sourceCatalogId))])
    if (!labels) return bad('PERIOD_INCOMPATIBLE', bp.bucketInterval)
    // 5) series mapping: the same (source, seriesKey) or an explicit entry — nothing else pairs
    const pairing = pairSeries(bp.series, cp.series, req.seriesMapping ?? [], (b, c) => b.sourceCatalogId === c.sourceCatalogId)
    if (pairing.mappingInvalid || pairing.pairs.length === 0) return bad('SERIES_MAPPING_REQUIRED', bp.bucketInterval)

    const bKey = periodKeyFn(bp)
    const cKey = periodKeyFn(cp)
    const bRange = rangeFilter(bp.startAt, bp.endAt)
    const cRange = rangeFilter(cp.startAt, cp.endAt)
    const rows: ComparisonRow[] = []
    for (const pair of pairing.pairs) rows.push(...compareSeries(pair, bp.bucketInterval, bKey, cKey, bRange, cRange, req.options))
    for (const u of pairing.unmatched) {
      const s = (u.side === 'BASELINE' ? bp : cp).series.find(x => x.seriesKey === u.seriesKey && x.sourceCatalogId === u.sourceCatalogId)!
      rows.push(...unmappedRows(s, u.side, bp.bucketInterval, u.side === 'BASELINE' ? bKey : cKey, u.side === 'BASELINE' ? bRange : cRange))
    }
    return finish('PERIOD', root, bp.bucketInterval, rows, pairing.unmatched, labels)
  }

  compareSources(req: SourceComparisonRequest): ScadaComparisonResult {
    const root = isObj(req) && typeof req.customerRootTenantId === 'string' ? req.customerRootTenantId : ''
    const bad = (code: ComparisonBlockCode, interval: ScadaSeriesInterval | null = null) => blocked('SOURCE', root, code, interval)
    if (!isObj(req) || root === '' || !isObj(req.period) || !isObj(req.leftSource) || !isObj(req.rightSource) || !Array.isArray(req.leftSource.series) || !Array.isArray(req.rightSource.series)) return bad('PERIOD_INCOMPATIBLE')
    const { period, leftSource: left, rightSource: right } = req
    if (![...left.series, ...right.series].every(seriesShapeValid)) return bad('PERIOD_INCOMPATIBLE')
    if (typeof left.sourceCatalogId !== 'string' || typeof right.sourceCatalogId !== 'string' || !safeLabel(left.label) || !safeLabel(right.label)) return bad('PERIOD_INCOMPATIBLE')
    if (tenantGate(root, [], [...left.series, ...right.series])) return bad('TENANT_SCOPE_BLOCKED')
    if (!isIso(period.startAt) || !isIso(period.endAt) || Date.parse(period.startAt) >= Date.parse(period.endAt)) return bad('PERIOD_RANGE_INVALID')
    if (!INTERVALS.includes(period.bucketInterval)) return bad('BUCKET_INTERVAL_MISMATCH')
    if (!zoneValid(period.timezone)) return bad('TIMEZONE_MISMATCH', period.bucketInterval)
    if (!mappingShapeValid(req.seriesMapping) || !optionsValid(req.options)) return bad('PERIOD_INCOMPATIBLE', period.bucketInterval)
    // the two sources must be explicitly declared comparable, and every series must belong to its declared source
    const sm = req.sourceMapping
    if (!sm || sm.leftSourceCatalogId !== left.sourceCatalogId || sm.rightSourceCatalogId !== right.sourceCatalogId || left.sourceCatalogId === right.sourceCatalogId) return bad('SOURCE_MAPPING_REQUIRED', period.bucketInterval)
    if (left.series.some(s => s.sourceCatalogId !== left.sourceCatalogId) || right.series.some(s => s.sourceCatalogId !== right.sourceCatalogId)) return bad('SOURCE_MAPPING_REQUIRED', period.bucketInterval)
    const pairing = pairSeries(left.series, right.series, req.seriesMapping ?? [], () => true)
    if (pairing.mappingInvalid || pairing.pairs.length === 0) return bad('SERIES_MAPPING_REQUIRED', period.bucketInterval)

    const inRange = rangeFilter(period.startAt, period.endAt)
    const rows: ComparisonRow[] = []
    for (const pair of pairing.pairs) rows.push(...compareSeries(pair, period.bucketInterval, utcKeyFn as KeyFn, utcKeyFn as KeyFn, inRange, inRange, req.options))
    for (const u of pairing.unmatched) {
      const s: ScadaSeriesOutput = (u.side === 'BASELINE' ? left : right).series.find(x => x.seriesKey === u.seriesKey)!
      rows.push(...unmappedRows(s, u.side, period.bucketInterval, utcKeyFn, inRange))
    }
    return finish('SOURCE', root, period.bucketInterval, rows, pairing.unmatched, { [left.sourceCatalogId]: left.label, [right.sourceCatalogId]: right.label })
  }
}

/** The pure output the chart screen (TASK-027.73) consumes: rows with baseline/comparison, deltas, time, labels, quality and static reason codes. */
export function toComparisonChart(result: ScadaComparisonResult): ComparisonChartData {
  return {
    status: result.status,
    code: result.code,
    mode: result.mode,
    bucketInterval: result.bucketInterval,
    comparability: result.summary.comparability,
    unmatchedSeries: result.unmatchedSeries.map(u => ({ ...u })),
    summary: { ...result.summary },
    rows: result.rows.map(r => ({
      t: r.baselineBucketStartUtc,
      comparisonT: r.comparisonBucketStartUtc,
      seriesLabel: r.seriesLabel,
      comparisonSeriesLabel: r.comparisonSeriesLabel,
      sourceLabel: result.sourceLabels[r.baselineSourceCatalogId] ?? '',
      comparisonSourceLabel: result.sourceLabels[r.comparisonSourceCatalogId] ?? '',
      baseline: r.baselineValue,
      comparison: r.comparisonValue,
      absoluteDelta: r.absoluteDelta,
      percentageDelta: r.percentageDelta,
      quality: r.dataQuality,
      status: r.status,
      reasonCode: r.status === 'COMPARABLE' ? null : (r.reason ?? r.baselineSide.reason ?? r.comparisonSide.reason),
      baselineReason: r.baselineSide.reason,
      comparisonReason: r.comparisonSide.reason,
    })),
  }
}
