import { CatalogError, assertPhysicalDatabaseName, assertTimeZone, isObservedClassCompatible } from './catalog-rules'
import { CatalogService } from './catalog.service'
import type { CatalogAuditEntry, CatalogSource, PreflightObservation, RegisterSourceInput } from './catalog.types'
import { InMemoryCatalogRepository } from './in-memory-catalog.repository'
import type { TenantRecord } from './tenant-guards'

const ACTOR = { id: 'actor-1' }
const T_MOSB = '11111111-1111-4111-8111-111111111111'
const T_BIO = '22222222-2222-4222-8222-222222222222'
const T_ROOT = '33333333-3333-4333-8333-333333333333'
const T_OFF = '44444444-4444-4444-8444-444444444444'
const T_FORBIDDEN = '55555555-5555-4555-8555-555555555555'

const LIMITS = { timeoutMs: 1000, maxRows: 10, maxColumns: 5, maxPayloadBytes: 100, maxRangeMs: 1000, poolSize: 2, maxConcurrent: 1 }

const tenantTable: Record<string, TenantRecord> = {
  [T_MOSB]: { id: T_MOSB, slug: 'mosb-enerji', type: 'CUSTOMER', status: 'ACTIVE' },
  [T_BIO]: { id: T_BIO, slug: 'mosbio', type: 'CUSTOMER', status: 'ACTIVE' },
  [T_ROOT]: { id: T_ROOT, slug: 'root', type: 'PLATFORM_ROOT', status: 'ACTIVE' },
  [T_OFF]: { id: T_OFF, slug: 'off', type: 'CUSTOMER', status: 'SUSPENDED' },
  [T_FORBIDDEN]: { id: T_FORBIDDEN, slug: 'Mosedaş', type: 'CUSTOMER', status: 'ACTIVE' },
} as never

const input = (over: Partial<RegisterSourceInput> = {}): RegisterSourceInput => ({
  displayName: 'MOSB Enerji',
  physicalDatabase: 'MOSB ENERJI DB',
  scope: 'IN_SCOPE',
  sourceTimeZone: 'Europe/Istanbul',
  limitProfile: { ...LIMITS },
  tables: [
    {
      schema: 'TEST_SCHEMA',
      name: 'ENERJI_SAATLIK',
      columns: [
        { name: 'TARIH', kind: 'DATE' },
        { name: 'SAAT', kind: 'TIME' },
        { name: 'DEGER', kind: 'NUMERIC' },
      ],
      dateColumn: 'TARIH',
      timeColumn: 'SAAT',
    },
  ],
  ...over,
})

const goodObservation = (): PreflightObservation => ({
  connectionOk: true,
  databaseExists: true,
  tables: [
    {
      name: 'ENERJI_SAATLIK',
      schemaExists: true,
      exists: true,
      columns: [
        { name: 'TARIH', exists: true, observedClass: 'DATE' },
        { name: 'SAAT', exists: true, observedClass: 'TIME' },
        { name: 'DEGER', exists: true, observedClass: 'NUMERIC' },
      ],
    },
  ],
})

function build(over: { authorize?: () => Promise<boolean>; record?: (e: CatalogAuditEntry) => Promise<void> } = {}) {
  const audit: CatalogAuditEntry[] = []
  const repository = new InMemoryCatalogRepository()
  let n = 0
  let c = 0
  const service = new CatalogService({
    repository,
    authorizer: { authorize: over.authorize ?? (async () => true) },
    audit: {
      record:
        over.record ??
        (async e => {
          audit.push(e)
        }),
    },
    tenants: { find: async id => tenantTable[id] ?? null },
    clock: { now: () => new Date('2026-01-01T00:00:00Z') },
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    correlationId: () => `corr-${++c}`,
  })
  return { service, repository, audit }
}

const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e: CatalogError) => e.code)

async function verifiedMapped(h = build()) {
  const s = await h.service.registerSource(ACTOR, input())
  await h.service.approveMapping(ACTOR, s.id, 1, { tenantId: T_MOSB, approvalRef: 'APPR-1' })
  const out = await h.service.applyPreflight(ACTOR, s.id, 2, goodObservation())
  return { ...h, id: s.id, out }
}

