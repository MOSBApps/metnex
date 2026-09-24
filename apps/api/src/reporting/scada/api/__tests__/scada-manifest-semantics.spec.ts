import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildMockDb, chain } from '../../../../db/test-helpers/drizzle-mock'
import type { ScadaQueryAuditEntry } from '../../adapter/scada-readonly.port'
import type { TenantRecord } from '../../catalog/tenant-guards'
import { ScadaCsvFixtureProvider } from '../../fixture/scada-csv-fixture.provider'
import type { ScadaFixtureColumnDeclaration, ScadaFixturesManifest } from '../../fixture/scada-fixture.types'
import { DevFixtureScopeResolver } from '../dev-fixture-scope-resolver'
import { DEV_FIXTURE_API_LIMITS, DEV_FIXTURE_ZONE_ENV, createDevCsvFixture, fixtureCatalogId } from '../dev-csv-scada-fixture'
import { ScadaAnalysisApiService } from '../scada-analysis-api.service'

/**
 * TASK-027.73-R2 — the checked-in manifest's column semantics. The real-file suite reads `veriler/` (git-ignored raw CSVs): it is
 * skipped when the snapshot is absent. The rule tests run on a TEMPORARY manifest / CSV written to the OS temp dir.
 */
const REPO = path.resolve(__dirname, '../../../../../../..')
const MANIFEST_PATH = path.join(REPO, 'veriler/manifest/scada-fixtures.manifest.json')
const HAS_REAL = existsSync(MANIFEST_PATH) && ['endeksler', 'gt_endeksler', 'komur_endeksler', 'sg_endeksler'].every(k => existsSync(path.join(REPO, `veriler/raw/${k}.csv`)))
const real = HAS_REAL ? describe : describe.skip

const ZONE = 'Europe/Istanbul'
const DEV = { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true', [DEV_FIXTURE_ZONE_ENV]: ZONE } as NodeJS.ProcessEnv
const TENANT = 'tenant-1'
const tenant = (): TenantRecord => ({ id: TENANT, type: 'STANDARD', status: 'ACTIVE', slug: 'tenant-one' })
const EXPECTED_COLUMNS: Record<string, number> = { endeksler: 33, gt_endeksler: 24, komur_endeksler: 15, sg_endeksler: 19 }

const readManifest = (): ScadaFixturesManifest => JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as ScadaFixturesManifest
const headerOf = (file: string): string[] => readFileSync(path.join(REPO, file), 'utf8').split(/\r?\n/)[0]!.split(';').map(h => h.trim())

const dirs: string[] = []
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))

function tmpProvider(csv: string, columns: unknown[] | undefined, structural = { id: 'ID', date: 'KAYIT_TARIHI', time: 'KAYIT_SAATI' }) {
  const root = mkdtempSync(path.join(tmpdir(), 'metnex-manifest-sem-'))
  dirs.push(root)
  mkdirSync(path.join(root, 'veriler/manifest'), { recursive: true })
  mkdirSync(path.join(root, 'veriler/raw'), { recursive: true })
  writeFileSync(path.join(root, 'veriler/raw/s.csv'), csv)
  const entry = { catalogId: 'scada-cat-s', sourceKey: 's', logicalSourceName: 'Kaynak s', file: 'veriler/raw/s.csv', table: 'phys_s', idColumn: structural.id, dateColumn: structural.date, timeColumn: structural.time, timezone: 'UNVERIFIED', status: 'DEVELOPMENT_FIXTURE', mappingStatus: 'UNVERIFIED', sha256: createHash('sha256').update(csv, 'utf8').digest('hex'), rowCount: 0, columnCount: csv.split('\n')[0]!.split(';').length, developmentOnly: true, ...(columns ? { columns } : {}) }
  writeFileSync(path.join(root, 'veriler/manifest/scada-fixtures.manifest.json'), JSON.stringify({ version: '1', generatedAt: 'x', description: 't', developmentOnly: true, sources: [entry] }))
  return new ScadaCsvFixtureProvider(root)
}

