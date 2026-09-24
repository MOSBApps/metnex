/**
 * TASK-027.63 — SCADA source catalog domain types (in-memory contract; no persistence yet).
 *
 * Decisions this model implements: DEC-0015 (catalog is the single allowlist; source time zone and
 * limit profile are catalog fields; no defaults) and DEC-0016 (records start UNVERIFIED and become
 * VERIFIED only through an authorised read-only preflight result; the physical database name is kept
 * exactly and is separate from the opaque catalog id).
 */

export type ScopeStatus = 'IN_SCOPE' | 'OUT_OF_SCOPE'
export type VerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'BLOCKED'
export type ColumnVerification = 'UNVERIFIED' | 'VERIFIED'
export type MappingStatus = 'UNRESOLVED' | 'RESOLVED' | 'BLOCKED'
export type ColumnKind = 'NUMERIC' | 'DATE' | 'TIME' | 'DATETIME' | 'OTHER'
/** Column class as OBSERVED by a preflight implementation (raw SQL type → class happens there, not here). */
export type ObservedColumnClass = 'NUMERIC' | 'DATE' | 'TIME' | 'DATETIME' | 'TEXT' | 'OTHER'

export interface LimitProfile {
  timeoutMs: number
  maxRows: number
  maxColumns: number
  maxPayloadBytes: number
  maxRangeMs: number
  poolSize: number
  maxConcurrent: number
}

export interface DeclaredColumn {
  name: string
  kind: ColumnKind
}

export interface DeclaredTable {
  /**
   * SQL Server schema of the table. Mandatory for a VERIFIED source (TASK-027.64 R1): it is never guessed
   * or defaulted (no implicit `dbo`); a table without one keeps the source UNVERIFIED.
   */
  schema?: string | null
  name: string
  columns: DeclaredColumn[]
  /** Must name declared columns of kind DATE/TIME/DATETIME; the same column may serve as both (DATETIME). */
  dateColumn: string
  timeColumn: string
}

export interface CatalogColumn extends DeclaredColumn {
  verification: ColumnVerification
}

export interface CatalogTable {
  schema: string | null
  name: string
  columns: CatalogColumn[]
  dateColumn: string
  timeColumn: string
}

export interface TenantMapping {
  tenantId: string
  status: MappingStatus
  /** Reference to the approval that made it RESOLVED (control-plane approval record id). */
  approvalRef: string | null
}

/** Immutable snapshot of one catalog version. `id` is opaque and never derived from the physical name. */
export interface CatalogSource {
  id: string
  version: number
  displayName: string
  /** Kept exactly as approved (may contain spaces). Only ever used inside the approved profile. */
  physicalDatabase: string
  scope: ScopeStatus
  verification: VerificationStatus
  blockedReason: string | null
  /** Catalog-defined IANA time zone; null = UNDEFINED (source unusable). */
  sourceTimeZone: string | null
  /** null = no profile (source unusable). No defaults exist. */
  limitProfile: LimitProfile | null
  tables: CatalogTable[]
  mappings: TenantMapping[]
  createdAt: string
  updatedAt: string
}

export interface RegisterSourceInput {
  displayName: string
  physicalDatabase: string
  scope: ScopeStatus
  tables: DeclaredTable[]
  sourceTimeZone?: string | null
  limitProfile?: LimitProfile | null
}

export interface DefinitionPatch {
  displayName?: string
  physicalDatabase?: string
  scope?: ScopeStatus
  tables?: DeclaredTable[]
  sourceTimeZone?: string | null
  limitProfile?: LimitProfile | null
}

export interface PreflightObservation {
  connectionOk: boolean
  databaseExists: boolean
  tables: Array<{
    name: string
    /** Whether the declared schema exists (verified by the real preflight, never assumed). */
    schemaExists: boolean
    exists: boolean
    columns: Array<{ name: string; exists: boolean; observedClass: ObservedColumnClass | null }>
  }>
}

export interface CatalogActor {
  id: string
}

export type CatalogOperation =
  | 'REGISTER'
  | 'UPDATE_DEFINITION'
  | 'APPLY_PREFLIGHT'
  | 'BLOCK'
  | 'UNBLOCK'
  | 'APPROVE_MAPPING'
  | 'REVOKE_MAPPING'
  | 'BLOCK_MAPPING'
  | 'RESET_MAPPING'

export type CatalogAuditResult = 'SUCCEEDED' | 'DENIED' | 'FAILED'

/**
 * The ONLY fields a catalog change audit entry may carry. No physical/table/column names, limit values
 * or time zone. Action/entity names are NOT defined here (Q-W519 is open) — the port adapter maps
 * `operation` later.
 */
export interface CatalogAuditEntry {
  actorId: string
  catalogId: string | null
  version: number | null
  operation: CatalogOperation
  result: CatalogAuditResult
  reasonCode: string
  correlationId: string
  mappedTenantId: string | null
}

/** Scope as produced by `TenantScopeService.resolve()` — never built from headers/cookies. */
export interface CatalogScope {
  tenantId: string
  dataScopeTenantIds: readonly string[]
}

export type AccessDenialReason =
  | 'NOT_FOUND'
  | 'OUT_OF_SCOPE'
  | 'BLOCKED'
  | 'NOT_VERIFIED'
  | 'MAPPING_UNRESOLVED'
  | 'TIMEZONE_UNDEFINED'
  | 'LIMIT_PROFILE_INCOMPLETE'
  | 'TABLE_UNKNOWN'
  | 'SCHEMA_UNDEFINED'
  | 'COLUMN_UNKNOWN'
  | 'COLUMN_NOT_VERIFIED'

export interface AccessDecision {
  accessible: boolean
  reasons: AccessDenialReason[]
}
