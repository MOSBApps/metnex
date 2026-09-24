import { existsSync } from 'node:fs'
import path from 'node:path'
import type { ScadaOrchestratedReadPort, ScadaQueryAuditEntry } from '../adapter/scada-readonly.port'
import { CatalogService } from '../catalog/catalog.service'
import { InMemoryCatalogRepository } from '../catalog/in-memory-catalog.repository'
import type { TenantRecord } from '../catalog/tenant-guards'
import { ScadaCsvFixtureProvider } from '../fixture/scada-csv-fixture.provider'
import { ScadaAnalysisQueryService } from './scada-analysis-query.service'

/**
 * TASK-027.65 (test 33) — the query service fed by the REAL CSV snapshot (TASK-027.63-R1 development provider,
 * read-only, `veriler/raw/`). The catalog is in-memory; the port is a test double that serves the CSV rows the
 * way a source would (naive local date/time strings). Nothing is written, no database is contacted. The time zone
 * below is a TEST parameter — the manifest's own zone is UNVERIFIED and no zone is decided for this data.
 * `veriler/raw/` is git-ignored, so the suite is skipped when the snapshot is not present.
 */
const REPO_ROOT = path.resolve(__dirname, '../../../../../../')
const HAS_FIXTURES = existsSync(path.join(REPO_ROOT, 'veriler/raw/endeksler.csv')) && existsSync(path.join(REPO_ROOT, 'veriler/manifest/scada-fixtures.manifest.json'))
const suite = HAS_FIXTURES ? describe : describe.skip

