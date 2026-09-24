import type { TenantRecord } from '../catalog/tenant-guards'
import type { SeriesMappingEntry } from '../comparison/scada-comparison.contract'
import type { ScadaDataQualityState } from '../quality/scada-data-quality.contract'
import type { ScadaSeriesInterval, ScadaSeriesScope } from '../series/scada-series.contract'
import type { VirtualColumnDefinition } from '../virtual-columns/virtual-column.contract'

/**
 * TASK-027.71 — SCADA presets: PURE, versioned, tenant-isolated configuration. A preset is a control-plane concept (Q-W505):
 * nothing here is persisted. It holds only SAFE REFERENCES: opaque catalog ids, series keys, virtual column ids (+ optional
 * pinned version). It never holds an expression, AST, SQL, physical table / schema / database name, connection information,
 * a credential or executable code, and it neither grants a permission nor creates a tenant / source / mapping.
 */

export const PRESET_SCOPES = ['PRIVATE', 'TENANT_SHARED'] as const
export type PresetScope = (typeof PRESET_SCOPES)[number]

export const PRESET_STATUSES = ['DRAFT', 'ACTIVE', 'DISABLED', 'BLOCKED', 'ARCHIVED'] as const
export type PresetStatus = (typeof PRESET_STATUSES)[number]

export const PRESET_STATISTICS = ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'VALID_COUNT', 'MISSING_COUNT', 'INVALID_COUNT', 'INCOMPLETE_COUNT'] as const
export type PresetStatistic = (typeof PRESET_STATISTICS)[number]

/** Symbolic values only: no component name, HTML, CSS, JavaScript or renderer command. */
export const PRESET_CHART_TYPES = ['LINE', 'BAR', 'AREA', 'TABLE'] as const
export type PresetChartType = (typeof PRESET_CHART_TYPES)[number]

export const PRESET_TABLE_SORT_FIELDS = ['bucketStartUtc', 'seriesKey', 'value'] as const

/** The ONLY thing a preset stores about a virtual column: its id and, optionally, a pinned version. */
export interface PresetVirtualColumnRef {
  virtualColumnId: string
  version?: number
}

export type PresetComparison =
  | { mode: 'NONE' }
  | { mode: 'PERIOD'; comparisonRange: { startAt: string; endAt: string }; seriesMapping?: readonly SeriesMappingEntry[]; decimals?: number | null }
  | { mode: 'SOURCE'; leftSourceCatalogId: string; rightSourceCatalogId: string; seriesMapping?: readonly SeriesMappingEntry[]; decimals?: number | null }

/** Filters are limited to these fields; everything else is refused. */
export interface PresetFilters {
  qualityStates?: readonly ScadaDataQualityState[]
  onlyAnalysisAllowed?: boolean
}

export interface PresetDisplay {
  chartType: PresetChartType
  tableOptions?: { sortBy?: (typeof PRESET_TABLE_SORT_FIELDS)[number]; sortDirection?: 'ASC' | 'DESC'; pageSize?: number; page?: number }
}

export interface ScadaPreset {
  presetId: string
  customerRootTenantId: string
  /** Required for PRIVATE (only this user may use it); the author (or null) for TENANT_SHARED. */
  ownerUserId: string | null
  scope: PresetScope
  name: string
  description: string | null
  version: number
  status: PresetStatus
  sourceCatalogIds: readonly string[]
  seriesKeys: readonly string[]
  virtualColumns: readonly PresetVirtualColumnRef[]
  statistics: readonly PresetStatistic[]
  comparison: PresetComparison
  filters: PresetFilters
  /** Absolute, half-open [startAt, endAt). */
  timeRange: { startAt: string; endAt: string }
  bucketInterval: ScadaSeriesInterval
  /** IANA zone; anything else is PRESET_TIMEZONE_UNVERIFIED. */
  timezone: string
  display: PresetDisplay
  createdAt: string
  updatedAt: string
  /** [effectiveFrom, effectiveTo): from inclusive, to exclusive; null = open. */
  effectiveFrom: string | null
  effectiveTo: string | null
}

/** Limits come from OUTSIDE (a contract input); a missing/invalid one fails closed. None is invented here. */
export interface PresetLimits {
  maxNameLength: number
  maxDescriptionLength: number
  maxSourceCount: number
  maxSeriesCount: number
  maxVirtualColumnCount: number
  maxPageSize: number
}

