import { assertTimeZone } from '../catalog/catalog-rules'
import type { ScadaDataQualityState, ScadaQualityInputRow } from './scada-data-quality.contract'

/**
 * Q-W529b (this task is authoritative): DST is modelled, never hidden.
 *  - AMBIGUOUS local time (clock goes back, the wall time happens twice): both readings are kept SEPARATE, never merged;
 *    they are flagged DST_AMBIGUOUS and ordered by UTC (ties by record id).
 *  - NONEXISTENT local time (clock jumps forward, Q-W529c): the reading gets NO instant at all (no pre- or post-jump
 *    offset is applied); it is kept with its local wall time and flagged DST_NONEXISTENT, no delta, analysis blocked.
 * The upstream normaliser (027.65) reports the resolution as `dstResolution`; nothing is re-derived from clock values here.
 */
export function dstStateOf(row: Pick<ScadaQualityInputRow, 'dstResolution'>): ScadaDataQualityState | null {
  // AMBIGUOUS = repeated wall time WITHOUT source fold/offset (unresolved); AMBIGUOUS_RESOLVED was placed by the source's own fold
  if (row.dstResolution === 'AMBIGUOUS') return 'DST_AMBIGUOUS'
  if (row.dstResolution === 'GAP') return 'DST_NONEXISTENT'
  return null
}

/** Verified only for a defined, valid IANA zone; anything else blocks production analysis (fail-closed). */
export function isTimeZoneVerified(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone === '') return false
  try {
    assertTimeZone(zone)
    return true
  } catch {
    return false
  }
}

/** Deterministic UTC order: instant, then record id (locale-independent). */
/** An unresolved repeated wall time has NO instant: the earliest instant it could mean is only used to place it in the output order. */
export function sortInstantMs(row: Pick<ScadaQualityInputRow, 'occurredAtUtc' | 'dstResolution' | 'dstCandidatesUtc' | 'dstUncertainRangeUtc'>): number {
  if (row.dstResolution === 'GAP') return row.dstUncertainRangeUtc ? Date.parse(row.dstUncertainRangeUtc[0]) : row.occurredAtUtc ? Date.parse(row.occurredAtUtc) : Number.POSITIVE_INFINITY
  if (row.dstResolution === 'AMBIGUOUS') return Math.min(...(row.dstCandidatesUtc ?? []).map(c => Date.parse(c)), row.occurredAtUtc ? Date.parse(row.occurredAtUtc) : Number.POSITIVE_INFINITY)
  return Date.parse(row.occurredAtUtc as string)
}

export function compareByUtc(a: Pick<ScadaQualityInputRow, 'occurredAtUtc' | 'recordId' | 'dstResolution' | 'dstCandidatesUtc' | 'dstUncertainRangeUtc'>, b: Pick<ScadaQualityInputRow, 'occurredAtUtc' | 'recordId' | 'dstResolution' | 'dstCandidatesUtc' | 'dstUncertainRangeUtc'>): number {
  const d = sortInstantMs(a) - sortInstantMs(b)
  if (d !== 0) return d
  return a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0
}
