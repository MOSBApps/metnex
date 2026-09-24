import { isCatalogId } from '../catalog/catalog-rules'
import type { ScadaComparisonResult } from '../comparison/scada-comparison.contract'
import { ScadaComparisonService, toComparisonChart } from '../comparison/scada-comparison.service'
import { PRESET_STATISTICS, type AnalysisPlan, type PresetCaller, type PresetErrorCode, type PresetSourceInfo, type ScadaPreset } from '../presets/scada-preset.contract'
import { planToSeriesRequestBase, resolvePreset, selectPlannedDefinitions } from '../presets/scada-preset-resolver'
import { canUsePreset } from '../presets/scada-preset-security'
import { checkVersionSet, versionAt } from '../presets/scada-preset-versioning'
import { validatePreset } from '../presets/scada-preset.validator'
import { ScadaPresetService } from '../presets/scada-preset.service'
import type { ScadaQueryAuditEntry, ScadaReadScope } from '../adapter/scada-readonly.port'
import type { ScadaMultiSourceResult, ScadaRawRecord } from '../query/scada-analysis-query.contract'
import { ScadaQueryError, type ScadaQueryErrorCode } from '../query/scada-query.errors'
import { ScadaDataQualityService } from '../quality/scada-data-quality.service'
import { InMemoryRolloverPolicyProvider } from '../quality/rollover-policy.port'
import { aggregateDstAwareSeries, type ScadaAggregationInputRow } from '../aggregation/dst-aware-aggregation'
import { analysisAllowedForSeries, bucketsFromDstAware } from '../series/series-adapters'
import { ScadaMultiSeriesService } from '../series/scada-multi-series.service'
import type { ScadaMultiSeriesResult, ScadaSeriesInput, ScadaSeriesOutput } from '../series/scada-series.contract'
import { VirtualColumnService } from '../virtual-columns/virtual-column.service'
import { compileDefinition } from '../virtual-columns/virtual-column-validator'
import { ExpressionError } from '../virtual-columns/virtual-column-expression'
import type { VirtualColumnDefinition, VirtualColumnFailure, VirtualSeriesOutput } from '../virtual-columns/virtual-column.contract'
import { ScadaApiError, type ScadaApiErrorCode, type ScadaApiLimits, type ScadaApiPorts, type ScadaApiClock, type ScadaApiSource, type ScadaCallerDirectory } from './scada-api.contract'
import { buildExportFile, exportFileName, ScadaExportRenderError } from '../export/scada-export.builder'
import type { ScadaExportAuditEntry, ScadaExportFormat, ScadaExportRendererMode, ScadaExportResult } from '../export/scada-export.contract'
import { buildAnalysisModel, buildComparisonModel, isEmptyModel, modelRowCount, type ExportMeta } from '../export/scada-export.model'
import { buildPngCaptionLines } from '../export/scada-export.png'
import { PendingPngExports } from './pending-png-exports'
import { assertMappableTenant, isExcludedOrganisationTenant } from '../catalog/tenant-guards'
import { SCADA_FIXTURE_DEVELOPMENT_LABEL } from '../fixture/scada-fixture-artifact'
import {
  projectCatalogSource,
  projectComparison,
  projectPlan,
  projectPresetSummary,
  type ProjectedPresetSummary,
  projectSeries,
  projectSources,
  projectVirtualColumn,
  type ProjectedVirtualColumn,
  type CatalogBlockedReason,
  type ProjectedAnalysis,
  type ProjectedCatalog,
  type ProjectedCatalogSource,
  type ProjectedComparison,
} from './scada-api.projection'
import { apiLimitsValid, validateAnalysisRequest, validateComparisonRequest, validatePresetIdParam, validateExportBody, validateExportFormat, validatePngCompletion, validatePresetCreateRequest, validateRouteCode, validateVirtualColumnIdParam, validateVirtualColumnRequest, type CleanAnalysisRequest, type CleanCompareRequest } from './scada-api.validator'

export interface ScadaApiScope {
  tenantId: string
  customerRootTenantId: string
  dataScopeTenantIds: string[]
}

export interface ScadaAnalysisApiDeps extends ScadaApiPorts {
  /** `TenantScopeService.resolve()` — the only place a scope comes from. */
  scopes: { resolve(tenantId: string): Promise<ScadaApiScope> }
  callers: ScadaCallerDirectory
  /** Existing reporting artifact lookup; throws (404) for an unknown / inactive artifact. */
  artifacts: { assertExists(tenantId: string, code: string): Promise<void> }
  clock: ScadaApiClock
}

export interface ScadaApiCall {
  /** The JWT-validated session actor (`@CurrentUser()`); never a body field. */
  actor: { id: string }
  /** The `X-Tenant-Id` header value the guards already authorised. */
  tenantId: string
  routeCode: unknown
  body?: unknown
  param?: unknown
}

interface Ctx {
  started: number
  correlationId: string
  actorId: string
  tenantId: string
  root: string | null
  entityId: string | null
}

type Output = ScadaSeriesOutput | VirtualSeriesOutput

interface Executed {
  multi: ScadaMultiSeriesResult
  outputs: Output[]
  virtualFailures: VirtualColumnFailure[]
  sourceReports: ScadaMultiSourceResult['sources']
  complete: boolean
}

const PRESET_ERROR_TO_API: Readonly<Record<PresetErrorCode, ScadaApiErrorCode>> = {
  PRESET_INVALID: 'SCADA_REQUEST_INVALID',
  PRESET_SCOPE_INVALID: 'SCADA_REQUEST_INVALID',
  PRESET_OWNER_REQUIRED: 'SCADA_REQUEST_INVALID',
  PRESET_TENANT_REQUIRED: 'SCADA_REQUEST_INVALID',
  PRESET_UNKNOWN_FIELD: 'SCADA_REQUEST_UNKNOWN_FIELD',
  PRESET_DUPLICATE_SERIES: 'SCADA_REQUEST_INVALID',
  PRESET_DUPLICATE_SOURCE: 'SCADA_REQUEST_INVALID',
  PRESET_INVALID_INTERVAL: 'SCADA_INTERVAL_INVALID',
  PRESET_INVALID_TIME_RANGE: 'SCADA_TIME_RANGE_INVALID',
  PRESET_TIMEZONE_UNVERIFIED: 'SCADA_TIMEZONE_MISMATCH',
  PRESET_VIRTUAL_COLUMN_INVALID: 'SCADA_VIRTUAL_COLUMN_INVALID',
  PRESET_VIRTUAL_COLUMN_VERSION_AMBIGUOUS: 'SCADA_VIRTUAL_COLUMN_VERSION_AMBIGUOUS',
  // Another root's / another user's preset, an unknown source and an unmappable tenant all look the same: "not found".
  PRESET_SCOPE_BLOCKED: 'SCADA_NOT_FOUND',
  PRESET_VERSION_CONFLICT: 'SCADA_PRESET_VERSION_CONFLICT',
  PRESET_NOT_ACTIVE: 'SCADA_PRESET_NOT_ACTIVE',
}

