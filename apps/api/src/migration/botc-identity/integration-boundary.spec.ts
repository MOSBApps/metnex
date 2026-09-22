import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { APPROVED_PERMISSION_CODE_MAP } from './permission-mapping'
import { InMemoryBotcIdentitySourceAdapter } from './source-adapter'
import { validateSourceSnapshot } from './source-validation'
import { InMemoryApprovedTenantMappingAdapter } from './tenant-mapping-adapter'
import { MigrationRunService } from './migration-run.service'
import { SimulatedTargetState } from './simulated-target'
import { InMemoryStagingStore } from './staging-store'
import { buildAuditMetadata, generateMigrationRunId } from './audit-metadata'
import type { ApprovedTenantAssignmentEntry, BotcIdentitySourceSnapshot } from './types'

/**
 * TASK-027.13 — integration boundary tests. These treat MigrationRunService (TASK-027.12) as a
 * black box and assert the frozen input/output contract, the port boundaries
 * (BotcIdentitySourceAdapter / ApprovedTenantMappingAdapter), the DRY_RUN/APPLY separation, and the
 * 9 required output artifacts — without touching the engine's internal role/permission/tenant
 * mapping logic.
 */
function buildSnapshot(): BotcIdentitySourceSnapshot {
  return {
    users: [
      { legacyId: '1', username: 'op1', fullName: 'Operator One', isActive: true, email: 'op1@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: '10', sirket: 'MOSB Enerji' },
      { legacyId: '2', username: 'unresolved', fullName: 'Unresolved User', isActive: true, email: 'unresolved@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: null, sirket: 'KÖMÜR KAZANI' },
    ],
    roles: [{ legacyId: '10', name: 'Operatör' }],
    permissions: [
      { legacyId: '100', permissionName: 'CanManageShifts' },
      { legacyId: '101', permissionName: 'CanCreateTicket' },
    ],
    userPermissions: [{ legacyId: '1000', userLegacyId: '1', permissionLegacyId: '100' }],
  }
}

const approvedTenantTable: ApprovedTenantAssignmentEntry[] = [{ userLegacyId: '1', tenantSlug: 'MOSB' }]

describe('integration boundary — source/tenant adapter ports', () => {
  it('the engine can be fed entirely through the adapter ports, without touching source arrays directly', async () => {
    const sourceAdapter = new InMemoryBotcIdentitySourceAdapter(buildSnapshot())
    const tenantAdapter = new InMemoryApprovedTenantMappingAdapter(approvedTenantTable)

    const source = await sourceAdapter.readSnapshot()
    const tenantTable = await tenantAdapter.readMappingTable()

    const preflight = validateSourceSnapshot(source, tenantTable)
    expect(preflight.isFatal).toBe(false)

    const service = new MigrationRunService()
    const { report } = service.run({
      source,
      approvedTenantAssignmentTable: tenantTable,
      stagingStore: new InMemoryStagingStore(),
      targetState: new SimulatedTargetState(),
      mode: 'DRY_RUN',
      migrationRunId: 'run-integration-1',
    })
    expect(report.usersToCreate).toBe(2)
  })

  it('a fatal preflight result means the caller must not invoke the engine at all', () => {
    const invalidSnapshot = buildSnapshot()
    invalidSnapshot.users.push({ ...invalidSnapshot.users[0]!, legacyId: '1' }) // duplicate legacyId
    const preflight = validateSourceSnapshot(invalidSnapshot, approvedTenantTable)
    expect(preflight.isFatal).toBe(true)

    // The integration contract: DO NOT call MigrationRunService.run() when isFatal is true.
    // This test documents that boundary rather than exercising a "halt" flag inside the engine
    // itself (TASK-027.12's engine is not rewritten).
    const ranService = preflight.isFatal ? null : new MigrationRunService()
    expect(ranService).toBeNull()
  })
})

describe('integration boundary — frozen input/output contract', () => {
  it('MigrationRunInput/MigrationRunResult expose exactly the documented fields', () => {
    const service = new MigrationRunService()
    const { report } = service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore: new InMemoryStagingStore(),
      targetState: new SimulatedTargetState(),
      mode: 'DRY_RUN',
      migrationRunId: 'run-contract-1',
    })

    expect(Object.keys(report).sort()).toEqual(
      [
        'migrationRunId',
        'generatedAt',
        'totalSourceRecords',
        'usersToCreate',
        'usersToUpdate',
        'usersToSkip',
        'conflicts',
        'roleAndPermissionChanges',
        'tenantMembershipResults',
        'unresolvedRecords',
        'errorsAndWarnings',
        'passwordStrategySummary',
      ].sort(),
    )
    expect(Object.keys(report.roleAndPermissionChanges).sort()).toEqual(
      ['tenantRoleTemplatesToCreate', 'permissionCodesMapped', 'permissionCodesUnmapped'].sort(),
    )
    expect(Object.keys(report.tenantMembershipResults).sort()).toEqual(['assigned', 'unresolved'].sort())
  })

  it('output is deterministic across repeated runs over the same input (excluding timestamps)', () => {
    const service = new MigrationRunService()
    const runOnce = () =>
      service.run({
        source: buildSnapshot(),
        approvedTenantAssignmentTable: approvedTenantTable,
        stagingStore: new InMemoryStagingStore(),
        targetState: new SimulatedTargetState(),
        mode: 'DRY_RUN',
        migrationRunId: 'run-det',
        now: () => new Date('2026-09-17T00:00:00.000Z'),
      }).report

    const a = runOnce()
    const b = runOnce()
    expect(a).toEqual(b)
  })
})

