/**
 * The only errors the analysis query service throws. `code` is one of these static strings; the message is the
 * code itself — never SQL, a source/table/column name, a host/user/secret, or an echoed date range/filter.
 * `AUDIT_FAILED` is the fail-closed audit boundary's code (Q-W526). It is NOT an action code: the audit record for it is a FAILED-action record
 * with `reasonCode = AUDIT_FAILED` (AI1) — no new action code exists.
 */
export const SCADA_QUERY_ERROR_CODES = [
  'INVALID_REQUEST',
  'INVALID_CATALOG_ID',
  'SOURCE_NOT_FOUND',
  'SOURCE_NOT_VERIFIED',
  'SOURCE_MAPPING_UNRESOLVED',
  'SOURCE_BLOCKED',
  'SOURCE_TIMEZONE_REQUIRED',
  'SOURCE_LIMIT_PROFILE_REQUIRED',
  'TABLE_NOT_ALLOWED',
  'COLUMN_NOT_ALLOWED',
  'TIME_RANGE_INVALID',
  'TIME_RANGE_LIMIT_EXCEEDED',
  'QUERY_WINDOW_CONFIGURATION_REQUIRED',
  'TENANT_SCOPE_DENIED',
  'SCADA_ADAPTER_FAILED',
  'SCADA_QUERY_CANCELLED',
  'AUDIT_FAILED',
] as const

export type ScadaQueryErrorCode = (typeof SCADA_QUERY_ERROR_CODES)[number]

/** How the outcome is audited: DENIED / FAILED map onto the shared audit actions; CANCELLED = FAILED + reason CANCELLED (Q-W520). */
export type ScadaQueryOutcome = 'DENIED' | 'FAILED' | 'CANCELLED'

/**
 * REASON CODE (not an action): recorded as a DENIED-action record with `reasonCode = MULTI_SOURCE_REQUEST_BLOCKED`
 * for every source of a multi-source request that is blocked as a whole because another source was rejected (Q-W528).
 */
export const MULTI_SOURCE_BLOCKED_REASON = 'MULTI_SOURCE_REQUEST_BLOCKED'

export interface ScadaQueryErrorDetail {
  outcome?: ScadaQueryOutcome
  /** Static limit reason (ROW_LIMIT, TIME_RANGE_LIMIT, ...). */
  limitReason?: string | null
  /** More specific static reason recorded in the audit (e.g. the adapter's ROW_LIMIT_EXCEEDED). */
  auditReason?: string
}

export class ScadaQueryError extends Error {
  readonly outcome: ScadaQueryOutcome
  readonly limitReason: string | null
  readonly auditReason: string

  constructor(
    readonly code: ScadaQueryErrorCode,
    detail: ScadaQueryErrorDetail = {},
  ) {
    super(code)
    this.name = 'ScadaQueryError'
    this.outcome = detail.outcome ?? (code === 'SCADA_QUERY_CANCELLED' ? 'CANCELLED' : code === 'SCADA_ADAPTER_FAILED' || code === 'AUDIT_FAILED' ? 'FAILED' : 'DENIED')
    this.limitReason = detail.limitReason ?? (code === 'TIME_RANGE_LIMIT_EXCEEDED' ? 'TIME_RANGE_LIMIT' : null)
    this.auditReason = detail.auditReason ?? (this.outcome === 'CANCELLED' ? 'CANCELLED' : code)
  }
}
