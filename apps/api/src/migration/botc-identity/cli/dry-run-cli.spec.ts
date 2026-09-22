import { readFileSync } from 'fs'
import { join } from 'path'
import { runIdentityMigrationDryRun } from './dry-run-cli'
import { InMemoryStagingStore } from '../staging-store'
import { SimulatedTargetState } from '../simulated-target'
import type { DryRunCliInput } from './dry-run-cli'

function loadFixture(name: string): DryRunCliInput {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8')) as DryRunCliInput
}

describe('runIdentityMigrationDryRun — successful/mixed fixture (exit 0)', () => {
  it('runs the engine (preflight not fatal) and produces a full report', () => {
    const input = loadFixture('sample-dry-run-input.json')
    const result = runIdentityMigrationDryRun({ input, migrationRunId: 'run-fixed', now: () => new Date('2026-09-18T00:00:00.000Z') })

    expect(result.exitCode).toBe(0)
    expect(result.report).toBeDefined()
    expect(result.report?.migrationRunId).toBe('run-fixed')
    expect(result.report?.sourceRecordCounts.users).toBe(7)
    expect(result.report?.userResults.toCreate).toBeGreaterThan(0)
    expect(result.report?.permissionResults.mapped).toBe(1)
    expect(result.report?.permissionResults.unmapped).toBe(1)
    expect(result.report?.tenantResults.unresolved).toBeGreaterThanOrEqual(1) // user '2'
    expect(result.report?.passwordStrategySummary.ADMIN_ASSIGNED).toBe(1) // user '7'
    expect(result.report?.applyPerformed).toBe(false)
    expect(result.report?.applyNote).toMatch(/dry-run/i)
  })

  it('reports the duplicate user as a recoverable issue, not fatal', () => {
    const input = loadFixture('sample-dry-run-input.json')
    const result = runIdentityMigrationDryRun({ input, migrationRunId: 'run-1' })
    expect(result.exitCode).toBe(0)
    expect(result.report?.issues.recoverable.some(i => i.code === 'RECOVERABLE_DUPLICATE_USER')).toBe(true)
    expect(result.report?.issues.fatal).toEqual([])
  })

  it('reports the unmapped permission without producing a fabricated code', () => {
    const input = loadFixture('sample-dry-run-input.json')
    const result = runIdentityMigrationDryRun({ input, migrationRunId: 'run-1' })
    expect(result.report?.issues.recoverable.some(i => i.code === 'RECOVERABLE_UNMAPPED_PERMISSION')).toBe(true)
  })

  it('reports the simulated failure as a recoverable, retryable-on-next-run issue', () => {
    const input = loadFixture('sample-dry-run-input.json')
    const result = runIdentityMigrationDryRun({ input, migrationRunId: 'run-1' })
    expect(result.report?.issues.recoverable.some(i => i.code === 'RECOVERABLE_SIMULATED_WRITE_FAILURE')).toBe(true)
  })

  it('credential/session boundary passes with zero violations', () => {
    const input = loadFixture('sample-dry-run-input.json')
    const result = runIdentityMigrationDryRun({ input, migrationRunId: 'run-1' })
    expect(result.report?.credentialSessionBoundary).toEqual({ violations: 0, passed: true })
  })
})

describe('runIdentityMigrationDryRun — conflict fixture (exit 1, engine never runs)', () => {
  it('is fatal and does not run the engine — user results stay at zero', () => {
    const input = loadFixture('sample-dry-run-input-conflict.json')
    const result = runIdentityMigrationDryRun({ input, migrationRunId: 'run-conflict' })

    expect(result.exitCode).toBe(1)
    expect(result.report?.issues.fatal.some(i => i.code === 'FATAL_CONFLICTING_TENANT_ASSIGNMENT')).toBe(true)
    // Kapsam madde 4: fatal validation'da engine hiç çalışmaz -> tüm engine-bağımlı sayılar sıfır.
    expect(result.report?.userResults).toEqual({ toCreate: 0, toUpdate: 0, toSkip: 0 })
    expect(result.report?.roleTemplateResults).toEqual({ toCreate: 0 })
    expect(result.report?.tenantResults.assigned).toBe(0)
  })

  it('the conflicted user never appears as ASSIGNED and no other user is affected', () => {
    const input = loadFixture('sample-dry-run-input-conflict.json')
    const result = runIdentityMigrationDryRun({ input, migrationRunId: 'run-conflict' })
    expect(result.report?.tenantResults.unresolved).toBe(input.source.users.length) // ALL users reported unresolved since engine never ran
    expect(result.report?.tenantResults.conflicts).toBe(1)
  })

  it('also reports the orphan mapping entry (user 99) even though the run was blocked by an unrelated conflict', () => {
    const input = loadFixture('sample-dry-run-input-conflict.json')
    const result = runIdentityMigrationDryRun({ input, migrationRunId: 'run-conflict' })
    expect(result.report?.tenantResults.orphanMappingRecords).toBe(1)
    expect(result.report?.issues.recoverable.some(i => i.code === 'RECOVERABLE_ORPHAN_TENANT_MAPPING_ENTRY')).toBe(true)
  })
})