describe('catalog rules', () => {
  it('keeps the physical name with spaces and never normalises it', async () => {
    expect(() => assertPhysicalDatabaseName('MOSB ENERJI DB')).not.toThrow()
    const { service } = build()
    const s = await service.registerSource(ACTOR, input())
    expect(s.physicalDatabase).toBe('MOSB ENERJI DB')
    expect(s.id).not.toMatch(/MOSB|ENERJI/i)
  })
  it.each(['a;b', "x'y", 'a]b', ' lead', 'trail ', 'a  b', '', 'a\nb', 'a--b;'])('rejects unsafe physical name %j', name => {
    if (name === 'a--b;') return expect(() => assertPhysicalDatabaseName(name)).toThrow()
    expect(() => assertPhysicalDatabaseName(name)).toThrow(CatalogError)
  })
  it.each(['+03:00', 'Turkey Standard', 'Nope/Zone', ''])('rejects time zone %j', z => expect(() => assertTimeZone(z)).toThrow(CatalogError))
  it('accepts an IANA zone', () => expect(() => assertTimeZone('Europe/Istanbul')).not.toThrow())
  it('observed class compatibility', () => {
    expect(isObservedClassCompatible('NUMERIC', 'TEXT')).toBe(false)
    expect(isObservedClassCompatible('DATE', 'DATETIME')).toBe(true)
    expect(isObservedClassCompatible('DATETIME', 'DATE')).toBe(false)
  })
})

describe('registration', () => {
  it('starts UNVERIFIED with every column UNVERIFIED, no mappings', async () => {
    const s = await build().service.registerSource(ACTOR, input())
    expect(s.verification).toBe('UNVERIFIED')
    expect(s.version).toBe(1)
    expect(s.mappings).toEqual([])
    expect(s.tables.flatMap(t => t.columns).every(c => c.verification === 'UNVERIFIED')).toBe(true)
  })
  it('a caller cannot register as VERIFIED (unknown fields rejected)', async () => {
    const { service } = build()
    expect(await code(service.registerSource(ACTOR, { ...input(), verification: 'VERIFIED' } as never))).toBe('INVALID_INPUT_FIELD')
  })
  it('rejects duplicate physical database', async () => {
    const { service } = build()
    await service.registerSource(ACTOR, input())
    expect(await code(service.registerSource(ACTOR, input({ displayName: 'other' })))).toBe('DUPLICATE_PHYSICAL_DATABASE')
  })
  it('accepts a missing time zone / limit profile but never defaults them', async () => {
    const { service } = build()
    const s = await service.registerSource(ACTOR, input({ sourceTimeZone: undefined, limitProfile: undefined }))
    expect(s.sourceTimeZone).toBeNull()
    expect(s.limitProfile).toBeNull()
  })
  it('rejects an incomplete limit profile and unknown keys', async () => {
    const { service } = build()
    const partial: Record<string, number> = { ...LIMITS }
    delete partial.maxRows
    expect(await code(service.registerSource(ACTOR, input({ limitProfile: partial as never })))).toBeDefined()
    expect(await code(service.registerSource(ACTOR, input({ limitProfile: { ...LIMITS, extra: 1 } as never })))).not.toBe('OK')
    expect(await code(service.registerSource(ACTOR, input({ limitProfile: { ...LIMITS, maxConcurrent: 3 } })))).not.toBe('OK')
  })
})

