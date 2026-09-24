import { mostCritical, sortFlags, type ScadaDataQualityState } from '../quality/scada-data-quality.contract'
import type { ScadaOutputBucket } from '../series/scada-series.contract'
import type { ComparisonRowStatus, SideInfo, SideReason } from './scada-comparison.contract'

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/
/** Only bounded printable text may reach an output. */
export const safeLabel = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128 && !CONTROL.test(v)

export const absentSide = (reason: SideReason): SideInfo => ({ present: false, state: 'ABSENT', flags: [], reason })

/** State of ONE side from its 027.68 bucket (a blocked series is BLOCKED whatever its buckets say). */
export function sideOf(bucket: ScadaOutputBucket, seriesBlocked: boolean): SideInfo {
  const flags = sortFlags(bucket.qualityFlags.length ? bucket.qualityFlags : ['VALID'])
  if (seriesBlocked) return { present: true, state: 'BLOCKED', flags, reason: 'SERIES_ANALYSIS_BLOCKED' }
  switch (bucket.classification) {
    case 'VALID':
      return { present: true, state: 'VALID', flags, reason: null }
    case 'MISSING':
      return { present: true, state: 'MISSING', flags, reason: 'MISSING_VALUE' }
    case 'INVALID':
      return { present: true, state: 'INVALID', flags, reason: 'INVALID_NUMERIC_VALUE' }
    default: {
      const reason: SideReason = flags.includes('DST_AMBIGUOUS') || flags.includes('DST_NONEXISTENT') ? 'DST_UNRESOLVED' : flags.includes('COUNTER_RESET_UNRESOLVED') ? 'COUNTER_RESET_UNRESOLVED' : 'INCOMPLETE_BUCKET'
      return { present: true, state: 'INCOMPLETE', flags, reason }
    }
  }
}

/**
 * The status of a row, in a fixed precedence (first match wins):
 * DST_UNRESOLVED → COUNTER_RESET_UNRESOLVED → BASELINE_INVALID → COMPARISON_INVALID → BOTH_MISSING → BASELINE_MISSING →
 * COMPARISON_MISSING → COMPARABLE. A blocked or otherwise unusable side counts as INVALID (its `reason` says why).
 */
export function rowStatus(b: SideInfo, c: SideInfo): ComparisonRowStatus {
  if (b.reason === 'DST_UNRESOLVED' || c.reason === 'DST_UNRESOLVED') return 'DST_UNRESOLVED'
  if (b.reason === 'COUNTER_RESET_UNRESOLVED' || c.reason === 'COUNTER_RESET_UNRESOLVED') return 'COUNTER_RESET_UNRESOLVED'
  const invalid = (s: SideInfo) => s.state === 'INVALID' || s.state === 'INCOMPLETE' || s.state === 'BLOCKED'
  if (invalid(b)) return 'BASELINE_INVALID'
  if (invalid(c)) return 'COMPARISON_INVALID'
  if (b.state === 'MISSING' && c.state === 'MISSING') return 'BOTH_MISSING'
  if (b.state === 'MISSING') return 'BASELINE_MISSING'
  if (c.state === 'MISSING') return 'COMPARISON_MISSING'
  return 'COMPARABLE'
}

export function rowQuality(b: SideInfo, c: SideInfo): { dataQuality: ScadaDataQualityState; qualityFlags: ScadaDataQualityState[] } {
  const flags = new Set<ScadaDataQualityState>([...b.flags, ...c.flags])
  const sorted = sortFlags(flags.size === 0 ? ['VALID'] : flags)
  return { dataQuality: mostCritical(sorted), qualityFlags: sorted }
}
