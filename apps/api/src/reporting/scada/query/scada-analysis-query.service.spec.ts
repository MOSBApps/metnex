import { ScadaAdapterError } from '../adapter/scada-adapter.errors'
import type { ScadaOrchestratedReadPort, ScadaQueryAuditEntry, ScadaReadRequest, ScadaReadScope } from '../adapter/scada-readonly.port'
import type { SqlServerStatement } from '../adapter/sqlserver-driver.port'
import { SqlServerReadonlyAdapter } from '../adapter/sqlserver-readonly.adapter'
import { CatalogService } from '../catalog/catalog.service'
import type { PreflightObservation, RegisterSourceInput } from '../catalog/catalog.types'
import { InMemoryCatalogRepository } from '../catalog/in-memory-catalog.repository'
import type { TenantRecord } from '../catalog/tenant-guards'
import type { ScadaAnalysisQuery } from './scada-analysis-query.contract'
import { ScadaAnalysisQueryService } from './scada-analysis-query.service'
import { ScadaQueryError } from './scada-query.errors'

/**
 * TASK-027.65 — analysis query service, exercised through the SAME contract against (a) the real
 * SqlServerReadonlyAdapter with a mock driver and (b) a mock adapter port. In-memory catalog only:
 * no SQL Server, no PostgreSQL. `TEST_BUFFER_MS` is a TEST parameter, not a proposed Q-W521 value.
 */
const ACTOR = { id: 'actor-1' }
const CAT = { id: 'cat-admin' }
const T_ROOT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const T_A = '11111111-1111-4111-8111-111111111111'
const T_B = '22222222-2222-4222-8222-222222222222'
const T_C = '33333333-3333-4333-8333-333333333333'
const HOUR = 3_600_000
const TEST_BUFFER_MS = HOUR
const LIMITS = { timeoutMs: 200, maxRows: 100, maxColumns: 6, maxPayloadBytes: 100_000, maxRangeMs: 3 * 24 * HOUR, poolSize: 2, maxConcurrent: 2 }

const tenants = {
  [T_ROOT]: { id: T_ROOT, slug: 'root', type: 'PLATFORM_ROOT', status: 'ACTIVE' },
  [T_A]: { id: T_A, slug: 'tenant-a', type: 'CUSTOMER', status: 'ACTIVE' },
  [T_B]: { id: T_B, slug: 'tenant-b', type: 'CUSTOMER', status: 'ACTIVE' },
  [T_C]: { id: T_C, slug: 'tenant-c', type: 'CUSTOMER', status: 'ACTIVE' },
} as unknown as Record<string, TenantRecord>

const declared = (over: Partial<RegisterSourceInput> = {}): RegisterSourceInput => ({
  displayName: 'Kaynak',
  physicalDatabase: 'MOSB ENERJI DB',
  scope: 'IN_SCOPE',
  sourceTimeZone: 'Europe/Istanbul',
  limitProfile: { ...LIMITS },
  tables: [
    {
      schema: 'TEST_SCHEMA',
      name: 'ENERJI',
      columns: [
        { name: 'TARIH', kind: 'DATE' },
        { name: 'SAAT', kind: 'TIME' },
        { name: 'ENDEKS1', kind: 'NUMERIC' },
        { name: 'ENDEKS2', kind: 'NUMERIC' },
        { name: 'ACIKLAMA', kind: 'OTHER' },
      ],
      dateColumn: 'TARIH',
      timeColumn: 'SAAT',
    },
  ],
  ...over,
})
const observation = (): PreflightObservation => ({
  connectionOk: true,
  databaseExists: true,
  tables: [
    {
      name: 'ENERJI',
      schemaExists: true,
      exists: true,
      columns: [
        { name: 'TARIH', exists: true, observedClass: 'DATE' },
        { name: 'SAAT', exists: true, observedClass: 'TIME' },
        { name: 'ENDEKS1', exists: true, observedClass: 'NUMERIC' },
        { name: 'ENDEKS2', exists: true, observedClass: 'NUMERIC' },
        { name: 'ACIKLAMA', exists: true, observedClass: 'TEXT' },
      ],
    },
  ],
})

const scopeOf = (tenantId: string, ...more: string[]): ScadaReadScope => ({ tenantId, customerRootTenantId: T_ROOT, dataScopeTenantIds: [tenantId, ...more] })
const START = new Date('2026-01-15T00:00:00Z')
const END = new Date('2026-01-15T03:00:00Z')

/** Source wall-clock rows (Europe/Istanbul = UTC+3). */
const ROWS = [
  { TARIH: '2026-01-15', SAAT: '02:59:59', ENDEKS1: 90, ENDEKS2: 1 }, // 23:59:59Z (before start → dropped)
  { TARIH: '2026-01-15', SAAT: '03:00:00', ENDEKS1: 100, ENDEKS2: 10 }, // 00:00Z (start, inclusive)
  { TARIH: '2026-01-15', SAAT: '04:00:00', ENDEKS1: 110, ENDEKS2: null }, // 01:00Z
  { TARIH: '2026-01-15', SAAT: '05:59:59', ENDEKS1: 125, ENDEKS2: 30 }, // 02:59:59Z
  { TARIH: '2026-01-15', SAAT: '06:00:00', ENDEKS1: 130, ENDEKS2: 40 }, // 03:00Z = end → buffer row
  { TARIH: '2026-01-15', SAAT: '06:30:00', ENDEKS1: 135, ENDEKS2: 41 }, // buffer row
  { TARIH: '2026-01-15', SAAT: '07:00:00', ENDEKS1: 140, ENDEKS2: 42 }, // 04:00Z = buffer end → excluded
]

type Rows = Record<string, unknown>[]
interface PortHarness {
  port: ScadaOrchestratedReadPort
  /** SCADA_QUERY_* records the ADAPTER itself wrote (must stay 0: the service is the single audit boundary). */
  adapterAudit(): number
  setRows(catalogId: string, rows: Rows): void
  calls(): number
  lastRequest(): ScadaReadRequest | null
  register(catalogId: string, physicalDatabase: string): void
}

function adapterPort(catalog: CatalogService): PortHarness {
  const byDb = new Map<string, Rows>()
  const idByDb = new Map<string, string>()
  const rowsById = new Map<string, Rows>()
  const statements: SqlServerStatement[] = []
  let last: ScadaReadRequest | null = null
  let n = 0
  let adapterAuditCount = 0
  const inner = new SqlServerReadonlyAdapter({
    catalog,
    driver: {
      run: async s => {
        statements.push(s)
        return { rows: rowsById.get(idByDb.get(s.database)!) ?? byDb.get(s.database) ?? [] }
      },
    },
    audit: {
      record: async () => {
        adapterAuditCount += 1
      },
    },
    correlationId: () => `srv-${++n}`,
    nowMs: () => Date.now(),
  })
  const port: ScadaOrchestratedReadPort = {
    listSources: s => inner.listSources(s),
    readUnaudited: (actor, scope, request) => {
      last = request
      return inner.readUnaudited(actor, scope, request)
    },
  }
  return {
    port,
    adapterAudit: () => adapterAuditCount,
    setRows: (id, rows) => void rowsById.set(id, rows),
    calls: () => statements.length,
    lastRequest: () => last,
    register: (id, db) => void idByDb.set(db, id),
  }
}

function mockPort(catalog: CatalogService): PortHarness {
  const rowsById = new Map<string, Rows>()
  let calls = 0
  let last: ScadaReadRequest | null = null
  const port: ScadaOrchestratedReadPort = {
    listSources: s => catalog.listAccessibleSources(s),
    readUnaudited: async (_actor, _scope, request) => {
      last = request
      if (request.signal?.aborted) return { ok: false, code: 'CANCELLED', outcome: 'CANCELLED', limitReason: null, durationMs: 0 }
      calls += 1
      const rows = [...(rowsById.get(request.catalogId) ?? [])]
      return { ok: true, rows, rowCount: rows.length, columnCount: request.columns.length, durationMs: 0 }
    },
  }
  return { port, adapterAudit: () => 0, setRows: (id, rows) => void rowsById.set(id, rows), calls: () => calls, lastRequest: () => last, register: () => undefined }
}

function serviceDeps(catalog: CatalogService, adapter: ScadaOrchestratedReadPort, audit: ScadaQueryAuditEntry[], opts: { buffer?: number | null; auditFails?: boolean; auditFailsFor?: string } = {}) {
  let k = 0
  return {
    catalog,
    adapter,
    audit: {
      record: async (e: ScadaQueryAuditEntry) => {
        if (opts.auditFails || (opts.auditFailsFor && e.entityId === opts.auditFailsFor)) throw new Error('audit down')
        audit.push(e)
      },
    },
    correlationId: () => `srv-corr-${++k}`,
    nowMs: () => Date.now(),
    windowConfig: () => ({ forwardBufferMs: 'buffer' in opts ? opts.buffer : TEST_BUFFER_MS }),
  }
}