describe('integration boundary — DRY_RUN vs APPLY separation', () => {
  it('DRY_RUN never mutates the staging store or the simulated target state', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'DRY_RUN',
      migrationRunId: 'run-dry',
    })
    expect(stagingStore.all()).toHaveLength(0)
    expect(targetState.usersByLegacyId.size).toBe(0)
    expect(targetState.tenantMembershipsByUserId.size).toBe(0)
    expect(targetState.roleTemplatesById.size).toBe(0)
    expect(targetState.roleAssignments).toHaveLength(0)
  })

  it('APPLY only ever mutates the in-memory SimulatedTargetState/InMemoryStagingStore passed in — nothing else', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-apply',
    })
    expect(stagingStore.all().length).toBeGreaterThan(0)
    expect(targetState.usersByLegacyId.size).toBeGreaterThan(0)
  })
})

describe('integration boundary — the 9 required output artifacts (TASK-027.13 scope item 6)', () => {
  it('exposes users, tenant membership, tenant role templates, role assignments, staging records, unresolved records, migration issues, audit metadata, and password strategy summary', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const startedAt = '2026-09-17T00:00:00.000Z'
    const { report } = service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: generateMigrationRunId(),
      now: () => new Date(startedAt),
    })

    // 1. users
    expect(targetState.usersByLegacyId.size).toBeGreaterThan(0)
    // 2. tenant membership
    expect(targetState.tenantMembershipsByUserId.size).toBeGreaterThan(0)
    // 3. tenant role templates
    expect(targetState.roleTemplatesById.size).toBeGreaterThan(0)
    // 4. role assignments
    expect(targetState.roleAssignments.length).toBeGreaterThan(0)
    // 5. staging records
    expect(stagingStore.all().length).toBeGreaterThan(0)
    // 6. unresolved records
    expect(report.unresolvedRecords.some(r => r.sourceLegacyId === '2')).toBe(true)
    // 7. migration issues
    expect(report.errorsAndWarnings.length).toBeGreaterThan(0)
    // 8. audit metadata
    const audit = buildAuditMetadata({ actorId: 'ai1', mode: 'APPLY', startedAt, finishedAt: report.generatedAt, report })
    expect(audit.entityId).toBe(report.migrationRunId)
    expect(audit.metadata.report).toBe(report)
    // 9. password strategy summary
    expect(report.passwordStrategySummary.RESET_REQUIRED).toBeGreaterThan(0)
  })
})

