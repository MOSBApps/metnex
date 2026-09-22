import { getTableConfig, text } from 'drizzle-orm/pg-core'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  assertCustomerSchemaName,
  generateCustomerSchemaName,
  isCustomerSchemaName,
  schemaNameMatchesCustomerRoot,
} from '../tenant-scope/schema-name.util'
import { DATA_PLANE_LOCK_PREFIX, dataPlaneMigrationLockKey, type DataPlaneMigrationPorts, type DataPlaneRegistryRecord } from './data-plane-migration.contract'
import { runDataPlaneMigration } from './data-plane-migration.orchestrator'
import { createDataPlaneSchema, dataPlaneSchemaFor } from './data-plane-schema'
import {
  compareDataPlaneVersions,
  DATA_PLANE_BASE_VERSION,
  dataPlaneVersionSequence,
  isDataPlaneVersion,
  pendingMigrations,
  validateMigrationChain,
  type DataPlaneMigrationDefinition,
} from './data-plane-version'

/**
 * Data-plane foundation contract (TASK-027.32). Nothing here connects to a database: every port is
 * an in-memory fake, and pgSchema() is only used to build (never execute) schema-qualified handles.
 */
const SRC = join(__dirname, '..')
const API_ROOT = join(SRC, '..')
const REPO_ROOT = join(API_ROOT, '..', '..')

const ROOT = '11111111-1111-4111-8111-111111111111'
const OTHER_ROOT = '22222222-2222-4222-8222-222222222222'
const SCHEMA = generateCustomerSchemaName(ROOT, 'acme')
const OTHER_SCHEMA = generateCustomerSchemaName(OTHER_ROOT, 'acme')

