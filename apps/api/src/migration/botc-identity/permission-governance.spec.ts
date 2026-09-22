import { MigrationRunService } from './migration-run.service'
import { SimulatedTargetState } from './simulated-target'
import { InMemoryStagingStore } from './staging-store'
import type { ApprovedTenantAssignmentEntry, BotcIdentitySourceSnapshot } from './types'

/**
 * TASK-027.14 scope items 4 and 5 — permission staging status invariants and UserPermission
 * access-safety, exercised against `MigrationRunService` as a black box (no engine changes).
 */
function buildSnapshot(): BotcIdentitySourceSnapshot {
  return {
    users: [
      { legacyId: '1', username: 'op1', fullName: 'Operator One', isActive: true, email: 'op1@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: '10', sirket: null },
    ],
    roles: [{ legacyId: '10', name: 'Operatör' }],
    permissions: [
      { legacyId: '100', permissionName: 'CanManageShifts' }, // approved
      { legacyId: '101', permissionName: 'CanCreateTicket' }, // unmapped (Wave 2)
    ],
    userPermissions: [
      { legacyId: '1000', userLegacyId: '1', permissionLegacyId: '100' }, // mapped grant
      { legacyId: '1001', userLegacyId: '1', permissionLegacyId: '101' }, // unmapped grant
    ],
  }
}

const approvedTenantTable: ApprovedTenantAssignmentEntry[] = [{ userLegacyId: '1', tenantSlug: 'MOSB' }]

describe('permission staging status invariants (scope item 4)', () => {
  it('a mapped permission gets a COMPLETED staging record with the approved code as targetId', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState: new SimulatedTargetState(),
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })

    const record = stagingStore.findByLegacy('PERMISSION', '100')
    expect(record?.mappingStatus).toBe('COMPLETED')
    expect(record?.targetId).toBe('SHIFT:REPORT:UPDATE')
    expect(record?.errorCode).toBeNull()
  })

  it('an unmapped permission gets a BLOCKED staging record with a null targetId — never a partial/made-up code', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState: new SimulatedTargetState(),
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })

    const record = stagingStore.findByLegacy('PERMISSION', '101')
    expect(record?.mappingStatus).toBe('BLOCKED')
    expect(record?.targetId).toBeNull()
    expect(record?.errorCode).toBe('RECOVERABLE_UNMAPPED_PERMISSION')
  })

  it('permission staging status is deterministic across repeated runs over unchanged input', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const snapshot = buildSnapshot()

    service.run({ source: snapshot, approvedTenantAssignmentTable: approvedTenantTable, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    const first = { ...stagingStore.findByLegacy('PERMISSION', '100') }
    const firstUnmapped = { ...stagingStore.findByLegacy('PERMISSION', '101') }

    service.run({ source: snapshot, approvedTenantAssignmentTable: approvedTenantTable, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-2' })
    const second = stagingStore.findByLegacy('PERMISSION', '100')
    const secondUnmapped = stagingStore.findByLegacy('PERMISSION', '101')

    expect(second?.mappingStatus).toBe(first.mappingStatus)
    expect(second?.targetId).toBe(first.targetId)
    expect(secondUnmapped?.mappingStatus).toBe(firstUnmapped.mappingStatus)
    expect(secondUnmapped?.targetId).toBe(firstUnmapped.targetId)
  })
})

describe('UserPermission access-safety invariants (scope item 5)', () => {
  it('a mapped grant is consumed into a role template that carries only the approved code', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })

    const templates = [...targetState.roleTemplatesById.values()]
    expect(templates).toHaveLength(1)
    expect(templates[0]?.permissionCodes).toEqual(['SHIFT:REPORT:UPDATE'])
    expect(templates[0]?.permissionCodes).not.toContain('CanCreateTicket')
  })

  it('an unmapped grant is never included in any role template permission list', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })

    for (const template of targetState.roleTemplatesById.values()) {
      expect(template.permissionCodes).not.toContain('CanCreateTicket')
      expect(template.permissionCodes.every(code => code.includes(':'))).toBe(true) // only real MODULE:RESOURCE:ACTION codes, never a raw BOTC name
    }
  })

  it('the UserPermission staging record for the unmapped grant is BLOCKED and reported as an issue — not silently dropped', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const { report } = service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState: new SimulatedTargetState(),
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })

    const record = stagingStore.findByLegacy('USER_PERMISSION', '1001')
    expect(record?.mappingStatus).toBe('BLOCKED')
    expect(record?.targetId).toBeNull()
    expect(report.errorsAndWarnings.some(i => i.sourceEntityType === 'USER_PERMISSION' && i.sourceLegacyId === '1001' && i.category === 'RECOVERABLE')).toBe(true)
  })

  it('the mapped grant is COMPLETED and its targetId points at the role template that received the code', () => {
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
    })

    const record = stagingStore.findByLegacy('USER_PERMISSION', '1000')
    expect(record?.mappingStatus).toBe('COMPLETED')
    expect(record?.targetId).not.toBeNull()
    expect(targetState.roleTemplatesById.has(record?.targetId as string)).toBe(true)
  })

  it('a user whose only grant is unmapped never receives an access-bearing role assignment for it', () => {
    const onlyUnmappedGrant: BotcIdentitySourceSnapshot = {
      users: [{ legacyId: '2', username: 'u2', fullName: 'User Two', isActive: true, email: 'u2@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: null, sirket: null }],
      roles: [],
      permissions: [{ legacyId: '101', permissionName: 'CanCreateTicket' }],
      userPermissions: [{ legacyId: '2000', userLegacyId: '2', permissionLegacyId: '101' }],
    }
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: onlyUnmappedGrant,
      approvedTenantAssignmentTable: [{ userLegacyId: '2', tenantSlug: 'MOSB' }],
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })

    // The user still gets an identity row and an empty-permission template (§8.1 layer 1) — but
    // that template carries zero permission codes, i.e. no access was fabricated from the grant.
    const userId = targetState.usersByLegacyId.get('2')?.id
    const assignment = targetState.roleAssignments.find(a => a.userId === userId)
    expect(assignment).toBeDefined()
    const template = targetState.roleTemplatesById.get(assignment!.roleTemplateId)
    expect(template?.permissionCodes).toEqual([])
  })
})