async function build(makePort: (c: CatalogService) => PortHarness, opts: { buffer?: number | null; auditFails?: boolean; auditFailsFor?: string } = {}) {
  const repository = new InMemoryCatalogRepository()
  let n = 0
  const catalog = new CatalogService({
    repository,
    authorizer: { authorize: async () => true },
    audit: { record: async () => undefined },
    tenants: { find: async id => tenants[id] ?? null },
    clock: { now: () => new Date('2026-01-01T00:00:00Z') },
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    correlationId: () => `catalog-${n}`,
  })
  const h = makePort(catalog)
  const audit: ScadaQueryAuditEntry[] = []
  const service = new ScadaAnalysisQueryService(serviceDeps(catalog, h.port, audit, opts))
  let dbN = 0
  async function source(tenantId: string | null, over: Partial<RegisterSourceInput> = {}, verify = true, obs: PreflightObservation = observation()) {
    const db = over.physicalDatabase ?? (dbN === 0 ? 'MOSB ENERJI DB' : `DB ${dbN}`)
    dbN += 1
    const s = await catalog.registerSource(CAT, declared({ ...over, physicalDatabase: db }))
    h.register(s.id, db)
    let v = s.version
    if (tenantId) v = (await catalog.approveMapping(CAT, s.id, v, { tenantId, approvalRef: 'APPR-1' })).version
    if (verify) await catalog.applyPreflight(CAT, s.id, v, obs)
    h.setRows(s.id, structuredClone(ROWS))
    return s.id
  }
  const query = (catalogId: string, tenantId = T_A, over: Record<string, unknown> = {}): ScadaAnalysisQuery =>
    ({
      catalogId,
      table: 'ENERJI',
      columns: ['ENDEKS1', 'ENDEKS2'],
      valueType: 'INDEX',
      dateColumn: 'TARIH',
      timeColumn: 'SAAT',
      startAt: START,
      endAt: END,
      interval: 'HOURLY',
      tenantScope: scopeOf(tenantId),
      ...over,
    }) as ScadaAnalysisQuery
  return { service, catalog, h, source, query, repository, audit }
}

const code = (p: Promise<unknown>) => p.then(() => 'OK', (e: unknown) => (e instanceof ScadaQueryError ? e.code : `UNEXPECTED:${String(e)}`))

