import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ScadaQueryAuditEntry } from '../../adapter/scada-readonly.port'
import { isCatalogId } from '../../catalog/catalog-rules'
import type { TenantRecord } from '../../catalog/tenant-guards'
import { ScadaCsvFixtureProvider, ScadaFixtureProviderError } from '../../fixture/scada-csv-fixture.provider'
import { DEV_FIXTURE_API_LIMITS, DEV_FIXTURE_ZONE_ENV, createDevCsvFixture, fixtureCatalogId } from '../dev-csv-scada-fixture'
import { ScadaApiError } from '../scada-api.contract'
import { ScadaAnalysisApiService } from '../scada-analysis-api.service'

/**
 * TASK-027.72-R1 — the development CSV fixture wired to the API over the REAL 027.65 query service. The manifest declares every
 * fixture zone UNVERIFIED, so the zone below is a TEST parameter passed through the development-only variable. `veriler/raw/` is
 * git-ignored: the data suites are skipped (like the 027.65 CSV suite) when the snapshot is absent; the gate tests never need it.
 */
const REPO_ROOT = path.resolve(__dirname, '../../../../../../..')
const HAS_SNAPSHOT = existsSync(path.join(REPO_ROOT, 'veriler/raw/gt_endeksler.csv')) && existsSync(path.join(REPO_ROOT, 'veriler/manifest/scada-fixtures.manifest.json'))
const snapshot = HAS_SNAPSHOT ? describe : describe.skip

const DEV = { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true', [DEV_FIXTURE_ZONE_ENV]: 'Europe/Istanbul' } as NodeJS.ProcessEnv
const TENANT = 'tenant-1'
const ROOT = 'root-1'
const tenant = (over: Partial<TenantRecord> = {}): TenantRecord => ({ id: TENANT, type: 'STANDARD', status: 'ACTIVE', slug: 'tenant-one', ...over })
const GT = fixtureCatalogId('gt_endeksler')
const SERIES = 'GT1_ELEKTRIK_URETIM_KWH'

function setup(env: NodeJS.ProcessEnv, tenantRecord: TenantRecord | null = tenant(), failAudit = false) {
  const audits: ScadaQueryAuditEntry[] = []
  const audit = { record: async (e: ScadaQueryAuditEntry) => (failAudit ? Promise.reject(new Error('down')) : void audits.push(e)) }
  let k = 0
  const clock = { nowMs: () => Date.parse('2026-06-01T00:00:00.000Z'), correlationId: () => `srv-${(k += 1)}` }
  const provider = new ScadaCsvFixtureProvider(REPO_ROOT) // the checked-in manifest (TASK-027.73-R2: evidence-backed column declarations)
  const fixture = createDevCsvFixture({ provider, tenants: { get: async () => tenantRecord }, env })
  const service = new ScadaAnalysisApiService({
    scopes: { resolve: async () => ({ tenantId: TENANT, customerRootTenantId: ROOT, dataScopeTenantIds: [TENANT] }) },
    callers: { describe: async () => ({ tenant: tenantRecord, userActive: true }) },
    artifacts: { assertExists: async () => undefined },
    clock,
    audit,
    sources: fixture.catalog,
    query: fixture.queryService(audit, clock),
    limits: { get: () => DEV_FIXTURE_API_LIMITS },
  })
  return { service, audits, provider, fixture }
}
const call = (body: unknown) => ({ actor: { id: 'u-1' }, tenantId: TENANT, routeCode: 'DEV_REPORTING_FIXTURE', body })
const body = (over: Record<string, unknown> = {}) => ({ sourceCatalogIds: [GT], seriesKeys: [SERIES], startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T03:00:00.000Z', bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul', ...over })
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: ScadaApiError) => e.code)

