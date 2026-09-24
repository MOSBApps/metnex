import type { RolloverPolicyProvider } from './rollover-policy.port'
import { ScadaDataQualityError } from './data-quality.errors'
import { correctedDelta, resolvePolicy } from './scada-counter-rollover.service'
import {
  COMPLETE_SAFE_STATES,
  mostCritical,
  sortFlags,
  type PolicyTrace,
  type ScadaDataQualityState,
  type ScadaQualityInput,
  type ScadaQualityInputRow,
  type ScadaQualityResult,
  type ScadaQualityResultRow,
} from './scada-data-quality.contract'
import { compareByUtc, dstStateOf, isTimeZoneVerified, sortInstantMs } from './scada-dst-quality.service'

const round4 = (v: number) => Math.round(v * 10000) / 10000

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Data-quality / counter roll-over resolver (TASK-027.67). PURE: no I/O, no audit, no logging, no input mutation,
 * deterministic. Roll-over is applied only from explicit policies of the SAME series; a series never influences another.
 */
export class ScadaDataQualityService {
  constructor(private readonly policies: RolloverPolicyProvider) {}

  evaluate(input: ScadaQualityInput): ScadaQualityResult {
    if (!input || typeof input !== 'object' || typeof input.catalogId !== 'string' || !Array.isArray(input.rows)) throw new ScadaDataQualityError()
    for (const row of input.rows) {
      if (!row || typeof row !== 'object' || typeof row.seriesKey !== 'string' || typeof row.recordId !== 'string') throw new ScadaDataQualityError()
      const unresolved = row.dstResolution === 'AMBIGUOUS' || row.dstResolution === 'GAP'
      // a resolved reading needs a real instant; an unresolved repeated time is identified by its candidates instead
      if (!unresolved && (typeof row.occurredAtUtc !== 'string' || Number.isNaN(Date.parse(row.occurredAtUtc)))) throw new ScadaDataQualityError()
      const validRange = Array.isArray(row.dstUncertainRangeUtc) && row.dstUncertainRangeUtc.length === 2 && row.dstUncertainRangeUtc.every((c: string) => !Number.isNaN(Date.parse(c)))
      const validCandidates = Array.isArray(row.dstCandidatesUtc) && row.dstCandidatesUtc.length > 0 && row.dstCandidatesUtc.every((c: string) => !Number.isNaN(Date.parse(c)))
      const legacyInstant = typeof row.occurredAtUtc === 'string' && !Number.isNaN(Date.parse(row.occurredAtUtc))
      if (unresolved && !(row.dstResolution === 'GAP' ? validRange || legacyInstant : validCandidates || legacyInstant)) {
        throw new ScadaDataQualityError()
      }
    }
    // detached copy; an unresolved repeated time NEVER keeps an instant (whatever the caller put there is discarded)
    const rows = input.rows.map(r => {
      if (r.dstResolution === 'AMBIGUOUS') return { ...r, occurredAtUtc: null, dstCandidatesUtc: r.dstCandidatesUtc?.length ? [...r.dstCandidatesUtc] : [r.occurredAtUtc as string], dstUncertainRangeUtc: null }
      // Q-W529c: a nonexistent wall time never keeps an instant and never has candidates (whatever the caller put there is discarded)
      if (r.dstResolution === 'GAP') return { ...r, occurredAtUtc: null, dstCandidatesUtc: [], dstUncertainRangeUtc: r.dstUncertainRangeUtc ? ([...r.dstUncertainRangeUtc] as [string, string]) : ([r.occurredAtUtc as string, r.occurredAtUtc as string] as [string, string]) }
      return { ...r }
    })
    const verified = isTimeZoneVerified(input.sourceTimeZone)
    const dstResolved = !rows.some(r => r.dstResolution === 'AMBIGUOUS' || r.dstResolution === 'GAP')

    const bySeries = new Map<string, ScadaQualityInputRow[]>()
    for (const r of rows) {
      const key = r.seriesKey
      if (!bySeries.has(key)) bySeries.set(key, [])
      bySeries.get(key)!.push(r)
    }

    const out: ScadaQualityResultRow[] = []
    for (const seriesKey of [...bySeries.keys()].sort()) {
      const series = bySeries.get(seriesKey)!.sort(compareByUtc)
      out.push(...(verified ? this.evaluateSeries(input.catalogId, seriesKey, series) : this.blockSeries(series)))
    }

    const series: ScadaQualityResult['series'] = {}
    for (const r of out) {
      const s = (series[r.seriesKey] ??= { flags: [], isComplete: true, rowCount: 0 })
      s.flags = sortFlags([...s.flags, ...r.qualityFlags])
      s.isComplete = s.isComplete && r.isComplete
      s.rowCount += 1
    }
    return { analysisAllowed: verified && dstResolved, timeZoneStatus: verified ? 'VERIFIED' : 'UNVERIFIED', dstStatus: dstResolved ? 'RESOLVED' : 'UNRESOLVED', rows: out, series }
  }

