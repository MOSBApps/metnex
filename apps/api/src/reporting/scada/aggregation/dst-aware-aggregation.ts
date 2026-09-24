import { mostCritical, sortFlags, type ScadaDataQualityState } from '../quality/scada-data-quality.contract'
import { localToUtc } from '../time/scada-source-time'
import type { ScadaAggregationBucketResult, ScadaNormalizedInputRow, ScadaSeriesAggregationPolicy } from './scada-aggregation.contract'
import { aggregateDailySeries, getLocalDateKey } from './daily-aggregation'
import { aggregateHourlySeries } from './hourly-aggregation'

/**
 * TASK-027.72-R1 — ADDITIVE DST-aware entry point of the TASK-027.66 engine. The 027.66 functions themselves are UNCHANGED:
 * they still take `occurredAtUtc: string`, so a reading whose UTC instant is unknown (unresolved repeated hour, nonexistent
 * wall time) could not enter them. This adapter lets such a reading travel WITHOUT inventing an instant:
 *
 *  - rows with an instant go through `aggregateHourlySeries` (ordering, buffer exclusion) and `aggregateDailySeries`
 *    (local-day grouping, catalog operation) exactly as before;
 *  - rows with `occurredAtUtc = null` are NEVER dropped, NEVER given a substitute time and NEVER counted as valid data: they
 *    come out as `untimed` blocked results (DST_AMBIGUOUS / DST_NONEXISTENT, value null, incomplete, not analysable);
 *  - the delta / bucket that could contain such a reading (its candidate instants or uncertain range lie inside the bucket
 *    interval) is BLOCKED too (value null, DST flag). A day that contains a blocked or untimed member has NO value: a partial
 *    sum is never presented as the day's total.
 *
 * Input rows carry the hourly value ALREADY resolved by TASK-027.67 (`value` = delta, roll-over corrected); 027.66 does the
 * bucketing / daily rollup. PURE: no I/O, no clock, no input mutation, deterministic.
 */
export interface ScadaAggregationInputRow {
  recordId: string
  seriesKey: string
  sourceCatalogId: string
  /** Bucket start; `null` for an unresolved repeated hour / a nonexistent wall time. Never replaced by a guess. */
  occurredAtUtc: string | null
  /** End of the interval the value covers (the next reading); used only to decide which timed bucket an untimed reading can affect. */
  nextOccurredAtUtc?: string | null
  localWallTime: string | null
  value: number | null
  dataQuality: ScadaDataQualityState
  qualityFlags: readonly ScadaDataQualityState[]
  isComplete: boolean
  dstResolution: 'NORMAL' | 'AMBIGUOUS' | 'AMBIGUOUS_RESOLVED' | 'GAP'
  dstCandidatesUtc?: readonly string[]
  dstUncertainRangeUtc?: readonly [string, string] | null
  isBufferRow?: boolean
}

export interface ScadaDstAwareBucket {
  recordId: string
  seriesKey: string
  sourceCatalogId: string
  granularity: 'HOURLY' | 'DAILY'
  bucketStartUtc: string | null
  localWallTime: string | null
  /** DAILY only: the local calendar day (`YYYY-MM-DD`) the bucket stands for. */
  localDate: string | null
  value: number | null
  dataQuality: ScadaDataQualityState
  qualityFlags: ScadaDataQualityState[]
  isComplete: boolean
  analysisAllowed: boolean
}