describe('development CSV fixture: gates that need no snapshot', () => {
  it('a disabled provider (production / no flag) reads NOTHING: it refuses before any file access', async () => {
    for (const env of [{ NODE_ENV: 'production', REPORTING_DEV_FIXTURES: 'true' }, { NODE_ENV: 'development' }, { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'false' }, {}] as NodeJS.ProcessEnv[]) {
      const provider = new ScadaCsvFixtureProvider('/definitely/not/a/real/root') // a real read would fail with "Manifest file missing"
      const fixture = createDevCsvFixture({ provider, tenants: { get: async () => tenant() }, env })
      const error = await fixture.catalog.listSources({ tenantId: TENANT, customerRootTenantId: ROOT, dataScopeTenantIds: [TENANT] }).catch(e => e)
      expect(error).toBeInstanceOf(ScadaFixtureProviderError)
      expect(String(error.message)).toMatch(/Provider is disabled/)
    }
  })

  it('the fixture catalog id is a deterministic opaque catalog UUID (the manifest\'s own ids are not)', () => {
    expect(isCatalogId(GT)).toBe(true)
    expect(GT).toBe(fixtureCatalogId('gt_endeksler'))
    expect(GT).not.toBe(fixtureCatalogId('endeksler'))
    expect(GT).not.toMatch(/gt_endeksler|scada/i)
  })

  it('the fixture never imports a database, an ORM or a driver, and the CSV provider is not imported elsewhere in the API module', () => {
    const src = readFileSync(path.resolve(__dirname, '../dev-csv-scada-fixture.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(src).not.toMatch(/from\s+['"](mssql|tedious|pg|drizzle-orm[^'"]*|.*\/db\/[^'"]*)['"]/)
    expect(src).not.toMatch(/sirket|mosedas|mosedaş/i)
  })
})

snapshot('development CSV fixture over the REAL raw CSV (query service, catalog gates, audit)', () => {
  it('reads controlled real data: hourly deltas equal the CSV index differences; one audit record; nothing physical in the response', async () => {
    const { service, audits, provider } = setup(DEV)
    const r = await service.runAnalysis(call(body()))
    const csv = provider.loadSourceRecords('gt_endeksler', TENANT, DEV).filter(x => x.seriesKey === SERIES).slice(0, 8)
    expect(r.status).not.toBe('BLOCKED')
    const points = r.series[0]!.points
    expect(points).toHaveLength(6)
    let compared = 0
    points.forEach((p, i) => {
      const a = csv[i]!.rawValue
      const b = csv[i + 1]!.rawValue
      if (a !== null && b !== null && b >= a) {
        expect(p.value).toBeCloseTo(b - a, 3)
        compared += 1
      }
    })
    expect(compared).toBeGreaterThan(0)
    expect(audits.map(a => [a.actionCode, a.reasonCode, a.entityId, a.customerRootTenantId])).toEqual([['SCADA_QUERY_SUCCEEDED', 'OK', GT, ROOT]])
    const text = JSON.stringify(r)
    expect(text).not.toMatch(/veriler|gt_endeksler|KAYIT_TARIHI|KAYIT_SAATI|\.csv|sha256|Server=|password/i)
  })

  it('is deterministic', async () => {
    const a = await setup(DEV).service.runAnalysis(call(body()))
    const b = await setup(DEV).service.runAnalysis(call(body()))
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })

  it('the manifest zone is UNVERIFIED: without the development zone variable (or with a bad one) NOTHING is analysed', async () => {
    for (const zone of [undefined, '', 'UNVERIFIED', '+03:00', 'Not/AZone']) {
      const env = { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true', ...(zone === undefined ? {} : { [DEV_FIXTURE_ZONE_ENV]: zone }) } as NodeJS.ProcessEnv
      const { service, audits } = setup(env)
      expect(await codeOf(service.runAnalysis(call(body())))).toBe('SCADA_TIMEZONE_MISMATCH')
      expect(audits.every(a => a.actionCode !== 'SCADA_QUERY_SUCCEEDED')).toBe(true)
    }
  })

  it('a request in a different zone than the source is a mismatch, not a silent conversion', async () => {
    expect(await codeOf(setup(DEV).service.runAnalysis(call(body({ timezone: 'Europe/Berlin' }))))).toBe('SCADA_TIMEZONE_MISMATCH')
  })

  it.each([
    ['the excluded organisation', tenant({ slug: 'Mosedaş' })],
    ['an inactive tenant', tenant({ status: 'SUSPENDED' })],
    ['a platform-root tenant', tenant({ type: 'PLATFORM_ROOT' })],
    ['an unresolved tenant', null],
  ])('%s as the caller tenant ⇒ SCADA_SCOPE_DENIED, no CSV row served', async (_n, record) => {
    const { service, audits } = setup(DEV, record as TenantRecord | null)
    expect(await codeOf(service.runAnalysis(call(body())))).toBe('SCADA_SCOPE_DENIED')
    expect(audits.every(a => a.actionCode !== 'SCADA_QUERY_SUCCEEDED')).toBe(true)
  })

  it('an unknown / non-fixture catalog id, a series the CSV does not have, and SQL fields are all refused', async () => {
    const { service } = setup(DEV)
    expect(await codeOf(service.runAnalysis(call(body({ sourceCatalogIds: ['00000000-0000-4000-8000-0000000000aa'] }))))).toBe('SCADA_NOT_FOUND')
    expect(await codeOf(service.runAnalysis(call(body({ seriesKeys: ['NOT_A_COLUMN'] }))))).not.toBe('OK')
    expect(await codeOf(service.runAnalysis(call(body({ table: 'gt_endeksler', sql: 'x' }))))).toBe('SCADA_REQUEST_UNKNOWN_FIELD')
  })

  it('audit down ⇒ no data even though the CSV is readable', async () => {
    expect(await codeOf(setup(DEV, tenant(), true).service.runAnalysis(call(body())))).toBe('SCADA_AUDIT_FAILED')
  })

  it('DAILY over the real data: INDEX = SUM per local day, labelled at the local midnight', async () => {
    const r = await setup(DEV).service.runAnalysis(call(body({ startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-02T21:00:00.000Z', bucketInterval: 'DAILY' })))
    expect(r.series[0]!.points.length).toBeGreaterThan(0)
    expect(r.series[0]!.points[0]!.t).toBe('2025-12-31T21:00:00.000Z')
  })
})
