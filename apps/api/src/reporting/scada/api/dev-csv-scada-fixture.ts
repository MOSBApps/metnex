import type { CatalogSourceView, QueryAccess } from '../catalog/catalog.service'
import type { ScadaActor, ScadaOrchestratedReadPort, ScadaQueryAuditPort, ScadaReadOutcome, ScadaReadRequest, ScadaReadScope } from '../adapter/scada-readonly.port'
import type { CatalogScope, LimitProfile } from '../catalog/catalog.types'
import { assertMappableTenant, type TenantRecord } from '../catalog/tenant-guards'
import { ScadaCsvFixtureProvider } from '../fixture/scada-csv-fixture.provider'
import { SCADA_FIXTURE_ZONE_ENV, buildScadaFixtureArtifact, fixtureCatalogId, fixtureSourceZone } from '../fixture/scada-fixture-artifact'
import { isForbiddenKey } from '../presets/scada-preset-security'
import { buildSourceWindow, localToUtc } from '../time/scada-source-time'
import type { ScadaFixtureSourceManifest } from '../fixture/scada-fixture.types'
import { ScadaAnalysisQueryService } from '../query/scada-analysis-query.service'
import type { ScadaApiClock, ScadaApiLimits, ScadaApiLimitsProvider, ScadaApiSource, ScadaApiSourceMeta, ScadaApiSourceSeries, ScadaCatalogArtifact, ScadaSourceCatalogPort } from './scada-api.contract'

/**
 * TASK-027.72-R1 — the DEVELOPMENT CSV fixture, wired to the API as catalog + read adapter of the REAL 027.65 query service.
 *
 * It exists in the DI container ONLY when `isDevFixtureEnabled()` (NODE_ENV=development AND REPORTING_DEV_FIXTURES=true);
 * `scada-api.providers.ts` is the single place that constructs it. The CSV provider (TASK-027.63-R1) itself refuses to read a
 * byte when the flag is off, reads only the manifest-listed files under `veriler/raw/`, verifies their SHA-256 and rejects the
 * excluded organisation as a tenant. Nothing here imports a database, an ORM or a SQL driver.
 *
 * Gates that stay ON: the caller's tenant record (from the database) must be mappable (ACTIVE, not PLATFORM_ROOT, not the
 * excluded organisation) and inside the resolved scope; the table / columns must be the manifest's; the source time zone must be
 * a valid IANA zone. The manifest declares every fixture zone `UNVERIFIED`, so the zone is taken from the development-only
 * variable below — if it is absent or not an IANA zone the source is UNVERIFIED and the API refuses to analyse it. All numbers
 * in this file are development parameters, never proposed production limits.
 */
export const DEV_FIXTURE_ZONE_ENV = SCADA_FIXTURE_ZONE_ENV
export { fixtureCatalogId }
const HOUR_MS = 3_600_000

/** Development-only limit profile of the fixture "source" (the production one comes from the catalog). */
export const DEV_FIXTURE_LIMIT_PROFILE: LimitProfile = { timeoutMs: 5_000, maxRows: 500_000, maxColumns: 64, maxPayloadBytes: 100_000_000, maxRangeMs: 60 * 24 * HOUR_MS, poolSize: 1, maxConcurrent: 1 }
/** Q-W521 is open in production; the fixture reads one hour ahead so the last hourly delta has its next reading. */
export const DEV_FIXTURE_FORWARD_BUFFER_MS = HOUR_MS

/** Development-only API limits (production values come from the environment only). */
export const DEV_FIXTURE_API_LIMITS: ScadaApiLimits = {
  preset: { maxNameLength: 80, maxDescriptionLength: 200, maxSourceCount: 4, maxSeriesCount: 24, maxVirtualColumnCount: 4, maxPageSize: 100 },
  virtualColumn: { maxExpressionLength: 200, maxAstDepth: 12, maxOperatorCount: 20, maxRoundDecimals: 6, maxAbsoluteResult: 1e15 },
  maxPeriodMs: 60 * 24 * HOUR_MS,
  maxSeriesMappings: 24,
}

