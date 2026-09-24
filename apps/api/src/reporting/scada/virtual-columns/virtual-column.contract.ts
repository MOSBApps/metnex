import type { TenantRecord } from '../catalog/tenant-guards'
import type { ScadaDataQualityState } from '../quality/scada-data-quality.contract'
import type { ScadaOutputBucket, ScadaSeriesOutput, ScadaSeriesScope, ScadaSeriesValueType } from '../series/scada-series.contract'

/**
 * TASK-027.70 — governed virtual columns: PURE contracts. No credential, SQL, physical schema/table/database name or
 * connection information appears in a definition, a result or an audit event. Definitions are a control-plane concept
 * (Q-W505): nothing here is persisted.
 */

export const VIRTUAL_COLUMN_STATUSES = ['DRAFT', 'ACTIVE', 'DISABLED', 'BLOCKED'] as const
export type VirtualColumnStatus = (typeof VIRTUAL_COLUMN_STATUSES)[number]

/** Static, safe error codes — never a message from an exception, never an expression fragment. */
export type VirtualColumnErrorCode =
  | 'VIRTUAL_COLUMN_EXPRESSION_INVALID'
  | 'VIRTUAL_COLUMN_EXPRESSION_TOO_COMPLEX'
  | 'VIRTUAL_COLUMN_UNKNOWN_INPUT'
  | 'VIRTUAL_COLUMN_FUNCTION_NOT_ALLOWED'
  | 'VIRTUAL_COLUMN_SCOPE_BLOCKED'
  | 'VIRTUAL_COLUMN_NOT_ACTIVE'
  | 'VIRTUAL_COLUMN_VERSION_CONFLICT'

export interface VirtualColumnDefinition {
  virtualColumnId: string
  /** The source (catalog) the column derives from. A virtual column never spans or extends sources. */
  catalogId: string
  customerRootTenantId: string
  /** Unique within the tenant; also the `seriesKey` of the produced series. */
  seriesKey: string
  label: string
  unit: string
  /** Allowlist DSL text (numbers, series references, + - * /, parentheses, MIN MAX ABS ROUND IF, comparisons, AND OR NOT). */
  expression: string
  inputSeriesKeys: readonly string[]
  valueType: ScadaSeriesValueType
  version: number
  /** [effectiveFrom, effectiveTo): from inclusive, to exclusive; null = open. */
  effectiveFrom: string | null
  effectiveTo: string | null
  status: VirtualColumnStatus
  /** A safe actor reference (an id), never a name/e-mail/credential. */
  createdBy: string
  updatedAt: string
}

/**
 * Limits come from OUTSIDE (a contract input) — none is invented here. A missing / non-positive / non-integer limit makes
 * the validator fail closed (nothing is accepted).
 */
export interface VirtualColumnLimits {
  maxExpressionLength: number
  maxAstDepth: number
  /** Operators and function calls together. */
  maxOperatorCount: number
  /** ROUND accepts 0..maxRoundDecimals. */
  maxRoundDecimals: number
  /** A result above this magnitude is invalid (out of the allowed bound). */
  maxAbsoluteResult: number
}

export interface VirtualColumnRequest {
  scope: ScadaSeriesScope
  /** The single source the evaluation is bound to; definitions and input series must belong to it. */
  catalogId: string
  /** The mapped tenant of that source (catalog RESOLVED mapping); null ⇒ unresolved. */
  tenant: TenantRecord | null
  mappingResolved: boolean
  limits: VirtualColumnLimits
  /** Every version of every virtual column to evaluate. */
  definitions: readonly VirtualColumnDefinition[]
  /** Real (027.68) series the expressions may reference — and nothing else. */
  inputSeries: readonly ScadaSeriesOutput[]
}

export interface VirtualOutputBucket extends ScadaOutputBucket {
  /** false when an input was missing / unresolved (or an input series is blocked). */
  analysisAllowed: boolean
  sourceSeriesKeys: string[]
  virtualColumnId: string
  /** The version that computed this bucket (null only for a reading without an instant when several versions are active). */
  version: number | null
}

/** A `ScadaSeriesOutput` (027.68/027.69 compatible) plus the traceability of the virtual column. */
export interface VirtualSeriesOutput extends Omit<ScadaSeriesOutput, 'buckets'> {
  buckets: VirtualOutputBucket[]
  virtual: {
    virtualColumnId: string
    versions: number[]
    sourceSeriesKeys: string[]
    /** Buckets for which no ACTIVE version was effective (not computed, not listed). */
    notEffectiveBuckets: number
  }
}

export interface VirtualColumnFailure {
  virtualColumnId: string
  code: VirtualColumnErrorCode
}

export interface VirtualColumnResult {
  status: 'OK' | 'PARTIAL' | 'BLOCKED'
  code: VirtualColumnErrorCode | null
  customerRootTenantId: string
  /** Sorted by seriesKey. */
  series: VirtualSeriesOutput[]
  failures: VirtualColumnFailure[]
}

// ---------------------------------------------------------------- audit boundary (port only)

export interface VirtualColumnAuditEvent {
  virtualColumnId: string
  catalogId: string
  customerRootTenantId: string
  version: number | null
  result: 'SUCCEEDED' | 'DENIED' | 'FAILED'
  /** Static code only: never the expression, SQL, a table name or a raw value. */
  reasonCode: VirtualColumnErrorCode | 'OK'
}

/**
 * Only the metadata the pure core can offer. Action / entity names are Q-W519 (open) and are NOT fixed here: the adapter
 * that implements this port decides them.
 */
export interface VirtualColumnAuditPort {
  record(event: VirtualColumnAuditEvent): Promise<void> | void
}

export type { ScadaDataQualityState }
