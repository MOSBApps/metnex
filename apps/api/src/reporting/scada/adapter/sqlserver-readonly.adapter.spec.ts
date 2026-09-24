import { CatalogService } from '../catalog/catalog.service'
import type { PreflightObservation, RegisterSourceInput } from '../catalog/catalog.types'
import { InMemoryCatalogRepository } from '../catalog/in-memory-catalog.repository'
import type { TenantRecord } from '../catalog/tenant-guards'
import { ScadaAdapterError } from './scada-adapter.errors'
import type { ScadaQueryAuditEntry, ScadaReadRequest, ScadaReadScope } from './scada-readonly.port'
import type { SqlServerStatement } from './sqlserver-driver.port'
import { SqlServerReadonlyAdapter } from './sqlserver-readonly.adapter'

const ACTOR = { id: 'actor-1' }
const CAT = { id: 'cat-admin' }
const T_ROOT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const T_A = '11111111-1111-4111-8111-111111111111'
const T_B = '22222222-2222-4222-8222-222222222222'
const T_C = '33333333-3333-4333-8333-333333333333'
const LIMITS = { timeoutMs: 50, maxRows: 3, maxColumns: 3, maxPayloadBytes: 400, maxRangeMs: 86_400_000, poolSize: 2, maxConcurrent: 1 }
const FROM = new Date('2026-01-01T00:00:00Z')
const TO = new Date('2026-01-01T06:00:00Z')

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
  tables: [{ schema: 'TEST_SCHEMA', name: 'ENERJI', columns: [{ name: 'TARIH', kind: 'DATE' }, { name: 'SAAT', kind: 'TIME' }, { name: 'DEGER', kind: 'NUMERIC' }], dateColumn: 'TARIH', timeColumn: 'SAAT' }],
  ...over,
})
const observation = (): PreflightObservation => ({
  connectionOk: true,
  databaseExists: true,
  tables: [{ name: 'ENERJI', schemaExists: true, exists: true, columns: [{ name: 'TARIH', exists: true, observedClass: 'DATE' }, { name: 'SAAT', exists: true, observedClass: 'TIME' }, { name: 'DEGER', exists: true, observedClass: 'NUMERIC' }] }],
})
const scopeOf = (tenantId: string, ...more: string[]): ScadaReadScope => ({ tenantId, customerRootTenantId: T_ROOT, dataScopeTenantIds: [tenantId, ...more] })
const req = (catalogId: string, over: Record<string, unknown> = {}): ScadaReadRequest =>
  ({ catalogId, table: 'ENERJI', columns: ['TARIH', 'DEGER'], timeRange: { from: FROM, to: TO }, ...over }) as never

const HANG = (_s: SqlServerStatement, signal: AbortSignal) => new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('Server=x;Password=leak')), { once: true }))

async function harness(opts: { auditFails?: boolean } = {}) {
  const repository = new InMemoryCatalogRepository()
  let n = 0
  let c = 0
  const catalog = new CatalogService({
    repository,
    authorizer: { authorize: async () => true },
    audit: { record: async () => undefined },
    tenants: { find: async id => tenants[id] ?? null },
    clock: { now: () => new Date('2026-01-01T00:00:00Z') },
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    correlationId: () => `catalog-${++c}`,
  })
  const calls: SqlServerStatement[] = []
  let impl: (s: SqlServerStatement, signal: AbortSignal) => Promise<{ rows: Record<string, unknown>[] }> = async () => ({ rows: [{ TARIH: '2026-01-01', DEGER: 1 }] })
  const driver = {
    run: (s: SqlServerStatement, signal: AbortSignal) => {
      calls.push(s)
      return impl(s, signal)
    },
  }
  const audit: ScadaQueryAuditEntry[] = []
  let k = 0
  const adapter = new SqlServerReadonlyAdapter({
    catalog,
    driver,
    audit: {
      record: async e => {
        if (opts.auditFails) throw new Error('audit down')
        audit.push(e)
      },
    },
    correlationId: () => `srv-corr-${++k}`,
    nowMs: () => Date.now(),
  })
  /** verified + mapped source */
  async function source(tenantId: string | null, over: Partial<RegisterSourceInput> = {}, verify = true) {
    const s = await catalog.registerSource(CAT, declared(over))
    let v = s.version
    if (tenantId) v = (await catalog.approveMapping(CAT, s.id, v, { tenantId, approvalRef: 'APPR-1' })).version
    if (verify) await catalog.applyPreflight(CAT, s.id, v, observation())
    return s.id
  }
  return { adapter, catalog, calls, audit, source, setDriver: (f: typeof impl) => void (impl = f) }
}

