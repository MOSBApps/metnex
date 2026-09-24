import type { ScadaMultiSourceMode, ScadaMultiSourceResult, ScadaAnalysisQuery } from '../query/scada-analysis-query.contract'
import type { ScadaActor, ScadaQueryAuditPort, ScadaReadScope } from '../adapter/scada-readonly.port'
import type { TenantRecord } from '../catalog/tenant-guards'
import type { PresetAuthorizationPort, PresetLimits, ScadaPreset } from '../presets/scada-preset.contract'
import type { ScadaSeriesValueType } from '../series/scada-series.contract'
import type { VirtualColumnDefinition, VirtualColumnLimits } from '../virtual-columns/virtual-column.contract'
import type { RolloverPolicyProvider } from '../quality/rollover-policy.port'
import type { ScadaExportAuditPort, ScadaExportRendererPort } from '../export/scada-export.contract'

/**
 * TASK-027.72 — the SCADA reporting API boundary. This file holds the STATIC error contract and the PORTS the API is wired
 * to. Nothing here is a permission code or an audit action name: the API reuses REPORT:ARTIFACT:VIEW and the existing
 * SCADA_QUERY_SUCCEEDED / _DENIED / _FAILED audit contract.
 */

/** Static codes only — the message of every API error is the code itself (never SQL, a name, a provider text or an echo). */
export const SCADA_API_ERRORS = {
  SCADA_ROUTE_CODE_INVALID: 400,
  SCADA_REQUEST_INVALID: 400,
  SCADA_REQUEST_UNKNOWN_FIELD: 400,
  SCADA_TIME_RANGE_INVALID: 400,
  SCADA_INTERVAL_INVALID: 400,
  SCADA_TIMEZONE_INVALID: 400,
  SCADA_STATISTIC_INVALID: 400,
  SCADA_MAPPING_REQUIRED: 400,
  SCADA_LIMIT_EXCEEDED: 400,
  SCADA_SCOPE_DENIED: 403,
  /** Unknown artifact / preset / source AND "not yours": the same answer, so nothing can be probed. */
  SCADA_NOT_FOUND: 404,
  SCADA_PRESET_NOT_ACTIVE: 409,
  SCADA_PRESET_VERSION_CONFLICT: 409,
  SCADA_VIRTUAL_COLUMN_INVALID: 409,
  SCADA_VIRTUAL_COLUMN_VERSION_AMBIGUOUS: 409,
  SCADA_TIMEZONE_MISMATCH: 409,
  SCADA_MIXED_VALUE_TYPES: 409,
  SCADA_AGGREGATION_POLICY_REQUIRED: 409,
  SCADA_ANALYSIS_BLOCKED: 409,
  SCADA_SOURCE_NOT_CONFIGURED: 503,
  SCADA_LIMITS_NOT_CONFIGURED: 503,
  SCADA_SOURCE_UNAVAILABLE: 503,
  SCADA_EXPORT_FORMAT_INVALID: 400,
  /** Nothing usable to export (no rows / everything blocked): never downloaded as a success. */
  SCADA_EXPORT_EMPTY: 409,
  SCADA_EXPORT_RENDER_FAILED: 502,
  /** PNG completion without a matching pending export (unknown / expired / replayed / another actor, tenant, root or artifact). */
  SCADA_EXPORT_CONTEXT_INVALID: 409,
  SCADA_AUDIT_FAILED: 503,
  SCADA_INTERNAL_ERROR: 500,
} as const
export type ScadaApiErrorCode = keyof typeof SCADA_API_ERRORS

export class ScadaApiError extends Error {
  /** True when the audit boundary below (the query service) already wrote the record for this outcome: no second one is written. */
  audited = false
  constructor(readonly code: ScadaApiErrorCode) {
    super(code)
    this.name = 'ScadaApiError'
  }
  get status(): number {
    return SCADA_API_ERRORS[this.code]
  }
}