describe.each([
  ['SqlServerReadonlyAdapter + mock driver', adapterPort],
  ['mock adapter port', mockPort],
])('analysis query service contract — %s', (_label, makePort) => {
  describe('gates run before the adapter (no driver/adapter call on any rejection)', () => {
    it('1. invalid request', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      for (const bad of [null, undefined, 'x', 42, [], {}, { ...t.query(id), columns: [] }, { ...t.query(id), columns: 'ENDEKS1' }, { ...t.query(id), columns: ['ENDEKS1', 'ENDEKS1'] }, { ...t.query(id), valueType: 'DELTA' }, { ...t.query(id), interval: 'MONTHLY' }, { ...t.query(id), startAt: '2026-01-15T00:00:00' }, { ...t.query(id), endAt: new Date('nope') }, { ...t.query(id), tenantScope: null }, { ...t.query(id), signal: {} }]) {
        expect(await code(t.service.run(ACTOR, bad as never))).toBe('INVALID_REQUEST')
      }
      expect(t.h.calls()).toBe(0)
    })
    it.each(['sql', 'database', 'schema', 'filters', 'connectionString', 'correlationId', 'anything'])('2 + 21 + 22. extra/forbidden field %s is rejected', async field => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      expect(await code(t.service.run(ACTOR, t.query(id, T_A, { [field]: 'x' })))).toBe('INVALID_REQUEST')
      expect(t.h.calls()).toBe(0)
    })
    it.each(["x'; DROP TABLE y;--", 'MOSB ENERJI DB', '', 'not-a-uuid'])('3. invalid catalog id %j', async bad => {
      const t = await build(makePort)
      await t.source(T_A)
      expect(await code(t.service.run(ACTOR, t.query(bad)))).toBe('INVALID_CATALOG_ID')
      expect(t.h.calls()).toBe(0)
    })
    it('unknown (well-formed) catalog id → SOURCE_NOT_FOUND', async () => {
      const t = await build(makePort)
      expect(await code(t.service.run(ACTOR, t.query('99999999-9999-4999-8999-999999999999')))).toBe('SOURCE_NOT_FOUND')
      expect(t.h.calls()).toBe(0)
    })
    it('4. UNVERIFIED source', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A, {}, false)
      expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('SOURCE_NOT_VERIFIED')
      expect(t.h.calls()).toBe(0)
    })
    it('5. BLOCKED source', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      const cur = (await t.catalog.history(id)).at(-1)!
      await t.catalog.blockSource(CAT, id, cur.version, 'MANUAL_BLOCK')
      expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('SOURCE_BLOCKED')
      expect(t.h.calls()).toBe(0)
    })
    it('6. unresolved / blocked mapping', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      let cur = (await t.catalog.history(id)).at(-1)!
      cur = await t.catalog.revokeMapping(CAT, id, cur.version, { tenantId: T_A })
      expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('SOURCE_MAPPING_UNRESOLVED')
      await t.catalog.blockMapping(CAT, id, cur.version, { tenantId: T_A })
      expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('SOURCE_MAPPING_UNRESOLVED')
      expect(t.h.calls()).toBe(0)
    })
    it('7. suspended tenant', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      const original = tenants[T_A]!
      tenants[T_A] = { ...original, status: 'SUSPENDED' }
      try {
        expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('TENANT_SCOPE_DENIED')
      } finally {
        tenants[T_A] = original
      }
      expect(t.h.calls()).toBe(0)
    })
    it('8. MOSEDAŞ is not a tenant (read-time re-check)', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      const original = tenants[T_A]!
      tenants[T_A] = { ...original, slug: 'Mosedaş' }
      try {
        expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('TENANT_SCOPE_DENIED')
      } finally {
        tenants[T_A] = original
      }
      expect(t.h.calls()).toBe(0)
    })
    it.each([
      ['9. table outside the catalog', { table: 'OTHER_TABLE' }, 'TABLE_NOT_ALLOWED'],
      ['9. table injection', { table: 'ENERJI; DROP TABLE x' }, 'TABLE_NOT_ALLOWED'],
      ['10. column outside the catalog', { columns: ['ENDEKS1', 'GIZLI'] }, 'COLUMN_NOT_ALLOWED'],
      ['10. column injection', { columns: ['ENDEKS1]; DROP TABLE x--'] }, 'COLUMN_NOT_ALLOWED'],
      ['10. wildcard', { columns: ['*'] }, 'COLUMN_NOT_ALLOWED'],
      ['10. non-numeric column is not a measurement', { columns: ['ACIKLAMA'] }, 'COLUMN_NOT_ALLOWED'],
      ['10. date column is not a measurement', { columns: ['TARIH'] }, 'COLUMN_NOT_ALLOWED'],
      ['11. date column differs from the catalog', { dateColumn: 'ENDEKS1' }, 'COLUMN_NOT_ALLOWED'],
      ['11. time column differs from the catalog', { timeColumn: 'ENDEKS2' }, 'COLUMN_NOT_ALLOWED'],
      ['11. date column unknown', { dateColumn: 'NOPE' }, 'COLUMN_NOT_ALLOWED'],
    ])('%s', async (_n, over, expected) => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      expect(await code(t.service.run(ACTOR, t.query(id, T_A, over)))).toBe(expected)
      expect(t.h.calls()).toBe(0)
    })
    it('12. source time zone missing', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A, { sourceTimeZone: undefined })
      expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('SOURCE_TIMEZONE_REQUIRED')
      expect(t.h.calls()).toBe(0)
    })
    it('13. limit profile missing', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A, { limitProfile: undefined })
      expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('SOURCE_LIMIT_PROFILE_REQUIRED')
      expect(t.h.calls()).toBe(0)
    })
    it('14. invalid time range (start ≥ end)', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      expect(await code(t.service.run(ACTOR, t.query(id, T_A, { startAt: END, endAt: START })))).toBe('TIME_RANGE_INVALID')
      expect(await code(t.service.run(ACTOR, t.query(id, T_A, { startAt: START, endAt: START })))).toBe('TIME_RANGE_INVALID')
      expect(t.h.calls()).toBe(0)
    })
    it('15. maximum range (the forward buffer counts) → TIME_RANGE_LIMIT_EXCEEDED', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      const tooLong = new Date(START.getTime() + LIMITS.maxRangeMs + 1)
      expect(await code(t.service.run(ACTOR, t.query(id, T_A, { endAt: tooLong })))).toBe('TIME_RANGE_LIMIT_EXCEEDED')
      // exactly at the limit only when the buffer still fits: range + buffer > max → rejected
      expect(await code(t.service.run(ACTOR, t.query(id, T_A, { endAt: new Date(START.getTime() + LIMITS.maxRangeMs) })))).toBe('TIME_RANGE_LIMIT_EXCEEDED')
      expect(await code(t.service.run(ACTOR, t.query(id, T_A, { endAt: new Date(START.getTime() + LIMITS.maxRangeMs - TEST_BUFFER_MS) })))).toBe('OK')
      expect(t.h.calls()).toBe(1)
    })
    it('16 + 17. Q-W521: no buffer configuration → QUERY_WINDOW_CONFIGURATION_REQUIRED, never a made-up default', async () => {
      for (const buffer of [null, undefined, -1, 1.5, Number.NaN] as const) {
        const t = await build(makePort, { buffer })
        const id = await t.source(T_A)
        expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('QUERY_WINDOW_CONFIGURATION_REQUIRED')
        expect(t.h.calls()).toBe(0)
      }
    })
    it('16. the buffer is exactly what the configuration says (not a constant of the service)', async () => {
      for (const buffer of [0, 90 * 60_000, 5 * HOUR]) {
        const t = await build(makePort, { buffer })
        const id = await t.source(T_A)
        const result = await t.service.run(ACTOR, t.query(id))
        expect(result.window.bufferEndAtUtc).toBe(new Date(END.getTime() + buffer).toISOString())
        expect(t.h.lastRequest()!.timeRange.to.getTime() - END.getTime()).toBe(buffer)
      }
    })
    it('a scope whose own tenant is not part of its data scope → TENANT_SCOPE_DENIED', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      const bad = { ...t.query(id), tenantScope: { tenantId: T_B, customerRootTenantId: T_ROOT, dataScopeTenantIds: [T_A] } }
      expect(await code(t.service.run(ACTOR, bad))).toBe('TENANT_SCOPE_DENIED')
      expect(t.h.calls()).toBe(0)
    })
  })

  describe('normalised raw time series', () => {
    it('18. converts source wall time to UTC, keeps the window half-open, flags buffer rows', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      const result = await t.service.run(ACTOR, t.query(id))
      expect(result.window).toEqual({ startAtUtc: '2026-01-15T00:00:00.000Z', endAtUtc: '2026-01-15T03:00:00.000Z', bufferEndAtUtc: '2026-01-15T04:00:00.000Z' })
      const e1 = result.records.filter(r => r.seriesKey === 'ENDEKS1')
      expect(e1.map(r => [r.occurredAtUtc, r.rawValue, r.isBufferRow])).toEqual([
        ['2026-01-15T00:00:00.000Z', 100, false],
        ['2026-01-15T01:00:00.000Z', 110, false],
        ['2026-01-15T02:59:59.000Z', 125, false],
        ['2026-01-15T03:00:00.000Z', 130, true],
        ['2026-01-15T03:30:00.000Z', 135, true],
      ])
    })
    it('the record contract: ids, series, value type, catalog id, quality; no delta / no clamping / missing stays missing', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      t.h.setRows(id, [
        { TARIH: '2026-01-15', SAAT: '04:00:00', ENDEKS1: -5, ENDEKS2: null },
        { TARIH: '2026-01-15', SAAT: '05:00:00', ENDEKS1: 'abc', ENDEKS2: '7.5' },
      ])
      const result = await t.service.run(ACTOR, t.query(id, T_A, { valueType: 'REAL_VALUE' }))
      expect(result.records).toEqual([
        { occurredAtUtc: '2026-01-15T01:00:00.000Z', localWallTime: '2026-01-15T04:00:00.000', dstCandidatesUtc: [], dstUncertainRangeUtc: null, recordId: `${id}:2026-01-15T01:00:00.000Z:ENDEKS1:0`, seriesKey: 'ENDEKS1', rawValue: -5, valueType: 'REAL_VALUE', sourceCatalogId: id, dataQuality: 'VALID', dstResolution: 'NORMAL', isBufferRow: false },
        { occurredAtUtc: '2026-01-15T01:00:00.000Z', localWallTime: '2026-01-15T04:00:00.000', dstCandidatesUtc: [], dstUncertainRangeUtc: null, recordId: `${id}:2026-01-15T01:00:00.000Z:ENDEKS2:0`, seriesKey: 'ENDEKS2', rawValue: null, valueType: 'REAL_VALUE', sourceCatalogId: id, dataQuality: 'MISSING', dstResolution: 'NORMAL', isBufferRow: false },
        { occurredAtUtc: '2026-01-15T02:00:00.000Z', localWallTime: '2026-01-15T05:00:00.000', dstCandidatesUtc: [], dstUncertainRangeUtc: null, recordId: `${id}:2026-01-15T02:00:00.000Z:ENDEKS1:0`, seriesKey: 'ENDEKS1', rawValue: null, valueType: 'REAL_VALUE', sourceCatalogId: id, dataQuality: 'INVALID', dstResolution: 'NORMAL', isBufferRow: false },
        { occurredAtUtc: '2026-01-15T02:00:00.000Z', localWallTime: '2026-01-15T05:00:00.000', dstCandidatesUtc: [], dstUncertainRangeUtc: null, recordId: `${id}:2026-01-15T02:00:00.000Z:ENDEKS2:0`, seriesKey: 'ENDEKS2', rawValue: 7.5, valueType: 'REAL_VALUE', sourceCatalogId: id, dataQuality: 'VALID', dstResolution: 'NORMAL', isBufferRow: false },
      ])
      expect(result.records.every(r => !('delta' in r))).toBe(true)
    })
    it('a malformed source timestamp fails closed (never guessed as UTC)', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      t.h.setRows(id, [{ TARIH: 'not a date', SAAT: '04:00:00', ENDEKS1: 1, ENDEKS2: 1 }])
      expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('SCADA_ADAPTER_FAILED')
    })
    it('19. DST boundaries: gap and ambiguous hours are normalised deterministically and flagged', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A, { sourceTimeZone: 'Europe/Berlin' })
      t.h.setRows(id, [
        { TARIH: '2026-03-29', SAAT: '01:59:59', ENDEKS1: 1, ENDEKS2: 1 },
        { TARIH: '2026-03-29', SAAT: '02:30:00', ENDEKS1: 2, ENDEKS2: 2 }, // does not exist
        { TARIH: '2026-03-29', SAAT: '03:00:00', ENDEKS1: 3, ENDEKS2: 3 },
      ])
      const spring = await t.service.run(ACTOR, t.query(id, T_A, { startAt: new Date('2026-03-29T00:00:00Z'), endAt: new Date('2026-03-29T03:00:00Z') }))
      // Q-W529c: the missing 02:30 has NO instant — neither the pre-jump (01:30Z) nor the post-jump (00:30Z) offset is applied
      expect(spring.records.filter(r => r.seriesKey === 'ENDEKS1').map(r => [r.occurredAtUtc, r.dataQuality, r.dstResolution])).toEqual([
        [null, 'INVALID', 'GAP'],
        ['2026-03-29T00:59:59.000Z', 'VALID', 'NORMAL'],
        ['2026-03-29T01:00:00.000Z', 'VALID', 'NORMAL'],
      ])
      const gap = spring.records.find(r => r.dstResolution === 'GAP')!
      expect(gap).toMatchObject({ occurredAtUtc: null, localWallTime: '2026-03-29T02:30:00.000', dstCandidatesUtc: [], dstUncertainRangeUtc: ['2026-03-29T00:30:00.000Z', '2026-03-29T01:30:00.000Z'], rawValue: 2 })
      expect(JSON.stringify(spring.records.map(r => r.recordId))).not.toMatch(/2026-03-29T0[01]:30:00.000Z:ENDEKS1:0.*GAP/)
      t.h.setRows(id, [
        { TARIH: '2026-10-25', SAAT: '02:30:00', ENDEKS1: 5, ENDEKS2: 5 },
        { TARIH: '2026-10-25', SAAT: '03:00:00', ENDEKS1: 6, ENDEKS2: 6 },
      ])
      const autumn = await t.service.run(ACTOR, t.query(id, T_A, { startAt: new Date('2026-10-25T00:00:00Z'), endAt: new Date('2026-10-25T03:00:00Z') }))
      // TASK-027.67-R1: the repeated 02:30 is NOT forced onto its first pass — it has NO instant; both candidates are listed
      expect(autumn.records.filter(r => r.seriesKey === 'ENDEKS1').map(r => [r.occurredAtUtc, r.dataQuality, r.dstResolution])).toEqual([
        [null, 'UNVERIFIED', 'AMBIGUOUS'],
        ['2026-10-25T02:00:00.000Z', 'VALID', 'NORMAL'],
      ])
      const amb = autumn.records.find(r => r.dstResolution === 'AMBIGUOUS')!
      expect(amb).toMatchObject({ occurredAtUtc: null, localWallTime: '2026-10-25T02:30:00.000', dstCandidatesUtc: ['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z'] })
    })
    it('R1: two readings with the SAME repeated wall time stay two separate records (never merged, never one UTC)', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A, { sourceTimeZone: 'Europe/Berlin' })
      t.h.setRows(id, [
        { TARIH: '2026-10-25', SAAT: '02:30:00', ENDEKS1: 5, ENDEKS2: 50 },
        { TARIH: '2026-10-25', SAAT: '02:30:00', ENDEKS1: 6, ENDEKS2: 60 },
      ])
      const r = await t.service.run(ACTOR, t.query(id, T_A, { startAt: new Date('2026-10-25T00:00:00Z'), endAt: new Date('2026-10-25T03:00:00Z') }))
      const e1 = r.records.filter(x => x.seriesKey === 'ENDEKS1')
      expect(e1).toHaveLength(2)
      expect(e1.map(x => x.rawValue)).toEqual([5, 6])
      expect(new Set(e1.map(x => x.recordId)).size).toBe(2)
      expect(e1.every(x => x.occurredAtUtc === null && x.dstResolution === 'AMBIGUOUS')).toBe(true)
    })
    it('R1: only a source-provided fold places a repeated wall time at its TRUE instant (first / second pass)', async () => {
      const t = await build(mockPort)
      const id = await t.source(T_A, { sourceTimeZone: 'Europe/Berlin' })
      const service = new ScadaAnalysisQueryService({ ...serviceDeps(t.catalog, t.h.port, []), foldOf: row => (row['FOLD'] === 0 || row['FOLD'] === 1 ? (row['FOLD'] as 0 | 1) : undefined) })
      t.h.setRows(id, [
        { TARIH: '2026-10-25', SAAT: '02:30:00', ENDEKS1: 5, ENDEKS2: 5, FOLD: 0 },
        { TARIH: '2026-10-25', SAAT: '02:30:00', ENDEKS1: 6, ENDEKS2: 6, FOLD: 1 },
        { TARIH: '2026-10-25', SAAT: '02:45:00', ENDEKS1: 7, ENDEKS2: 7 }, // no fold → stays unresolved
      ])
      const r = await service.run(ACTOR, t.query(id, T_A, { startAt: new Date('2026-10-25T00:00:00Z'), endAt: new Date('2026-10-25T03:00:00Z') }))
      const e1 = r.records.filter(x => x.seriesKey === 'ENDEKS1')
      expect(e1.map(x => [x.occurredAtUtc, x.rawValue, x.dstResolution])).toEqual([
        ['2026-10-25T00:30:00.000Z', 5, 'AMBIGUOUS_RESOLVED'],
        [null, 7, 'AMBIGUOUS'],
        ['2026-10-25T01:30:00.000Z', 6, 'AMBIGUOUS_RESOLVED'],
      ].sort((a, b) => (String(a[0] ?? '2026-10-25T00:45') < String(b[0] ?? '2026-10-25T00:45') ? -1 : 1)))
      expect(e1.find(x => x.rawValue === 5)!.dataQuality).toBe('VALID')
    })
    it('a single DATETIME column is normalised too', async () => {
      const t = await build(makePort)
      const id = await t.source(
        T_A,
        { tables: [{ schema: 'TEST_SCHEMA', name: 'ENERJI', columns: [{ name: 'ZAMAN', kind: 'DATETIME' }, { name: 'ENDEKS1', kind: 'NUMERIC' }], dateColumn: 'ZAMAN', timeColumn: 'ZAMAN' }] },
        true,
        { connectionOk: true, databaseExists: true, tables: [{ name: 'ENERJI', schemaExists: true, exists: true, columns: [{ name: 'ZAMAN', exists: true, observedClass: 'DATETIME' }, { name: 'ENDEKS1', exists: true, observedClass: 'NUMERIC' }] }] },
      )
      t.h.setRows(id, [{ ZAMAN: '2026-01-15 04:00:00', ENDEKS1: 7 }])
      const result = await t.service.run(ACTOR, t.query(id, T_A, { columns: ['ENDEKS1'], dateColumn: 'ZAMAN', timeColumn: 'ZAMAN' }))
      expect(result.records.map(r => [r.occurredAtUtc, r.rawValue])).toEqual([['2026-01-15T01:00:00.000Z', 7]])
    })
    it('20 + 23. the adapter gets only allowlisted names, the normalised window, no SQL, no client fields', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      await t.service.run(ACTOR, t.query(id, T_A, { signal: new AbortController().signal }))
      const req = t.h.lastRequest()!
      expect(Object.keys(req).sort()).toEqual(['catalogId', 'columns', 'signal', 'table', 'timeRange'])
      expect(req).toMatchObject({ catalogId: id, table: 'ENERJI', columns: ['TARIH', 'SAAT', 'ENDEKS1', 'ENDEKS2'] })
      expect(req.timeRange.from.toISOString()).toBe('2026-01-15T00:00:00.000Z')
      expect(req.timeRange.to.toISOString()).toBe('2026-01-15T04:00:00.000Z')
      expect(JSON.stringify(Object.keys(req))).not.toMatch(/sql|database|schema|filters|correlation|connection/i)
    })
    it('27. row order is deterministic (time, series, source order) regardless of adapter order', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      const shuffled = [...ROWS].reverse()
      t.h.setRows(id, structuredClone(shuffled))
      const a = await t.service.run(ACTOR, t.query(id))
      t.h.setRows(id, structuredClone(ROWS))
      const b = await t.service.run(ACTOR, t.query(id))
      expect(a.records).toEqual(b.records)
      const stamps = b.records.map(r => `${r.occurredAtUtc}|${r.seriesKey}`)
      expect(stamps).toEqual([...stamps].sort())
    })
    it('duplicate timestamps get distinct, stable record ids', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      t.h.setRows(id, [
        { TARIH: '2026-01-15', SAAT: '04:00:00', ENDEKS1: 1, ENDEKS2: 1 },
        { TARIH: '2026-01-15', SAAT: '04:00:00', ENDEKS1: 2, ENDEKS2: 2 },
      ])
      const r = await t.service.run(ACTOR, t.query(id))
      const ids = r.records.filter(x => x.seriesKey === 'ENDEKS1').map(x => x.recordId)
      expect(new Set(ids).size).toBe(2)
      expect(r.records.filter(x => x.seriesKey === 'ENDEKS1').map(x => x.rawValue)).toEqual([1, 2])
    })
    it('28. the input object (and its scope) is never mutated', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      const q = t.query(id)
      const frozen = { ...q, columns: Object.freeze([...q.columns]), tenantScope: Object.freeze({ ...q.tenantScope, dataScopeTenantIds: Object.freeze([...q.tenantScope.dataScopeTenantIds]) }) }
      Object.freeze(frozen)
      const before = JSON.stringify(frozen)
      const start = frozen.startAt.getTime()
      const r = await t.service.run(ACTOR, frozen as never)
      expect(JSON.stringify(frozen)).toBe(before)
      expect(frozen.startAt.getTime()).toBe(start)
      r.records[0]!.rawValue = -1 // mutating the result cannot reach the input
      expect(JSON.stringify(frozen)).toBe(before)
    })
    it('29. an already-aborted signal is SCADA_QUERY_CANCELLED without an adapter call', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      const c = new AbortController()
      c.abort()
      expect(await code(t.service.run(ACTOR, t.query(id, T_A, { signal: c.signal })))).toBe('SCADA_QUERY_CANCELLED')
      expect(t.h.calls()).toBe(0)
    })
    it('30. an adapter failure becomes a static SCADA_ADAPTER_FAILED (no driver text)', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      const original = t.h.port.readUnaudited
      ;(t.h.port as { readUnaudited: unknown }).readUnaudited = async () => {
        throw new Error('Server=db01;Password=hunter2;SELECT secret FROM dbo.tbl')
      }
      const err = await t.service.run(ACTOR, t.query(id)).catch((e: Error) => e)
      ;(t.h.port as { readUnaudited: unknown }).readUnaudited = original
      expect(err).toBeInstanceOf(ScadaQueryError)
      expect((err as ScadaQueryError).code).toBe('SCADA_ADAPTER_FAILED')
      expect(`${(err as Error).message}|${(err as Error).stack ?? ''}`).not.toMatch(/db01|hunter2|SELECT|dbo/)
    })
    it('adapter limit denials collapse to the static failure code; a range denial keeps its meaning', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      const original = t.h.port.readUnaudited
      ;(t.h.port as { readUnaudited: unknown }).readUnaudited = async () => {
        throw new ScadaAdapterError('ROW_LIMIT_EXCEEDED', 'DENIED', 'srv', 'ROW_LIMIT')
      }
      expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('SCADA_ADAPTER_FAILED')
      ;(t.h.port as { readUnaudited: unknown }).readUnaudited = async () => {
        throw new ScadaAdapterError('TIME_RANGE_EXCEEDED', 'DENIED', 'srv', 'TIME_RANGE_LIMIT')
      }
      expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('TIME_RANGE_LIMIT_EXCEEDED')
      ;(t.h.port as { readUnaudited: unknown }).readUnaudited = async () => {
        throw new ScadaAdapterError('CANCELLED', 'CANCELLED', 'srv')
      }
      expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('SCADA_QUERY_CANCELLED')
      ;(t.h.port as { readUnaudited: unknown }).readUnaudited = original
    })
  })

  describe('tenant isolation and multi-source (root aggregation)', () => {
    it('24. tenant A cannot read tenant B\'s source (and learns nothing about it)', async () => {
      const t = await build(makePort)
      await t.source(T_A)
      const b = await t.source(T_B)
      expect(await code(t.service.run(ACTOR, t.query(b, T_A)))).toBe('SOURCE_NOT_FOUND')
      expect(await code(t.service.run(ACTOR, t.query(b, T_ROOT)))).toBe('SOURCE_NOT_FOUND') // root without the child in scope
      expect(t.h.calls()).toBe(0)
    })
    it('25 + 26. root aggregation: each source reports its OWN status; only in-scope sources are read, one adapter call each, merged deterministically', async () => {
      const t = await build(makePort)
      const a = await t.source(T_A)
      const b = await t.source(T_B)
      const c = await t.source(T_C) // outside the scope below
      const unresolved = await t.source(null)
      const scope = scopeOf(T_ROOT, T_A, T_B)
      const base = { table: 'ENERJI', columns: ['ENDEKS1'], valueType: 'INDEX' as const, dateColumn: 'TARIH', timeColumn: 'SAAT', startAt: START, endAt: END, interval: 'HOURLY' as const }
      const result = await t.service.runMany(ACTOR, scope, [b, c, unresolved, a].map(catalogId => ({ ...base, catalogId })), { mode: 'ROOT_AGGREGATION' })
      expect(t.h.calls()).toBe(2)
      expect(result.complete).toBe(false)
      const byId = new Map(result.sources.map(s => [s.catalogId, s]))
      expect(byId.get(a)).toMatchObject({ status: 'READ', code: null })
      expect(byId.get(b)).toMatchObject({ status: 'READ', code: null })
      expect(byId.get(c)).toEqual({ catalogId: c, status: 'EXCLUDED', code: 'SOURCE_NOT_FOUND', rowCount: 0 })
      expect(byId.get(unresolved)).toEqual({ catalogId: unresolved, status: 'EXCLUDED', code: 'SOURCE_NOT_FOUND', rowCount: 0 })
      expect(result.sources.map(s => s.catalogId)).toEqual([a, b, c, unresolved].sort())
      expect(new Set(result.records.map(r => r.sourceCatalogId))).toEqual(new Set([a, b]))
      const order = result.records.map(r => `${r.occurredAtUtc}|${r.sourceCatalogId}|${r.seriesKey}|${r.recordId}`)
      expect(order).toEqual([...order].sort())
      const again = await t.service.runMany(ACTOR, scope, [a, unresolved, c, b].map(catalogId => ({ ...base, catalogId })), { mode: 'ROOT_AGGREGATION' })
      expect(again.records).toEqual(result.records)
      expect(again.sources).toEqual(result.sources)
    })
    it('EXPLICIT multi-source: ONE rejected source blocks the whole request — nothing is read or returned', async () => {
      const t = await build(makePort)
      const a = await t.source(T_A)
      const b = await t.source(T_B)
      const base = { table: 'ENERJI', columns: ['ENDEKS1'], valueType: 'INDEX' as const, dateColumn: 'TARIH', timeColumn: 'SAAT', startAt: START, endAt: END, interval: 'HOURLY' as const }
      const err = await code(t.service.runMany(ACTOR, scopeOf(T_ROOT, T_A, T_B), [{ ...base, catalogId: a }, { ...base, catalogId: b, columns: ['NOPE'] }], { mode: 'EXPLICIT' }))
      expect(err).toBe('COLUMN_NOT_ALLOWED')
      expect(t.h.calls()).toBe(0)
      expect(t.audit.map(e => [e.entityId, e.actionCode, e.reasonCode]).sort()).toEqual(
        [
          [a, 'SCADA_QUERY_DENIED', 'MULTI_SOURCE_REQUEST_BLOCKED'],
          [b, 'SCADA_QUERY_DENIED', 'COLUMN_NOT_ALLOWED'],
        ].sort(),
      )
    })
    it('EXPLICIT multi-source with an out-of-scope source is blocked as a whole; with all sources fine it returns everything', async () => {
      const t = await build(makePort)
      const a = await t.source(T_A)
      const b = await t.source(T_B)
      const c = await t.source(T_C)
      const base = { table: 'ENERJI', columns: ['ENDEKS1'], valueType: 'INDEX' as const, dateColumn: 'TARIH', timeColumn: 'SAAT', startAt: START, endAt: END, interval: 'HOURLY' as const }
      const scope = scopeOf(T_ROOT, T_A, T_B)
      expect(await code(t.service.runMany(ACTOR, scope, [a, b, c].map(catalogId => ({ ...base, catalogId })), { mode: 'EXPLICIT' }))).toBe('SOURCE_NOT_FOUND')
      expect(t.h.calls()).toBe(0)
      const ok = await t.service.runMany(ACTOR, scope, [a, b].map(catalogId => ({ ...base, catalogId })), { mode: 'EXPLICIT' })
      expect(ok).toMatchObject({ mode: 'EXPLICIT', complete: true })
      expect(ok.sources.map(s => s.status)).toEqual(['READ', 'READ'])
      expect(t.h.calls()).toBe(2)
    })
    it('multi-source input is validated as a whole (bad mode, mixed interval, duplicates, empty, forbidden fields)', async () => {
      const t = await build(makePort)
      const a = await t.source(T_A)
      const base = { catalogId: a, table: 'ENERJI', columns: ['ENDEKS1'], valueType: 'INDEX' as const, dateColumn: 'TARIH', timeColumn: 'SAAT', startAt: START, endAt: END, interval: 'HOURLY' as const }
      const scope = scopeOf(T_A)
      const explicit = { mode: 'EXPLICIT' as const }
      expect(await code(t.service.runMany(ACTOR, scope, [], explicit))).toBe('INVALID_REQUEST')
      expect(await code(t.service.runMany(ACTOR, scope, [base], { mode: 'ALL' } as never))).toBe('INVALID_REQUEST')
      expect(await code(t.service.runMany(ACTOR, scope, [base], undefined as never))).toBe('INVALID_REQUEST')
      expect(await code(t.service.runMany(ACTOR, scope, [base, base], explicit))).toBe('INVALID_REQUEST')
      expect(await code(t.service.runMany(ACTOR, scope, [base, { ...base, catalogId: '99999999-9999-4999-8999-999999999999', interval: 'DAILY' }], explicit))).toBe('INVALID_REQUEST')
      expect(await code(t.service.runMany(ACTOR, scope, [{ ...base, sql: 'x' } as never], explicit))).toBe('INVALID_REQUEST')
      expect(t.h.calls()).toBe(0)
    })
    it('24 + 25. concurrent queries of different tenants do not leak state into each other', async () => {
      const t = await build(makePort)
      const a = await t.source(T_A)
      const b = await t.source(T_B)
      t.h.setRows(a, [{ TARIH: '2026-01-15', SAAT: '04:00:00', ENDEKS1: 111, ENDEKS2: 1 }])
      t.h.setRows(b, [{ TARIH: '2026-01-15', SAAT: '04:00:00', ENDEKS1: 222, ENDEKS2: 2 }])
      const [ra, rb, denied1, denied2] = await Promise.all([
        t.service.run(ACTOR, t.query(a, T_A)),
        t.service.run(ACTOR, t.query(b, T_B)),
        code(t.service.run(ACTOR, t.query(b, T_A))),
        code(t.service.run(ACTOR, t.query(a, T_B))),
      ])
      expect(ra.records.find(r => r.seriesKey === 'ENDEKS1')!.rawValue).toBe(111)
      expect(rb.records.find(r => r.seriesKey === 'ENDEKS1')!.rawValue).toBe(222)
      expect([denied1, denied2]).toEqual(['SOURCE_NOT_FOUND', 'SOURCE_NOT_FOUND'])
    })
  })

  describe('error surface', () => {
    it('errors carry only the static code: no names, SQL, secrets or echoed ranges', async () => {
      const t = await build(makePort)
      const id = await t.source(T_A)
      const errors = await Promise.all([
        t.service.run(ACTOR, t.query(id, T_A, { table: 'SECRET_TABLE' })).catch((e: Error) => e),
        t.service.run(ACTOR, t.query(id, T_A, { columns: ['SECRET_COLUMN'] })).catch((e: Error) => e),
        t.service.run(ACTOR, t.query(id, T_A, { startAt: END, endAt: START })).catch((e: Error) => e),
        t.service.run(ACTOR, t.query('bad')).catch((e: Error) => e),
      ])
      for (const e of errors as Error[]) {
        expect(e).toBeInstanceOf(ScadaQueryError)
        expect(`${e.message}|${JSON.stringify(e)}|${e.stack?.split('\n')[0]}`).not.toMatch(/SECRET|ENERJI|TARIH|MOSB|TEST_SCHEMA|2026|SELECT|bad/)
        expect(e.message).toBe((e as ScadaQueryError).code)
      }
    })
  })
})