const fail = async (p: Promise<unknown>) => p.then(() => null, (e: ScadaAdapterError) => e)

describe('read gate: nothing reaches the driver unless the catalog hands out the source', () => {
  it('1. UNVERIFIED source', async () => {
    const h = await harness()
    const id = await h.source(T_A, {}, false)
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id))))?.code).toBe('NOT_VERIFIED')
    expect(h.calls).toHaveLength(0)
  })
  it('2. BLOCKED source', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    await h.catalog.blockSource(CAT, id, 3, 'MANUAL_BLOCK')
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id))))?.code).toBe('BLOCKED')
    expect(h.calls).toHaveLength(0)
  })
  it('3. unverified / unknown column', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id, { columns: ['NOPE'] }))))?.code).toBe('COLUMN_UNKNOWN')
    const cur = (await h.catalog.history(id)).at(-1)!
    const tampered = structuredClone(cur)
    tampered.version += 1
    tampered.tables[0]!.columns[2]!.verification = 'UNVERIFIED'
    await (h.catalog as unknown as { deps: { repository: InMemoryCatalogRepository } }).deps.repository.withTransaction(tx => tx.saveVersion(tampered))
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id, { columns: ['DEGER'] }))))?.code).toBe('COLUMN_NOT_VERIFIED')
    expect(h.calls).toHaveLength(0)
  })
  it('4. unresolved mapping / no mapping', async () => {
    const h = await harness()
    const id = await h.source(null)
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id))))?.code).toBe('SOURCE_NOT_FOUND')
    const mapped = await h.source(T_A, { physicalDatabase: 'OTHER DB' })
    const cur = (await h.catalog.history(mapped)).at(-1)!
    await h.catalog.revokeMapping(CAT, mapped, cur.version, { tenantId: T_A })
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(mapped))))?.code).toBe('MAPPING_UNRESOLVED')
    expect(h.calls).toHaveLength(0)
  })
  it('5. blocked mapping and suspended tenant', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    const original = tenants[T_A]!
    tenants[T_A] = { ...original, status: 'SUSPENDED' }
    try {
      expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id))))?.code).toBe('TENANT_NOT_ACTIVE')
    } finally {
      tenants[T_A] = original
    }
    const cur = (await h.catalog.history(id)).at(-1)!
    await h.catalog.blockMapping(CAT, id, cur.version, { tenantId: T_A })
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id))))?.code).toBe('MAPPING_UNRESOLVED')
    expect(h.calls).toHaveLength(0)
  })
  it('6. MOSEDAŞ is not a tenant (read-time re-check)', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    const original = tenants[T_A]!
    tenants[T_A] = { ...original, slug: 'Mosedaş' }
    try {
      expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id))))?.code).toBe('MOSEDAS_IS_NOT_A_TENANT')
    } finally {
      tenants[T_A] = original
    }
    expect(h.calls).toHaveLength(0)
  })
  it('7. platform root cannot read outside its scope', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_ROOT), req(id))))?.code).toBe('SOURCE_NOT_FOUND')
    expect(h.calls).toHaveLength(0)
  })
  it('8. tenant A cannot reach tenant B source', async () => {
    const h = await harness()
    const b = await h.source(T_B)
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(b))))?.code).toBe('SOURCE_NOT_FOUND')
    expect(h.calls).toHaveLength(0)
  })
  it('9. root aggregation reads only the sources of tenants in its scope', async () => {
    const h = await harness()
    const a = await h.source(T_A)
    const b = await h.source(T_B, { physicalDatabase: 'DB B' })
    const c = await h.source(T_C, { physicalDatabase: 'DB C' })
    const scope = scopeOf(T_ROOT, T_A, T_B)
    expect((await h.adapter.read(ACTOR, scope, req(a))).rowCount).toBe(1)
    expect((await h.adapter.read(ACTOR, scope, req(b))).rowCount).toBe(1)
    expect((await fail(h.adapter.read(ACTOR, scope, req(c))))?.code).toBe('SOURCE_NOT_FOUND')
    expect((await h.adapter.listSources(scope)).length).toBe(2)
    expect(h.calls.map(c => c.database)).toEqual(['MOSB ENERJI DB', 'DB B'])
  })
})