describe('VERIFIED only through preflight', () => {
  it('good observation → VERIFIED, columns VERIFIED', async () => {
    const { out } = await verifiedMapped()
    expect(out.status).toBe('VERIFIED')
    if (out.status === 'VERIFIED') expect(out.source.tables[0]!.columns.every(c => c.verification === 'VERIFIED')).toBe(true)
  })
  it.each([
    ['database missing', (o: PreflightObservation) => void (o.databaseExists = false), 'PREFLIGHT_DATABASE_MISSING'],
    ['table missing', (o: PreflightObservation) => void (o.tables[0]!.exists = false), 'PREFLIGHT_TABLE_MISSING'],
    ['column missing', (o: PreflightObservation) => void (o.tables[0]!.columns[2]!.exists = false), 'PREFLIGHT_COLUMN_MISSING'],
    ['type mismatch', (o: PreflightObservation) => void (o.tables[0]!.columns[2]!.observedClass = 'TEXT'), 'PREFLIGHT_TYPE_MISMATCH'],
    ['column absent from observation', (o: PreflightObservation) => void o.tables[0]!.columns.pop(), 'PREFLIGHT_COLUMN_MISSING'],
    ['table absent from observation', (o: PreflightObservation) => void (o.tables = []), 'PREFLIGHT_TABLE_MISSING'],
  ])('%s → BLOCKED', async (_n, mutate, reason) => {
    const h = build()
    const s = await h.service.registerSource(ACTOR, input())
    const o = goodObservation()
    mutate(o)
    const out = await h.service.applyPreflight(ACTOR, s.id, 1, o)
    expect(out.status).toBe('BLOCKED')
    expect(out.source.verification).toBe('BLOCKED')
    expect(out.source.blockedReason).toBe(reason)
    expect(out.source.tables[0]!.columns.every(c => c.verification === 'UNVERIFIED')).toBe(true)
  })
  it('connection failure changes nothing (no version bump) and is audited FAILED', async () => {
    const h = build()
    const s = await h.service.registerSource(ACTOR, input())
    const out = await h.service.applyPreflight(ACTOR, s.id, 1, { connectionOk: false, databaseExists: false, tables: [] })
    expect(out.status).toBe('NOT_APPLIED')
    expect(out.source.version).toBe(1)
    expect(out.source.verification).toBe('UNVERIFIED')
    expect(h.audit.at(-1)).toMatchObject({ operation: 'APPLY_PREFLIGHT', result: 'FAILED', reasonCode: 'PREFLIGHT_CONNECTION_FAILED' })
  })
  it('out-of-scope and blocked sources cannot be preflighted', async () => {
    const h = build()
    const o = await h.service.registerSource(ACTOR, input({ scope: 'OUT_OF_SCOPE' }))
    expect(await code(h.service.applyPreflight(ACTOR, o.id, 1, goodObservation()))).toBe('PREFLIGHT_NOT_ALLOWED_OUT_OF_SCOPE')
    const b = await h.service.registerSource(ACTOR, input({ physicalDatabase: 'OTHER DB' }))
    await h.service.blockSource(ACTOR, b.id, 1, 'MANUAL_BLOCK')
    expect(await code(h.service.applyPreflight(ACTOR, b.id, 2, goodObservation()))).toBe('PREFLIGHT_NOT_ALLOWED_WHILE_BLOCKED')
  })
  it('BLOCKED → UNBLOCK → UNVERIFIED (never straight to VERIFIED); unblock of non-blocked rejected', async () => {
    const h = build()
    const s = await h.service.registerSource(ACTOR, input())
    expect(await code(h.service.unblockSource(ACTOR, s.id, 1))).toBe('TRANSITION_NOT_ALLOWED')
    const b = await h.service.blockSource(ACTOR, s.id, 1, 'MANUAL_BLOCK')
    expect(await code(h.service.blockSource(ACTOR, s.id, 2, 'MANUAL_BLOCK'))).toBe('TRANSITION_NOT_ALLOWED')
    const u = await h.service.unblockSource(ACTOR, s.id, b.version)
    expect(u.verification).toBe('UNVERIFIED')
  })
  it('changing tables/physical name invalidates a VERIFIED source', async () => {
    const h = await verifiedMapped()
    const cur = (await h.service.history(h.id)).at(-1)!
    const changed = await h.service.updateDefinition(ACTOR, h.id, cur.version, { physicalDatabase: 'MOSB ENERJI DB 2' })
    expect(changed.verification).toBe('UNVERIFIED')
    expect(changed.tables[0]!.columns.every(c => c.verification === 'UNVERIFIED')).toBe(true)
  })
  it('changing only the display name keeps VERIFIED; a patch cannot set verification', async () => {
    const h = await verifiedMapped()
    const cur = (await h.service.history(h.id)).at(-1)!
    const r = await h.service.updateDefinition(ACTOR, h.id, cur.version, { displayName: 'Yeni ad' })
    expect(r.verification).toBe('VERIFIED')
    expect(await code(h.service.updateDefinition(ACTOR, h.id, r.version, { verification: 'VERIFIED' } as never))).toBe('INVALID_INPUT_FIELD')
  })
})