export class DevCsvFixtureLimits implements ScadaApiLimitsProvider {
  get(): ScadaApiLimits {
    return DEV_FIXTURE_API_LIMITS
  }
}

export interface DevCsvFixtureDeps {
  provider: ScadaCsvFixtureProvider
  /** The caller's tenant record from the database (never invented here). */
  tenants: { get(tenantId: string): Promise<TenantRecord | null> }
  env: NodeJS.ProcessEnv
}

const sourceZone = fixtureSourceZone

interface FixtureSource {
  manifest: ScadaFixtureSourceManifest
  catalogId: string
  /** Only the LISTABLE columns: at least one numeric reading, no credential-like / physical-looking name, no duplicate. */
  /** Columns the MANIFEST declares verified (value type from the manifest; unit only if the manifest wrote one). */
  seriesKeys: string[]
  declared: Map<string, { label: string; valueType: 'INDEX' | 'REAL_VALUE'; unit: string; dailyOperation?: 'SUM' | 'AVERAGE' | 'MIN' | 'MAX' }>
  /** Columns with numeric readings that the manifest does not verify: informational, never selectable, never queryable. */
  unverified: string[]
  qualityOf: Map<string, 'OK' | 'PARTIAL'>
  readingCount: number
  firstLocal: string | null
  lastLocal: string | null
}

/** Row count and first / last reading as UTC instants (null while the zone is unverified: a naive wall time is never stamped UTC). */
function metaOf(s: FixtureSource, zone: string | null): ScadaApiSourceMeta {
  const toUtc = (naive: string | null): string | null => {
    if (!naive || !zone) return null
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(naive)
    if (!m) return null
    const r = localToUtc({ year: +m[1]!, month: +m[2]!, day: +m[3]!, hour: +m[4]!, minute: +m[5]!, second: +m[6]! }, zone)
    return r.dst === 'NORMAL' ? r.instant.toISOString() : null
  }
  return { rowCount: s.readingCount, minAt: toUtc(s.firstLocal), maxAt: toUtc(s.lastLocal) }
}

export class DevCsvScadaFixture {
  private sources: FixtureSource[] | null = null

  constructor(private readonly deps: DevCsvFixtureDeps) {}

  private load(tenantId: string): FixtureSource[] {
    if (this.sources) return this.sources
    const manifest = this.deps.provider.loadManifest(this.deps.env)
    this.sources = manifest.sources.map(m => {
      const records = this.deps.provider.loadSourceRecords(m.sourceKey, tenantId, this.deps.env)
      const numeric = new Map<string, { numeric: number; total: number }>()
      let first: string | null = null
      let last: string | null = null
      const stamps = new Set<string>()
      for (const r of records) {
        const c = numeric.get(r.seriesKey) ?? { numeric: 0, total: 0 }
        c.total += 1
        if (r.dataQuality === 'VALID' && r.rawValue !== null) c.numeric += 1
        numeric.set(r.seriesKey, c)
        stamps.add(r.occurredAt)
        if (first === null || r.occurredAt < first) first = r.occurredAt
        if (last === null || r.occurredAt > last) last = r.occurredAt
      }
      const qualityOf = new Map<string, 'OK' | 'PARTIAL'>()
      const listable = [...numeric.keys()]
        .filter(k => numeric.get(k)!.numeric > 0 && !isForbiddenKey(k)) // never listed: an all-empty column, a credential-like or physical-looking name
        .sort()
      const declared = new Map<string, { label: string; valueType: 'INDEX' | 'REAL_VALUE'; unit: string; dailyOperation?: 'SUM' | 'AVERAGE' | 'MIN' | 'MAX' }>()
      // A column is verified ONLY by an explicit manifest declaration that (a) names a real measurement column of the file — never the
      // id / date / time column, (b) is declared exactly once (the same physical column can never be two semantic series),
      // (c) is verified:true with a value type INDEX | REAL_VALUE and (d) carries evidence references.
      const structural = new Set([m.idColumn, m.dateColumn, m.timeColumn])
      const counts = new Map<string, number>()
      for (const c of m.columns ?? []) counts.set(c.sourceColumn, (counts.get(c.sourceColumn) ?? 0) + 1)
      for (const c of m.columns ?? []) {
        const evidenced = Array.isArray(c.evidenceRefs) && c.evidenceRefs.some(r => typeof r === 'string' && r.trim() !== '')
        if (c.verified === true && evidenced && (c.valueType === 'INDEX' || c.valueType === 'REAL_VALUE') && !structural.has(c.sourceColumn) && counts.get(c.sourceColumn) === 1 && listable.includes(c.sourceColumn)) {
          declared.set(c.sourceColumn, { label: typeof c.label === 'string' && c.label.trim() !== '' ? c.label.trim() : c.sourceColumn, valueType: c.valueType, unit: typeof c.unit === 'string' ? c.unit.trim() : '', ...(c.dailyOperation ? { dailyOperation: c.dailyOperation } : {}) })
        }
      }
      const keys = listable.filter(k => declared.has(k))
      const unverified = listable.filter(k => !declared.has(k))
      for (const k of listable) qualityOf.set(k, numeric.get(k)!.numeric === numeric.get(k)!.total ? 'OK' : 'PARTIAL')
      return { manifest: m, catalogId: fixtureCatalogId(m.sourceKey), seriesKeys: keys, declared, unverified, qualityOf, readingCount: stamps.size, firstLocal: first, lastLocal: last }
    })
    return this.sources
  }