const ENV = { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true' } as NodeJS.ProcessEnv
const T_A = '11111111-1111-4111-8111-111111111111'
const TEST_ZONE_OFFSET_MS = 3 * 3_600_000 // Europe/Istanbul is a fixed +03:00 (test parameter)
const HOUR = 3_600_000

suite('analysis query service over the real CSV snapshot (development fixture)', () => {
  const provider = new ScadaCsvFixtureProvider(REPO_ROOT)
  const records = provider.loadSourceRecords('endeksler', T_A, ENV)

  /** pivot the normalised CSV records back into source-shaped rows (naive local strings) */
  const byRow = new Map<string, Record<string, unknown>>()
  for (const r of records) {
    if (r.seriesKey !== 'Turbin1_Enerji_kWh' && r.seriesKey !== 'Turbin2_Enerji_kWh') continue
    const idVal = r.recordId.split(':')[1]!
    const row = byRow.get(idVal) ?? { KayitTarihi: r.occurredAt.slice(0, 10), KayitSaati: r.occurredAt.slice(11, 19) }
    row[r.seriesKey] = r.rawValue
    byRow.set(idVal, row)
  }
  const rows = [...byRow.values()]
  const naiveMs = (row: Record<string, unknown>) => Date.parse(`${row['KayitTarihi']}T${row['KayitSaati']}Z`)

  async function setup() {
    const catalog = new CatalogService({
      repository: new InMemoryCatalogRepository(),
      authorizer: { authorize: async () => true },
      audit: { record: async () => undefined },
      tenants: { find: async id => (id === T_A ? ({ id: T_A, slug: 'tenant-a', type: 'STANDARD', status: 'ACTIVE' } as unknown as TenantRecord) : null) },
      clock: { now: () => new Date('2026-01-01T00:00:00Z') },
      newId: () => '00000000-0000-4000-8000-000000000001',
      correlationId: () => 'c',
    })
    const cat = { id: 'cat-admin' }
    const s = await catalog.registerSource(cat, {
      displayName: 'CSV fixture',
      physicalDatabase: 'FIXTURE DB',
      scope: 'IN_SCOPE',
      sourceTimeZone: 'Europe/Istanbul',
      limitProfile: { timeoutMs: 1000, maxRows: 100_000, maxColumns: 8, maxPayloadBytes: 50_000_000, maxRangeMs: 400 * 24 * HOUR, poolSize: 1, maxConcurrent: 1 },
      tables: [
        {
          schema: 'TEST_SCHEMA',
          name: 'endeksler',
          columns: [
            { name: 'KayitTarihi', kind: 'DATE' },
            { name: 'KayitSaati', kind: 'TIME' },
            { name: 'Turbin1_Enerji_kWh', kind: 'NUMERIC' },
            { name: 'Turbin2_Enerji_kWh', kind: 'NUMERIC' },
          ],
          dateColumn: 'KayitTarihi',
          timeColumn: 'KayitSaati',
        },
      ],
    })
    const m = await catalog.approveMapping(cat, s.id, 1, { tenantId: T_A, approvalRef: 'APPR-1' })
    await catalog.applyPreflight(cat, s.id, m.version, {
      connectionOk: true,
      databaseExists: true,
      tables: [{ name: 'endeksler', schemaExists: true, exists: true, columns: [{ name: 'KayitTarihi', exists: true, observedClass: 'DATE' }, { name: 'KayitSaati', exists: true, observedClass: 'TIME' }, { name: 'Turbin1_Enerji_kWh', exists: true, observedClass: 'NUMERIC' }, { name: 'Turbin2_Enerji_kWh', exists: true, observedClass: 'NUMERIC' }] }],
    })
    let calls = 0
    const port: ScadaOrchestratedReadPort = {
      listSources: async () => [],
      readUnaudited: async (_a, _s, request) => {
        calls += 1
        // coarse (day-wise, like a DATE predicate): serve every row within ±1 day of the requested instants
        const lo = request.timeRange.from.getTime() - 24 * HOUR
        const hi = request.timeRange.to.getTime() + 24 * HOUR
        const served = rows.filter(r => naiveMs(r) >= lo && naiveMs(r) < hi)
        return { ok: true, rows: served.map(r => ({ ...r })), rowCount: served.length, columnCount: request.columns.length, durationMs: 0 }
      },
    }
    const audit: ScadaQueryAuditEntry[] = []
    let k = 0
    const service = new ScadaAnalysisQueryService({ catalog, adapter: port, audit: { record: async e => void audit.push(e) }, correlationId: () => `srv-${++k}`, nowMs: () => Date.now(), windowConfig: () => ({ forwardBufferMs: HOUR }) })
    return { service, id: s.id, calls: () => calls }
  }

  it('the snapshot is present and non-empty (sanity)', () => expect(rows.length).toBeGreaterThan(10))

  it('returns a deterministic, UTC-normalised raw series for a window of the real data (and does not alter the CSV rows)', async () => {
    const t = await setup()
    const sorted = [...rows].sort((a, b) => naiveMs(a) - naiveMs(b))
    const t0 = naiveMs(sorted[Math.floor(sorted.length / 2)]!)
    const startAt = new Date(t0 - TEST_ZONE_OFFSET_MS) // local wall time t0 == this UTC instant
    const endAt = new Date(startAt.getTime() + 6 * HOUR)
    const query = {
      catalogId: t.id,
      table: 'endeksler',
      columns: ['Turbin1_Enerji_kWh', 'Turbin2_Enerji_kWh'],
      valueType: 'INDEX' as const,
      dateColumn: 'KayitTarihi',
      timeColumn: 'KayitSaati',
      startAt,
      endAt,
      interval: 'HOURLY' as const,
      tenantScope: { tenantId: T_A, customerRootTenantId: 'root', dataScopeTenantIds: [T_A] },
    }
    const before = JSON.stringify(rows)
    const first = await t.service.run({ id: 'actor' }, query)
    const second = await t.service.run({ id: 'actor' }, query)
    expect(JSON.stringify(rows)).toBe(before)
    expect(first).toEqual(second)
    expect(t.calls()).toBe(2)

    const expectedRows = rows.filter(r => naiveMs(r) - TEST_ZONE_OFFSET_MS >= startAt.getTime() && naiveMs(r) - TEST_ZONE_OFFSET_MS < endAt.getTime() + HOUR)
    expect(first.records.length).toBe(expectedRows.length * 2)
    expect(first.records.length).toBeGreaterThan(0)
    for (const r of first.records) {
      const ms = Date.parse(r.occurredAtUtc!)
      expect(ms >= startAt.getTime() && ms < endAt.getTime() + HOUR).toBe(true)
      expect(r.isBufferRow).toBe(ms >= endAt.getTime())
      expect(r.sourceCatalogId).toBe(t.id)
      expect(['VALID', 'MISSING']).toContain(r.dataQuality) // Istanbul has no DST → no DST markers
    }
    const stamps = first.records.map(r => `${r.occurredAtUtc}|${r.seriesKey}`)
    expect(stamps).toEqual([...stamps].sort())
    // a raw value from the CSV is preserved bit for bit (no delta, no clamping)
    const probe = expectedRows[0]!
    const rec = first.records.find(r => r.occurredAtUtc === new Date(naiveMs(probe) - TEST_ZONE_OFFSET_MS).toISOString() && r.seriesKey === 'Turbin1_Enerji_kWh')!
    expect(rec.rawValue).toBe(probe['Turbin1_Enerji_kWh'])
  })

  it('a MISSING CSV cell stays a missing raw value (never silently 0)', async () => {
    const t = await setup()
    const missing = rows.find(r => r['Turbin1_Enerji_kWh'] === null || r['Turbin2_Enerji_kWh'] === null)
    if (!missing) return // this snapshot has no empty cell in the two chosen columns
    const startAt = new Date(naiveMs(missing) - TEST_ZONE_OFFSET_MS)
    const result = await t.service.run(
      { id: 'actor' },
      { catalogId: t.id, table: 'endeksler', columns: ['Turbin1_Enerji_kWh', 'Turbin2_Enerji_kWh'], valueType: 'INDEX', dateColumn: 'KayitTarihi', timeColumn: 'KayitSaati', startAt, endAt: new Date(startAt.getTime() + HOUR), interval: 'HOURLY', tenantScope: { tenantId: T_A, customerRootTenantId: 'root', dataScopeTenantIds: [T_A] } },
    )
    expect(result.records.some(r => r.rawValue === null && r.dataQuality === 'MISSING')).toBe(true)
  })
})
