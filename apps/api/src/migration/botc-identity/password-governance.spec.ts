import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { buildAuditMetadata } from './audit-metadata'
import { assertNoCredentialFields, scanForCredentialFields, validatePasswordStrategyInvariant } from './password-boundary'
import { MigrationRunService } from './migration-run.service'
import { SimulatedTargetState } from './simulated-target'
import { InMemoryStagingStore } from './staging-store'
import type { ApprovedTenantAssignmentEntry, BotcIdentitySourceSnapshot } from './types'

/**
 * TASK-027.16 scope items 3–7 — password strategy behavior, secret redaction, and the auth-session
 * boundary, exercised against `MigrationRunService` as a black box.
 */
function buildSnapshot(): BotcIdentitySourceSnapshot {
  return {
    users: [
      { legacyId: '1', username: 'no-admin', fullName: 'No Admin User', isActive: true, email: 'no-admin@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: null, sirket: null },
      { legacyId: '2', username: 'with-admin', fullName: 'Admin Assigned User', isActive: true, email: 'with-admin@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: null, sirket: null },
      { legacyId: '3', username: 'unresolved-tenant', fullName: 'Unresolved Tenant User', isActive: true, email: 'unresolved@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: null, sirket: null },
    ],
    roles: [],
    permissions: [],
    userPermissions: [],
  }
}

const approvedTenantAssignmentTable: ApprovedTenantAssignmentEntry[] = [
  { userLegacyId: '1', tenantSlug: 'MOSB' },
  { userLegacyId: '2', tenantSlug: 'MOSB' },
  // '3' intentionally absent -> UNRESOLVED
]

describe('password strategy behavior (scope items 1, 3)', () => {
  it('a user with no admin assignment gets RESET_REQUIRED only', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable,
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const user = targetState.usersByLegacyId.get('1')
    expect(user?.passwordStrategies).toEqual(['RESET_REQUIRED'])
    expect(validatePasswordStrategyInvariant(user?.passwordStrategies ?? [])).toBe(true)
  })

  it('a user with an admin-assigned temporary password gets RESET_REQUIRED + ADMIN_ASSIGNED (additive, never a replacement)', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable,
      adminAssignedPasswordLegacyIds: new Set(['2']),
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const user = targetState.usersByLegacyId.get('2')
    expect(user?.passwordStrategies).toEqual(['RESET_REQUIRED', 'ADMIN_ASSIGNED'])
    expect(validatePasswordStrategyInvariant(user?.passwordStrategies ?? [])).toBe(true)
  })

  it('every migrated user carries RESET_REQUIRED regardless of admin assignment', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable,
      adminAssignedPasswordLegacyIds: new Set(['2']),
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    for (const user of targetState.usersByLegacyId.values()) {
      expect(user.passwordStrategies).toContain('RESET_REQUIRED')
    }
  })
})

