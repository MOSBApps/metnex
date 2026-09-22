import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMockDb, chain } from '../../db/test-helpers/drizzle-mock'
import { CANONICAL_PRIVILEGE_SOURCE, DRIFT_CATEGORIES } from './privilege-canonical.contract'
import { DrizzlePrivilegeSnapshotPort } from './privilege-snapshot.drizzle'
import { PrivilegeAuditService } from './privilege-audit.service'
import { analyzePrivilegeSnapshot, type DriftRecord, type PrivilegeReport } from './privilege-report.domain'
import type { PrivilegeSnapshot, PrivilegeSnapshotPort } from './privilege-snapshot.port'

/**
 * TASK-027.45 — read-only privilege canonical source, drift detection and admin invariant.
 * Mock/fixture only: no database, HTTP or MFA provider is used, and every identifier is fabricated.
 */
const ROLES = [
  { id: 'role-sa', name: 'SYSTEM_ADMIN' },
  { id: 'role-ta', name: 'TENANT_ADMIN' },
  { id: 'role-v', name: 'VIEWER' },
]
const TENANTS = [
  { id: 'platform-root', type: 'PLATFORM_ROOT', status: 'ACTIVE' },
  { id: 'root-A', type: 'ROOT', status: 'ACTIVE' },
  { id: 'child-A1', type: 'STANDARD', status: 'ACTIVE' },
]
const user = (id: string, status = 'ACTIVE', isSystemAdmin = false) => ({ id, status, isSystemAdmin })
const assign = (id: string, userId: string, roleId: string, tenantId: string | null = null) => ({ id, userId, roleId, tenantId })
const snap = (over: Partial<PrivilegeSnapshot> = {}): PrivilegeSnapshot => ({ users: [], roles: ROLES, assignments: [], tenants: TENANTS, ...over })
const of = (report: PrivilegeReport, category: (typeof DRIFT_CATEGORIES)[number]) => report.drift.filter(record => record.category === category)
const ids = (records: DriftRecord[]) => records.map(record => record.subjectId)

describe('canonical source and flag ↔ role comparison', () => {
  it('a user whose flag and global SYSTEM_ADMIN role agree is reported as FLAG_ROLE_MATCH and counts as an active administrator', () => {
    const report = analyzePrivilegeSnapshot(snap({ users: [user('u1', 'ACTIVE', true)], assignments: [assign('a1', 'u1', 'role-sa')] }))
    expect(of(report, 'FLAG_ROLE_MATCH')).toEqual([expect.objectContaining({ subjectId: 'u1', reason: 'FLAG_AND_ROLE_AGREE', flag: true, hasGlobalSystemAdminRole: true })])
    expect(report.invariant).toMatchObject({ activeSystemAdminCount: 1, satisfied: true, violation: null })
    expect(report.driftByCategory.FLAG_WITHOUT_SYSTEM_ROLE + report.driftByCategory.SYSTEM_ROLE_WITHOUT_FLAG).toBe(0)
    expect(report.canonicalSource).toBe(CANONICAL_PRIVILEGE_SOURCE.canonical)
    expect(report.derivedCache).toBe('users.isSystemAdmin')
  })

  it('the flag without a SYSTEM_ROLE is FLAG_WITHOUT_SYSTEM_ROLE and does NOT count as a canonical administrator', () => {
    const report = analyzePrivilegeSnapshot(snap({ users: [user('u1', 'ACTIVE', true)] }))
    expect(of(report, 'FLAG_WITHOUT_SYSTEM_ROLE')).toEqual([expect.objectContaining({ subjectId: 'u1', reason: 'FLAG_SET_NO_GLOBAL_SYSTEM_ADMIN_ROLE', flag: true, hasGlobalSystemAdminRole: false })])
    expect(report.counts).toMatchObject({ activeFlagCount: 1, activeRoleCount: 0 })
    expect(report.invariant).toMatchObject({ activeSystemAdminCount: 0, satisfied: false, violation: 'ZERO_ACTIVE_SYSTEM_ADMIN' })
  })

  it('a global SYSTEM_ADMIN role without the flag is SYSTEM_ROLE_WITHOUT_FLAG and IS canonical', () => {
    const report = analyzePrivilegeSnapshot(snap({ users: [user('u1', 'ACTIVE', false)], assignments: [assign('a1', 'u1', 'role-sa')] }))
    expect(of(report, 'SYSTEM_ROLE_WITHOUT_FLAG')).toEqual([expect.objectContaining({ subjectId: 'u1', reason: 'GLOBAL_SYSTEM_ADMIN_ROLE_FLAG_UNSET', flag: false, hasGlobalSystemAdminRole: true })])
    expect(report.invariant.activeSystemAdminCount).toBe(1)
  })

  it('a tenant-scoped SYSTEM_ADMIN assignment is never canonical (and is reported as an unknown/invalid scope)', () => {
    const report = analyzePrivilegeSnapshot(snap({ users: [user('u1')], assignments: [assign('a1', 'u1', 'role-sa', 'root-A')] }))
    expect(report.invariant.activeSystemAdminCount).toBe(0)
    expect(of(report, 'UNKNOWN_ROLE_SCOPE')).toEqual([expect.objectContaining({ assignmentId: 'a1', reason: 'SYSTEM_ADMIN_TENANT_SCOPED', scope: 'TENANT' })])
  })
})

