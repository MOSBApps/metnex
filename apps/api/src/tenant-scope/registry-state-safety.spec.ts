import { ForbiddenException, InternalServerErrorException, Logger } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { CustomerSchemaRegistryService } from './customer-schema-registry.service'
import { diagnoseRegistryState, type RegistryDiagnosticInput } from './registry-diagnostics'
import {
  assertKnownRegistryStatus,
  assertRegistryTransition,
  REGISTRY_ERROR_CODES,
  REGISTRY_STATUSES,
  RegistryStateError,
} from './registry-state'
import { TenantScopeService } from './tenant-scope.service'

/** Registry state-safety contract (TASK-027.31). No test opens a database connection. */

const ROOT_TENANT = { id: 'root-1', type: 'ROOT' }
const SCHEMA = 'cust_acme_aaaaaaaa'
const row = (status: string, extra: Record<string, unknown> = {}) => ({
  customerRootTenantId: 'root-1',
  schemaName: SCHEMA,
  status,
  migrationVersion: '0000_empty',
  lastError: null,
  ...extra,
})

function buildRegistry() {
  const db = buildMockDb()
  const dbService = { pool: { query: jest.fn() } }
  const service = new CustomerSchemaRegistryService(db as never, dbService as never)
  return { service, db, dbService }
}

function buildScope() {
  const { service: registry, db, dbService } = buildRegistry()
  const closure = { getDescendantTenantIds: jest.fn(async () => ['root-1']) }
  const scope = new TenantScopeService(db as never, closure as never, registry)
  const tenant = { id: 'root-1', type: 'ROOT', status: 'ACTIVE', customerRootId: 'root-1', canEnterData: true, canAggregateChildren: true }
  return { scope, registry, db, dbService, closure, tenant }
}

