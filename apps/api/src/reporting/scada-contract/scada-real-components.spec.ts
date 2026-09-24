import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { PlatformAuditService } from '../../audit/platform-audit.service'
import { buildMockDb, chain } from '../../db/test-helpers/drizzle-mock'
import { TenantScopeService } from '../../tenant-scope/tenant-scope.service'
import { DEFAULT_ALLOWLIST, TEST_LIMITS, mockDriver, request } from './test-helpers/scada-readonly-port.contract'
import { ReferenceScadaPort, type ScadaAuditEntry, type ScadaTenantScope } from './test-helpers/reference-scada-port'

/**
 * TASK-027.58 — the reference port fed by the REAL `TenantScopeService` and the REAL
 * `PlatformAuditService` (mock DB only). This is the part of the contract that exercises code that
 * actually exists in the repository today; the SQL Server side stays a mock driver because no
 * adapter exists (see the delivery note).
 */
function scopeService() {
  const db = buildMockDb()
  const closure = { getDescendantTenantIds: jest.fn() }
  const registry = { getActiveRegistry: jest.fn() }
  const service = new TenantScopeService(db as never, closure as never, registry as never)
  const active = { schemaName: 'cust_mip_aaaaaaaa', status: 'ACTIVE' }

  return {
    async resolve(row: Record<string, unknown>, descendants?: string[]): Promise<ScadaTenantScope> {
      db.select.mockReturnValueOnce(chain([row]))
      registry.getActiveRegistry.mockResolvedValueOnce(active)
      if (descendants) closure.getDescendantTenantIds.mockResolvedValueOnce(descendants)
      const result = await service.resolve(String(row['id']))
      return { tenantId: result.tenantId, customerRootTenantId: result.customerRootTenantId, dataScopeTenantIds: result.dataScopeTenantIds }
    },
    db,
    registry,
    closure,
    service,
  }
}

const ROOT_ROW = { id: 'root-mip', type: 'ROOT', status: 'ACTIVE', customerRootId: 'root-mip', canEnterData: true, canAggregateChildren: true }
const MOSB_ROW = { id: 'tenant-mosb', type: 'STANDARD', status: 'ACTIVE', customerRootId: 'root-mip', canEnterData: true, canAggregateChildren: false }
const MOSBIO_ROW = { id: 'tenant-mosbio', type: 'STANDARD', status: 'ACTIVE', customerRootId: 'root-mip', canEnterData: true, canAggregateChildren: false }

function portWithDriver() {
  const d = mockDriver()
  const audits: ScadaAuditEntry[] = []
  let corr = 0
  const port = new ReferenceScadaPort(DEFAULT_ALLOWLIST, TEST_LIMITS, d.driver, e => void audits.push(e), () => `srv-${(corr += 1)}`)
  return { port, ...d, audits }
}