describe('active / inactive / locked', () => {
  it('an INACTIVE system administrator is reported and excluded from the active count', () => {
    const report = analyzePrivilegeSnapshot(snap({ users: [user('u1', 'INACTIVE', true), user('u2', 'ACTIVE', true)], assignments: [assign('a1', 'u1', 'role-sa'), assign('a2', 'u2', 'role-sa')] }))
    expect(of(report, 'INACTIVE_SYSTEM_ADMIN')).toEqual([expect.objectContaining({ subjectId: 'u1', reason: 'ADMIN_USER_INACTIVE', userStatus: 'INACTIVE' })])
    expect(report.invariant.activeSystemAdminCount).toBe(1)
    expect(report.invariant.lastAdministratorUserIds).toEqual(['u2'])
    expect(report.invariant.singleActiveSystemAdmin).toBe(true)
  })

  it('a LOCKED system administrator is reported and excluded from the active count', () => {
    const report = analyzePrivilegeSnapshot(snap({ users: [user('u1', 'LOCKED', true), user('u2', 'ACTIVE', true)], assignments: [assign('a1', 'u1', 'role-sa'), assign('a2', 'u2', 'role-sa')] }))
    expect(of(report, 'LOCKED_SYSTEM_ADMIN')).toEqual([expect.objectContaining({ subjectId: 'u1', reason: 'ADMIN_USER_LOCKED', userStatus: 'LOCKED' })])
    expect(report.invariant.activeSystemAdminCount).toBe(1)
  })

  it('a flag-only inactive/locked user is still reported (either representation counts as admin-ness for these categories)', () => {
    const report = analyzePrivilegeSnapshot(snap({ users: [user('u1', 'INACTIVE', true), user('u2', 'LOCKED', true)] }))
    expect(ids(of(report, 'INACTIVE_SYSTEM_ADMIN'))).toEqual(['u1'])
    expect(ids(of(report, 'LOCKED_SYSTEM_ADMIN'))).toEqual(['u2'])
  })

  it('a non-admin user (no flag, no role) produces no record at all, whatever their status', () => {
    const report = analyzePrivilegeSnapshot(snap({ users: [user('u1', 'INACTIVE'), user('u2', 'LOCKED'), user('u3')] }))
    expect(report.drift).toEqual([])
  })
})

