import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ScadaQueryAuditEntry } from '../../adapter/scada-readonly.port'
import type { TenantRecord } from '../../catalog/tenant-guards'
import { ScadaCsvFixtureProvider } from '../../fixture/scada-csv-fixture.provider'
import { DEV_FIXTURE_API_LIMITS, DEV_FIXTURE_ZONE_ENV, createDevCsvFixture, fixtureCatalogId } from '../dev-csv-scada-fixture'
import { SCADA_FIXTURE_SCOPE_BRIDGE_ENV } from '../dev-fixture-scope-resolver'
import { DevVirtualColumnStore } from '../dev-virtual-column.store'
import { SCADA_VIRTUAL_COLUMN_STORE, ScadaApiError } from '../scada-api.contract'
import { scadaApiControllers, scadaApiProviders } from '../scada-api.providers'
import { ScadaAnalysisApiService } from '../scada-analysis-api.service'
import { ScadaAnalysisController } from '../scada-analysis.controller'
import { ScadaPresetController } from '../scada-preset.controller'
import { ScadaVirtualColumnController } from '../scada-virtual-column.controller'

/** TASK-027.71-R1 — development virtual columns over a temp CSV (synthetic) and, when present, the real snapshot. */
const ZONE = 'Europe/Istanbul'
const ALL_ON = { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true', [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: 'true', [DEV_FIXTURE_ZONE_ENV]: ZONE } as NodeJS.ProcessEnv
const SECRET = '424242'
const CAT = fixtureCatalogId('s')
const rootOf = (t: string) => (t.startsWith('a') ? 'root-A' : 'root-B')
const tenantOf = (t: string): TenantRecord => ({ id: t, type: 'STANDARD', status: 'ACTIVE', slug: `slug-${t}` })

const dirs: string[] = []
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))

const HEADER = 'ID;KAYIT_TARIHI;KAYIT_SAATI;A_COUNTER;C_INDEX;D_REAL;B_OTHER'
const rows = (n = 10, opts: { missingA?: number } = {}) => Array.from({ length: n }, (_, i) => `${i + 1};1.02.2026;${String(i).padStart(2, '0')}:00:00;${i === opts.missingA ? '' : 100 + 5 * i};${300 + 2 * i};${20 + (i % 3)};${i}`)
const csv = (n = 10, opts: { missingA?: number } = {}) => [HEADER, ...rows(n, opts)].join('\n')
const col = (name: string, valueType: 'INDEX' | 'REAL_VALUE' | null, verified = true) => ({ sourceColumn: name, label: name, verified, valueType, evidenceRefs: ['TEST:evidence'] })

function provider(text: string, columns?: unknown[]) {
  const root = mkdtempSync(path.join(tmpdir(), 'metnex-vc-'))
  dirs.push(root)
  mkdirSync(path.join(root, 'veriler/manifest'), { recursive: true })
  mkdirSync(path.join(root, 'veriler/raw'), { recursive: true })
  writeFileSync(path.join(root, 'veriler/raw/s.csv'), text)
  const entry = { catalogId: 'scada-cat-s', sourceKey: 's', logicalSourceName: 'Kaynak s', file: 'veriler/raw/s.csv', table: 'phys_s', idColumn: 'ID', dateColumn: 'KAYIT_TARIHI', timeColumn: 'KAYIT_SAATI', timezone: 'UNVERIFIED', status: 'DEVELOPMENT_FIXTURE', mappingStatus: 'UNVERIFIED', sha256: createHash('sha256').update(text, 'utf8').digest('hex'), rowCount: 0, columnCount: 7, developmentOnly: true, columns: columns ?? [col('A_COUNTER', 'INDEX'), col('C_INDEX', 'INDEX'), col('D_REAL', 'REAL_VALUE'), col('B_OTHER', null, false)] }
  writeFileSync(path.join(root, 'veriler/manifest/scada-fixtures.manifest.json'), JSON.stringify({ version: '1', generatedAt: 'x', description: 't', developmentOnly: true, sources: [entry] }))
  return new ScadaCsvFixtureProvider(root)
}

