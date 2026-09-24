/**
 * TASK-027.66 — SCADA Aggregation Contract
 * Quality codes, input/output structures, and policy ports for SCADA Hourly & Daily Aggregation Engine.
 */

export type DataQualityCode =
  | 'OK'
  | 'MISSING_VALUE'
  | 'DUPLICATE_TIMESTAMP'
  | 'INSUFFICIENT_NEXT_READING'
  | 'NEGATIVE_DELTA'
  | 'COUNTER_RESET_RESOLVED'
  | 'COUNTER_RESET_UNRESOLVED'
  | 'INVALID_NUMERIC_VALUE'
  | 'INCOMPLETE_BUCKET'

export interface ScadaNormalizedInputRow {
  occurredAtUtc: string
  recordId: string
  seriesKey: string
  rawValue: number | null
  valueType: 'INDEX' | 'MEASUREMENT'
  sourceCatalogId: string
  dataQuality: DataQualityCode
  isBufferRow?: boolean
}

export interface ScadaAggregationBucketResult {
  bucketStartUtc: string
  bucketEndUtc: string
  seriesKey: string
  valueType: 'INDEX' | 'MEASUREMENT'
  rawValue: number | null
  deltaValue: number | null
  dataQuality: DataQualityCode
  isComplete: boolean
  sourceCatalogId: string
}

export interface ScadaSeriesAggregationPolicy {
  seriesKey: string
  valueType: 'INDEX' | 'MEASUREMENT'
  hourlyOperation?: 'LEAD_DELTA' | 'SUM' | 'AVERAGE' | 'MIN' | 'MAX' | 'RAW'
  dailyOperation?: 'SUM' | 'AVERAGE' | 'MIN' | 'MAX'
  timezone?: string // Default 'tr-TR' or 'UTC'
}

export interface ScadaAggregationResult {
  hourly: ScadaAggregationBucketResult[]
  daily: ScadaAggregationBucketResult[]
  seriesQualitySummary: Record<string, DataQualityCode[]>
}
