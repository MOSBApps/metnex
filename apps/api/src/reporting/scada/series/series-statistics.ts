import type { ScadaOutputBucket, ScadaStatisticResult } from './scada-series.contract'

/** Neumaier-compensated sum: deterministic and accurate for long series. */
export function compensatedSum(values: readonly number[]): number {
  let sum = 0
  let c = 0
  for (const v of values) {
    const t = sum + v
    c += Math.abs(sum) >= Math.abs(v) ? sum - t + v : v - t + sum
    sum = t
  }
  return sum + c
}

export const emptyStatistics = (status: ScadaStatisticResult['status'], counts: Pick<ScadaStatisticResult, 'count' | 'validCount' | 'missingCount' | 'invalidCount' | 'incompleteCount'>): ScadaStatisticResult => ({
  status,
  sum: null,
  average: null,
  min: null,
  max: null,
  ...counts,
})

/**
 * SUM / AVERAGE / MIN / MAX over the VALID buckets ONLY (a real 0 counts, a null / invalid / unresolved / incomplete
 * bucket never does), plus COUNT / VALID / MISSING / INVALID / INCOMPLETE counts. Nothing valid ⇒ every value is null
 * (never 0) and the status says NO_VALID_DATA. A blocked series gets the counts but no values.
 */
export function computeStatistics(buckets: readonly ScadaOutputBucket[], blocked: boolean): ScadaStatisticResult {
  const counts = {
    count: buckets.length,
    validCount: buckets.filter(b => b.classification === 'VALID').length,
    missingCount: buckets.filter(b => b.classification === 'MISSING').length,
    invalidCount: buckets.filter(b => b.classification === 'INVALID').length,
    incompleteCount: buckets.filter(b => b.classification === 'INCOMPLETE').length,
  }
  if (blocked) return emptyStatistics('BLOCKED', counts)
  const values = buckets.filter(b => b.classification === 'VALID').map(b => b.value as number)
  if (values.length === 0) return emptyStatistics('NO_VALID_DATA', counts)
  const sum = compensatedSum(values)
  const average = sum / values.length
  return {
    status: Number.isFinite(sum) && Number.isFinite(average) ? 'OK' : 'NO_VALID_DATA',
    sum: Number.isFinite(sum) ? sum : null,
    average: Number.isFinite(average) ? average : null,
    min: values.reduce((a, b) => (b < a ? b : a)),
    max: values.reduce((a, b) => (b > a ? b : a)),
    ...counts,
  }
}