describe('schema is mandatory for VERIFIED (TASK-027.64 R1)', () => {
  it('a source registered without a schema stays UNVERIFIED: preflight is NOT_APPLIED (no dbo default), no version bump', async () => {
    const h = build()
    const noSchema = input()
    delete (noSchema.tables[0] as { schema?: string }).schema
    const s = await h.service.registerSource(ACTOR, noSchema)
    expect(s.tables[0]!.schema).toBeNull()
    const out = await h.service.applyPreflight(ACTOR, s.id, 1, goodObservation())
    expect(out).toMatchObject({ status: 'NOT_APPLIED', reasonCode: 'PREFLIGHT_SCHEMA_UNDEFINED' })
    expect(out.source.verification).toBe('UNVERIFIED')
    expect(out.source.version).toBe(1)
    expect(h.audit.at(-1)).toMatchObject({ operation: 'APPLY_PREFLIGHT', result: 'DENIED', reasonCode: 'PREFLIGHT_SCHEMA_UNDEFINED' })
  })
  it('the observed schema must exist, otherwise BLOCKED (PREFLIGHT_SCHEMA_MISSING)', async () => {
    const h = build()
    const s = await h.service.registerSource(ACTOR, input())
    const o = goodObservation()
    o.tables[0]!.schemaExists = false
    const out = await h.service.applyPreflight(ACTOR, s.id, 1, o)
    expect(out).toMatchObject({ status: 'BLOCKED', reasonCode: 'PREFLIGHT_SCHEMA_MISSING' })
  })
  it('an unsafe schema name is rejected at registration', async () => {
    const h = build()
    const bad = input()
    bad.tables[0]!.schema = 'dbo]; DROP TABLE x;--'
    expect(await code(h.service.registerSource(ACTOR, bad))).toBe('INVALID_SCHEMA_NAME')
  })
  it('a VERIFIED-looking source whose table has no schema (corrupt/imported data) is denied and yields no execution profile', async () => {
    const h = await verifiedMapped()
    const cur = (await h.repository.get(h.id))!
    const tampered = structuredClone(cur)
    tampered.version += 1
    tampered.tables[0]!.schema = null
    await h.repository.withTransaction(tx => tx.saveVersion(tampered))
    const scope = { tenantId: T_MOSB, dataScopeTenantIds: [T_MOSB] }
    expect((await h.service.checkAccess(scope, h.id, { table: 'ENERJI_SAATLIK', columns: ['DEGER'] })).reasons).toContain('SCHEMA_UNDEFINED')
    expect(await code(h.service.getExecutionProfile(scope, h.id, { table: 'ENERJI_SAATLIK', columns: ['DEGER'] }))).toBe('SCHEMA_UNDEFINED')
  })
  it('changing the schema drops a VERIFIED source back to UNVERIFIED', async () => {
    const h = await verifiedMapped()
    const cur = (await h.repository.get(h.id))!
    const tables = input().tables
    tables[0]!.schema = 'OTHER_SCHEMA'
    const r = await h.service.updateDefinition(ACTOR, h.id, cur.version, { tables })
    expect(r.verification).toBe('UNVERIFIED')
  })
})