describe('identifier safety and parameter binding', () => {
  it.each([
    ['database', { database: 'MASTER' }],
    ['schema', { schema: 'sys' }],
    ['raw sql', { sql: 'SELECT 1' }],
    ['filters', { filters: { a: 1 } }],
    ['physical name as catalog id', { catalogId: 'MOSB ENERJI DB' }],
  ])('10. request field %s is rejected without touching the driver', async (_n, extra) => {
    const h = await harness()
    const id = await h.source(T_A)
    const r = await fail(h.adapter.read(ACTOR, scopeOf(T_A), { ...req(id), ...extra } as never))
    expect(r?.outcome).toBe('DENIED')
    expect(h.calls).toHaveLength(0)
  })
  it.each(['ENERJI; DROP TABLE x', 'ENERJI]--', '[ENERJI]', 'OTHER_TABLE', 'sys.objects'])('11. table %j outside the allowlist', async table => {
    const h = await harness()
    const id = await h.source(T_A)
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id, { table }))))?.code).toBe('TABLE_UNKNOWN')
    expect(h.calls).toHaveLength(0)
  })
  it.each(["DEGER; DROP TABLE x", 'DEGER]', '*', 'DEGER, PASSWORD'])('11. column %j outside the allowlist', async column => {
    const h = await harness()
    const id = await h.source(T_A)
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id, { columns: [column] }))))?.code).toBe('COLUMN_UNKNOWN')
    expect(h.calls).toHaveLength(0)
  })
  it('12 + 13 + 14. spaced physical name goes only in `database`; range and row cap are bound parameters; text is a plain SELECT', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    await h.adapter.read(ACTOR, scopeOf(T_A), req(id))
    const s = h.calls[0]!
    expect(s.database).toBe('MOSB ENERJI DB')
    expect(s.text).not.toMatch(/MOSB|ENERJI DB/)
    expect(s.text).toBe('SELECT TOP (@rowCap) [TARIH], [DEGER] FROM [TEST_SCHEMA].[ENERJI] WHERE [TARIH] >= @rangeFrom AND [TARIH] < @rangeTo ORDER BY [TARIH], [SAAT]')
    expect(s.params).toEqual({ rangeFrom: '2026-01-01', rangeTo: '2026-01-02', rowCap: LIMITS.maxRows + 1 })
    expect(s.text).not.toContain('2026')
  })
  it('14. injection-looking time values cannot exist as strings (dates are validated)', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id, { timeRange: { from: "2026-01-01'; DROP TABLE x;--", to: TO } }))))?.code).toBe('INVALID_REQUEST')
    expect(h.calls).toHaveLength(0)
  })
})