interface Harness {
  svc: ScadaAnalysisApiService
  store: DevVirtualColumnStore
  audits: ScadaQueryAuditEntry[]
  admins: Set<string>
  logs: unknown[]
}
function harness(text = csv(), over: { columns?: unknown[]; store?: DevVirtualColumnStore } = {}): Harness {
  const audits: ScadaQueryAuditEntry[] = []
  const audit = { record: async (e: ScadaQueryAuditEntry) => void audits.push(e) }
  const admins = new Set<string>(['a-admin', 'b-admin'])
  const store = over.store ?? new DevVirtualColumnStore()
  const clock = { nowMs: () => Date.parse('2026-06-01T00:00:00.000Z'), correlationId: () => 'srv' }
  const fixture = createDevCsvFixture({ provider: provider(text, over.columns), tenants: { get: async id => tenantOf(id) }, env: ALL_ON })
  const svc = new ScadaAnalysisApiService({
    scopes: { resolve: async t => ({ tenantId: t, customerRootTenantId: rootOf(t), dataScopeTenantIds: [t] }) },
    callers: { describe: async (_u, t) => ({ tenant: tenantOf(t), userActive: true }) },
    artifacts: { assertExists: async () => undefined },
    clock,
    audit,
    presetAuthorization: { canSharePreset: ({ userId }) => admins.has(userId) },
    sources: fixture.catalog,
    query: fixture.queryService(audit, clock),
    virtualColumns: store,
    virtualColumnManager: store,
    limits: { get: () => DEV_FIXTURE_API_LIMITS },
  })
  return { svc, store, audits, admins, logs: [] }
}
const call = (user: string, tenant: string, body?: unknown, param?: unknown) => ({ actor: { id: user }, tenantId: tenant, routeCode: 'SCADA_HOURLY_ANALYSIS', body, param })
const good = (over: Record<string, unknown> = {}) => ({ label: 'Toplam', unit: 'kWh', catalogId: CAT, seriesKey: 'TOTAL', expression: `A_COUNTER + C_INDEX + ${SECRET} - ${SECRET}`, inputSeriesKeys: ['A_COUNTER', 'C_INDEX'], ...over })
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: ScadaApiError) => e.code)
const analysisBody = (ids: string[], keys = ['A_COUNTER']) => ({ sourceCatalogIds: [CAT], seriesKeys: keys, virtualColumnIds: ids, startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T02:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE })

