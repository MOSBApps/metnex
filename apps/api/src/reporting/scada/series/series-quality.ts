import { COMPLETE_SAFE_STATES, mostCritical, sortFlags, type ScadaDataQualityState } from '../quality/scada-data-quality.contract'
import type { BucketClass, ScadaOutputBucket, ScadaQualitySummary, ScadaSeriesBucketInput } from './scada-series.contract'

/** Flags that stop a bucket from being a valid, complete value (everything except the resolved/explained ones — central 027.67 set). */
const blockingFlags = (flags: readonly ScadaDataQualityState[]) => flags.filter(f => !COMPLETE_SAFE_STATES.includes(f))

/**
 * Exclusive classification of ONE bucket (its four classes add up to COUNT in the statistics):
 *  INVALID    — an invalid number (flag or non-finite value);
 *  INCOMPLETE — any other blocking condition (unresolved counter reset / DST, duplicate, no next reading, incomplete
 *               bucket, unverified time zone …) or `isComplete = false`: the value, if any, is NOT used;
 *  MISSING    — no value and nothing else wrong with it;
 *  VALID      — a real, complete, unflagged number (a real 0 is VALID).
 */
export function classifyBucket(b: Pick<ScadaSeriesBucketInput, 'value' | 'qualityFlags' | 'isComplete'>): BucketClass {
  const flags = b.qualityFlags
  if (flags.includes('INVALID_NUMERIC_VALUE') || (typeof b.value === 'number' && !Number.isFinite(b.value))) return 'INVALID'
  const blocking = blockingFlags(flags).filter(f => f !== 'MISSING_VALUE')
  if (blocking.length > 0) return 'INCOMPLETE'
  if (b.value === null || b.value === undefined) return b.isComplete || flags.includes('MISSING_VALUE') || flags.length === 0 ? 'MISSING' : 'INCOMPLETE'
  return b.isComplete ? 'VALID' : 'INCOMPLETE'
}

export function toOutputBucket(b: ScadaSeriesBucketInput): ScadaOutputBucket {
  return {
    recordId: b.recordId,
    bucketStartUtc: b.bucketStartUtc,
    localWallTime: b.localWallTime ?? null,
    value: typeof b.value === 'number' && Number.isFinite(b.value) ? b.value : null,
    dataQuality: b.dataQuality,
    qualityFlags: sortFlags(b.qualityFlags.length ? b.qualityFlags : ['VALID']),
    isComplete: b.isComplete,
    classification: classifyBucket(b),
  }
}

/** Per-series quality summary; the severity comes from the ONE central ordering of TASK-027.67 (`mostCritical`). */
export function summariseQuality(buckets: readonly ScadaOutputBucket[], analysisAllowed: boolean): ScadaQualitySummary {
  const has = (b: ScadaOutputBucket, f: ScadaDataQualityState) => b.qualityFlags.includes(f) || b.dataQuality === f
  const all = new Set<ScadaDataQualityState>()
  for (const b of buckets) for (const f of b.qualityFlags) all.add(f)
  return {
    totalBuckets: buckets.length,
    validBuckets: buckets.filter(b => b.classification === 'VALID').length,
    missingValues: buckets.filter(b => has(b, 'MISSING_VALUE') || b.classification === 'MISSING').length,
    invalidValues: buckets.filter(b => has(b, 'INVALID_NUMERIC_VALUE') || b.classification === 'INVALID').length,
    counterResetUnresolved: buckets.filter(b => has(b, 'COUNTER_RESET_UNRESOLVED')).length,
    dstAmbiguous: buckets.filter(b => has(b, 'DST_AMBIGUOUS')).length,
    dstNonexistent: buckets.filter(b => has(b, 'DST_NONEXISTENT')).length,
    incompleteBuckets: buckets.filter(b => has(b, 'INCOMPLETE_BUCKET')).length,
    analysisAllowed,
    highestSeverity: mostCritical(all.size === 0 ? ['VALID'] : [...all]),
  }
}