describe('limits, timeout, cancellation', () => {
  it('15. timeout → safe FAILED error, driver aborted, no driver text leaks', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    let aborted = false
    h.setDriver((s, signal) => {
      signal.addEventListener('abort', () => (aborted = true))
      return HANG(s, signal)
    })
    const e = await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id)))
    expect(e).toMatchObject({ code: 'TIMEOUT', outcome: 'FAILED', limitReason: 'TIMEOUT' })
    expect(e!.message).not.toMatch(/Server|Password|leak/)
    expect(aborted).toBe(true)
    expect(h.audit.at(-1)).toMatchObject({ actionCode: 'SCADA_QUERY_FAILED', reasonCode: 'TIMEOUT' })
  })
  it('16. caller cancellation → CANCELLED (also when already aborted)', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    h.setDriver(HANG)
    const ctl = new AbortController()
    const p = fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id, { signal: ctl.signal })))
    setTimeout(() => ctl.abort(), 5)
    expect(await p).toMatchObject({ code: 'CANCELLED', outcome: 'CANCELLED' })
    expect(h.audit.at(-1)).toMatchObject({ actionCode: 'SCADA_QUERY_FAILED', reasonCode: 'CANCELLED' })
    const pre = new AbortController()
    pre.abort()
    expect(await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id, { signal: pre.signal })))).toMatchObject({ code: 'CANCELLED' })
    expect(h.calls).toHaveLength(1) // the pre-aborted call never reached the driver
  })
  it('driver error → SOURCE_UNAVAILABLE with a static message only', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    h.setDriver(async () => {
      throw new Error('Server=host;Password=leak SELECT secret')
    })
    const e = await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id)))
    expect(e).toMatchObject({ code: 'SOURCE_UNAVAILABLE', outcome: 'FAILED' })
    expect(JSON.stringify(h.audit)).not.toMatch(/leak|Server|host/)
  })
  it('17. row limit → DENIED', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    h.setDriver(async () => ({ rows: Array.from({ length: LIMITS.maxRows + 1 }, () => ({ TARIH: 'd', DEGER: 1 })) }))
    expect(await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id)))).toMatchObject({ code: 'ROW_LIMIT_EXCEEDED', outcome: 'DENIED', limitReason: 'ROW_LIMIT' })
    expect(h.audit.at(-1)).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED', limitReason: 'ROW_LIMIT' })
  })
  it('18. payload limit → DENIED', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    h.setDriver(async () => ({ rows: [{ TARIH: 'x'.repeat(LIMITS.maxPayloadBytes + 1), DEGER: 1 }] }))
    expect(await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id)))).toMatchObject({ code: 'PAYLOAD_LIMIT_EXCEEDED', outcome: 'DENIED' })
  })
  it('column count and date range limits → DENIED before the driver', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    expect(await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id, { columns: ['TARIH', 'SAAT', 'DEGER', 'DEGER2'] })))).toMatchObject({ outcome: 'DENIED' })
    const many = await h.source(T_B, { physicalDatabase: 'DB B', limitProfile: { ...LIMITS, maxColumns: 1 } })
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_B), req(many))))?.code).toBe('COLUMN_LIMIT_EXCEEDED')
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id, { timeRange: { from: FROM, to: new Date(FROM.getTime() + LIMITS.maxRangeMs + 1) } }))))?.code).toBe('TIME_RANGE_EXCEEDED')
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id, { timeRange: { from: TO, to: FROM } }))))?.code).toBe('TIME_RANGE_INVALID')
    expect(h.calls).toHaveLength(0)
  })
  it('missing limit profile / time zone never reaches the driver', async () => {
    const h = await harness()
    const id = await h.source(T_A, { limitProfile: undefined })
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id))))?.code).toBe('LIMIT_PROFILE_INCOMPLETE')
    const tz = await h.source(T_B, { physicalDatabase: 'DB B', sourceTimeZone: undefined })
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_B), req(tz))))?.code).toBe('TIMEZONE_UNDEFINED')
    expect(h.calls).toHaveLength(0)
  })
  it('19. concurrency limit → DENIED and audited; slot is released afterwards', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    let release!: () => void
    h.setDriver(() => new Promise(resolve => (release = () => resolve({ rows: [] }))))
    const first = h.adapter.read(ACTOR, scopeOf(T_A), req(id))
    await new Promise(r => setTimeout(r, 5))
    const second = await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id)))
    expect(second).toMatchObject({ code: 'CONCURRENCY_LIMIT_EXCEEDED', outcome: 'DENIED', limitReason: 'CONCURRENCY_LIMIT' })
    expect(h.audit.at(-1)).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED', reasonCode: 'CONCURRENCY_LIMIT_EXCEEDED' })
    release()
    await first
    h.setDriver(async () => ({ rows: [] }))
    await expect(h.adapter.read(ACTOR, scopeOf(T_A), req(id))).resolves.toBeDefined()
  })
})