  private async mappable(tenantId: string): Promise<TenantRecord | null> {
    const tenant = await this.deps.tenants.get(tenantId)
    try {
      assertMappableTenant(tenant)
      return tenant
    } catch {
      return null
    }
  }

  /** The catalog view the API resolves presets / requests against. */
  readonly catalog: ScadaSourceCatalogPort = {
    listSources: async (scope: ScadaReadScope): Promise<readonly ScadaApiSource[]> => {
      const tenant = await this.deps.tenants.get(scope.tenantId)
      const zone = sourceZone(this.deps.env)
      return this.load(scope.tenantId).map(s => ({
        catalogId: s.catalogId,
        customerRootTenantId: scope.customerRootTenantId,
        displayName: s.manifest.logicalSourceName,
        active: true,
        mappingResolved: tenant !== null, // a development fixture is mapped to the CALLER's own tenant; the tenant guards still judge that record
        tenant,
        sourceTimeZone: zone,
        table: s.manifest.table,
        dateColumn: s.manifest.dateColumn,
        timeColumn: s.manifest.timeColumn,
        // the column NAME is only the visible label; value type / unit / daily rule come from the manifest declaration alone
        series: s.seriesKeys.map(k => {
          const d = s.declared.get(k)!
          return { seriesKey: k, label: d.label, unit: d.unit, valueType: d.valueType, qualityStatus: s.qualityOf.get(k) ?? ('PARTIAL' as const), ...(d.dailyOperation ? { dailyOperation: d.dailyOperation } : {}) } satisfies ScadaApiSourceSeries
        }),
        unverifiedSeries: s.unverified.map(k => ({ seriesKey: k, label: k })),
        meta: metaOf(s, zone),
        timezoneStatus: zone ? ('DEVELOPMENT_OVERRIDE' as const) : ('UNVERIFIED' as const),
        schemaStatus: 'UNVERIFIED' as const, // a development snapshot has no preflight-verified schema
      }))
    },
    describeArtifact: (code: string): ScadaCatalogArtifact | null => {
      const artifact = buildScadaFixtureArtifact(this.deps.env, this.deps.provider)
      return artifact && artifact.code === code ? artifact : null
    },
  }