describe('development-only: nothing exists outside the four gates', () => {
  it('the controller and the store exist ONLY with development + fixture + bridge + valid zone', () => {
    expect(scadaApiControllers(ALL_ON)).toEqual([ScadaAnalysisController, ScadaVirtualColumnController, ScadaPresetController])
    expect(scadaApiProviders(ALL_ON).map(p => (p as { provide: unknown }).provide)).toContain(SCADA_VIRTUAL_COLUMN_STORE)
    for (const over of [{ NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { REPORTING_DEV_FIXTURES: 'false' }, { [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: 'false' }, { [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: undefined }, { [DEV_FIXTURE_ZONE_ENV]: undefined }, { [DEV_FIXTURE_ZONE_ENV]: 'Not/AZone' }]) {
      const env = { ...ALL_ON, ...over } as NodeJS.ProcessEnv
      expect(scadaApiControllers(env)).toEqual([ScadaAnalysisController]) // the routes do not exist ⇒ 404
      expect(scadaApiProviders(env).map(p => (p as { provide: unknown }).provide)).not.toContain(SCADA_VIRTUAL_COLUMN_STORE)
    }
  })

  it('the real @Module metadata lists the virtual column controller only in dev mode', () => {
    const saved = { ...process.env }
    const load = (env: Record<string, string | undefined>) => {
      process.env = { ...saved, ...env }
      jest.resetModules()
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../../../reporting.module') as { ReportingModule: new () => unknown }
      return {
        controllers: (Reflect.getMetadata('controllers', mod.ReportingModule) as Array<{ name: string }>).map(c => c.name),
        providers: (Reflect.getMetadata('providers', mod.ReportingModule) as Array<{ provide?: unknown }>).map(p => p.provide),
      }
    }
    try {
      const prod = load({ NODE_ENV: 'production', REPORTING_DEV_FIXTURES: 'true', [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: 'true' })
      expect(prod.controllers).toEqual(['ReportingController', 'ScadaAnalysisController'])
      expect(prod.providers).not.toContain(SCADA_VIRTUAL_COLUMN_STORE)
      const dev = load(ALL_ON as Record<string, string | undefined>)
      expect(dev.controllers).toEqual(['ReportingController', 'ScadaAnalysisController', 'ScadaVirtualColumnController', 'ScadaPresetController'])
      expect(dev.providers).toContain(SCADA_VIRTUAL_COLUMN_STORE)
    } finally {
      process.env = saved
      jest.resetModules()
    }
  })

  it('the store persists nothing: no db / fs / network / cache import, and a new instance (an API restart) is empty', async () => {
    const src = readFileSync(path.resolve(__dirname, '../dev-virtual-column.store.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(src).not.toMatch(/drizzle|from\s+['"](fs|node:fs|pg|redis|http|https|net)['"]|writeFile|localStorage|console\./)
    const h = harness()
    await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good()))
    expect((await h.store.listDefinitions('root-A')).length).toBe(1)
    expect(await new DevVirtualColumnStore().listDefinitions('root-A')).toEqual([])
    const other = harness(csv(), { store: new DevVirtualColumnStore() })
    expect((await other.svc.listVirtualColumns(call('a-admin', 'a-t1'))).virtualColumns).toEqual([])
  })
})

describe('creating a virtual column', () => {
  it('a valid definition becomes a DRAFT version 1 with a server-generated id; nothing of the expression or creator is returned; one audit record', async () => {
    const h = harness()
    const r = await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good()))
    expect(r).toMatchObject({ virtualColumnId: 'vc-1', catalogId: CAT, seriesKey: 'TOTAL', label: 'Toplam', unit: 'kWh', valueType: 'INDEX', inputSeriesKeys: ['A_COUNTER', 'C_INDEX'], version: 1, status: 'DRAFT', activeVersion: null, versions: [{ version: 1, status: 'DRAFT' }] })
    expect(JSON.stringify(r)).not.toMatch(new RegExp(`${SECRET}|expression|createdBy|A_COUNTER \\+`))
    expect(h.audits.map(a => [a.actionCode, a.reasonCode, a.entityId])).toEqual([['SCADA_QUERY_SUCCEEDED', 'OK', CAT]])
    const stored = (await h.store.listDefinitions('root-A'))[0]!
    expect(stored).toMatchObject({ status: 'DRAFT', version: 1, effectiveFrom: null, effectiveTo: null, createdBy: 'a-admin', customerRootTenantId: 'root-A' })
  })

  it('the same series again is a NEW VERSION of the same column (monotonic), never a second column or a rewrite', async () => {
    const h = harness()
    await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good()))
    const r = await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good({ expression: 'A_COUNTER - C_INDEX' })))
    expect(r).toMatchObject({ virtualColumnId: 'vc-1', version: 2 })
    expect(r.versions).toEqual([{ version: 1, status: 'DRAFT' }, { version: 2, status: 'DRAFT' }])
    const other = await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good({ seriesKey: 'OTHER' })))
    expect(other.virtualColumnId).toBe('vc-2')
  })

  it('the store refuses a repeated or skipped version (monotonic versions)', async () => {
    const store = new DevVirtualColumnStore()
    const def = { virtualColumnId: 'vc-9', catalogId: CAT, customerRootTenantId: 'root-A', seriesKey: 'X', label: 'X', unit: 'kWh', expression: 'A', inputSeriesKeys: ['A'], valueType: 'INDEX' as const, version: 1, effectiveFrom: null, effectiveTo: null, status: 'DRAFT' as const, createdBy: 'u', updatedAt: '2026-01-01T00:00:00.000Z' }
    store.append(def)
    expect(() => store.append(def)).toThrow('VERSION_CONFLICT')
    expect(() => store.append({ ...def, version: 3 })).toThrow('VERSION_CONFLICT')
    expect(() => store.append({ ...def, version: 2, seriesKey: 'OTHER' })).toThrow('IDENTITY_CONFLICT')
    store.append({ ...def, version: 2 })
    expect((await store.listDefinitions('root-A')).map(d => d.version)).toEqual([1, 2])
  })

  it('the store hands out copies: mutating what it returned never changes it', async () => {
    const h = harness()
    await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good()))
    const copy = (await h.store.listDefinitions('root-A')) as unknown as Array<{ status: string; expression: string }>
    copy[0]!.status = 'ACTIVE'
    copy[0]!.expression = 'HACKED'
    const again = (await h.store.listDefinitions('root-A'))[0]!
    expect(again.status).toBe('DRAFT')
    expect(again.expression).not.toBe('HACKED')
  })

  it.each([
    ['a syntax error', 'A_COUNTER +'],
    ['an empty expression', '   '],
    ['SQL', 'SELECT 1 FROM x'],
    ['a JS call', 'process.exit(1)'],
    ['eval', 'eval(A_COUNTER)'],
    ['Function', 'Function("return 1")()'],
    ['a property access', 'A_COUNTER.constructor'],
    ['a template / string', '"abc" + A_COUNTER'],
    ['an assignment', 'A_COUNTER = C_INDEX'],
    ['a comment', 'A_COUNTER /* x */ + C_INDEX'],
    ['a semicolon', 'A_COUNTER; C_INDEX'],
    ['an arrow function', '(x) => x'],
    ['an unknown series', 'A_COUNTER + NOT_DECLARED'],
    ['a recursive reference (the column itself)', 'TOTAL + A_COUNTER'],
    ['a non-allowlisted function', 'SQRT(A_COUNTER)'],
    ['a wrong ROUND precision', 'ROUND(A_COUNTER, 99)'],
    ['a non-constant ROUND precision', 'ROUND(A_COUNTER, C_INDEX)'],
    ['an over-deep expression', `${'('.repeat(40)}A_COUNTER${')'.repeat(40)}`],
    ['too many operators', Array.from({ length: 60 }, () => 'A_COUNTER').join(' + ')],
  ])('%s is refused with a static code and NOTHING is stored', async (_n, expression) => {
    const h = harness()
    const e = (await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good({ expression, inputSeriesKeys: ['A_COUNTER', 'C_INDEX'] }))).catch((x: ScadaApiError) => x)) as ScadaApiError
    expect(e).toBeInstanceOf(ScadaApiError)
    expect(['SCADA_VIRTUAL_COLUMN_INVALID', 'SCADA_REQUEST_INVALID', 'SCADA_LIMIT_EXCEEDED']).toContain(e.code)
    expect(e.message).toBe(e.code)
    expect(await h.store.listDefinitions('root-A')).toEqual([])
    expect(JSON.stringify({ m: e.message, a: h.audits })).not.toContain(expression.trim() === '' ? '\u0000' : expression)
  })

  it('an expression over the external length limit is refused before parsing', async () => {
    const h = harness()
    expect(await codeOf(h.svc.createVirtualColumn(call('a-admin', 'a-t1', good({ expression: `A_COUNTER + ${'1 + '.repeat(100)}1` }))))).toBe('SCADA_LIMIT_EXCEEDED')
    expect(await h.store.listDefinitions('root-A')).toEqual([])
  })

  it('unknown / UNVERIFIED / shadowing series: inputs must be verified series of the chosen source; the key may not be a physical column', async () => {
    const h = harness()
    for (const body of [
      good({ inputSeriesKeys: ['A_COUNTER', 'B_OTHER'], expression: 'A_COUNTER + B_OTHER' }), // unverified input
      good({ inputSeriesKeys: ['A_COUNTER', 'GHOST'], expression: 'A_COUNTER + GHOST' }), // unknown input
      good({ seriesKey: 'A_COUNTER' }), // shadows a physical series
      good({ seriesKey: 'B_OTHER' }), // shadows an unverified physical column
      good({ catalogId: '00000000-0000-4000-8000-0000000000aa' }), // unknown source
    ]) expect(await codeOf(h.svc.createVirtualColumn(call('a-admin', 'a-t1', body)))).not.toBe('OK')
    expect(await h.store.listDefinitions('root-A')).toEqual([])
  })

  it('inputs of mixed value types (INDEX + REAL_VALUE) are refused; a REAL_VALUE-only column takes the REAL_VALUE type', async () => {
    const h = harness()
    expect(await codeOf(h.svc.createVirtualColumn(call('a-admin', 'a-t1', good({ inputSeriesKeys: ['A_COUNTER', 'D_REAL'], expression: 'A_COUNTER + D_REAL' }))))).toBe('SCADA_MIXED_VALUE_TYPES')
    const ok = await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good({ seriesKey: 'REAL_ONLY', inputSeriesKeys: ['D_REAL'], expression: 'D_REAL * 2' })))
    expect(ok.valueType).toBe('REAL_VALUE')
  })

  it.each(['tenantId', 'customerRootTenantId', 'role', 'permissions', 'sql', 'schema', 'database', 'table', 'connectionString', 'version', 'status', 'createdBy', 'expressionAst', 'virtualColumnId', 'valueType', 'effectiveFrom', 'name'])('the request field %s is refused (server generated / derived)', async key => {
    const h = harness()
    expect(await codeOf(h.svc.createVirtualColumn(call('a-admin', 'a-t1', good({ [key]: 'x' }))))).toBe('SCADA_REQUEST_UNKNOWN_FIELD')
    expect(await h.store.listDefinitions('root-A')).toEqual([])
  })

  it('`name` is not a contract field: it is refused whether or not `label` is present (only `label` is used)', async () => {
    const h = harness()
    const { label, ...rest } = good()
    expect(await codeOf(h.svc.createVirtualColumn(call('a-admin', 'a-t1', { ...rest, name: label })))).toBe('SCADA_REQUEST_UNKNOWN_FIELD')
    expect(await codeOf(h.svc.createVirtualColumn(call('a-admin', 'a-t1', good({ name: 'Toplam' }))))).toBe('SCADA_REQUEST_UNKNOWN_FIELD')
    expect(await h.store.listDefinitions('root-A')).toEqual([])
  })

  it('malformed fields are refused: label / unit / catalog id / series key / inputs', async () => {
    const h = harness()
    for (const over of [{ label: '' }, { unit: '' }, { unit: 'x'.repeat(33) }, { catalogId: 'not-a-uuid' }, { seriesKey: '1BAD' }, { seriesKey: 'a b' }, { inputSeriesKeys: [] }, { inputSeriesKeys: ['A_COUNTER', 'A_COUNTER'] }, { inputSeriesKeys: 'A_COUNTER' }, { label: 'Server=db;Password=x' }]) {
      expect(await codeOf(h.svc.createVirtualColumn(call('a-admin', 'a-t1', good(over))))).toBe('SCADA_REQUEST_INVALID')
    }
    expect(await codeOf(h.svc.createVirtualColumn(call('a-admin', 'a-t1', 'x')))).toBe('SCADA_REQUEST_INVALID')
  })
})