describe('tenant mapping', () => {
  it('approve → RESOLVED; revoke → UNRESOLVED; block → BLOCKED → reset → UNRESOLVED (no direct BLOCKED→RESOLVED)', async () => {
    const h = build()
    const s = await h.service.registerSource(ACTOR, input())
    let r = await h.service.approveMapping(ACTOR, s.id, 1, { tenantId: T_MOSB, approvalRef: 'APPR-1' })
    expect(r.mappings[0]).toMatchObject({ status: 'RESOLVED', approvalRef: 'APPR-1' })
    r = await h.service.revokeMapping(ACTOR, s.id, r.version, { tenantId: T_MOSB })
    expect(r.mappings[0]).toMatchObject({ status: 'UNRESOLVED', approvalRef: null })
    r = await h.service.blockMapping(ACTOR, s.id, r.version, { tenantId: T_MOSB })
    expect(await code(h.service.approveMapping(ACTOR, s.id, r.version, { tenantId: T_MOSB, approvalRef: 'APPR-2' }))).toBe('TRANSITION_NOT_ALLOWED')
    r = await h.service.resetMapping(ACTOR, s.id, r.version, { tenantId: T_MOSB })
    expect(r.mappings[0]!.status).toBe('UNRESOLVED')
  })
  it.each([
    ['unknown tenant', '99999999-9999-4999-8999-999999999999', 'TENANT_NOT_FOUND'],
    ['platform root', T_ROOT, 'TENANT_NOT_MAPPABLE'],
    ['inactive tenant', T_OFF, 'TENANT_NOT_ACTIVE'],
    ['MOSEDAŞ (DEC-0014)', T_FORBIDDEN, 'MOSEDAS_IS_NOT_A_TENANT'],
  ])('rejects %s', async (_n, tenantId, reason) => {
    const h = build()
    const s = await h.service.registerSource(ACTOR, input())
    expect(await code(h.service.approveMapping(ACTOR, s.id, 1, { tenantId, approvalRef: 'APPR-1' }))).toBe(reason)
  })
  it('requires an approval reference and refuses mapping an out-of-scope source', async () => {
    const h = build()
    const s = await h.service.registerSource(ACTOR, input())
    expect(await code(h.service.approveMapping(ACTOR, s.id, 1, { tenantId: T_MOSB, approvalRef: '' }))).toBe('INVALID_APPROVAL_REF')
    const o = await h.service.registerSource(ACTOR, input({ scope: 'OUT_OF_SCOPE', physicalDatabase: 'OTHER' }))
    expect(await code(h.service.approveMapping(ACTOR, o.id, 1, { tenantId: T_MOSB, approvalRef: 'A1' }))).toBe('MAPPING_NOT_ALLOWED_OUT_OF_SCOPE')
  })
})

