import { localDateTimeString } from '../time/scada-source-time'
import type { ScadaOutputBucket, ScadaSeriesOutput } from '../series/scada-series.contract'
import { absentSide, rowQuality, rowStatus, sideOf } from './comparison-quality'
import { computeDelta } from './comparison-math'
import type { ComparisonOptions, ComparisonRow, SeriesMappingEntry, SideInfo, UnmatchedSeries } from './scada-comparison.contract'
import type { ScadaSeriesInterval } from '../series/scada-series.contract'

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** How a bucket is keyed on ONE side: by its UTC start (source mode) or by its offset from its own period start (period mode). */
export type KeyFn = (bucket: ScadaOutputBucket) => { key: string; offsetMs: number | null }

const wallMs = (naive: string) => Date.parse(`${naive}Z`)

/**
 * Period mode key: the bucket's LOCAL wall-clock offset from the period's local start, in ms. It is time-based (never an
 * array index or a record order), keeps local hours aligned across a DST change and never shifts anything silently. A
 * bucket without a trustworthy instant is keyed by its local wall time so that it can only ever meet its own wall time.
 */
export function periodKeyFn(period: { startAt: string; timezone: string }): KeyFn {
  const startWall = wallMs(localDateTimeString(new Date(period.startAt), period.timezone))
  return b => {
    if (b.bucketStartUtc !== null) {
      const offsetMs = wallMs(localDateTimeString(new Date(b.bucketStartUtc), period.timezone)) - startWall
      return { key: `O:${offsetMs}`, offsetMs }
    }
    if (b.localWallTime) {
      const offsetMs = wallMs(b.localWallTime) - startWall
      if (Number.isFinite(offsetMs)) return { key: `O:${offsetMs}`, offsetMs }
    }
    return { key: `U:${b.recordId}`, offsetMs: null }
  }
}

/** Source mode key: the exact UTC bucket start (both sources are read over the same instants). */
export const utcKeyFn: KeyFn = b => (b.bucketStartUtc !== null ? { key: `T:${Date.parse(b.bucketStartUtc)}`, offsetMs: null } : { key: `U:${b.recordId}`, offsetMs: null })

const idOf = (s: Pick<ScadaSeriesOutput, 'sourceCatalogId' | 'seriesKey'>) => `${s.sourceCatalogId}\u0000${s.seriesKey}`

export interface PairResult {
  pairs: Array<{ baseline: ScadaSeriesOutput; comparison: ScadaSeriesOutput }>
  unmatched: UnmatchedSeries[]
  /** true when the explicit mapping is malformed (unknown series, one series paired twice). */
  mappingInvalid: boolean
}

/**
 * Pairs series ONLY by (a) the same seriesKey where `directSame` allows it, or (b) the explicit mapping of the call.
 * No positional pairing, no name similarity. Everything left over is reported (never dropped silently).
 */
export function pairSeries(baseline: readonly ScadaSeriesOutput[], comparison: readonly ScadaSeriesOutput[], mapping: readonly SeriesMappingEntry[], directSame: (b: ScadaSeriesOutput, c: ScadaSeriesOutput) => boolean): PairResult {
  const bById = new Map(baseline.map(s => [idOf(s), s]))
  const cById = new Map(comparison.map(s => [idOf(s), s]))
  const usedB = new Set<string>()
  const usedC = new Set<string>()
  const pairs: PairResult['pairs'] = []
  let mappingInvalid = false

  for (const m of mapping) {
    const b = bById.get(idOf(m.baseline))
    const c = cById.get(idOf(m.comparison))
    if (!b || !c || usedB.has(idOf(b)) || usedC.has(idOf(c))) {
      mappingInvalid = true
      continue
    }
    usedB.add(idOf(b))
    usedC.add(idOf(c))
    pairs.push({ baseline: b, comparison: c })
  }
  for (const b of [...baseline].sort((x, y) => cmp(idOf(x), idOf(y)))) {
    if (usedB.has(idOf(b))) continue
    const candidates = comparison.filter(c => !usedC.has(idOf(c)) && c.seriesKey === b.seriesKey && directSame(b, c))
    if (candidates.length === 1) {
      usedB.add(idOf(b))
      usedC.add(idOf(candidates[0]!))
      pairs.push({ baseline: b, comparison: candidates[0]! })
    }
  }
  const unmatched: UnmatchedSeries[] = [
    ...baseline.filter(s => !usedB.has(idOf(s))).map(s => ({ side: 'BASELINE' as const, seriesKey: s.seriesKey, sourceCatalogId: s.sourceCatalogId, seriesLabel: s.label })),
    ...comparison.filter(s => !usedC.has(idOf(s))).map(s => ({ side: 'COMPARISON' as const, seriesKey: s.seriesKey, sourceCatalogId: s.sourceCatalogId, seriesLabel: s.label })),
  ].sort((a, b) => cmp(a.side, b.side) || cmp(a.seriesKey, b.seriesKey) || cmp(a.sourceCatalogId, b.sourceCatalogId))
  return { pairs, unmatched, mappingInvalid }
}

interface Keyed {
  bucket: ScadaOutputBucket
  offsetMs: number | null
}

/** Index one side's buckets by key; two buckets under one key are a DUPLICATE (kept visible, never merged or summed). */
function indexSide(series: ScadaSeriesOutput, keyFn: KeyFn, inRange: (b: ScadaOutputBucket) => boolean): Map<string, Keyed[]> {
  const map = new Map<string, Keyed[]>()
  for (const b of series.buckets) {
    if (!inRange(b)) continue
    const { key, offsetMs } = keyFn(b)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push({ bucket: b, offsetMs })
  }
  return map
}