describe('who may manage', () => {
  it('a normal user may LIST (no expression) but never create / activate / disable; an active system admin and the root TENANT_ADMIN may', async () => {
    const h = harness()
    const created = await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good()))
    // normal user
    expect(await codeOf(h.svc.createVirtualColumn(call('a-user', 'a-t1', good({ seriesKey: 'X' }))))).toBe('SCADA_SCOPE_DENIED')
    expect(await codeOf(h.svc.activateVirtualColumn(call('a-user', 'a-t1', undefined, created.virtualColumnId)))).toBe('SCADA_SCOPE_DENIED')
    expect(await codeOf(h.svc.disableVirtualColumn(call('a-user', 'a-t1', undefined, created.virtualColumnId)))).toBe('SCADA_SCOPE_DENIED')
    const listed = await h.svc.listVirtualColumns(call('a-user', 'a-t1'))
    expect(listed.canManage).toBe(false)
    expect(listed.virtualColumns.map(v => v.virtualColumnId)).toEqual(['vc-1'])
    expect((await h.store.listDefinitions('root-A')).map(d => d.status)).toEqual(['DRAFT'])
    expect(h.audits.filter(a => a.actionCode === 'SCADA_QUERY_DENIED')).toHaveLength(3)
    // admin / tenant admin (the composed authorization port says yes)
    expect((await h.svc.listVirtualColumns(call('a-admin', 'a-t1'))).canManage).toBe(true)
    expect((await h.svc.activateVirtualColumn(call('a-admin', 'a-t1', undefined, 'vc-1'))).status).toBe('ACTIVE')
  })

  it('without a composed authorization port nobody may write (fail-closed); an inactive caller tenant never lists', async () => {
    const h = harness()
    const svc2 = new ScadaAnalysisApiService({ ...(h.svc as unknown as { deps: ConstructorParameters<typeof ScadaAnalysisApiService>[0] }).deps, presetAuthorization: undefined })
    expect(await codeOf(svc2.createVirtualColumn(call('a-admin', 'a-t1', good())))).toBe('SCADA_SCOPE_DENIED')
    const svc3 = new ScadaAnalysisApiService({ ...(h.svc as unknown as { deps: ConstructorParameters<typeof ScadaAnalysisApiService>[0] }).deps, callers: { describe: async (_u, t) => ({ tenant: { ...tenantOf(t), status: 'SUSPENDED' as const }, userActive: true }) } })
    expect(await codeOf(svc3.listVirtualColumns(call('a-admin', 'a-t1')))).toBe('SCADA_SCOPE_DENIED')
  })

  it('no store / provider ⇒ SCADA_SOURCE_NOT_CONFIGURED (production shape); missing limits ⇒ SCADA_LIMITS_NOT_CONFIGURED', async () => {
    const h = harness()
    const base = (h.svc as unknown as { deps: ConstructorParameters<typeof ScadaAnalysisApiService>[0] }).deps
    expect(await codeOf(new ScadaAnalysisApiService({ ...base, virtualColumnManager: undefined }).listVirtualColumns(call('a-admin', 'a-t1')))).toBe('SCADA_SOURCE_NOT_CONFIGURED')
    expect(await codeOf(new ScadaAnalysisApiService({ ...base, limits: undefined }).createVirtualColumn(call('a-admin', 'a-t1', good())))).toBe('SCADA_LIMITS_NOT_CONFIGURED')
  })
})