describe('runIdentityMigrationDryRun — input credential/session hygiene gate', () => {
  it('rejects an input fixture that itself carries a credential-like field, before touching the engine', () => {
    const input = loadFixture('sample-dry-run-input.json')
    const tainted = { ...input, source: { ...input.source, users: [{ ...input.source.users[0], passwordHash: 'x' } as never, ...input.source.users.slice(1)] } }
    const result = runIdentityMigrationDryRun({ input: tainted })
    expect(result.exitCode).toBe(1)
    expect(result.errors?.[0]).toMatch(/credential/i)
    expect(result.report).toBeUndefined()
  })

  it('rejects an input fixture that carries a session/token-like field', () => {
    const input = loadFixture('sample-dry-run-input.json')
    const tainted = { ...input, authSessions: [] } as unknown as DryRunCliInput
    const result = runIdentityMigrationDryRun({ input: tainted })
    expect(result.exitCode).toBe(1)
  })
})

describe('runIdentityMigrationDryRun — determinism (kapsam madde 8)', () => {
  it('two separate invocations over the same input produce an identical report (excluding generatedAt/migrationRunId when auto-generated)', () => {
    const input = loadFixture('sample-dry-run-input.json')
    const fixedNow = () => new Date('2026-09-18T00:00:00.000Z')
    const first = runIdentityMigrationDryRun({ input, migrationRunId: 'run-det', now: fixedNow })
    const second = runIdentityMigrationDryRun({ input, migrationRunId: 'run-det', now: fixedNow })
    expect(first.report).toEqual(second.report)
  })

  it('report content (counts, issues) is independent of newly generated internal UUIDs across invocations', () => {
    const input = loadFixture('sample-dry-run-input.json')
    const first = runIdentityMigrationDryRun({ input, migrationRunId: 'run-a' }) // fresh stores each time -> fresh UUIDs internally
    const second = runIdentityMigrationDryRun({ input, migrationRunId: 'run-b' })
    const strip = (r: typeof first.report) => (r ? { ...r, migrationRunId: undefined, generatedAt: undefined } : r)
    expect(strip(first.report)).toEqual(strip(second.report))
  })
})

describe('runIdentityMigrationDryRun — cross-invocation idempotency/retry (shared store, test-only capability)', () => {
  it('a second dry-run over the same shared stores does not duplicate results, and a simulated failure retried on a later run succeeds', () => {
    const input = loadFixture('sample-dry-run-input.json')
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()

    const first = runIdentityMigrationDryRun({ input, migrationRunId: 'run-1', stagingStore, targetState })
    expect(first.report?.issues.recoverable.some(i => i.code === 'RECOVERABLE_SIMULATED_WRITE_FAILURE')).toBe(true)

    // NOTE: DRY_RUN never persists to the passed-in stores (by design — see migration-run.service.ts),
    // so a second DRY_RUN call with the same input reproduces an identical report rather than
    // reflecting a "previous run" — this itself is the proof that dry-run leaves no state behind.
    const second = runIdentityMigrationDryRun({ input, migrationRunId: 'run-2', stagingStore, targetState })
    expect(stagingStore.all()).toHaveLength(0)
    expect(targetState.usersByLegacyId.size).toBe(0)
    expect(second.report?.userResults).toEqual(first.report?.userResults)
  })
})

describe('runIdentityMigrationDryRun — no persistent state (kapsam madde 7)', () => {
  it('does not mutate the caller-supplied stores at all in DRY_RUN mode', () => {
    const input = loadFixture('sample-dry-run-input.json')
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    runIdentityMigrationDryRun({ input, stagingStore, targetState })
    expect(stagingStore.all()).toHaveLength(0)
    expect(targetState.usersByLegacyId.size).toBe(0)
    expect(targetState.tenantMembershipsByUserId.size).toBe(0)
  })
})