/** Static, safe error codes. */
export type PresetErrorCode =
  | 'PRESET_INVALID'
  | 'PRESET_SCOPE_INVALID'
  | 'PRESET_OWNER_REQUIRED'
  | 'PRESET_TENANT_REQUIRED'
  | 'PRESET_UNKNOWN_FIELD'
  | 'PRESET_DUPLICATE_SERIES'
  | 'PRESET_DUPLICATE_SOURCE'
  | 'PRESET_INVALID_INTERVAL'
  | 'PRESET_INVALID_TIME_RANGE'
  | 'PRESET_TIMEZONE_UNVERIFIED'
  | 'PRESET_VIRTUAL_COLUMN_INVALID'
  | 'PRESET_VIRTUAL_COLUMN_VERSION_AMBIGUOUS'
  | 'PRESET_SCOPE_BLOCKED'
  | 'PRESET_VERSION_CONFLICT'
  /** Extension of the list: an inactive / not-yet-effective preset must not run. */
  | 'PRESET_NOT_ACTIVE'

// ---------------------------------------------------------------- caller and catalog view

export interface PresetCaller {
  userId: string
  /** The user record is active. */
  userActive: boolean
  /** The caller's tenant record (null ⇒ unresolved). */
  tenant: TenantRecord | null
  /** From `TenantScopeService.resolve()` — never built from client input. */
  scope: ScadaSeriesScope
}

/** What the resolver may know about a source: NO physical database / schema / table name, NO mapping detail. */
export interface PresetSourceInfo {
  catalogId: string
  customerRootTenantId: string
  /** The source is active and VERIFIED in the catalog. */
  active: boolean
  mappingResolved: boolean
  /** The mapped tenant (null ⇒ unresolved). */
  tenant: TenantRecord | null
  /** IANA zone of the source; null ⇒ unverified. */
  sourceTimeZone: string | null
  /** The catalog-approved series (columns) of the source. */
  seriesKeys: readonly string[]
}

/** Only through this port may anything decide who may SHARE; no permission code exists here (Q-W517 is open). */
export interface PresetAuthorizationPort {
  canSharePreset(caller: { userId: string; customerRootTenantId: string }): Promise<boolean> | boolean
}

export interface PresetAuditEvent {
  presetId: string
  presetVersion: number | null
  customerRootTenantId: string
  /** A safe actor reference (an id), never a name or e-mail. */
  actorUserId: string
  scope: PresetScope | null
  result: 'SUCCEEDED' | 'DENIED' | 'FAILED'
  /** Static code only — never the expression, SQL, a source name or a raw filter. */
  reasonCode: PresetErrorCode | 'OK'
}

/** Port only: action / entity names are Q-W519 (open) and are NOT fixed here. */
export interface PresetAuditPort {
  record(event: PresetAuditEvent): Promise<void> | void
}

// ---------------------------------------------------------------- the executable plan

export interface AnalysisPlanVirtualColumn {
  virtualColumnId: string
  /** The version that was RESOLVED (pinned, or the single one effective at resolution time). */
  version: number
  catalogId: string
  seriesKey: string
}

/** What 027.68–70 execute. Only ids, series keys and settings: no SQL, no physical names, no credentials, no expressions. */
export interface AnalysisPlan {
  presetId: string
  presetVersion: number
  scope: PresetScope
  /** The tenant scope the analysis must run in (from the caller's resolved scope). */
  tenantScope: { customerRootTenantId: string; tenantId: string; dataScopeTenantIds: string[] }
  resolvedAtUtc: string
  timeRange: { startAt: string; endAt: string }
  bucketInterval: ScadaSeriesInterval
  timezone: string
  sourceCatalogIds: string[]
  /** Each (source, series) the catalog approves for a selected key. */
  series: Array<{ sourceCatalogId: string; seriesKey: string }>
  virtualColumns: AnalysisPlanVirtualColumn[]
  statistics: PresetStatistic[]
  comparison: PresetComparison
  filters: { qualityStates: ScadaDataQualityState[]; onlyAnalysisAllowed: boolean }
  display: PresetDisplay
}

export interface PresetResolveRequest {
  caller: PresetCaller
  /** EVERY version of ONE presetId. */
  presetVersions: readonly ScadaPreset[]
  /** The instant the effective windows are evaluated at (ISO). */
  at: string
  limits: PresetLimits
  sources: readonly PresetSourceInfo[]
  /** The tenant-scoped virtual column store (all versions); the preset only references it. */
  virtualColumnDefinitions: readonly VirtualColumnDefinition[]
}

export type PresetResolveResult =
  | { ok: true; plan: AnalysisPlan }
  | { ok: false; code: PresetErrorCode }