// ---------------------------------------------------------------- what the catalog provider gives the API (INTERNAL)

export interface ScadaApiSourceSeries {
  seriesKey: string
  label: string
  unit: string
  valueType: ScadaSeriesValueType
  /** Catalog-owned HOURLY → DAILY rule for a REAL_VALUE series; an INDEX series is summed. Absent ⇒ DAILY is refused for it. */
  dailyOperation?: 'SUM' | 'AVERAGE' | 'MIN' | 'MAX'
  /** Discovery only: OK = every reading numeric, PARTIAL = some missing / invalid. A column with NO numeric reading is never listed. */
  qualityStatus?: 'OK' | 'PARTIAL'
}

/** Discovery-only facts about a source's data (no path, no physical name). */
/** A column the source has but whose value type / unit nobody verified: discovery lists it as UNVERIFIED and it can never be selected. */
export interface ScadaApiUnverifiedSeries {
  seriesKey: string
  label: string
}

export interface ScadaApiSourceMeta {
  rowCount: number | null
  /** UTC instants of the first / last reading; null while the source time zone is unverified. */
  minAt: string | null
  maxAt: string | null
}

/**
 * INTERNAL view of one catalog source. `table`, `dateColumn` and `timeColumn` are physical names: they go to the query
 * service only and are NEVER projected, audited or returned. The client only ever sees the opaque `catalogId`.
 */
export interface ScadaApiSource {
  catalogId: string
  customerRootTenantId: string
  displayName: string
  active: boolean
  mappingResolved: boolean
  tenant: TenantRecord | null
  sourceTimeZone: string | null
  table: string
  dateColumn: string
  timeColumn: string
  series: readonly ScadaApiSourceSeries[]
  /** Discovery only (TASK-027.73-R1). */
  unverifiedSeries?: readonly ScadaApiUnverifiedSeries[]
  meta?: ScadaApiSourceMeta
  /** Explicit development / verification status of the zone; absent ⇒ VERIFIED when `sourceTimeZone` is set. */
  timezoneStatus?: 'VERIFIED' | 'DEVELOPMENT_OVERRIDE' | 'UNVERIFIED'
  schemaStatus?: 'VERIFIED' | 'UNVERIFIED'
}

export interface ScadaSourceCatalogPort {
  listSources(scope: ScadaReadScope): Promise<readonly ScadaApiSource[]>
  /** Optional: the artifact descriptor this catalog serves for a route code (null ⇒ the code is not served by it). */
  describeArtifact?(code: string): ScadaCatalogArtifact | null
}

/** What a catalog says about the artifact it serves (development artifact today, a real one later). */
export interface ScadaCatalogArtifact {
  code: string
  name: string
  description: string
  status: string
  developmentOnly: boolean
  supportedIntervals: readonly string[]
  supportedFormats: readonly string[]
  sourceCatalogIds: readonly string[]
  timezoneStatus: string
  dataOrigin: string
}

/** The 027.65 query service (or a stand-in with the same shape): reads AND audits every source itself. */
export interface ScadaAnalysisQueryPort {
  runMany(
    actor: ScadaActor,
    tenantScope: ScadaReadScope,
    queries: ReadonlyArray<Omit<ScadaAnalysisQuery, 'tenantScope' | 'signal'>>,
    options: { mode: ScadaMultiSourceMode; signal?: AbortSignal },
  ): Promise<ScadaMultiSourceResult>
}

/** Read side only (preset CRUD / persistence is out of scope): EVERY version of every preset of ONE customer root. */
export interface ScadaPresetStorePort {
  listPresetVersions(customerRootTenantId: string): Promise<readonly ScadaPreset[]>
}

/** Development management side of a preset store (TASK-027.59-R1): the server generates id and version; a preset is only ever appended. */
export interface ScadaPresetManagementPort extends ScadaPresetStorePort {
  nextIdentity(): { presetId: string; version: number }
  append(preset: ScadaPreset): void
}

