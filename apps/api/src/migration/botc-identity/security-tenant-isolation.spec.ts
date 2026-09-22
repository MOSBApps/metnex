import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { APPROVED_PERMISSION_CODE_MAP } from './permission-mapping'
import { MigrationRunService } from './migration-run.service'
import { reconcileMigrationRuns, buildReconciliationSnapshot } from './reconciliation'
import { scanForCredentialFields } from './password-boundary'
import { scanForSessionOrTokenFields } from './session-boundary'
import { SimulatedTargetState } from './simulated-target'
import { InMemoryStagingStore } from './staging-store'
import type { ApprovedTenantAssignmentEntry, BotcIdentitySourceSnapshot } from './types'

/**
 * TASK-027.20 — consolidated identity security and tenant isolation test suite. This file does
 * not re-implement every assertion already proven elsewhere (that inventory lives in
 * docs/migration/METNEX_IDENTITY_SECURITY_TEST_MATRIX.md, cross-referenced by test file); it
 * exists to (a) prove specific properties that were NOT yet covered by any single existing test —
 * most importantly, that the CLI subdirectory's own source files were never included in any prior
 * static dependency scan — and (b) serve as one canonical place an auditor can run to see the
 * whole security posture in one file. No engine/CLI/reconciliation file is modified by this task.
 */

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