  // ------------------------------------------------------------------ time zone not verified → fail closed

  private blockSeries(series: ScadaQualityInputRow[]): ScadaQualityResultRow[] {
    return series.filter(r => !r.isBufferRow).map(r => this.row(r, null, null, ['TIMEZONE_UNVERIFIED'], null))
  }

  // ------------------------------------------------------------------ one series

  private evaluateSeries(catalogId: string, seriesKey: string, series: ScadaQualityInputRow[]): ScadaQualityResultRow[] {
    const isUnresolved = (r: ScadaQualityInputRow) => r.dstResolution === 'AMBIGUOUS' || r.dstResolution === 'GAP'
    const unresolved = series.filter(isUnresolved)
    const resolved = series.filter(r => !isUnresolved(r))
    // time intervals no longer trustworthy: each possible instant of a repeated wall time (a point) and the uncertain range of a missing one
    const blockers: Array<[number, number, ScadaDataQualityState]> = unresolved.flatMap((r): Array<[number, number, ScadaDataQualityState]> =>
      r.dstResolution === 'GAP'
        ? [[Date.parse(r.dstUncertainRangeUtc![0]), Date.parse(r.dstUncertainRangeUtc![1]), 'DST_NONEXISTENT']]
        : (r.dstCandidatesUtc ?? []).map((c): [number, number, ScadaDataQualityState] => [Date.parse(c), Date.parse(c), 'DST_AMBIGUOUS']),
    )
    const keyed: Array<[number, ScadaQualityResultRow]> = []

    // 1) unresolved repeated wall times: kept SEPARATE (never merged, never given an instant), flagged, no delta
    for (const r of unresolved) if (!r.isBufferRow) keyed.push([sortInstantMs(r), this.row(r, null, null, this.readingFlags(r), null)])

    // 2) everything with a real instant; a delta whose interval could contain an unresolved reading is not produced
    for (let i = 0; i < resolved.length; i += 1) {
      const current = resolved[i]!
      if (current.isBufferRow) continue // buffer rows are only "next readings"; they never appear in the output
      const next = resolved[i + 1] ?? null
      const prev = resolved[i - 1] ?? null
      const from = Date.parse(current.occurredAtUtc as string)
      const to = next ? Date.parse(next.occurredAtUtc as string) : Number.POSITIVE_INFINITY
      const straddling = [...new Set(blockers.filter(([lo, hi]) => hi > from && lo <= to).map(b => b[2]))]
      const result = current.valueType === 'REAL_VALUE' ? this.measurement(current, prev, next) : this.index(catalogId, seriesKey, current, prev, next, straddling)
      keyed.push([from, result])
    }
    return keyed.sort((x, y) => x[0] - y[0] || (x[1].recordId < y[1].recordId ? -1 : x[1].recordId > y[1].recordId ? 1 : 0)).map(k => k[1])
  }

  /** Flags describing one reading on its own (source quality, DST). Values are never repaired or zeroed. */
  private readingFlags(r: ScadaQualityInputRow): ScadaDataQualityState[] {
    const flags: ScadaDataQualityState[] = []
    const dst = dstStateOf(r)
    if (dst) flags.push(dst)
    if (r.rawValue === null || r.rawValue === undefined) {
      // an INVALID source value arrives as null too: keep the two causes apart
      flags.push(r.dataQuality === 'INVALID' ? 'INVALID_NUMERIC_VALUE' : 'MISSING_VALUE')
    } else if (!isNumber(r.rawValue)) {
      flags.push('INVALID_NUMERIC_VALUE')
    }
    return flags
  }

  private measurement(current: ScadaQualityInputRow, prev: ScadaQualityInputRow | null, next: ScadaQualityInputRow | null): ScadaQualityResultRow {
    const flags = this.readingFlags(current)
    if (this.sameInstant(current, prev) || this.sameInstant(current, next)) flags.push('DUPLICATE_TIMESTAMP')
    const value = isNumber(current.rawValue) ? current.rawValue : null
    return this.row(current, null, value, flags, null)
  }

