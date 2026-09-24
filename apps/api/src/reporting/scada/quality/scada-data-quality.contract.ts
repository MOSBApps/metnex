import type { ScadaDstResolution, ScadaRawRecord } from '../query/scada-analysis-query.contract'

/**
 * TASK-027.67 — data-quality states. `dataQuality` of a result is the MOST CRITICAL state present (see
 * QUALITY_SEVERITY); the full set stays visible in `qualityFlags`. Quality is never silently cleaned.
 */
export const SCADA_DATA_QUALITY_STATES = [
  'VALID',
  'MISSING_VALUE',
  'DUPLICATE_TIMESTAMP',
  'INSUFFICIENT_NEXT_READING',
  'NEGATIVE_DELTA',
  'COUNTER_RESET_RESOLVED',
  'COUNTER_RESET_UNRESOLVED',
  'INVALID_NUMERIC_VALUE',
  'INCOMPLETE_BUCKET',
  'DST_AMBIGUOUS',
  'DST_NONEXISTENT',
  'TIMEZONE_UNVERIFIED',
  'POLICY_UNDEFINED',
  'POLICY_INVALID',
  // TASK-027.70 (virtual columns): a derived value whose input is missing/unresolved, and an invalid division
  'VIRTUAL_COLUMN_INPUT_UNRESOLVED',
  'VIRTUAL_COLUMN_DIVISION_INVALID',
] as const
export type ScadaDataQualityState = (typeof SCADA_DATA_QUALITY_STATES)[number]

/**
 * Most critical first. A more critical state overrides a weaker one as the headline. Provisional ordering (AI1 may
 * reorder it in this single place). COUNTER_RESET_UNRESOLVED outranks POLICY_* / NEGATIVE_DELTA so that Q-W522
 * ("no/invalid policy ⇒ COUNTER_RESET_UNRESOLVED") holds, while the policy state stays in `qualityFlags`.
 */
export const QUALITY_SEVERITY: readonly ScadaDataQualityState[] = [
  'TIMEZONE_UNVERIFIED',
  'DST_NONEXISTENT',
  'INVALID_NUMERIC_VALUE',
  'VIRTUAL_COLUMN_DIVISION_INVALID', // numeric invalidity of a derived value, right below an invalid number
  'COUNTER_RESET_UNRESOLVED',
  'DST_AMBIGUOUS',
  'DUPLICATE_TIMESTAMP',
  'VIRTUAL_COLUMN_INPUT_UNRESOLVED', // derived: its CAUSES (DST, counter reset, duplicate…) outrank it; it outranks a plain missing value
  'MISSING_VALUE',
  'INSUFFICIENT_NEXT_READING',
  'INCOMPLETE_BUCKET',
  'COUNTER_RESET_RESOLVED',
  'NEGATIVE_DELTA',
  'POLICY_INVALID',
  'POLICY_UNDEFINED',
  'VALID',
]

/** Flags that do not make a result incomplete (a resolved roll-over is a complete, explained result). */
export const COMPLETE_SAFE_STATES: readonly ScadaDataQualityState[] = ['VALID', 'COUNTER_RESET_RESOLVED', 'NEGATIVE_DELTA', 'POLICY_UNDEFINED']

export function mostCritical(states: readonly ScadaDataQualityState[]): ScadaDataQualityState {
  for (const state of QUALITY_SEVERITY) if (states.includes(state)) return state
  return 'VALID'
}

export function sortFlags(states: Iterable<ScadaDataQualityState>): ScadaDataQualityState[] {
  const set = new Set(states)
  return QUALITY_SEVERITY.filter(s => set.has(s))
}

// ---------------------------------------------------------------- roll-over policy

export const ROLLOVER_MODES = ['NONE', 'FIXED_MAXIMUM', 'MODULO'] as const
export type RolloverMode = (typeof ROLLOVER_MODES)[number]

/**
 * Explicit, catalog-owned roll-over policy for ONE series of ONE source. Never selected by column name.
 *  - NONE: a negative difference is NOT corrected;
 *  - FIXED_MAXIMUM: `rolloverValue` = the counter's maximum reading M; corrected = next + (M − current);
 *  - MODULO: `rolloverValue` = the counter range R (readings in [0, R)); corrected = next − current + R.
 * `maxExpectedDelta` (optional, ≥ 0): a corrected delta above it is NOT accepted (stays unresolved).
 * Effective window is [effectiveFrom, effectiveTo) on the LATER reading of the pair; null = open.
 */
export interface RolloverPolicy {
  catalogId: string
  seriesKey: string
  valueType: 'INDEX' | 'REAL_VALUE'
  rolloverMode: RolloverMode
  rolloverValue?: number | null
  maxExpectedDelta?: number | null
  enabled: boolean
  version: string | number
  effectiveFrom?: string | null
  effectiveTo?: string | null
}

export type PolicyStatus = 'APPLIED' | 'NOT_NEEDED' | 'UNDEFINED' | 'INVALID' | 'NOT_EFFECTIVE' | 'NONE_MODE' | 'OUT_OF_RANGE'

/** Traceability of the policy that decided a result. */
export interface PolicyTrace {
  status: PolicyStatus
  version: string | number | null
  mode: RolloverMode | null
  effectiveFrom: string | null
  effectiveTo: string | null
}

// ---------------------------------------------------------------- input / output

/** The 027.65 normalised record (structurally compatible). */
export type ScadaQualityInputRow = ScadaRawRecord

export interface ScadaQualityInput {
  catalogId: string
  /** Catalog IANA zone; null/undefined/invalid ⇒ TIMEZONE_UNVERIFIED and production analysis is not allowed. */
  sourceTimeZone: string | null | undefined
  rows: readonly ScadaQualityInputRow[]
}

export interface ScadaQualityResultRow {
  sourceCatalogId: string
  seriesKey: string
  valueType: 'INDEX' | 'REAL_VALUE'
  /** UTC instant of the reading (null ONLY for a repeated wall time the source did not disambiguate: no instant is invented). */
  occurredAtUtc: string | null
  /** The source's naive wall-clock reading — always kept, it is what identifies an unresolved repeated time. */
  localWallTime: string
  dstResolution: ScadaDstResolution
  /** UTC instant of the next reading used for the delta (null when none / not an index series). */
  nextOccurredAtUtc: string | null
  recordId: string
  /** The raw readings are ALWAYS preserved, whatever the outcome. */
  rawValue: number | null
  nextRawValue: number | null
  deltaValue: number | null
  dataQuality: ScadaDataQualityState
  qualityFlags: ScadaDataQualityState[]
  isComplete: boolean
  policy: PolicyTrace | null
}

export interface ScadaQualityResult {
  /**
   * False ⇒ nothing may be used for production analysis: the source time zone is not verified, OR a repeated wall time
   * (DST fall-back) could not be disambiguated by the source (`dstStatus = UNRESOLVED`).
   */
  analysisAllowed: boolean
  timeZoneStatus: 'VERIFIED' | 'UNVERIFIED'
  /** UNRESOLVED ⇒ at least one repeated wall time has no source fold/offset (TASK-027.67-R1); never guessed. */
  dstStatus: 'RESOLVED' | 'UNRESOLVED'
  rows: ScadaQualityResultRow[]
  /** Per series: the flags seen and whether every result of the series is complete (no leakage across series). */
  series: Record<string, { flags: ScadaDataQualityState[]; isComplete: boolean; rowCount: number }>
}