describe('admin assignment persistence — idempotency/retry (scope item 5)', () => {
  it('re-running without re-supplying adminAssignedPasswordLegacyIds does not delete a previously recorded ADMIN_ASSIGNED flag', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const snapshot = buildSnapshot()

    service.run({
      source: snapshot,
      approvedTenantAssignmentTable,
      adminAssignedPasswordLegacyIds: new Set(['2']),
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    expect(targetState.usersByLegacyId.get('2')?.passwordStrategies).toEqual(['RESET_REQUIRED', 'ADMIN_ASSIGNED'])

    // User '2' is renamed (checksum changes -> triggers the update path), and this run's caller
    // does NOT re-pass user '2' in adminAssignedPasswordLegacyIds.
    const changed: BotcIdentitySourceSnapshot = {
      ...snapshot,
      users: snapshot.users.map(u => (u.legacyId === '2' ? { ...u, fullName: 'Renamed Admin Assigned User' } : u)),
    }
    const { report } = service.run({
      source: changed,
      approvedTenantAssignmentTable,
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-2',
    })
    expect(report.usersToUpdate).toBeGreaterThanOrEqual(1)
    expect(targetState.usersByLegacyId.get('2')?.passwordStrategies).toEqual(['RESET_REQUIRED', 'ADMIN_ASSIGNED'])
  })

  it('an unchanged user (SKIPPED on rerun) never duplicates entries in passwordStrategies', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const snapshot = buildSnapshot()

    service.run({ source: snapshot, approvedTenantAssignmentTable, adminAssignedPasswordLegacyIds: new Set(['2']), stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    service.run({ source: snapshot, approvedTenantAssignmentTable, adminAssignedPasswordLegacyIds: new Set(['2']), stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-2' })

    expect(targetState.usersByLegacyId.get('1')?.passwordStrategies).toEqual(['RESET_REQUIRED'])
    expect(targetState.usersByLegacyId.get('2')?.passwordStrategies).toEqual(['RESET_REQUIRED', 'ADMIN_ASSIGNED'])
  })

  it('a FAILED user record is retried on the next run and still receives the correct password strategy once it succeeds', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const snapshot = buildSnapshot()

    service.run({
      source: snapshot,
      approvedTenantAssignmentTable,
      adminAssignedPasswordLegacyIds: new Set(['2']),
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
      simulateFailureLegacyIds: new Set(['2']),
    })
    expect(targetState.usersByLegacyId.has('2')).toBe(false)
    expect(stagingStore.findByLegacy('USER', '2')?.mappingStatus).toBe('FAILED')

    service.run({
      source: snapshot,
      approvedTenantAssignmentTable,
      adminAssignedPasswordLegacyIds: new Set(['2']),
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-2',
    })
    expect(stagingStore.findByLegacy('USER', '2')?.mappingStatus).toBe('COMPLETED')
    expect(targetState.usersByLegacyId.get('2')?.passwordStrategies).toEqual(['RESET_REQUIRED', 'ADMIN_ASSIGNED'])
  })
})

describe('login/tenant-readiness security contract (scope item 4)', () => {
  it('a RESET_REQUIRED user with an UNRESOLVED tenant is never treated as access-ready (no tenant membership, regardless of password state)', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable, // user '3' absent
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const userId = targetState.usersByLegacyId.get('3')?.id
    expect(targetState.usersByLegacyId.get('3')?.passwordStrategies).toContain('RESET_REQUIRED')
    expect(targetState.tenantMembershipsByUserId.has(userId as string)).toBe(false)
    expect(stagingStore.findByLegacy('USER', '3')?.tenantMembershipStatus).toBe('UNRESOLVED')
  })

  it('password state never influences tenant/permission resolution — an ADMIN_ASSIGNED user with no tenant mapping is still UNRESOLVED', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable: [{ userLegacyId: '3', tenantSlug: null }], // explicit but unresolved
      adminAssignedPasswordLegacyIds: new Set(['3']),
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const userId = targetState.usersByLegacyId.get('3')?.id
    expect(targetState.usersByLegacyId.get('3')?.passwordStrategies).toEqual(['RESET_REQUIRED', 'ADMIN_ASSIGNED'])
    expect(targetState.tenantMembershipsByUserId.has(userId as string)).toBe(false)
  })
})

describe('secret redaction (scope item 6)', () => {
  it('a full dry-run report contains no credential-like field, even with admin assignment and errors present', () => {
    const service = new MigrationRunService()
    const { report } = service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable,
      adminAssignedPasswordLegacyIds: new Set(['2']),
      stagingStore: new InMemoryStagingStore(),
      targetState: new SimulatedTargetState(),
      mode: 'DRY_RUN',
      migrationRunId: 'run-1',
    })
    expect(scanForCredentialFields(report)).toEqual([])
    expect(() => assertNoCredentialFields(report, 'DryRunReport')).not.toThrow()
  })

  it('audit metadata built from a real report contains no credential-like field', () => {
    const service = new MigrationRunService()
    const startedAt = '2026-09-18T00:00:00.000Z'
    const { report } = service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable,
      adminAssignedPasswordLegacyIds: new Set(['2']),
      stagingStore: new InMemoryStagingStore(),
      targetState: new SimulatedTargetState(),
      mode: 'DRY_RUN',
      migrationRunId: 'run-1',
      now: () => new Date(startedAt),
    })
    const audit = buildAuditMetadata({ actorId: 'admin-1', mode: 'DRY_RUN', startedAt, finishedAt: report.generatedAt, report })
    expect(scanForCredentialFields(audit)).toEqual([])
  })

  it('staging records (including a simulated failure) never contain a credential-like field in errorDescription or anywhere else', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable,
      stagingStore,
      targetState: new SimulatedTargetState(),
      mode: 'APPLY',
      migrationRunId: 'run-1',
      simulateFailureLegacyIds: new Set(['1']),
    })
    expect(scanForCredentialFields(stagingStore.all())).toEqual([])
  })

  it('the simulated target user row never carries a temporary/admin-assigned password value, only the strategy label', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable,
      adminAssignedPasswordLegacyIds: new Set(['2']),
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    expect(scanForCredentialFields([...targetState.usersByLegacyId.values()])).toEqual([])
  })
})

describe('auth session boundary (scope item 7)', () => {
  it('no source file in the migration module references authSessions, session cookies, or JWT/token issuance (outside comments)', () => {
    const dir = join(__dirname)
    // session-boundary.ts (TASK-027.17) is itself a verification utility whose job is to name
    // these exact terms in a regex pattern — it is scanned by its own dedicated tests instead
    // (session-boundary.spec.ts, session-email-governance.spec.ts) which prove it has no actual
    // session/token generation logic, only a string scanner.
    const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'session-boundary.ts')
    const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const forbiddenPatterns = [/authSessions/, /refreshTokenHash/, /jwt/i, /setCookie/i, /issueSession/i]
    for (const file of files) {
      const code = stripComments(readFileSync(join(dir, file), 'utf8'))
      for (const pattern of forbiddenPatterns) expect(pattern.test(code)).toBe(false)
    }
  })

  it('APPLY never produces anything session-shaped — the simulated target has no session/cookie/token concept at all', () => {
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source: buildSnapshot(),
      approvedTenantAssignmentTable,
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    expect(Object.keys(targetState)).not.toContain('authSessions')
    expect(Object.keys(targetState)).not.toContain('sessions')
  })
})

describe('self-service flow scope exclusion (scope item 8)', () => {
  it('no self-service reset/verification/notification concept exists in any production source file', () => {
    const dir = join(__dirname)
    // Source only — this spec file's own text necessarily names these forbidden patterns.
    const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    const forbiddenPatterns = [/resetPassword/, /verifyEmail/, /sendResetLink/, /SmsProvider/i, /NotificationProvider/i]
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf8')
      for (const pattern of forbiddenPatterns) expect(pattern.test(content)).toBe(false)
    }
  })
})