describe('last-administrator invariant (computed from canonical role assignments)', () => {
  it('several active administrators: satisfied, not "single", no last-admin list', () => {
    const report = analyzePrivilegeSnapshot(snap({ users: [user('u1', 'ACTIVE', true), user('u2', 'ACTIVE', true)], assignments: [assign('a1', 'u1', 'role-sa'), assign('a2', 'u2', 'role-sa')] }))
    expect(report.invariant).toEqual({ activeSystemAdminCount: 2, minimumRequired: 1, satisfied: true, violation: null, singleActiveSystemAdmin: false, lastAdministratorUserIds: [] })
    expect(of(report, 'MULTIPLE_ADMIN_COUNT_MISMATCH')).toEqual([])
  })

  it('zero active administrators: the invariant is violated and only REPORTED', () => {
    const report = analyzePrivilegeSnapshot(snap({ users: [user('u1', 'INACTIVE', true)], assignments: [assign('a1', 'u1', 'role-sa')] }))
    expect(report.invariant).toMatchObject({ activeSystemAdminCount: 0, satisfied: false, violation: 'ZERO_ACTIVE_SYSTEM_ADMIN', lastAdministratorUserIds: [] })
    expect(report.effect).toBe('REPORT_ONLY')
  })

  it('an empty platform (no users at all) also reports the violation instead of failing', () => {
    expect(analyzePrivilegeSnapshot(snap()).invariant.violation).toBe('ZERO_ACTIVE_SYSTEM_ADMIN')
  })

  it('the guard counts that disagree today are surfaced as MULTIPLE_ADMIN_COUNT_MISMATCH with the three counts', () => {
    // revoke guard counts all SYSTEM_ADMIN assignments (2), deactivate guard counts ACTIVE flagged users (1), canonical counts ACTIVE role holders (1)
    const report = analyzePrivilegeSnapshot(snap({ users: [user('u1', 'ACTIVE', true), user('u2', 'INACTIVE', false)], assignments: [assign('a1', 'u1', 'role-sa'), assign('a2', 'u2', 'role-sa')] }))
    expect(of(report, 'MULTIPLE_ADMIN_COUNT_MISMATCH')).toEqual([
      expect.objectContaining({ subjectType: 'PLATFORM', subjectId: 'PLATFORM', reason: 'GUARD_COUNTS_DIFFER', counts: { assignmentCount: 2, activeFlagCount: 1, activeRoleCount: 1 } }),
    ])
  })
})

describe('global vs tenant-scoped assignments', () => {
  it('a GLOBAL TENANT_ADMIN is reported (and not changed); a tenant-scoped TENANT_ADMIN is not drift', () => {
    const report = analyzePrivilegeSnapshot(snap({
      users: [user('u1'), user('u2')],
      assignments: [assign('a1', 'u1', 'role-ta'), assign('a2', 'u2', 'role-ta', 'root-A')],
    }))
    expect(of(report, 'GLOBAL_TENANT_ADMIN')).toEqual([expect.objectContaining({ assignmentId: 'a1', userId: 'u1', scope: 'GLOBAL', tenantId: null, reason: 'TENANT_ADMIN_ASSIGNED_GLOBALLY', userStatus: 'ACTIVE' })])
    expect(report.drift.filter(record => record.assignmentId === 'a2')).toEqual([])
  })

  it('reports global and tenant-scoped assignments separately, with the tenant type, and never merges them', () => {
    const report = analyzePrivilegeSnapshot(snap({
      users: [user('u1'), user('u2'), user('u3')],
      assignments: [assign('a1', 'u1', 'role-ta'), assign('a2', 'u2', 'role-ta', 'root-A'), assign('a3', 'u3', 'role-v', 'child-A1'), assign('a4', 'u3', 'role-ta', 'platform-root')],
    }))
    expect(report.assignments.global.map(a => a.assignmentId)).toEqual(['a1'])
    expect(report.assignments.tenant.map(a => [a.assignmentId, a.tenantType])).toEqual([['a2', 'ROOT'], ['a3', 'STANDARD'], ['a4', 'PLATFORM_ROOT']])
    expect(report.counts).toMatchObject({ globalAssignments: 1, tenantAssignments: 3, assignments: 4 })
    expect(report.roleSummary.global).toEqual([{ roleName: 'TENANT_ADMIN', count: 1 }])
    expect(report.roleSummary.tenant).toEqual([{ roleName: 'TENANT_ADMIN', count: 2 }, { roleName: 'VIEWER', count: 1 }])
  })

  it('a tenant-scoped assignment pointing at an unknown tenant is UNKNOWN_ROLE_SCOPE', () => {
    const report = analyzePrivilegeSnapshot(snap({ users: [user('u1')], assignments: [assign('a1', 'u1', 'role-ta', 'ghost-tenant')] }))
    expect(of(report, 'UNKNOWN_ROLE_SCOPE')).toEqual([expect.objectContaining({ assignmentId: 'a1', reason: 'TENANT_REFERENCE_MISSING', scope: 'TENANT', tenantId: 'ghost-tenant' })])
    expect(report.assignments.tenant[0]).toMatchObject({ tenantType: null })
  })

  it('a global non-admin role (e.g. VIEWER) is listed under global assignments without any drift', () => {
    const report = analyzePrivilegeSnapshot(snap({ users: [user('u1')], assignments: [assign('a1', 'u1', 'role-v')] }))
    expect(report.assignments.global).toHaveLength(1)
    expect(report.drift).toEqual([])
  })
})