function make(provider: ScadaCsvFixtureProvider, env: NodeJS.ProcessEnv = DEV) {
  const audits: ScadaQueryAuditEntry[] = []
  const audit = { record: async (e: ScadaQueryAuditEntry) => void audits.push(e) }
  const fixture = createDevCsvFixture({ provider, tenants: { get: async () => tenant() }, env })
  const clock = { nowMs: () => Date.parse('2026-06-01T00:00:00.000Z'), correlationId: () => 'srv' }
  const svc = new ScadaAnalysisApiService({
    scopes: { resolve: async () => ({ tenantId: TENANT, customerRootTenantId: 'root-1', dataScopeTenantIds: [TENANT] }) },
    callers: { describe: async () => ({ tenant: tenant(), userActive: true }) },
    artifacts: { assertExists: async () => undefined },
    clock, audit, sources: fixture.catalog, query: fixture.queryService(audit, clock), limits: { get: () => DEV_FIXTURE_API_LIMITS },
  })
  return { svc, audits }
}
const call = (body?: unknown) => ({ actor: { id: 'u-1' }, tenantId: TENANT, routeCode: 'SCADA_HOURLY_ANALYSIS', body })
const CAT = fixtureCatalogId('s')
const HEADER = 'ID;KAYIT_TARIHI;KAYIT_SAATI;A_COUNTER;B_VALUE;C_INDEX;D_KWH'
const csv = (rows = 8, missingAt = -1, missingB = -1) => [HEADER, ...Array.from({ length: rows }, (_, i) => `${i + 1};1.02.2026;${String(i).padStart(2, '0')}:00:00;${i === missingAt ? '' : 100 + 5 * i};${i === missingB ? '' : 20 + (i % 3)};${300 + i};${i}`)].join('\n')
const decl = (over: Partial<ScadaFixtureColumnDeclaration> & { sourceColumn: string }): ScadaFixtureColumnDeclaration => ({ label: over.sourceColumn, verified: true, valueType: 'INDEX', evidenceRefs: ['TEST:evidence'], ...over })
const body = (seriesKeys: string[], over: Record<string, unknown> = {}) => ({ sourceCatalogIds: [CAT], seriesKeys, startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T02:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE, ...over })
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string }) => e.code ?? 'ERR')