describe('audit contract (DEC-0015)', () => {
  it('20. every successful query is audited exactly once with the fixed field set', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    const r = await h.adapter.read(ACTOR, scopeOf(T_A), req(id))
    expect(h.audit).toHaveLength(1)
    expect(h.audit[0]).toMatchObject({
      actionCode: 'SCADA_QUERY_SUCCEEDED',
      entityType: 'ScadaAnalysisQuery',
      entityId: id,
      actorId: 'actor-1',
      tenantId: T_A,
      customerRootTenantId: T_ROOT,
      reasonCode: 'OK',
      rowCount: 1,
      columnCount: 2,
      limitReason: null,
      correlationId: r.correlationId,
    })
    expect(Object.keys(h.audit[0]!).sort()).toEqual(['actionCode', 'actorId', 'columnCount', 'correlationId', 'customerRootTenantId', 'durationMs', 'entityId', 'entityType', 'limitReason', 'reasonCode', 'rowCount', 'tenantId'])
  })
  it('21. audit failure → no result is returned (fail-closed) and the error is static', async () => {
    const h = await harness({ auditFails: true })
    const id = await h.source(T_A)
    const e = await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id)))
    expect(e).toMatchObject({ code: 'AUDIT_FAILED', outcome: 'FAILED' })
    expect(h.calls).toHaveLength(1)
  })
  it('a failing audit never turns a denial into a success', async () => {
    const h = await harness({ auditFails: true })
    const id = await h.source(T_B)
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id))))?.code).toBe('SOURCE_NOT_FOUND')
  })
  it('22. no credential / SQL / schema / table / column / parameter / row data in any audit entry', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    await h.adapter.read(ACTOR, scopeOf(T_A), req(id))
    h.setDriver(async () => {
      throw new Error('Server=host;Password=leak')
    })
    await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id)))
    await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(id, { table: 'x; DROP' })))
    const text = JSON.stringify(h.audit)
    expect(text).not.toMatch(/MOSB|ENERJI|TARIH|SAAT|DEGER|SELECT|DROP|Server|Password|leak|2026|rowCap/)
  })
  it('23. server-generated correlation id on every outcome; a client-supplied id is rejected', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    const ok = await h.adapter.read(ACTOR, scopeOf(T_A), req(id))
    const denied = await fail(h.adapter.read(ACTOR, scopeOf(T_B), req(id)))
    const injected = await fail(h.adapter.read(ACTOR, scopeOf(T_A), { ...req(id), correlationId: 'client-chosen' } as never))
    expect(ok.correlationId).toMatch(/^srv-corr-/)
    expect(denied!.correlationId).toMatch(/^srv-corr-/)
    expect(injected).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(injected!.correlationId).toMatch(/^srv-corr-/)
    expect(h.audit.map(e => e.correlationId)).toEqual([ok.correlationId, denied!.correlationId, injected!.correlationId])
    expect(JSON.stringify(h.audit)).not.toContain('client-chosen')
  })
  it('an invalid catalog id is DENIED/INVALID_CATALOG_ID with entityId=null — no nil UUID, no raw input in audit', async () => {
    const h = await harness()
    for (const bad of ["x'; DROP TABLE y;--", 'MOSB ENERJI DB', '', 42, null, undefined]) {
      const e = await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(bad as never)))
      expect(e).toMatchObject({ code: 'INVALID_CATALOG_ID', outcome: 'DENIED' })
    }
    expect(h.audit).toHaveLength(6)
    for (const entry of h.audit) expect(entry).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED', entityId: null, reasonCode: 'INVALID_CATALOG_ID' })
    expect(JSON.stringify(h.audit)).not.toMatch(/DROP|MOSB|0000-0000|00000000/)
    expect(h.calls).toHaveLength(0)
  })
  it('a well-formed but unknown catalog UUID is audited under that UUID (SOURCE_NOT_FOUND)', async () => {
    const h = await harness()
    const unknown = '99999999-9999-4999-8999-999999999999'
    await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(unknown)))
    expect(h.audit[0]).toMatchObject({ entityId: unknown, reasonCode: 'SOURCE_NOT_FOUND', actionCode: 'SCADA_QUERY_DENIED' })
  })
  it('a source without a schema never reaches the driver', async () => {
    const h = await harness()
    const noSchema = declared({ physicalDatabase: 'NO SCHEMA DB' })
    delete (noSchema.tables![0] as { schema?: string }).schema
    const s = await h.catalog.registerSource(CAT, noSchema)
    const m = await h.catalog.approveMapping(CAT, s.id, 1, { tenantId: T_A, approvalRef: 'APPR-1' })
    await h.catalog.applyPreflight(CAT, s.id, m.version, observation())
    expect((await fail(h.adapter.read(ACTOR, scopeOf(T_A), req(s.id))))?.code).toBe('NOT_VERIFIED')
    expect(h.calls).toHaveLength(0)
  })
})