describe('tenant isolation', () => {
  it('another root sees nothing, cannot activate / disable, and cannot USE a column of the first root', async () => {
    const h = harness()
    await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good()))
    await h.svc.activateVirtualColumn(call('a-admin', 'a-t1', undefined, 'vc-1'))
    expect((await h.svc.listVirtualColumns(call('b-admin', 'b-t1'))).virtualColumns).toEqual([])
    expect(await codeOf(h.svc.activateVirtualColumn(call('b-admin', 'b-t1', undefined, 'vc-1')))).toBe('SCADA_NOT_FOUND')
    expect(await codeOf(h.svc.disableVirtualColumn(call('b-admin', 'b-t1', undefined, 'vc-1')))).toBe('SCADA_NOT_FOUND')
    expect(await codeOf(h.svc.runAnalysis(call('b-admin', 'b-t1', analysisBody(['vc-1']))))).toBe('SCADA_VIRTUAL_COLUMN_INVALID')
    expect((await h.store.listDefinitions('root-A'))[0]!.status).toBe('ACTIVE')
    // root B creates the same series key: a separate column of its own
    const b = await h.svc.createVirtualColumn(call('b-admin', 'b-t1', good()))
    expect(b.virtualColumnId).not.toBe('vc-1')
    expect((await h.svc.listVirtualColumns(call('a-admin', 'a-t1'))).virtualColumns.map(v => v.virtualColumnId)).toEqual(['vc-1'])
  })
})