const QUERY_ERROR_TO_API: Readonly<Record<ScadaQueryErrorCode, ScadaApiErrorCode>> = {
  INVALID_REQUEST: 'SCADA_REQUEST_INVALID',
  INVALID_CATALOG_ID: 'SCADA_REQUEST_INVALID',
  SOURCE_NOT_FOUND: 'SCADA_NOT_FOUND',
  SOURCE_NOT_VERIFIED: 'SCADA_SOURCE_UNAVAILABLE',
  SOURCE_MAPPING_UNRESOLVED: 'SCADA_SOURCE_UNAVAILABLE',
  SOURCE_BLOCKED: 'SCADA_SOURCE_UNAVAILABLE',
  SOURCE_TIMEZONE_REQUIRED: 'SCADA_SOURCE_UNAVAILABLE',
  SOURCE_LIMIT_PROFILE_REQUIRED: 'SCADA_SOURCE_UNAVAILABLE',
  TABLE_NOT_ALLOWED: 'SCADA_SOURCE_UNAVAILABLE',
  COLUMN_NOT_ALLOWED: 'SCADA_SOURCE_UNAVAILABLE',
  TIME_RANGE_INVALID: 'SCADA_TIME_RANGE_INVALID',
  TIME_RANGE_LIMIT_EXCEEDED: 'SCADA_LIMIT_EXCEEDED',
  QUERY_WINDOW_CONFIGURATION_REQUIRED: 'SCADA_SOURCE_NOT_CONFIGURED',
  TENANT_SCOPE_DENIED: 'SCADA_SCOPE_DENIED',
  SCADA_ADAPTER_FAILED: 'SCADA_SOURCE_UNAVAILABLE',
  SCADA_QUERY_CANCELLED: 'SCADA_SOURCE_UNAVAILABLE',
  AUDIT_FAILED: 'SCADA_AUDIT_FAILED',
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * The SCADA reporting API orchestration (TASK-027.72). It wires the pure cores of 027.65–71 behind the reporting module's
 * existing guards. ORDER (each step only runs when the previous one passed):
 *   limits → pure request validation → provider availability → artifact → resolved tenant scope → caller record →
 *   preset / source authorisation (the 027.71 resolver) → query service (reads + audits every source) → quality →
 *   multi-series → virtual columns → (comparison) → whitelist projection.
 * NOTHING before the pure validation touches a scope, a catalog, a provider or an adapter.
 *
 * AUDIT: one boundary. The query service audits every source READ (SUCCEEDED / DENIED / FAILED) and this service audits every
 * rejection that never reaches it, through the very same `ScadaQueryAuditPort` and the very same three action codes. A
 * success is returned only after its record is durable (a failed write ⇒ SCADA_AUDIT_FAILED and NO data); a rejection stays
 * a rejection even if its own record cannot be written.
 */
export class ScadaAnalysisApiService {
  private readonly quality: ScadaDataQualityService
  private readonly series = new ScadaMultiSeriesService()
  private readonly comparison = new ScadaComparisonService()
  private readonly virtual = new VirtualColumnService()
  private readonly pendingPng = new PendingPngExports()

  constructor(private readonly deps: ScadaAnalysisApiDeps) {
    this.quality = new ScadaDataQualityService(deps.rollover ?? new InMemoryRolloverPolicyProvider([]))
  }

  // ---------------------------------------------------------------- analysis

  async runAnalysis(call: ScadaApiCall): Promise<ProjectedAnalysis> {
    const ctx = this.begin(call)
    try {
      return (await this.analysisCore(ctx, call)).projected
    } catch (error) {
      throw await this.reject(ctx, error)
    }
  }

  private async analysisCore(ctx: Ctx, call: ScadaApiCall) {
    const limits = this.requireLimits()
    const clean = this.check(validateAnalysisRequest(call.routeCode, call.body, limits))
    ctx.entityId = firstCatalogId(clean.kind === 'EXPLICIT' ? clean.sourceCatalogIds : [])
    this.requireProviders(clean.kind === 'PRESET')
    await this.assertArtifact(call)
    const env = await this.environment(ctx, call)
    const plan = await this.resolveAnalysisPlan(env, clean, limits)
    const executed = await this.runPipeline(call, env, plan, plan.timeRange, clean.mode)
    return { projected: this.projectAnalysis(call, plan, executed), plan, env }
  }

  // ---------------------------------------------------------------- comparison

  async runComparison(call: ScadaApiCall): Promise<ProjectedComparison> {
    const ctx = this.begin(call)
    try {
      return (await this.comparisonCore(ctx, call)).projected
    } catch (error) {
      throw await this.reject(ctx, error)
    }
  }

  private async comparisonCore(ctx: Ctx, call: ScadaApiCall) {
    const limits = this.requireLimits()
    const clean = this.check(validateComparisonRequest(call.routeCode, call.body, limits))
    ctx.entityId = firstCatalogId(clean.kind === 'EXPLICIT' ? (clean.mode === 'PERIOD' ? clean.sourceCatalogIds : [clean.leftSourceCatalogId]) : [])
    this.requireProviders(clean.kind === 'PRESET')
    await this.assertArtifact(call)
    const env = await this.environment(ctx, call)
    const plan = await this.resolveComparisonPlan(env, clean, limits)
    return { projected: await this.compare(call, env, plan), plan, env }
  }

  // ---------------------------------------------------------------- export (TASK-027.74)

  /**
   * Export of the analysis / comparison the screen is showing. The request is the SAME body the screen sent to query / compare
   * (`{ analysis }` XOR `{ comparison }`) and is re-validated and re-executed through the very same pipeline (scope, source gates,
   * query-service audit) — an export never trusts client-side rows. ORDER: pure validation → (analysis core: providers, artifact,
   * scope, caller, plan, read) → empty-result refusal → file → durable export audit → bytes. A failed audit write ⇒ SCADA_AUDIT_FAILED
   * and NO bytes. Permission / tenant / MFA are the controller's guards (`REPORT:ARTIFACT:EXPORT`), which run before this method.
   */
  async runExport(call: ScadaApiCall): Promise<ScadaExportResult> {
    const ctx = this.begin(call)
    const trace: { format: ScadaExportFormat | null; kind: 'ANALYSIS' | 'COMPARISON' | null; rendererMode: ScadaExportRendererMode; rowCount: number | null; simulation: boolean } = { format: null, kind: null, rendererMode: 'NONE', rowCount: null, simulation: false }
    try {
      this.requireLimits()
      const route = this.check(validateRouteCode(call.routeCode))
      const format = this.check(validateExportFormat(call.param))
      trace.format = format
      const request = this.check(validateExportBody(call.body))
      trace.kind = request.kind
      if (!this.deps.exportAudit) throw new ScadaApiError('SCADA_SOURCE_NOT_CONFIGURED') // fail-closed: no export without a place to record it
      const sub: ScadaApiCall = { ...call, body: request.body }
      const descriptor = this.deps.sources?.describeArtifact ? this.deps.sources.describeArtifact(route) : null
      trace.simulation = descriptor?.developmentOnly === true

      let model
      if (request.kind === 'ANALYSIS') {
        const core = await this.analysisCore(ctx, sub)
        model = buildAnalysisModel(core.projected, await this.exportMeta(core.env, core.plan, route, descriptor))
      } else {
        const core = await this.comparisonCore(ctx, sub)
        model = buildComparisonModel(core.projected, await this.exportMeta(core.env, core.plan, route, descriptor), core.plan.sourceCatalogIds)
      }
      if (isEmptyModel(model)) throw new ScadaApiError('SCADA_EXPORT_EMPTY')
      trace.rowCount = modelRowCount(model)

      let result: ScadaExportResult
      if (format === 'PNG') {
        // the PNG bytes do not exist yet (the browser draws them): NO success is recorded here — only the completion below can
        const exportId = this.deps.clock.correlationId()
        this.pendingPng.register(exportId, { actorId: call.actor.id, tenantId: call.tenantId, customerRootTenantId: ctx.root ?? '', artifactCode: route, rowCount: trace.rowCount, simulation: trace.simulation }, this.deps.clock.nowMs())
        result = { kind: 'PNG_CAPTION', format: 'PNG', exportId, fileName: exportFileName(route, 'PNG', model.generatedAt), title: model.title, captionLines: buildPngCaptionLines(model), developmentLabel: model.developmentLabel, rowCount: trace.rowCount }
      } else {
        try {
          const built = await buildExportFile(format, model, this.deps.exportRenderer)
          trace.rendererMode = built.rendererMode
          result = built.file
        } catch (error) {
          if (error instanceof ScadaExportRenderError) throw new ScadaApiError(error.kind === 'TOO_LARGE' ? 'SCADA_LIMIT_EXCEEDED' : 'SCADA_EXPORT_RENDER_FAILED')
          throw new ScadaApiError('SCADA_EXPORT_RENDER_FAILED') // a builder / renderer error text never leaves
        }
      }
      if (result.kind === 'PNG_CAPTION') return result
      // success is recorded only AFTER the bytes exist, and returned only if the record is durable
      try {
        await this.deps.exportAudit.record(this.exportEntry(ctx, route, trace, 'SUCCEEDED', 'OK'))
      } catch {
        throw new ScadaApiError('SCADA_AUDIT_FAILED')
      }
      return result
    } catch (error) {
      const api = await this.reject(ctx, error)
      if (api.code !== 'SCADA_AUDIT_FAILED' && this.deps.exportAudit) {
        try {
          await this.deps.exportAudit.record(this.exportEntry(ctx, typeof call.routeCode === 'string' ? call.routeCode : null, trace, 'FAILED', api.code))
        } catch {
          // a failure stays a failure even when its own record cannot be written
        }
      }
      throw api
    }
  }

  /**
   * PNG step 2: the browser reports that it has (or has not) produced the PNG bytes. The report is re-verified against the pending export
   * the server registered in step 1: SAME actor, tenant, customer root (re-resolved now) and artifact, single use, unexpired. Only then is
   * the success (or a client-render failure) recorded; a failed audit write ⇒ SCADA_AUDIT_FAILED and the client must not deliver the file.
   */
  async completePngExport(call: ScadaApiCall): Promise<{ recorded: true }> {
    const ctx = this.begin(call)
    try {
      this.requireLimits()
      const route = this.check(validateRouteCode(call.routeCode))
      const clean = this.check(validatePngCompletion(call.body))
      if (!this.deps.exportAudit) throw new ScadaApiError('SCADA_SOURCE_NOT_CONFIGURED')
      const env = await this.environment(ctx, call)
      const pending = this.pendingPng.take(clean.exportId, this.deps.clock.nowMs())
      if (!pending || pending.actorId !== call.actor.id || pending.tenantId !== call.tenantId || pending.customerRootTenantId !== env.scope.customerRootTenantId || pending.artifactCode !== route) {
        throw new ScadaApiError('SCADA_EXPORT_CONTEXT_INVALID')
      }
      const ok = clean.outcome === 'SUCCEEDED'
      const entry: ScadaExportAuditEntry = { actorId: ctx.actorId, tenantId: ctx.tenantId, artifactCode: route, format: 'PNG', kind: null, result: ok ? 'SUCCEEDED' : 'FAILED', reasonCode: ok ? 'OK' : 'CLIENT_RENDER_FAILED', rendererMode: 'NONE', delivery: 'CLIENT_RENDERED', rowCount: pending.rowCount, simulation: pending.simulation, correlationId: ctx.correlationId }
      try {
        await this.deps.exportAudit.record(entry)
      } catch {
        throw new ScadaApiError('SCADA_AUDIT_FAILED')
      }
      return { recorded: true }
    } catch (error) {
      throw await this.reject(ctx, error)
    }
  }

  private exportEntry(ctx: Ctx, code: string | null, trace: { format: ScadaExportFormat | null; kind: 'ANALYSIS' | 'COMPARISON' | null; rendererMode: ScadaExportRendererMode; rowCount: number | null; simulation: boolean }, result: 'SUCCEEDED' | 'FAILED', reasonCode: string): ScadaExportAuditEntry {
    return { actorId: ctx.actorId, tenantId: ctx.tenantId, artifactCode: code !== null && validateRouteCode(code).ok ? code : null, format: trace.format, kind: trace.kind, result, reasonCode, rendererMode: trace.rendererMode, delivery: trace.format === 'PNG' ? 'CLIENT_RENDERED' : 'SERVER_FILE', rowCount: trace.rowCount, simulation: trace.simulation, correlationId: ctx.correlationId }
  }

  private async exportMeta(env: Awaited<ReturnType<ScadaAnalysisApiService['environment']>>, plan: AnalysisPlan, code: string, descriptor: { name: string; developmentOnly: boolean } | null): Promise<ExportMeta> {
    const sourceNames = new Map((await this.apiSources(env)).filter(x => x.customerRootTenantId === env.scope.customerRootTenantId).map(x => [x.catalogId, x.displayName] as const))
    return {
      artifactCode: code,
      title: descriptor && descriptor.name ? `SCADA analiz raporu — ${descriptor.name}` : 'SCADA analiz raporu',
      generatedAt: new Date(this.deps.clock.nowMs()).toISOString(),
      developmentLabel: descriptor?.developmentOnly ? SCADA_FIXTURE_DEVELOPMENT_LABEL : null,
      sourceNames,
      plan,
    }
  }

  // ---------------------------------------------------------------- presets (read / resolve only)

  async listPresets(call: ScadaApiCall) {
    const ctx = this.begin(call)
    try {
      const limits = this.requireLimits()
      this.check(validateRouteCode(call.routeCode))
      if (!this.deps.presets) throw new ScadaApiError('SCADA_SOURCE_NOT_CONFIGURED')
      await this.assertArtifact(call)
      const env = await this.environment(ctx, call)
      const groups = this.groupVersions(await this.loadPresetVersions(env))
      const items = []
      for (const id of [...groups.keys()].sort()) {
        const versions = groups.get(id)!
        const visible = this.visibleVersions(versions, env.caller, limits)
        if (!visible) continue
        const effective = versionAt(visible.active, env.nowMs) ?? visible.all[visible.all.length - 1]!
        items.push(projectPresetSummary(effective, call.actor.id))
      }
      await this.auditSuccess(ctx, items.length)
      // developmentStore: whether the development in-memory store (and its create route) exists here; canShare: whether the caller may create TENANT_SHARED presets
      return { presets: items, developmentStore: this.deps.presetManager !== undefined, canShare: this.deps.presetManager ? await this.canManage(env) : false }
    } catch (error) {
      throw await this.reject(ctx, error)
    }
  }

  async getPreset(call: ScadaApiCall) {
    const ctx = this.begin(call)
    try {
      const limits = this.requireLimits()
      this.check(validateRouteCode(call.routeCode))
      const presetId = this.check(validatePresetIdParam(call.param))
      if (!this.deps.presets) throw new ScadaApiError('SCADA_SOURCE_NOT_CONFIGURED')
      await this.assertArtifact(call)
      const env = await this.environment(ctx, call)
      const versions = this.groupVersions(await this.loadPresetVersions(env)).get(presetId)
      const visible = versions ? this.visibleVersions(versions, env.caller, limits) : null
      if (!versions || !visible) throw new ScadaApiError('SCADA_NOT_FOUND') // unknown, another root's and another user's look identical
      const effective = versionAt(visible.active, env.nowMs) ?? visible.all[visible.all.length - 1]!
      let resolution: { status: 'RESOLVED'; plan: ReturnType<typeof projectPlan> } | { status: 'NOT_RESOLVED'; code: ScadaApiErrorCode }
      if (!this.deps.sources) {
        resolution = { status: 'NOT_RESOLVED', code: 'SCADA_SOURCE_NOT_CONFIGURED' }
      } else {
        const r = resolvePreset({ caller: env.caller, presetVersions: versions, at: new Date(env.nowMs).toISOString(), limits: limits.preset, sources: await this.presetSources(env), virtualColumnDefinitions: await this.definitions(env) })
        resolution = r.ok ? { status: 'RESOLVED', plan: projectPlan(r.plan) } : { status: 'NOT_RESOLVED', code: PRESET_ERROR_TO_API[r.code] }
      }
      await this.auditSuccess(ctx, 1)
      return {
        preset: projectPresetSummary(effective, call.actor.id),
        versions: visible.all.map(v => ({ version: v.version, status: v.status, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo })),
        resolution,
      }
    } catch (error) {
      throw await this.reject(ctx, error)
    }
  }

  // ---------------------------------------------------------------- development presets (TASK-027.59-R1)

  /**
   * Create = a NEW preset (version 1, ACTIVE) authored from the screen's current settings. The client supplies only the analysis plan;
   * id, version, owner, status, root and timestamps are server generated. A TENANT_SHARED preset needs the management right (active system
   * administrator or the root's TENANT_ADMIN, through the composed port); PRIVATE is available to every standing caller. The plan is
   * validated by the 027.71 validator AND resolved against the CURRENT catalog / virtual columns BEFORE anything is stored, so an empty,
   * invalid or stale plan (unknown / inactive source, unknown series, mismatched zone …) is never saved.
   */
  async createPreset(call: ScadaApiCall): Promise<ProjectedPresetSummary> {
    const ctx = this.begin(call)
    try {
      const limits = this.requireLimits()
      this.check(validateRouteCode(call.routeCode))
      const clean = this.check(validatePresetCreateRequest(call.body, limits))
      ctx.entityId = firstCatalogId(clean.sourceCatalogIds)
      const manager = this.deps.presetManager
      if (!manager || !this.deps.sources) throw new ScadaApiError('SCADA_SOURCE_NOT_CONFIGURED')
      await this.assertArtifact(call)
      const env = await this.environment(ctx, call)
      this.requireStanding(env)
      if (clean.scope === 'TENANT_SHARED' && !(await this.canManage(env))) throw new ScadaApiError('SCADA_SCOPE_DENIED')
      const identity = manager.nextIdentity()
      const now = new Date(this.deps.clock.nowMs()).toISOString()
      const candidate: ScadaPreset = {
        presetId: identity.presetId,
        customerRootTenantId: env.scope.customerRootTenantId,
        ownerUserId: call.actor.id,
        scope: clean.scope,
        name: clean.name,
        description: clean.description,
        version: identity.version,
        status: 'ACTIVE',
        sourceCatalogIds: clean.sourceCatalogIds,
        seriesKeys: clean.seriesKeys,
        virtualColumns: clean.virtualColumns,
        statistics: clean.statistics,
        comparison: clean.comparison,
        filters: {},
        timeRange: clean.timeRange,
        bucketInterval: clean.bucketInterval,
        timezone: clean.timezone,
        display: { chartType: clean.chartType },
        createdAt: now,
        updatedAt: now,
        effectiveFrom: null,
        effectiveTo: null,
      }
      const valid = validatePreset(candidate, limits.preset)
      if (!valid.ok) throw new ScadaApiError(PRESET_ERROR_TO_API[valid.code])
      await this.resolveVersions(env, [valid.preset], limits, null) // the plan must resolve against the CURRENT catalog / columns
      try {
        manager.append(valid.preset)
      } catch {
        throw new ScadaApiError('SCADA_REQUEST_INVALID') // identity conflict: static
      }
      await this.auditSuccess(ctx, 1)
      return projectPresetSummary(valid.preset, call.actor.id)
    } catch (error) {
      throw await this.reject(ctx, error)
    }
  }

  // ---------------------------------------------------------------- development virtual column management (TASK-027.71-R1)

  /** Everyone with REPORT:ARTIFACT:VIEW may LIST the columns of their own root (no expression is ever returned). */
  async listVirtualColumns(call: ScadaApiCall): Promise<{ virtualColumns: ProjectedVirtualColumn[]; canManage: boolean }> {
    const ctx = this.begin(call)
    try {
      this.requireLimits()
      this.check(validateRouteCode(call.routeCode))
      const manager = this.requireManager()
      await this.assertArtifact(call)
      const env = await this.environment(ctx, call)
      this.requireStanding(env)
      const rows = (await manager.listDefinitions(env.scope.customerRootTenantId)).filter(r => r.customerRootTenantId === env.scope.customerRootTenantId)
      const groups = new Map<string, VirtualColumnDefinition[]>()
      for (const r of rows) groups.set(r.virtualColumnId, [...(groups.get(r.virtualColumnId) ?? []), r])
      const virtualColumns = [...groups.keys()].sort(cmp).map(id => projectVirtualColumn(groups.get(id)!))
      const canManage = await this.canManage(env)
      await this.auditSuccess(ctx, virtualColumns.length)
      return { virtualColumns, canManage }
    } catch (error) {
      throw await this.reject(ctx, error)
    }
  }

  /** Create = a new DRAFT version. Validated by the 027.70 parser / validator BEFORE anything is stored. */
  async createVirtualColumn(call: ScadaApiCall): Promise<ProjectedVirtualColumn> {
    const ctx = this.begin(call)
    try {
      const limits = this.requireLimits()
      this.check(validateRouteCode(call.routeCode))
      const clean = this.check(validateVirtualColumnRequest(call.body, limits))
      ctx.entityId = clean.catalogId
      const manager = this.requireManager()
      if (!this.deps.sources) throw new ScadaApiError('SCADA_SOURCE_NOT_CONFIGURED')
      await this.assertArtifact(call)
      const env = await this.environment(ctx, call)
      this.requireStanding(env)
      if (!(await this.canManage(env))) throw new ScadaApiError('SCADA_SCOPE_DENIED') // only an active system admin / the root's TENANT_ADMIN
      const root = env.scope.customerRootTenantId
      const source = await this.manageableSource(env, clean.catalogId)
      const verified = new Map(source.series.map(x => [x.seriesKey, x]))
      const known = new Set([...verified.keys(), ...(source.unverifiedSeries ?? []).map(u => u.seriesKey)])
      if (known.has(clean.seriesKey)) throw new ScadaApiError('SCADA_VIRTUAL_COLUMN_INVALID') // never shadows a physical column
      if (clean.inputSeriesKeys.some(k => !verified.has(k))) throw new ScadaApiError('SCADA_VIRTUAL_COLUMN_INVALID') // unknown / unverified input
      const types = new Set(clean.inputSeriesKeys.map(k => verified.get(k)!.valueType))
      if (types.size !== 1) throw new ScadaApiError('SCADA_MIXED_VALUE_TYPES')
      const identity = manager.nextIdentity(root, clean.catalogId, clean.seriesKey)
      const definition: VirtualColumnDefinition = {
        virtualColumnId: identity.virtualColumnId,
        catalogId: clean.catalogId,
        customerRootTenantId: root,
        seriesKey: clean.seriesKey,
        label: clean.label,
        unit: clean.unit,
        expression: clean.expression,
        inputSeriesKeys: clean.inputSeriesKeys,
        valueType: [...types][0] as VirtualColumnDefinition['valueType'],
        version: identity.version,
        effectiveFrom: null,
        effectiveTo: null,
        status: 'DRAFT',
        createdBy: call.actor.id,
        updatedAt: new Date(this.deps.clock.nowMs()).toISOString(),
      }
      this.compileOrThrow(definition, limits, verified)
      try {
        manager.append(definition)
      } catch {
        throw new ScadaApiError('SCADA_VIRTUAL_COLUMN_INVALID') // identity / version conflict: static
      }
      const projected = projectVirtualColumn((await manager.listDefinitions(root)).filter(r => r.virtualColumnId === definition.virtualColumnId))
      await this.auditSuccess(ctx, 1)
      return projected
    } catch (error) {
      throw await this.reject(ctx, error)
    }
  }

  /** Activate the LATEST version (re-validated against the CURRENT catalog; a failure BLOCKS it). Other ACTIVE versions become DISABLED. */
  async activateVirtualColumn(call: ScadaApiCall): Promise<ProjectedVirtualColumn> {
    return this.transitionVirtualColumn(call, 'ACTIVE')
  }

  async disableVirtualColumn(call: ScadaApiCall): Promise<ProjectedVirtualColumn> {
    return this.transitionVirtualColumn(call, 'DISABLED')
  }

  private async transitionVirtualColumn(call: ScadaApiCall, target: 'ACTIVE' | 'DISABLED'): Promise<ProjectedVirtualColumn> {
    const ctx = this.begin(call)
    try {
      const limits = this.requireLimits()
      this.check(validateRouteCode(call.routeCode))
      const id = this.check(validateVirtualColumnIdParam(call.param))
      const manager = this.requireManager()
      if (!this.deps.sources) throw new ScadaApiError('SCADA_SOURCE_NOT_CONFIGURED')
      await this.assertArtifact(call)
      const env = await this.environment(ctx, call)
      this.requireStanding(env)
      if (!(await this.canManage(env))) throw new ScadaApiError('SCADA_SCOPE_DENIED')
      const root = env.scope.customerRootTenantId
      const versions = (await manager.listDefinitions(root)).filter(r => r.virtualColumnId === id && r.customerRootTenantId === root)
      if (versions.length === 0) throw new ScadaApiError('SCADA_NOT_FOUND') // unknown and another root's look identical
      ctx.entityId = versions[0]!.catalogId
      const latest = [...versions].sort((a, b) => a.version - b.version)[versions.length - 1]!
      const now = new Date(this.deps.clock.nowMs()).toISOString()
      if (target === 'DISABLED') {
        for (const v of versions.filter(x => x.status === 'ACTIVE' || x.version === latest.version)) manager.setStatus(root, id, v.version, 'DISABLED', now)
      } else {
        const source = await this.manageableSource(env, latest.catalogId)
        try {
          this.compileOrThrow(latest, limits, new Map(source.series.map(x => [x.seriesKey, x])))
        } catch (error) {
          manager.setStatus(root, id, latest.version, 'BLOCKED', now) // the column no longer fits the catalog: blocked, never active
          throw error
        }
        for (const v of versions.filter(x => x.status === 'ACTIVE' && x.version !== latest.version)) manager.setStatus(root, id, v.version, 'DISABLED', now)
        manager.setStatus(root, id, latest.version, 'ACTIVE', now)
      }
      const projected = projectVirtualColumn((await manager.listDefinitions(root)).filter(r => r.virtualColumnId === id))
      await this.auditSuccess(ctx, 1)
      return projected
    } catch (error) {
      throw await this.reject(ctx, error)
    }
  }

  private requireManager() {
    if (!this.deps.virtualColumnManager) throw new ScadaApiError('SCADA_SOURCE_NOT_CONFIGURED')
    return this.deps.virtualColumnManager
  }

  /** The caller must still stand: mappable + active tenant inside the resolved scope, active user (the bridge never replaces this). */
  private requireStanding(env: { caller: PresetCaller }): void {
    if (!canUsePreset({ customerRootTenantId: env.caller.scope.customerRootTenantId, scope: 'TENANT_SHARED', ownerUserId: null }, env.caller)) throw new ScadaApiError('SCADA_SCOPE_DENIED')
  }

  /** Management right = the existing role model (active system administrator or the root's TENANT_ADMIN) through the composed port; fail-closed without it. */
  private async canManage(env: { caller: PresetCaller }): Promise<boolean> {
    try {
      return (await this.deps.presetAuthorization?.canSharePreset({ userId: env.caller.userId, customerRootTenantId: env.caller.scope.customerRootTenantId })) === true
    } catch {
      return false
    }
  }

  private async manageableSource(env: Awaited<ReturnType<ScadaAnalysisApiService['environment']>>, catalogId: string): Promise<ScadaApiSource> {
    const source = (await this.apiSources(env)).find(s => s.catalogId === catalogId && s.customerRootTenantId === env.scope.customerRootTenantId)
    if (!source) throw new ScadaApiError('SCADA_NOT_FOUND')
    const gate = catalogGate(source, env.scope)
    if (gate === 'OMIT' || !gate.selectable) throw new ScadaApiError('SCADA_NOT_FOUND')
    return source
  }

  /** 027.70 parser + validator: allowlist DSL, no unknown / unverified inputs, no self reference, bounded depth / length. Static error only. */
  private compileOrThrow(definition: VirtualColumnDefinition, limits: ScadaApiLimits, verified: ReadonlyMap<string, unknown>): void {
    try {
      compileDefinition(definition, limits.virtualColumn, new Set(verified.keys()))
    } catch (error) {
      if (error instanceof ExpressionError) throw new ScadaApiError('SCADA_VIRTUAL_COLUMN_INVALID')
      throw new ScadaApiError('SCADA_INTERNAL_ERROR')
    }
  }

  // ---------------------------------------------------------------- catalog discovery (source / series selection)

  /**
   * What the analysis form may offer: the sources of the CALLER's customer root and their listable series. Same guard chain and
   * the same fail-closed gates as the analysis; a source that cannot be analysed is reported `selectable: false` with a static
   * reason and NO series; the excluded organisation's sources and other roots' sources are not listed at all.
   */
  async getCatalog(call: ScadaApiCall): Promise<ProjectedCatalog> {
    const ctx = this.begin(call)
    try {
      this.requireLimits()
      this.check(validateRouteCode(call.routeCode))
      if (!this.deps.sources) throw new ScadaApiError('SCADA_SOURCE_NOT_CONFIGURED')
      await this.assertArtifact(call)
      const env = await this.environment(ctx, call)
      // the caller's own standing first (unmappable / inactive tenant, inactive user, outside the resolved scope)
      if (!canUsePreset({ customerRootTenantId: env.caller.scope.customerRootTenantId, scope: 'TENANT_SHARED', ownerUserId: null }, env.caller)) throw new ScadaApiError('SCADA_SCOPE_DENIED')
      const descriptor = this.deps.sources.describeArtifact ? this.deps.sources.describeArtifact(call.routeCode as string) : null
      if (this.deps.sources.describeArtifact && !descriptor) throw new ScadaApiError('SCADA_NOT_FOUND') // this catalog does not serve that artifact code
      const sources: ProjectedCatalogSource[] = []
      for (const source of [...(await this.apiSources(env))].sort((a, b) => cmp(a.catalogId, b.catalogId))) {
        if (source.customerRootTenantId !== env.scope.customerRootTenantId) continue // another root: never listed
        const gate = catalogGate(source, env.scope)
        if (gate === 'OMIT') continue
        sources.push(projectCatalogSource(source, gate))
      }
      await this.auditSuccess(ctx, sources.length)
      return {
        artifact: descriptor ? { ...descriptor, supportedIntervals: [...descriptor.supportedIntervals], supportedFormats: [...descriptor.supportedFormats], sourceCatalogIds: [...descriptor.sourceCatalogIds] } : null,
        developmentLabel: descriptor?.developmentOnly ? SCADA_FIXTURE_DEVELOPMENT_LABEL : null,
        sources,
      }
    } catch (error) {
      throw await this.reject(ctx, error)
    }
  }

  /**
   * Whether the caller may SHARE / change / delete a TENANT_SHARED preset (no route uses it yet — preset CRUD is out of scope).
   * Delegates to the composed `PresetAuthorizationPort` through the 027.71 service: fail-closed without a port, for another
   * root, an unmappable tenant or an inactive user.
   */
  async authorizeShare(call: ScadaApiCall, preset: Pick<ScadaPreset, 'scope' | 'customerRootTenantId'>): Promise<boolean> {
    const ctx = this.begin(call)
    try {
      const env = await this.environment(ctx, call)
      const result = await new ScadaPresetService(this.deps.presetAuthorization).authorizeShare(env.caller, preset)
      return result.ok
    } catch {
      return false
    }
  }

  // ---------------------------------------------------------------- plumbing

  private begin(call: ScadaApiCall): Ctx {
    return { started: this.deps.clock.nowMs(), correlationId: this.deps.clock.correlationId(), actorId: typeof call?.actor?.id === 'string' ? call.actor.id : '', tenantId: typeof call?.tenantId === 'string' ? call.tenantId : '', root: null, entityId: null }
  }

  private check<T>(result: { ok: true; value: T } | { ok: false; code: ScadaApiErrorCode }): T {
    if (!result.ok) throw new ScadaApiError(result.code)
    return result.value
  }

  private requireLimits(): ScadaApiLimits {
    let limits: unknown = null
    try {
      limits = this.deps.limits?.get() ?? null
    } catch {
      limits = null
    }
    if (!apiLimitsValid(limits)) throw new ScadaApiError('SCADA_LIMITS_NOT_CONFIGURED')
    return limits
  }

  /** No provider ⇒ a safe 503. Nothing synthetic is ever produced to fill the gap. */
  private requireProviders(preset: boolean): void {
    if (!this.deps.sources || !this.deps.query || (preset && !this.deps.presets)) throw new ScadaApiError('SCADA_SOURCE_NOT_CONFIGURED')
  }

  private async assertArtifact(call: ScadaApiCall): Promise<void> {
    try {
      await this.deps.artifacts.assertExists(call.tenantId, call.routeCode as string)
    } catch (error) {
      const status = isObj(error) && typeof error['getStatus'] === 'function' ? (error['getStatus'] as () => number)() : 0
      throw new ScadaApiError(status === 404 ? 'SCADA_NOT_FOUND' : 'SCADA_INTERNAL_ERROR')
    }
  }

  private async environment(ctx: Ctx, call: ScadaApiCall) {
    let scope: ScadaApiScope
    let callerInfo: Awaited<ReturnType<ScadaCallerDirectory['describe']>>
    try {
      scope = await this.deps.scopes.resolve(call.tenantId)
      callerInfo = await this.deps.callers.describe(call.actor.id, call.tenantId)
    } catch {
      throw new ScadaApiError('SCADA_SCOPE_DENIED')
    }
    ctx.root = scope.customerRootTenantId
    const caller: PresetCaller = { userId: call.actor.id, userActive: callerInfo.userActive, tenant: callerInfo.tenant, scope: { tenantId: scope.tenantId, customerRootTenantId: scope.customerRootTenantId, dataScopeTenantIds: [...scope.dataScopeTenantIds] } }
    return { scope, caller, nowMs: this.deps.clock.nowMs(), cache: {} as { sources?: readonly ScadaApiSource[]; defs?: readonly VirtualColumnDefinition[] } }
  }

  private async apiSources(env: { scope: ScadaApiScope; cache: { sources?: readonly ScadaApiSource[] } }): Promise<readonly ScadaApiSource[]> {
    if (env.cache.sources) return env.cache.sources
    try {
      env.cache.sources = await this.deps.sources!.listSources(readScope(env.scope))
    } catch {
      throw new ScadaApiError('SCADA_SOURCE_UNAVAILABLE')
    }
    return env.cache.sources
  }

  private async presetSources(env: { scope: ScadaApiScope; cache: { sources?: readonly ScadaApiSource[] } }): Promise<PresetSourceInfo[]> {
    return (await this.apiSources(env)).map(s => ({ catalogId: s.catalogId, customerRootTenantId: s.customerRootTenantId, active: s.active, mappingResolved: s.mappingResolved, tenant: s.tenant, sourceTimeZone: s.sourceTimeZone, seriesKeys: s.series.map(x => x.seriesKey) }))
  }

  private async definitions(env: { scope: ScadaApiScope; cache: { defs?: readonly VirtualColumnDefinition[] } }): Promise<readonly VirtualColumnDefinition[]> {
    if (env.cache.defs) return env.cache.defs
    if (!this.deps.virtualColumns) return (env.cache.defs = [])
    try {
      // the store is asked for THIS root only, and the resolver re-checks the root of every definition
      env.cache.defs = await this.deps.virtualColumns.listDefinitions(env.scope.customerRootTenantId)
    } catch {
      throw new ScadaApiError('SCADA_SOURCE_UNAVAILABLE')
    }
    return env.cache.defs
  }

  private async loadPresetVersions(env: { scope: ScadaApiScope }): Promise<readonly ScadaPreset[]> {
    try {
      return await this.deps.presets!.listPresetVersions(env.scope.customerRootTenantId)
    } catch {
      throw new ScadaApiError('SCADA_SOURCE_UNAVAILABLE')
    }
  }

  private groupVersions(all: readonly ScadaPreset[]): Map<string, ScadaPreset[]> {
    const groups = new Map<string, ScadaPreset[]>()
    for (const p of all) {
      if (!isObj(p) || typeof p['presetId'] !== 'string') continue
      if (!groups.has(p.presetId)) groups.set(p.presetId, [])
      groups.get(p.presetId)!.push(p)
    }
    return groups
  }

  /** A preset group is visible only if the CALLER may use it (root / owner / shared rules of 027.71) and every version is sound. */
  private visibleVersions(versions: ScadaPreset[], caller: PresetCaller, limits: ScadaApiLimits): { all: ScadaPreset[]; active: ScadaPreset[] } | null {
    const head = [...versions].sort((a, b) => (isObj(a) && isObj(b) ? Number(a.version) - Number(b.version) : 0))[versions.length - 1]
    if (!head || !canUsePreset(head, caller)) return null
    const sound: ScadaPreset[] = []
    for (const v of versions) {
      const r = validatePreset(v, limits.preset)
      if (!r.ok) return null
      sound.push(r.preset)
    }
    const set = checkVersionSet(sound)
    if (!set.ok) return null
    return { all: sound.sort((a, b) => a.version - b.version), active: set.active }
  }

  private syntheticPreset(env: { caller: PresetCaller; nowMs: number }, parts: Pick<ScadaPreset, 'sourceCatalogIds' | 'seriesKeys' | 'virtualColumns' | 'statistics' | 'comparison' | 'timeRange' | 'bucketInterval' | 'timezone'>): ScadaPreset {
    const now = new Date(env.nowMs).toISOString()
    return {
      presetId: 'adhoc',
      customerRootTenantId: env.caller.scope.customerRootTenantId,
      ownerUserId: env.caller.userId,
      scope: 'PRIVATE',
      name: 'ad hoc analysis',
      description: null,
      version: 1,
      status: 'ACTIVE',
      filters: {},
      display: { chartType: 'LINE' },
      createdAt: now,
      updatedAt: now,
      effectiveFrom: null,
      effectiveTo: null,
      ...parts,
    }
  }

  private async resolveVersions(env: Awaited<ReturnType<ScadaAnalysisApiService['environment']>>, versions: readonly ScadaPreset[], limits: ScadaApiLimits, pin: number | null): Promise<AnalysisPlan> {
    const r = resolvePreset({ caller: env.caller, presetVersions: versions, at: new Date(env.nowMs).toISOString(), limits: limits.preset, sources: await this.presetSources(env), virtualColumnDefinitions: await this.definitions(env) })
    if (!r.ok) throw new ScadaApiError(PRESET_ERROR_TO_API[r.code])
    if (pin !== null && r.plan.presetVersion !== pin) throw new ScadaApiError('SCADA_PRESET_NOT_ACTIVE')
    return r.plan
  }

  private async storedPreset(env: Awaited<ReturnType<ScadaAnalysisApiService['environment']>>, presetId: string): Promise<ScadaPreset[]> {
    const versions = this.groupVersions(await this.loadPresetVersions(env)).get(presetId)
    if (!versions) throw new ScadaApiError('SCADA_NOT_FOUND')
    return versions
  }

  // ---------------------------------------------------------------- plans

  private resolveAnalysisPlan(env: Awaited<ReturnType<ScadaAnalysisApiService['environment']>>, clean: CleanAnalysisRequest, limits: ScadaApiLimits): Promise<AnalysisPlan> {
    return this.planFor(env, limits, clean.kind === 'PRESET' ? { presetId: clean.presetId, pin: clean.presetVersion } : null, clean.kind === 'EXPLICIT' ? clean : null)
  }

  private resolveComparisonPlan(env: Awaited<ReturnType<ScadaAnalysisApiService['environment']>>, clean: CleanCompareRequest, limits: ScadaApiLimits): Promise<AnalysisPlan> {
    return this.planFor(env, limits, clean.kind === 'PRESET' ? { presetId: clean.presetId, pin: clean.presetVersion } : null, null, clean.kind === 'EXPLICIT' ? clean : null)
  }

  private async planFor(
    env: Awaited<ReturnType<ScadaAnalysisApiService['environment']>>,
    limits: ScadaApiLimits,
    presetRef: { presetId: string; pin: number | null } | null,
    analysis: Extract<CleanAnalysisRequest, { kind: 'EXPLICIT' }> | null,
    comparison: Extract<CleanCompareRequest, { kind: 'EXPLICIT' }> | null = null,
  ): Promise<AnalysisPlan> {
    if (presetRef) return this.resolveVersions(env, await this.storedPreset(env, presetRef.presetId), limits, presetRef.pin)
    let synthetic: ScadaPreset
    if (analysis) {
      synthetic = this.syntheticPreset(env, {
        sourceCatalogIds: analysis.sourceCatalogIds,
        seriesKeys: analysis.seriesKeys,
        virtualColumns: analysis.virtualColumnIds.map(virtualColumnId => ({ virtualColumnId })),
        statistics: analysis.statistics ?? [...PRESET_STATISTICS],
        comparison: { mode: 'NONE' },
        timeRange: analysis.period,
        bucketInterval: analysis.bucketInterval,
        timezone: analysis.timezone,
      })
    } else if (comparison && comparison.mode === 'PERIOD') {
      synthetic = this.syntheticPreset(env, { sourceCatalogIds: comparison.sourceCatalogIds, seriesKeys: comparison.seriesKeys, virtualColumns: [], statistics: comparison.statistics ?? [...PRESET_STATISTICS], comparison: { mode: 'PERIOD', comparisonRange: comparison.comparison, seriesMapping: comparison.seriesMapping, decimals: comparison.decimals }, timeRange: comparison.baseline, bucketInterval: comparison.bucketInterval, timezone: comparison.timezone })
    } else if (comparison) {
      synthetic = this.syntheticPreset(env, { sourceCatalogIds: [comparison.leftSourceCatalogId, comparison.rightSourceCatalogId], seriesKeys: comparison.seriesKeys, virtualColumns: [], statistics: comparison.statistics ?? [...PRESET_STATISTICS], comparison: { mode: 'SOURCE', leftSourceCatalogId: comparison.leftSourceCatalogId, rightSourceCatalogId: comparison.rightSourceCatalogId, seriesMapping: comparison.seriesMapping, decimals: comparison.decimals }, timeRange: comparison.period, bucketInterval: comparison.bucketInterval, timezone: comparison.timezone })
    } else {
      throw new ScadaApiError('SCADA_INTERNAL_ERROR')
    }
    // the caller's own standing first: a tenant that cannot be mapped / is outside the resolved scope is a scope denial
    if (!canUsePreset(synthetic, env.caller)) throw new ScadaApiError('SCADA_SCOPE_DENIED')
    return this.resolveVersions(env, [synthetic], limits, null)
  }

  // ---------------------------------------------------------------- execution (query → quality → series → virtual columns)

  private async runPipeline(call: ScadaApiCall, env: Awaited<ReturnType<ScadaAnalysisApiService['environment']>>, plan: AnalysisPlan, range: { startAt: string; endAt: string }, mode: 'EXPLICIT' | 'ROOT_AGGREGATION'): Promise<Executed & { plan: AnalysisPlan }> {
    const limits = this.requireLimits()
    const sources = new Map((await this.apiSources(env)).map(s => [s.catalogId, s]))
    const defs = selectPlannedDefinitions(plan, await this.definitions(env))

    // series to read per source: the planned ones plus the inputs a planned virtual column needs
    const wanted = new Map<string, Set<string>>()
    const add = (catalogId: string, key: string) => {
      if (!wanted.has(catalogId)) wanted.set(catalogId, new Set())
      wanted.get(catalogId)!.add(key)
    }
    for (const s of plan.series) add(s.sourceCatalogId, s.seriesKey)
    for (const d of defs) for (const key of d.inputSeriesKeys) add(d.catalogId, key)

    const valueTypes = new Set<string>()
    const infoOf = new Map<string, ScadaApiSource['series'][number]>()
    for (const [catalogId, keys] of wanted) {
      const source = sources.get(catalogId)
      if (!source) throw new ScadaApiError('SCADA_NOT_FOUND')
      for (const key of keys) {
        const info = source.series.find(s => s.seriesKey === key)
        if (!info) throw new ScadaApiError('SCADA_NOT_FOUND')
        infoOf.set(`${catalogId}\u0000${key}`, info)
        valueTypes.add(info.valueType)
        // DAILY needs an explicit rule BEFORE anything is read (so a refusal is never a second audit record): INDEX = SUM by definition,
        // a REAL_VALUE series only with an explicit catalog policy
        if (plan.bucketInterval === 'DAILY' && info.valueType === 'REAL_VALUE' && !info.dailyOperation) throw new ScadaApiError('SCADA_AGGREGATION_POLICY_REQUIRED')
      }
    }
    if (valueTypes.size !== 1) throw new ScadaApiError('SCADA_MIXED_VALUE_TYPES')
    const valueType = [...valueTypes][0] as 'INDEX' | 'REAL_VALUE'

    const queries = [...wanted.keys()].sort(cmp).map(catalogId => {
      const source = sources.get(catalogId)!
      return { catalogId, table: source.table, columns: [...wanted.get(catalogId)!].sort(cmp), valueType, dateColumn: source.dateColumn, timeColumn: source.timeColumn, startAt: new Date(range.startAt), endAt: new Date(range.endAt), interval: plan.bucketInterval }
    })
    let result: ScadaMultiSourceResult
    try {
      result = await this.deps.query!.runMany({ id: call.actor.id }, readScope(env.scope), queries, { mode })
    } catch (error) {
      if (error instanceof ScadaQueryError) {
        const mapped = new ScadaApiError(QUERY_ERROR_TO_API[error.code] ?? 'SCADA_SOURCE_UNAVAILABLE')
        mapped.audited = error.code !== 'AUDIT_FAILED' // the query service wrote the record for this rejection
        throw mapped
      }
      throw new ScadaApiError('SCADA_SOURCE_UNAVAILABLE') // a raw provider error never leaves
    }

    try {
      const byCatalog = new Map<string, ScadaRawRecord[]>()
      for (const r of result.records) {
        if (!byCatalog.has(r.sourceCatalogId)) byCatalog.set(r.sourceCatalogId, [])
        byCatalog.get(r.sourceCatalogId)!.push(r)
      }
      const inputs: ScadaSeriesInput[] = []
      const skipped: ScadaMultiSeriesResult['excluded'] = []
      for (const report of result.sources) {
        const keys = [...(wanted.get(report.catalogId) ?? [])].sort(cmp)
        const source = sources.get(report.catalogId)!
        if (report.status !== 'READ') {
          for (const key of keys) skipped.push({ seriesKey: key, sourceCatalogId: report.catalogId, code: 'SERIES_ANALYSIS_BLOCKED' })
          continue
        }
        const records = byCatalog.get(report.catalogId) ?? []
        const buffer = new Set(records.filter(r => r.isBufferRow).map(r => r.recordId))
        const evaluated = this.quality.evaluate({ catalogId: report.catalogId, sourceTimeZone: source.sourceTimeZone, rows: records })
        for (const key of keys) {
          const info = infoOf.get(`${report.catalogId}\u0000${key}`)!
          const rows = evaluated.rows.filter(r => r.seriesKey === key)
          // 027.67 resolved the hourly value (delta / roll-over / DST); 027.66 does the hourly and daily aggregation
          const rawById = new Map(records.map(r => [r.recordId, r]))
          const aggregationRows: ScadaAggregationInputRow[] = rows.map(r => ({
            recordId: r.recordId,
            seriesKey: key,
            sourceCatalogId: report.catalogId,
            occurredAtUtc: r.occurredAtUtc,
            nextOccurredAtUtc: r.nextOccurredAtUtc,
            localWallTime: r.localWallTime,
            value: r.deltaValue,
            dataQuality: r.dataQuality,
            qualityFlags: r.qualityFlags,
            isComplete: r.isComplete,
            dstResolution: r.dstResolution,
            dstCandidatesUtc: rawById.get(r.recordId)?.dstCandidatesUtc ?? [],
            dstUncertainRangeUtc: rawById.get(r.recordId)?.dstUncertainRangeUtc ?? null,
            isBufferRow: buffer.has(r.recordId),
          }))
          const zone = source.sourceTimeZone as string
          const dailyOperation = info.valueType === 'INDEX' ? 'SUM' : info.dailyOperation
          const aggregated = aggregateDstAwareSeries(aggregationRows, { seriesKey: key, valueType: 'MEASUREMENT', hourlyOperation: 'RAW', ...(dailyOperation ? { dailyOperation } : {}) }, zone)
          const buckets = bucketsFromDstAware(plan.bucketInterval === 'DAILY' ? aggregated.daily : aggregated.hourly)
          inputs.push({ seriesKey: key, label: info.label, unit: info.unit, valueType: info.valueType, sourceCatalogId: report.catalogId, customerRootTenantId: source.customerRootTenantId, tenant: source.tenant, mappingResolved: source.mappingResolved, analysisAllowed: analysisAllowedForSeries(evaluated, rows), buckets })
        }
      }
      const base = planToSeriesRequestBase(plan)
      const multi = this.series.build({ scope: base.scope, range, interval: base.interval, series: inputs })
      multi.excluded.push(...skipped)

      const planned = new Set(plan.series.map(s => `${s.sourceCatalogId}\u0000${s.seriesKey}`))
      const outputs: Output[] = multi.series.filter(s => planned.has(`${s.sourceCatalogId}\u0000${s.seriesKey}`))
      const virtualFailures: VirtualColumnFailure[] = []
      for (const catalogId of [...new Set(defs.map(d => d.catalogId))].sort(cmp)) {
        const source = sources.get(catalogId)!
        const vc = await this.virtual.evaluate({ scope: base.scope, catalogId, tenant: source.tenant, mappingResolved: source.mappingResolved, limits: limits.virtualColumn, definitions: defs.filter(d => d.catalogId === catalogId), inputSeries: multi.series.filter(s => s.sourceCatalogId === catalogId) })
        outputs.push(...vc.series)
        virtualFailures.push(...vc.failures)
      }
      return { multi, outputs, virtualFailures, sourceReports: result.sources, complete: result.complete, plan }
    } catch (error) {
      if (error instanceof ScadaApiError) throw error
      throw new ScadaApiError('SCADA_ANALYSIS_BLOCKED')
    }
  }

  private projectAnalysis(call: ScadaApiCall, plan: AnalysisPlan, executed: Executed): ProjectedAnalysis {
    const excluded = executed.multi.excluded.map(e => ({ seriesKey: e.seriesKey, sourceCatalogId: e.sourceCatalogId, code: e.code as string }))
    let outputs = executed.outputs
    if (plan.filters.onlyAnalysisAllowed) {
      for (const o of outputs.filter(x => !x.analysisAllowed)) excluded.push({ seriesKey: o.seriesKey, sourceCatalogId: o.sourceCatalogId, code: 'SERIES_ANALYSIS_BLOCKED' })
      outputs = outputs.filter(o => o.analysisAllowed)
    }
    outputs = [...outputs].sort((a, b) => cmp(a.seriesKey, b.seriesKey) || cmp(a.sourceCatalogId, b.sourceCatalogId))
    const degraded = executed.multi.status !== 'OK' || executed.virtualFailures.length > 0 || !executed.complete || excluded.length > 0 || outputs.some(o => o.status !== 'OK')
    // an answer with NO usable series (empty source, everything blocked) must never look like a success
    const blocked = !outputs.some(o => o.status === 'OK')
    return {
      artifactCode: call.routeCode as string,
      status: blocked ? 'BLOCKED' : degraded ? 'PARTIAL' : 'OK',
      code: executed.multi.code ?? (blocked ? 'NO_VALID_DATA' : null),
      interval: plan.bucketInterval,
      timezone: plan.timezone,
      range: { ...plan.timeRange },
      preset: plan.presetId === 'adhoc' ? null : { presetId: plan.presetId, presetVersion: plan.presetVersion },
      series: outputs.map(o => projectSeries(o, plan.statistics, plan.filters)),
      excluded,
      sources: projectSources(executed.sourceReports),
      virtualColumnFailures: executed.virtualFailures.map(f => ({ virtualColumnId: f.virtualColumnId, code: f.code })),
      pointFilter: { qualityStates: [...plan.filters.qualityStates], onlyAnalysisAllowed: plan.filters.onlyAnalysisAllowed },
    }
  }

  private async compare(call: ScadaApiCall, env: Awaited<ReturnType<ScadaAnalysisApiService['environment']>>, plan: AnalysisPlan): Promise<ProjectedComparison> {
    const c = plan.comparison
    if (c.mode === 'NONE') throw new ScadaApiError('SCADA_REQUEST_INVALID')
    const root = plan.tenantScope.customerRootTenantId
    const sources = new Map((await this.apiSources(env)).map(s => [s.catalogId, s]))
    const labels = Object.fromEntries(plan.sourceCatalogIds.map(id => [id, sources.get(id)?.displayName ?? '']))
    const header = { bucketInterval: plan.bucketInterval, timezone: plan.timezone, customerRootTenantId: root }
    let result: ScadaComparisonResult
    let reports: Executed['sourceReports']
    if (c.mode === 'PERIOD') {
      const baseline = await this.runPipeline(call, env, plan, plan.timeRange, 'EXPLICIT')
      const other = await this.runPipeline(call, env, plan, c.comparisonRange, 'EXPLICIT')
      reports = [...baseline.sourceReports, ...other.sourceReports]
      result = this.comparison.comparePeriods({
        customerRootTenantId: root,
        baselinePeriod: { ...header, ...plan.timeRange, series: baseline.outputs },
        comparisonPeriod: { ...header, ...c.comparisonRange, series: other.outputs },
        seriesMapping: c.seriesMapping && c.seriesMapping.length > 0 ? c.seriesMapping : undefined,
        sourceLabels: labels,
        options: { decimals: c.decimals ?? null },
      })
    } else {
      const both = await this.runPipeline(call, env, plan, plan.timeRange, 'EXPLICIT')
      reports = both.sourceReports
      const side = (id: string) => ({ sourceCatalogId: id, label: labels[id] ?? '', series: both.outputs.filter(o => o.sourceCatalogId === id) })
      result = this.comparison.compareSources({
        customerRootTenantId: root,
        period: { ...plan.timeRange, bucketInterval: plan.bucketInterval, timezone: plan.timezone },
        leftSource: side(c.leftSourceCatalogId),
        rightSource: side(c.rightSourceCatalogId),
        sourceMapping: { leftSourceCatalogId: c.leftSourceCatalogId, rightSourceCatalogId: c.rightSourceCatalogId },
        seriesMapping: c.seriesMapping && c.seriesMapping.length > 0 ? c.seriesMapping : undefined,
        options: { decimals: c.decimals ?? null },
      })
    }
    return projectComparison(toComparisonChart(result), {
      artifactCode: call.routeCode as string,
      timezone: plan.timezone,
      preset: plan.presetId === 'adhoc' ? null : { presetId: plan.presetId, presetVersion: plan.presetVersion },
      sources: projectSources(reports),
    })
  }

  // ---------------------------------------------------------------- audit (the same port and the same three action codes)

  private entry(ctx: Ctx, actionCode: ScadaQueryAuditEntry['actionCode'], reasonCode: string, rowCount: number | null): ScadaQueryAuditEntry {
    return {
      actionCode,
      entityType: 'ScadaAnalysisQuery',
      entityId: ctx.entityId,
      actorId: ctx.actorId,
      tenantId: ctx.tenantId === '' ? null : ctx.tenantId,
      customerRootTenantId: ctx.root,
      reasonCode,
      rowCount,
      columnCount: null,
      durationMs: Math.max(0, this.deps.clock.nowMs() - ctx.started),
      limitReason: reasonCode === 'SCADA_LIMIT_EXCEEDED' ? 'REQUEST_LIMIT' : null,
      correlationId: ctx.correlationId,
    }
  }

  private async auditSuccess(ctx: Ctx, rowCount: number): Promise<void> {
    try {
      await this.deps.audit.record(this.entry(ctx, 'SCADA_QUERY_SUCCEEDED', 'OK', rowCount))
    } catch {
      throw new ScadaApiError('SCADA_AUDIT_FAILED') // fail-closed: no data without a durable record
    }
  }

  /** Normalises any failure to a static `ScadaApiError` and records it once (unless the query service already did). */
  private async reject(ctx: Ctx, error: unknown): Promise<ScadaApiError> {
    const api = error instanceof ScadaApiError ? error : new ScadaApiError('SCADA_INTERNAL_ERROR')
    if (!api.audited) {
      try {
        await this.deps.audit.record(this.entry(ctx, api.status >= 500 ? 'SCADA_QUERY_FAILED' : 'SCADA_QUERY_DENIED', api.code, null))
      } catch {
        // a rejection stays a rejection even when its record cannot be written
      }
      api.audited = true
    }
    return api
  }
}

/** A source the catalog view may show and whether it can be analysed. 'OMIT' = never listed (the excluded organisation). */
function catalogGate(source: ScadaApiSource, scope: ScadaApiScope): { selectable: boolean; blockedReason: CatalogBlockedReason | null } | 'OMIT' {
  if (isExcludedOrganisationTenant(source.tenant)) return 'OMIT'
  let tenantOk = false
  try {
    assertMappableTenant(source.tenant)
    tenantOk = source.tenant !== null && scope.dataScopeTenantIds.includes(source.tenant.id)
  } catch {
    tenantOk = false
  }
  const blockedReason: CatalogBlockedReason | null = !source.active
    ? 'SOURCE_INACTIVE'
    : !source.mappingResolved
      ? 'MAPPING_UNRESOLVED'
      : !tenantOk
        ? 'TENANT_NOT_MAPPABLE'
        : !source.sourceTimeZone
          ? 'TIMEZONE_UNVERIFIED'
          : source.series.length === 0
            ? 'NO_SERIES' // no VERIFIED series (value type / unit declared by the manifest)
            : null
  return { selectable: blockedReason === null, blockedReason }
}

function readScope(scope: ScadaApiScope): ScadaReadScope {
  return { tenantId: scope.tenantId, customerRootTenantId: scope.customerRootTenantId, dataScopeTenantIds: [...scope.dataScopeTenantIds] }
}

function firstCatalogId(ids: readonly string[]): string | null {
  return ids.length > 0 && isCatalogId(ids[0]) ? ids[0]! : null
}