  private index(catalogId: string, seriesKey: string, current: ScadaQualityInputRow, prev: ScadaQualityInputRow | null, next: ScadaQualityInputRow | null, straddling: ScadaDataQualityState[]): ScadaQualityResultRow {
    const flags = this.readingFlags(current)
    flags.push(...straddling) // an unresolved (repeated or missing) wall time may be the true next reading: no delta is guessed
    const duplicate = this.sameInstant(current, prev) || this.sameInstant(current, next)
    if (duplicate) flags.push('DUPLICATE_TIMESTAMP')
    if (!next) {
      flags.push('INSUFFICIENT_NEXT_READING') // no synthetic delta for the last reading (Q-W501)
      return this.row(current, null, null, flags, null)
    }
    for (const f of this.readingFlags(next)) if (f === 'DST_AMBIGUOUS' || f === 'DST_NONEXISTENT' || f === 'MISSING_VALUE' || f === 'INVALID_NUMERIC_VALUE') flags.push(f)
    if (this.sameInstant(current, next)) return this.row(current, next, null, flags, null) // same instant: no delta between them

    const a = current.rawValue
    const b = next.rawValue
    const usable = isNumber(a) && isNumber(b)
    // a reading at a NONEXISTENT local time is kept but its delta is not trusted (never moved to another hour)
    const untrusted = flags.includes('DST_NONEXISTENT') || straddling.length > 0
    if (!usable || untrusted) return this.row(current, next, null, flags, null)

    if (b >= a) return this.row(current, next, round4(b - a), flags, null)

    // negative difference: only an explicit, valid, effective policy of THIS series may correct it (Q-W502 / Q-W522)
    flags.push('NEGATIVE_DELTA')
    const resolution = resolvePolicy(this.policies.list(catalogId, seriesKey, 'INDEX'), Date.parse(next.occurredAtUtc as string))
    if (resolution.kind === 'INVALID') {
      flags.push('POLICY_INVALID', 'COUNTER_RESET_UNRESOLVED')
      return this.row(current, next, null, flags, resolution.trace)
    }
    if (resolution.kind === 'UNDEFINED') {
      flags.push('POLICY_UNDEFINED', 'COUNTER_RESET_UNRESOLVED')
      return this.row(current, next, null, flags, resolution.trace)
    }
    if (resolution.kind === 'NONE_MODE') {
      flags.push('COUNTER_RESET_UNRESOLVED') // an explicit "NONE": not corrected, and said so
      return this.row(current, next, null, flags, resolution.trace)
    }
    const delta = correctedDelta(resolution.policy, a, b)
    if (delta === null) {
      flags.push('COUNTER_RESET_UNRESOLVED')
      return this.row(current, next, null, flags, { ...resolution.trace, status: 'OUT_OF_RANGE' })
    }
    flags.push('COUNTER_RESET_RESOLVED')
    return this.row(current, next, delta, flags, resolution.trace)
  }

  private sameInstant(a: ScadaQualityInputRow, b: ScadaQualityInputRow | null): boolean {
    return b !== null && a.occurredAtUtc !== null && b.occurredAtUtc !== null && Date.parse(a.occurredAtUtc) === Date.parse(b.occurredAtUtc)
  }

  private row(current: ScadaQualityInputRow, next: ScadaQualityInputRow | null, delta: number | null, rawFlags: ScadaDataQualityState[], policy: PolicyTrace | null): ScadaQualityResultRow {
    const flags = sortFlags(rawFlags.length === 0 ? ['VALID'] : rawFlags)
    const isMeasurement = current.valueType === 'REAL_VALUE'
    const rawValue = isNumber(current.rawValue) ? current.rawValue : null
    const complete = (isMeasurement ? rawValue !== null : delta !== null) && flags.every(f => COMPLETE_SAFE_STATES.includes(f))
    return {
      sourceCatalogId: current.sourceCatalogId,
      seriesKey: current.seriesKey,
      valueType: current.valueType,
      occurredAtUtc: current.dstResolution === 'AMBIGUOUS' || current.dstResolution === 'GAP' ? null : current.occurredAtUtc,
      localWallTime: current.localWallTime,
      dstResolution: current.dstResolution,
      nextOccurredAtUtc: next ? next.occurredAtUtc : null,
      recordId: current.recordId,
      rawValue,
      nextRawValue: next && isNumber(next.rawValue) ? next.rawValue : null,
      deltaValue: isMeasurement ? rawValue : delta,
      dataQuality: mostCritical(flags),
      qualityFlags: flags,
      isComplete: complete,
      policy,
    }
  }
}

/**
 * Rolls several result rows up into one bucket (hour / day): the headline is the most critical state of ANY row, and a
 * bucket with an incomplete row is INCOMPLETE_BUCKET-flagged. Nothing is cleaned up on the way.
 */
export function summariseBucket(rows: readonly ScadaQualityResultRow[]): { dataQuality: ScadaDataQualityState; qualityFlags: ScadaDataQualityState[]; isComplete: boolean } {
  const flags = new Set<ScadaDataQualityState>()
  let complete = rows.length > 0
  for (const r of rows) {
    for (const f of r.qualityFlags) flags.add(f)
    complete = complete && r.isComplete
  }
  if (!complete) flags.add('INCOMPLETE_BUCKET')
  const sorted = sortFlags(flags.size === 0 ? ['VALID'] : flags)
  return { dataQuality: mostCritical(sorted), qualityFlags: sorted, isComplete: complete }
}
