import { MigrationRunService } from './migration-run.service'
import { SimulatedTargetState } from './simulated-target'
import { InMemoryStagingStore } from './staging-store'
import type { ApprovedTenantAssignmentEntry, BotcIdentitySourceSnapshot } from './types'

function buildSnapshot(): BotcIdentitySourceSnapshot {
  return {
    users: [
      {
        legacyId: '1',
        username: 'op1',
        fullName: 'Operator One',
        isActive: true,
        email: 'op1@example.com',
        createdDate: '2020-01-01T00:00:00.000Z',
        roleLegacyId: '10',
        sirket: 'MOSB Enerji',
      },
      {
        legacyId: '2',
        username: 'op2',
        fullName: 'Operator Two',
        isActive: true,
        email: 'op2@example.com',
        createdDate: '2020-01-01T00:00:00.000Z',
        roleLegacyId: '10',
        sirket: null,
      },
      {
        legacyId: '3',
        username: 'unresolved-user',
        fullName: 'Unresolved User',
        isActive: true,
        email: 'unresolved@example.com',
        createdDate: '2020-01-01T00:00:00.000Z',
        roleLegacyId: null,
        sirket: 'KÖMÜR KAZANI',
      },
      {
        legacyId: '4',
        username: 'bad-email',
        fullName: 'Bad Email User',
        isActive: false,
        email: '   ',
        createdDate: '2020-01-01T00:00:00.000Z',
        roleLegacyId: null,
        sirket: null,
      },
    ],
    roles: [{ legacyId: '10', name: 'Operatör' }],
    permissions: [
      { legacyId: '100', permissionName: 'CanManageShifts' },
      { legacyId: '101', permissionName: 'CanCreateTicket' },
    ],
    userPermissions: [
      { legacyId: '1000', userLegacyId: '1', permissionLegacyId: '100' },
      { legacyId: '1001', userLegacyId: '2', permissionLegacyId: '100' },
    ],
  }
}

const approvedTenantTable: ApprovedTenantAssignmentEntry[] = [
  { userLegacyId: '1', tenantSlug: 'MOSB' },
  { userLegacyId: '2', tenantSlug: 'MOSB' },
  // legacyId '3' intentionally absent -> UNRESOLVED (KÖMÜR KAZANI is not an approved tenant, Q-T01)
]