describe('tenant isolation holds even if a store leaks rows (service-level defence in depth)', () => {
  class LeakyStore extends DevVirtualColumnStore {
    override async listDefinitions() {
      return (await super.listDefinitions('root-A')).concat(await super.listDefinitions('root-B'))
    }
  }
  it('rows of another root are neither listed, nor found for activate / disable', async () => {
    const store = new LeakyStore()
    const h = harness(csv(), { store })
    await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good()))
    expect((await h.svc.listVirtualColumns(call('b-admin', 'b-t1'))).virtualColumns).toEqual([])
    expect(await codeOf(h.svc.activateVirtualColumn(call('b-admin', 'b-t1', undefined, 'vc-1')))).toBe('SCADA_NOT_FOUND')
    expect(await codeOf(h.svc.disableVirtualColumn(call('b-admin', 'b-t1', undefined, 'vc-1')))).toBe('SCADA_NOT_FOUND')
    expect((await store.listDefinitions()).find(d => d.virtualColumnId === 'vc-1')!.status).toBe('DRAFT')
  })
})

describe('status transitions', () => {
  it('DRAFT → ACTIVE → DISABLED → ACTIVE; activating a new version disables the previous ACTIVE one; nothing is deleted', async () => {
    const h = harness()
    const id = (await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good()))).virtualColumnId
    expect((await h.svc.activateVirtualColumn(call('a-admin', 'a-t1', undefined, id))).status).toBe('ACTIVE')
    const v2 = await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good({ expression: 'A_COUNTER * 2' })))
    expect(v2.versions).toEqual([{ version: 1, status: 'ACTIVE' }, { version: 2, status: 'DRAFT' }])
    const after = await h.svc.activateVirtualColumn(call('a-admin', 'a-t1', undefined, id))
    expect(after.versions).toEqual([{ version: 1, status: 'DISABLED' }, { version: 2, status: 'ACTIVE' }])
    expect(after.activeVersion).toBe(2)
    const off = await h.svc.disableVirtualColumn(call('a-admin', 'a-t1', undefined, id))
    expect(off.status).toBe('DISABLED')
    expect(off.activeVersion).toBeNull()
    expect((await h.svc.activateVirtualColumn(call('a-admin', 'a-t1', undefined, id))).status).toBe('ACTIVE')
    expect((await h.store.listDefinitions('root-A')).length).toBe(2)
    expect(await codeOf(h.svc.activateVirtualColumn(call('a-admin', 'a-t1', undefined, 'no-such')))).toBe('SCADA_NOT_FOUND')
    expect(await codeOf(h.svc.activateVirtualColumn(call('a-admin', 'a-t1', undefined, 'bad id')))).toBe('SCADA_REQUEST_INVALID')
  })

  it('an activation that no longer fits the catalog BLOCKS the column (never ACTIVE)', async () => {
    const h = harness()
    const id = (await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good()))).virtualColumnId
    // the source's manifest changes: A_COUNTER is no longer verified
    const base = (h.svc as unknown as { deps: ConstructorParameters<typeof ScadaAnalysisApiService>[0] }).deps
    const changed = createDevCsvFixture({ provider: provider(csv(), [col('C_INDEX', 'INDEX')]), tenants: { get: async i => tenantOf(i) }, env: ALL_ON })
    const svc2 = new ScadaAnalysisApiService({ ...base, sources: changed.catalog })
    expect(await codeOf(svc2.activateVirtualColumn(call('a-admin', 'a-t1', undefined, id)))).toBe('SCADA_VIRTUAL_COLUMN_INVALID')
    expect((await h.store.listDefinitions('root-A'))[0]!.status).toBe('BLOCKED')
    expect((await h.svc.listVirtualColumns(call('a-admin', 'a-t1'))).virtualColumns[0]!.status).toBe('BLOCKED')
  })
})