describe('integration boundary — idempotency and retry (contract-level)', () => {
  it('a second run over the same snapshot does not duplicate staging records or target rows', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const snapshot = buildSnapshot()

    service.run({ source: snapshot, approvedTenantAssignmentTable: approvedTenantTable, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    const staginCountAfterFirst = stagingStore.all().length
    const userCountAfterFirst = targetState.usersByLegacyId.size

    const { report } = service.run({ source: snapshot, approvedTenantAssignmentTable: approvedTenantTable, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-2' })

    expect(stagingStore.all().length).toBe(staginCountAfterFirst)
    expect(targetState.usersByLegacyId.size).toBe(userCountAfterFirst)
    expect(report.usersToCreate).toBe(0)
    expect(report.usersToSkip).toBe(2)
  })

  it('a checksum change on an already-completed record updates it (SKIPPED preserves targetId, changed record does not create a new one)', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const snapshot = buildSnapshot()

    service.run({ source: snapshot, approvedTenantAssignmentTable: approvedTenantTable, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    const originalId = targetState.usersByLegacyId.get('1')?.id
    const skippedRecordBefore = stagingStore.findByLegacy('USER', '2')

    const changed: BotcIdentitySourceSnapshot = { ...snapshot, users: snapshot.users.map(u => (u.legacyId === '1' ? { ...u, fullName: 'Renamed' } : u)) }
    const { report } = service.run({ source: changed, approvedTenantAssignmentTable: approvedTenantTable, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-2' })

    expect(report.usersToUpdate).toBe(1)
    expect(targetState.usersByLegacyId.get('1')?.id).toBe(originalId) // targetId preserved across update
    const skippedRecordAfter = stagingStore.findByLegacy('USER', '2')
    expect(skippedRecordAfter?.targetId).toBe(skippedRecordBefore?.targetId) // SKIPPED preserves targetId
    expect(skippedRecordAfter?.mappingStatus).toBe('SKIPPED')
  })

  it('a FAILED record is retried on the next run', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const snapshot = buildSnapshot()

    service.run({ source: snapshot, approvedTenantAssignmentTable: approvedTenantTable, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1', simulateFailureLegacyIds: new Set(['1']) })
    expect(stagingStore.findByLegacy('USER', '1')?.mappingStatus).toBe('FAILED')
    expect(targetState.usersByLegacyId.has('1')).toBe(false)

    service.run({ source: snapshot, approvedTenantAssignmentTable: approvedTenantTable, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-2' })
    expect(stagingStore.findByLegacy('USER', '1')?.mappingStatus).toBe('COMPLETED')
    expect(targetState.usersByLegacyId.has('1')).toBe(true)
  })
})

describe('integration boundary — permission mapping is preserved (no invented codes)', () => {
  it('every permission code that ever reaches a role template is one of the 5 approved codes', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    service.run({ source: buildSnapshot(), approvedTenantAssignmentTable: approvedTenantTable, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })

    const approvedCodes = new Set(Object.values(APPROVED_PERMISSION_CODE_MAP))
    for (const template of targetState.roleTemplatesById.values()) {
      for (const code of template.permissionCodes) expect(approvedCodes.has(code)).toBe(true)
    }
  })

  it('an unmapped BOTC permission (CanCreateTicket) is reported, never silently assigned a made-up code', () => {
    const service = new MigrationRunService()
    const { report } = service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore: new InMemoryStagingStore(),
      targetState: new SimulatedTargetState(),
      mode: 'DRY_RUN',
      migrationRunId: 'run-1',
    })
    expect(report.roleAndPermissionChanges.permissionCodesUnmapped).toBe(1)
  })
})

describe('integration boundary — tenant mapping is preserved (Sirket never read, unresolved never gets access)', () => {
  it('a user with a Sirket value but no approved mapping table entry stays UNRESOLVED and gets no tenant membership', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    service.run({ source: buildSnapshot(), approvedTenantAssignmentTable: approvedTenantTable, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })

    const unresolvedUserId = targetState.usersByLegacyId.get('2')?.id // sirket: 'KÖMÜR KAZANI', absent from approved table
    expect(unresolvedUserId).toBeDefined()
    expect(targetState.tenantMembershipsByUserId.has(unresolvedUserId as string)).toBe(false)
    expect(stagingStore.findByLegacy('USER', '2')?.tenantMembershipStatus).toBe('UNRESOLVED')
  })
})

describe('integration boundary — password behavior is preserved', () => {
  it('every created user carries RESET_REQUIRED, and the simulated user row has no password/hash/salt field', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({ source: buildSnapshot(), approvedTenantAssignmentTable: approvedTenantTable, stagingStore: new InMemoryStagingStore(), targetState, mode: 'APPLY', migrationRunId: 'run-1' })

    for (const user of targetState.usersByLegacyId.values()) {
      expect(user.passwordStrategies).toContain('RESET_REQUIRED')
      const keys = Object.keys(user).filter(k => k !== 'passwordStrategies')
      expect(keys.some(k => /password|hash|salt|secret|token/i.test(k))).toBe(false)
    }
  })
})

describe('integration boundary — no real connections (explicit confirmation)', () => {
  it('no source file in this module imports a real DB/SQL Server driver or the app Db client', () => {
    const dir = join(__dirname)
    const forbiddenPatterns = [/from ['"]pg['"]/, /from ['"]mssql['"]/, /from ['"]tedious['"]/, /\.\.\/\.\.\/db\/db\.module/, /\.\.\/\.\.\/db\/db\.service/]
    const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf8')
      for (const pattern of forbiddenPatterns) {
        expect(pattern.test(content)).toBe(false)
      }
    }
  })

  it('no source file has actual code (outside comments) referencing authSessions', () => {
    const dir = join(__dirname)
    const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    // Strip block and line comments — some files deliberately document "never writes to
    // authSessions" in a comment, which is not a real reference.
    const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const file of files) {
      const code = stripComments(readFileSync(join(dir, file), 'utf8'))
      expect(code.includes('authSessions')).toBe(false)
    }
  })
})
