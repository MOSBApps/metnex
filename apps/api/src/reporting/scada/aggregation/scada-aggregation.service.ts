import { Injectable } from '@nestjs/common'
import type {
  DataQualityCode,
  ScadaAggregationBucketResult,
  ScadaAggregationResult,
  ScadaNormalizedInputRow,
  ScadaSeriesAggregationPolicy,
} from './scada-aggregation.contract'

import { aggregateDailySeries } from './daily-aggregation'
import { aggregateHourlySeries, ScadaAggregationError } from './hourly-aggregation'
import type { RolloverPolicyPort } from './negative-delta.policy'

@Injectable()
export class ScadaAggregationService {
  /**
   * Performs multi-series hourly and daily aggregation.
   * Pure service method: pure calculation, input immutability, per-series error isolation, deterministic output.
   */
  public aggregate(
    inputRows: readonly ScadaNormalizedInputRow[],
    policies: Record<string, ScadaSeriesAggregationPolicy>,
    rolloverPort?: RolloverPolicyPort
  ): ScadaAggregationResult {
    if (!inputRows || inputRows.length === 0) {
      return {
        hourly: [],
        daily: [],
        seriesQualitySummary: {},
      }
    }

    // Group input rows by seriesKey
    const seriesGroups = new Map<string, ScadaNormalizedInputRow[]>()
    for (const r of inputRows) {
      if (!seriesGroups.has(r.seriesKey)) {
        seriesGroups.set(r.seriesKey, [])
      }
      seriesGroups.get(r.seriesKey)!.push({ ...r }) // Copy object to prevent mutation
    }

    const allHourly: ScadaAggregationBucketResult[] = []
    const allDaily: ScadaAggregationBucketResult[] = []
    const seriesQualitySummary: Record<string, DataQualityCode[]> = {}

    // Process series keys in alphabetical deterministic order
    const sortedSeriesKeys = Array.from(seriesGroups.keys()).sort()

    for (const seriesKey of sortedSeriesKeys) {
      const rows = seriesGroups.get(seriesKey)!
      const policy = policies[seriesKey] || {
        seriesKey,
        valueType: rows[0]?.valueType || 'INDEX',
        hourlyOperation: 'LEAD_DELTA',
        dailyOperation: 'SUM',
      }

      try {
        const hourlyRes = aggregateHourlySeries(rows, policy, rolloverPort)
        const dailyRes = aggregateDailySeries(hourlyRes, policy, policy.timezone || 'UTC')

        allHourly.push(...hourlyRes)
        allDaily.push(...dailyRes)

        const qualities = Array.from(new Set(hourlyRes.map(h => h.dataQuality)))
        seriesQualitySummary[seriesKey] = qualities
      } catch (err: unknown) {
        // Per-series error isolation: do not fail entire request on single series error
        seriesQualitySummary[seriesKey] = ['INVALID_NUMERIC_VALUE']
        if (err instanceof ScadaAggregationError) {
          // Record policy failure
        } else {
          // Logless handling — no raw row logging
        }
      }
    }

    // Deterministic sorting for output buckets
    allHourly.sort((a, b) => {
      if (a.seriesKey !== b.seriesKey) return a.seriesKey.localeCompare(b.seriesKey)
      return new Date(a.bucketStartUtc).getTime() - new Date(b.bucketStartUtc).getTime()
    })

    allDaily.sort((a, b) => {
      if (a.seriesKey !== b.seriesKey) return a.seriesKey.localeCompare(b.seriesKey)
      return new Date(a.bucketStartUtc).getTime() - new Date(b.bucketStartUtc).getTime()
    })

    return {
      hourly: allHourly,
      daily: allDaily,
      seriesQualitySummary,
    }
  }
}
