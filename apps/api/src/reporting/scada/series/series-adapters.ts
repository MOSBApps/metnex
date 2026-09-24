import type { ScadaAggregationBucketResult } from '../aggregation/scada-aggregation.contract'
import type { ScadaDataQualityState, ScadaQualityResult, ScadaQualityResultRow } from '../quality/scada-data-quality.contract'
import type { ScadaSeriesBucketInput } from './scada-series.contract'

/**
 * 027.67 quality rows of ONE series → buckets. The plotted value of an INDEX series is its (possibly null) delta, of a
 * REAL_VALUE series its raw value. Rows without a trustworthy instant keep `bucketStartUtc = null`.
 */
export function bucketsFromQualityRows(rows: readonly ScadaQualityResultRow[]): ScadaSeriesBucketInput[] {
  return rows.map(r => ({
    recordId: r.recordId,
    bucketStartUtc: r.occurredAtUtc,
    localWallTime: r.localWallTime,
    value: r.deltaValue,
    dataQuality: r.dataQuality,
    qualityFlags: [...r.qualityFlags],
    isComplete: r.isComplete,
  }))
}

/**
 * Per-series `analysisAllowed` from a quality result: the time zone must be verified AND the series itself must have no
 * unresolved DST reading — another series' DST problem never changes this series' state (series isolation).
 */
export function analysisAllowedForSeries(result: Pick<ScadaQualityResult, 'timeZoneStatus'>, rows: readonly ScadaQualityResultRow[]): boolean {
  return result.timeZoneStatus === 'VERIFIED' && !rows.some(r => r.dstResolution === 'AMBIGUOUS' || r.dstResolution === 'GAP')
}

const AGGREGATION_TO_QUALITY: Readonly<Record<string, ScadaDataQualityState>> = { OK: 'VALID' }

/** 027.66 bucket results of ONE series → buckets (`OK` is the engine's word for VALID). */
export function bucketsFromAggregation(rows: readonly ScadaAggregationBucketResult[]): ScadaSeriesBucketInput[] {
  return rows.map((r, i) => {
    const quality = (AGGREGATION_TO_QUALITY[r.dataQuality] ?? r.dataQuality) as ScadaDataQualityState
    return {
      recordId: `${r.seriesKey}:${r.bucketStartUtc}:${i}`,
      bucketStartUtc: r.bucketStartUtc,
      value: r.deltaValue,
      dataQuality: quality,
      qualityFlags: [quality],
      isComplete: r.isComplete,
    }
  })
}

/**
 * TASK-027.72-R1 — DST-aware 027.66 results of ONE series → buckets. Untimed buckets keep `bucketStartUtc = null` and their DST
 * flags (they are listed after the timed ones and are never analysable); nothing is dropped and no instant is invented.
 */
export function bucketsFromDstAware(rows: readonly import('../aggregation/dst-aware-aggregation').ScadaDstAwareBucket[]): ScadaSeriesBucketInput[] {
  return rows.map(r => ({
    recordId: r.recordId,
    bucketStartUtc: r.bucketStartUtc,
    localWallTime: r.localWallTime,
    value: r.value,
    dataQuality: r.dataQuality,
    qualityFlags: [...r.qualityFlags],
    isComplete: r.isComplete,
  }))
}