  /** What the 027.65 query service asks of its catalog (`evaluateQueryAccess`): same static reasons as the real catalog. */
  readonly access = {
    evaluateQueryAccess: async (scope: CatalogScope, id: string, request: { table: string; columns: string[] }): Promise<QueryAccess> => {
      if (!(await this.mappable(scope.tenantId)) || !scope.dataScopeTenantIds.includes(scope.tenantId)) return { ok: false, reasons: ['TENANT_NOT_ACCESSIBLE'] }
      const source = this.load(scope.tenantId).find(s => s.catalogId === id)
      if (!source) return { ok: false, reasons: ['NOT_FOUND'] }
      const zone = sourceZone(this.deps.env)
      if (!zone) return { ok: false, reasons: ['TIMEZONE_UNDEFINED'] }
      const m = source.manifest
      if (request.table !== m.table) return { ok: false, reasons: ['TABLE_UNKNOWN'] }
      const known = new Set([m.dateColumn, m.timeColumn, ...source.seriesKeys])
      if (request.columns.some(c => !known.has(c))) return { ok: false, reasons: ['COLUMN_UNKNOWN'] }
      const columnKinds: Record<string, 'NUMERIC' | 'DATE' | 'TIME'> = { [m.dateColumn]: 'DATE', [m.timeColumn]: 'TIME' }
      for (const k of source.seriesKeys) columnKinds[k] = 'NUMERIC'
      return { ok: true, profile: { catalogId: id, version: 1, sourceTimeZone: zone, limitProfile: DEV_FIXTURE_LIMIT_PROFILE, table: m.table, dateColumn: m.dateColumn, timeColumn: m.timeColumn, columnKinds } }
    },
  }

  /** Serves the CSV rows the way a source would: naive local date / time strings, whole local days (the service trims to instants). */
  readonly adapter: ScadaOrchestratedReadPort = {
    listSources: async (): Promise<CatalogSourceView[]> => [],
    readUnaudited: async (_actor: ScadaActor, scope: ScadaReadScope, request: ScadaReadRequest): Promise<ScadaReadOutcome> => {
      const started = Date.now()
      const failed = (code: string): ScadaReadOutcome => ({ ok: false, code, outcome: 'FAILED', limitReason: null, durationMs: Date.now() - started })
      const zone = sourceZone(this.deps.env)
      const source = this.load(scope.tenantId).find(s => s.catalogId === request.catalogId)
      if (!zone || !source) return failed('SCADA_ADAPTER_FAILED')
      try {
        const window = buildSourceWindow(request.timeRange.from, request.timeRange.to, zone, 'DATE')
        const wanted = new Set(request.columns)
        const rows = new Map<string, Record<string, unknown>>()
        for (const r of this.deps.provider.loadSourceRecords(source.manifest.sourceKey, scope.tenantId, this.deps.env)) {
          const date = r.occurredAt.slice(0, 10)
          if (date < window.from || date >= window.to || !wanted.has(r.seriesKey)) continue
          const time = r.occurredAt.slice(11, 19)
          const key = r.occurredAt
          const row = rows.get(key) ?? { [source.manifest.dateColumn]: date, [source.manifest.timeColumn]: time }
          row[r.seriesKey] = r.dataQuality === 'MISSING' ? null : r.dataQuality === 'INVALID' || r.rawValue === null ? 'invalid' : r.rawValue
          rows.set(key, row)
        }
        const served = [...rows.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v)
        return { ok: true, rows: served, rowCount: served.length, columnCount: request.columns.length, durationMs: Date.now() - started }
      } catch {
        return failed('SCADA_ADAPTER_FAILED') // a raw provider text never leaves
      }
    },
  }

  /** The REAL 027.65 query service over this catalog + adapter (it audits every read through `audit`). */
  queryService(audit: ScadaQueryAuditPort, clock: ScadaApiClock): ScadaAnalysisQueryService {
    return new ScadaAnalysisQueryService({
      catalog: this.access,
      adapter: this.adapter,
      audit,
      correlationId: () => clock.correlationId(),
      nowMs: () => clock.nowMs(),
      windowConfig: () => ({ forwardBufferMs: DEV_FIXTURE_FORWARD_BUFFER_MS }),
    })
  }
}

export function createDevCsvFixture(deps: DevCsvFixtureDeps): DevCsvScadaFixture {
  return new DevCsvScadaFixture(deps)
}
