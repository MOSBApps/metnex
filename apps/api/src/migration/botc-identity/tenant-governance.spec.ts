import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { MigrationRunService } from './migration-run.service'
import { SimulatedTargetState } from './simulated-target'
import { InMemoryStagingStore } from './staging-store'
import type { ApprovedTenantAssignmentEntry, BotcIdentitySourceSnapshot } from './types'

/**
 * TASK-027.15 scope items 5, 6, 7 — tenant mapping behavior, idempotency, and root-tenant/aggregate
 * non-expansion, exercised against `MigrationRunService` as a black box (tenant-mapping.ts and
 * migration-run.service.ts are not modified by this task).
 */
function buildSnapshot(): BotcIdentitySourceSnapshot {
  return {
    users: [
      { legacyId: '1', username: 'assigned', fullName: 'Assigned User', isActive: true, email: 'assigned@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: null, sirket: 'MOSB Enerji' },
      { legacyId: '2', username: 'unresolved', fullName: 'Unresolved User', isActive: true, email: 'unresolved@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: null, sirket: 'KÖMÜR KAZANI' },
    ],
    roles: [],
    permissions: [],
    userPermissions: [],
  }
}

describe('tenant mapping behavior (scope item 5)', () => {
  it('a user present in the approved mapping table with a valid tenant becomes ASSIGNED', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: [{ userLegacyId: '1', tenantSlug: 'MOSB' }],
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const userId = targetState.usersByLegacyId.get('1')?.id
    expect(targetState.tenantMembershipsByUserId.get(userId as string)).toEqual({ userId, tenantSlug: 'MOSB' })
  })

  it('a user absent from the mapping table stays UNRESOLVED and gets no tenantMemberships row', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: [{ userLegacyId: '1', tenantSlug: 'MOSB' }], // user '2' absent
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const userId = targetState.usersByLegacyId.get('2')?.id
    expect(targetState.tenantMembershipsByUserId.has(userId as string)).toBe(false)
    expect(stagingStore.findByLegacy('USER', '2')?.tenantMembershipStatus).toBe('UNRESOLVED')
  })

  it('a conflicting mapping entry (same user, two different slugs) grants NO membership at all (TASK-027.15-R1 security fix)', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const { report } = service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: [
        { userLegacyId: '1', tenantSlug: 'MOSB' },
        { userLegacyId: '1', tenantSlug: 'MOSBIO' },
      ],
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const userId = targetState.usersByLegacyId.get('1')?.id
    const memberships = [...targetState.tenantMembershipsByUserId.values()].filter(m => m.userId === userId)
    // Security fix: conflict must NEVER produce a membership — not the first entry, not the
    // second, not a fabricated third value. The deterministic "first entry" selection previously
    // used here was diagnostic-only and must never grant runtime access.
    expect(memberships).toHaveLength(0)
    expect(stagingStore.findByLegacy('USER', '1')?.tenantMembershipStatus).toBe('UNRESOLVED')
    expect(report.errorsAndWarnings.some(i => i.sourceLegacyId === '1' && i.code === 'FATAL_CONFLICTING_TENANT_ASSIGNMENT')).toBe(true)
    expect(report.unresolvedRecords.some(r => r.sourceLegacyId === '1')).toBe(true)
  })

  it('Sirket is never consulted by the engine, even when it superficially matches a known tenant name', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    // user '1' has sirket: 'MOSB Enerji' but the approved table assigns it to MOSBIO instead —
    // if Sirket were being read, this would be MOSB; it must be MOSBIO.
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: [{ userLegacyId: '1', tenantSlug: 'MOSBIO' }],
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const userId = targetState.usersByLegacyId.get('1')?.id
    expect(targetState.tenantMembershipsByUserId.get(userId as string)?.tenantSlug).toBe('MOSBIO')
  })
})