describe('access decisions', () => {
  const scope = (...ids: string[]) => ({ tenantId: ids[0]!, dataScopeTenantIds: ids })
  it('fully prepared source is accessible only to the mapped tenant; others see NOT_FOUND', async () => {
    const h = await verifiedMapped()
    expect(await h.service.checkAccess(scope(T_MOSB), h.id, { table: 'ENERJI_SAATLIK', columns: ['DEGER'] })).toEqual({ accessible: true, reasons: [] })
    expect(await h.service.checkAccess(scope(T_BIO), h.id)).toEqual({ accessible: false, reasons: ['NOT_FOUND'] })
    expect(await h.service.checkAccess(scope(T_MOSB), 'not-a-uuid')).toEqual({ accessible: false, reasons: ['NOT_FOUND'] })
  })
  it('unmapped (UNRESOLVED) / unverified / blocked / no tz / no limits / unknown or unverified columns are denied', async () => {
    const h = build()
    const s = await h.service.registerSource(ACTOR, input({ sourceTimeZone: undefined, limitProfile: undefined }))
    const r = await h.service.approveMapping(ACTOR, s.id, 1, { tenantId: T_MOSB, approvalRef: 'A1' })
    await h.service.revokeMapping(ACTOR, s.id, r.version, { tenantId: T_MOSB })
    const d = await h.service.checkAccess(scope(T_MOSB), s.id, { table: 'X', columns: ['Y'] })
    expect(d.accessible).toBe(false)
    expect(d.reasons).toEqual(expect.arrayContaining(['MAPPING_UNRESOLVED', 'NOT_VERIFIED', 'TIMEZONE_UNDEFINED', 'LIMIT_PROFILE_INCOMPLETE', 'TABLE_UNKNOWN']))
    const v = await verifiedMapped()
    const cd = await v.service.checkAccess(scope(T_MOSB), v.id, { table: 'ENERJI_SAATLIK', columns: ['NOPE'] })
    expect(cd.reasons).toContain('COLUMN_UNKNOWN')
    const cur = (await v.service.history(v.id)).at(-1)!
    await v.service.blockSource(ACTOR, v.id, cur.version, 'MANUAL_BLOCK')
    expect((await v.service.checkAccess(scope(T_MOSB), v.id)).reasons).toContain('BLOCKED')
  })
  it('out-of-scope source is denied even if verified-looking', async () => {
    const h = build()
    const s = await h.service.registerSource(ACTOR, input())
    await h.service.approveMapping(ACTOR, s.id, 1, { tenantId: T_MOSB, approvalRef: 'A1' })
    await h.service.applyPreflight(ACTOR, s.id, 2, goodObservation())
    await h.service.updateDefinition(ACTOR, s.id, 3, { scope: 'OUT_OF_SCOPE' })
    expect((await h.service.checkAccess(scope(T_MOSB), s.id)).reasons).toContain('OUT_OF_SCOPE')
  })
  it('list view hides physical name and mappings and lists only accessible sources', async () => {
    const h = await verifiedMapped()
    await h.service.registerSource(ACTOR, input({ physicalDatabase: 'HIDDEN DB' }))
    const views = await h.service.listAccessibleSources(scope(T_MOSB))
    expect(views).toHaveLength(1)
    const text = JSON.stringify(views)
    expect(text).not.toContain('MOSB ENERJI DB')
    expect(text).not.toContain('mappings')
    expect(await h.service.listAccessibleSources(scope(T_BIO))).toEqual([])
  })
  it('execution profile hands out the physical name only when everything holds', async () => {
    const h = await verifiedMapped()
    const p = await h.service.getExecutionProfile(scope(T_MOSB), h.id, { table: 'ENERJI_SAATLIK', columns: ['DEGER'] })
    expect(p.physicalDatabase).toBe('MOSB ENERJI DB')
    expect(await code(h.service.getExecutionProfile(scope(T_BIO), h.id, { table: 'ENERJI_SAATLIK', columns: ['DEGER'] }))).toBe('NOT_FOUND')
    expect(await code(h.service.getExecutionProfile(scope(T_MOSB), h.id, { table: 'ENERJI_SAATLIK', columns: ['NOPE'] }))).toBe('COLUMN_UNKNOWN')
    const u = build()
    const s = await u.service.registerSource(ACTOR, input())
    await u.service.approveMapping(ACTOR, s.id, 1, { tenantId: T_MOSB, approvalRef: 'A1' })
    expect(await code(u.service.getExecutionProfile(scope(T_MOSB), s.id, { table: 'ENERJI_SAATLIK', columns: ['DEGER'] }))).toBe('NOT_VERIFIED')
  })
})

