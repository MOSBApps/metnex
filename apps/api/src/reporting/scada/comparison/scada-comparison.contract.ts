import type { ScadaDataQualityState } from '../quality/scada-data-quality.contract'
import type { ScadaSeriesInterval, ScadaSeriesOutput } from '../series/scada-series.contract'

/**
 * TASK-027.69 — period and source comparison: PURE data contracts. Nothing here (or in an output) carries SQL, a schema or
 * physical database name, a connection string, a credential/token/hash, a raw driver error or unbounded user text.
 */

export type ComparisonRowStatus =
  | 'COMPARABLE'
  | 'BASELINE_MISSING'
  | 'COMPARISON_MISSING'
  | 'BOTH_MISSING'
  | 'BASELINE_INVALID'
  | 'COMPARISON_INVALID'
  | 'DST_UNRESOLVED'
  | 'COUNTER_RESET_UNRESOLVED'
  | 'SERIES_UNMAPPED'
  | 'BUCKET_UNMATCHED'
  | 'PERIOD_INCOMPATIBLE'

/** Static block codes: the comparison is refused as a whole, nothing is converted silently. */
export type ComparisonBlockCode =
  | 'TENANT_SCOPE_BLOCKED'
  | 'BUCKET_INTERVAL_MISMATCH'
  | 'TIMEZONE_MISMATCH'
  | 'SERIES_MAPPING_REQUIRED'
  | 'SOURCE_MAPPING_REQUIRED'
  | 'PERIOD_RANGE_INVALID'
  | 'PERIOD_INCOMPATIBLE'

export type SideReason =
  | 'SERIES_ANALYSIS_BLOCKED'
  | 'DST_UNRESOLVED'
  | 'COUNTER_RESET_UNRESOLVED'
  | 'INVALID_NUMERIC_VALUE'
  | 'MISSING_VALUE'
  | 'INCOMPLETE_BUCKET'
  | 'DUPLICATE_BUCKET'
  | 'BUCKET_ABSENT'
  | 'SERIES_ABSENT'
  | 'NUMERIC_OVERFLOW'

/** Why ONE side of a row is (not) usable — both sides are always visible. */
export interface SideInfo {
  present: boolean
  state: 'VALID' | 'MISSING' | 'INVALID' | 'INCOMPLETE' | 'BLOCKED' | 'ABSENT'
  flags: ScadaDataQualityState[]
  reason: SideReason | null
}

export interface SeriesRef {
  sourceCatalogId: string
  seriesKey: string
}

/** An EXPLICIT pairing supplied in the call. There is no positional or name-similarity pairing anywhere. */
export interface SeriesMappingEntry {
  baseline: SeriesRef
  comparison: SeriesRef
}

export interface ComparisonOptions {
  /** The ONE rounding point (applies to every delta alike). null / absent = no rounding (rounding is presentation). */
  decimals?: number | null
}

export interface ComparisonPeriod {
  startAt: string
  endAt: string
  bucketInterval: ScadaSeriesInterval
  timezone: string
  customerRootTenantId: string
  /** Normalised series results of TASK-027.68 (already tenant-filtered there; re-checked here). */
  series: readonly ScadaSeriesOutput[]
}

export interface PeriodComparisonRequest {
  customerRootTenantId: string
  baselinePeriod: ComparisonPeriod
  comparisonPeriod: ComparisonPeriod
  seriesMapping?: readonly SeriesMappingEntry[]
  /** Display names of the sources (bounded printable text) for the chart contract; absent ⇒ no label. */
  sourceLabels?: Readonly<Record<string, string>>
  options?: ComparisonOptions
}

export interface ComparisonSource {
  sourceCatalogId: string
  /** Display name only (bounded printable text). */
  label: string
  series: readonly ScadaSeriesOutput[]
}

export interface SourceComparisonRequest {
  customerRootTenantId: string
  /** ONE shared period: both sources are compared over the very same instants. */
  period: { startAt: string; endAt: string; bucketInterval: ScadaSeriesInterval; timezone: string }
  leftSource: ComparisonSource
  rightSource: ComparisonSource
  /** Explicit declaration that these two sources may be compared (null / mismatching ⇒ blocked). */
  sourceMapping: { leftSourceCatalogId: string; rightSourceCatalogId: string } | null
  seriesMapping?: readonly SeriesMappingEntry[]
  options?: ComparisonOptions
}