describe('orphans', () => {
  it('an assignment whose user or role does not exist is INVALID_TARGET_REFERENCE (never counted as an administrator)', () => {
    const report = analyzePrivilegeSnapshot(snap({ users: [user('u1')], assignments: [assign('a1', 'ghost-user', 'role-sa'), assign('a2', 'u1', 'ghost-role')] }))
    expect(of(report, 'INVALID_TARGET_REFERENCE')).toEqual([
      expect.objectContaining({ assignmentId: 'a1', reason: 'USER_REFERENCE_MISSING' }),
      expect.objectContaining({ assignmentId: 'a2', reason: 'ROLE_REFERENCE_MISSING' }),
    ])
    expect(report.assignments.global.find(a => a.assignmentId === 'a2')).toMatchObject({ roleName: null })
    expect(report.invariant.activeSystemAdminCount).toBe(0) // ghost-user is not a real ACTIVE user
  })
})

describe('determinism and safety of the output', () => {
  const big = (): PrivilegeSnapshot => snap({
    users: [user('u3', 'LOCKED', true), user('u1', 'ACTIVE', true), user('u2', 'INACTIVE', false), user('u4')],
    assignments: [assign('a3', 'u2', 'role-sa'), assign('a1', 'u1', 'role-sa'), assign('a2', 'u4', 'role-ta'), assign('a4', 'ghost', 'role-v', 'root-A')],
  })

  it('the same input yields byte-identical reports on two runs', () => {
    expect(JSON.stringify(analyzePrivilegeSnapshot(big()))).toBe(JSON.stringify(analyzePrivilegeSnapshot(big())))
  })

  it('the report does not depend on the input order (users, assignments, roles and tenants shuffled)', () => {
    const a = big()
    const b = big()
    b.users.reverse(); b.assignments.reverse(); b.roles.reverse(); b.tenants.reverse()
    expect(JSON.stringify(analyzePrivilegeSnapshot(a))).toBe(JSON.stringify(analyzePrivilegeSnapshot(b)))
  })

  it('records are ordered by the documented category order, then subject id', () => {
    const report = analyzePrivilegeSnapshot(big())
    const ranks = report.drift.map(r => DRIFT_CATEGORIES.indexOf(r.category))
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y))
  })

  it('every category is present in the per-category summary and supported', () => {
    const report = analyzePrivilegeSnapshot(snap())
    expect(Object.keys(report.driftByCategory)).toEqual([...DRIFT_CATEGORIES])
    for (const required of ['FLAG_ROLE_MATCH', 'FLAG_WITHOUT_SYSTEM_ROLE', 'SYSTEM_ROLE_WITHOUT_FLAG', 'INACTIVE_SYSTEM_ADMIN', 'LOCKED_SYSTEM_ADMIN', 'GLOBAL_TENANT_ADMIN', 'MULTIPLE_ADMIN_COUNT_MISMATCH', 'UNKNOWN_ROLE_SCOPE', 'INVALID_TARGET_REFERENCE']) {
      expect(DRIFT_CATEGORIES as readonly string[]).toContain(required)
    }
  })

  it('carries no credential, session or token field or value — only identifiers, scope, status and static reason codes', () => {
    const hostile = big()
    ;(hostile.users[0] as unknown as Record<string, unknown>)['passwordHash'] = 'placeholder-hash-not-a-real-value'
    ;(hostile.users[0] as unknown as Record<string, unknown>)['refreshToken'] = 'placeholder-token'
    ;(hostile.users[0] as unknown as Record<string, unknown>)['email'] = 'someone@example.test'
    const text = JSON.stringify(analyzePrivilegeSnapshot(hostile))
    expect(text).not.toMatch(/passwordHash|placeholder-hash|placeholder-token|refreshToken|someone@example|secret|otp|mfa|email/i)
    const keys = new Set<string>()
    const walk = (value: unknown) => { if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { keys.add(k); walk(v) } }
    walk(analyzePrivilegeSnapshot(big()))
    expect([...keys].filter(key => /password|hash|token|session|secret|email|otp/i.test(key))).toEqual([])
  })

  it('never mutates its input and holds no permission: a frozen snapshot is analysed unchanged', () => {
    const frozen = Object.freeze(JSON.parse(JSON.stringify(big())) as PrivilegeSnapshot)
    for (const list of [frozen.users, frozen.roles, frozen.assignments, frozen.tenants]) Object.freeze(list)
    const before = JSON.stringify(frozen)
    expect(() => analyzePrivilegeSnapshot(frozen)).not.toThrow()
    expect(JSON.stringify(frozen)).toBe(before)
    const report = analyzePrivilegeSnapshot(frozen)
    expect(report.mode).toBe('DRY_RUN')
    expect(report.effect).toBe('REPORT_ONLY')
    expect(JSON.stringify(report)).not.toMatch(/"(revoke|delete|repair|grant)/i)
  })
})