describe('authorization, audit, versioning (fail-closed)', () => {
  it('no permission → NOT_AUTHORIZED, nothing stored, DENIED audited', async () => {
    const h = build({ authorize: async () => false })
    expect(await code(h.service.registerSource(ACTOR, input()))).toBe('NOT_AUTHORIZED')
    expect(await h.repository.list()).toEqual([])
    expect(h.audit[0]).toMatchObject({ result: 'DENIED', reasonCode: 'NOT_AUTHORIZED', operation: 'REGISTER' })
  })
  it('authorizer that throws or returns non-true is denied', async () => {
    expect(await code(build({ authorize: async () => { throw new Error('boom') } }).service.registerSource(ACTOR, input()))).toBe('NOT_AUTHORIZED')
    expect(await code(build({ authorize: (async () => 'yes') as never }).service.registerSource(ACTOR, input()))).toBe('NOT_AUTHORIZED')
  })
  it('audit failure rolls the change back (fail-closed)', async () => {
    const h = build({ record: async () => { throw new Error('audit down') } })
    expect(await code(h.service.registerSource(ACTOR, input()))).toBe('CATALOG_AUDIT_FAILED')
    expect(await h.repository.list()).toEqual([])
  })
  it('audit entries carry only allowed fields and server correlation ids; no physical/table/column names', async () => {
    const h = await verifiedMapped()
    const allowed = ['actorId', 'catalogId', 'version', 'operation', 'result', 'reasonCode', 'correlationId', 'mappedTenantId']
    for (const e of h.audit) expect(Object.keys(e).sort()).toEqual([...allowed].sort())
    expect(new Set(h.audit.map(e => e.correlationId)).size).toBe(h.audit.length)
    const text = JSON.stringify(h.audit)
    expect(text).not.toMatch(/ENERJI|TARIH|DEGER|Istanbul/)
    expect(h.audit.map(e => e.operation)).toEqual(['REGISTER', 'APPROVE_MAPPING', 'APPLY_PREFLIGHT'])
  })
  it('rejected operations are audited DENIED/FAILED with a static reason', async () => {
    const h = build()
    const s = await h.service.registerSource(ACTOR, input())
    await code(h.service.approveMapping(ACTOR, s.id, 1, { tenantId: T_ROOT, approvalRef: 'A1' }))
    expect(h.audit.at(-1)).toMatchObject({ operation: 'APPROVE_MAPPING', result: 'DENIED', reasonCode: 'TENANT_NOT_MAPPABLE' })
  })
  it('optimistic concurrency: stale version rejected; every change makes a new immutable version', async () => {
    const h = build()
    const s = await h.service.registerSource(ACTOR, input())
    await h.service.updateDefinition(ACTOR, s.id, 1, { displayName: 'B' })
    expect(await code(h.service.updateDefinition(ACTOR, s.id, 1, { displayName: 'C' }))).toBe('VERSION_CONFLICT')
    const hist = await h.service.history(s.id)
    expect(hist.map(v => v.version)).toEqual([1, 2])
    expect(hist[0]!.displayName).toBe(input().displayName)
    expect(() => { (hist[0] as CatalogSource).displayName = 'x' }).toThrow()
  })
  it('unknown catalog id → NOT_FOUND', async () => {
    const h = build()
    expect(await code(h.service.blockSource(ACTOR, '00000000-0000-4000-8000-0000000000ff', 1, 'MANUAL_BLOCK'))).toBe('NOT_FOUND')
  })
})

describe('defence in depth (states the service itself cannot produce)', () => {
  it('a VERIFIED source whose column is UNVERIFIED (corrupt/imported data) is still denied per column', async () => {
    const h = await verifiedMapped()
    const cur = (await h.repository.get(h.id))!
    const tampered = structuredClone(cur)
    tampered.version += 1
    tampered.tables[0]!.columns[2]!.verification = 'UNVERIFIED'
    await h.repository.withTransaction(tx => tx.saveVersion(tampered))
    const d = await h.service.checkAccess({ tenantId: T_MOSB, dataScopeTenantIds: [T_MOSB] }, h.id, { table: 'ENERJI_SAATLIK', columns: ['DEGER'] })
    expect(d).toEqual({ accessible: false, reasons: ['COLUMN_NOT_VERIFIED'] })
  })
  it('repository refuses a non-consecutive version and rolls back a failed transaction', async () => {
    const h = build()
    const s = await h.service.registerSource(ACTOR, input())
    const skip = structuredClone(s)
    skip.version = 5
    await expect(h.repository.withTransaction(tx => tx.saveVersion(skip))).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    const ok = structuredClone(s)
    ok.version = 2
    await expect(
      h.repository.withTransaction(async tx => {
        await tx.saveVersion(ok)
        throw new Error('abort')
      }),
    ).rejects.toThrow('abort')
    expect((await h.repository.history(s.id)).map(v => v.version)).toEqual([1])
  })
})
