import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildMockDb, chain } from '../../../../db/test-helpers/drizzle-mock'
import { ReportingService } from '../../../reporting.service'
import type { ScadaQueryAuditEntry } from '../../adapter/scada-readonly.port'
import type { TenantRecord } from '../../catalog/tenant-guards'
import { ScadaCsvFixtureProvider } from '../../fixture/scada-csv-fixture.provider'
import { SCADA_FIXTURE_ARTIFACT_CODE, SCADA_FIXTURE_DATA_ORIGIN, SCADA_FIXTURE_DEVELOPMENT_LABEL, buildScadaFixtureArtifact, fixtureCatalogId } from '../../fixture/scada-fixture-artifact'
import { DEV_FIXTURE_API_LIMITS, DEV_FIXTURE_ZONE_ENV, createDevCsvFixture } from '../dev-csv-scada-fixture'
import { ScadaApiError, type ScadaAnalysisQueryPort, type ScadaApiSource, type ScadaSourceCatalogPort } from '../scada-api.contract'
import { ScadaAnalysisApiService, type ScadaAnalysisApiDeps } from '../scada-analysis-api.service'

/**
 * TASK-027.73-R1 — artifact + catalog discovery. Gate tests use a TEMPORARY manifest / CSV (a fixture of THIS test, written to the OS
 * temp dir, never to the repo); the real-snapshot suite is skipped when the git-ignored `veriler/raw/` is absent.
 */
const ROOT = 'root-1'
const TENANT = 'tenant-1'
const ZONE = 'Europe/Istanbul'
const DEV = { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true', [DEV_FIXTURE_ZONE_ENV]: ZONE } as NodeJS.ProcessEnv
const tenant = (over: Partial<TenantRecord> = {}): TenantRecord => ({ id: TENANT, type: 'STANDARD', status: 'ACTIVE', slug: 'tenant-one', ...over })

const dirs: string[] = []
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))

interface TmpSource { key: string; csv: string; table?: string; sha?: string; noFile?: boolean; columnCount?: number; columns?: unknown[] }
/** The manifest's verified column declarations of these tests (TEST parameters, not claims about any real data). */
const DECLARED = [{ sourceColumn: 'GT1_URETIM_KWH', evidenceRefs: ['TEST:evidence'], verified: true, valueType: 'INDEX', unit: 'kWh' }]
function tmpProvider(sources: TmpSource[]) {
  const root = mkdtempSync(path.join(tmpdir(), 'metnex-scada-fixture-'))
  dirs.push(root)
  mkdirSync(path.join(root, 'veriler/manifest'), { recursive: true })
  mkdirSync(path.join(root, 'veriler/raw'), { recursive: true })
  const manifest = {
    version: '1.0.0', generatedAt: '2026-01-01T00:00:00Z', description: 'test', developmentOnly: true,
    sources: sources.map(s => {
      const columnCount = s.columnCount ?? s.csv.split('\n')[0]!.split(';').length
      if (!s.noFile) writeFileSync(path.join(root, `veriler/raw/${s.key}.csv`), s.csv)
      return { catalogId: `scada-cat-${s.key}`, sourceKey: s.key, logicalSourceName: `Kaynak ${s.key}`, file: `veriler/raw/${s.key}.csv`, table: s.table ?? `phys_${s.key}`, idColumn: 'ID', dateColumn: 'KAYIT_TARIHI', timeColumn: 'KAYIT_SAATI', timezone: 'UNVERIFIED', status: 'DEVELOPMENT_FIXTURE', mappingStatus: 'UNVERIFIED', sha256: s.sha ?? createHash('sha256').update(s.csv, 'utf8').digest('hex'), rowCount: 0, columnCount, developmentOnly: true, columns: s.columns ?? DECLARED }
    }),
  }
  writeFileSync(path.join(root, 'veriler/manifest/scada-fixtures.manifest.json'), JSON.stringify(manifest))
  return { root, provider: new ScadaCsvFixtureProvider(root) }
}

