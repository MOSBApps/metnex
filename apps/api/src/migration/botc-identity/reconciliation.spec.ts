import { buildReconciliationSnapshot, reconcileMigrationRuns } from './reconciliation'
import type { ReconciliationInputSnapshot } from './reconciliation'
import { MigrationRunService } from './migration-run.service'
import { SimulatedTargetState } from './simulated-target'
import { InMemoryStagingStore } from './staging-store'
import type { ApprovedTenantAssignmentEntry, BotcIdentitySourceSnapshot, MigrationIssue } from './types'

function user(legacyId: string, overrides: Partial<BotcIdentitySourceSnapshot['users'][number]> = {}) {
  return {
    legacyId,
    username: `u${legacyId}`,
    fullName: `User ${legacyId}`,
    isActive: true,
    email: `u${legacyId}@example.com`,
    createdDate: '2020-01-01T00:00:00.000Z',
    roleLegacyId: null,
    sirket: null,
    ...overrides,
  }
}

/** Runs a real dry-run and captures a reconciliation snapshot — used to build realistic fixtures. */
function dryRunSnapshot(params: { source: BotcIdentitySourceSnapshot; table: ApprovedTenantAssignmentEntry[]; migrationRunId: string; adminAssignedPasswordLegacyIds?: string[] }): ReconciliationInputSnapshot {
  const service = new MigrationRunService()
  const stagingStore = new InMemoryStagingStore()
  const targetState = new SimulatedTargetState()
  const { report } = service.run({
    source: params.source,
    approvedTenantAssignmentTable: params.table,
    adminAssignedPasswordLegacyIds: new Set(params.adminAssignedPasswordLegacyIds ?? []),
    stagingStore,
    targetState,
    mode: 'APPLY', // captured via a real stores pair so staging records actually exist for the snapshot
    migrationRunId: params.migrationRunId,
  })
  return buildReconciliationSnapshot({
    migrationRunId: params.migrationRunId,
    stagingStore,
    targetState,
    issues: report.errorsAndWarnings,
    roleTemplateCount: report.roleAndPermissionChanges.tenantRoleTemplatesToCreate,
    permissionMappedCount: report.roleAndPermissionChanges.permissionCodesMapped,
    permissionUnmappedCount: report.roleAndPermissionChanges.permissionCodesUnmapped,
  })
}

const baseSnapshot: BotcIdentitySourceSnapshot = {
  users: [user('1'), user('2')],
  roles: [],
  permissions: [{ legacyId: '100', permissionName: 'CanManageShifts' }],
  userPermissions: [{ legacyId: '1000', userLegacyId: '1', permissionLegacyId: '100' }],
}
const baseTable: ApprovedTenantAssignmentEntry[] = [
  { userLegacyId: '1', tenantSlug: 'MOSB' },
  { userLegacyId: '2', tenantSlug: 'MOSB' },
]

describe('reconcileMigrationRuns — scenario 1: identical report -> MATCHED', () => {
  it('two identical dry-runs produce zero diffs and MATCHED', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1' })
    const after = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-2' })
    const result = reconcileMigrationRuns(before, after)
    expect(result.reconciliationStatus).toBe('MATCHED')
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
    expect(result.changed).toEqual([])
    expect(result.unchanged).toHaveLength(2)
  })
})

describe('reconcileMigrationRuns — scenario 2: new user -> CHANGED, added', () => {
  it('a user present only in "after" is reported as added', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1' })
    const withNewUser: BotcIdentitySourceSnapshot = { ...baseSnapshot, users: [...baseSnapshot.users, user('3')] }
    const after = dryRunSnapshot({ source: withNewUser, table: [...baseTable, { userLegacyId: '3', tenantSlug: 'MOSB' }], migrationRunId: 'run-2' })
    const result = reconcileMigrationRuns(before, after)
    expect(result.reconciliationStatus).toBe('CHANGED')
    expect(result.added.map(e => e.sourceLegacyId)).toEqual(['3'])
  })
})

describe('reconcileMigrationRuns — scenario 3: updated user -> CHANGED, changed + checksum diff', () => {
  it('a user whose source data changed is reported as changed, with a checksum diff', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1' })
    const updated: BotcIdentitySourceSnapshot = { ...baseSnapshot, users: baseSnapshot.users.map(u => (u.legacyId === '1' ? user('1', { fullName: 'Renamed' }) : u)) }
    const after = dryRunSnapshot({ source: updated, table: baseTable, migrationRunId: 'run-2' })
    const result = reconcileMigrationRuns(before, after)
    expect(result.reconciliationStatus).toBe('CHANGED')
    expect(result.changed.map(e => e.sourceLegacyId)).toContain('1')
    expect(result.sourceChecksumDiffs.some(d => d.sourceLegacyId === '1' && d.before !== d.after)).toBe(true)
  })
})

