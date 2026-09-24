import { readFileSync } from 'node:fs'
import path from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { platformAuditLogs } from '../db/schema/operations'
import { PlatformAuditService } from './platform-audit.service'

/**
 * TASK-027.64-R2 — `platform_audit_logs.entityId` is nullable so a SCADA audit entry with an invalid
 * catalog id can carry a REAL null (DEC-0015 / AI1). Mock DB and static analysis only: no PostgreSQL is
 * contacted and no migration is applied by these tests.
 */
const API_ROOT = path.resolve(__dirname, '../..')
const MIGRATIONS = path.join(API_ROOT, 'drizzle/migrations')
const read = (...p: string[]) => readFileSync(path.join(...p), 'utf8')
const MIGRATION_FILE = '0005_platform_audit_entity_id_nullable.sql'

/** Bound parameters of a drizzle `sql` template are the non-object chunks (plus null). */
const params = (call: unknown) => ((call as { queryChunks: unknown[] }).queryChunks ?? []).filter(chunk => chunk === null || typeof chunk !== 'object')

describe('schema: platform_audit_logs.entityId is nullable, nothing else changed', () => {
  const columns = getTableConfig(platformAuditLogs).columns
  const col = (name: string) => columns.find(c => c.name === name)!
  it('entityId is nullable', () => expect(col('entityId').notNull).toBe(false))
  it('the other audit columns keep their constraints', () => {
    for (const name of ['id', 'actionCode', 'entityType', 'summary', 'createdAt']) expect(col(name).notNull).toBe(true)
    for (const name of ['actorId', 'actorSnapshot', 'metadata']) expect(col(name).notNull).toBe(false)
  })
  it('the (entityType, entityId) index still exists', () => {
    const names = getTableConfig(platformAuditLogs).indexes.map(i => i.config.name)
    expect(names).toContain('platform_audit_logs_entityType_entityId_idx')
  })
})

describe('migration 0005 (prepared, NOT applied)', () => {
  const sql = read(MIGRATIONS, MIGRATION_FILE)
  const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)

  it('is exactly one statement: DROP NOT NULL on platform_audit_logs.entityId', () => {
    expect(statements).toEqual(['ALTER TABLE "platform_audit_logs" ALTER COLUMN "entityId" DROP NOT NULL;'])
  })
  it('never touches existing rows or anything else (no UPDATE/DELETE/INSERT/TRUNCATE/DROP TABLE/SET DEFAULT/backfill)', () => {
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|INSERT|TRUNCATE|DROP TABLE|DROP COLUMN|SET DEFAULT|SET NOT NULL|ADD COLUMN|CREATE)\b/i)
  })
  it('is safe to re-run: DROP NOT NULL on an already nullable column is a no-op in PostgreSQL (and drizzle records the journal entry once)', () => {
    expect(sql).toMatch(/DROP NOT NULL/)
    expect(sql).not.toMatch(/ADD |CREATE |SET NOT NULL/i)
  })
  it('is the last journal entry, with a snapshot chained to 0004 that marks entityId nullable', () => {
    const journal = JSON.parse(read(MIGRATIONS, 'meta/_journal.json')) as { entries: Array<{ idx: number; tag: string }> }
    const last = journal.entries[journal.entries.length - 1]!
    expect(last).toMatchObject({ idx: 5, tag: '0005_platform_audit_entity_id_nullable' })
    const prev = JSON.parse(read(MIGRATIONS, 'meta/0004_snapshot.json')) as { id: string; tables: Record<string, { columns: Record<string, { notNull: boolean }> }> }
    const next = JSON.parse(read(MIGRATIONS, 'meta/0005_snapshot.json')) as { prevId: string; tables: Record<string, { columns: Record<string, { notNull: boolean }> }> }
    expect(next.prevId).toBe(prev.id)
    expect(prev.tables['public.platform_audit_logs']!.columns['entityId']!.notNull).toBe(true)
    expect(next.tables['public.platform_audit_logs']!.columns['entityId']!.notNull).toBe(false)
  })
  it('every column other than entityId is identical between the 0004 and 0005 snapshots (no accidental schema drift)', () => {
    const a = JSON.parse(read(MIGRATIONS, 'meta/0004_snapshot.json')) as { tables: Record<string, unknown> }
    const b = JSON.parse(read(MIGRATIONS, 'meta/0005_snapshot.json')) as { tables: Record<string, unknown> }
    const strip = (t: Record<string, unknown>) => {
      const copy = structuredClone(t) as Record<string, { columns: Record<string, unknown> }>
      delete copy['public.platform_audit_logs']!.columns['entityId']
      return copy
    }
    expect(strip(b.tables)).toEqual(strip(a.tables))
  })
})

