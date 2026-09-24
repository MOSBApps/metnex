import type { ScadaDataQualityState } from '../quality/scada-data-quality.contract'
import type { TenantRecord } from '../catalog/tenant-guards'

/**
 * TASK-027.68 — multi-series statistics: PURE data contracts (no SQL, no table/schema/database name, no connection or
 * driver information, no credential, no unbounded user text, no formatting — formatting is the UI's).
 */

export type ScadaSeriesValueType = 'INDEX' | 'REAL_VALUE'
export type ScadaSeriesInterval = 'HOURLY' | 'DAILY'

/** Static output-safety bounds for the only free texts (they are not performance thresholds). */
export const MAX_SERIES_LABEL_LENGTH = 128
export const MAX_SERIES_UNIT_LENGTH = 32

/** Static codes (never a message from an exception, never a name or a value). */
export type ScadaSeriesCode =
  | 'NO_VALID_DATA'
  | 'SERIES_ANALYSIS_BLOCKED'
  | 'TENANT_SCOPE_BLOCKED'
  | 'DST_UNRESOLVED'
  | 'COUNTER_RESET_UNRESOLVED'
  | 'INVALID_STATISTICS_INPUT'
  | 'INCOMPLETE_BUCKET'
  | 'MULTI_SERIES_PARTIAL_RESULT'

/** How one bucket counts in the statistics (exclusive; the four counts add up to COUNT). */
export type BucketClass = 'VALID' | 'MISSING' | 'INVALID' | 'INCOMPLETE'

/** One bucket as produced by 027.66 / 027.67 (see the adapters). */
export interface ScadaSeriesBucketInput {
  recordId: string
  /** UTC start of the bucket; null for a reading without a trustworthy instant (unresolved DST). */
  bucketStartUtc: string | null
  localWallTime?: string | null
  /** The value to aggregate; null = no value (never 0). */
  value: number | null
  dataQuality: ScadaDataQualityState
  qualityFlags: readonly ScadaDataQualityState[]
  isComplete: boolean
  /** Forward-read buffer rows never reach an output or a statistic. */
  isBufferRow?: boolean
}

export interface ScadaSeriesInput {
  seriesKey: string
  /** Display name only. */
  label: string
  unit: string
  valueType: ScadaSeriesValueType
  sourceCatalogId: string
  /** Required: the customer root this series belongs to (never derived from user input). */
  customerRootTenantId: string
  /** The tenant the source is mapped to (catalog RESOLVED mapping); null ⇒ unresolved. */
  tenant: TenantRecord | null
  mappingResolved: boolean
  /** False (time zone unverified, unresolved series, …) ⇒ no statistic is produced for this series. */
  analysisAllowed: boolean
  buckets: readonly ScadaSeriesBucketInput[]
}

/** The scope as resolved by `TenantScopeService.resolve()` — never built from client input. */
export interface ScadaSeriesScope {
  tenantId: string
  customerRootTenantId: string
  dataScopeTenantIds: readonly string[]
}

export interface ScadaSeriesRequest {
  scope: ScadaSeriesScope
  /** Half-open [startAt, endAt), ISO instants. */
  range: { startAt: string; endAt: string }
  interval: ScadaSeriesInterval
  series: readonly ScadaSeriesInput[]
}

// ---------------------------------------------------------------- output

export interface ScadaOutputBucket {
  recordId: string
  bucketStartUtc: string | null
  localWallTime: string | null
  value: number | null
  dataQuality: ScadaDataQualityState
  qualityFlags: ScadaDataQualityState[]
  isComplete: boolean
  classification: BucketClass
}

/** Counts of buckets carrying each condition (a bucket may carry several). Severity comes from the 027.67 constant. */
export interface ScadaQualitySummary {
  totalBuckets: number
  validBuckets: number
  missingValues: number
  invalidValues: number
  counterResetUnresolved: number
  dstAmbiguous: number
  dstNonexistent: number
  incompleteBuckets: number
  analysisAllowed: boolean
  highestSeverity: ScadaDataQualityState
}

export interface ScadaStatisticResult {
  status: 'OK' | 'NO_VALID_DATA' | 'BLOCKED'
  /** null when there is nothing valid to aggregate — never a misleading 0. */
  sum: number | null
  average: number | null
  min: number | null
  max: number | null
  count: number
  validCount: number
  missingCount: number
  invalidCount: number
  incompleteCount: number
}

export interface ScadaSeriesOutput {
  seriesKey: string
  label: string
  unit: string
  valueType: ScadaSeriesValueType
  sourceCatalogId: string
  customerRootTenantId: string
  analysisAllowed: boolean
  status: 'OK' | 'NO_VALID_DATA' | 'BLOCKED'
  /** Static codes explaining the state (blocked / unresolved / incomplete / no data). */
  codes: ScadaSeriesCode[]
  buckets: ScadaOutputBucket[]
  statistics: ScadaStatisticResult
  qualitySummary: ScadaQualitySummary
  /** Buckets left out because they lie outside [startAt, endAt) (buffer rows are not counted at all). */
  outOfRangeBuckets: number
}

export interface ScadaMultiSeriesResult {
  status: 'OK' | 'PARTIAL' | 'BLOCKED'
  /** null when OK; MULTI_SERIES_PARTIAL_RESULT / SERIES_ANALYSIS_BLOCKED / TENANT_SCOPE_BLOCKED / INVALID_STATISTICS_INPUT. */
  code: ScadaSeriesCode | null
  customerRootTenantId: string
  interval: ScadaSeriesInterval
  range: { startAt: string; endAt: string }
  /** Sorted by seriesKey, then sourceCatalogId. */
  series: ScadaSeriesOutput[]
  /** Series left out of the analysis, with a static code (own-scope series only; foreign series appear nowhere). */
  excluded: Array<{ seriesKey: string | null; sourceCatalogId: string | null; code: ScadaSeriesCode }>
}

// ---------------------------------------------------------------- chart consumption (TASK-027.73)

export interface ScadaChartPoint {
  /** UTC bucket start; null = a reading with no trustworthy time (unresolved DST), listed after the timed points. */
  t: string | null
  value: number | null
  quality: ScadaDataQualityState
  /** true = no value here (a gap — never plotted as 0). */
  missing: boolean
  /** true = present but doubtful / excluded from the statistics (invalid, unresolved, incomplete). */
  suspect: boolean
}

export interface ScadaChartSeries {
  seriesKey: string
  sourceCatalogId: string
  title: string
  unit: string
  valueType: ScadaSeriesValueType
  analysisAllowed: boolean
  status: 'OK' | 'NO_VALID_DATA' | 'BLOCKED'
  codes: ScadaSeriesCode[]
  points: ScadaChartPoint[]
  statistics: ScadaStatisticResult
  qualitySummary: ScadaQualitySummary
}

export interface ScadaChartConsumption {
  status: 'OK' | 'PARTIAL' | 'BLOCKED'
  code: ScadaSeriesCode | null
  interval: ScadaSeriesInterval
  /** The filtered range the numbers were computed for. */
  range: { startAt: string; endAt: string }
  series: ScadaChartSeries[]
  excluded: ScadaMultiSeriesResult['excluded']
}