export interface ScadaVirtualColumnStorePort {
  listDefinitions(customerRootTenantId: string): Promise<readonly VirtualColumnDefinition[]>
}

/** Development management side of a virtual column store (TASK-027.71-R1); the production store, when it exists, decides its own. */
export interface ScadaVirtualColumnManagementPort extends ScadaVirtualColumnStorePort {
  nextIdentity(customerRootTenantId: string, catalogId: string, seriesKey: string): { virtualColumnId: string; version: number }
  append(definition: VirtualColumnDefinition): void
  setStatus(customerRootTenantId: string, virtualColumnId: string, version: number, status: VirtualColumnDefinition['status'], updatedAt: string): boolean
}

/** Who the caller is, from the database — never from the request. */
export interface ScadaCallerDirectory {
  describe(userId: string, tenantId: string): Promise<{ tenant: TenantRecord | null; userActive: boolean }>
}

/** All limits come from the environment / a source profile. None is a code constant; a missing or invalid one fails closed. */
export interface ScadaApiLimits {
  preset: PresetLimits
  virtualColumn: VirtualColumnLimits
  /** Longest analysis period (endAt − startAt), in milliseconds. */
  maxPeriodMs: number
  maxSeriesMappings: number
}

export interface ScadaApiLimitsProvider {
  get(): ScadaApiLimits | null
}

export interface ScadaApiClock {
  nowMs(): number
  /** Server-side event / correlation id. A client value can never reach the audit. */
  correlationId(): string
}

// ---------------------------------------------------------------- DI tokens (a token with no provider ⇒ SCADA_SOURCE_NOT_CONFIGURED)

export const SCADA_SOURCE_CATALOG = 'SCADA_SOURCE_CATALOG'
export const SCADA_ANALYSIS_QUERY = 'SCADA_ANALYSIS_QUERY'
export const SCADA_PRESET_STORE = 'SCADA_PRESET_STORE'
export const SCADA_VIRTUAL_COLUMN_STORE = 'SCADA_VIRTUAL_COLUMN_STORE'
export const SCADA_API_LIMITS = 'SCADA_API_LIMITS'
export const SCADA_API_AUDIT = 'SCADA_API_AUDIT'
export const SCADA_ROLLOVER_POLICIES = 'SCADA_ROLLOVER_POLICIES'
export const SCADA_PRESET_AUTHORIZATION = 'SCADA_PRESET_AUTHORIZATION'
export const SCADA_DEV_CSV_FIXTURE = 'SCADA_DEV_CSV_FIXTURE'
export const SCADA_DEV_SCOPE_RESOLVER = 'SCADA_DEV_SCOPE_RESOLVER'

export interface ScadaApiPorts {
  sources?: ScadaSourceCatalogPort
  query?: ScadaAnalysisQueryPort
  presets?: ScadaPresetStorePort
  /** Present only when the store supports development creation (TASK-027.59-R1). */
  presetManager?: ScadaPresetManagementPort
  virtualColumns?: ScadaVirtualColumnStorePort
  /** Present only when the store supports development management (create / activate / disable). */
  virtualColumnManager?: ScadaVirtualColumnManagementPort
  limits?: ScadaApiLimitsProvider
  audit: ScadaQueryAuditPort
  rollover?: RolloverPolicyProvider
  /** Who may share / change / delete a TENANT_SHARED preset (composition binds the existing role / scope model). */
  presetAuthorization?: PresetAuthorizationPort
  /** TASK-027.74: the export audit (existing REPORT_EXPORT_* codes). Missing ⇒ every export fails closed (503). */
  exportAudit?: ScadaExportAuditPort
  /** TASK-027.74: the existing Jasper renderer seam (PDF only); absent / not configured ⇒ the built-in fallback PDF. */
  exportRenderer?: ScadaExportRendererPort
}
