import type { ScadaReadScope } from '../adapter/scada-readonly.port'

export const SCADA_INTERVALS = ['HOURLY', 'DAILY'] as const
export type ScadaInterval = (typeof SCADA_INTERVALS)[number]

export const SCADA_VALUE_TYPES = ['INDEX', 'REAL_VALUE'] as const
export type ScadaValueType = (typeof SCADA_VALUE_TYPES)[number]

/**
 * Which interval / value type pairs are allowed. No decision forbids a combination (Q-W501 fixes the hourly
 * index delta, nothing fixes the others), so every pair is allowed; a future decision narrows THIS table only.
 */
export const SCADA_INTERVAL_VALUE_TYPE_COMPATIBILITY: Readonly<Record<ScadaValueType, readonly ScadaInterval[]>> = {
  INDEX: ['HOURLY', 'DAILY'],
  REAL_VALUE: ['HOURLY', 'DAILY'],
}

/**
 * The analysis request. Deliberately no sql / database / schema / filters / connection string / correlation id /
 * free identifier: unknown fields are rejected. `startAt`/`endAt` are absolute instants (`Date`); a naive
 * date-time string is never accepted (it would silently be assumed UTC). `tenantScope` must be the output of
 * `TenantScopeService.resolve()`, never something built from client input.
 */
export interface ScadaAnalysisQuery {
  catalogId: string
  table: string
  /** Measurement columns only; the service adds the catalog's date/time columns itself. */
  columns: readonly string[]
  valueType: ScadaValueType
  dateColumn: string
  timeColumn: string
  startAt: Date
  endAt: Date
  interval: ScadaInterval
  tenantScope: ScadaReadScope
  signal?: AbortSignal
}

export type ScadaRawDataQuality = 'VALID' | 'MISSING' | 'INVALID' | 'UNVERIFIED'

/** One normalised raw reading. No delta, no roll-over handling, no clamping of negative values here. */
/**
 * DST resolution of the source wall time:
 *  - NORMAL: one unambiguous instant;
 *  - AMBIGUOUS: the wall time happened TWICE and the source gave NO fold/offset information → the instant is UNKNOWN:
 *    `occurredAtUtc` is null (never the first pass by guess) and both possible instants are listed in `dstCandidatesUtc`;
 *  - AMBIGUOUS_RESOLVED: repeated wall time, but the source supplied the fold → placed at its true instant;
 *  - GAP: the wall time does NOT EXIST (clock jumped forward): `occurredAtUtc` is null too — neither the pre- nor the
 *    post-jump offset is applied (TASK-027.67 Q-W529c); `dstCandidatesUtc` stays empty (there is no candidate instant),
 *    `dstUncertainRangeUtc` says which interval can no longer be trusted.
 */
export type ScadaDstResolution = 'NORMAL' | 'AMBIGUOUS' | 'AMBIGUOUS_RESOLVED' | 'GAP'

export interface ScadaRawRecord {
  /** null ONLY for an unresolved AMBIGUOUS wall time or a NONEXISTENT (GAP) wall time. */
  occurredAtUtc: string | null
  /** The source's naive wall-clock reading (`YYYY-MM-DDTHH:mm:ss.fff`), always kept. */
  localWallTime: string
  /** The two possible instants of an unresolved AMBIGUOUS wall time (first pass, second pass); empty otherwise. */
  dstCandidatesUtc: string[]
  /** GAP only: [from, to] of the interval made untrustworthy by the missing wall time (not an instant of the reading); else null. */
  dstUncertainRangeUtc: [string, string] | null
  recordId: string
  seriesKey: string
  rawValue: number | null
  valueType: ScadaValueType
  sourceCatalogId: string
  dataQuality: ScadaRawDataQuality
  /** DST resolution of the source wall time (TASK-027.67 reads it; the marker `dataQuality` alone cannot tell it from a bad number). */
  dstResolution: ScadaDstResolution
  /** True for the forward-read rows in [endAt, endAt + buffer): needed by the aggregation, never user output. */
  isBufferRow: boolean
}

export interface ScadaQueryWindow {
  startAtUtc: string
  endAtUtc: string
  bufferEndAtUtc: string
}

export interface ScadaRawTimeSeriesResult {
  catalogId: string
  interval: ScadaInterval
  valueType: ScadaValueType
  window: ScadaQueryWindow
  records: ScadaRawRecord[]
}

/**
 * Multi-source modes (Q-W528):
 *  - EXPLICIT: the user chose several sources; ONE rejected/failed source blocks the whole request (nothing is returned);
 *  - ROOT_AGGREGATION: every source is reported with its OWN status; an unresolved/denied source produces no data.
 */
export const SCADA_MULTI_SOURCE_MODES = ['EXPLICIT', 'ROOT_AGGREGATION'] as const
export type ScadaMultiSourceMode = (typeof SCADA_MULTI_SOURCE_MODES)[number]

export type ScadaSourceStatus = 'READ' | 'EXCLUDED' | 'FAILED'

export interface ScadaSourceReport {
  catalogId: string
  status: ScadaSourceStatus
  /** Static code (null when READ). */
  code: string | null
  /** Raw records contributed by this source (0 unless READ). */
  rowCount: number
}

export interface ScadaMultiSourceResult {
  mode: ScadaMultiSourceMode
  interval: ScadaInterval
  valueType: ScadaValueType
  /** True only if every requested source was READ. */
  complete: boolean
  records: ScadaRawRecord[]
  /** One entry per requested source, in deterministic (catalogId) order. */
  sources: ScadaSourceReport[]
}

/**
 * Q-W521 is open: NO default. The forward buffer is needed only for INDEX (Q-W529: the hourly index delta reads the
 * NEXT reading); for REAL_VALUE none is configured or added. A missing/invalid value for INDEX makes the service
 * answer QUERY_WINDOW_CONFIGURATION_REQUIRED.
 */
export interface ScadaQueryWindowConfig {
  forwardBufferMs?: number | null
}