const V1: DataPlaneMigrationDefinition = { version: '0001_first', checksum: 'a'.repeat(64) }
const V2: DataPlaneMigrationDefinition = { version: '0002_second', checksum: 'b'.repeat(64) }
const CHAIN = [V1, V2]

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const productionFiles = (dir: string) => files(dir).filter(file => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
const readCode = (file: string) => strip(readFileSync(file, 'utf8'))

// ---------------------------------------------------------------------------
// fakes
// ---------------------------------------------------------------------------
interface World {
  tenant: { type: string; status: string } | null
  registry: DataPlaneRegistryRecord | null
  physical: 'EXISTS' | 'MISSING' | 'UNKNOWN'
  lockHeld: boolean
  ledger: Map<string, { checksum: string }>
  executorError?: Error
  casResult: boolean
  registryAfterFirstRead?: Partial<DataPlaneRegistryRecord>
}

function activeRegistry(overrides: Partial<DataPlaneRegistryRecord> = {}): DataPlaneRegistryRecord {
  return { customerRootTenantId: ROOT, schemaName: SCHEMA, status: 'ACTIVE', migrationVersion: DATA_PLANE_BASE_VERSION, ...overrides }
}

function build(overrides: Partial<World> = {}) {
  const world: World = {
    tenant: { type: 'ROOT', status: 'ACTIVE' },
    registry: activeRegistry(),
    physical: 'EXISTS',
    lockHeld: false,
    ledger: new Map(),
    casResult: true,
    ...overrides,
  }
  const calls: string[] = []
  const rootsSeen = new Set<string>()
  const applied: Array<{ schemaName: string; version: string; schemaHandleName: string }> = []
  const versionWrites: Array<[string, string]> = []
  let registryReads = 0
  const track = (name: string, root?: string) => {
    calls.push(name)
    if (root !== undefined) rootsSeen.add(root)
  }

  const ports: DataPlaneMigrationPorts = {
    tenants: {
      getCustomerRoot: async root => {
        track('tenants.get', root)
        return world.tenant
      },
    },
    registry: {
      get: async root => {
        track('registry.get', root)
        registryReads += 1
        if (registryReads > 1 && world.registryAfterFirstRead && world.registry) return { ...world.registry, ...world.registryAfterFirstRead }
        return world.registry
      },
      compareAndSetVersion: async (root, expected, next) => {
        track('registry.cas', root)
        versionWrites.push([expected, next])
        if (!world.casResult) return false
        if (world.registry) world.registry = { ...world.registry, migrationVersion: next }
        return true
      },
    },
    physical: {
      observeSchema: async name => {
        track('physical.observe')
        expect(isCustomerSchemaName(name)).toBe(true)
        return world.physical
      },
    },
    lock: {
      tryAcquire: async key => {
        track('lock.tryAcquire')
        expect(key).toBe(dataPlaneMigrationLockKey(ROOT))
        if (world.lockHeld) return false
        world.lockHeld = true
        return true
      },
      release: async () => {
        track('lock.release')
        world.lockHeld = false
      },
    },
    ledger: {
      findApplied: async (root, version) => {
        track('ledger.find', root)
        return world.ledger.get(`${root}:${version}`) ?? null
      },
      recordApplied: async entry => {
        track('ledger.record', entry.customerRootTenantId)
        const key = `${entry.customerRootTenantId}:${entry.version}`
        if (world.ledger.has(key)) throw new Error('duplicate ledger entry')
        world.ledger.set(key, { checksum: entry.checksum })
      },
    },
    executor: {
      apply: async ({ schema, schemaName, migration }) => {
        track('executor.apply')
        applied.push({ schemaName, version: migration.version, schemaHandleName: schema.schemaName })
        if (world.executorError) throw world.executorError
      },
    },
  }
  const writes = () => calls.filter(name => ['lock.tryAcquire', 'ledger.record', 'executor.apply', 'registry.cas'].includes(name))
  return { world, ports, calls, writes, rootsSeen, applied, versionWrites }
}

const request = (overrides: Record<string, unknown> = {}) => ({ customerRootTenantId: ROOT, mode: 'APPLY', runId: 'run-1', ...overrides })

// ---------------------------------------------------------------------------
describe('customer schema identifiers (central helper)', () => {
  it('accepts exactly the generated shape', () => {
    expect(isCustomerSchemaName(SCHEMA)).toBe(true)
    expect(isCustomerSchemaName(generateCustomerSchemaName(OTHER_ROOT, 'Ünïcode & spaces!'))).toBe(true)
  })

  it.each([
    'public', 'information_schema', 'pg_catalog', 'pg_temp', 'drizzle', '', 'cust_', 'cust__aaaaaaaa', 'CUST_acme_aaaaaaaa',
    'cust_acme_aaaaaaa', 'cust_acme_aaaaaaaaa', 'cust_acme_ggggggggg', 'cust_ac"me_aaaaaaaa', 'cust_acme_aaaaaaaa; drop schema public',
    'cust_acme_aaaaaaaa ', `cust_${'x'.repeat(80)}_aaaaaaaa`, 'acme_aaaaaaaa',
  ])('rejects %p', name => {
    expect(isCustomerSchemaName(name)).toBe(false)
    expect(() => assertCustomerSchemaName(name)).toThrow('Invalid customer schema name')
  })

  it.each([undefined, null, 42, {}, ['cust_acme_aaaaaaaa']])('rejects a non-string %p', value => {
    expect(isCustomerSchemaName(value)).toBe(false)
  })

  it('never echoes the rejected value', () => {
    const hostile = 'cust_evil"; select * from secrets --'
    expect(() => assertCustomerSchemaName(hostile)).toThrow(/^Invalid customer schema name$/)
  })

  it('ties a schema to its own customer-root tenant only', () => {
    expect(schemaNameMatchesCustomerRoot(SCHEMA, ROOT)).toBe(true)
    expect(schemaNameMatchesCustomerRoot(SCHEMA, OTHER_ROOT)).toBe(false)
    expect(schemaNameMatchesCustomerRoot(OTHER_SCHEMA, ROOT)).toBe(false)
    expect(schemaNameMatchesCustomerRoot('public', ROOT)).toBe(false)
  })
})

describe('pgSchema contract', () => {
  it('builds a schema-qualified handle from a validated customer schema name', () => {
    const handle = createDataPlaneSchema(SCHEMA)
    expect(handle.schemaName).toBe(SCHEMA)
    const table = handle.table('example', { id: text('id').primaryKey() })
    expect(getTableConfig(table).schema).toBe(SCHEMA)
  })

  it.each(['public', 'information_schema', 'cust_acme', 'x; drop schema public', ''])('refuses to build a handle for %p', name => {
    expect(() => createDataPlaneSchema(name)).toThrow('Invalid customer schema name')
  })

  it('a resolved scope yields a handle only when the schema belongs to that customer root', () => {
    expect(dataPlaneSchemaFor({ customerRootTenantId: ROOT, schemaName: SCHEMA }).schemaName).toBe(SCHEMA)
    expect(() => dataPlaneSchemaFor({ customerRootTenantId: ROOT, schemaName: OTHER_SCHEMA })).toThrow('Schema does not belong to the customer root')
  })

  it('pgSchema() is called in exactly one production file and search_path is never used', () => {
    const production = productionFiles(SRC)
    const callers = production.filter(file => /\bpgSchema\s*\(/.test(readCode(file))).map(file => relative(SRC, file))
    expect(callers).toEqual(['data-plane/data-plane-schema.ts'])
    expect(production.filter(file => /search_path/i.test(readCode(file))).map(file => relative(SRC, file))).toEqual([])
  })

  it('a schema or identifier interpolated into DDL text always goes through quoteIdentifier()', () => {
    const offenders: string[] = []
    for (const file of [...productionFiles(join(SRC, 'tenant-scope')), ...productionFiles(join(SRC, 'data-plane'))]) {
      for (const literal of readCode(file).match(/`[^`]*`/g) ?? []) {
        if (!/\b(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|SET)\b/i.test(literal) || !literal.includes('${')) continue
        for (const expression of literal.matchAll(/\$\{([^}]*)\}/g)) {
          if (!(expression[1] as string).trim().startsWith('quoteIdentifier(')) offenders.push(`${relative(SRC, file)}: ${literal}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('data-plane version contract', () => {
  it('the base version is the value provisioning stamps', () => {
    expect(DATA_PLANE_BASE_VERSION).toBe('0000_empty')
    expect(isDataPlaneVersion(DATA_PLANE_BASE_VERSION)).toBe(true)
  })

  it.each(['0001_first', '0002_shift_reports_foundation'])('%s is a valid version', version => {
    expect(isDataPlaneVersion(version)).toBe(true)
  })

  it.each(['', '1_first', '0001', '0001_', '0001_First', '0001-first', '../0001_x', 42, null, undefined])('%p is not a valid version', version => {
    expect(isDataPlaneVersion(version)).toBe(false)
  })

  it('orders versions by their numeric prefix', () => {
    expect(dataPlaneVersionSequence('0007_x')).toBe(7)
    expect(compareDataPlaneVersions('0001_a', '0002_b')).toBeLessThan(0)
    expect(compareDataPlaneVersions('0010_a', '0002_b')).toBeGreaterThan(0)
    expect(() => dataPlaneVersionSequence('bad')).toThrow('Invalid data-plane version')
  })

  it('validates a migration chain', () => {
    expect(validateMigrationChain([])).toEqual([])
    expect(validateMigrationChain(CHAIN)).toEqual([])
    expect(validateMigrationChain([{ version: 'bad', checksum: 'a'.repeat(64) }])).not.toEqual([])
    expect(validateMigrationChain([{ version: '0001_a', checksum: 'short' }])).not.toEqual([])
    expect(validateMigrationChain([V2, V1])).not.toEqual([])
    expect(validateMigrationChain([V1, V1])).not.toEqual([])
    expect(validateMigrationChain([{ version: '0000_again', checksum: 'a'.repeat(64) }])).not.toEqual([])
  })

  it('computes what is pending from the registry version', () => {
    expect(pendingMigrations(DATA_PLANE_BASE_VERSION, [])).toEqual({ status: 'OK', fromVersion: '0000_empty', toVersion: '0000_empty', pending: [] })
    expect(pendingMigrations(DATA_PLANE_BASE_VERSION, CHAIN)).toEqual({ status: 'OK', fromVersion: '0000_empty', toVersion: '0002_second', pending: CHAIN })
    expect(pendingMigrations('0001_first', CHAIN)).toMatchObject({ status: 'OK', pending: [V2] })
    expect(pendingMigrations('0002_second', CHAIN)).toMatchObject({ status: 'OK', pending: [] })
    expect(pendingMigrations('0009_unknown', CHAIN)).toEqual({ status: 'VERSION_NOT_IN_CHAIN' })
  })
})

describe('runner contract: explicit scope only', () => {
  it.each<[string, unknown]>([
    ['no argument at all', undefined],
    ['null', null],
    ['an array', [request()]],
    ['a string', ROOT],
    ['an empty object', {}],
    ['a missing mode', request({ mode: undefined })],
    ['a lower-case mode', request({ mode: 'apply' })],
    ['an unknown mode', request({ mode: 'FORCE' })],
    ['an empty root', request({ customerRootTenantId: '' })],
    ['a wildcard root', request({ customerRootTenantId: '*' })],
    ['an "all" root', request({ customerRootTenantId: 'all' })],
    ['a non-UUID name', request({ customerRootTenantId: 'root-1' })],
    ['a root with whitespace', request({ customerRootTenantId: ' ' + ROOT })],
    ['a root with a newline', request({ customerRootTenantId: ROOT + '\n' })],
    ['an oversized root', request({ customerRootTenantId: 'r'.repeat(129) })],
    ['a list of roots', request({ customerRootTenantId: [ROOT, OTHER_ROOT] })],
    ['an extra "all" flag', request({ all: true })],
    ['an extra tenant list', request({ customerRootTenantIds: [ROOT] })],
    ['a smuggled system-admin flag', request({ isSystemAdmin: true })],
    ['a smuggled role', request({ role: 'PLATFORM_ROOT' })],
    ['a smuggled tenant id', request({ tenantId: ROOT })],
    ['a missing run id', request({ runId: undefined })],
    ['an invalid run id', request({ runId: 'run 1; drop' })],
  ])('rejects %s and touches no port', async (_name, raw) => {
    const { ports, calls } = build()
    const outcome = await runDataPlaneMigration(raw, CHAIN, ports)
    expect(outcome.status).toBe('REJECTED')
    expect(calls).toEqual([])
  })

  it('cannot be run with no arguments (a parameterless call is rejected)', async () => {
    const { ports, calls } = build()
    const outcome = await (runDataPlaneMigration as unknown as (...args: unknown[]) => Promise<{ status: string }>)(undefined, undefined, ports)
    expect(outcome.status).toBe('REJECTED')
    expect(calls).toEqual([])
  })

  it('reports invalid field names only, never values', async () => {
    const { ports } = build()
    const outcome = await runDataPlaneMigration(request({ customerRootTenantId: 'TopSecretMarker123 bad', extra: 1 }), CHAIN, ports)
    expect(outcome).toEqual({ status: 'REJECTED', reason: 'INVALID_REQUEST', invalidFields: ['extra', 'customerRootTenantId'] })
    expect(JSON.stringify(outcome)).not.toContain('TopSecretMarker123')
  })

  it('an invalid migration chain blocks before any port is used', async () => {
    const { ports, calls } = build()
    const outcome = await runDataPlaneMigration(request(), [V2, V1], ports)
    expect(outcome).toMatchObject({ status: 'BLOCKED', reason: 'INVALID_MIGRATION_CHAIN' })
    expect(calls).toEqual([])
  })

  it('touches only the requested customer root', async () => {
    const { ports, rootsSeen } = build()
    await runDataPlaneMigration(request(), CHAIN, ports)
    expect([...rootsSeen]).toEqual([ROOT])
  })
})

describe('runner contract: fail-closed on every non-ACTIVE or inconsistent state', () => {
  type Case = [string, Partial<World>, string]
  const cases: Case[] = [
    ['tenant missing', { tenant: null }, 'TENANT_NOT_ACTIVE_ROOT'],
    ['PLATFORM_ROOT tenant', { tenant: { type: 'PLATFORM_ROOT', status: 'ACTIVE' } }, 'TENANT_NOT_ACTIVE_ROOT'],
    ['STANDARD tenant', { tenant: { type: 'STANDARD', status: 'ACTIVE' } }, 'TENANT_NOT_ACTIVE_ROOT'],
    ['inactive root tenant', { tenant: { type: 'ROOT', status: 'SUSPENDED' } }, 'TENANT_NOT_ACTIVE_ROOT'],
    ['registry row missing', { registry: null }, 'REGISTRY_MISSING'],
    ['ARCHIVED (schema present)', { registry: activeRegistry({ status: 'ARCHIVED' }) }, 'ARCHIVED'],
    ['ARCHIVED (schema absent)', { registry: activeRegistry({ status: 'ARCHIVED' }), physical: 'MISSING' }, 'ARCHIVED'],
    ['FAILED (schema present)', { registry: activeRegistry({ status: 'FAILED' }) }, 'FAILED'],
    ['FAILED (schema absent)', { registry: activeRegistry({ status: 'FAILED' }), physical: 'MISSING' }, 'FAILED'],
    ['PROVISIONING (schema present)', { registry: activeRegistry({ status: 'PROVISIONING' }) }, 'PROVISIONING'],
    ['PROVISIONING (schema absent)', { registry: activeRegistry({ status: 'PROVISIONING' }), physical: 'MISSING' }, 'PROVISIONING'],
    ['ACTIVE but physical schema absent', { physical: 'MISSING' }, 'SCHEMA_MISSING'],
    ['ACTIVE but physical state unknown', { physical: 'UNKNOWN' }, 'REGISTRY_INCONSISTENT'],
    ['unrecognised status', { registry: activeRegistry({ status: 'BOGUS' }) }, 'REGISTRY_INCONSISTENT'],
    ['registry version null', { registry: activeRegistry({ migrationVersion: null }) }, 'VERSION_GATE_BLOCKER'],
    ['registry version empty', { registry: activeRegistry({ migrationVersion: '  ' }) }, 'VERSION_GATE_BLOCKER'],
    ['registry version not in the chain', { registry: activeRegistry({ migrationVersion: '0009_unknown' }) }, 'VERSION_GATE_BLOCKER'],
    ['schema of another customer root', { registry: activeRegistry({ schemaName: OTHER_SCHEMA }) }, 'SCHEMA_ROOT_MISMATCH'],
    ['registry row of another customer root', { registry: activeRegistry({ customerRootTenantId: OTHER_ROOT }) }, 'REGISTRY_INCONSISTENT'],
    ['unsafe schema name', { registry: activeRegistry({ schemaName: 'public' }) }, 'REGISTRY_INCONSISTENT'],
  ]

  it.each(cases.flatMap(([name, world, reason]) => (['DRY_RUN', 'APPLY'] as const).map(mode => [`${name} / ${mode}`, world, reason, mode] as const)))(
    '%s → BLOCKED, nothing written',
    async (_name, world, reason, mode) => {
      const { ports, writes, calls } = build(world)
      const outcome = await runDataPlaneMigration(request({ mode }), CHAIN, ports)
      expect(outcome).toMatchObject({ status: 'BLOCKED', reason })
      expect(writes()).toEqual([])
      if (world.registry?.schemaName === 'public') expect(calls).not.toContain('physical.observe')
    },
  )

  it('never invents a schema or changes a registry status: the port has no such operation', () => {
    const { ports } = build()
    expect(Object.keys(ports.registry).sort()).toEqual(['compareAndSetVersion', 'get'])
  })

  it('blocks before taking the lock when the registry version is behind or unknown to the chain', async () => {
    const { ports, calls } = build({ registry: activeRegistry({ migrationVersion: '0005_elsewhere' }) })
    await runDataPlaneMigration(request(), CHAIN, ports)
    expect(calls).not.toContain('lock.tryAcquire')
  })

  it('decides again after taking the lock: a row archived in between is not migrated, and the lock is released', async () => {
    const { ports, calls, applied } = build({ registryAfterFirstRead: { status: 'ARCHIVED' } })
    const outcome = await runDataPlaneMigration(request(), CHAIN, ports)
    expect(outcome).toMatchObject({ status: 'BLOCKED', reason: 'ARCHIVED' })
    expect(applied).toEqual([])
    expect(calls).toContain('lock.release')
    expect(calls).not.toContain('ledger.record')
  })
})

describe('runner contract: dry-run and apply', () => {
  it('DRY_RUN reports the plan and persists nothing (no lock, no ledger, no executor, no version write)', async () => {
    const { ports, writes, world } = build()
    const outcome = await runDataPlaneMigration(request({ mode: 'DRY_RUN' }), CHAIN, ports)
    expect(outcome).toEqual({ status: 'DRY_RUN', customerRootTenantId: ROOT, fromVersion: '0000_empty', toVersion: '0002_second', pending: ['0001_first', '0002_second'] })
    expect(writes()).toEqual([])
    expect(world.ledger.size).toBe(0)
    expect(world.registry?.migrationVersion).toBe('0000_empty')
  })

  it('DRY_RUN and APPLY agree on the plan', async () => {
    const dry = await runDataPlaneMigration(request({ mode: 'DRY_RUN' }), CHAIN, build().ports)
    const applied = await runDataPlaneMigration(request({ mode: 'APPLY' }), CHAIN, build().ports)
    expect(dry).toMatchObject({ pending: ['0001_first', '0002_second'] })
    expect(applied).toMatchObject({ status: 'APPLIED', applied: ['0001_first', '0002_second'] })
  })

  it('APPLY runs migrations in order inside a validated pgSchema handle, under the lock', async () => {
    const { ports, calls, applied, versionWrites, world } = build()
    const outcome = await runDataPlaneMigration(request(), CHAIN, ports)
    expect(outcome).toEqual({ status: 'APPLIED', customerRootTenantId: ROOT, fromVersion: '0000_empty', toVersion: '0002_second', applied: ['0001_first', '0002_second'], skipped: [] })
    expect(applied).toEqual([
      { schemaName: SCHEMA, version: '0001_first', schemaHandleName: SCHEMA },
      { schemaName: SCHEMA, version: '0002_second', schemaHandleName: SCHEMA },
    ])
    expect(versionWrites).toEqual([['0000_empty', '0001_first'], ['0001_first', '0002_second']])
    expect(world.registry).toMatchObject({ status: 'ACTIVE', migrationVersion: '0002_second' })
    expect(calls.filter(name => name === 'lock.tryAcquire')).toHaveLength(1)
    expect(calls.filter(name => name === 'lock.release')).toHaveLength(1)
    expect(calls.indexOf('lock.tryAcquire')).toBeLessThan(calls.indexOf('executor.apply'))
    expect(world.lockHeld).toBe(false)
  })

  it('an empty chain at the base version is a no-op', async () => {
    const { ports, writes } = build()
    expect(await runDataPlaneMigration(request(), [], ports)).toEqual({ status: 'NOOP', customerRootTenantId: ROOT, version: '0000_empty' })
    expect(writes()).toEqual([])
  })
})

describe('runner contract: idempotency, checksums, concurrency, failures', () => {
  it('a repeated APPLY is a no-op: nothing re-executed, no duplicate ledger entry', async () => {
    const { ports, applied, world } = build()
    await runDataPlaneMigration(request(), CHAIN, ports)
    const second = await runDataPlaneMigration(request({ runId: 'run-2' }), CHAIN, ports)
    expect(second).toEqual({ status: 'NOOP', customerRootTenantId: ROOT, version: '0002_second' })
    expect(applied).toHaveLength(2)
    expect(world.ledger.size).toBe(2)
  })

  it('recovers a run that recorded a migration but did not advance the version, without re-executing it', async () => {
    const { ports, applied, world } = build({ casResult: false })
    const failed = await runDataPlaneMigration(request(), CHAIN, ports)
    expect(failed).toMatchObject({ status: 'FAILED', category: 'VERSION_CONFLICT', failedVersion: '0001_first' })
    expect(world.ledger.size).toBe(1)

    world.casResult = true
    const recovered = await runDataPlaneMigration(request({ runId: 'run-2' }), CHAIN, ports)
    expect(recovered).toMatchObject({ status: 'APPLIED', applied: ['0002_second'], skipped: ['0001_first'] })
    expect(applied.map(entry => entry.version)).toEqual(['0001_first', '0002_second'])
    expect(world.ledger.size).toBe(2)
  })

  it('a changed checksum for an already-applied version is blocked before anything runs', async () => {
    const { ports, applied, world, calls } = build()
    world.ledger.set(`${ROOT}:0001_first`, { checksum: 'c'.repeat(64) })
    const outcome = await runDataPlaneMigration(request(), CHAIN, ports)
    expect(outcome).toMatchObject({ status: 'BLOCKED', reason: 'CHECKSUM_MISMATCH', detail: '0001_first' })
    expect(applied).toEqual([])
    expect(calls).not.toContain('ledger.record')
    expect(calls).toContain('lock.release')
  })

  it('a concurrent run is blocked, executes nothing and does not release a lock it never held', async () => {
    const { ports, applied, calls } = build({ lockHeld: true })
    const outcome = await runDataPlaneMigration(request(), CHAIN, ports)
    expect(outcome).toMatchObject({ status: 'BLOCKED', reason: 'CONCURRENT_RUN' })
    expect(applied).toEqual([])
    expect(calls).not.toContain('lock.release')
  })

  it('the lock key uses a data-plane namespace, distinct from the control-plane migration lock', () => {
    const controlPlaneName = /LOCK_NAME = '([^']+)'/.exec(readFileSync(join(SRC, 'migrate.ts'), 'utf8'))?.[1] as string
    expect(dataPlaneMigrationLockKey(ROOT)).toBe(`${DATA_PLANE_LOCK_PREFIX}${ROOT}`)
    expect(dataPlaneMigrationLockKey(ROOT).startsWith(controlPlaneName)).toBe(false)
    expect(controlPlaneName.startsWith(DATA_PLANE_LOCK_PREFIX)).toBe(false)
    expect(dataPlaneMigrationLockKey(ROOT)).not.toBe(dataPlaneMigrationLockKey(OTHER_ROOT))
  })

  it('an executor failure stops the run, keeps earlier progress, releases the lock and leaks no error text', async () => {
    const marker = 'TopSecretMarker123'
    const { ports, world, calls } = build()
    let count = 0
    const original = ports.executor.apply
    ports.executor.apply = async input => {
      count += 1
      if (count === 2) throw new Error(`failure for postgresql://svc:${marker}@db.internal/app in schema ${SCHEMA}`)
      return original(input)
    }
    const outcome = await runDataPlaneMigration(request(), CHAIN, ports)
    expect(outcome).toEqual({ status: 'FAILED', customerRootTenantId: ROOT, category: 'MIGRATION_EXECUTION_ERROR', failedVersion: '0002_second', applied: ['0001_first'] })
    expect(JSON.stringify(outcome)).not.toContain(marker)
    expect(JSON.stringify(outcome)).not.toContain(SCHEMA)
    expect(world.registry?.migrationVersion).toBe('0001_first')
    expect(world.lockHeld).toBe(false)
    expect(calls.filter(name => name === 'lock.release')).toHaveLength(1)
  })

  it('never puts a schema name in any outcome', async () => {
    const outcomes = [
      await runDataPlaneMigration(request({ mode: 'DRY_RUN' }), CHAIN, build().ports),
      await runDataPlaneMigration(request(), CHAIN, build().ports),
      await runDataPlaneMigration(request(), CHAIN, build({ registry: activeRegistry({ status: 'ARCHIVED' }) }).ports),
    ]
    for (const outcome of outcomes) expect(JSON.stringify(outcome)).not.toContain('cust_')
  })
})

describe('boundaries: control-plane separation, no wiring, no authority', () => {
  const dataPlaneFiles = productionFiles(join(SRC, 'data-plane'))

  it('the orchestrator is pure: it imports only the local contract, version, schema and diagnostics modules', () => {
    const imports = [...readCode(join(SRC, 'data-plane', 'data-plane-migration.orchestrator.ts')).matchAll(/from\s+'([^']+)'/g)].map(match => match[1])
    expect([...new Set(imports)].sort()).toEqual([
      '../tenant-scope/registry-diagnostics',
      '../tenant-scope/schema-name.util',
      './data-plane-migration.contract',
      './data-plane-schema',
      './data-plane-version',
    ])
  })

  it('no data-plane file uses Nest, HTTP, tenant scope, guards or any user/role concept', () => {
    for (const file of dataPlaneFiles) {
      const code = readCode(file)
      expect(code).not.toMatch(/@nestjs|TenantScopeService|PermissionGuard|TenantMembershipGuard|Controller|\bRequest\b|isSystemAdmin|TENANT_ADMIN|SYSTEM_ADMIN|PLATFORM_ROOT|userId|req\./)
    }
  })

  it('no data-plane file touches the control-plane migration mechanism or a database driver', () => {
    for (const file of dataPlaneFiles) {
      const code = readCode(file)
      expect(code).not.toMatch(/drizzle\/migrations|MIGRATIONS_FOLDER|drizzle-kit|migrator|from 'pg'|node-postgres|DbService|DATABASE_URL|process\.env/)
    }
  })

  it('the control-plane entrypoint knows nothing about the data plane', () => {
    expect(readCode(join(SRC, 'migrate.ts'))).not.toMatch(/data-?plane|DataPlane|pgSchema|customer-?root/i)
  })

  it('nothing outside src/data-plane imports it, and it is not a Nest provider or lifecycle hook', () => {
    const importers = productionFiles(SRC)
      .filter(file => !file.startsWith(join(SRC, 'data-plane')))
      .filter(file => /from\s+'[^']*\/data-plane\//.test(readCode(file)))
      .map(file => relative(SRC, file))
    expect(importers).toEqual([])
    for (const file of dataPlaneFiles) {
      expect(readCode(file)).not.toMatch(/@Injectable|@Module|OnModuleInit|OnApplicationBootstrap|onModuleInit|setInterval|setTimeout|@Cron/)
    }
    for (const file of ['main.ts', 'app.module.ts']) expect(readCode(join(SRC, file))).not.toMatch(/data-?plane/i)
    for (const file of productionFiles(SRC).filter(candidate => /\.(module|controller)\.ts$/.test(candidate))) {
      expect(readCode(file)).not.toMatch(/data-plane/)
    }
  })

  it('no script, image or pipeline step runs it', () => {
    expect(readFileSync(join(API_ROOT, 'package.json'), 'utf8')).not.toMatch(/data-plane/i)
    expect(readFileSync(join(API_ROOT, 'Dockerfile'), 'utf8')).not.toMatch(/data-plane/i)
    expect(readFileSync(join(REPO_ROOT, '.github', 'workflows', 'pipeline.yml'), 'utf8')).not.toMatch(/data-plane/i)
  })

  it('production code never uses raw pgSchema() output as a string or a request field', () => {
    for (const file of dataPlaneFiles) expect(readCode(file)).not.toMatch(/req\.(body|query|params)|@Body|@Query|@Param/)
  })
})