// ---------------------------------------------------------------------------------------------
// 1. Tenant isolation
// ---------------------------------------------------------------------------------------------
describe('1. Tenant isolation', () => {
  const source: BotcIdentitySourceSnapshot = {
    users: [user('1'), user('2'), user('3'), user('4')],
    roles: [],
    permissions: [],
    userPermissions: [],
  }
  const table: ApprovedTenantAssignmentEntry[] = [
    { userLegacyId: '1', tenantSlug: 'MOSB' },
    { userLegacyId: '2', tenantSlug: 'MOSEDAS' },
    { userLegacyId: '3', tenantSlug: 'MOSBIO' },
    // user '4' intentionally absent -> UNRESOLVED
  ]

  function run() {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    service.run({ source, approvedTenantAssignmentTable: table, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    return { stagingStore, targetState }
  }

  it('a MOSB user receives exactly one MOSB membership and no other tenant', () => {
    const { targetState } = run()
    const userId = targetState.usersByLegacyId.get('1')?.id as string
    const memberships = [...targetState.tenantMembershipsByUserId.values()].filter(m => m.userId === userId)
    expect(memberships).toEqual([{ userId, tenantSlug: 'MOSB' }])
  })

  it('a MOSEDAS user receives exactly one MOSEDAS membership and no other tenant', () => {
    const { targetState } = run()
    const userId = targetState.usersByLegacyId.get('2')?.id as string
    const memberships = [...targetState.tenantMembershipsByUserId.values()].filter(m => m.userId === userId)
    expect(memberships).toEqual([{ userId, tenantSlug: 'MOSEDAS' }])
  })

  it('a MOSBIO user receives exactly one MOSBIO membership and no other tenant', () => {
    const { targetState } = run()
    const userId = targetState.usersByLegacyId.get('3')?.id as string
    const memberships = [...targetState.tenantMembershipsByUserId.values()].filter(m => m.userId === userId)
    expect(memberships).toEqual([{ userId, tenantSlug: 'MOSBIO' }])
  })

  it('a user absent from the approved mapping table is UNRESOLVED and gets no membership row at all', () => {
    const { stagingStore, targetState } = run()
    const userId = targetState.usersByLegacyId.get('4')?.id as string
    expect(targetState.tenantMembershipsByUserId.has(userId)).toBe(false)
    expect(stagingStore.findByLegacy('USER', '4')?.tenantMembershipStatus).toBe('UNRESOLVED')
  })

  it('no tenant assignment leaks across users — each membership row references exactly one distinct user', () => {
    const { targetState } = run()
    const memberships = [...targetState.tenantMembershipsByUserId.values()]
    const userIds = memberships.map(m => m.userId)
    expect(new Set(userIds).size).toBe(userIds.length) // no duplicate/shared userId across rows
    expect(memberships).toHaveLength(3) // exactly the 3 resolved users, never 4
  })

  it('a conflict for one user does not alter or remove another user\'s already-resolved tenant assignment', () => {
    const withConflict: ApprovedTenantAssignmentEntry[] = [...table, { userLegacyId: '1', tenantSlug: 'MOSEDAS' }] // user '1' now conflicts
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({ source, approvedTenantAssignmentTable: withConflict, stagingStore: new InMemoryStagingStore(), targetState, mode: 'APPLY', migrationRunId: 'run-1' })

    const user1Id = targetState.usersByLegacyId.get('1')?.id as string
    const user2Id = targetState.usersByLegacyId.get('2')?.id as string
    const user3Id = targetState.usersByLegacyId.get('3')?.id as string
    expect(targetState.tenantMembershipsByUserId.has(user1Id)).toBe(false) // conflicted -> no membership
    expect(targetState.tenantMembershipsByUserId.get(user2Id)).toEqual({ userId: user2Id, tenantSlug: 'MOSEDAS' })
    expect(targetState.tenantMembershipsByUserId.get(user3Id)).toEqual({ userId: user3Id, tenantSlug: 'MOSBIO' })
  })
})

// ---------------------------------------------------------------------------------------------
// 2. Conflict security
// ---------------------------------------------------------------------------------------------
describe('2. Conflict security', () => {
  const source: BotcIdentitySourceSnapshot = { users: [user('1')], roles: [], permissions: [], userPermissions: [] }

  it('two different tenant slugs for the same user produce a FATAL issue', () => {
    const conflicting: ApprovedTenantAssignmentEntry[] = [
      { userLegacyId: '1', tenantSlug: 'MOSB' },
      { userLegacyId: '1', tenantSlug: 'MOSEDAS' },
    ]
    const service = new MigrationRunService()
    const { report } = service.run({ source, approvedTenantAssignmentTable: conflicting, stagingStore: new InMemoryStagingStore(), targetState: new SimulatedTargetState(), mode: 'APPLY', migrationRunId: 'run-1' })
    expect(report.errorsAndWarnings.some(i => i.code === 'FATAL_CONFLICTING_TENANT_ASSIGNMENT' && i.category === 'FATAL')).toBe(true)
  })

  it('the conflicted user never resolves to a third, fabricated tenant value — only null/UNRESOLVED', () => {
    const conflicting: ApprovedTenantAssignmentEntry[] = [
      { userLegacyId: '1', tenantSlug: 'MOSB' },
      { userLegacyId: '1', tenantSlug: 'MOSEDAS' },
    ]
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    service.run({ source, approvedTenantAssignmentTable: conflicting, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    const userId = targetState.usersByLegacyId.get('1')?.id as string
    expect(targetState.tenantMembershipsByUserId.has(userId)).toBe(false)
    expect(stagingStore.findByLegacy('USER', '1')?.tenantMembershipStatus).toBe('UNRESOLVED')
    // Never MOSBIO or any value that wasn't literally one of the two conflicting inputs.
  })

  it('repeated runs of the same unresolved conflict never grant access (idempotent non-access)', () => {
    const conflicting: ApprovedTenantAssignmentEntry[] = [
      { userLegacyId: '1', tenantSlug: 'MOSB' },
      { userLegacyId: '1', tenantSlug: 'MOSBIO' },
    ]
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    service.run({ source, approvedTenantAssignmentTable: conflicting, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    service.run({ source, approvedTenantAssignmentTable: conflicting, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-2' })
    expect(targetState.tenantMembershipsByUserId.size).toBe(0)
  })

  it('once corrected with a single unambiguous slug, the next run produces exactly one membership', () => {
    const service = new MigrationRunService()
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    service.run({
      source,
      approvedTenantAssignmentTable: [
        { userLegacyId: '1', tenantSlug: 'MOSB' },
        { userLegacyId: '1', tenantSlug: 'MOSBIO' },
      ],
      stagingStore,
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    service.run({ source, approvedTenantAssignmentTable: [{ userLegacyId: '1', tenantSlug: 'MOSB' }], stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-2' })
    const userId = targetState.usersByLegacyId.get('1')?.id as string
    const memberships = [...targetState.tenantMembershipsByUserId.values()].filter(m => m.userId === userId)
    expect(memberships).toEqual([{ userId, tenantSlug: 'MOSB' }])
  })
})

// ---------------------------------------------------------------------------------------------
// 3. Permission isolation
// ---------------------------------------------------------------------------------------------
describe('3. Permission isolation', () => {
  it('Wave 2 permissions (e.g. CanCreateTicket) never convert to an access code in any role template', () => {
    const source: BotcIdentitySourceSnapshot = {
      users: [user('1')],
      roles: [],
      permissions: [{ legacyId: '100', permissionName: 'CanCreateTicket' }],
      userPermissions: [{ legacyId: '1000', userLegacyId: '1', permissionLegacyId: '100' }],
    }
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    const { report } = service.run({ source, approvedTenantAssignmentTable: [{ userLegacyId: '1', tenantSlug: 'MOSB' }], stagingStore: new InMemoryStagingStore(), targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    for (const template of targetState.roleTemplatesById.values()) expect(template.permissionCodes).toEqual([])
    expect(report.roleAndPermissionChanges.permissionCodesUnmapped).toBe(1)
  })

  it('Wave 3 permissions (e.g. CanCreateDof) never convert to an access code in any role template', () => {
    const source: BotcIdentitySourceSnapshot = {
      users: [user('1')],
      roles: [],
      permissions: [{ legacyId: '100', permissionName: 'CanCreateDof' }],
      userPermissions: [{ legacyId: '1000', userLegacyId: '1', permissionLegacyId: '100' }],
    }
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({ source, approvedTenantAssignmentTable: [{ userLegacyId: '1', tenantSlug: 'MOSB' }], stagingStore: new InMemoryStagingStore(), targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    for (const template of targetState.roleTemplatesById.values()) expect(template.permissionCodes).toEqual([])
  })

  it('a user only ever receives the permission codes from their own effective grant set — never another user\'s', () => {
    const source: BotcIdentitySourceSnapshot = {
      users: [user('1'), user('2')],
      roles: [],
      permissions: [
        { legacyId: '100', permissionName: 'CanManageShifts' },
        { legacyId: '101', permissionName: 'CanViewHourlyReport' },
      ],
      userPermissions: [
        { legacyId: '1000', userLegacyId: '1', permissionLegacyId: '100' },
        { legacyId: '1001', userLegacyId: '2', permissionLegacyId: '101' },
      ],
    }
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({
      source,
      approvedTenantAssignmentTable: [
        { userLegacyId: '1', tenantSlug: 'MOSB' },
        { userLegacyId: '2', tenantSlug: 'MOSB' },
      ],
      stagingStore: new InMemoryStagingStore(),
      targetState,
      mode: 'APPLY',
      migrationRunId: 'run-1',
    })
    const user1Id = targetState.usersByLegacyId.get('1')?.id
    const user2Id = targetState.usersByLegacyId.get('2')?.id
    const templateFor = (userId: string | undefined) => {
      const assignment = targetState.roleAssignments.find(a => a.userId === userId)
      return targetState.roleTemplatesById.get(assignment?.roleTemplateId ?? '')
    }
    expect(templateFor(user1Id)?.permissionCodes).toEqual(['SHIFT:REPORT:UPDATE'])
    expect(templateFor(user2Id)?.permissionCodes).toEqual(['REPORT:HOURLY_CONSUMPTION:VIEW'])
  })

  it('only the 5 approved codes can ever appear anywhere in any generated role template, across the whole approved catalogue', () => {
    const allApprovedNames = Object.keys(APPROVED_PERMISSION_CODE_MAP)
    const source: BotcIdentitySourceSnapshot = {
      users: [user('1')],
      roles: [],
      permissions: allApprovedNames.map((name, i) => ({ legacyId: `${100 + i}`, permissionName: name })),
      userPermissions: allApprovedNames.map((_, i) => ({ legacyId: `${1000 + i}`, userLegacyId: '1', permissionLegacyId: `${100 + i}` })),
    }
    const service = new MigrationRunService()
    const targetState = new SimulatedTargetState()
    service.run({ source, approvedTenantAssignmentTable: [{ userLegacyId: '1', tenantSlug: 'MOSB' }], stagingStore: new InMemoryStagingStore(), targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    const approvedCodes = new Set(Object.values(APPROVED_PERMISSION_CODE_MAP))
    for (const template of targetState.roleTemplatesById.values()) {
      for (const code of template.permissionCodes) expect(approvedCodes.has(code)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------------------------
// 4. Root tenant / aggregate
// ---------------------------------------------------------------------------------------------
describe('4. Root tenant / aggregate', () => {
  it('a tenant membership row carries only { userId, tenantSlug } — no aggregate/root-scope concept', () => {
    const source: BotcIdentitySourceSnapshot = { users: [user('1')], roles: [], permissions: [], userPermissions: [] }
    const targetState = new SimulatedTargetState()
    new MigrationRunService().run({ source, approvedTenantAssignmentTable: [{ userLegacyId: '1', tenantSlug: 'MOSB' }], stagingStore: new InMemoryStagingStore(), targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    const [membership] = [...targetState.tenantMembershipsByUserId.values()]
    expect(Object.keys(membership as object).sort()).toEqual(['tenantSlug', 'userId'])
  })

  it('no production source file anywhere in the module tree references TenantScopeService/canAggregateChildren/tenant-scope', () => {
    for (const file of collectProductionSourceFiles()) {
      const content = stripComments(readFileSync(file, 'utf8'))
      expect(/TenantScopeService/.test(content)).toBe(false)
      expect(/canAggregateChildren/.test(content)).toBe(false)
      expect(/tenant-scope/.test(content)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------------------------
// 5. Password security
// ---------------------------------------------------------------------------------------------
describe('5. Password security', () => {
  const source: BotcIdentitySourceSnapshot = { users: [user('1'), user('2')], roles: [], permissions: [], userPermissions: [] }
  const table: ApprovedTenantAssignmentEntry[] = [
    { userLegacyId: '1', tenantSlug: 'MOSB' },
    { userLegacyId: '2', tenantSlug: 'MOSB' },
  ]

  it('every migrated user carries RESET_REQUIRED', () => {
    const targetState = new SimulatedTargetState()
    new MigrationRunService().run({ source, approvedTenantAssignmentTable: table, adminAssignedPasswordLegacyIds: new Set(['2']), stagingStore: new InMemoryStagingStore(), targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    for (const u of targetState.usersByLegacyId.values()) expect(u.passwordStrategies).toContain('RESET_REQUIRED')
  })

  it('ADMIN_ASSIGNED never removes RESET_REQUIRED and never survives loss across a checksum-changing update without being explicitly dropped by design (still additive)', () => {
    const targetState = new SimulatedTargetState()
    new MigrationRunService().run({ source, approvedTenantAssignmentTable: table, adminAssignedPasswordLegacyIds: new Set(['2']), stagingStore: new InMemoryStagingStore(), targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    expect(targetState.usersByLegacyId.get('2')?.passwordStrategies).toEqual(['RESET_REQUIRED', 'ADMIN_ASSIGNED'])
  })

  it('ADMIN_ASSIGNED persists across a later run that does not re-supply it (sticky, not silently deleted)', () => {
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const service = new MigrationRunService()
    service.run({ source, approvedTenantAssignmentTable: table, adminAssignedPasswordLegacyIds: new Set(['2']), stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    const renamed: BotcIdentitySourceSnapshot = { ...source, users: source.users.map(u => (u.legacyId === '2' ? user('2', { fullName: 'Renamed' }) : u)) }
    service.run({ source: renamed, approvedTenantAssignmentTable: table, stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-2' })
    expect(targetState.usersByLegacyId.get('2')?.passwordStrategies).toEqual(['RESET_REQUIRED', 'ADMIN_ASSIGNED'])
  })

  it('no user row, staging record, or report ever carries a passwordHash/salt/legacy-secret field', () => {
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const { report } = new MigrationRunService().run({ source, approvedTenantAssignmentTable: table, adminAssignedPasswordLegacyIds: new Set(['2']), stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    expect(scanForCredentialFields(report)).toEqual([])
    expect(scanForCredentialFields(stagingStore.all())).toEqual([])
    expect(scanForCredentialFields([...targetState.usersByLegacyId.values()])).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// 6. Session/email security
// ---------------------------------------------------------------------------------------------
describe('6. Session/email security', () => {
  it('a full migration run produces zero session/token/cookie/JWT/verification/reset-link fields anywhere in its output', () => {
    const source: BotcIdentitySourceSnapshot = { users: [user('1')], roles: [], permissions: [], userPermissions: [] }
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    const { report } = new MigrationRunService().run({ source, approvedTenantAssignmentTable: [{ userLegacyId: '1', tenantSlug: 'MOSB' }], stagingStore, targetState, mode: 'APPLY', migrationRunId: 'run-1' })
    expect(scanForSessionOrTokenFields(report)).toEqual([])
    expect(scanForSessionOrTokenFields(stagingStore.all())).toEqual([])
    expect(scanForSessionOrTokenFields([...targetState.usersByLegacyId.values()])).toEqual([])
  })

  it('an input snapshot carrying a session/token-shaped field is rejected as BLOCKED by reconciliation, never silently compared', () => {
    const before = buildReconciliationSnapshot({ migrationRunId: 'run-1', stagingStore: new InMemoryStagingStore(), targetState: new SimulatedTargetState(), issues: [], roleTemplateCount: 0, permissionMappedCount: 0, permissionUnmappedCount: 0 })
    const tainted = { ...before, authSessions: [] }
    const result = reconcileMigrationRuns(before, tainted)
    expect(result.reconciliationStatus).toBe('BLOCKED')
  })
})

// ---------------------------------------------------------------------------------------------
// 7. Dry-run security
// ---------------------------------------------------------------------------------------------
describe('7. Dry-run security', () => {
  it('DRY_RUN never mutates the caller-supplied stores', () => {
    const source: BotcIdentitySourceSnapshot = { users: [user('1')], roles: [], permissions: [], userPermissions: [] }
    const stagingStore = new InMemoryStagingStore()
    const targetState = new SimulatedTargetState()
    new MigrationRunService().run({ source, approvedTenantAssignmentTable: [{ userLegacyId: '1', tenantSlug: 'MOSB' }], stagingStore, targetState, mode: 'DRY_RUN', migrationRunId: 'run-1' })
    expect(stagingStore.all()).toHaveLength(0)
    expect(targetState.usersByLegacyId.size).toBe(0)
  })

  it('neither CLI entry point\'s argv parser recognizes an --apply flag', () => {
    // Both entry points legitimately mention "--apply" in their own usage/help text (to explain
    // that it does NOT exist) — the actual security property is that no `arg === '--apply'`
    // branch exists anywhere in their argument parsing, so a user passing `--apply` on the
    // command line can never select it.
    for (const name of ['cli/dry-run-cli-entry.ts', 'cli/reconcile-cli-entry.ts']) {
      const content = stripComments(readFileSync(join(__dirname, name), 'utf8'))
      expect(content.includes("=== '--apply'")).toBe(false)
    }
  })

  it('dry-run-cli.ts (the DRY_RUN-only core) never calls the engine with mode: APPLY', () => {
    const content = stripComments(readFileSync(join(__dirname, 'cli', 'dry-run-cli.ts'), 'utf8'))
    expect(/mode:\s*'APPLY'/.test(content)).toBe(false)
  })

  it('the same input produces a deterministic dry-run report across two calls', () => {
    const source: BotcIdentitySourceSnapshot = { users: [user('1')], roles: [], permissions: [], userPermissions: [] }
    const table: ApprovedTenantAssignmentEntry[] = [{ userLegacyId: '1', tenantSlug: 'MOSB' }]
    const fixedNow = () => new Date('2026-09-18T00:00:00.000Z')
    const service = new MigrationRunService()
    const run = () => service.run({ source, approvedTenantAssignmentTable: table, stagingStore: new InMemoryStagingStore(), targetState: new SimulatedTargetState(), mode: 'DRY_RUN', migrationRunId: 'run-fixed', now: fixedNow }).report
    expect(run()).toEqual(run())
  })
})

// ---------------------------------------------------------------------------------------------
// 8. Reconciliation security
// ---------------------------------------------------------------------------------------------
describe('8. Reconciliation security', () => {
  it('an UNRESOLVED comparison is never reported as MATCHED', () => {
    const snapshot = buildReconciliationSnapshot({
      migrationRunId: 'run-1',
      stagingStore: new InMemoryStagingStore(),
      targetState: new SimulatedTargetState(),
      issues: [],
      roleTemplateCount: 0,
      permissionMappedCount: 0,
      permissionUnmappedCount: 0,
    })
    const withUnresolvedUser = { ...snapshot, users: [{ sourceLegacyId: '1', mappingStatus: 'COMPLETED' as const, targetId: 'x', sourceChecksum: 'abc', tenantMembershipStatus: 'UNRESOLVED' as const, passwordStrategies: ['RESET_REQUIRED' as const] }] }
    const result = reconcileMigrationRuns(withUnresolvedUser, withUnresolvedUser)
    expect(result.reconciliationStatus).toBe('UNRESOLVED')
    expect(result.reconciliationStatus).not.toBe('MATCHED')
  })
})

// ---------------------------------------------------------------------------------------------
// 9. Static dependency boundary (recursive — includes cli/, previously unscanned by any test)
// ---------------------------------------------------------------------------------------------
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function collectProductionSourceFiles(): string[] {
  const root = __dirname
  const results: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'fixtures') continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        results.push(fullPath)
      }
    }
  }
  walk(root)
  return results
}

describe('9. Static dependency boundary (recursive scan, including cli/)', () => {
  it('the scan actually includes the cli/ subdirectory (sanity check that this is not a no-op)', () => {
    const files = collectProductionSourceFiles().map(f => f.replace(`${__dirname}/`, ''))
    expect(files).toContain('cli/dry-run-cli.ts')
    expect(files).toContain('cli/dry-run-cli-entry.ts')
    expect(files).toContain('cli/reconcile-cli-entry.ts')
  })

  it('no production file imports a real SQL Server client', () => {
    for (const file of collectProductionSourceFiles()) {
      const content = stripComments(readFileSync(file, 'utf8'))
      expect(/from ['"]mssql['"]/.test(content)).toBe(false)
      expect(/from ['"]tedious['"]/.test(content)).toBe(false)
    }
  })

  it('no production file imports the real PostgreSQL/Drizzle writer (db module, pg driver, or drizzle-orm)', () => {
    for (const file of collectProductionSourceFiles()) {
      const content = stripComments(readFileSync(file, 'utf8'))
      expect(content.includes("from '../../db/db.module")).toBe(false)
      expect(content.includes("from '../../db/db.service")).toBe(false)
      expect(/from ['"]pg['"]/.test(content)).toBe(false)
      expect(/from ['"]drizzle-orm/.test(content)).toBe(false)
    }
  })

  it('no production file references authSessions, JWT/session/cookie generation, or email/SMS providers (outside the boundary scanners\' own field-name allowlists)', () => {
    const boundaryScannerFiles = new Set(['password-boundary.ts', 'session-boundary.ts'])
    for (const file of collectProductionSourceFiles()) {
      const name = file.split('/').pop() as string
      if (boundaryScannerFiles.has(name)) continue // these two legitimately name the terms they scan for
      const content = stripComments(readFileSync(file, 'utf8'))
      expect(/authSessions/.test(content)).toBe(false)
      expect(/jwt/i.test(content)).toBe(false)
      expect(/setCookie/i.test(content)).toBe(false)
      expect(/EmailService/i.test(content)).toBe(false)
      expect(/MailerService/i.test(content)).toBe(false)
      expect(/SmsProvider/i.test(content)).toBe(false)
    }
  })

  it('no production file reads the Sirket field as a tenant-mapping source (only its type declaration in types.ts may name it)', () => {
    for (const file of collectProductionSourceFiles()) {
      const name = file.split('/').pop() as string
      const content = stripComments(readFileSync(file, 'utf8'))
      if (name === 'types.ts') {
        expect(content.includes('sirket:')).toBe(true) // the field must still be declared there
        continue
      }
      expect(/\.sirket\b/.test(content)).toBe(false)
    }
  })

  it('no production file references Wave 2 (Bakım/Arıza/Ticket) or Wave 3 (DÖF) concepts', () => {
    for (const file of collectProductionSourceFiles()) {
      const content = stripComments(readFileSync(file, 'utf8'))
      expect(/MaintenanceRecord|FaultRecord|TicketService/i.test(content)).toBe(false)
      expect(/DofUser|DOF_APP/i.test(content)).toBe(false)
    }
  })
})
