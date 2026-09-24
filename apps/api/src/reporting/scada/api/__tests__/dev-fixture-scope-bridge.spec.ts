import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { buildMockDb, chain } from '../../../../db/test-helpers/drizzle-mock'
import { TenantScopeService } from '../../../../tenant-scope/tenant-scope.service'
import type { ScadaQueryAuditEntry } from '../../adapter/scada-readonly.port'
import type { TenantRecord } from '../../catalog/tenant-guards'
import { ScadaCsvFixtureProvider } from '../../fixture/scada-csv-fixture.provider'
import { ScadaAnalysisController } from '../scada-analysis.controller'
import { DEV_FIXTURE_API_LIMITS, DEV_FIXTURE_ZONE_ENV, createDevCsvFixture, fixtureCatalogId } from '../dev-csv-scada-fixture'
import { DevFixtureScopeResolver, SCADA_FIXTURE_SCOPE_BRIDGE_ENV, isDevFixtureScopeBridgeEnabled } from '../dev-fixture-scope-resolver'
import { SCADA_DEV_SCOPE_RESOLVER, ScadaApiError } from '../scada-api.contract'
import { scadaApiProviders } from '../scada-api.providers'
import { ScadaAnalysisApiService } from '../scada-analysis-api.service'
import { JwtAuthGuard } from '../../../../platform/jwt-auth.guard'
import { MfaEnforcementGuard } from '../../../../platform/guards/mfa-enforcement.guard'
import { TenantHeaderFormatGuard } from '../../../../platform/guards/tenant-header-format.guard'
import { PermissionGuard } from '../../../../platform/permission.guard'
import { TenantMembershipGuard } from '../../../../platform/tenant-membership.guard'

/**
 * TASK-027.73-R4 — the development scope bridge. Rows/tenants are synthetic; the fixture CSV is a temp file; nothing touches a
 * database, registry or schema (the db is a recording mock).
 */