describe('SCADA port + real TenantScopeService', () => {
  it('a leaf operating tenant resolves only itself: it reads its own source and is denied its sibling\'s', async () => {
    const scopes = scopeService()
    const h = portWithDriver()
    const scope = await scopes.resolve(MOSB_ROW)
    expect(scope.dataScopeTenantIds).toEqual(['tenant-mosb'])
    await expect(h.port.read('u1', scope, request({ sourceKey: 'src-a' }))).resolves.toBeDefined()
    await expect(h.port.read('u1', scope, request({ sourceKey: 'src-b' }))).rejects.toMatchObject({ reasonCode: 'TENANT_SCOPE_DENIED' })
  })

  it('is symmetric for the sibling tenant', async () => {
    const scopes = scopeService()
    const h = portWithDriver()
    const scope = await scopes.resolve(MOSBIO_ROW)
    await expect(h.port.read('u1', scope, request({ sourceKey: 'src-b' }))).resolves.toBeDefined()
    await expect(h.port.read('u1', scope, request({ sourceKey: 'src-a' }))).rejects.toMatchObject({ reasonCode: 'TENANT_SCOPE_DENIED' })
  })

  it('root aggregation is exactly the closure the resolver returned — a source owned outside the tree stays unreadable', async () => {
    const scopes = scopeService()
    const h = portWithDriver()
    const scope = await scopes.resolve(ROOT_ROW, ['root-mip', 'tenant-mosb', 'tenant-mosbio'])
    expect(h.port.listSources(scope).sort()).toEqual(['src-a', 'src-b'])
    await expect(h.port.read('u1', scope, request({ sourceKey: 'src-a' }))).resolves.toBeDefined()
    await expect(h.port.read('u1', scope, request({ sourceKey: 'src-b' }))).resolves.toBeDefined()
    await expect(h.port.read('u1', scope, request({ sourceKey: 'src-c' }))).rejects.toMatchObject({ reasonCode: 'TENANT_SCOPE_DENIED' })
  })

  it('root aggregation does not widen when the resolver returns a narrower closure (scope comes from the resolver, not from the allowlist)', async () => {
    const scopes = scopeService()
    const h = portWithDriver()
    const scope = await scopes.resolve(ROOT_ROW, ['root-mip', 'tenant-mosb'])
    await expect(h.port.read('u1', scope, request({ sourceKey: 'src-b' }))).rejects.toMatchObject({ reasonCode: 'TENANT_SCOPE_DENIED' })
  })

  it('a node without canAggregateChildren cannot aggregate even if the tenant tree has children', async () => {
    const scopes = scopeService()
    const scope = await scopes.resolve({ ...ROOT_ROW, canAggregateChildren: false })
    expect(scope.dataScopeTenantIds).toEqual(['root-mip'])
    expect(scopes.closure.getDescendantTenantIds).not.toHaveBeenCalled()
  })

  it.each([
    ['PLATFORM_ROOT', { id: 'platform-root', type: 'PLATFORM_ROOT', status: 'ACTIVE', customerRootId: null, canEnterData: false, canAggregateChildren: false }, ForbiddenException],
    ['a suspended tenant', { ...MOSB_ROW, status: 'SUSPENDED' }, ForbiddenException],
    ['a tenant with no customer root', { ...MOSB_ROW, customerRootId: null }, ForbiddenException],
  ])('%s never gets a scope, so the port can never be reached', async (_name, row, errorType) => {
    const scopes = scopeService()
    const h = portWithDriver()
    scopes.db.select.mockReturnValueOnce(chain([row]))
    await expect(scopes.service.resolve(String(row.id))).rejects.toBeInstanceOf(errorType)
    expect(h.impl).not.toHaveBeenCalled()
  })

  it('an unknown tenant id (e.g. an operational system that is not a tenant, like MOSEDAŞ) resolves to nothing', async () => {
    const scopes = scopeService()
    scopes.db.select.mockReturnValueOnce(chain([]))
    await expect(scopes.service.resolve('not-a-tenant')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('a customer root without an ACTIVE schema registry row fails closed', async () => {
    const scopes = scopeService()
    scopes.db.select.mockReturnValueOnce(chain([MOSB_ROW]))
    scopes.registry.getActiveRegistry.mockResolvedValueOnce(null)
    await expect(scopes.service.resolve('tenant-mosb')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('sequential tenants on one resolver instance do not leak scope into each other', async () => {
    const scopes = scopeService()
    const h = portWithDriver()
    const scopeA = await scopes.resolve(MOSB_ROW)
    const scopeB = await scopes.resolve(MOSBIO_ROW)
    expect(scopeA.dataScopeTenantIds).toEqual(['tenant-mosb'])
    expect(scopeB.dataScopeTenantIds).toEqual(['tenant-mosbio'])
    await expect(h.port.read('u-b', scopeB, request({ sourceKey: 'src-a' }))).rejects.toMatchObject({ reasonCode: 'TENANT_SCOPE_DENIED' })
    await expect(h.port.read('u-a', scopeA, request({ sourceKey: 'src-a' }))).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------------------------

/** Bound parameters of a drizzle `sql` template sit in queryChunks as raw values (the fixed SQL text is wrapped in {value: string[]}). */
function paramValues(statement: unknown): unknown[] {
  const chunks = (statement as { queryChunks?: unknown[] }).queryChunks ?? []
  return chunks.filter(chunk => typeof chunk === 'string')
}

function realAudit() {
  const db = buildMockDb()
  db.select.mockReturnValue(chain([]))
  const service = new PlatformAuditService(db as never)
  const persisted = () =>
    db.execute.mock.calls.map(call => {
      const json = paramValues(call[0]).find(value => typeof value === 'string' && value.startsWith('{') && value.includes('reasonCode'))
      return json ? (JSON.parse(String(json)) as Record<string, unknown>) : null
    })
  return { db, service, persisted }
}

describe('SCADA audit through the real PlatformAuditService', () => {
  const ALLOWED = new Set(['tenantId', 'customerRootTenantId', 'result', 'reasonCode', 'rowCount', 'columnCount', 'durationMs', 'limitReason', 'correlationId'])

  async function sinkFor(service: PlatformAuditService) {
    return (entry: ScadaAuditEntry) =>
      service.log({
        actorId: entry.actorId,
        actionCode: entry.actionCode,
        entityType: 'ScadaAnalysisQuery',
        entityId: entry.catalogId, // null stays null (migration 0005 makes the column nullable)
        summary: 'SCADA analysis query',
        metadata: { tenantId: entry.tenantId, customerRootTenantId: entry.customerRootTenantId, result: entry.result, reasonCode: entry.reasonCode, rowCount: entry.rowCount, columnCount: entry.columnCount, durationMs: entry.durationMs, limitReason: entry.limitReason, correlationId: entry.correlationId },
      })
  }

  it('persists only the allowed metadata fields for success, denial and failure — no SQL, rows, host or driver text', async () => {
    const { service, persisted } = realAudit()
    const d = mockDriver([{ kayit_tarihi: 'ROW-MARKER', deger_a: 1 }])
    let corr = 0
    const port = new ReferenceScadaPort(DEFAULT_ALLOWLIST, TEST_LIMITS, d.driver, await sinkFor(service), () => `srv-${(corr += 1)}`)
    const scope: ScadaTenantScope = { tenantId: 'tenant-mosb', customerRootTenantId: 'root-mip', dataScopeTenantIds: ['tenant-mosb'] }

    await port.read('actor-1', scope, request())
    await port.read('actor-1', scope, request({ sourceKey: 'src-b' })).catch(() => undefined)
    d.impl.mockRejectedValueOnce(new Error('Server=db01;Password=hunter2;SELECT * FROM secret'))
    await port.read('actor-1', scope, request()).catch(() => undefined)

    const rows = persisted()
    expect(rows).toHaveLength(3)
    for (const metadata of rows) {
      expect(Object.keys(metadata ?? {}).every(key => ALLOWED.has(key))).toBe(true)
    }
    const serialized = JSON.stringify(rows)
    for (const fragment of ['ROW-MARKER', 'hunter2', 'db01', 'SELECT', 'DB_ONE', 'tbl_one']) expect(serialized).not.toContain(fragment)
  })

  it.each(['password', 'passwordHash', 'token', 'refreshToken', 'apiKey'])('the real scrubSecrets redacts the key %p even if a future caller passes it', async key => {
    const { service, db } = realAudit()
    await service.log({ actorId: null, actionCode: 'X', entityType: 'Y', entityId: 'z', summary: 's', metadata: { [key]: 'leak-me', reasonCode: 'r' } })
    const written = paramValues(db.execute.mock.calls[0]?.[0]).map(String).join('|')
    expect(written).not.toContain('leak-me')
    expect(written).toContain('[REDACTED]')
  })

  /**
   * FINDING F-1 (TASK-027.58) was closed for the key classes named in TASK-027.58-R1: the scrubber
   * now redacts connectionString / secret / cookie / otp / host / username / authorization / accessKey
   * (full positive/negative coverage lives in audit/scrub-secrets.spec.ts). This test proves the real
   * PlatformAuditService actually applies it to what reaches the database.
   */
  it.each(['connectionString', 'secret', 'cookie', 'otp', 'host', 'username', 'authorization', 'accessKey'])('the real PlatformAuditService persists %p as [REDACTED]', async key => {
    const { service, db } = realAudit()
    await service.log({ actorId: null, actionCode: 'X', entityType: 'Y', entityId: 'z', summary: 's', metadata: { [key]: 'leak-me', reasonCode: 'r' } })
    const written = paramValues(db.execute.mock.calls[0]?.[0]).map(String).join('|')
    expect(written).not.toContain('leak-me')
    expect(written).toContain('[REDACTED]')
  })

  /**
   * RESIDUAL GAP (open decision Q-SR01): rawSql / schemaName keys and secrets embedded in VALUES are
   * still not scrubbed (key-based scrubber, values never inspected). `it.failing` records the gap
   * without a false green; the SCADA audit builder avoids it by never carrying those fields at all.
   */
  it.failing.each(['rawSql', 'schemaName'])('RESIDUAL GAP: scrubSecrets does not redact the key %p', async key => {
    const { service, db } = realAudit()
    await service.log({ actorId: null, actionCode: 'X', entityType: 'Y', entityId: 'z', summary: 's', metadata: { [key]: 'leak-me', reasonCode: 'r' } })
    const written = paramValues(db.execute.mock.calls[0]?.[0]).map(String).join('|')
    expect(written).not.toContain('leak-me')
  })

})
