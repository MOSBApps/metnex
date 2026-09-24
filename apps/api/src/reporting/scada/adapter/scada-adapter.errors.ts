/** Audit action codes fixed by DEC-0015 (Q-SA). Catalog/preset change actions are Q-W519 (open) and NOT defined here. */
export const SCADA_QUERY_ACTION = {
  SUCCEEDED: 'SCADA_QUERY_SUCCEEDED',
  DENIED: 'SCADA_QUERY_DENIED',
  FAILED: 'SCADA_QUERY_FAILED',
} as const
export type ScadaQueryActionCode = (typeof SCADA_QUERY_ACTION)[keyof typeof SCADA_QUERY_ACTION]

export const SCADA_QUERY_ENTITY_TYPE = 'ScadaAnalysisQuery'

/** Caller-visible classification. `CANCELLED` is audited as FAILED/`CANCELLED` until Q-W520 fixes its own action code. */
export type ScadaOutcome = 'DENIED' | 'FAILED' | 'CANCELLED'

export type ScadaLimitReason = 'ROW_LIMIT' | 'PAYLOAD_LIMIT' | 'COLUMN_LIMIT' | 'TIME_RANGE_LIMIT' | 'CONCURRENCY_LIMIT' | 'TIMEOUT'

/**
 * The only error the adapter throws. The message is the static code: never a driver message, SQL text,
 * identifier, parameter value or row data.
 */
export class ScadaAdapterError extends Error {
  constructor(
    readonly code: string,
    readonly outcome: ScadaOutcome,
    readonly correlationId: string | null,
    readonly limitReason: ScadaLimitReason | null = null,
  ) {
    super(code)
    this.name = 'ScadaAdapterError'
  }
}
