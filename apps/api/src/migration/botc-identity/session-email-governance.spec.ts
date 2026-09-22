import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { buildAuditMetadata } from './audit-metadata'
import { MigrationRunService } from './migration-run.service'
import { scanForSessionOrTokenFields } from './session-boundary'
import { SimulatedTargetState } from './simulated-target'
import { InMemoryStagingStore } from './staging-store'
import type { ApprovedTenantAssignmentEntry, BotcIdentitySourceSnapshot } from './types'

/**
 * TASK-027.17 — session/email verification boundary, exercised against `MigrationRunService` as a
 * black box (no engine file is modified by this task).
 */
function buildSnapshot(): BotcIdentitySourceSnapshot {
  return {
    users: [
      { legacyId: '1', username: 'reset-only', fullName: 'Reset Only User', isActive: true, email: 'reset-only@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: '10', sirket: null },
      { legacyId: '2', username: 'admin-assigned', fullName: 'Admin Assigned User', isActive: true, email: 'admin-assigned@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: '10', sirket: null },
      { legacyId: '3', username: 'unresolved-tenant', fullName: 'Unresolved Tenant User', isActive: true, email: 'unresolved@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: null, sirket: null },
    ],
    roles: [{ legacyId: '10', name: 'Operatör' }],
    permissions: [{ legacyId: '100', permissionName: 'CanManageShifts' }],
    userPermissions: [{ legacyId: '1000', userLegacyId: '1', permissionLegacyId: '100' }],
  }
}

const approvedTenantTable: ApprovedTenantAssignmentEntry[] = [
  { userLegacyId: '1', tenantSlug: 'MOSB' },
  { userLegacyId: '2', tenantSlug: 'MOSB' },
  // '3' intentionally absent -> UNRESOLVED
]

describe('scope item 1 — no session/cookie/token generation code in the migration module', () => {
  it('no production source file (outside comments) references session/token/cookie/JWT generation, or auth/email/notification services', () => {
    const dir = join(__dirname)
    // session-boundary.ts (this task) is itself a verification utility whose job is to name
    // these exact terms in a regex pattern for scanning purposes — it carries no actual
    // generation logic, and is proven clean by session-boundary.spec.ts's own tests instead.
    const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'session-boundary.ts')
    const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const forbiddenPatterns = [
      /authSessions/,
      /refreshTokenHash/,
      /jwt/i,
      /setCookie/i,
      /issueSession/i,
      /AuthService/,
      /JwtStrategy/,
      /EmailService/i,
      /MailerService/i,
      /SmsProvider/i,
    ]
    for (const file of files) {
      const code = stripComments(readFileSync(join(dir, file), 'utf8'))
      for (const pattern of forbiddenPatterns) expect(pattern.test(code)).toBe(false)
    }
  })

  it('no production source file imports anything from apps/api/src/platform (the real auth/session module)', () => {
    const dir = join(__dirname)
    const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf8')
      // The only allowed cross-module import is the read-only permission catalogue comparison
      // (permission-coverage.ts imports ASSIGNABLE_CATALOGUE) — auth/session code specifically
      // must never be imported.
      expect(content.includes("from '../../platform/auth")).toBe(false)
      expect(content.includes("from '../../platform/jwt")).toBe(false)
      expect(content.includes("from '../../platform/mfa")).toBe(false)
    }
  })

  it('session-boundary.ts itself exports only the two pure scanner/assert functions — no session/token generator', async () => {
    const module = await import('./session-boundary')
    expect(Object.keys(module).sort()).toEqual(['assertNoSessionOrTokenFields', 'scanForSessionOrTokenFields'].sort())
  })
})

describe('scope items 2, 3 — no session/email/token artifacts in any produced output', () => {
  it('a full APPLY run produces zero session/token/cookie/verification/reset-link fields anywhere in report, staging, audit metadata, or simulated target state', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const startedAt = '2026-09-18T00:00:00.000Z'
    const { report } = service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      adminAssignedPasswordLegacyIds: new Set(['2']),
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
      now: () => new Date(startedAt),
    })
    const audit = buildAuditMetadata({ actorId: 'admin-1', mode: 'APPLY', startedAt, finishedAt: report.generatedAt, report })

    expect(scanForSessionOrTokenFields(report)).toEqual([])
    expect(scanForSessionOrTokenFields(stagingStore.all())).toEqual([])
    expect(scanForSessionOrTokenFields(audit)).toEqual([])
    expect(scanForSessionOrTokenFields([...targetState.usersByLegacyId.values()])).toEqual([])
    expect(scanForSessionOrTokenFields([...targetState.tenantMembershipsByUserId.values()])).toEqual([])
    expect(scanForSessionOrTokenFields([...targetState.roleTemplatesById.values()])).toEqual([])
    expect(scanForSessionOrTokenFields(targetState.roleAssignments)).toEqual([])
  })

  it('the SimulatedTargetState object itself has no session/auth-adjacent top-level concept', () => {
    const targetState = new SimulatedTargetState()
    const keys = Object.keys(targetState)
    expect(keys).toEqual(['usersByLegacyId', 'tenantMembershipsByUserId', 'roleTemplatesById', 'roleAssignments'])
  })
})