describe('analysis with a virtual column', () => {
  async function ready(text = csv(), expression = 'A_COUNTER + C_INDEX', columns?: unknown[]) {
    const h = harness(text, { columns })
    const id = (await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good({ expression })))).virtualColumnId
    await h.svc.activateVirtualColumn(call('a-admin', 'a-t1', undefined, id))
    return { h, id }
  }

  it('the physical series and the virtual series come out TOGETHER; the virtual one is marked (id + resolved version), its values come from the CSV, the expression never appears', async () => {
    const { h, id } = await ready()
    const r = await h.svc.runAnalysis(call('a-user', 'a-t1', analysisBody([id])))
    expect(r.series.map(s => s.seriesKey)).toEqual(['A_COUNTER', 'TOTAL'])
    const [physical, virtual] = r.series
    expect(physical!.virtual).toBeNull()
    expect(virtual!.virtual).toEqual({ virtualColumnId: id, versions: [1], sourceSeriesKeys: ['A_COUNTER', 'C_INDEX'] })
    expect(virtual).toMatchObject({ label: 'Toplam', unit: 'kWh', valueType: 'INDEX' })
    expect(physical!.points.map(p => p.value)).toEqual([5, 5, 5, 5, 5])
    expect(virtual!.points.map(p => p.value)).toEqual([7, 7, 7, 7, 7]) // 5 + 2
    expect(JSON.stringify(r)).not.toMatch(new RegExp(`${SECRET}|expression|A_COUNTER \\+ C_INDEX`))
    expect(h.audits.every(a => !JSON.stringify(a).match(/A_COUNTER \+|424242/))).toBe(true)
  })

  it('a null input is never 0 in the result: the virtual value is null, incomplete, with the source quality flags kept', async () => {
    const { h, id } = await ready(csv(10, { missingA: 3 }))
    const virtual = (await h.svc.runAnalysis(call('a-user', 'a-t1', analysisBody([id]))))!.series.find(s => s.seriesKey === 'TOTAL')!
    const nulls = virtual.points.filter(p => p.value === null)
    expect(nulls.length).toBeGreaterThan(0)
    expect(nulls.every(p => !p.isComplete && p.qualityFlags.some(f => f !== 'VALID'))).toBe(true)
    expect(virtual.points.some(p => p.value === 0)).toBe(false)
  })

  it('a real 0 stays a valid value (0 + 0 = 0, VALID)', async () => {
    const constant = [HEADER, ...Array.from({ length: 10 }, (_, i) => `${i + 1};1.02.2026;${String(i).padStart(2, '0')}:00:00;100;300;20;0`)].join('\n')
    const { h, id } = await ready(constant)
    const virtual = (await h.svc.runAnalysis(call('a-user', 'a-t1', analysisBody([id]))))!.series.find(s => s.seriesKey === 'TOTAL')!
    expect(virtual.points.map(p => p.value)).toEqual([0, 0, 0, 0, 0])
    expect(virtual.points.every(p => p.classification === 'VALID' && p.qualityFlags.includes('VALID'))).toBe(true)
    expect(virtual.statistics).toMatchObject({ sum: 0, min: 0, max: 0 })
  })

  it('division by zero, overflow and NaN never become a number: null + a static quality flag', async () => {
    const div = await ready(csv(), 'A_COUNTER / (C_INDEX - C_INDEX)')
    const dv = (await div.h.svc.runAnalysis(call('a-user', 'a-t1', analysisBody([div.id])))).series.find(s => s.seriesKey === 'TOTAL')!
    expect(dv.points.every(p => p.value === null && p.qualityFlags.includes('VIRTUAL_COLUMN_DIVISION_INVALID'))).toBe(true)
    const big = await ready(csv(), 'A_COUNTER * 1000000000000000000000')
    const bv = (await big.h.svc.runAnalysis(call('a-user', 'a-t1', analysisBody([big.id])))).series.find(s => s.seriesKey === 'TOTAL')!
    expect(bv.points.every(p => p.value === null && p.qualityFlags.includes('INVALID_NUMERIC_VALUE'))).toBe(true)
    const nan = await ready(csv(), '(A_COUNTER - A_COUNTER) / (C_INDEX - C_INDEX)')
    const nv = (await nan.h.svc.runAnalysis(call('a-user', 'a-t1', analysisBody([nan.id])))).series.find(s => s.seriesKey === 'TOTAL')!
    expect(nv.points.every(p => p.value === null)).toBe(true)
    expect(JSON.stringify([dv, bv, nv])).not.toMatch(/NaN|Infinity/)
  })

  it('a DRAFT / DISABLED column is never computed; the response is the same for a normal user', async () => {
    const h = harness()
    const id = (await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good()))).virtualColumnId
    expect(await codeOf(h.svc.runAnalysis(call('a-user', 'a-t1', analysisBody([id]))))).toBe('SCADA_VIRTUAL_COLUMN_INVALID') // DRAFT
    await h.svc.activateVirtualColumn(call('a-admin', 'a-t1', undefined, id))
    expect(await codeOf(h.svc.runAnalysis(call('a-user', 'a-t1', analysisBody([id]))))).toBe('OK')
    await h.svc.disableVirtualColumn(call('a-admin', 'a-t1', undefined, id))
    expect(await codeOf(h.svc.runAnalysis(call('a-user', 'a-t1', analysisBody([id]))))).toBe('SCADA_VIRTUAL_COLUMN_INVALID')
  })

  it('is deterministic, and the raw expression / error text never reaches the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m => jest.spyOn(console, m).mockImplementation(() => undefined))
    try {
      const { h, id } = await ready()
      const a = await h.svc.runAnalysis(call('a-user', 'a-t1', analysisBody([id])))
      const b = await h.svc.runAnalysis(call('a-user', 'a-t1', analysisBody([id])))
      expect(JSON.stringify(b)).toBe(JSON.stringify(a))
      await h.svc.createVirtualColumn(call('a-admin', 'a-t1', good({ expression: `SELECT ${SECRET}` }))).catch(() => undefined)
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    } finally {
      spies.forEach(s => s.mockRestore())
    }
  })
})