describe('tenant mapping idempotency (scope item 6)', () => {
  it('a second run over the same mapping table does not duplicate tenant memberships', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const table: ApprovedTenantAssignmentEntry[] = [{ userLegacyId: '1', tenantSlug: 'MOSB' }]
    const snapshot = buildSnapshot()

    service.run({ source: snapshot, approvedTenantAssignmentTable: table, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    const countAfterFirst = targetState.tenantMembershipsByUserId.size

    service.run({ source: snapshot, approvedTenantAssignmentTable: table, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-2' })
    expect(targetState.tenantMembershipsByUserId.size).toBe(countAfterFirst)
  })

  it('an unresolved conflict never grants access across repeated runs', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const conflicting: ApprovedTenantAssignmentEntry[] = [
      { userLegacyId: '1', tenantSlug: 'MOSB' },
      { userLegacyId: '1', tenantSlug: 'MOSBIO' },
    ]
    const snapshot = buildSnapshot()

    service.run({ source: snapshot, approvedTenantAssignmentTable: conflicting, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    service.run({ source: snapshot, approvedTenantAssignmentTable: conflicting, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-2' })

    const userId = targetState.usersByLegacyId.get('1')?.id
    const memberships = [...targetState.tenantMembershipsByUserId.values()].filter(m => m.userId === userId)
    expect(memberships).toHaveLength(0) // never resolves to any value across repeated runs while the conflict is unresolved
    expect(stagingStore.findByLegacy('USER', '1')?.tenantMembershipStatus).toBe('UNRESOLVED')
  })

  it('a mapping that starts UNRESOLVED becomes ASSIGNED once the external table is updated, without any special handling', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const snapshot = buildSnapshot()

    // Run 1: user '2' has no mapping table entry at all -> UNRESOLVED.
    service.run({ source: snapshot, approvedTenantAssignmentTable: [], stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    const userId = targetState.usersByLegacyId.get('2')?.id
    expect(targetState.tenantMembershipsByUserId.has(userId as string)).toBe(false)
    expect(stagingStore.findByLegacy('USER', '2')?.tenantMembershipStatus).toBe('UNRESOLVED')

    // Run 2: PO/admin updates the external approved table (simulated by passing a new table) —
    // the engine picks it up on the very next run without any UNRESOLVED-specific retry logic.
    service.run({
      source: snapshot,
      approvedTenantAssignmentTable: [{ userLegacyId: '2', tenantSlug: 'MOSBIO' }],
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-2',
    })
    expect(targetState.tenantMembershipsByUserId.get(userId as string)).toEqual({ userId, tenantSlug: 'MOSBIO' })
    expect(stagingStore.findByLegacy('USER', '2')?.tenantMembershipStatus).toBe('ASSIGNED')
  })

  it('a changed source user (checksum change) re-evaluates tenant status deterministically without creating a second membership row', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const table: ApprovedTenantAssignmentEntry[] = [{ userLegacyId: '1', tenantSlug: 'MOSB' }]
    const snapshot = buildSnapshot()

    service.run({ source: snapshot, approvedTenantAssignmentTable: table, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    const userId = targetState.usersByLegacyId.get('1')?.id

    const changed: BotcIdentitySourceSnapshot = { ...snapshot, users: snapshot.users.map(u => (u.legacyId === '1' ? { ...u, fullName: 'Renamed' } : u)) }
    service.run({ source: changed, approvedTenantAssignmentTable: table, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-2' })

    const memberships = [...targetState.tenantMembershipsByUserId.values()].filter(m => m.userId === userId)
    expect(memberships).toHaveLength(1)
    expect(memberships[0]?.tenantSlug).toBe('MOSB')
  })
})

describe('tenant conflict access gate (TASK-027.15-R1)', () => {
  it('two runs of the same unresolved conflict never produce access — membership stays absent both times', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const conflicting: ApprovedTenantAssignmentEntry[] = [
      { userLegacyId: '1', tenantSlug: 'MOSB' },
      { userLegacyId: '1', tenantSlug: 'MOSEDAS' },
    ]
    const snapshot = buildSnapshot()

    service.run({ source: snapshot, approvedTenantAssignmentTable: conflicting, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    expect(targetState.tenantMembershipsByUserId.size).toBe(0)
    service.run({ source: snapshot, approvedTenantAssignmentTable: conflicting, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-2' })
    expect(targetState.tenantMembershipsByUserId.size).toBe(0)
  })

  it('once the conflict is corrected in a new approved table (single unambiguous slug), re-running produces exactly one valid membership', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const snapshot = buildSnapshot()

    service.run({
      source: snapshot,
      approvedTenantAssignmentTable: [
        { userLegacyId: '1', tenantSlug: 'MOSB' },
        { userLegacyId: '1', tenantSlug: 'MOSEDAS' },
      ],
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    expect(targetState.tenantMembershipsByUserId.size).toBe(0)

    // PO/admin corrects the approved table externally — only one slug remains for user '1'.
    const { report } = service.run({
      source: snapshot,
      approvedTenantAssignmentTable: [{ userLegacyId: '1', tenantSlug: 'MOSB' }],
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-2',
    })
    const userId = targetState.usersByLegacyId.get('1')?.id
    const memberships = [...targetState.tenantMembershipsByUserId.values()].filter(m => m.userId === userId)
    expect(memberships).toEqual([{ userId, tenantSlug: 'MOSB' }])
    expect(report.tenantMembershipResults.assigned).toBe(1)
  })

  it('a conflict for one user does not block or affect tenant assignment for other users', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(), // users '1' and '2'
      approvedTenantAssignmentTable: [
        { userLegacyId: '1', tenantSlug: 'MOSB' },
        { userLegacyId: '1', tenantSlug: 'MOSEDAS' }, // conflict, only affects user '1'
        { userLegacyId: '2', tenantSlug: 'MOSBIO' },
      ],
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const user1Id = targetState.usersByLegacyId.get('1')?.id
    const user2Id = targetState.usersByLegacyId.get('2')?.id
    expect(targetState.tenantMembershipsByUserId.has(user1Id as string)).toBe(false)
    expect(targetState.tenantMembershipsByUserId.get(user2Id as string)).toEqual({ userId: user2Id, tenantSlug: 'MOSBIO' })
  })

  it('the conflict report is deterministic across repeated runs over the same input', () => {
    const service = new MigrationRunService()
    const conflicting: ApprovedTenantAssignmentEntry[] = [
      { userLegacyId: '1', tenantSlug: 'MOSB' },
      { userLegacyId: '1', tenantSlug: 'MOSEDAS' },
    ]
    const run = () =>
      service.run({
        source: buildSnapshot(),
        approvedTenantAssignmentTable: conflicting,
        stagingStore: new InMemoryStagingStore(),
        targetState: new SimulatedTargetState(),
        mode: 'DRY_RUN',
        migrationRunId: 'run-det',
        now: () => new Date('2026-09-18T00:00:00.000Z'),
      }).report
    expect(run()).toEqual(run())
  })

  it('DRY_RUN with a conflict present computes the same non-access outcome but writes nothing', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const { report } = service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: [
        { userLegacyId: '1', tenantSlug: 'MOSB' },
        { userLegacyId: '1', tenantSlug: 'MOSEDAS' },
      ],
      stagingStore,
      targetState,
      mode: 'DRY_RUN',
      migrationRunId: 'run-1',
    })
    expect(stagingStore.all()).toHaveLength(0)
    expect(targetState.tenantMembershipsByUserId.size).toBe(0)
    expect(report.errorsAndWarnings.some(i => i.code === 'FATAL_CONFLICTING_TENANT_ASSIGNMENT')).toBe(true)
  })
})

describe('root tenant / aggregate non-expansion (scope item 7)', () => {
  it('no file in the migration module references TenantScopeService, canAggregateChildren, or tenant-scope at all', () => {
    const dir = join(__dirname)
    const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    const forbiddenPatterns = [/TenantScopeService/, /canAggregateChildren/, /tenant-scope/]
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf8')
      for (const pattern of forbiddenPatterns) expect(pattern.test(content)).toBe(false)
    }
  })

  it('a tenant membership row never carries any aggregate/root-scope flag — only { userId, tenantSlug }', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: [{ userLegacyId: '1', tenantSlug: 'MOSB' }],
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const [membership] = [...targetState.tenantMembershipsByUserId.values()]
    expect(Object.keys(membership as object).sort()).toEqual(['tenantSlug', 'userId'].sort())
  })
})