export interface ScadaDstAwareResult {
  /** Timed hourly buckets (sorted) followed by the untimed blocked ones (sorted by local wall time, record id). */
  hourly: ScadaDstAwareBucket[]
  /** Local-day buckets; empty when the policy has no `dailyOperation` (fail-closed like 027.66). */
  daily: ScadaDstAwareBucket[]
  untimed: ScadaDstAwareBucket[]
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const HOUR_MS = 3_600_000
const LEGACY_CODES: readonly string[] = ['OK', 'MISSING_VALUE', 'DUPLICATE_TIMESTAMP', 'INSUFFICIENT_NEXT_READING', 'NEGATIVE_DELTA', 'COUNTER_RESET_RESOLVED', 'COUNTER_RESET_UNRESOLVED', 'INVALID_NUMERIC_VALUE', 'INCOMPLETE_BUCKET']

const legacyCode = (state: ScadaDataQualityState): ScadaAggregationBucketResult['dataQuality'] =>
  state === 'VALID' ? 'OK' : LEGACY_CODES.includes(state) ? (state as ScadaAggregationBucketResult['dataQuality']) : 'INCOMPLETE_BUCKET'

function untimedState(r: ScadaAggregationInputRow): ScadaDataQualityState {
  if (r.dstResolution === 'GAP' || r.qualityFlags.includes('DST_NONEXISTENT')) return 'DST_NONEXISTENT'
  return 'DST_AMBIGUOUS'
}

function affects(u: ScadaAggregationInputRow, startMs: number, endMs: number): boolean {
  const inside = (ms: number) => ms >= startMs && ms <= endMs
  if (u.dstUncertainRangeUtc) return Date.parse(u.dstUncertainRangeUtc[0]) <= endMs && Date.parse(u.dstUncertainRangeUtc[1]) >= startMs
  return (u.dstCandidatesUtc ?? []).some(c => inside(Date.parse(c)))
}

export function aggregateDstAwareSeries(rows: readonly ScadaAggregationInputRow[], policy: ScadaSeriesAggregationPolicy, zone: string): ScadaDstAwareResult {
  const input = [...rows].filter(r => !r.isBufferRow)
  const timed = input.filter(r => r.occurredAtUtc !== null && !Number.isNaN(Date.parse(r.occurredAtUtc)))
  const untimedRows = input.filter(r => r.occurredAtUtc === null || Number.isNaN(Date.parse(r.occurredAtUtc)))

  // ---- 027.66 hourly (unchanged engine): the value is the already-resolved hourly delta / measurement
  const legacyRows: ScadaNormalizedInputRow[] = timed.map(r => ({ occurredAtUtc: r.occurredAtUtc as string, recordId: r.recordId, seriesKey: r.seriesKey, rawValue: r.value, valueType: 'MEASUREMENT', sourceCatalogId: r.sourceCatalogId, dataQuality: 'OK' }))
  const engineHourly = aggregateHourlySeries(legacyRows, { seriesKey: policy.seriesKey, valueType: 'MEASUREMENT', hourlyOperation: 'RAW', timezone: zone })
  const sortedTimed = [...timed].sort((a, b) => Date.parse(a.occurredAtUtc as string) - Date.parse(b.occurredAtUtc as string) || a.recordId.localeCompare(b.recordId))

  const untimed: ScadaDstAwareBucket[] = untimedRows
    .map(r => {
      const state = untimedState(r)
      const flags = sortFlags(new Set<ScadaDataQualityState>([...r.qualityFlags, state]))
      return { recordId: r.recordId, seriesKey: r.seriesKey, sourceCatalogId: r.sourceCatalogId, granularity: 'HOURLY' as const, bucketStartUtc: null, localWallTime: r.localWallTime, localDate: null, value: null, dataQuality: mostCritical(flags), qualityFlags: flags, isComplete: false, analysisAllowed: false }
    })
    .sort((a, b) => cmp(a.localWallTime ?? '', b.localWallTime ?? '') || cmp(a.recordId, b.recordId))

  const hourly: ScadaDstAwareBucket[] = engineHourly.map((e, i) => {
    const src = sortedTimed[i]!
    const startMs = Date.parse(e.bucketStartUtc)
    const endMs = src.nextOccurredAtUtc ? Date.parse(src.nextOccurredAtUtc) : startMs + HOUR_MS
    const flags = new Set<ScadaDataQualityState>(src.qualityFlags.length > 0 ? src.qualityFlags : [src.dataQuality])
    let value = e.deltaValue
    let complete = src.isComplete && e.isComplete
    for (const u of untimedRows) {
      if (affects(u, startMs, endMs)) {
        flags.add(untimedState(u))
        value = null // the interval may contain the unresolved reading: its delta cannot be trusted
        complete = false
      }
    }
    if (flags.size > 1) flags.delete('VALID')
    const sorted = sortFlags(flags.size === 0 ? ['VALID'] : flags)
    const headline = mostCritical(sorted)
    return { recordId: src.recordId, seriesKey: src.seriesKey, sourceCatalogId: src.sourceCatalogId, granularity: 'HOURLY' as const, bucketStartUtc: e.bucketStartUtc, localWallTime: src.localWallTime, localDate: null, value, dataQuality: headline, qualityFlags: sorted, isComplete: complete && value !== null, analysisAllowed: value !== null }
  })

  // ---- 027.66 daily (unchanged engine) over the TIMED hourly buckets
  const legacyHourly: ScadaAggregationBucketResult[] = hourly.map(h => ({ bucketStartUtc: h.bucketStartUtc as string, bucketEndUtc: h.bucketStartUtc as string, seriesKey: h.seriesKey, valueType: 'MEASUREMENT', rawValue: h.value, deltaValue: h.value, dataQuality: legacyCode(h.dataQuality), isComplete: h.isComplete, sourceCatalogId: h.sourceCatalogId }))
  const engineDaily = policy.dailyOperation ? aggregateDailySeries(legacyHourly, { ...policy, valueType: 'MEASUREMENT', timezone: zone }, zone) : []

  const memberFlags = new Map<string, Set<ScadaDataQualityState>>()
  for (const h of hourly) {
    const key = getLocalDateKey(h.bucketStartUtc as string, zone)
    if (!memberFlags.has(key)) memberFlags.set(key, new Set())
    for (const f of h.qualityFlags) memberFlags.get(key)!.add(f)
  }
  const untimedByDay = new Map<string, ScadaDstAwareBucket[]>()
  for (const u of untimed) {
    const key = (u.localWallTime ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue
    if (!untimedByDay.has(key)) untimedByDay.set(key, [])
    untimedByDay.get(key)!.push(u)
  }

  const days = new Map<string, ScadaDstAwareBucket>()
  for (const d of engineDaily) {
    const key = d.bucketStartUtc.slice(0, 10) // 027.66 labels the day by its local date key
    days.set(key, { recordId: `${d.seriesKey}:DAY:${key}`, seriesKey: d.seriesKey, sourceCatalogId: d.sourceCatalogId, granularity: 'DAILY', bucketStartUtc: null, localWallTime: `${key}T00:00:00.000`, localDate: key, value: d.deltaValue, dataQuality: 'VALID', qualityFlags: [...(memberFlags.get(key) ?? [])], isComplete: d.isComplete, analysisAllowed: d.deltaValue !== null })
  }
  for (const [key, list] of untimedByDay) {
    if (!days.has(key) && policy.dailyOperation) {
      const first = list[0]!
      days.set(key, { recordId: `${first.seriesKey}:DAY:${key}`, seriesKey: first.seriesKey, sourceCatalogId: first.sourceCatalogId, granularity: 'DAILY', bucketStartUtc: null, localWallTime: `${key}T00:00:00.000`, localDate: key, value: null, dataQuality: 'VALID', qualityFlags: [], isComplete: false, analysisAllowed: false })
    }
  }
  const daily: ScadaDstAwareBucket[] = []
  for (const key of [...days.keys()].sort()) {
    const day = days.get(key)!
    const flags = new Set<ScadaDataQualityState>(day.qualityFlags)
    let value = day.value
    let complete = day.isComplete
    for (const u of untimedByDay.get(key) ?? []) {
      for (const f of u.qualityFlags) flags.add(f)
      value = null // a member with no instant: the day total is unknown, never a partial sum
      complete = false
    }
    if (value === null) {
      if (flags.size === 0 || (flags.size === 1 && flags.has('VALID'))) flags.add('INCOMPLETE_BUCKET')
    }
    if (flags.size > 1) flags.delete('VALID')
    if (!complete && flags.size === 0) flags.add('INCOMPLETE_BUCKET')
    const [y, mo, dd] = key.split('-').map(Number) as [number, number, number]
    const midnight = localToUtc({ year: y, month: mo, day: dd, hour: 0, minute: 0, second: 0 }, zone)
    let start: string | null = midnight.instant.toISOString()
    if (midnight.dst === 'AMBIGUOUS') {
      start = null
      flags.add('DST_AMBIGUOUS')
    } else if (midnight.dst === 'GAP') {
      start = null
      flags.add('DST_NONEXISTENT')
    }
    const sorted = sortFlags(flags.size === 0 ? ['VALID'] : flags)
    daily.push({ ...day, bucketStartUtc: start, value, qualityFlags: sorted, dataQuality: mostCritical(sorted), isComplete: complete && value !== null && start !== null, analysisAllowed: value !== null && start !== null })
  }

  return { hourly: [...hourly, ...untimed], daily, untimed }
}