const duplicateSide = (): SideInfo => ({ present: true, state: 'INVALID', flags: ['DUPLICATE_TIMESTAMP'], reason: 'DUPLICATE_BUCKET' })

function sortKey(key: string): [number, number | string] {
  const n = Number(key.slice(2))
  return key.startsWith('U:') ? [1, key] : [0, n]
}

/** Compare ONE paired series bucket by bucket (union of the keys of both sides). Absent bucket ⇒ BUCKET_UNMATCHED, never 0. */
export function compareSeries(pair: PairResult['pairs'][number], interval: ScadaSeriesInterval, baseKey: KeyFn, compKey: KeyFn, baseRange: (b: ScadaOutputBucket) => boolean, compRange: (b: ScadaOutputBucket) => boolean, options: ComparisonOptions | undefined): ComparisonRow[] {
  const { baseline, comparison } = pair
  const bIdx = indexSide(baseline, baseKey, baseRange)
  const cIdx = indexSide(comparison, compKey, compRange)
  const bBlocked = baseline.status === 'BLOCKED' || !baseline.analysisAllowed
  const cBlocked = comparison.status === 'BLOCKED' || !comparison.analysisAllowed
  const keys = [...new Set([...bIdx.keys(), ...cIdx.keys()])].sort((x, y) => {
    const [ax, av] = sortKey(x)
    const [bx, bv] = sortKey(y)
    return ax - bx || (typeof av === 'number' && typeof bv === 'number' ? av - bv : cmp(String(av), String(bv)))
  })
  const rows: ComparisonRow[] = []
  for (const key of keys) {
    const bs = bIdx.get(key)
    const cs = cIdx.get(key)
    const bSide: SideInfo = !bs ? absentSide('BUCKET_ABSENT') : bs.length > 1 ? duplicateSide() : sideOf(bs[0]!.bucket, bBlocked)
    const cSide: SideInfo = !cs ? absentSide('BUCKET_ABSENT') : cs.length > 1 ? duplicateSide() : sideOf(cs[0]!.bucket, cBlocked)
    const bB = bs && bs.length === 1 ? bs[0]!.bucket : null
    const cB = cs && cs.length === 1 ? cs[0]!.bucket : null
    let status = !bs || !cs ? ('BUCKET_UNMATCHED' as const) : rowStatus(bSide, cSide)
    let absoluteDelta: number | null = null
    let percentageDelta: number | null = null
    let reason: ComparisonRow['reason'] = null
    if (status === 'COMPARABLE') {
      const d = computeDelta(bB!.value as number, cB!.value as number, options?.decimals)
      if (d.ok) {
        absoluteDelta = d.absoluteDelta
        percentageDelta = d.percentageDelta
      } else {
        status = 'COMPARISON_INVALID'
        reason = 'NUMERIC_OVERFLOW'
      }
    }
    const usable = (s: SideInfo, b: ScadaOutputBucket | null) => (s.state === 'VALID' && b ? b.value : null)
    rows.push({
      seriesKey: baseline.seriesKey,
      comparisonSeriesKey: comparison.seriesKey,
      seriesLabel: baseline.label,
      comparisonSeriesLabel: comparison.label,
      baselineSourceCatalogId: baseline.sourceCatalogId,
      comparisonSourceCatalogId: comparison.sourceCatalogId,
      bucketInterval: interval,
      baselineBucketStartUtc: bB?.bucketStartUtc ?? null,
      comparisonBucketStartUtc: cB?.bucketStartUtc ?? null,
      relativeOffsetMs: bs?.[0]?.offsetMs ?? cs?.[0]?.offsetMs ?? null,
      baselineValue: usable(bSide, bB),
      comparisonValue: usable(cSide, cB),
      absoluteDelta,
      percentageDelta,
      status,
      reason: reason ?? (status === 'BUCKET_UNMATCHED' ? 'BUCKET_ABSENT' : null),
      baselineSide: bSide,
      comparisonSide: cSide,
      ...rowQuality(bSide, cSide),
    })
  }
  return rows
}

/** Rows for a series that has no counterpart: its buckets stay visible as SERIES_UNMAPPED (values are not compared). */
export function unmappedRows(series: ScadaSeriesOutput, side: 'BASELINE' | 'COMPARISON', interval: ScadaSeriesInterval, keyFn: KeyFn, inRange: (b: ScadaOutputBucket) => boolean): ComparisonRow[] {
  const blocked = series.status === 'BLOCKED' || !series.analysisAllowed
  return series.buckets.filter(inRange).map(b => {
    const present = sideOf(b, blocked)
    const other = absentSide('SERIES_ABSENT')
    const bSide = side === 'BASELINE' ? present : other
    const cSide = side === 'BASELINE' ? other : present
    const { offsetMs } = keyFn(b)
    return {
      seriesKey: series.seriesKey,
      comparisonSeriesKey: series.seriesKey,
      seriesLabel: series.label,
      comparisonSeriesLabel: series.label,
      baselineSourceCatalogId: side === 'BASELINE' ? series.sourceCatalogId : '',
      comparisonSourceCatalogId: side === 'COMPARISON' ? series.sourceCatalogId : '',
      bucketInterval: interval,
      baselineBucketStartUtc: side === 'BASELINE' ? b.bucketStartUtc : null,
      comparisonBucketStartUtc: side === 'COMPARISON' ? b.bucketStartUtc : null,
      relativeOffsetMs: offsetMs,
      baselineValue: null,
      comparisonValue: null,
      absoluteDelta: null,
      percentageDelta: null,
      status: 'SERIES_UNMAPPED' as const,
      reason: 'SERIES_ABSENT' as const,
      baselineSide: bSide,
      comparisonSide: cSide,
      ...rowQuality(bSide, cSide),
    }
  })
}