describe('adapter-only behaviour (real adapter + mock driver)', () => {
  it('29. cancellation while the driver is running → SCADA_QUERY_CANCELLED', async () => {
    const t = await build(c => {
      const h = adapterPort(c)
      return h
    })
    const id = await t.source(T_A)
    // swap in a hanging driver by rebuilding the adapter with the same catalog
    const hang = new SqlServerReadonlyAdapter({
      catalog: t.catalog,
      driver: { run: (_s, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) },
      audit: { record: async () => undefined },
      correlationId: () => 'srv',
      nowMs: () => Date.now(),
    })
    const service = new ScadaAnalysisQueryService(serviceDeps(t.catalog, hang, []))
    const c = new AbortController()
    const p = code(service.run(ACTOR, t.query(id, T_A, { signal: c.signal })))
    setTimeout(() => c.abort(), 10)
    expect(await p).toBe('SCADA_QUERY_CANCELLED')
  })
  it('23. dates and row cap reach the driver only as bound parameters; the SQL text carries no value', async () => {
    const seen: SqlServerStatement[] = []
    const t = await build(c => {
      const h = adapterPort(c)
      return h
    })
    const id = await t.source(T_A)
    const spy = new SqlServerReadonlyAdapter({
      catalog: t.catalog,
      driver: { run: async s => (seen.push(s), { rows: [] }) },
      audit: { record: async () => undefined },
      correlationId: () => 'srv',
      nowMs: () => Date.now(),
    })
    await new ScadaAnalysisQueryService(serviceDeps(t.catalog, spy, [])).run(ACTOR, t.query(id))
    expect(seen).toHaveLength(1)
    expect(seen[0]!.text).toMatch(/@rangeFrom/)
    expect(seen[0]!.text).not.toMatch(/2026|MOSB|Istanbul/)
    expect(seen[0]!.params).toMatchObject({ rangeFrom: '2026-01-15', rangeTo: '2026-01-16' })
    expect(seen[0]!.database).toBe('MOSB ENERJI DB')
  })
})