describe('service and adapter (no real database)', () => {
  it('the service is a pure pass-through of a port snapshot into a report and has no mutating method', async () => {
    const port: PrivilegeSnapshotPort = { load: jest.fn(async () => snap({ users: [user('u1', 'ACTIVE', true)], assignments: [assign('a1', 'u1', 'role-sa')] })) }
    const service = new PrivilegeAuditService(port)
    const report = await service.report()
    expect(port.load).toHaveBeenCalledTimes(1)
    expect(report.invariant.activeSystemAdminCount).toBe(1)
    expect(Object.getOwnPropertyNames(PrivilegeAuditService.prototype).sort()).toEqual(['constructor', 'report'])
  })

  it('the Drizzle adapter issues four SELECTs and nothing else, and never selects a credential column', async () => {
    const db = buildMockDb()
    db.select
      .mockReturnValueOnce(chain([user('u1', 'ACTIVE', true)]))
      .mockReturnValueOnce(chain(ROLES))
      .mockReturnValueOnce(chain([assign('a1', 'u1', 'role-sa')]))
      .mockReturnValueOnce(chain(TENANTS))
    const snapshot = await new DrizzlePrivilegeSnapshotPort(db as never).load()
    expect(snapshot.users).toHaveLength(1)
    expect(db.select).toHaveBeenCalledTimes(4)
    for (const fn of [db.insert, db.update, db.delete, db.transaction]) expect(fn).not.toHaveBeenCalled()
    const selectedKeys = db.select.mock.calls.flatMap(call => Object.keys((call as unknown[])[0] as object))
    expect(selectedKeys.sort()).toEqual(['id', 'id', 'id', 'id', 'isSystemAdmin', 'name', 'roleId', 'status', 'status', 'tenantId', 'type', 'userId'].sort())
    expect(selectedKeys.filter(key => /password|hash|token|email|secret/i.test(key))).toEqual([])
  })

  it('an end-to-end report over a mocked database causes no write of any kind', async () => {
    const db = buildMockDb()
    db.select
      .mockReturnValueOnce(chain([user('u1', 'INACTIVE', true)]))
      .mockReturnValueOnce(chain(ROLES))
      .mockReturnValueOnce(chain([assign('a1', 'u1', 'role-ta')]))
      .mockReturnValueOnce(chain(TENANTS))
    const report = await new PrivilegeAuditService(new DrizzlePrivilegeSnapshotPort(db as never)).report()
    expect(of(report, 'GLOBAL_TENANT_ADMIN')).toHaveLength(1)
    for (const fn of [db.insert, db.update, db.delete, db.transaction]) expect(fn).not.toHaveBeenCalled()
  })
})