real('the checked-in manifest and the four real CSV snapshots (evidence inventory)', () => {
  const manifest = readManifest()

  it('header inventory: column count and row count agree with the manifest, id / date / time columns exist', () => {
    for (const s of manifest.sources) {
      const header = headerOf(s.file)
      expect(header).toHaveLength(EXPECTED_COLUMNS[s.sourceKey]!)
      expect(s.columnCount).toBe(header.length)
      for (const structural of [s.idColumn, s.dateColumn, s.timeColumn]) expect(header).toContain(structural)
      const lines = readFileSync(path.join(REPO, s.file), 'utf8').split(/\r?\n/).filter(l => l.trim())
      expect(lines.length - 1).toBe(s.rowCount)
    }
  })

  it('the CSV files are UNCHANGED: every SHA-256 equals the manifest (the provider re-verifies it on every read)', () => {
    for (const s of manifest.sources) expect(createHash('sha256').update(readFileSync(path.join(REPO, s.file), 'utf8'), 'utf8').digest('hex')).toBe(s.sha256)
    const provider = new ScadaCsvFixtureProvider(REPO)
    for (const s of manifest.sources) expect(provider.loadSourceRecords(s.sourceKey, TENANT, DEV).length).toBeGreaterThan(0)
  })

  it('every declared column exists in the real header, is declared once, and is never the id / date / time column', () => {
    for (const s of manifest.sources) {
      const header = headerOf(s.file)
      const names = (s.columns ?? []).map(c => c.sourceColumn)
      expect(new Set(names).size).toBe(names.length)
      for (const n of names) {
        expect(header).toContain(n)
        expect([s.idColumn, s.dateColumn, s.timeColumn]).not.toContain(n)
      }
      // full coverage: every measurement candidate has an explicit declaration (verified or not)
      expect([...names].sort()).toEqual(header.filter(h => ![s.idColumn, s.dateColumn, s.timeColumn].includes(h)).sort())
    }
  })

  it('a VERIFIED column has a value type INDEX | REAL_VALUE and evidence (BOTC reference + CSV statistics); an unverified one has null type and no unit', () => {
    for (const s of manifest.sources) {
      for (const c of s.columns ?? []) {
        expect(Array.isArray(c.evidenceRefs) && c.evidenceRefs.length > 0).toBe(true)
        if (c.verified) {
          expect(['INDEX', 'REAL_VALUE']).toContain(c.valueType)
          expect(c.evidenceRefs!.some(r => r.startsWith('BOTC:'))).toBe(true)
          expect(c.evidenceRefs!.some(r => r.startsWith('CSV-STAT:'))).toBe(true)
        } else {
          expect(c.valueType).toBeNull()
          expect(c.unit ?? null).toBeNull()
        }
      }
    }
  })

  it('a unit is declared ONLY with a UNIT evidence reference; a verified column without a unit says why (UNIT-NOT-VERIFIED)', () => {
    for (const s of manifest.sources) {
      for (const c of (s.columns ?? []).filter(x => x.verified)) {
        if (c.unit) expect(c.evidenceRefs!.some(r => r.startsWith('UNIT: '))).toBe(true)
        else expect(c.evidenceRefs!.some(r => r.startsWith('UNIT-NOT-VERIFIED'))).toBe(true)
      }
    }
  })

  it('the contradictory electricity units are NOT declared (BOTC labels the delta MWh while the name says KWH)', () => {
    const cols = manifest.sources.flatMap(s => s.columns ?? [])
    for (const name of ['GT1_ELEKTRIK_URETIM_KWH', 'SG50_1_ELEKTRIK_URETIM_KWH', 'Turbin1_Enerji_kWh', 'Turbin2_Enerji_kWh']) expect(cols.find(c => c.sourceColumn === name)!.unit ?? null).toBeNull()
    expect(cols.find(c => c.sourceColumn === 'GT1_DOGALGAZ_TUKETIM_SM3')!.unit).toBe('Sm3')
    expect(cols.find(c => c.sourceColumn === 'KK1_KOMUR_TUK_TON')!.unit).toBe('ton')
    expect(cols.find(c => c.sourceColumn === 'IcIhtiyacTrafo1_kWh')!.unit).toBe('kWh')
  })

  it('every column BOTC does not use as a counter stays UNVERIFIED — e.g. a non-monotonic "total" column and constant-zero columns', () => {
    const cols = manifest.sources.flatMap(s => s.columns ?? [])
    for (const name of ['ToplamElektrikUretim_kWh', 'HamSuKuyu_m3', 'Turbin1_CalismaSaati', 'MSA_ISTASYONU', 'GT1_SICAKSU_URETIM_KWH']) expect(cols.find(c => c.sourceColumn === name)!.verified).toBe(false)
  })

  it('the manifest holds no raw row, credential, connection string or physical database name', () => {
    const text = readFileSync(MANIFEST_PATH, 'utf8')
    expect(text).not.toMatch(/Server=|Password|password|connection|\.dbo\.|MOSEDAS|MOSBIO_|Data Source|Initial Catalog/i)
  })

  it('catalog over the REAL manifest: verified columns are selectable INDEX series, the rest are UNVERIFIED and closed; id / date / time never appear; whitelist only', async () => {
    const { svc } = make(new ScadaCsvFixtureProvider(REPO))
    const r = await svc.getCatalog(call())
    expect(r.sources.map(s => s.catalogId)).toEqual(['endeksler', 'gt_endeksler', 'komur_endeksler', 'sg_endeksler'].map(fixtureCatalogId).sort())
    for (const src of r.sources) {
      const m = manifest.sources.find(x => fixtureCatalogId(x.sourceKey) === src.catalogId)!
      expect(src.selectable).toBe(true)
      const verified = (m.columns ?? []).filter(c => c.verified).map(c => c.sourceColumn).sort()
      expect(src.series.filter(x => x.available).map(x => x.seriesKey).sort()).toEqual(verified)
      expect(src.series.filter(x => x.available).every(x => x.valueType === 'INDEX' && x.verificationStatus === 'VERIFIED')).toBe(true)
      expect(src.series.filter(x => !x.available).every(x => x.valueType === 'UNVERIFIED' && x.unit === '')).toBe(true)
      expect(src.series.map(x => x.seriesKey)).not.toEqual(expect.arrayContaining([m.idColumn]))
      expect(src.series.map(x => x.seriesKey)).not.toContain(m.dateColumn)
      expect(src.series.map(x => x.seriesKey)).not.toContain(m.timeColumn)
    }
    const gt = r.sources.find(s => s.catalogId === fixtureCatalogId('gt_endeksler'))!
    expect(gt.series.find(x => x.seriesKey === 'GT1_ELEKTRIK_URETIM_KWH')).toMatchObject({ unit: '', valueType: 'INDEX', available: true }) // "KWH" in the name is NOT a unit
    expect(gt.series.find(x => x.seriesKey === 'GT1_DOGALGAZ_TUKETIM_SM3')).toMatchObject({ unit: 'Sm3' })
    expect(JSON.stringify(r)).not.toMatch(/veriler|\.csv|evidenceRefs|BOTC:|sha256|MOSEDAS|KAYIT_TARIHI/i)
  })

  it('the real CSV answers a verified column: hourly deltas equal the index differences, nothing else is returned', async () => {
    const { svc, audits } = make(new ScadaCsvFixtureProvider(REPO))
    const r = await svc.runAnalysis(call({ sourceCatalogIds: [fixtureCatalogId('sg_endeksler')], seriesKeys: ['SG50_2_ELEKTRIK_URETIM_KWH'], startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T03:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE }))
    const rec = new ScadaCsvFixtureProvider(REPO).loadSourceRecords('sg_endeksler', TENANT, DEV).filter(x => x.seriesKey === 'SG50_2_ELEKTRIK_URETIM_KWH').slice(0, 8)
    expect(r.series).toHaveLength(1)
    expect(r.series[0]).toMatchObject({ seriesKey: 'SG50_2_ELEKTRIK_URETIM_KWH', unit: '', valueType: 'INDEX' })
    expect(r.series[0]!.points).toHaveLength(6)
    r.series[0]!.points.forEach((p, i) => expect(p.value).toBeCloseTo(rec[i + 1]!.rawValue! - rec[i]!.rawValue!, 3))
    expect(audits).toHaveLength(1)
  })

  it('discovery and analysis over the real CSV never log a raw row or any file content (console stays silent)', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m => jest.spyOn(console, m).mockImplementation(() => undefined))
    try {
      const { svc } = make(new ScadaCsvFixtureProvider(REPO))
      await svc.getCatalog(call())
      await svc.runAnalysis(call({ sourceCatalogIds: [fixtureCatalogId('sg_endeksler')], seriesKeys: ['SG50_2_ELEKTRIK_URETIM_KWH'], startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T03:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE }))
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    } finally {
      spies.forEach(spy => spy.mockRestore())
    }
  })

  it('with the development scope bridge (no registry, tenant records only) the real CSV is served: catalog and analysis', async () => {
    const chainRows = [[{ id: TENANT, type: 'STANDARD', status: 'ACTIVE', customerRootId: 'root-1', canEnterData: true, canAggregateChildren: false }], [{ id: 'root-1', type: 'ROOT', status: 'ACTIVE' }]]
    const mk = () => {
      const db = buildMockDb()
      for (const r of chainRows) db.select.mockReturnValueOnce(chain(r))
      return { db, resolver: new DevFixtureScopeResolver(db as never) }
    }
    const { resolver } = mk()
    const audits: ScadaQueryAuditEntry[] = []
    const audit = { record: async (e: ScadaQueryAuditEntry) => void audits.push(e) }
    const fixture = createDevCsvFixture({ provider: new ScadaCsvFixtureProvider(REPO), tenants: { get: async () => tenant() }, env: DEV })
    const clock = { nowMs: () => 0, correlationId: () => 'c' }
    const svc = new ScadaAnalysisApiService({ scopes: resolver as never, callers: { describe: async () => ({ tenant: tenant(), userActive: true }) }, artifacts: { assertExists: async () => undefined }, clock, audit, sources: fixture.catalog, query: fixture.queryService(audit, clock), limits: { get: () => DEV_FIXTURE_API_LIMITS } })
    const cat = await svc.getCatalog(call())
    expect(cat.sources).toHaveLength(4)
    const db2 = mk()
    const svc2 = new ScadaAnalysisApiService({ scopes: db2.resolver as never, callers: { describe: async () => ({ tenant: tenant(), userActive: true }) }, artifacts: { assertExists: async () => undefined }, clock, audit, sources: fixture.catalog, query: fixture.queryService(audit, clock), limits: { get: () => DEV_FIXTURE_API_LIMITS } })
    const r = await svc2.runAnalysis(call({ sourceCatalogIds: [fixtureCatalogId('sg_endeksler')], seriesKeys: ['SG50_2_ELEKTRIK_URETIM_KWH'], startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T03:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE }))
    expect(r.series[0]!.points).toHaveLength(6)
  })

  it('an UNVERIFIED real column cannot be queried, and neither can a structural or unknown one', async () => {
    const { svc } = make(new ScadaCsvFixtureProvider(REPO))
    for (const key of ['GT1_SICAKSU_URETIM_KWH', 'KAYIT_TARIHI', 'ID', 'NOT_IN_THE_FILE']) {
      expect(await codeOf(svc.runAnalysis(call({ sourceCatalogIds: [fixtureCatalogId('gt_endeksler')], seriesKeys: [key], startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T03:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE })))).not.toBe('OK')
    }
  })
})