describe.each([
  ['SqlServerReadonlyAdapter + mock driver', adapterPort],
  ['mock adapter port', mockPort],
])('single audit boundary (Q-W526) — %s', (_label, makePort) => {
  const only = (t: Awaited<ReturnType<typeof build>>) => {
    expect(t.audit).toHaveLength(1)
    return t.audit[0]!
  }

  it('a success is audited exactly once (SCADA_QUERY_SUCCEEDED) by the service; the adapter writes nothing', async () => {
    const t = await build(makePort)
    const id = await t.source(T_A)
    const r = await t.service.run(ACTOR, t.query(id))
    expect(only(t)).toMatchObject({
      actionCode: 'SCADA_QUERY_SUCCEEDED',
      entityType: 'ScadaAnalysisQuery',
      entityId: id,
      actorId: 'actor-1',
      tenantId: T_A,
      customerRootTenantId: T_ROOT,
      reasonCode: 'OK',
      rowCount: ROWS.length,
      columnCount: 4,
      limitReason: null,
      correlationId: 'srv-corr-1',
    })
    expect(typeof t.audit[0]!.durationMs).toBe('number')
    expect(t.h.adapterAudit()).toBe(0)
    expect(r.records.length).toBeGreaterThan(0)
  })

  it.each([
    ['unverified source', async (t: Awaited<ReturnType<typeof build>>) => ({ id: await t.source(T_A, {}, false), over: {} }), 'SOURCE_NOT_VERIFIED', null],
    ['table outside the catalog', async (t: Awaited<ReturnType<typeof build>>) => ({ id: await t.source(T_A), over: { table: 'SECRET_T' } }), 'TABLE_NOT_ALLOWED', null],
    ['column outside the catalog', async (t: Awaited<ReturnType<typeof build>>) => ({ id: await t.source(T_A), over: { columns: ['SECRET_C'] } }), 'COLUMN_NOT_ALLOWED', null],
    ['time zone missing', async (t: Awaited<ReturnType<typeof build>>) => ({ id: await t.source(T_A, { sourceTimeZone: undefined }), over: {} }), 'SOURCE_TIMEZONE_REQUIRED', null],
    ['limit profile missing', async (t: Awaited<ReturnType<typeof build>>) => ({ id: await t.source(T_A, { limitProfile: undefined }), over: {} }), 'SOURCE_LIMIT_PROFILE_REQUIRED', null],
    ['invalid range', async (t: Awaited<ReturnType<typeof build>>) => ({ id: await t.source(T_A), over: { startAt: END, endAt: START } }), 'TIME_RANGE_INVALID', null],
    ['range above the limit', async (t: Awaited<ReturnType<typeof build>>) => ({ id: await t.source(T_A), over: { endAt: new Date(START.getTime() + LIMITS.maxRangeMs) } }), 'TIME_RANGE_LIMIT_EXCEEDED', 'TIME_RANGE_LIMIT'],
    ['forbidden request field', async (t: Awaited<ReturnType<typeof build>>) => ({ id: await t.source(T_A), over: { sql: 'DROP TABLE x' } }), 'INVALID_REQUEST', null],
    ['other tenant', async (t: Awaited<ReturnType<typeof build>>) => ({ id: await t.source(T_B), over: {} }), 'SOURCE_NOT_FOUND', null],
  ])('a rejection that never reaches the adapter is STILL audited once as SCADA_QUERY_DENIED: %s', async (_n, arrange, expected, limitReason) => {
    const t = await build(makePort)
    const { id, over } = await arrange(t)
    expect(await code(t.service.run(ACTOR, t.query(id, T_A, over)))).toBe(expected)
    expect(only(t)).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED', reasonCode: expected, limitReason, tenantId: T_A, entityId: id, rowCount: null, columnCount: null })
    expect(t.h.calls()).toBe(0)
    expect(t.h.adapterAudit()).toBe(0)
    expect(JSON.stringify(t.audit)).not.toMatch(/SECRET|ENERJI|TARIH|SAAT|ENDEKS|MOSB|SELECT|DROP|2026/)
  })

  it('a missing buffer configuration is audited as DENIED / QUERY_WINDOW_CONFIGURATION_REQUIRED', async () => {
    const t = await build(makePort, { buffer: null })
    const id = await t.source(T_A)
    expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('QUERY_WINDOW_CONFIGURATION_REQUIRED')
    expect(only(t)).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED', reasonCode: 'QUERY_WINDOW_CONFIGURATION_REQUIRED' })
  })

  it.each([undefined, null, 'x', 42, [], { catalogId: 'MOSB ENERJI DB' }, { catalogId: "x'; DROP--", tenantScope: scopeOf(T_A) }])('a malformed request %j is audited with entityId = null (never the raw input)', async bad => {
    const t = await build(makePort)
    await t.source(T_A)
    const e = await code(t.service.run(ACTOR, bad as never))
    expect(['INVALID_REQUEST', 'INVALID_CATALOG_ID']).toContain(e)
    const entry = only(t)
    expect(entry).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED', entityId: null, reasonCode: e })
    expect(JSON.stringify(t.audit)).not.toMatch(/DROP|MOSB|0000-0000/)
    expect(t.h.calls()).toBe(0)
  })

  it('an unreadable scope is audited with null tenant fields (no placeholder)', async () => {
    const t = await build(makePort)
    const id = await t.source(T_A)
    await code(t.service.run(ACTOR, { ...t.query(id), tenantScope: 'x' } as never))
    expect(only(t)).toMatchObject({ tenantId: null, customerRootTenantId: null, entityId: id, reasonCode: 'INVALID_REQUEST' })
  })

  it('an adapter LIMIT denial is audited DENIED with the adapter reason and limitReason; the caller gets the static failure code', async () => {
    const t = await build(makePort)
    const id = await t.source(T_A)
    ;(t.h.port as { readUnaudited: unknown }).readUnaudited = async () => ({ ok: false, code: 'ROW_LIMIT_EXCEEDED', outcome: 'DENIED', limitReason: 'ROW_LIMIT', durationMs: 3 })
    expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('SCADA_ADAPTER_FAILED')
    expect(only(t)).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED', reasonCode: 'ROW_LIMIT_EXCEEDED', limitReason: 'ROW_LIMIT' })
  })

  it('an adapter failure is audited FAILED; a cancellation is FAILED + reasonCode CANCELLED (Q-W520)', async () => {
    const t = await build(makePort)
    const id = await t.source(T_A)
    ;(t.h.port as { readUnaudited: unknown }).readUnaudited = async () => ({ ok: false, code: 'SOURCE_UNAVAILABLE', outcome: 'FAILED', limitReason: null, durationMs: 1 })
    expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('SCADA_ADAPTER_FAILED')
    ;(t.h.port as { readUnaudited: unknown }).readUnaudited = async () => ({ ok: false, code: 'CANCELLED', outcome: 'CANCELLED', limitReason: null, durationMs: 1 })
    expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('SCADA_QUERY_CANCELLED')
    const c = new AbortController()
    c.abort()
    expect(await code(t.service.run(ACTOR, t.query(id, T_A, { signal: c.signal })))).toBe('SCADA_QUERY_CANCELLED')
    expect(t.audit.map(e => [e.actionCode, e.reasonCode])).toEqual([
      ['SCADA_QUERY_FAILED', 'SOURCE_UNAVAILABLE'],
      ['SCADA_QUERY_FAILED', 'CANCELLED'],
      ['SCADA_QUERY_FAILED', 'CANCELLED'],
    ])
  })

  it('FAIL-CLOSED: if the success record cannot be written, no data is returned (AUDIT_FAILED); a denial keeps its own error', async () => {
    const t = await build(makePort, { auditFails: true })
    const id = await t.source(T_A)
    expect(await code(t.service.run(ACTOR, t.query(id)))).toBe('AUDIT_FAILED')
    expect(t.h.calls()).toBe(1) // it ran, but the result never reaches the caller
    expect(await code(t.service.run(ACTOR, t.query(id, T_A, { table: 'X' })))).toBe('TABLE_NOT_ALLOWED')
    const err = await t.service.run(ACTOR, t.query(id)).catch((e: Error) => e)
    expect(err).toBeInstanceOf(ScadaQueryError)
    expect((err as Error).message).toBe('AUDIT_FAILED')
  })

  it('when only the SUCCESS record fails, the failure itself is recorded best-effort as SCADA_QUERY_FAILED / AUDIT_FAILED (no new action code)', async () => {
    const t = await build(makePort)
    const id = await t.source(T_A)
    let first = true
    const audit: ScadaQueryAuditEntry[] = []
    const deps = serviceDeps(t.catalog, t.h.port, audit)
    const service = new ScadaAnalysisQueryService({
      ...deps,
      audit: {
        record: async e => {
          if (first) {
            first = false
            throw new Error('transient')
          }
          audit.push(e)
        },
      },
    })
    expect(await code(service.run(ACTOR, t.query(id)))).toBe('AUDIT_FAILED')
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ actionCode: 'SCADA_QUERY_FAILED', reasonCode: 'AUDIT_FAILED', entityId: id, rowCount: null })
    expect(new Set(audit.map(e => e.actionCode))).toEqual(new Set(['SCADA_QUERY_FAILED']))
  })

  it('a blocked multi-source request uses SCADA_QUERY_DENIED with the REASON code MULTI_SOURCE_REQUEST_BLOCKED', async () => {
    const t = await build(makePort)
    const a = await t.source(T_A)
    const b = await t.source(T_B)
    const base = { table: 'ENERJI', columns: ['ENDEKS1'], valueType: 'INDEX' as const, dateColumn: 'TARIH', timeColumn: 'SAAT', startAt: START, endAt: END, interval: 'HOURLY' as const }
    await code(t.service.runMany(ACTOR, scopeOf(T_ROOT, T_A, T_B), [{ ...base, catalogId: a }, { ...base, catalogId: b, columns: ['NOPE'] }], { mode: 'EXPLICIT' }))
    const blocked = t.audit.find(e => e.entityId === a)!
    expect(blocked).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED', reasonCode: 'MULTI_SOURCE_REQUEST_BLOCKED' })
    expect(new Set(t.audit.map(e => e.actionCode))).toEqual(new Set(['SCADA_QUERY_DENIED']))
  })

  it('every call gets its own SERVER-generated correlation id; a client one is rejected and never audited', async () => {
    const t = await build(makePort)
    const id = await t.source(T_A)
    await t.service.run(ACTOR, t.query(id))
    await code(t.service.run(ACTOR, t.query(id, T_A, { table: 'X' })))
    expect(await code(t.service.run(ACTOR, t.query(id, T_A, { correlationId: 'client-chosen' })))).toBe('INVALID_REQUEST')
    expect(t.audit.map(e => e.correlationId)).toEqual(['srv-corr-1', 'srv-corr-2', 'srv-corr-3'])
    expect(JSON.stringify(t.audit)).not.toContain('client-chosen')
  })

  it('EXPLICIT / ROOT multi-source: ONE record per source, all sharing the call\'s correlation id', async () => {
    const t = await build(makePort)
    const a = await t.source(T_A)
    const b = await t.source(T_B)
    const c = await t.source(T_C)
    const base = { table: 'ENERJI', columns: ['ENDEKS1'], valueType: 'INDEX' as const, dateColumn: 'TARIH', timeColumn: 'SAAT', startAt: START, endAt: END, interval: 'HOURLY' as const }
    const scope = scopeOf(T_ROOT, T_A, T_B)
    await t.service.runMany(ACTOR, scope, [a, b, c].map(catalogId => ({ ...base, catalogId })), { mode: 'ROOT_AGGREGATION' })
    expect(t.audit.map(e => [e.entityId, e.actionCode, e.reasonCode]).sort()).toEqual(
      [
        [a, 'SCADA_QUERY_SUCCEEDED', 'OK'],
        [b, 'SCADA_QUERY_SUCCEEDED', 'OK'],
        [c, 'SCADA_QUERY_DENIED', 'SOURCE_NOT_FOUND'],
      ].sort(),
    )
    expect(new Set(t.audit.map(e => e.correlationId)).size).toBe(1)
    expect(t.h.adapterAudit()).toBe(0)
  })

  it('ROOT: a source whose audit cannot be written loses ITS data and reports FAILED/AUDIT_FAILED; the others are unaffected', async () => {
    const setup = await build(makePort)
    const a = await setup.source(T_A)
    const t = await build(makePort, { auditFailsFor: a })
    const a2 = await t.source(T_A)
    const b2 = await t.source(T_B)
    const t2 = { ...t, service: new ScadaAnalysisQueryService(serviceDeps((t as unknown as { catalog: CatalogService }).catalog, t.h.port, t.audit, { auditFailsFor: a2 })) }
    const base = { table: 'ENERJI', columns: ['ENDEKS1'], valueType: 'INDEX' as const, dateColumn: 'TARIH', timeColumn: 'SAAT', startAt: START, endAt: END, interval: 'HOURLY' as const }
    const r = await t2.service.runMany(ACTOR, scopeOf(T_ROOT, T_A, T_B), [a2, b2].map(catalogId => ({ ...base, catalogId })), { mode: 'ROOT_AGGREGATION' })
    expect(r.sources.find(s => s.catalogId === a2)).toEqual({ catalogId: a2, status: 'FAILED', code: 'AUDIT_FAILED', rowCount: 0 })
    expect(r.sources.find(s => s.catalogId === b2)).toMatchObject({ status: 'READ' })
    expect(r.records.every(x => x.sourceCatalogId === b2)).toBe(true)
    expect(r.complete).toBe(false)
  })

  it('EXPLICIT: an audit failure of any source blocks the whole result', async () => {
    const t = await build(makePort)
    const a = await t.source(T_A)
    const b = await t.source(T_B)
    const service = new ScadaAnalysisQueryService(serviceDeps(t.catalog, t.h.port, [], { auditFailsFor: b }))
    const base = { table: 'ENERJI', columns: ['ENDEKS1'], valueType: 'INDEX' as const, dateColumn: 'TARIH', timeColumn: 'SAAT', startAt: START, endAt: END, interval: 'HOURLY' as const }
    expect(await code(service.runMany(ACTOR, scopeOf(T_ROOT, T_A, T_B), [a, b].map(catalogId => ({ ...base, catalogId })), { mode: 'EXPLICIT' }))).toBe('AUDIT_FAILED')
  })

  it('ROOT: cancellation stops the call; every source is audited (FAILED/CANCELLED)', async () => {
    const t = await build(makePort)
    const a = await t.source(T_A)
    const b = await t.source(T_B)
    const c = new AbortController()
    c.abort()
    const base = { table: 'ENERJI', columns: ['ENDEKS1'], valueType: 'INDEX' as const, dateColumn: 'TARIH', timeColumn: 'SAAT', startAt: START, endAt: END, interval: 'HOURLY' as const }
    expect(await code(t.service.runMany(ACTOR, scopeOf(T_ROOT, T_A, T_B), [a, b].map(catalogId => ({ ...base, catalogId })), { mode: 'ROOT_AGGREGATION', signal: c.signal }))).toBe('SCADA_QUERY_CANCELLED')
    expect(t.audit.map(e => [e.actionCode, e.reasonCode])).toEqual([['SCADA_QUERY_FAILED', 'CANCELLED'], ['SCADA_QUERY_FAILED', 'CANCELLED']])
    expect(t.h.calls()).toBe(0)
  })
})

