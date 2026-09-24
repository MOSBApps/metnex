import { PlatformAuditService } from '../../../audit/platform-audit.service'
import { buildMockDb, chain } from '../../../db/test-helpers/drizzle-mock'
import { CatalogError } from '../catalog/catalog-rules'
import { PlatformScadaQueryAudit } from './platform-scada-query-audit'
import { SqlServerReadonlyAdapter } from './sqlserver-readonly.adapter'

/**
 * TASK-027.64-R2 — the whole audit path (adapter → PlatformScadaQueryAudit → real PlatformAuditService on a
 * mock DB) for the entityId contract. No SQL Server, no PostgreSQL.
 */
const KNOWN = '11111111-1111-4111-8111-111111111111'
const UNKNOWN_VALID = '99999999-9999-4999-8999-999999999999'
const SCOPE = { tenantId: 't1', customerRootTenantId: 'root', dataScopeTenantIds: ['t1'] }
const RANGE = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-01-01T01:00:00Z') }
const NIL = '00000000-0000-0000-0000-000000000000'

const profile = {
  catalogId: KNOWN, version: 1, physicalDatabase: 'DB', sourceTimeZone: 'Europe/Istanbul', schema: 'S', table: 'T', dateColumn: 'D', dateColumnKind: 'DATE' as const, timeColumn: 'D', columns: ['D', 'V'],
  limitProfile: { timeoutMs: 100, maxRows: 5, maxColumns: 5, maxPayloadBytes: 1000, maxRangeMs: 86_400_000, poolSize: 1, maxConcurrent: 1 },
}

function build(opts: { auditFails?: boolean } = {}) {
  const db = buildMockDb()
  db.select.mockReturnValue(chain([]))
  if (opts.auditFails) db.execute.mockRejectedValue(new Error('audit down'))
  const platform = new PlatformAuditService(db as never)
  const catalog = {
    getExecutionProfile: jest.fn(async (_scope: unknown, id: string) => {
      if (id !== KNOWN) throw new CatalogError('NOT_FOUND')
      return profile
    }),
    listAccessibleSources: jest.fn(),
  }
  let n = 0
  const adapter = new SqlServerReadonlyAdapter({
    catalog: catalog as never,
    driver: { run: async () => ({ rows: [{ D: 'd', V: 1 }] }) },
    audit: new PlatformScadaQueryAudit(platform),
    correlationId: () => `srv-${++n}`,
    nowMs: () => Date.now(),
  })
  /** the bound parameters of the persisted audit row (relative to the entityType chunk) */
  const persisted = () =>
    db.execute.mock.calls.map(call => {
      const p = ((call[0] as { queryChunks: unknown[] }).queryChunks ?? []).filter(c => c === null || typeof c !== 'object')
      const at = p.indexOf('ScadaAnalysisQuery')
      return { actionCode: p[at - 1], entityId: p[at + 1], metadata: JSON.parse(String(p.find(v => typeof v === 'string' && String(v).startsWith('{"tenantId"')) ?? '{}')) as Record<string, unknown>, all: p }
    })
  const read = (catalogId: unknown) => adapter.read({ id: 'actor' }, SCOPE, { catalogId, table: 'T', columns: ['D', 'V'], timeRange: RANGE } as never).then(() => 'OK', (e: { code: string }) => e.code)
  return { adapter, db, persisted, read }
}

describe('SCADA audit entityId contract (R2)', () => {
  it.each([
    ["x'; DROP TABLE y;--"],
    ['MOSB ENERJI DB'],
    ['not-a-uuid'],
    [''],
    [42],
    [null],
    [undefined],
    [NIL.slice(0, -1)], // one char short: malformed
  ])('invalid catalog id %j → DENIED / INVALID_CATALOG_ID with a REAL null entityId', async bad => {
    const h = build()
    expect(await h.read(bad)).toBe('INVALID_CATALOG_ID')
    const [row] = h.persisted()
    expect(row!.actionCode).toBe('SCADA_QUERY_DENIED')
    expect(row!.entityId).toBeNull()
    expect(row!.metadata['reasonCode']).toBe('INVALID_CATALOG_ID')
    expect(row!.all).not.toContain('') // no empty-string entityId
    expect(row!.all).not.toContain(NIL) // no nil UUID
    expect(JSON.stringify(row!.all)).not.toMatch(/DROP|MOSB|not-a-uuid|00000000/)
  })

  it('a valid-format but unknown UUID is preserved as entityId with SOURCE_NOT_FOUND', async () => {
    const h = build()
    expect(await h.read(UNKNOWN_VALID)).toBe('SOURCE_NOT_FOUND')
    const [row] = h.persisted()
    expect(row).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED', entityId: UNKNOWN_VALID })
    expect(row!.metadata['reasonCode']).toBe('SOURCE_NOT_FOUND')
  })

  it('a successful query carries the catalog UUID', async () => {
    const h = build()
    expect(await h.read(KNOWN)).toBe('OK')
    expect(h.persisted()[0]).toMatchObject({ actionCode: 'SCADA_QUERY_SUCCEEDED', entityId: KNOWN })
  })

  it('an unknown/attacker-controlled request shape without a valid catalog id records null and the matching reject code', async () => {
    const h = build()
    const code = await h.adapter.read({ id: 'actor' }, SCOPE, { sql: 'DROP TABLE x', catalogId: "'; --" } as never).then(() => 'OK', (e: { code: string }) => e.code)
    expect(code).toBe('INVALID_CATALOG_ID')
    expect(h.persisted()[0]!.entityId).toBeNull()
    const nonObject = await h.adapter.read({ id: 'actor' }, SCOPE, 'DROP TABLE x' as never).then(() => 'OK', (e: { code: string }) => e.code)
    expect(nonObject).toBe('INVALID_REQUEST')
    expect(h.persisted()[1]!.entityId).toBeNull()
  })

  it('each case is distinguishable in the audit table: null / valid unknown / known', async () => {
    const h = build()
    await h.read('bad')
    await h.read(UNKNOWN_VALID)
    await h.read(KNOWN)
    expect(h.persisted().map(r => [r.entityId, r.metadata['reasonCode']])).toEqual([
      [null, 'INVALID_CATALOG_ID'],
      [UNKNOWN_VALID, 'SOURCE_NOT_FOUND'],
      [KNOWN, 'OK'],
    ])
  })

  it('an audit write failure keeps the adapter fail-closed for a success, and never hides a denial', async () => {
    const h = build({ auditFails: true })
    expect(await h.read(KNOWN)).toBe('AUDIT_FAILED')
    expect(await h.read('bad')).toBe('INVALID_CATALOG_ID')
  })
})
