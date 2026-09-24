import type { CatalogSourceView } from '../catalog/catalog.service'
import type { CatalogScope } from '../catalog/catalog.types'

/** Same shape as `TenantScopeService.resolve()` output — the only place a scope may come from. */
export interface ScadaReadScope extends CatalogScope {
  customerRootTenantId: string
}

export interface ScadaActor {
  id: string
}

/**
 * `catalogId` is the opaque catalog UUID. There is deliberately no database/schema/SQL/filter field:
 * unknown fields are rejected (`INVALID_REQUEST`).
 */
export interface ScadaReadRequest {
  catalogId: string
  table: string
  columns: readonly string[]
  timeRange: { from: Date; to: Date }
  signal?: AbortSignal
}

export interface ScadaReadResult {
  correlationId: string
  catalogId: string
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
}

export interface ScadaReadonlyPort {
  read(actor: ScadaActor, scope: ScadaReadScope, request: ScadaReadRequest): Promise<ScadaReadResult>
  listSources(scope: ScadaReadScope): Promise<CatalogSourceView[]>
}

/** Result of one adapter read WITHOUT any audit side effect (the orchestration boundary audits). Never throws for an expected failure. */
export type ScadaReadOutcome =
  | { ok: true; rows: Record<string, unknown>[]; rowCount: number; columnCount: number; durationMs: number }
  | { ok: false; code: string; outcome: 'DENIED' | 'FAILED' | 'CANCELLED'; limitReason: string | null; durationMs: number }

/**
 * What the analysis query service (the single audit boundary, Q-W526) needs from the adapter: a read that does
 * NOT audit, so exactly one SCADA_QUERY_* record exists per source. Direct callers that are not behind an
 * orchestration boundary use the audited `read` instead — never both for the same query.
 */
export interface ScadaOrchestratedReadPort {
  readUnaudited(actor: ScadaActor, scope: ScadaReadScope, request: ScadaReadRequest): Promise<ScadaReadOutcome>
  listSources(scope: ScadaReadScope): Promise<CatalogSourceView[]>
}

/** Fixed field set of one SCADA query audit record (DEC-0015): no names, SQL, parameters, rows or credentials. */
export interface ScadaQueryAuditEntry {
  actionCode: 'SCADA_QUERY_SUCCEEDED' | 'SCADA_QUERY_DENIED' | 'SCADA_QUERY_FAILED'
  entityType: 'ScadaAnalysisQuery'
  /** Catalog UUID; `null` when the request carried no valid catalog id (never a raw or made-up value). */
  entityId: string | null
  actorId: string
  /** null only when a malformed request carried no readable scope. */
  tenantId: string | null
  customerRootTenantId: string | null
  reasonCode: string
  rowCount: number | null
  columnCount: number | null
  durationMs: number
  limitReason: string | null
  correlationId: string
}

export interface ScadaQueryAuditPort {
  record(entry: ScadaQueryAuditEntry): Promise<void>
}