describe('MigrationRunService', () => {
  it('produces a dry-run report without mutating staging store or target state', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()

    const { report } = service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'DRY_RUN',
      migrationRunId: 'run-1',
      now: () => new Date('2026-09-17T00:00:00.000Z'),
    })

    // op1, op2, unresolved-user succeed identity mapping (tenant membership is a separate layer,
    // §8.1); bad-email is the only one blocked at the identity layer.
    expect(report.usersToCreate).toBe(3)
    expect(report.usersToUpdate).toBe(0)
    expect(report.usersToSkip).toBe(0)
    expect(report.tenantMembershipResults.assigned).toBe(2)
    expect(report.tenantMembershipResults.unresolved).toBeGreaterThanOrEqual(1)
    expect(report.roleAndPermissionChanges.permissionCodesMapped).toBe(1)
    expect(report.roleAndPermissionChanges.permissionCodesUnmapped).toBe(1)
    expect(report.errorsAndWarnings.some(i => i.code === 'RECOVERABLE_INVALID_EMAIL')).toBe(true)

    // Dry-run must not write anything.
    expect(stagingStore.all()).toHaveLength(0)
    expect(targetState.usersByLegacyId.size).toBe(0)
  })

  it('is deterministic: two dry-runs over the same input produce the same report shape', () => {
    const service = new MigrationRunService()
    const run = () =>
      service.run({
        source: buildSnapshot(),
        approvedTenantAssignmentTable: approvedTenantTable,
        stagingStore: new InMemoryStagingStore(),
        targetState: new SimulatedTargetState(),
        mode: 'DRY_RUN',
        migrationRunId: 'run-x',
        now: () => new Date('2026-09-17T00:00:00.000Z'),
      }).report

    const first = run()
    const second = run()
    const strip = (r: typeof first) => ({ ...r, generatedAt: undefined })
    expect(strip(first)).toEqual(strip(second))
  })

  it('APPLY writes users/tenant-memberships/role-templates and never creates an authSessions-like record', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()

    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
      now: () => new Date('2026-09-17T00:00:00.000Z'),
    })

    expect(targetState.usersByLegacyId.size).toBe(3)
    expect([...targetState.usersByLegacyId.values()].every(u => u.passwordStrategies.includes('RESET_REQUIRED'))).toBe(true)
    expect(targetState.tenantMembershipsByUserId.size).toBe(2)
    // Two clusters: {op1, op2} share CanManageShifts, unresolved-user has no mapped permissions.
    expect(targetState.roleTemplatesById.size).toBe(2)
    const operatorTemplate = [...targetState.roleTemplatesById.values()].find(t => t.permissionCodes.length > 0)
    expect(operatorTemplate?.permissionCodes).toEqual(['SHIFT:REPORT:UPDATE'])
    expect(targetState.roleAssignments).toHaveLength(3)
    // No such concept exists on the simulated target at all — asserting the shape has no session-like keys.
    expect(Object.keys(targetState)).not.toContain('authSessions')
  })

  it('idempotent re-run: unchanged users are SKIPPED on the second APPLY, target ids are preserved, no duplicates', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const snapshot = buildSnapshot()

    const first = service.run({
      source: snapshot,
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
      now: () => new Date('2026-09-17T00:00:00.000Z'),
    })
    const firstTargetIds = [...targetState.usersByLegacyId.values()].map(u => u.id).sort()

    const second = service.run({
      source: snapshot,
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-2',
      now: () => new Date('2026-09-18T00:00:00.000Z'),
    })
    const secondTargetIds = [...targetState.usersByLegacyId.values()].map(u => u.id).sort()

    expect(first.report.usersToCreate).toBe(3)
    expect(second.report.usersToCreate).toBe(0)
    expect(second.report.usersToSkip).toBe(3)
    expect(secondTargetIds).toEqual(firstTargetIds) // legacy id -> target id mapping never changes
    expect(targetState.usersByLegacyId.size).toBe(3) // no duplicates created
    expect(stagingStore.all().filter(r => r.sourceEntityType === 'USER')).toHaveLength(4)
  })

  it('updates a changed record on re-run while preserving its target id (not a new INSERT)', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const snapshot = buildSnapshot()

    service.run({
      source: snapshot,
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const originalId = targetState.usersByLegacyId.get('1')?.id

    const changedSnapshot: BotcIdentitySourceSnapshot = {
      ...snapshot,
      users: snapshot.users.map(u => (u.legacyId === '1' ? { ...u, fullName: 'Operator One Renamed' } : u)),
    }

    const { report } = service.run({
      source: changedSnapshot,
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-2',
    })

    expect(report.usersToUpdate).toBe(1)
    expect(targetState.usersByLegacyId.get('1')?.id).toBe(originalId)
    expect(targetState.usersByLegacyId.get('1')?.displayName).toBe('Operator One Renamed')
  })

  it('retries a FAILED record on the next run and it succeeds once the failure condition is removed', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const snapshot = buildSnapshot()

    const first = service.run({
      source: snapshot,
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
      simulateFailureLegacyIds: new Set(['1']),
    })
    expect(first.report.errorsAndWarnings.some(i => i.code === 'RECOVERABLE_SIMULATED_WRITE_FAILURE')).toBe(true)
    expect(targetState.usersByLegacyId.has('1')).toBe(false)
    const failedRecord = stagingStore.findByLegacy('USER', '1')
    expect(failedRecord?.mappingStatus).toBe('FAILED')

    const second = service.run({
      source: snapshot,
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-2',
    })
    // user 1 retried + created this run; user 2/user 3 already COMPLETED with unchanged checksum -> SKIPPED
    expect(second.report.usersToCreate).toBe(1)
    expect(targetState.usersByLegacyId.has('1')).toBe(true)
    expect(stagingStore.findByLegacy('USER', '1')?.mappingStatus).toBe('COMPLETED')
  })

  it('duplicate users: keeps the deterministic winner and reports the loser, never creating two target rows', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const snapshot = buildSnapshot()
    const withDuplicate: BotcIdentitySourceSnapshot = {
      ...snapshot,
      users: [
        ...snapshot.users,
        {
          legacyId: '0',
          username: 'op1-dup',
          fullName: 'Operator One Duplicate',
          isActive: true,
          email: 'op1@example.com', // same email as legacyId '1'
          createdDate: '2020-01-01T00:00:00.000Z',
          roleLegacyId: null,
          sirket: null,
        },
      ],
    }

    const { report } = service.run({
      source: withDuplicate,
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })

    expect(report.errorsAndWarnings.some(i => i.code === 'RECOVERABLE_DUPLICATE_USER' && i.sourceLegacyId === '1')).toBe(true)
    expect([...targetState.usersByLegacyId.values()].filter(u => u.email === 'op1@example.com')).toHaveLength(1)
  })

  it('blocks identity mapping when neither email nor username looks like a valid email (BOTC Username format is unverified, §2.1)', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const snapshot = buildSnapshot()
    const withNullEmailNonEmailUsername: BotcIdentitySourceSnapshot = {
      ...snapshot,
      users: snapshot.users.map(u => (u.legacyId === '2' ? { ...u, email: null, username: 'plainusername' } : u)),
    }

    const { report } = service.run({
      source: withNullEmailNonEmailUsername,
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })

    expect(report.errorsAndWarnings.some(i => i.code === 'RECOVERABLE_INVALID_EMAIL' && i.sourceLegacyId === '2')).toBe(true)
    expect(targetState.usersByLegacyId.has('2')).toBe(false)
  })

  it('never assigns tenant membership for an unresolved location and reports it explicitly', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()

    const { report } = service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })

    const unresolvedUserId = targetState.usersByLegacyId.get('3')?.id
    expect(unresolvedUserId).toBeDefined()
    expect(targetState.tenantMembershipsByUserId.has(unresolvedUserId as string)).toBe(false)
    expect(report.unresolvedRecords.some(r => r.sourceLegacyId === '3')).toBe(true)
    expect(stagingStore.findByLegacy('USER', '3')?.tenantMembershipStatus).toBe('UNRESOLVED')
  })
})