describe('reconcileMigrationRuns — scenario 4: missing/deleted source record -> removed', () => {
  it('a user present in "before" but absent from "after" is reported as removed', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1' })
    const withoutUser2: BotcIdentitySourceSnapshot = { ...baseSnapshot, users: baseSnapshot.users.filter(u => u.legacyId !== '2') }
    const after = dryRunSnapshot({ source: withoutUser2, table: baseTable, migrationRunId: 'run-2' })
    const result = reconcileMigrationRuns(before, after)
    expect(result.reconciliationStatus).toBe('CHANGED')
    expect(result.removed.map(e => e.sourceLegacyId)).toEqual(['2'])
  })
})

describe('reconcileMigrationRuns — scenario 5: permission mapping change -> permissionMappedDiff', () => {
  it('a newly mapped/unmapped permission count shows up as a non-zero diff', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1' })
    const withExtraUnmapped: BotcIdentitySourceSnapshot = {
      ...baseSnapshot,
      permissions: [...baseSnapshot.permissions, { legacyId: '101', permissionName: 'CanCreateTicket' }],
      userPermissions: [...baseSnapshot.userPermissions, { legacyId: '1001', userLegacyId: '2', permissionLegacyId: '101' }],
    }
    const after = dryRunSnapshot({ source: withExtraUnmapped, table: baseTable, migrationRunId: 'run-2' })
    const result = reconcileMigrationRuns(before, after)
    expect(result.permissionUnmappedDiff).toBe(1)
    expect(result.reconciliationStatus).toBe('CHANGED')
  })
})

describe('reconcileMigrationRuns — scenario 6: tenant ASSIGNED -> UNRESOLVED', () => {
  it('a user who loses their tenant mapping is reported as unresolved', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1' })
    const after = dryRunSnapshot({ source: baseSnapshot, table: baseTable.filter(e => e.userLegacyId !== '1'), migrationRunId: 'run-2' })
    const result = reconcileMigrationRuns(before, after)
    expect(result.reconciliationStatus).toBe('UNRESOLVED')
    expect(result.unresolved.map(e => e.sourceLegacyId)).toContain('1')
  })
})

describe('reconcileMigrationRuns — scenario 7: tenant UNRESOLVED -> ASSIGNED', () => {
  it('a user who gains a tenant mapping moves from unresolved to assigned, no longer in the unresolved list', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable.filter(e => e.userLegacyId !== '1'), migrationRunId: 'run-1' })
    const after = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-2' })
    const result = reconcileMigrationRuns(before, after)
    expect(result.reconciliationStatus).toBe('CHANGED')
    expect(result.unresolved.map(e => e.sourceLegacyId)).not.toContain('1')
    expect(result.changed.map(e => e.sourceLegacyId)).toContain('1')
  })
})

describe('reconcileMigrationRuns — scenario 8: tenant conflict -> BLOCKED, no user diff at all', () => {
  it('a conflicting tenant mapping in "after" forces BLOCKED and produces no per-user diff', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1' })
    const conflictingTable: ApprovedTenantAssignmentEntry[] = [...baseTable, { userLegacyId: '1', tenantSlug: 'MOSEDAS' }]
    // Simulate a blocked run the way the CLI would (preflight fatal, engine never ran): empty
    // staging/target state, but the FATAL issue present.
    const blockedIssue: MigrationIssue = {
      category: 'FATAL',
      code: 'FATAL_CONFLICTING_TENANT_ASSIGNMENT',
      description: 'conflict',
      sourceEntityType: 'USER',
      sourceLegacyId: '1',
    }
    const after: ReconciliationInputSnapshot = { migrationRunId: 'run-2', users: [], roleTemplateCount: 0, permissionMappedCount: 0, permissionUnmappedCount: 0, issues: [blockedIssue] }
    void conflictingTable
    const result = reconcileMigrationRuns(before, after)
    expect(result.reconciliationStatus).toBe('BLOCKED')
    expect(result.conflicts).toHaveLength(1)
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([]) // NOT reported as "all users removed" — no diff attempted when blocked
    expect(result.changed).toEqual([])
  })
})

