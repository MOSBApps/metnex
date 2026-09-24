import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ScadaQueryAuditEntry } from '../../adapter/scada-readonly.port'
import type { TenantRecord } from '../../catalog/tenant-guards'
import { ScadaCsvFixtureProvider } from '../../fixture/scada-csv-fixture.provider'
import { DEV_FIXTURE_API_LIMITS, DEV_FIXTURE_ZONE_ENV, createDevCsvFixture, fixtureCatalogId } from '../dev-csv-scada-fixture'
import { SCADA_FIXTURE_SCOPE_BRIDGE_ENV } from '../dev-fixture-scope-resolver'
import { DevPresetStore } from '../dev-preset.store'
import { DevVirtualColumnStore } from '../dev-virtual-column.store'
import { SCADA_PRESET_STORE, ScadaApiError } from '../scada-api.contract'
import { scadaApiControllers, scadaApiProviders } from '../scada-api.providers'
import { ScadaAnalysisApiService } from '../scada-analysis-api.service'
import { ScadaAnalysisController } from '../scada-analysis.controller'
import { ScadaPresetController } from '../scada-preset.controller'
import { ScadaVirtualColumnController } from '../scada-virtual-column.controller'

/** TASK-027.59-R1 — development in-memory preset store + creation over the real development CSV snapshot (skipped without it). */
const REPO_ROOT = path.resolve(__dirname, '../../../../../../..')
const HAS = ['gt_endeksler', 'sg_endeksler'].every(f => existsSync(path.join(REPO_ROOT, `veriler/raw/${f}.csv`)))
const snapshot = HAS ? describe : describe.skip
const ZONE = 'Europe/Istanbul'
const ALL_ON = { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true', [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: 'true', [DEV_FIXTURE_ZONE_ENV]: ZONE } as NodeJS.ProcessEnv
const CODE = 'SCADA_HOURLY_ANALYSIS'
const GT = fixtureCatalogId('gt_endeksler')
const SG = fixtureCatalogId('sg_endeksler')
const GT1 = 'GT1_ELEKTRIK_URETIM_KWH'
const GT2 = 'GT2_ELEKTRIK_URETIM_KWH'
const SG1 = 'SG50_1_ELEKTRIK_URETIM_KWH'
const SG2 = 'SG50_2_ELEKTRIK_URETIM_KWH'
const SECRET = '424242'
const rootOf = (t: string) => (t.startsWith('a') ? 'root-A' : 'root-B')
const tenantOf = (t: string): TenantRecord => ({ id: t, type: 'STANDARD', status: 'ACTIVE', slug: `slug-${t}` })

interface World {
  svc: ScadaAnalysisApiService
  presets: DevPresetStore
  audits: ScadaQueryAuditEntry[]
}
function compose(over: { presets?: DevPresetStore | null; store?: DevPresetStore } = {}): World {
  const audits: ScadaQueryAuditEntry[] = []
  const audit = { record: async (e: ScadaQueryAuditEntry) => void audits.push(e) }
  const presets = over.store ?? new DevPresetStore()
  const vcs = new DevVirtualColumnStore()
  const clock = { nowMs: () => Date.parse('2026-06-01T00:00:00.000Z'), correlationId: () => 'srv' }
  const fixture = createDevCsvFixture({ provider: new ScadaCsvFixtureProvider(REPO_ROOT), tenants: { get: async id => tenantOf(id) }, env: ALL_ON })
  const svc = new ScadaAnalysisApiService({
    scopes: { resolve: async t => ({ tenantId: t, customerRootTenantId: rootOf(t), dataScopeTenantIds: [t] }) },
    callers: { describe: async (_u, t) => ({ tenant: tenantOf(t), userActive: true }) },
    artifacts: { assertExists: async () => undefined },
    clock,
    audit,
    presetAuthorization: { canSharePreset: ({ userId }) => userId.endsWith('-admin') },
    sources: fixture.catalog,
    query: fixture.queryService(audit, clock),
    ...(over.presets === null ? { presets: { listPresetVersions: async () => [] } } : { presets, presetManager: presets }),
    virtualColumns: vcs,
    virtualColumnManager: vcs,
    limits: { get: () => DEV_FIXTURE_API_LIMITS },
  })
  return { svc, presets, audits }
}
const call = (user: string, tenant: string, body?: unknown, param?: unknown) => ({ actor: { id: user }, tenantId: tenant, routeCode: CODE, body, param })
const U = 'a-user'
const A1 = 'a-t1'
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: ScadaApiError) => e.code)
const plan = (over: Record<string, unknown> = {}) => ({ name: 'Vardiya', scope: 'PRIVATE', sourceCatalogIds: [GT], seriesKeys: [GT1], statistics: ['SUM', 'AVERAGE'], comparison: { mode: 'NONE' }, timeRange: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T21:00:00.000Z' }, bucketInterval: 'HOURLY', timezone: ZONE, ...over })
const sourcePlan = (over: Record<string, unknown> = {}) => ({ name: 'GT↔SG', scope: 'PRIVATE', statistics: ['SUM'], comparison: { mode: 'SOURCE', leftSourceCatalogId: GT, rightSourceCatalogId: SG, seriesMapping: [{ leftSeriesKey: GT1, rightSeriesKey: SG1 }] }, timeRange: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T21:00:00.000Z' }, bucketInterval: 'HOURLY', timezone: ZONE, ...over })

describe('development-only: nothing exists outside the four gates', () => {
  const tokens = (e: NodeJS.ProcessEnv) => scadaApiProviders(e).map(p => (p as { provide: unknown }).provide)
  it('the create controller and the in-memory preset store exist ONLY behind development + fixture + bridge + valid zone', () => {
    expect(scadaApiControllers(ALL_ON)).toContain(ScadaPresetController)
    expect(tokens(ALL_ON)).toContain(SCADA_PRESET_STORE)
    for (const over of [{ NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { REPORTING_DEV_FIXTURES: 'false' }, { [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: 'false' }, { [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: undefined }, { [DEV_FIXTURE_ZONE_ENV]: undefined }, { [DEV_FIXTURE_ZONE_ENV]: 'Not/AZone' }]) {
      const env = { ...ALL_ON, ...over } as NodeJS.ProcessEnv
      expect(scadaApiControllers(env)).toEqual([ScadaAnalysisController])
      expect(scadaApiControllers(env)).not.toContain(ScadaPresetController)
      expect(tokens(env)).not.toContain(SCADA_PRESET_STORE)
    }
    expect(scadaApiControllers(ALL_ON)).toEqual([ScadaAnalysisController, ScadaVirtualColumnController, ScadaPresetController])
  })

  it('the store persists nothing: no db / fs / network / cache import; a new instance (an API restart) is empty; rows are per root and deep copies', async () => {
    const src = readFileSync(path.resolve(__dirname, '../dev-preset.store.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(src).not.toMatch(/drizzle|from\s+['"](fs|node:fs|pg|redis|http|https|net)['"]|writeFile|localStorage|console\./)
    const s = new DevPresetStore()
    const id = s.nextIdentity()
    expect(id).toEqual({ presetId: 'pr-1', version: 1 })
    s.append({ presetId: id.presetId, customerRootTenantId: 'root-A', version: 1 } as never)
    expect((await s.listPresetVersions('root-A')).length).toBe(1)
    expect(await s.listPresetVersions('root-B')).toEqual([])
    const copy = (await s.listPresetVersions('root-A')) as unknown as Array<{ name?: string }>
    copy[0]!.name = 'mutated'
    expect(((await s.listPresetVersions('root-A')) as unknown as Array<{ name?: string }>)[0]!.name).toBeUndefined()
    expect(() => s.append({ presetId: 'pr-1', customerRootTenantId: 'root-A', version: 1 } as never)).toThrow('IDENTITY_CONFLICT')
    expect(await new DevPresetStore().listPresetVersions('root-A')).toEqual([]) // restart
  })
})

snapshot('creating a preset', () => {
  it('a valid PRIVATE plan is saved: server generated id / version 1 / owner; the response is the whitelist summary; one audit record', async () => {
    const w = compose()
    const r = await w.svc.createPreset(call(U, A1, plan()))
    expect(r).toMatchObject({ presetId: 'pr-1', version: 1, scope: 'PRIVATE', name: 'Vardiya', status: 'ACTIVE', isOwner: true, bucketInterval: 'HOURLY', timezone: ZONE, sourceCatalogIds: [GT], seriesKeys: [GT1], statistics: ['SUM', 'AVERAGE'], comparisonMode: 'NONE', comparison: { mode: 'NONE', seriesMapping: [] } })
    expect(JSON.stringify(r)).not.toMatch(/customerRootTenantId|ownerUserId|a-user|createdBy|expression/)
    expect(w.audits.map(a => [a.actionCode, a.reasonCode])).toEqual([['SCADA_QUERY_SUCCEEDED', 'OK']])
    const stored = (await w.presets.listPresetVersions('root-A'))[0]!
    expect(stored).toMatchObject({ ownerUserId: U, customerRootTenantId: 'root-A', status: 'ACTIVE', effectiveFrom: null, effectiveTo: null, filters: {} })
  })

  it('version and id are deterministic and server side: two creates ⇒ pr-1 / pr-2, both version 1', async () => {
    const w = compose()
    expect((await w.svc.createPreset(call(U, A1, plan()))).presetId).toBe('pr-1')
    const b = await w.svc.createPreset(call(U, A1, plan({ name: 'İkinci' })))
    expect([b.presetId, b.version]).toEqual(['pr-2', 1])
  })

  it.each(['tenantId', 'customerRootTenantId', 'role', 'permissions', 'status', 'version', 'createdBy', 'ownerUserId', 'presetId', 'createdAt', 'effectiveFrom', 'expression', 'sql', 'schema', 'database', 'table', 'connectionString', 'filters', 'display'])('the client field %s is refused (nothing is stored)', async field => {
    const w = compose()
    expect(await codeOf(w.svc.createPreset(call(U, A1, { ...plan(), [field]: 'x' })))).toBe('SCADA_REQUEST_UNKNOWN_FIELD')
    expect(await w.presets.listPresetVersions('root-A')).toEqual([])
  })

  it('a NORMAL user cannot create a TENANT_SHARED preset; an admin can and a same-root user then sees it (a private one stays private)', async () => {
    const w = compose()
    expect(await codeOf(w.svc.createPreset(call(U, A1, plan({ scope: 'TENANT_SHARED' }))))).toBe('SCADA_SCOPE_DENIED')
    expect(await w.presets.listPresetVersions('root-A')).toEqual([])
    const shared = await w.svc.createPreset(call('a-admin', A1, plan({ scope: 'TENANT_SHARED', name: 'Ortak' })))
    await w.svc.createPreset(call('a-admin', A1, plan({ name: 'Yöneticinin özeli' })))
    const list = await w.svc.listPresets(call(U, A1))
    expect(list.presets.map(p => p.presetId)).toEqual([shared.presetId])
    expect(list.developmentStore).toBe(true)
    expect(list.canShare).toBe(false)
    expect((await w.svc.listPresets(call('a-admin', A1))).canShare).toBe(true)
  })

  it('root isolation: another customer root sees neither private nor shared presets and gets "not found" for their ids', async () => {
    const w = compose()
    const shared = await w.svc.createPreset(call('a-admin', A1, plan({ scope: 'TENANT_SHARED' })))
    await w.svc.createPreset(call(U, A1, plan({ name: 'Özel' })))
    expect((await w.svc.listPresets(call('b-user', 'b-t1'))).presets).toEqual([])
    expect(await codeOf(w.svc.getPreset(call('b-user', 'b-t1', undefined, shared.presetId)))).toBe('SCADA_NOT_FOUND')
    expect(await codeOf(w.svc.runAnalysis(call('b-user', 'b-t1', { presetId: shared.presetId })))).toBe('SCADA_NOT_FOUND')
    expect((await w.svc.listPresets(call('a-other', 'a-t2'))).presets.map(p => p.presetId)).toEqual([shared.presetId]) // same root, another tenant of it: shared only
  })

  it('the service hides another root\'s presets even if a leaky store hands them over (defence in depth, not only the store filter)', async () => {
    class LeakyStore extends DevPresetStore {
      override async listPresetVersions(): Promise<readonly import('../../presets/scada-preset.contract').ScadaPreset[]> {
        return super.listPresetVersions('root-A')
      }
    }
    const w = compose({ store: new LeakyStore() })
    const shared = await w.svc.createPreset(call('a-admin', A1, plan({ scope: 'TENANT_SHARED' })))
    expect((await w.svc.listPresets(call('b-user', 'b-t1'))).presets).toEqual([])
    expect(await codeOf(w.svc.getPreset(call('b-user', 'b-t1', undefined, shared.presetId)))).toBe('SCADA_NOT_FOUND')
    expect(await codeOf(w.svc.runAnalysis(call('b-user', 'b-t1', { presetId: shared.presetId })))).toBe('SCADA_NOT_FOUND')
  })

  it.each([
    ['an unknown series', plan({ seriesKeys: ['NOT_A_COLUMN'] })],
    ['an unverified series', plan({ seriesKeys: ['GT1_MAKEUP_TON'] })],
    ['an unknown source', plan({ sourceCatalogIds: ['00000000-0000-4000-8000-0000000000aa'] })],
    ['an empty series list', plan({ seriesKeys: [] })],
    ['no source', plan({ sourceCatalogIds: [] })],
    ['an inverted range', plan({ timeRange: { startAt: '2026-01-02T00:00:00.000Z', endAt: '2026-01-01T00:00:00.000Z' } })],
    ['a range beyond the limit', plan({ timeRange: { startAt: '2025-01-01T00:00:00.000Z', endAt: '2026-01-01T00:00:00.000Z' } })],
    ['another zone than the source', plan({ timezone: 'Europe/Berlin' })],
    ['a bad interval', plan({ bucketInterval: 'WEEKLY' })],
    ['no statistics', plan({ statistics: [] })],
    ['an unknown virtual column', plan({ virtualColumns: [{ virtualColumnId: 'vc-999' }] })],
    ['an empty name', plan({ name: '' })],
    ['a connection-shaped name', plan({ name: 'Server=10.0.0.5;Password=x' })],
  ])('%s: the plan is refused with a static code and NOTHING is stored', async (_n, body) => {
    const w = compose()
    const code = await codeOf(w.svc.createPreset(call(U, A1, body)))
    expect(code).not.toBe('OK')
    expect(code).toMatch(/^SCADA_/)
    expect(await w.presets.listPresetVersions('root-A')).toEqual([])
  })

  it('a virtual column is stored only as id (+ version), never an expression; nothing of it appears in the response, the list or the audit', async () => {
    const w = compose()
    const vc = await w.svc.createVirtualColumn({ actor: { id: 'a-admin' }, tenantId: A1, routeCode: CODE, body: { label: 'Toplam sanal', unit: 'kWh', catalogId: GT, seriesKey: 'TOTAL', expression: `${GT1} + ${GT2} + ${SECRET} - ${SECRET}`, inputSeriesKeys: [GT1, GT2] } })
    await w.svc.activateVirtualColumn({ actor: { id: 'a-admin' }, tenantId: A1, routeCode: CODE, param: vc.virtualColumnId })
    const r = await w.svc.createPreset(call(U, A1, plan({ virtualColumns: [{ virtualColumnId: vc.virtualColumnId }] })))
    expect(r.virtualColumns).toEqual([{ virtualColumnId: vc.virtualColumnId, version: null }])
    expect((await w.presets.listPresetVersions('root-A'))[0]!.virtualColumns).toEqual([{ virtualColumnId: vc.virtualColumnId }])
    const all = JSON.stringify([r, await w.svc.listPresets(call(U, A1)), await w.svc.getPreset(call(U, A1, undefined, r.presetId)), w.audits, await w.presets.listPresetVersions('root-A')])
    expect(all).not.toMatch(new RegExp(`${SECRET}|expression|A_COUNTER|${GT1} \\+`))
    const run = await w.svc.runAnalysis(call(U, A1, { presetId: r.presetId }))
    expect(run.series.some(s => s.virtual)).toBe(true)
  })

  it('a PERIOD preset keeps the comparison range; running it by id compares the two periods', async () => {
    const w = compose()
    const r = await w.svc.createPreset(call(U, A1, plan({ comparison: { mode: 'PERIOD', comparisonRange: { startAt: '2026-01-01T21:00:00.000Z', endAt: '2026-01-02T21:00:00.000Z' } } })))
    expect(r.comparison).toMatchObject({ mode: 'PERIOD', comparisonRange: { startAt: '2026-01-01T21:00:00.000Z', endAt: '2026-01-02T21:00:00.000Z' } })
    const cmp = await w.svc.runComparison(call(U, A1, { presetId: r.presetId }))
    expect(cmp.mode).toBe('PERIOD')
    expect(cmp.rows.some(x => x.status === 'COMPARABLE')).toBe(true)
  })

  it('a plain preset runs by id (the same plan the screen saved)', async () => {
    const w = compose()
    const r = await w.svc.createPreset(call(U, A1, plan()))
    const run = await w.svc.runAnalysis(call(U, A1, { presetId: r.presetId }))
    expect(run.preset).toEqual({ presetId: r.presetId, presetVersion: 1 })
    expect(run.series[0]!.points.length).toBe(24)
  })

  it('without the development store (production / any other environment) creating is refused (503) and the list says there is no development store', async () => {
    const w = compose({ presets: null })
    expect(await codeOf(w.svc.createPreset(call(U, A1, plan())))).toBe('SCADA_SOURCE_NOT_CONFIGURED')
    const list = await w.svc.listPresets(call(U, A1))
    expect(list).toMatchObject({ presets: [], developmentStore: false, canShare: false })
  })

  it.each([[[]], [null], ['x'], [{ name: 'x' }]])('the body %j is refused', async body => {
    const w = compose()
    expect(await codeOf(w.svc.createPreset(call(U, A1, body)))).not.toBe('OK')
  })
})

snapshot('SOURCE presets and the explicit left → right series mapping', () => {
  it('different column names are stored as an explicit mapping and hydrate as leftSeriesKey → rightSeriesKey; the sources come only from the mapping', async () => {
    const w = compose()
    const r = await w.svc.createPreset(call(U, A1, sourcePlan({ comparison: { mode: 'SOURCE', leftSourceCatalogId: GT, rightSourceCatalogId: SG, seriesMapping: [{ leftSeriesKey: GT1, rightSeriesKey: SG1 }, { leftSeriesKey: GT2, rightSeriesKey: SG2 }] } })))
    expect(r.comparison).toEqual({ mode: 'SOURCE', comparisonRange: null, leftSourceCatalogId: GT, rightSourceCatalogId: SG, seriesMapping: [{ leftSeriesKey: GT1, rightSeriesKey: SG1 }, { leftSeriesKey: GT2, rightSeriesKey: SG2 }] })
    expect(r.sourceCatalogIds).toEqual([GT, SG])
    const cmp = await w.svc.runComparison(call(U, A1, { presetId: r.presetId }))
    expect(cmp).toMatchObject({ mode: 'SOURCE', status: 'OK' })
    expect(cmp.rows.some(x => x.status === 'COMPARABLE')).toBe(true)
  })

  it.each([
    ['no mapping', { leftSourceCatalogId: GT, rightSourceCatalogId: SG }],
    ['an empty mapping', { leftSourceCatalogId: GT, rightSourceCatalogId: SG, seriesMapping: [] }],
    ['the same right series bound to two left series', { leftSourceCatalogId: GT, rightSourceCatalogId: SG, seriesMapping: [{ leftSeriesKey: GT1, rightSeriesKey: SG1 }, { leftSeriesKey: GT2, rightSeriesKey: SG1 }] }],
    ['the same left series bound twice', { leftSourceCatalogId: GT, rightSourceCatalogId: SG, seriesMapping: [{ leftSeriesKey: GT1, rightSeriesKey: SG1 }, { leftSeriesKey: GT1, rightSeriesKey: SG2 }] }],
    ['the same source on both sides', { leftSourceCatalogId: GT, rightSourceCatalogId: GT, seriesMapping: [{ leftSeriesKey: GT1, rightSeriesKey: GT2 }] }],
    ['a right series the source does not have', { leftSourceCatalogId: GT, rightSourceCatalogId: SG, seriesMapping: [{ leftSeriesKey: GT1, rightSeriesKey: GT1 }] }],
    ['an unknown key in a pair', { leftSourceCatalogId: GT, rightSourceCatalogId: SG, seriesMapping: [{ leftSeriesKey: GT1, rightSeriesKey: SG1, tenantId: 'x' }] }],
  ])('%s ⇒ refused, nothing stored', async (_n, comparison) => {
    const w = compose()
    const code = await codeOf(w.svc.createPreset(call(U, A1, sourcePlan({ comparison }))))
    expect(code).not.toBe('OK')
    expect(await w.presets.listPresetVersions('root-A')).toEqual([])
  })

  it('a SOURCE preset may not carry its own sources / series (they come only from the mapping)', async () => {
    const w = compose()
    expect(await codeOf(w.svc.createPreset(call(U, A1, sourcePlan({ sourceCatalogIds: [GT], seriesKeys: [GT1] }))))).toBe('SCADA_REQUEST_INVALID')
  })
})

snapshot('the SOURCE comparison request with the explicit mapping', () => {
  const body = (over: Record<string, unknown> = {}) => ({ mode: 'SOURCE', leftSourceCatalogId: GT, rightSourceCatalogId: SG, period: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T21:00:00.000Z' }, bucketInterval: 'HOURLY', timezone: ZONE, seriesMapping: [{ leftSeriesKey: GT1, rightSeriesKey: SG1 }], ...over })

  it('needs no seriesKeys: the mapping alone selects them; series of DIFFERENT names are compared row by row through it', async () => {
    const w = compose()
    const r = await w.svc.runComparison(call(U, A1, body()))
    expect(r).toMatchObject({ mode: 'SOURCE', status: 'OK' })
    const comparable = r.rows.filter(x => x.status === 'COMPARABLE')
    expect(comparable.length).toBeGreaterThan(0)
    for (const x of comparable) expect(x.absoluteDelta).toBeCloseTo((x.comparison as number) - (x.baseline as number), 3)
  })

  it('without a mapping the request is refused (no pairing by position or by name), and so is an empty one', async () => {
    const w = compose()
    expect(await codeOf(w.svc.runComparison(call(U, A1, body({ seriesMapping: undefined }))))).toBe('SCADA_MAPPING_REQUIRED')
    expect(await codeOf(w.svc.runComparison(call(U, A1, body({ seriesMapping: [] }))))).toBe('SCADA_MAPPING_REQUIRED')
  })

  it('a duplicate right (or left) series is refused; a right series of the wrong source is refused; unknown pair keys are refused', async () => {
    const w = compose()
    expect(await codeOf(w.svc.runComparison(call(U, A1, body({ seriesMapping: [{ leftSeriesKey: GT1, rightSeriesKey: SG1 }, { leftSeriesKey: GT2, rightSeriesKey: SG1 }] }))))).toBe('SCADA_REQUEST_INVALID')
    expect(await codeOf(w.svc.runComparison(call(U, A1, body({ seriesMapping: [{ leftSeriesKey: GT1, rightSeriesKey: SG1 }, { leftSeriesKey: GT1, rightSeriesKey: SG2 }] }))))).toBe('SCADA_REQUEST_INVALID')
    const wrong = await w.svc.runComparison(call(U, A1, body({ seriesMapping: [{ leftSeriesKey: GT1, rightSeriesKey: GT1 }] }))).catch((e: ScadaApiError) => e)
    expect(wrong instanceof ScadaApiError || (wrong as { status: string; rows: unknown[] }).status === 'BLOCKED' || !(wrong as { rows: Array<{ status: string }> }).rows.some(x => x.status === 'COMPARABLE')).toBe(true) // no row is ever comparable through a series the source does not have
    expect(await codeOf(w.svc.runComparison(call(U, A1, body({ seriesMapping: [{ leftSeriesKey: GT1, rightSeriesKey: SG1, x: 1 }] }))))).toBe('SCADA_REQUEST_INVALID')
  })

  it('the earlier { baseline, comparison } pairs and an explicit seriesKeys list still work; a mixed shape is refused', async () => {
    const w = compose()
    const old = [{ baseline: { sourceCatalogId: GT, seriesKey: GT1 }, comparison: { sourceCatalogId: SG, seriesKey: SG1 } }]
    expect(await codeOf(w.svc.runComparison(call(U, A1, body({ seriesMapping: old, seriesKeys: [GT1, SG1] }))))).toBe('OK')
    expect(await codeOf(w.svc.runComparison(call(U, A1, body({ seriesMapping: old }))))).toBe('SCADA_REQUEST_INVALID') // seriesKeys may only be omitted with the explicit left/right pairs
    expect(await codeOf(w.svc.runComparison(call(U, A1, body({ seriesMapping: [...old, { leftSeriesKey: GT2, rightSeriesKey: SG2 }] }))))).toBe('SCADA_REQUEST_INVALID')
  })
})
