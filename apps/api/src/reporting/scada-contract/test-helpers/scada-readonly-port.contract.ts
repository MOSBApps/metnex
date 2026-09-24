import {
  assertReadOnlyStatement,
  type ScadaAllowlistEntry,
  type ScadaAuditEntry,
  type ScadaLimits,
  type ScadaReadRequest,
  type ScadaSqlDriver,
  type ScadaStatement,
  type ScadaTenantScope,
} from './reference-scada-port'

/**
 * TASK-027.58 — executable security/performance contract for a SCADA/DMS read-only port.
 *
 * The suite is parameterised by a factory so the exact same assertions can be run against a real
 * adapter once one exists. Today it runs against the test-only `ReferenceScadaPort` (see that
 * file's header for why). Every number below is a TEST PARAMETER, not a proposed production
 * threshold — the real thresholds are an open decision and are deliberately not invented.
 */
export interface ScadaPortUnderTest {
  read(actorId: string, scope: ScadaTenantScope, request: ScadaReadRequest): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>
  listSources(scope: ScadaTenantScope): string[]
}

export interface ScadaPortFactoryOptions {
  allowlist: readonly ScadaAllowlistEntry[]
  limits: ScadaLimits
  driver: ScadaSqlDriver
  audit: (entry: ScadaAuditEntry) => Promise<void> | void
  /** Server-side correlation id generator (DEC-0015 Q-SA07). */
  correlationId: () => string
}

export type ScadaPortFactory = (options: ScadaPortFactoryOptions) => ScadaPortUnderTest

const DAY_MS = 24 * 60 * 60 * 1000

export const ENTRY_MOSB: ScadaAllowlistEntry = {
  sourceKey: 'src-a',
  database: 'DB_ONE',
  schema: 'dbo',
  table: 'tbl_one',
  timeColumn: 'kayit_tarihi',
  allowedColumns: ['kayit_tarihi', 'kayit_saati', 'deger_a', 'deger_b', 'sirket'],
  permittedFilters: ['kayit_saati', 'deger_a'],
  ownerTenantId: 'tenant-mosb',
  maxTimeRangeMs: 7 * DAY_MS,
  maxRows: 5,
}
export const ENTRY_MOSBIO: ScadaAllowlistEntry = { ...ENTRY_MOSB, sourceKey: 'src-b', database: 'DB_TWO', table: 'tbl_two', ownerTenantId: 'tenant-mosbio' }
export const ENTRY_OTHER_ROOT: ScadaAllowlistEntry = { ...ENTRY_MOSB, sourceKey: 'src-c', database: 'DB_THREE', table: 'tbl_three', ownerTenantId: 'tenant-other-root' }
export const ENTRY_UNRESOLVED: ScadaAllowlistEntry = { ...ENTRY_MOSB, sourceKey: 'src-unresolved', database: 'DB_FOUR', table: 'tbl_four', ownerTenantId: null }
export const DEFAULT_ALLOWLIST = [ENTRY_MOSB, ENTRY_MOSBIO, ENTRY_OTHER_ROOT, ENTRY_UNRESOLVED]

export const TEST_LIMITS: ScadaLimits = { timeoutMs: 30, maxRows: 5, maxColumns: 3, maxPayloadBytes: 400, maxConcurrent: 2, poolSize: 3 }

export const SCOPE_MOSB: ScadaTenantScope = { tenantId: 'tenant-mosb', customerRootTenantId: 'root-mip', dataScopeTenantIds: ['tenant-mosb'] }
export const SCOPE_MOSBIO: ScadaTenantScope = { tenantId: 'tenant-mosbio', customerRootTenantId: 'root-mip', dataScopeTenantIds: ['tenant-mosbio'] }
export const SCOPE_ROOT: ScadaTenantScope = { tenantId: 'root-mip', customerRootTenantId: 'root-mip', dataScopeTenantIds: ['root-mip', 'tenant-mosb', 'tenant-mosbio'] }

export const RANGE = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-01-02T00:00:00Z') }

export function request(overrides: Record<string, unknown> = {}): ScadaReadRequest {
  return { sourceKey: 'src-a', columns: ['kayit_tarihi', 'deger_a'], timeRange: RANGE, ...overrides } as ScadaReadRequest
}