describe('reconcileMigrationRuns — scenario 9: ADMIN_ASSIGNED loss -> reported, RESET_REQUIRED preserved', () => {
  it('a user who had ADMIN_ASSIGNED in "before" but not in "after" is flagged as a password strategy loss', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1', adminAssignedPasswordLegacyIds: ['1'] })
    const after = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-2' }) // no admin assignment this time
    const result = reconcileMigrationRuns(before, after)
    const diff = result.passwordStrategyDiffs.find(d => d.sourceLegacyId === '1')
    expect(diff?.adminAssignedLost).toBe(true)
    expect(diff?.before).toEqual(['RESET_REQUIRED', 'ADMIN_ASSIGNED'])
    // RESET_REQUIRED itself is never lost -- present in both before and after.
    expect(diff?.after).toContain('RESET_REQUIRED')
  })
})

describe('reconcileMigrationRuns — scenario 10: fatal validation -> BLOCKED', () => {
  it('any FATAL issue in either snapshot forces BLOCKED, regardless of which side it came from', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1' })
    const fatalIssue: MigrationIssue = { category: 'FATAL', code: 'FATAL_EMPTY_LEGACY_ID', description: 'x', sourceEntityType: 'USER', sourceLegacyId: '9' }
    const after: ReconciliationInputSnapshot = { migrationRunId: 'run-2', users: [], roleTemplateCount: 0, permissionMappedCount: 0, permissionUnmappedCount: 0, issues: [fatalIssue] }
    const result = reconcileMigrationRuns(before, after)
    expect(result.reconciliationStatus).toBe('BLOCKED')
    expect(result.blockingIssues).toContainEqual(fatalIssue)
  })
})

describe('reconcileMigrationRuns — scenario 11: invalid report format -> INVALID_INPUT', () => {
  it('a malformed/incompatible snapshot never reaches diffing, and never throws', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1' })
    const malformed = { notASnapshot: true }
    const result = reconcileMigrationRuns(before, malformed)
    expect(result.reconciliationStatus).toBe('INVALID_INPUT')
    expect(result.added).toEqual([])
  })

  it('a session/token-shaped field anywhere in either snapshot forces BLOCKED, not silently ignored', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1' })
    const tainted = { ...dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-2' }), authSessions: [] }
    const result = reconcileMigrationRuns(before, tainted)
    expect(result.reconciliationStatus).toBe('BLOCKED')
    expect(result.blockingIssues[0]?.code).toBe('FATAL_RECONCILIATION_CREDENTIAL_OR_SESSION_FIELD')
  })

  it('a credential-shaped field anywhere in either snapshot forces BLOCKED', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1' })
    const tainted = { ...dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-2' }), passwordHash: 'x' }
    const result = reconcileMigrationRuns(before, tainted)
    expect(result.reconciliationStatus).toBe('BLOCKED')
  })
})

describe('reconcileMigrationRuns — determinism (kapsam madde 9)', () => {
  it('input order does not affect the outcome — records are sorted by sourceLegacyId', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1' })
    const reversedBefore: ReconciliationInputSnapshot = { ...before, users: [...before.users].reverse() }
    const after = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-2' })
    const a = reconcileMigrationRuns(before, after, { now: () => new Date('2026-09-18T00:00:00.000Z') })
    const b = reconcileMigrationRuns(reversedBefore, after, { now: () => new Date('2026-09-18T00:00:00.000Z') })
    expect(a).toEqual(b)
  })

  it('the same input produces the same output on repeated calls (excluding generatedAt)', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1' })
    const after = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-2' })
    const fixedNow = () => new Date('2026-09-18T00:00:00.000Z')
    expect(reconcileMigrationRuns(before, after, { now: fixedNow })).toEqual(reconcileMigrationRuns(before, after, { now: fixedNow }))
  })
})

describe('reconcileMigrationRuns — credential/session values never leaked in the report itself', () => {
  it('the BLOCKED violation description never includes a real value, only a field path', () => {
    const before = dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-1' })
    const tainted = { ...dryRunSnapshot({ source: baseSnapshot, table: baseTable, migrationRunId: 'run-2' }), passwordHash: 'super-secret-value-should-never-appear' }
    const result = reconcileMigrationRuns(before, tainted)
    const json = JSON.stringify(result)
    expect(json).not.toContain('super-secret-value-should-never-appear')
  })
})