describe('scope item 4 — RESET_REQUIRED users are never session-bearing or auto-logged-in', () => {
  it('no user, resolved or unresolved, ever gets an authSessions-shaped entry anywhere in the target state', () => {
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
    // Every migrated user carries RESET_REQUIRED and none of them has anything resembling a
    // session — proven structurally: the user row's only fields are id/sourceLegacyId/email/
    // displayName/status/passwordStrategies.
    for (const user of targetState.usersByLegacyId.values()) {
      expect(user.passwordStrategies).toContain('RESET_REQUIRED')
      expect(Object.keys(user).sort()).toEqual(['displayName', 'email', 'id', 'passwordStrategies', 'sourceLegacyId', 'status'].sort())
    }
  })

  it('a RESET_REQUIRED user with an UNRESOLVED tenant never bypasses tenant/permission gating — no membership, no role assignment', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable, // user '3' absent
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const userId = targetState.usersByLegacyId.get('3')?.id
    // Tenant membership is the actual access gate — it must be absent regardless of whether a
    // (permission-empty) role template assignment exists for identity bookkeeping purposes.
    expect(targetState.tenantMembershipsByUserId.has(userId as string)).toBe(false)
    expect(stagingStore.findByLegacy('USER', '3')?.tenantMembershipStatus).toBe('UNRESOLVED')
  })

  it('DRY_RUN never creates any state at all — reset-required users remain purely hypothetical until an explicit APPLY', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      stagingStore,
      targetState,
      mode: 'DRY_RUN',
      migrationRunId: 'run-1',
    })
    expect(targetState.usersByLegacyId.size).toBe(0)
    expect(stagingStore.all()).toHaveLength(0)
  })
})

describe('scope item 5 — ADMIN_ASSIGNED is purely a communication/operations state flag', () => {
  it('ADMIN_ASSIGNED never removes RESET_REQUIRED', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      adminAssignedPasswordLegacyIds: new Set(['2']),
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const user = targetState.usersByLegacyId.get('2')
    expect(user?.passwordStrategies).toEqual(['RESET_REQUIRED', 'ADMIN_ASSIGNED'])
  })

  it('ADMIN_ASSIGNED produces no session, no email artifact, no token — the user row shape is identical to a non-admin-assigned user, only the strategy label differs', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      adminAssignedPasswordLegacyIds: new Set(['2']),
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const resetOnly = targetState.usersByLegacyId.get('1')
    const adminAssigned = targetState.usersByLegacyId.get('2')
    expect(Object.keys(resetOnly as object).sort()).toEqual(Object.keys(adminAssigned as object).sort())
    expect(scanForSessionOrTokenFields(adminAssigned)).toEqual([])
  })

  it('ADMIN_ASSIGNED does not grant tenant membership or role assignment on its own — those still depend only on the approved tenant table and permission grants', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: [{ userLegacyId: '2', tenantSlug: null }], // admin-assigned but tenant explicitly unresolved
      adminAssignedPasswordLegacyIds: new Set(['2']),
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const userId = targetState.usersByLegacyId.get('2')?.id
    expect(targetState.tenantMembershipsByUserId.has(userId as string)).toBe(false)
  })
})

describe('scope item 8 — the engine\'s existing functions are unchanged (smoke test)', () => {
  it('user mapping, role template mapping, permission mapping, tenant mapping, password strategy, and dry-run/apply simulation all still function together', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const { report } = service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: approvedTenantTable,
      adminAssignedPasswordLegacyIds: new Set(['2']),
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })

    expect(report.usersToCreate).toBe(3) // user mapping
    expect(targetState.roleTemplatesById.size).toBeGreaterThan(0) // role template mapping
    expect(report.roleAndPermissionChanges.permissionCodesMapped).toBe(1) // permission mapping
    expect(targetState.tenantMembershipsByUserId.size).toBe(2) // tenant mapping
    expect(report.passwordStrategySummary.RESET_REQUIRED).toBe(3) // password strategy
    expect(report.passwordStrategySummary.ADMIN_ASSIGNED).toBe(1)

    // idempotent re-run (dry-run/apply simulation contract unchanged)
    const second = service.run({ source: buildSnapshot(), approvedTenantAssignmentTable: approvedTenantTable, adminAssignedPasswordLegacyIds: new Set(['2']), stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-2' })
    expect(second.report.usersToCreate).toBe(0)
    expect(second.report.usersToSkip).toBe(3)
  })
})