const HEADER = 'ID;KAYIT_TARIHI;KAYIT_SAATI;GT1_URETIM_KWH;GT2_URETIM_KWH;ESKI_ALAN_KWH;API_TOKEN_KWH'
const csv = (rows = 6) => [HEADER, ...Array.from({ length: rows }, (_, i) => `${i + 1};1.02.2026;${String(i).padStart(2, '0')}:00:00;${1000 + 5 * i};${i === 2 ? '' : 2000 + 7 * i};;${i}`)].join('\n')

function service(opts: { provider: ScadaCsvFixtureProvider; env?: NodeJS.ProcessEnv; tenantRecord?: TenantRecord | null; failAudit?: boolean; deps?: Partial<ScadaAnalysisApiDeps> }) {
  const audits: ScadaQueryAuditEntry[] = []
  const audit = { record: async (e: ScadaQueryAuditEntry) => (opts.failAudit ? Promise.reject(new Error('down')) : void audits.push(e)) }
  const record = opts.tenantRecord === undefined ? tenant() : opts.tenantRecord
  const fixture = createDevCsvFixture({ provider: opts.provider, tenants: { get: async () => record }, env: opts.env ?? DEV })
  let k = 0
  const clock = { nowMs: () => Date.parse('2026-06-01T00:00:00.000Z'), correlationId: () => `srv-${(k += 1)}` }
  const svc = new ScadaAnalysisApiService({
    scopes: { resolve: async () => ({ tenantId: TENANT, customerRootTenantId: ROOT, dataScopeTenantIds: [TENANT] }) },
    callers: { describe: async () => ({ tenant: record, userActive: true }) },
    artifacts: { assertExists: async () => undefined },
    clock, audit,
    sources: fixture.catalog,
    query: fixture.queryService(audit, clock),
    limits: { get: () => DEV_FIXTURE_API_LIMITS },
    ...opts.deps,
  })
  return { svc, audits }
}
const call = (code = SCADA_FIXTURE_ARTIFACT_CODE) => ({ actor: { id: 'u-1' }, tenantId: TENANT, routeCode: code })
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: ScadaApiError) => e.code)