describe.each([
  ['SqlServerReadonlyAdapter + mock driver', adapterPort],
  ['mock adapter port', mockPort],
])('forward buffer is for INDEX only (Q-W529) — %s', (_label, makePort) => {
  it('REAL_VALUE needs no buffer configuration and adds none to the query window', async () => {
    for (const buffer of [null, undefined, -1] as const) {
      const t = await build(makePort, { buffer })
      const id = await t.source(T_A)
      const r = await t.service.run(ACTOR, t.query(id, T_A, { valueType: 'REAL_VALUE' }))
      expect(r.window.bufferEndAtUtc).toBe(r.window.endAtUtc)
      expect(t.h.lastRequest()!.timeRange.to.getTime()).toBe(END.getTime())
      expect(r.records.some(x => x.isBufferRow)).toBe(false)
      expect(r.records.every(x => Date.parse(x.occurredAtUtc!) < END.getTime())).toBe(true)
    }
  })
  it('INDEX still requires the buffer configuration and adds exactly the configured amount', async () => {
    const missing = await build(makePort, { buffer: null })
    const id0 = await missing.source(T_A)
    expect(await code(missing.service.run(ACTOR, missing.query(id0)))).toBe('QUERY_WINDOW_CONFIGURATION_REQUIRED')
    const t = await build(makePort)
    const id = await t.source(T_A)
    const r = await t.service.run(ACTOR, t.query(id))
    expect(Date.parse(r.window.bufferEndAtUtc) - END.getTime()).toBe(TEST_BUFFER_MS)
  })
  it('the maximum range counts the buffer only for INDEX', async () => {
    const t = await build(makePort)
    const id = await t.source(T_A)
    const exactlyMax = new Date(START.getTime() + LIMITS.maxRangeMs)
    expect(await code(t.service.run(ACTOR, t.query(id, T_A, { valueType: 'REAL_VALUE', endAt: exactlyMax })))).toBe('OK')
    expect(await code(t.service.run(ACTOR, t.query(id, T_A, { valueType: 'INDEX', endAt: exactlyMax })))).toBe('TIME_RANGE_LIMIT_EXCEEDED')
  })
})