export interface ComparisonRow {
  seriesKey: string
  comparisonSeriesKey: string
  seriesLabel: string
  comparisonSeriesLabel: string
  baselineSourceCatalogId: string
  comparisonSourceCatalogId: string
  bucketInterval: ScadaSeriesInterval
  /** UTC start of the baseline / comparison bucket (null when that side has none or no trustworthy instant). */
  baselineBucketStartUtc: string | null
  comparisonBucketStartUtc: string | null
  /** Period mode: the bucket's offset from its own period start in the period's LOCAL wall clock (ms); source mode: null. */
  relativeOffsetMs: number | null
  baselineValue: number | null
  comparisonValue: number | null
  /** comparison − baseline; null unless the row is COMPARABLE. */
  absoluteDelta: number | null
  /** (comparison − baseline) / |baseline| × 100; null when baseline is 0 or the row is not COMPARABLE. */
  percentageDelta: number | null
  status: ComparisonRowStatus
  /** The reason of the ROW when it is not simply the state of a side (e.g. NUMERIC_OVERFLOW). */
  reason: SideReason | null
  baselineSide: SideInfo
  comparisonSide: SideInfo
  /** Most critical quality state of both sides (central 027.67 ordering) and the union of their flags. */
  dataQuality: ScadaDataQualityState
  qualityFlags: ScadaDataQualityState[]
}

export interface UnmatchedSeries {
  side: 'BASELINE' | 'COMPARISON'
  seriesKey: string
  sourceCatalogId: string
  seriesLabel: string
}

export type Comparability = 'COMPARABLE' | 'PARTIALLY_COMPARABLE' | 'NO_COMPARABLE_DATA'

export interface ComparisonSummary {
  totalRows: number
  comparableRows: number
  baselineMissingRows: number
  comparisonMissingRows: number
  invalidRows: number
  /** DST_UNRESOLVED + COUNTER_RESET_UNRESOLVED rows: present on both sides but not trustworthy. */
  unresolvedRows: number
  unmatchedBuckets: number
  unmatchedSeries: number
  /** Σ absoluteDelta over comparable rows (signed net difference); null without comparable rows — never 0. */
  totalAbsoluteDelta: number | null
  averageAbsoluteDelta: number | null
  /** The largest SIGNED difference (most positive absoluteDelta). NOT a magnitude: `largestMagnitudeDelta` is the canonical "highest absolute difference". */
  maxSignedDelta: number | null
  /** CANONICAL "highest absolute difference": the absoluteDelta with the largest MAGNITUDE (keeps its sign). */
  largestMagnitudeDelta: number | null
  maxPercentageDelta: number | null
  dataQuality: ScadaDataQualityState
  comparability: Comparability
}

export interface ScadaComparisonResult {
  status: 'OK' | 'BLOCKED'
  code: ComparisonBlockCode | null
  mode: 'PERIOD' | 'SOURCE'
  customerRootTenantId: string
  bucketInterval: ScadaSeriesInterval | null
  rows: ComparisonRow[]
  unmatchedSeries: UnmatchedSeries[]
  /** sourceCatalogId → display name, only for the sources of this (tenant-checked) comparison. */
  sourceLabels: Record<string, string>
  summary: ComparisonSummary
}

// ---------------------------------------------------------------- chart consumption (TASK-027.73)

export interface ComparisonChartRow {
  t: string | null
  comparisonT: string | null
  seriesLabel: string
  comparisonSeriesLabel: string
  sourceLabel: string
  comparisonSourceLabel: string
  baseline: number | null
  comparison: number | null
  absoluteDelta: number | null
  percentageDelta: number | null
  quality: ScadaDataQualityState
  status: ComparisonRowStatus
  /** Static, explanatory code (side reasons); null for a clean COMPARABLE row. */
  reasonCode: SideReason | null
  baselineReason: SideReason | null
  comparisonReason: SideReason | null
}

export interface ComparisonChartData {
  status: 'OK' | 'BLOCKED'
  code: ComparisonBlockCode | null
  mode: 'PERIOD' | 'SOURCE'
  bucketInterval: ScadaSeriesInterval | null
  comparability: Comparability
  rows: ComparisonChartRow[]
  unmatchedSeries: UnmatchedSeries[]
  summary: ComparisonSummary
}