describe('artifact visibility (in memory, flag-gated, never persisted)', () => {
  const saved = { ...process.env }
  afterEach(() => { process.env = { ...saved } })
  function reporting() {
    const db = buildMockDb()
    db.select.mockReturnValue(chain([]))
    return new ReportingService(db as never, {} as never, {} as never, {} as never, { log: jest.fn() } as never)
  }
  const codes = async () => ((await reporting().listArtifacts('t-1')).artifacts as Array<{ code: string }>).map(a => a.code)

  it('is listed with its development metadata when the fixture flag is on', async () => {
    process.env = { ...saved, NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true', [DEV_FIXTURE_ZONE_ENV]: ZONE }
    const list = (await reporting().listArtifacts('t-1')).artifacts as Array<Record<string, unknown>>
    const a = list.find(x => x['code'] === SCADA_FIXTURE_ARTIFACT_CODE)!
    expect(a).toMatchObject({ code: 'SCADA_HOURLY_ANALYSIS', isActive: true, developmentOnly: true, dataOrigin: SCADA_FIXTURE_DATA_ORIGIN, developmentLabel: SCADA_FIXTURE_DEVELOPMENT_LABEL, timezoneStatus: 'DEVELOPMENT_OVERRIDE' })
    expect(SCADA_FIXTURE_DATA_ORIGIN).toBe('DEVELOPMENT_CSV_SNAPSHOT')
    expect(await reporting().getArtifact('t-1', SCADA_FIXTURE_ARTIFACT_CODE)).toMatchObject({ code: SCADA_FIXTURE_ARTIFACT_CODE })
  })

  it.each([
    ['production with the flag', { NODE_ENV: 'production', REPORTING_DEV_FIXTURES: 'true' }],
    ['development without the flag', { NODE_ENV: 'development' }],
    ['test with the flag', { NODE_ENV: 'test', REPORTING_DEV_FIXTURES: 'true' }],
  ])('is NOT listed and NOT found: %s', async (_n, env) => {
    process.env = { ...saved, ...env } as NodeJS.ProcessEnv
    delete process.env[DEV_FIXTURE_ZONE_ENV]
    expect(await codes()).not.toContain(SCADA_FIXTURE_ARTIFACT_CODE)
    await expect(reporting().getArtifact('t-1', SCADA_FIXTURE_ARTIFACT_CODE)).rejects.toMatchObject({ status: 404 })
  })

  it('with the flag but no zone the artifact exists, reports UNVERIFIED and no source list', async () => {
    process.env = { ...saved, NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true' }
    delete process.env[DEV_FIXTURE_ZONE_ENV]
    const a = (await reporting().listArtifacts('t-1')).artifacts.find(x => x.code === SCADA_FIXTURE_ARTIFACT_CODE) as unknown as Record<string, unknown>
    expect(a['timezoneStatus']).toBe('UNVERIFIED')
  })

  it('the descriptor comes from ONE central contract: absent without the flag, complete with it', () => {
    expect(buildScadaFixtureArtifact({ NODE_ENV: 'production' })).toBeNull()
    const { provider } = tmpProvider([{ key: 'a', csv: csv() }, { key: 'b', csv: csv() }])
    const artifact = buildScadaFixtureArtifact(DEV, provider)!
    expect(artifact).toMatchObject({ code: SCADA_FIXTURE_ARTIFACT_CODE, status: 'DEVELOPMENT_ONLY', developmentOnly: true, supportedIntervals: ['HOURLY', 'DAILY'], dataOrigin: 'DEVELOPMENT_CSV_SNAPSHOT', timezoneStatus: 'DEVELOPMENT_OVERRIDE' })
    expect(artifact.sourceCatalogIds).toEqual([fixtureCatalogId('a'), fixtureCatalogId('b')].sort())
    expect(artifact.name).toBeTruthy()
    expect(artifact.description).toBeTruthy()
    expect(artifact.supportedFormats.length).toBeGreaterThan(0)
  })

  it('the artifact code is defined in ONE production file only', () => {
    const src = require('node:fs').readFileSync(path.resolve(__dirname, '../../fixture/scada-fixture-artifact.ts'), 'utf8') as string
    expect(src).toContain("'SCADA_HOURLY_ANALYSIS'")
    const others = ['../scada-analysis-api.service.ts', '../dev-csv-scada-fixture.ts', '../scada-api.providers.ts', '../../../reporting.service.ts'].map(f => require('node:fs').readFileSync(path.resolve(__dirname, f), 'utf8') as string)
    expect(others.filter(t => t.includes('SCADA_HOURLY_ANALYSIS'))).toEqual([])
  })
})

describe('catalog discovery over a manifest + CSV (temporary fixture)', () => {
  it('lists the manifest sources, deterministically ordered, with status / mapping / schema / timezone / interval / row count / min / max', async () => {
    const { provider } = tmpProvider([{ key: 'zeta', csv: csv() }, { key: 'alfa', csv: csv(4) }])
    const { svc, audits } = service({ provider })
    const r = await svc.getCatalog(call())
    expect(r.sources.map(s => s.catalogId)).toEqual([fixtureCatalogId('alfa'), fixtureCatalogId('zeta')].sort())
    const s = r.sources.find(x => x.catalogId === fixtureCatalogId('zeta'))!
    expect(s).toMatchObject({ name: 'Kaynak zeta', status: 'ACTIVE', mappingStatus: 'RESOLVED', schemaStatus: 'UNVERIFIED', timezoneStatus: 'DEVELOPMENT_OVERRIDE', supportedIntervals: ['HOURLY', 'DAILY'], rowCount: 6, selectable: true, blockedReason: null, timezone: ZONE })
    expect(s.minAt).toBe('2026-01-31T21:00:00.000Z') // 1.02.2026 00:00 local (+03:00) as a real UTC instant
    expect(s.maxAt).toBe('2026-02-01T02:00:00.000Z')
    expect(r.artifact).toMatchObject({ code: SCADA_FIXTURE_ARTIFACT_CODE, dataOrigin: 'DEVELOPMENT_CSV_SNAPSHOT' })
    expect(r.developmentLabel).toBe('Geliştirme CSV snapshot verisi')
    expect(audits.map(a => [a.actionCode, a.reasonCode, a.rowCount])).toEqual([['SCADA_QUERY_SUCCEEDED', 'OK', 2]])
    expect(JSON.stringify(await svc.getCatalog(call()))).toBe(JSON.stringify(r)) // deterministic
  })

  it('a column is a selectable series ONLY when the manifest declares it verified; its value type and unit come from the manifest', async () => {
    const { provider } = tmpProvider([{ key: 'alfa', csv: csv(), columns: [{ sourceColumn: 'GT1_URETIM_KWH', evidenceRefs: ['TEST:evidence'], verified: true, valueType: 'INDEX', unit: 'kWh' }, { sourceColumn: 'GT2_URETIM_KWH', evidenceRefs: ['TEST:evidence'], verified: true, valueType: 'REAL_VALUE', unit: '   ', dailyOperation: 'AVERAGE' }] }])
    const r = await service({ provider }).svc.getCatalog(call())
    const series = r.sources[0]!.series
    expect(series.map(x => x.seriesKey)).toEqual(['GT1_URETIM_KWH', 'GT2_URETIM_KWH'])
    expect(new Set(series.map(x => x.seriesKey)).size).toBe(series.length)
    expect(series[0]).toMatchObject({ label: 'GT1_URETIM_KWH', unit: 'kWh', valueType: 'INDEX', available: true, qualityStatus: 'OK', verificationStatus: 'VERIFIED', sourceCatalogId: fixtureCatalogId('alfa') })
    // GT2: declared REAL_VALUE (not guessed from the name); blank unit ⇒ no unit; one missing reading ⇒ PARTIAL
    expect(series[1]).toMatchObject({ unit: '', valueType: 'REAL_VALUE', available: true, qualityStatus: 'PARTIAL', verificationStatus: 'VERIFIED' })
    expect(JSON.stringify(r)).not.toMatch(/KAYIT_TARIHI|KAYIT_SAATI|"ID"|ESKI_ALAN|API_TOKEN/) // id / date / time / empty / credential-like: never listed
  })

  it('a column the manifest does NOT verify is listed as UNVERIFIED and closed to selection; nothing (unit, type) is inferred from its name', async () => {
    const { provider } = tmpProvider([{ key: 'alfa', csv: csv() }]) // only GT1 declared; GT2_URETIM_KWH is undeclared
    const r = await service({ provider }).svc.getCatalog(call())
    const gt2 = r.sources[0]!.series.find(x => x.seriesKey === 'GT2_URETIM_KWH')!
    expect(gt2).toMatchObject({ label: 'GT2_URETIM_KWH', unit: '', valueType: 'UNVERIFIED', available: false, qualityStatus: 'UNVERIFIED', verificationStatus: 'UNVERIFIED' })
    expect(r.sources[0]!.series.map(x => x.seriesKey)).toEqual(['GT1_URETIM_KWH', 'GT2_URETIM_KWH'])
  })

  it.each([
    ['verified: false', { sourceColumn: 'GT1_URETIM_KWH', evidenceRefs: ['TEST:evidence'], verified: false, valueType: 'INDEX', unit: 'kWh' }],
    ['no value type', { sourceColumn: 'GT1_URETIM_KWH', evidenceRefs: ['TEST:evidence'], verified: true, unit: 'kWh' }],
    ['an unknown value type', { sourceColumn: 'GT1_URETIM_KWH', evidenceRefs: ['TEST:evidence'], verified: true, valueType: 'MEASUREMENT', unit: 'kWh' }],
    ['verified as a string', { sourceColumn: 'GT1_URETIM_KWH', evidenceRefs: ['TEST:evidence'], verified: 'true', valueType: 'INDEX' }],
  ])('a declaration with %s does not verify the column', async (_n, decl) => {
    const { provider } = tmpProvider([{ key: 'alfa', csv: csv(), columns: [decl] }])
    const r = await service({ provider }).svc.getCatalog(call())
    expect(r.sources[0]).toMatchObject({ selectable: false, blockedReason: 'NO_SERIES' })
    expect(r.sources[0]!.series.every(x => !x.available && x.verificationStatus === 'UNVERIFIED')).toBe(true)
  })

  it('a manifest with NO column declarations verifies nothing: every column is UNVERIFIED and no source can be selected (nothing is invented)', async () => {
    const { provider } = tmpProvider([{ key: 'alfa', csv: csv(), columns: [] }])
    const r = await service({ provider }).svc.getCatalog(call())
    expect(r.sources[0]).toMatchObject({ selectable: false, blockedReason: 'NO_SERIES', minAt: null, maxAt: null })
    expect(r.sources[0]!.series.map(x => x.seriesKey)).toEqual(['GT1_URETIM_KWH', 'GT2_URETIM_KWH'])
    expect(JSON.stringify(r)).not.toMatch(/"unit":"kWh"|"valueType":"INDEX"/)
  })

  it('an undeclared unit stays empty (the UI says "Birim belirtilmemiş"): the _KWH suffix of the name is NOT read as a unit', async () => {
    const { provider } = tmpProvider([{ key: 'alfa', csv: csv(), columns: [{ sourceColumn: 'GT1_URETIM_KWH', evidenceRefs: ['TEST:evidence'], verified: true, valueType: 'INDEX' }] }])
    const r = await service({ provider }).svc.getCatalog(call())
    expect(r.sources[0]!.series[0]).toMatchObject({ seriesKey: 'GT1_URETIM_KWH', unit: '', valueType: 'INDEX' })
  })

  it('an UNVERIFIED column cannot be analysed (the query service does not know it)', async () => {
    const { provider } = tmpProvider([{ key: 'alfa', csv: csv() }])
    const { svc } = service({ provider })
    const body = { sourceCatalogIds: [fixtureCatalogId('alfa')], seriesKeys: ['GT2_URETIM_KWH'], startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T00:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE }
    expect(await codeOf(svc.runAnalysis({ ...call(), body }))).not.toBe('OK')
  })

  it('an unlisted column cannot be analysed either (the query service rejects it)', async () => {
    const { provider } = tmpProvider([{ key: 'alfa', csv: csv() }])
    const { svc } = service({ provider })
    const body = { sourceCatalogIds: [fixtureCatalogId('alfa')], seriesKeys: ['ESKI_ALAN_KWH'], startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T00:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE }
    expect(await codeOf(svc.runAnalysis({ ...call(), body }))).not.toBe('OK')
  })

  it('a missing time-zone override BLOCKS discovery: sources are listed as not selectable, no series, no date range', async () => {
    const { provider } = tmpProvider([{ key: 'alfa', csv: csv() }])
    const env = { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true' } as NodeJS.ProcessEnv
    const r = await service({ provider, env }).svc.getCatalog(call())
    expect(r.sources[0]).toMatchObject({ selectable: false, blockedReason: 'TIMEZONE_UNVERIFIED', timezoneStatus: 'UNVERIFIED', series: [], minAt: null, maxAt: null, rowCount: null })
    expect(r.artifact?.timezoneStatus).toBe('UNVERIFIED')
  })

  it('a manifest hash mismatch is refused with a static 503 and no path / hash in the answer or the audit', async () => {
    const { provider, root } = tmpProvider([{ key: 'alfa', csv: csv(), sha: 'f'.repeat(64) }])
    const { svc, audits } = service({ provider })
    const err = (await svc.getCatalog(call()).catch(e => e)) as ScadaApiError
    expect(err).toBeInstanceOf(ScadaApiError)
    expect(err.code).toBe('SCADA_SOURCE_UNAVAILABLE')
    expect(JSON.stringify({ m: err.message, a: audits })).not.toMatch(new RegExp(`${root.replace(/[\\\\/.]/g, '.')}|veriler|Checksum|ffffffff|\\.csv`))
    expect(audits.map(a => a.actionCode)).toEqual(['SCADA_QUERY_FAILED'])
  })

  it('a missing raw file is a static 503 too (never a path)', async () => {
    const { provider } = tmpProvider([{ key: 'alfa', csv: csv(), noFile: true }])
    const err = (await service({ provider }).svc.getCatalog(call()).catch(e => e)) as ScadaApiError
    expect(err.code).toBe('SCADA_SOURCE_UNAVAILABLE')
    expect(err.message).toBe('SCADA_SOURCE_UNAVAILABLE')
  })

  it('the response carries no file path, physical name, SQL, host or credential (whitelist projection)', async () => {
    const { provider, root } = tmpProvider([{ key: 'alfa', csv: csv(), table: 'phys_table_zz9' }])
    const text = JSON.stringify(await service({ provider }).svc.getCatalog(call()))
    expect(text).not.toContain(root)
    expect(text).not.toMatch(/veriler|\.csv|phys_alfa|phys_table_zz9|dateColumn|timeColumn|sha256|SELECT\s|Server=|password|connection|schema\b|database/i)
  })

  it('never logs a raw CSV row', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m => jest.spyOn(console, m).mockImplementation(() => undefined))
    try {
      const { provider } = tmpProvider([{ key: 'alfa', csv: csv() }])
      await service({ provider }).svc.getCatalog(call())
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    } finally {
      spies.forEach(s => s.mockRestore())
    }
  })
})

describe('gates: tenant, mapping, isolation, provider', () => {
  const src = (over: Partial<ScadaApiSource> = {}): ScadaApiSource => ({
    catalogId: '00000000-0000-4000-8000-000000000001', customerRootTenantId: ROOT, displayName: 'Kaynak', active: true, mappingResolved: true, tenant: tenant(), sourceTimeZone: ZONE,
    table: 'phys_table', dateColumn: 'D', timeColumn: 'T',
    series: [{ seriesKey: 'A', label: 'A', unit: 'kWh', valueType: 'INDEX' }, { seriesKey: 'B', label: 'B', unit: 'kWh', valueType: 'INDEX' }, { seriesKey: 'A', label: 'A again', unit: 'kWh', valueType: 'INDEX' }],
    ...over,
  })
  function withCatalog(sources: ScadaApiSource[], deps: Partial<ScadaAnalysisApiDeps> = {}) {
    const audits: ScadaQueryAuditEntry[] = []
    const catalog: ScadaSourceCatalogPort = { listSources: async () => sources }
    const svc = new ScadaAnalysisApiService({
      scopes: { resolve: async () => ({ tenantId: TENANT, customerRootTenantId: ROOT, dataScopeTenantIds: [TENANT] }) },
      callers: { describe: async () => ({ tenant: tenant(), userActive: true }) },
      artifacts: { assertExists: async () => undefined },
      clock: { nowMs: () => 0, correlationId: () => 'c' },
      audit: { record: async e => void audits.push(e) },
      sources: catalog,
      limits: { get: () => DEV_FIXTURE_API_LIMITS },
      ...deps,
    })
    return { svc, audits }
  }

  it('the excluded organisation as a source tenant is NOT LISTED at all; another root\'s source is not listed either', async () => {
    const { svc } = withCatalog([src({ catalogId: '00000000-0000-4000-8000-000000000001', tenant: tenant({ slug: 'MOSEDAŞ' }) }), src({ catalogId: '00000000-0000-4000-8000-000000000002', customerRootTenantId: 'root-2' }), src({ catalogId: '00000000-0000-4000-8000-000000000003' })])
    const r = await svc.getCatalog(call('X'))
    expect(r.sources.map(s => s.catalogId)).toEqual(['00000000-0000-4000-8000-000000000003'])
  })

  it.each([
    ['unresolved mapping', { mappingResolved: false }, 'MAPPING_UNRESOLVED'],
    ['inactive source', { active: false }, 'SOURCE_INACTIVE'],
    ['unresolved source tenant', { tenant: null }, 'TENANT_NOT_MAPPABLE'],
    ['inactive source tenant', { tenant: tenant({ status: 'SUSPENDED' }) }, 'TENANT_NOT_MAPPABLE'],
    ['platform-root source tenant', { tenant: tenant({ type: 'PLATFORM_ROOT' }) }, 'TENANT_NOT_MAPPABLE'],
    ['a tenant outside the resolved scope', { tenant: tenant({ id: 'tenant-9' }) }, 'TENANT_NOT_MAPPABLE'],
    ['no time zone', { sourceTimeZone: null }, 'TIMEZONE_UNVERIFIED'],
    ['no series', { series: [] }, 'NO_SERIES'],
  ])('%s ⇒ listed as NOT selectable (%s), no series, no range', async (_n, over, reason) => {
    const { svc } = withCatalog([src(over as Partial<ScadaApiSource>)])
    const s = (await svc.getCatalog(call('X'))).sources[0]!
    expect(s).toMatchObject({ selectable: false, blockedReason: reason, series: [], minAt: null, maxAt: null })
  })

  it('a selectable source lists each series once, sorted, from the catalog view only', async () => {
    const { svc } = withCatalog([src()])
    expect((await svc.getCatalog(call('X'))).sources[0]!.series.map(s => s.seriesKey)).toEqual(['A', 'B'])
  })

  it.each([
    ['the excluded organisation', tenant({ slug: 'Mosedaş' })],
    ['an inactive tenant', tenant({ status: 'ARCHIVED' })],
    ['a platform-root tenant', tenant({ type: 'PLATFORM_ROOT' })],
    ['an unresolved tenant', null],
  ])('%s as the CALLER tenant ⇒ SCADA_SCOPE_DENIED, nothing listed', async (_n, record) => {
    const { svc, audits } = withCatalog([src()], { callers: { describe: async () => ({ tenant: record as TenantRecord | null, userActive: true }) } })
    expect(await codeOf(svc.getCatalog(call('X')))).toBe('SCADA_SCOPE_DENIED')
    expect(audits.map(a => a.actionCode)).toEqual(['SCADA_QUERY_DENIED'])
  })

  it('no provider ⇒ 503 SCADA_SOURCE_NOT_CONFIGURED; missing limits ⇒ 503; an artifact the catalog does not serve ⇒ 404', async () => {
    expect(await codeOf(withCatalog([], { sources: undefined }).svc.getCatalog(call('X')))).toBe('SCADA_SOURCE_NOT_CONFIGURED')
    expect(await codeOf(withCatalog([src()], { limits: undefined }).svc.getCatalog(call('X')))).toBe('SCADA_LIMITS_NOT_CONFIGURED')
    const serving: ScadaSourceCatalogPort = { listSources: async () => [src()], describeArtifact: () => null }
    expect(await codeOf(withCatalog([], { sources: serving }).svc.getCatalog(call('OTHER_CODE')))).toBe('SCADA_NOT_FOUND')
  })

  it('a malformed route code is refused before anything is read', async () => {
    const { svc } = withCatalog([src()])
    expect(await codeOf(svc.getCatalog(call('a b')))).toBe('SCADA_ROUTE_CODE_INVALID')
  })

  it('audit down ⇒ NO catalog (SCADA_AUDIT_FAILED)', async () => {
    const { svc } = withCatalog([src()], { audit: { record: async () => { throw new Error('down') } } })
    expect(await codeOf(svc.getCatalog(call('X')))).toBe('SCADA_AUDIT_FAILED')
  })
})

describe('the analysis receives ONLY the selected source and series', () => {
  it('a selection of one source and one series reaches the query service exactly so', async () => {
    const calls: Array<{ catalogId: string; columns: readonly string[]; startAt: Date; endAt: Date; interval: string }> = []
    const query: ScadaAnalysisQueryPort = { runMany: async (_a, _s, queries, options) => { calls.push(...queries.map(q => ({ catalogId: q.catalogId, columns: q.columns, startAt: q.startAt, endAt: q.endAt, interval: q.interval }))); return { mode: options.mode, interval: 'HOURLY', valueType: 'INDEX', complete: true, records: [], sources: queries.map(q => ({ catalogId: q.catalogId, status: 'READ' as const, code: null, rowCount: 0 })) } } }
    const A = '00000000-0000-4000-8000-000000000001'
    const B = '00000000-0000-4000-8000-000000000002'
    const source = (id: string): ScadaApiSource => ({ catalogId: id, customerRootTenantId: ROOT, displayName: 'K', active: true, mappingResolved: true, tenant: tenant(), sourceTimeZone: ZONE, table: 't', dateColumn: 'D', timeColumn: 'T', series: ['S1', 'S2', 'S3'].map(k => ({ seriesKey: k, label: k, unit: 'kWh', valueType: 'INDEX' as const })) })
    const svc = new ScadaAnalysisApiService({
      scopes: { resolve: async () => ({ tenantId: TENANT, customerRootTenantId: ROOT, dataScopeTenantIds: [TENANT] }) },
      callers: { describe: async () => ({ tenant: tenant(), userActive: true }) },
      artifacts: { assertExists: async () => undefined },
      clock: { nowMs: () => 0, correlationId: () => 'c' },
      audit: { record: async () => undefined },
      sources: { listSources: async () => [source(A), source(B)] },
      query, limits: { get: () => DEV_FIXTURE_API_LIMITS },
    })
    await svc.runAnalysis({ actor: { id: 'u-1' }, tenantId: TENANT, routeCode: 'X', body: { sourceCatalogIds: [A], seriesKeys: ['S2'], startAt: '2026-02-01T00:00:00.000Z', endAt: '2026-02-01T06:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE } })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ catalogId: A, columns: ['S2'], interval: 'HOURLY' })
    expect(calls[0]!.startAt.toISOString()).toBe('2026-02-01T00:00:00.000Z')
    expect(calls[0]!.endAt.toISOString()).toBe('2026-02-01T06:00:00.000Z')
  })
})

const REAL = path.resolve(__dirname, '../../../../../../..')
const HAS_REAL = existsSync(path.join(REAL, 'veriler/raw/gt_endeksler.csv')) && existsSync(path.join(REAL, 'veriler/manifest/scada-fixtures.manifest.json'))
;(HAS_REAL ? describe : describe.skip)('catalog discovery over the REAL raw snapshot', () => {
  it('lists every manifest source; the checked-in manifest verifies only evidenced columns, everything else is UNVERIFIED and unselectable; nothing physical leaks', async () => {
    const { svc } = service({ provider: new ScadaCsvFixtureProvider(REAL) })
    const r = await svc.getCatalog(call())
    expect(r.sources.map(s => s.catalogId)).toEqual(['endeksler', 'gt_endeksler', 'komur_endeksler', 'sg_endeksler'].map(fixtureCatalogId).sort())
    const gt = r.sources.find(s => s.catalogId === fixtureCatalogId('gt_endeksler'))!
    expect(gt.selectable).toBe(true)
    expect(gt.series.filter(x => x.available)).toHaveLength(9)
    expect(gt.series.filter(x => !x.available).every(x => x.verificationStatus === 'UNVERIFIED' && x.unit === '' && x.valueType === 'UNVERIFIED')).toBe(true)
    expect(gt.rowCount).toBeGreaterThan(1000)
    expect(gt.minAt! < gt.maxAt!).toBe(true)
    expect(JSON.stringify(r)).not.toMatch(/veriler|\.csv|KAYIT_TARIHI|sha256/i)
  })
})