describe('no shared per-request state', () => {
  it('24 + 25. concurrent requests of different tenants are isolated and leave no state behind', async () => {
    const h = await harness()
    const a = await h.source(T_A)
    const b = await h.source(T_B, { physicalDatabase: 'DB B' })
    h.setDriver(async s => {
      await new Promise(r => setTimeout(r, s.database === 'DB B' ? 1 : 10))
      return { rows: [{ TARIH: s.database, DEGER: 1 }] }
    })
    const results = await Promise.all([
      h.adapter.read(ACTOR, scopeOf(T_A), req(a)),
      h.adapter.read(ACTOR, scopeOf(T_B), req(b)),
      fail(h.adapter.read(ACTOR, scopeOf(T_A), req(b))),
      fail(h.adapter.read(ACTOR, scopeOf(T_B), req(a))),
    ])
    expect((results[0] as unknown as { rows: { TARIH: string }[] }).rows[0]!.TARIH).toBe('MOSB ENERJI DB')
    expect((results[1] as unknown as { rows: { TARIH: string }[] }).rows[0]!.TARIH).toBe('DB B')
    expect((results[2] as ScadaAdapterError).code).toBe('SOURCE_NOT_FOUND')
    expect((results[3] as ScadaAdapterError).code).toBe('SOURCE_NOT_FOUND')
    expect(h.audit.filter(e => e.tenantId === T_A).every(e => (e.entityId === a) === (e.reasonCode === 'OK'))).toBe(true)
    expect((h.adapter as unknown as { inFlight: Map<string, number> }).inFlight.size).toBe(0)
    expect(Object.keys(h.adapter).sort()).toEqual(['deps', 'inFlight'])
  })
  it('result rows are projected to the requested columns only and carry no physical name', async () => {
    const h = await harness()
    const id = await h.source(T_A)
    h.setDriver(async () => ({ rows: [{ TARIH: 't', DEGER: 1, EXTRA: 'leak' }] }))
    const r = await h.adapter.read(ACTOR, scopeOf(T_A), req(id))
    expect(r.rows).toEqual([{ TARIH: 't', DEGER: 1 }])
    expect(JSON.stringify(r)).not.toMatch(/MOSB|leak/)
  })
})