describe('ensureSchemaProvisioned — ARCHIVED is never reactivated', () => {
  function archived() {
    const ctx = buildRegistry()
    ctx.db.select.mockImplementation(() => chain([ROOT_TENANT])).mockReturnValueOnce(chain([ROOT_TENANT])).mockReturnValueOnce(chain([row('ARCHIVED')]))
    return ctx
  }

  it('is rejected with SCHEMA_ARCHIVED', async () => {
    const { service } = archived()
    const error = await service.ensureSchemaProvisioned('root-1', 'acme').catch(e => e)
    expect(error).toBeInstanceOf(RegistryStateError)
    expect(error.code).toBe(REGISTRY_ERROR_CODES.SCHEMA_ARCHIVED)
    expect(error.getStatus()).toBe(409)
  })

  it('never calls CREATE SCHEMA and never writes the registry', async () => {
    const { service, db, dbService } = archived()
    await expect(service.ensureSchemaProvisioned('root-1', 'acme')).rejects.toBeInstanceOf(RegistryStateError)
    expect(dbService.pool.query).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  it('does not disclose the schema name or any detail in the error', async () => {
    const { service } = archived()
    const error = await service.ensureSchemaProvisioned('root-1', 'acme').catch(e => e)
    expect(JSON.stringify(error.getResponse())).not.toContain(SCHEMA)
    expect(JSON.stringify(error.getResponse())).not.toMatch(/postgres|password|cust_/i)
  })

  it('gives the same result on every repeat (idempotent refusal, still no writes)', async () => {
    const { db, dbService, service } = buildRegistry()
    for (let attempt = 0; attempt < 2; attempt++) {
      db.select.mockReturnValueOnce(chain([ROOT_TENANT])).mockReturnValueOnce(chain([row('ARCHIVED')]))
      const error = await service.ensureSchemaProvisioned('root-1', 'acme').catch(e => e)
      expect(error.code).toBe('SCHEMA_ARCHIVED')
    }
    expect(dbService.pool.query).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })
})

describe('ensureSchemaProvisioned — guarded state changes', () => {
  it('an ACTIVE row stays a no-op with the same row on every call', async () => {
    const { service, db, dbService } = buildRegistry()
    const active = row('ACTIVE')
    for (let attempt = 0; attempt < 2; attempt++) {
      db.select.mockReturnValueOnce(chain([ROOT_TENANT])).mockReturnValueOnce(chain([active]))
      expect(await service.ensureSchemaProvisioned('root-1', 'acme')).toBe(active)
    }
    expect(dbService.pool.query).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  it('rejects an unrecognised stored status before doing anything', async () => {
    const { service, db, dbService } = buildRegistry()
    db.select.mockReturnValueOnce(chain([ROOT_TENANT])).mockReturnValueOnce(chain([row('BOGUS')]))
    const error = await service.ensureSchemaProvisioned('root-1', 'acme').catch(e => e)
    expect(error.code).toBe(REGISTRY_ERROR_CODES.REGISTRY_STATUS_UNKNOWN)
    expect(dbService.pool.query).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('claims a row only from an absent, PROVISIONING or FAILED state (conditional upsert)', async () => {
    const { service, db, dbService } = buildRegistry()
    db.select.mockReturnValueOnce(chain([ROOT_TENANT])).mockReturnValueOnce(chain([]))
    const insertChain = chain([row('PROVISIONING')])
    db.insert.mockReturnValue(insertChain)
    dbService.pool.query.mockResolvedValue(undefined)
    db.update.mockReturnValue(chain([row('ACTIVE')]))

    await service.ensureSchemaProvisioned('root-1', 'acme')

    const conflictArg = insertChain.onConflictDoUpdate.mock.calls[0]?.[0] as { setWhere?: unknown }
    expect(conflictArg.setWhere).toBeDefined()
  })

  it('does no DDL when the row was archived or activated concurrently (claim returns nothing)', async () => {
    const { service, db, dbService } = buildRegistry()
    db.select.mockReturnValueOnce(chain([ROOT_TENANT])).mockReturnValueOnce(chain([]))
    db.insert.mockReturnValue(chain([]))
    const error = await service.ensureSchemaProvisioned('root-1', 'acme').catch(e => e)
    expect(error.code).toBe(REGISTRY_ERROR_CODES.REGISTRY_STATE_CONFLICT)
    expect(dbService.pool.query).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  it('never overwrites a row that changed under it with ACTIVE, and does not mark it FAILED', async () => {
    const { service, db, dbService } = buildRegistry()
    db.select.mockReturnValueOnce(chain([ROOT_TENANT])).mockReturnValueOnce(chain([]))
    db.insert.mockReturnValue(chain([row('PROVISIONING')]))
    dbService.pool.query.mockResolvedValue(undefined)
    db.update.mockReturnValue(chain([]))
    const error = await service.ensureSchemaProvisioned('root-1', 'acme').catch(e => e)
    expect(error.code).toBe(REGISTRY_ERROR_CODES.REGISTRY_STATE_CONFLICT)
    expect(db.update).toHaveBeenCalledTimes(1)
  })

  it('a PROVISIONING row is driven again idempotently and only reaches ACTIVE through the DDL path', async () => {
    const { service, db, dbService } = buildRegistry()
    db.select.mockReturnValueOnce(chain([ROOT_TENANT])).mockReturnValueOnce(chain([row('PROVISIONING')]))
    db.insert.mockReturnValue(chain([row('PROVISIONING')]))
    dbService.pool.query.mockResolvedValue(undefined)
    db.update.mockReturnValue(chain([row('ACTIVE')]))
    const result = await service.ensureSchemaProvisioned('root-1', 'acme')
    expect(result.status).toBe('ACTIVE')
    expect(dbService.pool.query).toHaveBeenCalledTimes(1)
  })
})

describe('provisioning failures never leak secrets', () => {
  const MARKER = 'TopSecretMarker123'
  const RAW = `connection to postgresql://svc_user:${MARKER}@db.internal.example:5432/app failed for schema ${SCHEMA}`

  it('lastError, the log line and the thrown error carry no database text', async () => {
    const { service, db, dbService } = buildRegistry()
    db.select.mockReturnValueOnce(chain([ROOT_TENANT])).mockReturnValueOnce(chain([]))
    db.insert.mockReturnValue(chain([row('PROVISIONING')]))
    const updateChain = chain(undefined)
    db.update.mockReturnValue(updateChain)
    dbService.pool.query.mockRejectedValue(Object.assign(new Error(RAW), { code: '42501' }))
    const logged: string[] = []
    jest.spyOn(Logger.prototype, 'error').mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(' ')))

    const error = await service.ensureSchemaProvisioned('root-1', 'acme').catch(e => e)

    expect(error).toBeInstanceOf(InternalServerErrorException)
    const surfaces = [JSON.stringify(updateChain.set.mock.calls), logged.join('\n'), JSON.stringify(error.getResponse()), String(error.message)]
    for (const surface of surfaces) {
      expect(surface).not.toContain(MARKER)
      expect(surface).not.toContain('svc_user')
      expect(surface).not.toContain('db.internal.example')
    }
    expect(updateChain.set).toHaveBeenCalledWith({ status: 'FAILED', lastError: 'Error [42501]: schema provisioning failed' })
    jest.restoreAllMocks()
  })
})

describe('scope: only ACTIVE yields a data-plane scope', () => {
  it.each(['PROVISIONING', 'FAILED', 'ARCHIVED', 'BOGUS'])('%s registry status is fail-closed (403)', async status => {
    const { scope, db, dbService, tenant } = buildScope()
    db.select.mockReturnValueOnce(chain([tenant])).mockReturnValueOnce(chain([row(status)]))
    await expect(scope.resolve('root-1')).rejects.toBeInstanceOf(ForbiddenException)
    // reading never promotes, retries, or repairs anything
    expect(db.update).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
    expect(dbService.pool.query).not.toHaveBeenCalled()
  })

  it('a missing registry row is fail-closed', async () => {
    const { scope, db, tenant } = buildScope()
    db.select.mockReturnValueOnce(chain([tenant])).mockReturnValueOnce(chain([]))
    await expect(scope.resolve('root-1')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('an ACTIVE registry resolves normally', async () => {
    const { scope, db, tenant } = buildScope()
    db.select.mockReturnValueOnce(chain([tenant])).mockReturnValueOnce(chain([row('ACTIVE')]))
    const result = await scope.resolve('root-1')
    expect(result.schemaName).toBe(SCHEMA)
  })

  it('getActiveRegistry returns null for every status except ACTIVE', async () => {
    const { registry, db } = buildScope()
    for (const status of [...REGISTRY_STATUSES, 'BOGUS']) {
      db.select.mockReturnValueOnce(chain([row(status)]))
      const found = await registry.getActiveRegistry('root-1')
      expect(found === null).toBe(status !== 'ACTIVE')
    }
  })

  it('PLATFORM_ROOT stays forbidden and never reaches the registry', async () => {
    const { scope, db, registry } = buildScope()
    const spy = jest.spyOn(registry, 'getActiveRegistry')
    db.select.mockReturnValueOnce(chain([{ id: 'platform', type: 'PLATFORM_ROOT', status: 'ACTIVE', customerRootId: null, canEnterData: false, canAggregateChildren: false }]))
    await expect(scope.resolve('platform')).rejects.toBeInstanceOf(ForbiddenException)
    expect(spy).not.toHaveBeenCalled()
  })

  it('resolve() takes only a tenant id: no user, guard result or role can bypass the registry check', () => {
    expect(TenantScopeService.prototype.resolve.length).toBe(1)
  })
})

describe('registry code paths grant no repair or bypass authority', () => {
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const source = (file: string) => strip(readFileSync(join(__dirname, file), 'utf8'))

  it.each(['customer-schema-registry.service.ts', 'registry-state.ts', 'registry-diagnostics.ts', 'tenant-scope.service.ts'])(
    '%s never references system-admin or tenant-admin authority',
    file => {
      expect(source(file)).not.toMatch(/isSystemAdmin|TENANT_ADMIN|SYSTEM_ADMIN/)
    },
  )

  it('the diagnostic contract has no database, driver, or file-system dependency', () => {
    const imports = [...source('registry-diagnostics.ts').matchAll(/from\s+'([^']+)'/g)].map(match => match[1])
    expect(imports.sort()).toEqual(['./registry-state', './schema-name.util'])
  })

  it('no automatic reactivation or retry entrypoint was added', () => {
    const code = source('customer-schema-registry.service.ts')
    expect(code).not.toMatch(/reactivat|setInterval|setTimeout|@Cron|@Interval|retry(?:Failed|Provisioning)/i)
    expect(code).not.toMatch(/status:\s*'ACTIVE'[\s\S]{0,80}ARCHIVED/)
  })
})

describe('registry status transitions', () => {
  const allowed: Array<[string | null, string]> = [
    [null, 'PROVISIONING'],
    ['PROVISIONING', 'PROVISIONING'],
    ['PROVISIONING', 'ACTIVE'],
    ['PROVISIONING', 'FAILED'],
    ['FAILED', 'PROVISIONING'],
  ]
  const forbidden: Array<[string | null, string]> = [
    [null, 'ACTIVE'], [null, 'FAILED'], [null, 'ARCHIVED'],
    ['FAILED', 'ACTIVE'], ['FAILED', 'ARCHIVED'], ['FAILED', 'FAILED'],
    ['PROVISIONING', 'ARCHIVED'],
    ['ACTIVE', 'PROVISIONING'], ['ACTIVE', 'FAILED'], ['ACTIVE', 'ARCHIVED'], ['ACTIVE', 'ACTIVE'],
    ['ARCHIVED', 'ACTIVE'], ['ARCHIVED', 'PROVISIONING'], ['ARCHIVED', 'FAILED'], ['ARCHIVED', 'ARCHIVED'],
  ]

  it.each(allowed)('%s → %s is allowed', (from, to) => {
    expect(() => assertRegistryTransition(from as never, to as never)).not.toThrow()
  })

  it.each(forbidden)('%s → %s is rejected (no automatic promotion or reactivation)', (from, to) => {
    expect(() => assertRegistryTransition(from as never, to as never)).toThrow(RegistryStateError)
  })

  it.each([['BOGUS', 'ACTIVE'], ['PROVISIONING', 'BOGUS'], ['', 'PROVISIONING']])('unrecognised value %p → %p is rejected', (from, to) => {
    expect(() => assertRegistryTransition(from as never, to as never)).toThrow(RegistryStateError)
  })

  it('assertKnownRegistryStatus accepts exactly the schema-declared statuses', () => {
    for (const status of REGISTRY_STATUSES) expect(() => assertKnownRegistryStatus(status)).not.toThrow()
    for (const bad of ['active', 'BOGUS', '', null, undefined, 1]) expect(() => assertKnownRegistryStatus(bad)).toThrow(RegistryStateError)
    expect([...REGISTRY_STATUSES].sort()).toEqual(['ACTIVE', 'ARCHIVED', 'FAILED', 'PROVISIONING'])
  })
})

describe('registry ↔ physical schema diagnostic contract (read-only, no repair)', () => {
  const reg = (status: string, extra: Partial<NonNullable<RegistryDiagnosticInput['registry']>> = {}) => ({
    status,
    schemaName: SCHEMA,
    migrationVersion: '0000_empty',
    ...extra,
  })
  const diagnose = (input: RegistryDiagnosticInput) => diagnoseRegistryState(input)

  it('ACTIVE + physical schema absent → SCHEMA_MISSING', () => {
    expect(diagnose({ registry: reg('ACTIVE'), physicalSchema: 'MISSING' })).toMatchObject({ status: 'SCHEMA_MISSING', accessible: false })
  })

  it('ARCHIVED + physical schema present → ARCHIVED, no reactivation', () => {
    expect(diagnose({ registry: reg('ARCHIVED'), physicalSchema: 'EXISTS' })).toEqual({
      status: 'ARCHIVED',
      reasonCode: 'ARCHIVED_SCHEMA_PRESENT_NO_REACTIVATION',
      accessible: false,
    })
  })

  it('FAILED + physical schema present → FAILED, no automatic ACTIVE', () => {
    expect(diagnose({ registry: reg('FAILED'), physicalSchema: 'EXISTS' })).toMatchObject({ status: 'FAILED', accessible: false })
  })

  it('PROVISIONING + physical schema present → PROVISIONING, status left unchanged', () => {
    expect(diagnose({ registry: reg('PROVISIONING'), physicalSchema: 'EXISTS' })).toMatchObject({ status: 'PROVISIONING', accessible: false })
  })

  it('ACTIVE + unknown schema version → version gate blocker', () => {
    for (const migrationVersion of [null, '', '   ']) {
      expect(diagnose({ registry: reg('ACTIVE', { migrationVersion }), physicalSchema: 'EXISTS' })).toMatchObject({
        status: 'VERSION_GATE_BLOCKER',
        reasonCode: 'VERSION_UNKNOWN',
        accessible: false,
      })
    }
  })

  it('ACTIVE + a version differing from the caller-supplied expectation → version gate blocker', () => {
    expect(diagnose({ registry: reg('ACTIVE'), physicalSchema: 'EXISTS', expectedVersion: '0001_next' })).toMatchObject({
      status: 'VERSION_GATE_BLOCKER',
      reasonCode: 'VERSION_MISMATCH',
    })
  })

  it('no registry row → REGISTRY_MISSING', () => {
    expect(diagnose({ registry: null, physicalSchema: 'EXISTS' })).toMatchObject({ status: 'REGISTRY_MISSING', accessible: false })
  })

  it('an unrecognised status, an unsafe schema name or an unknown physical state → REGISTRY_INCONSISTENT', () => {
    expect(diagnose({ registry: reg('BOGUS'), physicalSchema: 'EXISTS' }).status).toBe('REGISTRY_INCONSISTENT')
    expect(diagnose({ registry: reg('ACTIVE', { schemaName: 'x"; drop schema public;--' }), physicalSchema: 'EXISTS' }).status).toBe('REGISTRY_INCONSISTENT')
    expect(diagnose({ registry: reg('ACTIVE'), physicalSchema: 'UNKNOWN' }).status).toBe('REGISTRY_INCONSISTENT')
  })

  it('ACTIVE + schema present + version known → HEALTHY, the only accessible outcome', () => {
    expect(diagnose({ registry: reg('ACTIVE'), physicalSchema: 'EXISTS', expectedVersion: '0000_empty' })).toEqual({ status: 'HEALTHY', reasonCode: 'OK', accessible: true })
    for (const status of ['PROVISIONING', 'FAILED', 'ARCHIVED', 'BOGUS']) {
      for (const physicalSchema of ['EXISTS', 'MISSING', 'UNKNOWN'] as const) {
        expect(diagnose({ registry: reg(status), physicalSchema }).accessible).toBe(false)
      }
    }
  })

  it('reports staleness only when the caller supplies a threshold, and never changes anything', () => {
    const updatedAt = new Date('2026-01-01T00:00:00Z')
    const now = new Date('2026-01-01T01:00:00Z')
    const input: RegistryDiagnosticInput = { registry: reg('PROVISIONING', { updatedAt }), physicalSchema: 'MISSING' }
    const before = JSON.stringify(input)

    expect(diagnose(input).stale).toBeUndefined()
    expect(diagnose({ ...input, staleness: { now, thresholdMs: 60_000 } }).stale).toBe(true)
    expect(diagnose({ ...input, staleness: { now, thresholdMs: 2 * 60 * 60 * 1000 } }).stale).toBe(false)
    expect(diagnose({ ...input, staleness: { now, thresholdMs: 60_000 } }).status).toBe('PROVISIONING')
    expect(JSON.stringify(input)).toBe(before)
  })

  it('never contains connection or schema secrets in its output', () => {
    const output = JSON.stringify(diagnose({ registry: reg('ACTIVE'), physicalSchema: 'MISSING' }))
    expect(output).not.toContain(SCHEMA)
  })
})