const ALL_ON = { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true', [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: 'true', [DEV_FIXTURE_ZONE_ENV]: 'Europe/Istanbul' } as NodeJS.ProcessEnv
const T = 'tenant-1'
const ROOT = 'root-1'
const ZONE = 'Europe/Istanbul'
type Row = { id: string; type: string; status: string; customerRootId: string | null; canEnterData: boolean; canAggregateChildren: boolean }
const tenantRow = (over: Partial<Row> = {}): Row => ({ id: T, type: 'STANDARD', status: 'ACTIVE', customerRootId: ROOT, canEnterData: true, canAggregateChildren: false, ...over })
const rootRow = (over: Partial<Row> = {}) => ({ id: ROOT, type: 'ROOT', status: 'ACTIVE', ...over })

function mockDb(rows: Array<unknown[]>) {
  const db = buildMockDb()
  for (const r of rows) db.select.mockReturnValueOnce(chain(r))
  return db
}
const noWrites = (db: ReturnType<typeof buildMockDb>) => {
  for (const m of ['insert', 'update', 'delete', 'execute', 'transaction'] as const) if ((db as unknown as Record<string, unknown>)[m]) expect((db as unknown as Record<string, jest.Mock>)[m]).not.toHaveBeenCalled()
}

describe('bridge activation gate: all four conditions or nothing', () => {
  const tokens = (env: NodeJS.ProcessEnv) => scadaApiProviders(env).map(p => (p as { provide: unknown }).provide)

  it('all four conditions ⇒ enabled and registered', () => {
    expect(isDevFixtureScopeBridgeEnabled(ALL_ON)).toBe(true)
    expect(tokens(ALL_ON)).toContain(SCADA_DEV_SCOPE_RESOLVER)
  })

  it.each([
    ['production', { NODE_ENV: 'production' }],
    ['NODE_ENV=test', { NODE_ENV: 'test' }],
    ['no NODE_ENV', { NODE_ENV: undefined }],
    ['fixture flag false', { REPORTING_DEV_FIXTURES: 'false' }],
    ['fixture flag missing', { REPORTING_DEV_FIXTURES: undefined }],
    ['bridge flag false', { [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: 'false' }],
    ['bridge flag missing', { [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: undefined }],
    ['bridge flag "TRUE" (not exactly true)', { [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: 'TRUE' }],
    ['time zone missing', { [DEV_FIXTURE_ZONE_ENV]: undefined }],
    ['time zone invalid', { [DEV_FIXTURE_ZONE_ENV]: 'Not/AZone' }],
    ['time zone an offset', { [DEV_FIXTURE_ZONE_ENV]: '+03:00' }],
  ])('%s ⇒ the bridge is NOT enabled and NOT registered (TenantScopeService stays the scope source)', (_n, over) => {
    const env = { ...ALL_ON, ...over } as NodeJS.ProcessEnv
    expect(isDevFixtureScopeBridgeEnabled(env)).toBe(false)
    expect(tokens(env)).not.toContain(SCADA_DEV_SCOPE_RESOLVER)
  })

  it('the API service takes its scope from the bridge ONLY when it is enabled; otherwise from TenantScopeService', () => {
    const scopeToken = (env: NodeJS.ProcessEnv) => (scadaApiProviders(env).find(p => (p as { inject?: unknown[] }).inject?.includes('SCADA_API_AUDIT') && (p as { provide: unknown }).provide === ScadaAnalysisApiService) as { inject: unknown[] }).inject[0]
    expect(scopeToken(ALL_ON)).toBe(SCADA_DEV_SCOPE_RESOLVER)
    expect(scopeToken({ ...ALL_ON, [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: 'false' } as NodeJS.ProcessEnv)).toBe(TenantScopeService)
    expect(scopeToken({ ...ALL_ON, NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(TenantScopeService)
  })
})

describe('DevFixtureScopeResolver (reads tenants only)', () => {
  it('an active STANDARD tenant gets a scope of ITS OWN: ids from the records, a non-schema marker, no write of any kind', async () => {
    const db = mockDb([[tenantRow()], [rootRow()]])
    const scope = await new DevFixtureScopeResolver(db as never).resolve(T)
    expect(scope).toMatchObject({ tenantId: T, customerRootTenantId: ROOT, dataScopeTenantIds: [T], devScopeBridge: true, canEnterData: true, canAggregateChildren: false })
    expect(scope.schemaName).toBe('@dev-scope-bridge')
    expect(scope.schemaName).not.toMatch(/^[a-z][a-z0-9_]*$/i) // does not look like a physical schema name
    expect(db.select).toHaveBeenCalledTimes(2)
    noWrites(db)
  })

  it('an active ROOT tenant with canAggregateChildren still gets ONLY itself: children are never added automatically', async () => {
    const db = mockDb([[tenantRow({ id: ROOT, type: 'ROOT', canAggregateChildren: true })], [rootRow()]])
    const scope = await new DevFixtureScopeResolver(db as never).resolve(ROOT)
    expect(scope.dataScopeTenantIds).toEqual([ROOT])
    expect(scope.canAggregateChildren).toBe(true) // read from the record, not acted upon
    expect(db.select).toHaveBeenCalledTimes(2) // no closure query
  })

  it.each([
    ['an unknown tenant', [[]], NotFoundException],
    ['an inactive tenant', [[tenantRow({ status: 'SUSPENDED' })]], ForbiddenException],
    ['an archived tenant', [[tenantRow({ status: 'ARCHIVED' })]], ForbiddenException],
    ['a PLATFORM_ROOT tenant', [[tenantRow({ type: 'PLATFORM_ROOT' })]], ForbiddenException],
    ['a tenant without a customer root', [[tenantRow({ customerRootId: null })]], ForbiddenException],
    ['a tenant whose customer root does not exist', [[tenantRow()], []], ForbiddenException],
    ['a tenant whose customer root is inactive', [[tenantRow()], [rootRow({ status: 'SUSPENDED' })]], ForbiddenException],
    ['a tenant whose "root" is the platform root', [[tenantRow()], [rootRow({ type: 'PLATFORM_ROOT' })]], ForbiddenException],
  ])('%s is refused', async (_n, rows, error) => {
    const db = mockDb(rows as Array<unknown[]>)
    await expect(new DevFixtureScopeResolver(db as never).resolve(T)).rejects.toBeInstanceOf(error)
    noWrites(db)
  })

  it('an empty / non-string tenant id is refused without a query', async () => {
    const db = mockDb([])
    for (const bad of ['', undefined, null, 5] as never[]) await expect(new DevFixtureScopeResolver(db as never).resolve(bad)).rejects.toBeInstanceOf(NotFoundException)
    expect(db.select).not.toHaveBeenCalled()
  })

  it('it can never widen: the scope of tenant A never lists another tenant or another root', async () => {
    const db = mockDb([[tenantRow({ id: 'tenant-A' })], [rootRow()]])
    expect((await new DevFixtureScopeResolver(db as never).resolve('tenant-A')).dataScopeTenantIds).toEqual(['tenant-A'])
  })

  it('the source file only reads: no insert / update / delete / raw SQL / DDL / registry / closure / membership / guard code', () => {
    const src = readFileSync(path.resolve(__dirname, '../dev-fixture-scope-resolver.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.execute\(|\bsql`|CREATE\s+SCHEMA|search_path|registry|closure|membership|tenantMemberships|Guard|permission|Mfa|console\./i)
    expect(src).toMatch(/\.select\(/)
  })
})

describe('registry behaviour', () => {
  it('BRIDGE OFF: the real TenantScopeService stays fail-closed when there is no ACTIVE registry (locked)', async () => {
    const db = mockDb([[tenantRow()]])
    const scopes = new TenantScopeService(db as never, { getDescendantTenantIds: jest.fn() } as never, { getActiveRegistry: jest.fn(async () => null) } as never)
    await expect(scopes.resolve(T)).rejects.toBeInstanceOf(ForbiddenException)
    // provider present, scope refused ⇒ SCADA_SCOPE_DENIED (the fixture is NOT reachable without a scope)
    const withFixture = fixtureFor(csv())
    const svc = new ScadaAnalysisApiService(deps({ scopes: scopes as never, sources: withFixture.catalog, query: withFixture.queryService(audit(), clock()) }))
    db.select.mockReturnValueOnce(chain([tenantRow()]))
    expect(await codeOf(svc.getCatalog(call()))).toBe('SCADA_SCOPE_DENIED')
  })

  it('BRIDGE ON: with no registry anywhere the catalog is served from the fixture; nothing is written', async () => {
    const db = mockDb([[tenantRow()], [rootRow()]])
    const fx = fixtureFor(csv())
    const svc = new ScadaAnalysisApiService(deps({ scopes: new DevFixtureScopeResolver(db as never) as never, sources: fx.catalog, query: fx.queryService(audit(), clock()) }))
    const r = await svc.getCatalog(call())
    expect(r.sources).toHaveLength(1)
    expect(r.sources[0]).toMatchObject({ selectable: true, timezone: ZONE })
    expect(r.sources[0]!.series.filter(s => s.available).map(s => s.seriesKey)).toEqual(['A_COUNTER'])
    expect(r.developmentLabel).toBe('Geliştirme CSV snapshot verisi')
    expect(JSON.stringify(r)).not.toMatch(/@dev-scope-bridge|schemaName|"schema"|database|SELECT\s|\.csv|veriler/i)
    noWrites(db)
  })

  it('BRIDGE ON: query and compare reach the real fixture CSV through the bridge scope', async () => {
    const mk = () => {
      const db = mockDb([[tenantRow()], [rootRow()], [tenantRow()], [rootRow()]])
      const fx = fixtureFor(csv(12))
      return { db, svc: new ScadaAnalysisApiService(deps({ scopes: new DevFixtureScopeResolver(db as never) as never, sources: fx.catalog, query: fx.queryService(audit(), clock()) })) }
    }
    const { svc, db } = mk()
    const q = await svc.runAnalysis(call({ sourceCatalogIds: [CAT], seriesKeys: ['A_COUNTER'], startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T02:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE }))
    expect(q.series[0]!.points.map(p => p.value)).toEqual([5, 5, 5, 5, 5])
    const c = await svc.runComparison(call({ mode: 'PERIOD', sourceCatalogIds: [CAT], seriesKeys: ['A_COUNTER'], bucketInterval: 'HOURLY', timezone: ZONE, baseline: { startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T00:00:00.000Z' }, comparison: { startAt: '2026-02-01T00:00:00.000Z', endAt: '2026-02-01T03:00:00.000Z' } }))
    expect(c).toMatchObject({ status: 'OK', mode: 'PERIOD' })
    expect(c.rows.length).toBeGreaterThan(0)
    expect(JSON.stringify([q, c])).not.toMatch(/@dev-scope-bridge|schemaName|"schema"|database|SELECT\s|\.csv|veriler/i)
    noWrites(db)
  })

  it('a preset list answers safely through the bridge (no store ⇒ 503, never a scope error)', async () => {
    const db = mockDb([[tenantRow()], [rootRow()]])
    const fx = fixtureFor(csv())
    const svc = new ScadaAnalysisApiService(deps({ scopes: new DevFixtureScopeResolver(db as never) as never, sources: fx.catalog, query: fx.queryService(audit(), clock()) }))
    expect(await codeOf(svc.listPresets(call()))).toBe('SCADA_SOURCE_NOT_CONFIGURED')
  })
})

describe('the bridge cannot raise privileges', () => {
  it('a body tenant / root / role field is refused as an unknown field and the scope is resolved ONLY for the guarded header tenant', async () => {
    const resolved: string[] = []
    const scopes = { resolve: async (id: string) => { resolved.push(id); return { tenantId: id, customerRootTenantId: ROOT, dataScopeTenantIds: [id] } } }
    const fx = fixtureFor(csv())
    const svc = new ScadaAnalysisApiService(deps({ scopes, sources: fx.catalog, query: fx.queryService(audit(), clock()) }))
    for (const extra of [{ tenantId: 'someone-else' }, { customerRootTenantId: 'other-root' }, { isSystemAdmin: true }, { dataScopeTenantIds: ['x'] }]) {
      expect(await codeOf(svc.runAnalysis(call({ sourceCatalogIds: [CAT], seriesKeys: ['A_COUNTER'], startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T02:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE, ...extra })))).toBe('SCADA_REQUEST_UNKNOWN_FIELD')
    }
    expect(resolved).toEqual([]) // rejected before any scope work
    await svc.getCatalog(call())
    expect(resolved).toEqual([T])
  })

  it('another root\'s sources are never listed, whatever the fixture / provider returns', async () => {
    const db = mockDb([[tenantRow()], [rootRow()]])
    const fx = fixtureFor(csv())
    const foreign = { listSources: async (scope: { tenantId: string; customerRootTenantId: string }) => (await fx.catalog.listSources({ ...scope, customerRootTenantId: 'another-root' } as never)) }
    const svc = new ScadaAnalysisApiService(deps({ scopes: new DevFixtureScopeResolver(db as never) as never, sources: foreign as never, query: undefined }))
    expect((await svc.getCatalog(call())).sources).toEqual([])
  })

  it('the guard chain of the controller is untouched: JWT → MFA → header → membership → permission (the bridge runs after all of them, inside the service)', () => {
    expect(Reflect.getMetadata('__guards__', ScadaAnalysisController)).toEqual([JwtAuthGuard, MfaEnforcementGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard])
    const providers = readFileSync(path.resolve(__dirname, '../scada-api.providers.ts'), 'utf8')
    expect(providers).not.toMatch(/Guard/)
    const reportingModule = readFileSync(path.resolve(__dirname, '../../../reporting.module.ts'), 'utf8')
    expect(reportingModule).not.toMatch(/DevFixtureScopeResolver|dev-fixture-scope-resolver|SCADA_DEV_SCOPE_RESOLVER/)
    expect(reportingModule).toMatch(/TenantScopeModule/) // the general scope provider is still imported as before
  })
})

// ---------------------------------------------------------------- helpers (temporary CSV, synthetic)
const dirs: string[] = []
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))
const CAT = fixtureCatalogId('s')
const csv = (rows = 8) => ['ID;KAYIT_TARIHI;KAYIT_SAATI;A_COUNTER;B_OTHER', ...Array.from({ length: rows }, (_, i) => `${i + 1};1.02.2026;${String(i).padStart(2, '0')}:00:00;${100 + 5 * i};${i}`)].join('\n')
function fixtureFor(text: string) {
  const root = mkdtempSync(path.join(tmpdir(), 'metnex-bridge-'))
  dirs.push(root)
  mkdirSync(path.join(root, 'veriler/manifest'), { recursive: true })
  mkdirSync(path.join(root, 'veriler/raw'), { recursive: true })
  writeFileSync(path.join(root, 'veriler/raw/s.csv'), text)
  const entry = { catalogId: 'scada-cat-s', sourceKey: 's', logicalSourceName: 'Kaynak s', file: 'veriler/raw/s.csv', table: 'phys_s', idColumn: 'ID', dateColumn: 'KAYIT_TARIHI', timeColumn: 'KAYIT_SAATI', timezone: 'UNVERIFIED', status: 'DEVELOPMENT_FIXTURE', mappingStatus: 'UNVERIFIED', sha256: createHash('sha256').update(text, 'utf8').digest('hex'), rowCount: 0, columnCount: 5, developmentOnly: true, columns: [{ sourceColumn: 'A_COUNTER', label: 'A_COUNTER', verified: true, valueType: 'INDEX', evidenceRefs: ['TEST:evidence'] }, { sourceColumn: 'B_OTHER', label: 'B_OTHER', verified: false, valueType: null, unit: null, evidenceRefs: ['TEST:none'] }] }
  writeFileSync(path.join(root, 'veriler/manifest/scada-fixtures.manifest.json'), JSON.stringify({ version: '1', generatedAt: 'x', description: 't', developmentOnly: true, sources: [entry] }))
  const tenant: TenantRecord = { id: T, type: 'STANDARD', status: 'ACTIVE', slug: 'tenant-one' }
  return createDevCsvFixture({ provider: new ScadaCsvFixtureProvider(root), tenants: { get: async () => tenant }, env: ALL_ON })
}
const audit = () => ({ record: async (_e: ScadaQueryAuditEntry) => undefined })
const clock = () => ({ nowMs: () => Date.parse('2026-06-01T00:00:00.000Z'), correlationId: () => 'srv' })
const tenantRecord: TenantRecord = { id: T, type: 'STANDARD', status: 'ACTIVE', slug: 'tenant-one' }
function deps(over: Record<string, unknown>) {
  return {
    scopes: { resolve: async () => ({ tenantId: T, customerRootTenantId: ROOT, dataScopeTenantIds: [T] }) },
    callers: { describe: async () => ({ tenant: tenantRecord, userActive: true }) },
    artifacts: { assertExists: async () => undefined },
    clock: clock(),
    audit: audit(),
    limits: { get: () => DEV_FIXTURE_API_LIMITS },
    ...over,
  } as ConstructorParameters<typeof ScadaAnalysisApiService>[0]
}
const call = (body?: unknown) => ({ actor: { id: 'u-1' }, tenantId: T, routeCode: 'SCADA_HOURLY_ANALYSIS', body })
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: ScadaApiError) => e.code)