describe('static boundary', () => {
  const SRC = join(__dirname, '..', '..')
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
  const read = (file: string) => strip(readFileSync(join(__dirname, file), 'utf8'))

  it('the domain, contract, port and service import no database, ORM, network or filesystem module', () => {
    for (const file of ['privilege-report.domain.ts', 'privilege-canonical.contract.ts', 'privilege-snapshot.port.ts', 'privilege-audit.service.ts']) {
      expect(read(file)).not.toMatch(/drizzle|db\.module|\/db\/|process\.env|node:fs|\bfetch\(|from 'pg'|DATABASE_URL/i)
    }
  })

  it('the Drizzle adapter is SELECT-only: no insert/update/delete/transaction/execute and no credential column', () => {
    const adapter = read('privilege-snapshot.drizzle.ts')
    expect(adapter).not.toMatch(/\.(insert|update|delete|transaction|execute)\(/)
    expect(adapter).not.toMatch(/passwordHash|users\.email|displayName|Token|secret/i)
    expect((adapter.match(/\.select\(/g) ?? []).length).toBe(4)
  })

  it('no connection string, production URL or new dependency was introduced by these files', () => {
    for (const file of readdirSync(__dirname).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))) {
      expect(read(file)).not.toMatch(/postgres(ql)?:\/\/|DATABASE_URL|createPool|new Pool|drizzle-orm\/node-postgres/)
    }
  })

  it('nothing but the module wiring and the (also unrouted, TASK-027.47) break-glass CLI import the adapter, and no controller, route or job exposes the report', () => {
    const importers = walk(SRC).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && /privilege-snapshot\.drizzle/.test(readFileSync(f, 'utf8')) && !f.endsWith('privilege-snapshot.drizzle.ts'))
    expect(importers.map(f => f.split('/').pop()).sort()).toEqual(['break-glass-recovery.service.ts', 'platform.module.ts'])
    const exposers = walk(SRC).filter(f => f.endsWith('.controller.ts') && /privilege\//.test(readFileSync(f, 'utf8')))
    expect(exposers).toEqual([])
  })

  it('runtime authorisation is untouched: PermissionGuard, UserService, AuthService and MFA code do not use the privilege modules', () => {
    for (const rel of ['permission.guard.ts', 'user.service.ts', 'auth.service.ts', 'mfa.service.ts', 'role.service.ts', 'saas.service.ts']) {
      expect(readFileSync(join(SRC, 'platform', rel), 'utf8')).not.toMatch(/privilege\/|PrivilegeAuditService|analyzePrivilegeSnapshot/)
    }
  })

  it('the contract records the Q-DP24 decisions and adds no permission or role', () => {
    const contract = readFileSync(join(__dirname, 'privilege-canonical.contract.ts'), 'utf8')
    expect(CANONICAL_PRIVILEGE_SOURCE).toEqual({ canonical: 'GLOBAL_SYSTEM_ADMIN_ROLE_ASSIGNMENT', derivedCache: 'users.isSystemAdmin', activeUserStatus: 'ACTIVE', systemAdminRoleName: 'SYSTEM_ADMIN', tenantAdminRoleName: 'TENANT_ADMIN', minimumActiveSystemAdmins: 1 })
    expect(contract).not.toMatch(/PLATFORM:[A-Z_:]+|RequirePermission/)
  })
})
