import type {
  ScadaAggregationBucketResult,
  ScadaNormalizedInputRow,
  ScadaSeriesAggregationPolicy,
} from './scada-aggregation.contract'

import { handleNegativeDelta, type RolloverPolicyPort } from './negative-delta.policy'

export class ScadaAggregationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScadaAggregationError'
  }
}

/**
 * Aggregates a normalized input time series into hourly bucket results.
 * Pure function: zero I/O, zero random state, zero input mutation.
 */
export function aggregateHourlySeries(
  inputRows: readonly ScadaNormalizedInputRow[],
  policy: ScadaSeriesAggregationPolicy,
  rolloverPort?: RolloverPolicyPort
): ScadaAggregationBucketResult[] {
  if (!inputRows) {
    return []
  }

  // Pure function immutability check — copy array for internal processing
  const rows = inputRows.map(r => ({ ...r }))

  if (rows.length === 0) {
    return []
  }

  // Determinisic sorting by occurredAtUtc ascending
  rows.sort((a, b) => {
    const timeA = new Date(a.occurredAtUtc).getTime()
    const timeB = new Date(b.occurredAtUtc).getTime()
    if (timeA !== timeB) return timeA - timeB
    return a.recordId.localeCompare(b.recordId)
  })

  // Validate valueType consistency with policy
  const valueType = policy.valueType || 'INDEX'

  if (valueType === 'MEASUREMENT') {
    if (!policy.hourlyOperation) {
      throw new ScadaAggregationError(
        `Fail-closed: Missing hourlyOperation catalog policy for MEASUREMENT series '${policy.seriesKey}'`
      )
    }

    const results: ScadaAggregationBucketResult[] = []
    for (const r of rows) {
      if (r.isBufferRow) continue // Buffer rows are excluded from user output

      const isNull = r.rawValue === null || r.rawValue === undefined
      results.push({
        bucketStartUtc: r.occurredAtUtc,
        bucketEndUtc: r.occurredAtUtc,
        seriesKey: r.seriesKey,
        valueType: 'MEASUREMENT',
        rawValue: r.rawValue,
        deltaValue: isNull ? null : r.rawValue,
        dataQuality: isNull ? 'MISSING_VALUE' : (r.dataQuality || 'OK'),
        isComplete: !isNull,
        sourceCatalogId: r.sourceCatalogId,
      })
    }
    return results
  }

  // INDEX Aggregation: Q-W501 LEAD(next) - current delta
  const results: ScadaAggregationBucketResult[] = []

  for (let i = 0; i < rows.length; i += 1) {
    const current = rows[i]!

    // Buffer rows only participate in providing boundary readings; they are excluded from output
    if (current.isBufferRow) continue

    const next = rows[i + 1]

    // Check for duplicate timestamp in sequence
    const hasDuplicateTimestamp =
      (i > 0 && rows[i - 1]?.occurredAtUtc === current.occurredAtUtc) ||
      (next && next.occurredAtUtc === current.occurredAtUtc)

    // Case 1: Last reading in sequence (no next reading available)
    if (!next) {
      results.push({
        bucketStartUtc: current.occurredAtUtc,
        bucketEndUtc: current.occurredAtUtc,
        seriesKey: current.seriesKey,
        valueType: 'INDEX',
        rawValue: current.rawValue,
        deltaValue: null,
        dataQuality: hasDuplicateTimestamp ? 'DUPLICATE_TIMESTAMP' : 'INSUFFICIENT_NEXT_READING',
        isComplete: false,
        sourceCatalogId: current.sourceCatalogId,
      })
      continue
    }

    // Case 2: Duplicate timestamp
    if (hasDuplicateTimestamp) {
      results.push({
        bucketStartUtc: current.occurredAtUtc,
        bucketEndUtc: next.occurredAtUtc,
        seriesKey: current.seriesKey,
        valueType: 'INDEX',
        rawValue: current.rawValue,
        deltaValue: null,
        dataQuality: 'DUPLICATE_TIMESTAMP',
        isComplete: false,
        sourceCatalogId: current.sourceCatalogId,
      })
      continue
    }

    // Case 3: Missing raw value in current or next reading
    if (current.rawValue === null || current.rawValue === undefined || next.rawValue === null || next.rawValue === undefined) {
      results.push({
        bucketStartUtc: current.occurredAtUtc,
        bucketEndUtc: next.occurredAtUtc,
        seriesKey: current.seriesKey,
        valueType: 'INDEX',
        rawValue: current.rawValue,
        deltaValue: null,
        dataQuality: 'MISSING_VALUE',
        isComplete: false,
        sourceCatalogId: current.sourceCatalogId,
      })
      continue
    }

    // Case 4: Negative delta (next < current)
    if (next.rawValue < current.rawValue) {
      const negativeEval = handleNegativeDelta(
        current.rawValue,
        next.rawValue,
        current.seriesKey,
        current.sourceCatalogId,
        rolloverPort
      )

      results.push({
        bucketStartUtc: current.occurredAtUtc,
        bucketEndUtc: next.occurredAtUtc,
        seriesKey: current.seriesKey,
        valueType: 'INDEX',
        rawValue: current.rawValue,
        deltaValue: negativeEval.deltaValue,
        dataQuality: negativeEval.dataQuality,
        isComplete: negativeEval.isComplete,
        sourceCatalogId: current.sourceCatalogId,
      })
      continue
    }

    // Case 5: Normal positive delta (next >= current)
    const delta = Math.round((next.rawValue - current.rawValue) * 10000) / 10000
    results.push({
      bucketStartUtc: current.occurredAtUtc,
      bucketEndUtc: next.occurredAtUtc,
      seriesKey: current.seriesKey,
      valueType: 'INDEX',
      rawValue: current.rawValue,
      deltaValue: delta,
      dataQuality: 'OK',
      isComplete: true,
      sourceCatalogId: current.sourceCatalogId,
    })
  }

  return results
}