const REPO = path.resolve(__dirname, '../../../../../../..')
const HAS_REAL = existsSync(path.join(REPO, 'veriler/manifest/scada-fixtures.manifest.json')) && existsSync(path.join(REPO, 'veriler/raw/gt_endeksler.csv'))
;(HAS_REAL ? describe : describe.skip)('a virtual column over the REAL CSV snapshot', () => {
  it('sums two verified real series; the real values reach the response next to the physical series', async () => {
    const audits: ScadaQueryAuditEntry[] = []
    const audit = { record: async (e: ScadaQueryAuditEntry) => void audits.push(e) }
    const clock = { nowMs: () => Date.parse('2026-06-01T00:00:00.000Z'), correlationId: () => 'srv' }
    const store = new DevVirtualColumnStore()
    const prov = new ScadaCsvFixtureProvider(REPO)
    const fixture = createDevCsvFixture({ provider: prov, tenants: { get: async id => tenantOf(id) }, env: ALL_ON })
    const svc = new ScadaAnalysisApiService({ scopes: { resolve: async t => ({ tenantId: t, customerRootTenantId: rootOf(t), dataScopeTenantIds: [t] }) }, callers: { describe: async (_u, t) => ({ tenant: tenantOf(t), userActive: true }) }, artifacts: { assertExists: async () => undefined }, clock, audit, presetAuthorization: { canSharePreset: () => true }, sources: fixture.catalog, query: fixture.queryService(audit, clock), virtualColumns: store, virtualColumnManager: store, limits: { get: () => DEV_FIXTURE_API_LIMITS } })
    const gt = fixtureCatalogId('gt_endeksler')
    const created = await svc.createVirtualColumn({ actor: { id: 'a-admin' }, tenantId: 'a-t1', routeCode: 'SCADA_HOURLY_ANALYSIS', body: { label: 'GT Buhar Toplam', unit: 'ton', catalogId: gt, seriesKey: 'GT_BUHAR_TOPLAM', expression: 'GT2_BUHAR_URETIM_TON + GT3_BUHAR_URETIM_TON', inputSeriesKeys: ['GT2_BUHAR_URETIM_TON', 'GT3_BUHAR_URETIM_TON'] } })
    await svc.activateVirtualColumn({ actor: { id: 'a-admin' }, tenantId: 'a-t1', routeCode: 'SCADA_HOURLY_ANALYSIS', param: created.virtualColumnId })
    const r = await svc.runAnalysis({ actor: { id: 'a-user' }, tenantId: 'a-t1', routeCode: 'SCADA_HOURLY_ANALYSIS', body: { sourceCatalogIds: [gt], seriesKeys: ['GT3_BUHAR_URETIM_TON'], virtualColumnIds: [created.virtualColumnId], startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T03:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE } })
    expect(r.series.map(s => s.seriesKey)).toEqual(['GT3_BUHAR_URETIM_TON', 'GT_BUHAR_TOPLAM'])
    const rec = (k: string) => prov.loadSourceRecords('gt_endeksler', 'a-t1', ALL_ON).filter(x => x.seriesKey === k).slice(0, 8).map(x => x.rawValue!)
    const g2 = rec('GT2_BUHAR_URETIM_TON')
    const g3 = rec('GT3_BUHAR_URETIM_TON')
    let compared = 0
    r.series[1]!.points.forEach((p, i) => {
      const d2 = g2[i + 1]! - g2[i]!
      const d3 = g3[i + 1]! - g3[i]!
      if (d2 >= 0 && d3 >= 0 && p.value !== null) { expect(p.value).toBeCloseTo(d2 + d3, 3); compared += 1 }
    })
    expect(compared).toBeGreaterThan(0)
    expect(r.series[1]!.virtual?.virtualColumnId).toBe(created.virtualColumnId)
    expect(JSON.stringify(r)).not.toMatch(/expression|GT2_BUHAR_URETIM_TON \+/)
  })
})