describe('column declaration rules (temporary manifest + CSV)', () => {
  const list = async (columns: unknown[] | undefined, text = csv()) => {
    const { svc } = make(tmpProvider(text, columns))
    return (await svc.getCatalog(call())).sources[0]!
  }

  it('a verified INDEX column is selectable and queryable; the declared unit is shown, the name is only the label', async () => {
    const src = await list([decl({ sourceColumn: 'A_COUNTER', label: 'Sayaç A', unit: 'ton', evidenceRefs: ['TEST:ref', 'UNIT: TEST:ref'] })])
    const a = src.series.find(x => x.seriesKey === 'A_COUNTER')!
    expect(a).toMatchObject({ label: 'Sayaç A', unit: 'ton', valueType: 'INDEX', available: true, verificationStatus: 'VERIFIED' })
    const { svc } = make(tmpProvider(csv(), [decl({ sourceColumn: 'A_COUNTER' })]))
    const r = await svc.runAnalysis(call(body(['A_COUNTER'])))
    expect(r.series[0]!.points.map(p => p.value)).toEqual([5, 5, 5, 5, 5])
  })

  it('a verified REAL_VALUE column is selectable and queryable (its DAILY rule comes from the manifest only)', async () => {
    const src = await list([decl({ sourceColumn: 'B_VALUE', valueType: 'REAL_VALUE', dailyOperation: 'AVERAGE' })])
    expect(src.series.find(x => x.seriesKey === 'B_VALUE')).toMatchObject({ valueType: 'REAL_VALUE', available: true })
    const { svc } = make(tmpProvider(csv(), [decl({ sourceColumn: 'B_VALUE', valueType: 'REAL_VALUE' })]))
    const r = await svc.runAnalysis(call(body(['B_VALUE'])))
    expect(r.series[0]).toMatchObject({ valueType: 'REAL_VALUE' })
    expect(r.series[0]!.points.length).toBeGreaterThan(0)
    // no dailyOperation declared ⇒ a DAILY request is refused (nothing guessed)
    expect(await codeOf(svc.runAnalysis(call(body(['B_VALUE'], { bucketInterval: 'DAILY', startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T21:00:00.000Z' }))))).toBe('SCADA_AGGREGATION_POLICY_REQUIRED')
  })

  it('no unit is declared ⇒ unit is empty ("Birim belirtilmemiş" in the UI), and the series is still analysed', async () => {
    const src = await list([decl({ sourceColumn: 'D_KWH' })])
    expect(src.series.find(x => x.seriesKey === 'D_KWH')).toMatchObject({ unit: '', available: true }) // the _KWH suffix is not a unit
    const { svc } = make(tmpProvider(csv(), [decl({ sourceColumn: 'D_KWH' })]))
    const r = await svc.runAnalysis(call(body(['D_KWH'])))
    expect(r.series[0]).toMatchObject({ unit: '', status: 'OK' })
  })

  it('the value type is never derived from a column NAME: undeclared *_INDEX / *_VALUE columns are UNVERIFIED and closed', async () => {
    const src = await list([decl({ sourceColumn: 'A_COUNTER' })])
    for (const k of ['B_VALUE', 'C_INDEX', 'D_KWH']) expect(src.series.find(x => x.seriesKey === k)).toMatchObject({ valueType: 'UNVERIFIED', available: false, unit: '' })
  })

  it.each([
    ['verified without any evidence reference', decl({ sourceColumn: 'A_COUNTER', evidenceRefs: [] })],
    ['verified with blank evidence', decl({ sourceColumn: 'A_COUNTER', evidenceRefs: ['  '] })],
    ['verified without evidenceRefs at all', { sourceColumn: 'A_COUNTER', verified: true, valueType: 'INDEX' }],
    ['verified with a null value type', decl({ sourceColumn: 'A_COUNTER', valueType: null })],
    ['verified with a value type outside INDEX | REAL_VALUE', decl({ sourceColumn: 'A_COUNTER', valueType: 'MEASUREMENT' as never })],
    ['verified: false', decl({ sourceColumn: 'A_COUNTER', verified: false })],
  ])('%s does NOT verify the column', async (_n, d) => {
    const src = await list([d])
    expect(src.selectable).toBe(false)
    expect(src.series.find(x => x.seriesKey === 'A_COUNTER')).toMatchObject({ available: false, verificationStatus: 'UNVERIFIED' })
  })

  it('the same physical column declared twice can never become two semantic series: it stays UNVERIFIED', async () => {
    const src = await list([decl({ sourceColumn: 'A_COUNTER' }), decl({ sourceColumn: 'A_COUNTER', valueType: 'REAL_VALUE', label: 'Başka anlam' })])
    expect(src.series.filter(x => x.seriesKey === 'A_COUNTER')).toHaveLength(1)
    expect(src.series.find(x => x.seriesKey === 'A_COUNTER')).toMatchObject({ available: false })
  })

  it('the id / date / time columns can never be verified as series, whatever a manifest declares', async () => {
    const { svc } = make(tmpProvider(csv(), [decl({ sourceColumn: 'ID' }), decl({ sourceColumn: 'KAYIT_TARIHI' }), decl({ sourceColumn: 'KAYIT_SAATI' }), decl({ sourceColumn: 'A_COUNTER' })]))
    const src = (await svc.getCatalog(call())).sources[0]!
    expect(src.series.map(x => x.seriesKey)).not.toEqual(expect.arrayContaining(['ID']))
    for (const k of ['ID', 'KAYIT_TARIHI', 'KAYIT_SAATI']) {
      expect(src.series.some(x => x.seriesKey === k)).toBe(false)
      expect(await codeOf(svc.runAnalysis(call(body([k]))))).not.toBe('OK')
    }
  })

  it('a column declared in the manifest but absent from the CSV is not listed and cannot be queried; an undeclared one cannot be queried either', async () => {
    const provider = tmpProvider(csv(), [decl({ sourceColumn: 'GHOST_COLUMN' }), decl({ sourceColumn: 'A_COUNTER' })])
    const { svc } = make(provider)
    const src = (await svc.getCatalog(call())).sources[0]!
    expect(src.series.some(x => x.seriesKey === 'GHOST_COLUMN')).toBe(false)
    expect(await codeOf(svc.runAnalysis(call(body(['GHOST_COLUMN']))))).not.toBe('OK')
    expect(await codeOf(svc.runAnalysis(call(body(['C_INDEX']))))).not.toBe('OK') // present in the file, never declared
  })

  it('a missing reading stays null — never 0 — and keeps its quality flag', async () => {
    const { svc } = make(tmpProvider(csv(8, 3), [decl({ sourceColumn: 'A_COUNTER' })]))
    const r = await svc.runAnalysis(call(body(['A_COUNTER'])))
    const nulls = r.series[0]!.points.filter(p => p.value === null)
    expect(nulls.length).toBeGreaterThan(0)
    expect(nulls.every(p => p.qualityFlags.length > 0 && !p.qualityFlags.includes('VALID') && p.classification !== 'VALID')).toBe(true)
    expect(r.series[0]!.points.some(p => p.value === 0)).toBe(false)
  })

  it('a missing REAL_VALUE reading is null — never 0 — while its neighbours keep their real values', async () => {
    const { svc } = make(tmpProvider(csv(8, -1, 3), [decl({ sourceColumn: 'B_VALUE', valueType: 'REAL_VALUE' })]))
    const r = await svc.runAnalysis(call(body(['B_VALUE'])))
    const values = r.series[0]!.points.map(p => p.value)
    expect(values).toContain(null)
    expect(values.filter(v => v === 0)).toEqual([])
    expect(values.filter(v => v !== null).every(v => v >= 20 && v <= 22)).toBe(true)
    const missing = r.series[0]!.points.find(p => p.value === null)!
    expect(missing.classification).not.toBe('VALID')
  })

  it('the id / date / time columns stay out even if the file parser handed them over (guard 2 of 2)', async () => {
    // a declaration on a structural column is ignored by the fixture whatever the parser does
    const { svc } = make(tmpProvider(csv(), [decl({ sourceColumn: 'ID' }), decl({ sourceColumn: 'A_COUNTER' })]))
    const src = (await svc.getCatalog(call())).sources[0]!
    expect(src.series.filter(x => x.available).map(x => x.seriesKey)).toEqual(['A_COUNTER'])
  })

  it('an empty source (header only) is listed as not selectable and yields nothing', async () => {
    const provider = tmpProvider(`${HEADER}`, [decl({ sourceColumn: 'A_COUNTER' })])
    const { svc } = make(provider)
    const src = (await svc.getCatalog(call())).sources[0]!
    expect(src).toMatchObject({ selectable: false, blockedReason: 'NO_SERIES', rowCount: null, minAt: null, maxAt: null })
    expect(src.series).toEqual([])
  })

  it('the query-side catalog gate (defence in depth) knows ONLY the verified columns of the manifest, its table and its date / time columns', async () => {
    const fixture = createDevCsvFixture({ provider: tmpProvider(csv(), [decl({ sourceColumn: 'A_COUNTER' })]), tenants: { get: async () => tenant() }, env: DEV })
    const scope = { tenantId: TENANT, dataScopeTenantIds: [TENANT] }
    await fixture.catalog.listSources({ ...scope, customerRootTenantId: 'root-1' }) // loads the manifest
    const ask = (columns: string[], table = 'phys_s') => fixture.access.evaluateQueryAccess(scope, CAT, { table, columns })
    expect(await ask(['A_COUNTER', 'KAYIT_TARIHI', 'KAYIT_SAATI'])).toMatchObject({ ok: true })
    for (const bad of ['B_VALUE', 'C_INDEX', 'ID', 'NOT_IN_THE_FILE']) expect(await ask([bad])).toEqual({ ok: false, reasons: ['COLUMN_UNKNOWN'] })
    expect(await ask(['A_COUNTER'], 'other_table')).toEqual({ ok: false, reasons: ['TABLE_UNKNOWN'] })
    expect(await fixture.access.evaluateQueryAccess(scope, '00000000-0000-4000-8000-0000000000aa', { table: 'phys_s', columns: ['A_COUNTER'] })).toEqual({ ok: false, reasons: ['NOT_FOUND'] })
    const other = createDevCsvFixture({ provider: tmpProvider(csv(), [decl({ sourceColumn: 'A_COUNTER' })]), tenants: { get: async () => tenant() }, env: DEV })
    expect(await other.access.evaluateQueryAccess({ tenantId: TENANT, dataScopeTenantIds: ['someone-else'] }, CAT, { table: 'phys_s', columns: ['A_COUNTER'] })).toEqual({ ok: false, reasons: ['TENANT_NOT_ACCESSIBLE'] }) // the manifest never widens the tenant scope
  })

  it('a manifest without a columns block verifies nothing', async () => {
    const src = await list(undefined)
    expect(src.selectable).toBe(false)
    expect(src.series.every(x => !x.available)).toBe(true)
  })

  it('without the development zone nothing is analysed even for a verified column', async () => {
    const { svc } = make(tmpProvider(csv(), [decl({ sourceColumn: 'A_COUNTER' })]), { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true' } as NodeJS.ProcessEnv)
    const src = (await svc.getCatalog(call())).sources[0]!
    expect(src).toMatchObject({ selectable: false, blockedReason: 'TIMEZONE_UNVERIFIED', series: [] })
    expect(await codeOf(svc.runAnalysis(call(body(['A_COUNTER']))))).not.toBe('OK')
  })
})