describe('PlatformAuditService with a nullable entityId (mock DB)', () => {
  function service() {
    const db = buildMockDb()
    db.select.mockReturnValue(chain([]))
    return { db, service: new PlatformAuditService(db as never) }
  }

  it('writes a real null entityId — not an empty string, not a placeholder', async () => {
    const { db, service: s } = service()
    await s.log({ actorId: null, actionCode: 'SCADA_QUERY_DENIED', entityType: 'ScadaAnalysisQuery', entityId: null, summary: 'x', metadata: { reasonCode: 'INVALID_CATALOG_ID' } })
    const p = params(db.execute.mock.calls[0]?.[0])
    const at = p.indexOf('ScadaAnalysisQuery')
    expect(p[at + 1]).toBeNull()
    expect(p).not.toContain('')
    expect(p).not.toContain('00000000-0000-0000-0000-000000000000')
  })

  it('existing non-null entity ids are written unchanged', async () => {
    const { db, service: s } = service()
    await s.log({ actorId: null, actionCode: 'USER_CREATED', entityType: 'User', entityId: 'user-123', summary: 'x' })
    const p = params(db.execute.mock.calls[0]?.[0])
    expect(p[p.indexOf('User') + 1]).toBe('user-123')
  })

  it('a write failure is still thrown (callers such as the SCADA adapter rely on it to fail closed)', async () => {
    const { db, service: s } = service()
    db.execute.mockRejectedValueOnce(Object.assign(new Error('not null violation'), { code: '23502' }))
    await expect(s.log({ actorId: null, actionCode: 'A', entityType: 'B', entityId: null, summary: 'x' })).rejects.toThrow()
  })

  it('list returns rows with a null entityId next to normal rows, unchanged', async () => {
    const { db, service: s } = service()
    const rows = [
      { id: '1', entityId: null, entityType: 'ScadaAnalysisQuery', actionCode: 'SCADA_QUERY_DENIED' },
      { id: '2', entityId: 'user-123', entityType: 'User', actionCode: 'USER_CREATED' },
    ]
    db.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => fn({ execute: jest.fn().mockResolvedValueOnce({ rows }).mockResolvedValueOnce({ rows: [{ total: '2' }] }) }))
    const result = await s.list({ limit: 50, offset: 0 })
    expect(result).toMatchObject({ status: 'READY', total: 2 })
    expect(result.rows.map(r => r.entityId)).toEqual([null, 'user-123'])
  })

  it('list filters are built exactly as before (nullability adds no condition, changes no filter)', async () => {
    const { db, service: s } = service()
    const seen: string[] = []
    db.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        execute: jest.fn().mockImplementation((q: { queryChunks: unknown[] }) => {
          seen.push(JSON.stringify(q.queryChunks))
          return Promise.resolve({ rows: [{ total: '0' }] })
        }),
      }),
    )
    await s.list({ actorId: 'a', actionCode: 'X', entityType: 'T', q: 'abc', limit: 10, offset: 0 })
    const text = seen[0]!.replace(/\\"/g, '"')
    for (const fragment of ['"actorId" = ', '"actionCode" = ', '"entityType" = ', '"summary" ILIKE', '"entityId" ILIKE']) expect(text).toContain(fragment)
    expect(text).not.toMatch(/entityId" IS (NOT )?NULL/i)
  })
})