describe('loss-free source-local query window (Q-W527) — real adapter + a driver that applies the predicate like SQL', () => {
  /** Emulates the SQL predicate on the naive DATE column: rangeFrom <= TARIH < rangeTo (string compare of YYYY-MM-DD). */
  function predicateDriver(rows: Rows, seen: SqlServerStatement[]) {
    return {
      run: async (s: SqlServerStatement) => {
        seen.push(s)
        const from = String(s.params['rangeFrom'])
        const to = String(s.params['rangeTo'])
        return { rows: rows.filter(r => String(r['TARIH']) >= from && String(r['TARIH']) < to) }
      },
    }
  }
  const boundaryRows: Rows = [
    { TARIH: '2026-01-14', SAAT: '23:30:00', ENDEKS1: 1, ENDEKS2: 1 }, // 20:30Z Jan 14 (before the window)
    { TARIH: '2026-01-15', SAAT: '00:30:00', ENDEKS1: 2, ENDEKS2: 2 }, // 21:30Z Jan 14 — local Jan 15 while UTC date is Jan 14
    { TARIH: '2026-01-15', SAAT: '01:30:00', ENDEKS1: 3, ENDEKS2: 3 }, // 22:30Z Jan 14
    { TARIH: '2026-01-15', SAAT: '03:30:00', ENDEKS1: 4, ENDEKS2: 4 }, // 00:30Z Jan 15 (after buffer end)
  ]

  it('day-boundary records are not lost when the local day differs from the UTC day; the service trims to the exact instants', async () => {
    const seen: SqlServerStatement[] = []
    const t = await build(c => adapterPort(c))
    const id = await t.source(T_A)
    const adapter = new SqlServerReadonlyAdapter({ catalog: t.catalog, driver: predicateDriver(boundaryRows, seen), audit: { record: async () => undefined }, correlationId: () => 'c', nowMs: () => Date.now() })
    const service = new ScadaAnalysisQueryService(serviceDeps(t.catalog, adapter, []))
    const start = new Date('2026-01-14T21:00:00Z') // 00:00 local Jan 15
    const end = new Date('2026-01-14T22:45:00Z')
    const r = await service.run(ACTOR, t.query(id, T_A, { startAt: start, endAt: end }))
    // a naive UTC-date predicate would have been  TARIH >= '2026-01-14' AND TARIH < '2026-01-14'  → nothing at all
    expect(seen[0]!.params).toMatchObject({ rangeFrom: '2026-01-15', rangeTo: '2026-01-16' })
    expect(seen[0]!.paramTypes).toMatchObject({ rangeFrom: 'DATE', rangeTo: 'DATE' })
    const e1 = r.records.filter(x => x.seriesKey === 'ENDEKS1').map(x => [x.occurredAtUtc, x.rawValue, x.isBufferRow])
    expect(e1).toEqual([
      ['2026-01-14T21:30:00.000Z', 2, false],
      ['2026-01-14T22:30:00.000Z', 3, false],
    ])
  })

  it('the source zone and the window travel together: the adapter builds the local window from the CATALOG zone (Berlin here), not from UTC', async () => {
    const seen: SqlServerStatement[] = []
    const t = await build(c => adapterPort(c))
    const id = await t.source(T_A, { sourceTimeZone: 'Europe/Berlin' })
    const adapter = new SqlServerReadonlyAdapter({ catalog: t.catalog, driver: predicateDriver([], seen), audit: { record: async () => undefined }, correlationId: () => 'c', nowMs: () => Date.now() })
    const service = new ScadaAnalysisQueryService(serviceDeps(t.catalog, adapter, []))
    // 2026-03-28T23:30Z is 00:30 local (CET, +1) on the 29th, the day of the spring-forward
    await service.run(ACTOR, t.query(id, T_A, { valueType: 'REAL_VALUE', startAt: new Date('2026-03-28T23:30:00Z'), endAt: new Date('2026-03-29T01:30:00Z') }))
    expect(seen[0]!.params).toMatchObject({ rangeFrom: '2026-03-29', rangeTo: '2026-03-30' })
  })

  it('a single DATETIME column gets the exact naive local bounds as DATETIME2 (no zone suffix)', async () => {
    const seen: SqlServerStatement[] = []
    const t = await build(c => adapterPort(c))
    const id = await t.source(
      T_A,
      { tables: [{ schema: 'TEST_SCHEMA', name: 'ENERJI', columns: [{ name: 'ZAMAN', kind: 'DATETIME' }, { name: 'ENDEKS1', kind: 'NUMERIC' }], dateColumn: 'ZAMAN', timeColumn: 'ZAMAN' }] },
      true,
      { connectionOk: true, databaseExists: true, tables: [{ name: 'ENERJI', schemaExists: true, exists: true, columns: [{ name: 'ZAMAN', exists: true, observedClass: 'DATETIME' }, { name: 'ENDEKS1', exists: true, observedClass: 'NUMERIC' }] }] },
    )
    const adapter = new SqlServerReadonlyAdapter({ catalog: t.catalog, driver: { run: async s => (seen.push(s), { rows: [] }) }, audit: { record: async () => undefined }, correlationId: () => 'c', nowMs: () => Date.now() })
    await new ScadaAnalysisQueryService(serviceDeps(t.catalog, adapter, [])).run(ACTOR, t.query(id, T_A, { columns: ['ENDEKS1'], dateColumn: 'ZAMAN', timeColumn: 'ZAMAN', valueType: 'REAL_VALUE' }))
    expect(seen[0]!.params).toMatchObject({ rangeFrom: '2026-01-15T03:00:00.000', rangeTo: '2026-01-15T06:00:00.000' })
    expect(seen[0]!.paramTypes).toMatchObject({ rangeFrom: 'DATETIME2', rangeTo: 'DATETIME2' })
    expect(JSON.stringify(seen[0]!.params)).not.toMatch(/Z"/)
  })
})
