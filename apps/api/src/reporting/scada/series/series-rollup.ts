import { localDateString, localToUtc } from '../time/scada-source-time'
import { sortFlags, type ScadaDataQualityState } from '../quality/scada-data-quality.contract'
import { compensatedSum } from './series-statistics'
import { classifyBucket } from './series-quality'
import type { ScadaSeriesBucketInput } from './scada-series.contract'

export type RollupOperation = 'SUM' | 'AVERAGE' | 'MIN' | 'MAX'

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * HOURLY → DAILY buckets, grouped by the LOCAL calendar day of the source zone (so a DST day simply has 23 or 25 hours and
 * the local day is preserved). The daily `bucketStartUtc` follows the same contract as the hourly one: the UTC instant of
 * the bucket's start (the local midnight). `operation` is explicit (catalog policy, never guessed).
 *
 *  - only VALID member buckets contribute to the value; a member that is not VALID makes the day INCOMPLETE_BUCKET and
 *    carries its flags upward — nothing is cleaned and nothing is filled with 0;
 *  - a day with no VALID member has value null;
 *  - buffer rows are never members; members without an instant are grouped by the date of their local wall time and mark
 *    the day incomplete; a local midnight that itself is ambiguous / nonexistent gives the day no instant (null).
 */
export function rollUpToDaily(hourly: readonly ScadaSeriesBucketInput[], zone: string, operation: RollupOperation, seriesKey: string): ScadaSeriesBucketInput[] {
  const days = new Map<string, ScadaSeriesBucketInput[]>()
  for (const b of hourly) {
    if (b.isBufferRow) continue
    const key = b.bucketStartUtc !== null ? localDateString(new Date(b.bucketStartUtc), zone) : (b.localWallTime ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue // no way to place it in a day: left out (the caller sees the missing coverage)
    if (!days.has(key)) days.set(key, [])
    days.get(key)!.push(b)
  }
  const out: ScadaSeriesBucketInput[] = []
  for (const key of [...days.keys()].sort()) {
    const members = days.get(key)!.sort((a, b) => cmp(a.bucketStartUtc ?? '~', b.bucketStartUtc ?? '~') || cmp(a.recordId, b.recordId))
    const valid = members.filter(m => classifyBucket(m) === 'VALID').map(m => m.value as number)
    const flags = new Set<ScadaDataQualityState>()
    for (const m of members) for (const f of m.qualityFlags) flags.add(f)
    const allValid = valid.length === members.length
    if (!allValid) flags.add('INCOMPLETE_BUCKET')
    let value: number | null = null
    if (valid.length > 0) {
      if (operation === 'SUM') value = compensatedSum(valid)
      else if (operation === 'AVERAGE') value = compensatedSum(valid) / valid.length
      else if (operation === 'MIN') value = valid.reduce((a, b) => (b < a ? b : a))
      else value = valid.reduce((a, b) => (b > a ? b : a))
    }
    const [y, mo, d] = key.split('-').map(Number) as [number, number, number]
    const midnight = localToUtc({ year: y, month: mo, day: d, hour: 0, minute: 0, second: 0 }, zone)
    let start: string | null = midnight.instant.toISOString()
    if (midnight.dst === 'AMBIGUOUS') {
      start = null
      flags.add('DST_AMBIGUOUS')
    } else if (midnight.dst === 'GAP') {
      start = null
      flags.add('DST_NONEXISTENT')
    }
    const sorted = sortFlags(flags.size === 0 ? ['VALID'] : flags)
    out.push({
      recordId: `${seriesKey}:DAY:${key}`,
      bucketStartUtc: start,
      localWallTime: `${key}T00:00:00.000`,
      value,
      dataQuality: sorted[0]!,
      qualityFlags: sorted,
      isComplete: allValid && start !== null && valid.length > 0,
    })
  }
  return out
}