export function mockDriver(rows: Record<string, unknown>[] = [{ kayit_tarihi: '2026-01-01', deger_a: 1 }]) {
  const statements: ScadaStatement[] = []
  const signals: AbortSignal[] = []
  const impl = jest.fn<Promise<{ rows: Record<string, unknown>[] }>, [ScadaStatement, AbortSignal]>(async () => ({ rows }))
  const driver: ScadaSqlDriver = {
    execute: (statement, signal) => {
      statements.push(statement)
      signals.push(signal)
      return impl(statement, signal)
    },
  }
  return { driver, statements, signals, impl }
}

const hangsUntilAborted = (_s: ScadaStatement, signal: AbortSignal) =>
  new Promise<{ rows: Record<string, unknown>[] }>((_, reject) => signal.addEventListener('abort', () => reject(new Error('driver aborted')), { once: true }))

export function describeScadaReadOnlyContract(label: string, factory: ScadaPortFactory) {
  function build(overrides: Partial<ScadaPortFactoryOptions> = {}, driverRows?: Record<string, unknown>[]) {
    const d = mockDriver(driverRows)
    const auditEntries: ScadaAuditEntry[] = []
    let corr = 0
    const port = factory({
      allowlist: DEFAULT_ALLOWLIST,
      limits: TEST_LIMITS,
      driver: d.driver,
      audit: entry => {
        auditEntries.push(entry)
      },
      correlationId: () => `srv-${(corr += 1)}`,
      ...overrides,
    })
    return { port, ...d, auditEntries }
  }

  describe(`SCADA read-only port contract — ${label}`, () => {
    describe('construction fails closed (no default numbers, no unsafe allowlist)', () => {
      it.each(['timeoutMs', 'maxRows', 'maxColumns', 'maxPayloadBytes', 'maxConcurrent', 'poolSize'] as const)('a missing %s limit is a construction error, not a silent default', key => {
        const limits = { ...TEST_LIMITS } as Partial<ScadaLimits>
        delete limits[key]
        expect(() => build({ limits: limits as ScadaLimits })).toThrow()
      })

      it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('a non-positive-integer limit (%p) is rejected', bad => {
        expect(() => build({ limits: { ...TEST_LIMITS, timeoutMs: bad } })).toThrow()
      })

      it('maxConcurrent above poolSize is rejected', () => {
        expect(() => build({ limits: { ...TEST_LIMITS, maxConcurrent: 4, poolSize: 3 } })).toThrow()
      })

      it.each([
        ['database', { database: 'DB]; DROP TABLE x;--' }],
        ['schema', { schema: 'dbo.evil' }],
        ['table', { table: 'tbl one' }],
        ['column', { allowedColumns: ['ok', 'bad]--'] }],
        ['timeColumn', { timeColumn: "a'b" }],
      ])('an unsafe %s identifier in the allowlist is rejected at construction', (_name, patch) => {
        expect(() => build({ allowlist: [{ ...ENTRY_MOSB, ...patch }] })).toThrow()
      })

      it('a duplicate source key (ambiguous mapping) is rejected', () => {
        expect(() => build({ allowlist: [ENTRY_MOSB, { ...ENTRY_MOSBIO, sourceKey: ENTRY_MOSB.sourceKey }] })).toThrow()
      })

      it('a permitted filter that is not an allowed column is rejected', () => {
        expect(() => build({ allowlist: [{ ...ENTRY_MOSB, permittedFilters: ['not_a_column'] }] })).toThrow()
      })
    })

    describe('allowlist (rejected before any driver call)', () => {
      it.each(['unknown-source', '', '__proto__', 'constructor', 'toString', 'src-a; DROP TABLE x', 'SELECT 1'])('source key %p is rejected without touching the driver', async sourceKey => {
        const h = build()
        await expect(h.port.read('u1', SCOPE_ROOT, request({ sourceKey }))).rejects.toMatchObject({ reasonCode: 'SOURCE_NOT_ALLOWED' })
        expect(h.impl).not.toHaveBeenCalled()
      })

      it.each(['*', 'password', 'kayit_tarihi; DROP TABLE x', 'deger_a] FROM other', ''])('column %p outside the allowlist is rejected', async column => {
        const h = build()
        await expect(h.port.read('u1', SCOPE_MOSB, request({ columns: [column] }))).rejects.toMatchObject({ reasonCode: expect.stringMatching(/COLUMN_NOT_ALLOWED|INVALID_REQUEST/) })
        expect(h.impl).not.toHaveBeenCalled()
      })

      it.each([[[]], [['deger_a', 'deger_a']]])('empty or duplicate column lists (%j) are rejected', async columns => {
        const h = build()
        await expect(h.port.read('u1', SCOPE_MOSB, request({ columns }))).rejects.toMatchObject({ reasonCode: 'INVALID_REQUEST' })
        expect(h.impl).not.toHaveBeenCalled()
      })

      it('a filter that is not in the permitted list is rejected (even for an allowed column)', async () => {
        const h = build()
        await expect(h.port.read('u1', SCOPE_MOSB, request({ filters: { deger_b: 1 } }))).rejects.toMatchObject({ reasonCode: 'FILTER_NOT_ALLOWED' })
        expect(h.impl).not.toHaveBeenCalled()
      })

      it.each(['sql', 'query', 'rawSql', 'database', 'schema', 'table', 'tableName', 'tenantId', 'customerRootId', 'dataScopeTenantIds', 'sirket', 'Sirket', 'connectionString'])(
        'the request field %p does not exist in the contract and is rejected (no raw SQL / user-controlled identifiers / tenant override)',
        async field => {
          const h = build()
          await expect(h.port.read('u1', SCOPE_ROOT, request({ [field]: 'anything' }))).rejects.toMatchObject({ reasonCode: 'INVALID_REQUEST' })
          expect(h.impl).not.toHaveBeenCalled()
        },
      )

      it.each([
        [{ from: RANGE.to, to: RANGE.from }],
        [{ from: RANGE.from, to: RANGE.from }],
        [{ from: new Date('nope'), to: RANGE.to }],
        [{ from: '2026-01-01', to: '2026-01-02' }],
      ])('an invalid time range (%j) is rejected', async timeRange => {
        const h = build()
        await expect(h.port.read('u1', SCOPE_MOSB, request({ timeRange }))).rejects.toMatchObject({ reasonCode: 'TIME_RANGE_INVALID' })
        expect(h.impl).not.toHaveBeenCalled()
      })

      it('a time range beyond the source maximum is rejected instead of being clamped or run', async () => {
        const h = build()
        const to = new Date(RANGE.from.getTime() + ENTRY_MOSB.maxTimeRangeMs + 1)
        await expect(h.port.read('u1', SCOPE_MOSB, request({ timeRange: { from: RANGE.from, to } }))).rejects.toMatchObject({ reasonCode: 'TIME_RANGE_EXCEEDED' })
        expect(h.impl).not.toHaveBeenCalled()
      })
    })

    describe('read-only and parameter binding', () => {
      it('builds exactly one SELECT whose identifiers come only from the allowlist (golden statement)', async () => {
        const h = build()
        await h.port.read('u1', SCOPE_MOSB, request({ filters: { kayit_saati: 7 } }))
        expect(h.statements).toHaveLength(1)
        expect(h.statements[0]?.text).toBe(
          'SELECT TOP (@top) [kayit_tarihi], [deger_a] FROM [DB_ONE].[dbo].[tbl_one] WHERE [kayit_tarihi] >= @from AND [kayit_tarihi] < @to AND [kayit_saati] = @p0',
        )
      })

      it.each(["x' OR '1'='1", "1; DROP TABLE tbl_one;--", "'; EXEC xp_cmdshell('dir');--", '1 UNION SELECT password FROM users', '/* c */ 1', 'Robert"); DROP TABLE students;--'])(
        'the injection payload %p is bound as a parameter and never appears in statement text',
        async payload => {
          const h = build()
          await h.port.read('u1', SCOPE_MOSB, request({ filters: { kayit_saati: payload } }))
          const statement = h.statements[0]
          expect(statement?.text).not.toContain(payload)
          expect(statement?.text).not.toMatch(/['"]/)
          expect(statement?.params['p0']).toBe(payload)
          expect(() => assertReadOnlyStatement(statement?.text ?? '')).not.toThrow()
        },
      )

      it.each([[{ a: 1 }], [[1, 2]], [null], [undefined]])('a non-primitive filter value (%j) is rejected', async value => {
        const h = build()
        await expect(h.port.read('u1', SCOPE_MOSB, request({ filters: { kayit_saati: value } }))).rejects.toMatchObject({ reasonCode: 'INVALID_REQUEST' })
        expect(h.impl).not.toHaveBeenCalled()
      })

      it('every statement handed to the driver is a single read-only SELECT and never queries INFORMATION_SCHEMA (no runtime discovery)', async () => {
        const h = build()
        await h.port.read('u1', SCOPE_MOSB, request())
        await h.port.read('u1', SCOPE_ROOT, request({ sourceKey: 'src-b', filters: { deger_a: 3 } }))
        for (const statement of h.statements) {
          expect(() => assertReadOnlyStatement(statement.text)).not.toThrow()
          expect(statement.text).not.toMatch(/information_schema|sys\.|sp_/i)
        }
      })

      it.each([
        'INSERT INTO t VALUES (1)',
        'UPDATE t SET a = 1',
        'DELETE FROM t',
        'TRUNCATE TABLE t',
        'DROP TABLE t',
        'ALTER TABLE t ADD c int',
        'CREATE TABLE t (a int)',
        'EXEC sp_who',
        'EXECUTE sp_who',
        'MERGE t USING s ON 1=1 WHEN MATCHED THEN DELETE',
        'SELECT * INTO copy FROM t',
        'SELECT 1; DROP TABLE t',
        'SELECT 1 -- trailing comment',
        'SELECT /* c */ 1',
        '  drop table t',
        'WITH x AS (SELECT 1) DELETE FROM t',
      ])('assertReadOnlyStatement rejects %p', text => {
        expect(() => assertReadOnlyStatement(text)).toThrow()
      })

      it('assertReadOnlyStatement accepts a plain SELECT, including identifiers that merely contain a keyword as a substring', () => {
        expect(() => assertReadOnlyStatement('SELECT TOP (@top) [update_count], [created_at] FROM [d].[dbo].[t] WHERE [a] = @p0')).not.toThrow()
      })
    })

    describe('tenant isolation, root aggregation and unresolved mappings', () => {
      it('a tenant reads only sources it owns; other tenants and other roots are denied before the driver', async () => {
        const h = build()
        await expect(h.port.read('u1', SCOPE_MOSB, request({ sourceKey: 'src-a' }))).resolves.toMatchObject({ rowCount: 1 })
        await expect(h.port.read('u1', SCOPE_MOSB, request({ sourceKey: 'src-b' }))).rejects.toMatchObject({ reasonCode: 'TENANT_SCOPE_DENIED' })
        await expect(h.port.read('u1', SCOPE_MOSB, request({ sourceKey: 'src-c' }))).rejects.toMatchObject({ reasonCode: 'TENANT_SCOPE_DENIED' })
        expect(h.impl).toHaveBeenCalledTimes(1)
      })

      it('is symmetric for the other tenant', async () => {
        const h = build()
        await expect(h.port.read('u1', SCOPE_MOSBIO, request({ sourceKey: 'src-b' }))).resolves.toMatchObject({ rowCount: 1 })
        await expect(h.port.read('u1', SCOPE_MOSBIO, request({ sourceKey: 'src-a' }))).rejects.toMatchObject({ reasonCode: 'TENANT_SCOPE_DENIED' })
        expect(h.impl).toHaveBeenCalledTimes(1)
      })

      it('root aggregation reads exactly the resolved scope: both children, never a source owned outside the tree', async () => {
        const h = build()
        await expect(h.port.read('u1', SCOPE_ROOT, request({ sourceKey: 'src-a' }))).resolves.toBeDefined()
        await expect(h.port.read('u1', SCOPE_ROOT, request({ sourceKey: 'src-b' }))).resolves.toBeDefined()
        await expect(h.port.read('u1', SCOPE_ROOT, request({ sourceKey: 'src-c' }))).rejects.toMatchObject({ reasonCode: 'TENANT_SCOPE_DENIED' })
        expect(h.port.listSources(SCOPE_ROOT).sort()).toEqual(['src-a', 'src-b'])
        expect(h.port.listSources(SCOPE_MOSB)).toEqual(['src-a'])
        expect(h.port.listSources({ ...SCOPE_MOSB, dataScopeTenantIds: [] })).toEqual([])
      })

      it('an unresolved/ambiguous mapping (no owner) is never readable — not even by the root scope', async () => {
        const h = build()
        await expect(h.port.read('u1', SCOPE_ROOT, request({ sourceKey: 'src-unresolved' }))).rejects.toMatchObject({ reasonCode: 'SOURCE_MAPPING_UNRESOLVED' })
        expect(h.port.listSources(SCOPE_ROOT)).not.toContain('src-unresolved')
        expect(h.impl).not.toHaveBeenCalled()
      })

      it('the Sirket column is never a tenant authority: it cannot be a filter unless allowlisted, and even then it cannot reach another tenant\'s source', async () => {
        const h = build()
        await expect(h.port.read('u1', SCOPE_MOSB, request({ filters: { sirket: 'tenant-mosbio' } }))).rejects.toMatchObject({ reasonCode: 'FILTER_NOT_ALLOWED' })
        const permissive = build({ allowlist: DEFAULT_ALLOWLIST.map(e => ({ ...e, permittedFilters: [...e.permittedFilters, 'sirket'] })) })
        await expect(permissive.port.read('u1', SCOPE_MOSB, request({ sourceKey: 'src-b', filters: { sirket: 'tenant-mosb' } }))).rejects.toMatchObject({ reasonCode: 'TENANT_SCOPE_DENIED' })
        expect(permissive.impl).not.toHaveBeenCalled()
      })

      it('concurrent reads for two tenants stay isolated: own statements/params, own audit tenant, no cross-read afterwards', async () => {
        const h = build()
        const [a, b] = await Promise.all([
          h.port.read('u-a', SCOPE_MOSB, request({ sourceKey: 'src-a', filters: { deger_a: 111 } })),
          h.port.read('u-b', SCOPE_MOSBIO, request({ sourceKey: 'src-b', filters: { deger_a: 222 } })),
        ])
        expect(a.rowCount).toBe(1)
        expect(b.rowCount).toBe(1)
        const tables = h.statements.map(s => s.text.match(/\[dbo\]\.\[(\w+)\]/)?.[1])
        expect(tables.sort()).toEqual(['tbl_one', 'tbl_two'])
        const byTable = new Map(h.statements.map(s => [s.text.match(/\[dbo\]\.\[(\w+)\]/)?.[1], s.params['p0']]))
        expect(byTable.get('tbl_one')).toBe(111)
        expect(byTable.get('tbl_two')).toBe(222)
        expect(h.auditEntries.find(e => e.actorId === 'u-a')).toMatchObject({ tenantId: 'tenant-mosb', catalogId: 'src-a' })
        expect(h.auditEntries.find(e => e.actorId === 'u-b')).toMatchObject({ tenantId: 'tenant-mosbio', catalogId: 'src-b' })
        await expect(h.port.read('u-b', SCOPE_MOSBIO, request({ sourceKey: 'src-a' }))).rejects.toMatchObject({ reasonCode: 'TENANT_SCOPE_DENIED' })
      })
    })

    describe('limits (fail closed, never truncate silently)', () => {
      it('rejects a result above the row cap instead of truncating it; exactly the cap is fine', async () => {
        const many = Array.from({ length: TEST_LIMITS.maxRows + 1 }, (_, i) => ({ n: i }))
        const capped = build({}, many)
        await expect(capped.port.read('u1', SCOPE_MOSB, request())).rejects.toMatchObject({ reasonCode: 'ROW_LIMIT_EXCEEDED' })
        // DEC-0015 D6.1: a limit breach is DENIED (not FAILED) and carries its limitReason
        expect(capped.auditEntries[0]).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED', result: 'DENIED', limitReason: 'ROW_LIMIT', rowCount: null })
        await expect(build({}, many.slice(0, TEST_LIMITS.maxRows)).port.read('u1', SCOPE_MOSB, request())).resolves.toMatchObject({ rowCount: TEST_LIMITS.maxRows })
      })

      it('honours a lower per-source row cap than the global one', async () => {
        const h = build({ allowlist: [{ ...ENTRY_MOSB, maxRows: 2 }] }, [{ n: 1 }, { n: 2 }, { n: 3 }])
        await expect(h.port.read('u1', SCOPE_MOSB, request())).rejects.toMatchObject({ reasonCode: 'ROW_LIMIT_EXCEEDED' })
      })

      it('asks the driver for at most cap+1 rows (bound parameter) so an oversized result is detected without unbounded reads', async () => {
        const h = build()
        await h.port.read('u1', SCOPE_MOSB, request())
        expect(h.statements[0]?.params['top']).toBe(Math.min(TEST_LIMITS.maxRows, ENTRY_MOSB.maxRows) + 1)
      })

      it('rejects a payload above the byte limit', async () => {
        const big = [{ blob: 'x'.repeat(TEST_LIMITS.maxPayloadBytes + 1) }]
        const h = build({}, big)
        await expect(h.port.read('u1', SCOPE_MOSB, request())).rejects.toMatchObject({ reasonCode: 'PAYLOAD_LIMIT_EXCEEDED' })
        expect(h.auditEntries[0]).toMatchObject({ result: 'DENIED', limitReason: 'PAYLOAD_LIMIT' })
      })

      it('rejects more columns than the column limit', async () => {
        const h = build()
        await expect(h.port.read('u1', SCOPE_MOSB, request({ columns: ['kayit_tarihi', 'kayit_saati', 'deger_a', 'deger_b'] }))).rejects.toMatchObject({ reasonCode: 'COLUMN_LIMIT_EXCEEDED' })
        expect(h.impl).not.toHaveBeenCalled()
      })
    })

    describe('timeout, cancellation, retry and pool/concurrency', () => {
      it('times out a hung query, aborts the driver signal, and does not retry', async () => {
        const h = build()
        h.impl.mockImplementation(hangsUntilAborted)
        await expect(h.port.read('u1', SCOPE_MOSB, request())).rejects.toMatchObject({ reasonCode: 'TIMEOUT' })
        expect(h.signals[0]?.aborted).toBe(true)
        expect(h.impl).toHaveBeenCalledTimes(1)
      })

      it('still times out when the driver ignores its abort signal (the deadline is enforced by the port, not by driver goodwill)', async () => {
        const h = build()
        h.impl.mockImplementation(() => new Promise(() => undefined))
        await expect(h.port.read('u1', SCOPE_MOSB, request())).rejects.toMatchObject({ reasonCode: 'TIMEOUT' })
      })

      it('a caller abort mid-flight cancels the query (driver signal aborted, CANCELLED)', async () => {
        const h = build({ limits: { ...TEST_LIMITS, timeoutMs: 5_000 } })
        h.impl.mockImplementation(hangsUntilAborted)
        const controller = new AbortController()
        const pending = h.port.read('u1', SCOPE_MOSB, request({ signal: controller.signal }))
        setTimeout(() => controller.abort(), 5)
        await expect(pending).rejects.toMatchObject({ reasonCode: 'CANCELLED' })
        expect(h.signals[0]?.aborted).toBe(true)
      })

      it('an already-aborted caller signal never reaches the driver', async () => {
        const h = build()
        const controller = new AbortController()
        controller.abort()
        await expect(h.port.read('u1', SCOPE_MOSB, request({ signal: controller.signal }))).rejects.toMatchObject({ reasonCode: 'CANCELLED' })
        expect(h.impl).not.toHaveBeenCalled()
      })

      it('a driver failure is not retried and does not poison the next call', async () => {
        const h = build()
        h.impl.mockRejectedValueOnce(new Error('connection reset'))
        await expect(h.port.read('u1', SCOPE_MOSB, request())).rejects.toMatchObject({ reasonCode: 'SOURCE_UNAVAILABLE' })
        expect(h.impl).toHaveBeenCalledTimes(1)
        await expect(h.port.read('u1', SCOPE_MOSB, request())).resolves.toMatchObject({ rowCount: 1 })
      })

      it('rejects concurrent calls above maxConcurrent (no unbounded queueing) and frees the slot afterwards', async () => {
        const h = build()
        const releases: Array<() => void> = []
        h.impl.mockImplementation(() => new Promise(resolve => releases.push(() => resolve({ rows: [{ n: 1 }] }))))
        const first = h.port.read('u1', SCOPE_MOSB, request())
        const second = h.port.read('u1', SCOPE_MOSB, request())
        await expect(h.port.read('u1', SCOPE_MOSB, request())).rejects.toMatchObject({ reasonCode: 'CONCURRENCY_LIMIT' })
        expect(h.auditEntries[0]).toMatchObject({ result: 'DENIED', reasonCode: 'CONCURRENCY_LIMIT', limitReason: 'CONCURRENCY_LIMIT' })
        expect(h.impl).toHaveBeenCalledTimes(2)
        releases.forEach(release => release())
        await Promise.all([first, second])
        h.impl.mockImplementation(async () => ({ rows: [{ n: 1 }] }))
        await expect(h.port.read('u1', SCOPE_MOSB, request())).resolves.toBeDefined()
      })

      it('slots are released after failures and timeouts (a run of failing queries never exhausts the pool)', async () => {
        const h = build({ limits: { ...TEST_LIMITS, maxConcurrent: 1, poolSize: 1 } })
        h.impl.mockRejectedValue(new Error('boom'))
        for (let i = 0; i < 5; i += 1) {
          await expect(h.port.read('u1', SCOPE_MOSB, request())).rejects.toMatchObject({ reasonCode: 'SOURCE_UNAVAILABLE' })
        }
        h.impl.mockImplementation(hangsUntilAborted)
        await expect(h.port.read('u1', SCOPE_MOSB, request())).rejects.toMatchObject({ reasonCode: 'TIMEOUT' })
        h.impl.mockImplementation(async () => ({ rows: [{ n: 1 }] }))
        await expect(h.port.read('u1', SCOPE_MOSB, request())).resolves.toBeDefined()
      })
    })

    describe('error safety and audit', () => {
      const LEAKY = 'Login failed for user sa on host db01.internal;Server=db01;Password=hunter2;SELECT secret_col FROM dbo.tbl_one'

      it('a raw driver error never reaches the caller: static message/code, no cause, no secret fragments', async () => {
        const h = build()
        h.impl.mockRejectedValueOnce(new Error(LEAKY))
        const error = (await h.port.read('u1', SCOPE_MOSB, request()).catch((e: unknown) => e)) as Error & { cause?: unknown }
        const surface = `${String(error)}|${error.message}|${JSON.stringify(error)}|${error.stack ?? ''}`
        for (const fragment of ['Login failed', 'db01', 'Password', 'hunter2', 'secret_col', 'Server=', 'SELECT']) {
          expect(surface).not.toContain(fragment)
        }
        expect(error.cause).toBeUndefined()
      })

      it('audits success, denial and failure exactly once each, with only the allowed metadata fields', async () => {
        const h = build()
        await h.port.read('actor-1', SCOPE_MOSB, request())
        await h.port.read('actor-1', SCOPE_MOSB, request({ sourceKey: 'src-b' })).catch(() => undefined)
        h.impl.mockRejectedValueOnce(new Error(LEAKY))
        await h.port.read('actor-1', SCOPE_MOSB, request()).catch(() => undefined)

        expect(h.auditEntries).toHaveLength(3)
        expect(h.auditEntries.map(e => [e.result, e.reasonCode])).toEqual([
          ['SUCCEEDED', 'OK'],
          ['DENIED', 'TENANT_SCOPE_DENIED'],
          ['FAILED', 'SOURCE_UNAVAILABLE'],
        ])
        const allowed = new Set(['actionCode', 'actorId', 'tenantId', 'customerRootTenantId', 'catalogId', 'result', 'reasonCode', 'rowCount', 'columnCount', 'durationMs', 'limitReason', 'correlationId'])
        for (const entry of h.auditEntries) {
          expect(Object.keys(entry).every(key => allowed.has(key))).toBe(true)
        }
      })

      it('audit entries never carry rows, SQL, parameters, database/schema names, host or driver error text', async () => {
        const h = build({}, [{ kayit_tarihi: 'ROW-MARKER-123', deger_a: 42 }])
        await h.port.read('actor-1', SCOPE_MOSB, request({ filters: { kayit_saati: 'PARAM-MARKER-456' } }))
        h.impl.mockRejectedValueOnce(new Error(LEAKY))
        await h.port.read('actor-1', SCOPE_MOSB, request()).catch(() => undefined)
        const serialized = JSON.stringify(h.auditEntries)
        for (const fragment of ['ROW-MARKER', 'PARAM-MARKER', 'SELECT', 'DB_ONE', 'tbl_one', 'dbo', 'db01', 'hunter2', 'Password', 'Login failed']) {
          expect(serialized).not.toContain(fragment)
        }
      })

      it('never echoes an attacker-controlled source key into audit; a client-supplied correlation id is not a request field at all', async () => {
        const h = build()
        await h.port.read('actor-1', SCOPE_MOSB, request({ sourceKey: "x'; DROP TABLE a;--" })).catch(() => undefined)
        await expect(h.port.read('actor-1', SCOPE_MOSB, request({ correlationId: 'bad id\n<script>' }))).rejects.toMatchObject({ reasonCode: 'INVALID_REQUEST' })
        expect(h.auditEntries).toHaveLength(2)
        expect(h.auditEntries[0]?.catalogId).toBeNull()
        expect(h.auditEntries[1]?.correlationId).toBe('srv-2') // server-generated, never the client's value
        expect(JSON.stringify(h.auditEntries)).not.toMatch(/DROP|script|bad id/)
      })

      it('every request gets its own server-generated correlation id, on success, denial and failure alike', async () => {
        const h = build()
        await h.port.read('actor-1', SCOPE_MOSB, request())
        await h.port.read('actor-1', SCOPE_MOSB, request({ sourceKey: 'src-b' })).catch(() => undefined)
        h.impl.mockRejectedValueOnce(new Error('x'))
        await h.port.read('actor-1', SCOPE_MOSB, request()).catch(() => undefined)
        expect(h.auditEntries.map(e => e.correlationId)).toEqual(['srv-1', 'srv-2', 'srv-3'])
      })

      it('audit carries the DEC-0015 metadata: action code, root tenant, row/column counts, duration', async () => {
        const h = build()
        await h.port.read('actor-1', SCOPE_MOSB, request())
        expect(h.auditEntries[0]).toMatchObject({ actionCode: 'SCADA_QUERY_SUCCEEDED', customerRootTenantId: 'root-mip', rowCount: 1, columnCount: 2, limitReason: null })
        expect(typeof h.auditEntries[0]?.durationMs).toBe('number')
      })

      it('success is audited only after the rows were actually obtained; denials are audited without any driver call', async () => {
        const order: string[] = []
        const h = build({ audit: entry => void order.push(`audit:${entry.result}`) })
        h.impl.mockImplementation(async () => {
          order.push('driver')
          return { rows: [{ n: 1 }] }
        })
        await h.port.read('u1', SCOPE_MOSB, request())
        expect(order).toEqual(['driver', 'audit:SUCCEEDED'])

        order.length = 0
        await h.port.read('u1', SCOPE_MOSB, request({ sourceKey: 'src-c' })).catch(() => undefined)
        expect(order).toEqual(['audit:DENIED'])
      })

      it('FAIL-CLOSED (DEC-0015 Q-SA05): when the audit record cannot be written the rows are NOT returned; a denial keeps its own outcome', async () => {
        const failing = build({ audit: () => Promise.reject(new Error('audit down')) })
        await expect(failing.port.read('u1', SCOPE_MOSB, request())).rejects.toMatchObject({ reasonCode: 'AUDIT_FAILED' })
        expect(failing.impl).toHaveBeenCalledTimes(1) // the query ran, but its result never reaches the caller
        await expect(failing.port.read('u1', SCOPE_MOSB, request({ sourceKey: 'src-c' }))).rejects.toMatchObject({ reasonCode: 'TENANT_SCOPE_DENIED' })
      })

      it('a cancelled read is audited as SCADA_QUERY_FAILED with reasonCode CANCELLED (Q-W520: no separate action code)', async () => {
        const h = build({ limits: { ...TEST_LIMITS, timeoutMs: 5_000 } })
        h.impl.mockImplementation(hangsUntilAborted)
        const controller = new AbortController()
        const pending = h.port.read('u1', SCOPE_MOSB, request({ signal: controller.signal }))
        setTimeout(() => controller.abort(), 5)
        await expect(pending).rejects.toMatchObject({ reasonCode: 'CANCELLED' })
        expect(h.auditEntries[0]).toMatchObject({ actionCode: 'SCADA_QUERY_FAILED', result: 'FAILED', reasonCode: 'CANCELLED' })
      })
    })
  })
}
