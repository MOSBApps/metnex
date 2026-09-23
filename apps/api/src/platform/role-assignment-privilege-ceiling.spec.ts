import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import {
  evaluateRoleGrantCeiling,
  isWithinCeiling,
  permits,
  resolveActorEffective,
  resolveGrantEffective,
  type ActorAssignmentFacts,
  type EffectivePermissions,
  type TenantFacts,
} from './domain/privilege-ceiling.domain'
import { BUILTIN_PERMISSIONS, BUILTIN_ROLES } from './domain/system-role.domain'
import { MfaService } from './mfa.service'
import { PERMISSION_KEY, PermissionGuard } from './permission.guard'
import { UserService } from './user.service'

/**
 * TASK-027.46 — role-assignment privilege ceiling, global TENANT_ADMIN boundary and impersonation refusal.
 * Mock-only (no database, HTTP or MFA provider); every credential is a fabricated placeholder.
 * Peer system-administrator restriction, MFA enforcement and tenant-role delegation are deliberately NOT part of this task.
 */
const known = BUILTIN_PERMISSIONS as readonly string[]
const codesOf = (name: string) => BUILTIN_ROLES.find(r => r.name === name)?.permissions ?? []

const ROOT_A: TenantFacts = { id: 'root-A', type: 'ROOT', customerRootId: null }
const ROOT_B: TenantFacts = { id: 'root-B', type: 'ROOT', customerRootId: null }
const CHILD_A1: TenantFacts = { id: 'child-A1', type: 'STANDARD', customerRootId: 'root-A' }
const PLATFORM_P: TenantFacts = { id: 'platform-P', type: 'PLATFORM_ROOT', customerRootId: null }
const TENANTS = new Map([ROOT_A, ROOT_B, CHILD_A1, PLATFORM_P].map(t => [t.id, t]))

const asg = (roleId: string, roleName: string, tenantId: string | null): ActorAssignmentFacts => ({ roleId, roleName, tenantId })
const ROLE_CODES = new Map<string, readonly string[]>([
  ['r-viewer', codesOf('VIEWER')],
  ['r-ta', codesOf('TENANT_ADMIN')],
  ['r-sa', codesOf('SYSTEM_ADMIN')],
])
const effectiveOf = (isSystemAdmin: boolean, assignments: ActorAssignmentFacts[]): EffectivePermissions =>
  resolveActorEffective({ isSystemAdmin, assignments, rolePermissionCodes: ROLE_CODES, tenantsById: TENANTS })

describe('ceiling model (pure)', () => {
  it('resolves the actor’s effective set exactly like PermissionGuard: flag = all; PLATFORM:* from GLOBAL roles only; TENANT_ADMIN only at a root', () => {
    expect(effectiveOf(true, []).all).toBe(true)
    const global = effectiveOf(false, [asg('r-viewer', 'VIEWER', null)])
    expect([...global.platform].sort()).toEqual(['PLATFORM:ROLE:VIEW', 'PLATFORM:TENANT:VIEW', 'PLATFORM:USER:VIEW'])
    const tenant = effectiveOf(false, [asg('r-ta', 'TENANT_ADMIN', 'root-A'), asg('r-viewer', 'VIEWER', 'root-A'), asg('r-ta', 'TENANT_ADMIN', 'child-A1')])
    expect(tenant.platform.size).toBe(0) // tenant-scoped roles never grant PLATFORM:*
    expect([...tenant.tenantAdminRoots]).toEqual(['root-A']) // VIEWER at a tenant is inert; TENANT_ADMIN at a STANDARD child is inert
  })

  it('a role granted at tenant scope: TENANT_ADMIN needs the root, every other role is inert, unknown tenant/type fails closed', () => {
    const grant = (roleName: string, tenant: TenantFacts | null) => resolveGrantEffective({ roleName, roleCodes: [], knownPermissionCodes: known, tenant, global: false })
    const effectiveOfGrant = (roleName: string, tenant: TenantFacts | null): EffectivePermissions => {
      const result = grant(roleName, tenant)
      if (!('effective' in result)) throw new Error('expected an effective grant')
      return result.effective
    }
    expect([...effectiveOfGrant('TENANT_ADMIN', ROOT_A).tenantAdminRoots]).toEqual(['root-A'])
    expect(effectiveOfGrant('TENANT_ADMIN', CHILD_A1).tenantAdminRoots.size).toBe(0)
    expect(effectiveOfGrant('VIEWER', ROOT_A).tenantAdminRoots.size).toBe(0)
    expect(grant('TENANT_ADMIN', null)).toEqual({ refusal: 'UNKNOWN_SCOPE' })
    expect(grant('TENANT_ADMIN', { id: 'x', type: 'WEIRD', customerRootId: null })).toEqual({ refusal: 'UNKNOWN_SCOPE' })
  })

  it('a role holding a permission code outside the catalogue fails closed', () => {
    const result = evaluateRoleGrantCeiling({ actor: effectiveOf(false, []), roleName: 'CUSTOM', roleCodes: ['PLATFORM:MADE:UP'], knownPermissionCodes: known, tenant: ROOT_A, global: false })
    expect(result).toEqual({ allowed: false, reason: 'UNKNOWN_PERMISSION' })
  })

  it('targetEffective ⊆ actorEffective: subsets pass, supersets and SYSTEM_ADMIN do not; a flagged actor covers everything', () => {
    const actor = effectiveOf(false, [asg('r-viewer', 'VIEWER', null), asg('r-ta', 'TENANT_ADMIN', 'root-A')])
    const viewerGlobal = resolveGrantEffective({ roleName: 'VIEWER', roleCodes: codesOf('VIEWER'), knownPermissionCodes: known, tenant: null, global: true })
    const taGlobal = resolveGrantEffective({ roleName: 'CUSTOM', roleCodes: codesOf('TENANT_ADMIN'), knownPermissionCodes: known, tenant: null, global: true })
    const sa = resolveGrantEffective({ roleName: 'SYSTEM_ADMIN', roleCodes: codesOf('SYSTEM_ADMIN'), knownPermissionCodes: known, tenant: null, global: true })
    expect(isWithinCeiling((viewerGlobal as { effective: EffectivePermissions }).effective, actor)).toBe(true)
    expect(isWithinCeiling((taGlobal as { effective: EffectivePermissions }).effective, actor)).toBe(false) // PLATFORM:USER:CREATE etc. exceed the viewer
    expect(isWithinCeiling((sa as { effective: EffectivePermissions }).effective, actor)).toBe(false)
    expect(isWithinCeiling((sa as { effective: EffectivePermissions }).effective, effectiveOf(true, []))).toBe(true)
  })

  it('is deterministic: the same input yields the same decision', () => {
    const input = { actor: effectiveOf(false, [asg('r-ta', 'TENANT_ADMIN', 'root-B')]), roleName: 'TENANT_ADMIN', roleCodes: [], knownPermissionCodes: known, tenant: ROOT_A, global: false }
    const first = evaluateRoleGrantCeiling(input)
    for (let i = 0; i < 5; i++) expect(evaluateRoleGrantCeiling(input)).toEqual(first)
    expect(first).toEqual({ allowed: false, reason: 'PRIVILEGE_CEILING_EXCEEDED' })
  })
})

describe('parity: the model agrees with the REAL PermissionGuard', () => {
  const HEADERS: Array<TenantFacts | null> = [null, ROOT_A, CHILD_A1, ROOT_B, PLATFORM_P]
  const PERMISSIONS = ['PLATFORM:USER:VIEW', 'PLATFORM:USER:CREATE', 'PLATFORM:USER:ASSIGN_ROLE', 'CUSTOMER:ADMIN:MANAGE', 'REPORT:ARTIFACT:VIEW']
  const SCENARIOS: Array<[string, boolean, ActorAssignmentFacts[]]> = [
    ['system-administrator flag', true, []],
    ['no roles', false, []],
    ['global VIEWER', false, [asg('r-viewer', 'VIEWER', null)]],
    ['global TENANT_ADMIN (legacy)', false, [asg('r-ta', 'TENANT_ADMIN', null)]],
    ['TENANT_ADMIN at root A', false, [asg('r-ta', 'TENANT_ADMIN', 'root-A')]],
    ['VIEWER at root A (inert)', false, [asg('r-viewer', 'VIEWER', 'root-A')]],
    ['TENANT_ADMIN at a STANDARD child (inert)', false, [asg('r-ta', 'TENANT_ADMIN', 'child-A1')]],
    ['TENANT_ADMIN at PLATFORM_ROOT', false, [asg('r-ta', 'TENANT_ADMIN', 'platform-P')]],
    ['global VIEWER + TENANT_ADMIN at root B', false, [asg('r-viewer', 'VIEWER', null), asg('r-ta', 'TENANT_ADMIN', 'root-B')]],
  ]

  /** Answers the guard's queries from the same facts. The `customerRootId ?? tenantId` matching of the assignment is asserted statically below. */
  async function guardDecision(isSystemAdmin: boolean, assignments: ActorAssignmentFacts[], permission: string, header: TenantFacts | null) {
    const db = buildMockDb()
    if (!isSystemAdmin) {
      if (permission.startsWith('PLATFORM:')) {
        const codes = assignments.filter(a => a.tenantId === null).flatMap(a => [...(ROLE_CODES.get(a.roleId) ?? [])])
        db.select.mockReturnValueOnce(chain(codes.map(code => ({ code }))))
      } else if (header) {
        db.select.mockReturnValueOnce(chain([{ id: header.id, type: header.type, customerRootId: header.customerRootId }]))
        const rootKey = header.type === 'ROOT' ? header.id : header.customerRootId ?? header.id
        const isTenantAdmin = assignments.some(a => a.roleName === 'TENANT_ADMIN' && a.tenantId === rootKey)
        db.select.mockReturnValueOnce(chain(isTenantAdmin ? [{ id: 'a' }] : []))
        db.select.mockReturnValueOnce(chain([])) // tenantRolePermissions: no management surface, always empty
      }
    }
    const guard = new PermissionGuard(new Reflector(), db as never, { log: jest.fn() } as never)
    const handler = () => undefined
    class Controller {}
    Reflect.defineMetadata(PERMISSION_KEY, permission, handler)
    const context = {
      getHandler: () => handler,
      getClass: () => Controller,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'actor', isSystemAdmin }, headers: header ? { 'x-tenant-id': header.id } : {} }) }),
    }
    try {
      return await guard.canActivate(context as never)
    } catch (error) {
      if (error instanceof ForbiddenException) return false
      throw error
    }
  }

  it.each(SCENARIOS)('%s: model and guard agree on every (permission × header tenant) pair', async (_label, isSystemAdmin, assignments) => {
    const effective = effectiveOf(isSystemAdmin, assignments)
    for (const permission of PERMISSIONS) {
      for (const header of HEADERS) {
        const expected = permits(effective, permission, header)
        expect([permission, header?.id ?? 'none', await guardDecision(isSystemAdmin, assignments, permission, header)]).toEqual([permission, header?.id ?? 'none', expected])
      }
    }
  })

  it('the guard still matches a TENANT_ADMIN assignment against `customerRootId ?? tenantId` and reads PLATFORM:* from GLOBAL assignments only (the two SQL facts the fake DB relies on)', () => {
    const guard = readFileSync(join(__dirname, 'permission.guard.ts'), 'utf8')
    expect(guard).toContain('eq(userSystemRoleAssignments.tenantId, customerRootId ?? tenantId)')
    expect(guard).toContain('isNull(userSystemRoleAssignments.tenantId)')
    expect(guard).toContain('if (tenantAdminAssignment) return true')
  })
})

// ── service ─────────────────────────────────────────────────────────────────

const ADMIN = { id: 'sysadmin-1', status: 'ACTIVE', isSystemAdmin: true }
const PLAIN = { id: 'platform-admin-2', status: 'ACTIVE', isSystemAdmin: false }
const TARGET = { id: 'target-1', email: 'target@example.test', displayName: 'Hedef', status: 'ACTIVE', isSystemAdmin: false, passwordHash: 'placeholder-hash-not-a-real-value', createdAt: new Date(), updatedAt: new Date() }
const tenantRow = (t: TenantFacts, name = 'Acme') => ({ ...t, name, slug: name.toLowerCase() })

function harness() {
  const db = buildMockDb()
  const authService = { hashNewPassword: jest.fn(async () => 'new-hash-placeholder') }
  const audit = { log: jest.fn(async () => undefined) }
  return { db, authService, audit, service: new UserService(db as never, authService as never, audit as never) }
}
type H = ReturnType<typeof harness>
const queue = (h: H, ...rows: unknown[][]) => rows.forEach(r => h.db.select.mockReturnValueOnce(chain(r)))
const entries = (h: H) => h.audit.log.mock.calls.map(call => (call as unknown[])[0] as Record<string, unknown>)
const noMutation = (h: H) => {
  for (const fn of [h.db.insert, h.db.update, h.db.delete, h.db.transaction]) expect(fn).not.toHaveBeenCalled()
  expect(h.authService.hashNewPassword).not.toHaveBeenCalled()
}
const codeOf = (error: unknown) => ((error as ForbiddenException).getResponse() as { code: string }).code
const noCredentials = (value: unknown) => expect(JSON.stringify(value)).not.toMatch(/passwordHash|placeholder-hash|new-hash|Placeholder-Pass|"password"|refreshToken|mfaSecret|otp/i)
const succeedInsert = (h: H) =>
  h.db.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ insert: jest.fn().mockReturnValueOnce(chain([{ id: 'assignment-1' }])), update: jest.fn().mockReturnValue(chain(undefined)) }))
const roleRow = (name: string) => ({ id: `r-${name.toLowerCase()}`, name })

/** Queue for assignRole: actor, user, role, [tenant]. */
const assignQueue = (h: H, actor: Record<string, unknown>, role: { id: string; name: string }, tenant?: TenantFacts) =>
  queue(h, [actor], [TARGET], [role], ...(tenant ? [[tenantRow(tenant)]] : []))

describe('global TENANT_ADMIN boundary', () => {
  it.each([['a non-administrator actor', PLAIN], ['an ACTIVE system administrator', ADMIN]])('%s cannot create a NEW global TENANT_ADMIN: refused before any write, static code, DENIED audit only', async (_label, actor) => {
    const h = harness()
    assignQueue(h, actor, roleRow('TENANT_ADMIN'))
    const error = await h.service.assignRole('target-1', { roleId: 'r-tenant_admin' }, actor.id).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(codeOf(error)).toBe('GLOBAL_TENANT_ADMIN_FORBIDDEN')
    noMutation(h)
    expect(h.db.select).toHaveBeenCalledTimes(3) // actor, user, role — nothing else was read or written
    expect(entries(h)).toEqual([expect.objectContaining({ actionCode: 'SYSTEM_ROLE_GRANTED', metadata: expect.objectContaining({ result: 'DENIED', reason: 'GLOBAL_TENANT_ADMIN_FORBIDDEN' }) })])
    noCredentials([entries(h), error.getResponse()])
  })

  it('an EXISTING global TENANT_ADMIN is never touched automatically and can still be revoked by an ACTIVE system administrator', async () => {
    const h = harness()
    queue(h, [ADMIN], [{ assignment: { id: 'assignment-9', userId: 'target-1', tenantId: null }, roleName: 'TENANT_ADMIN', userEmail: 'target@example.test', userIsSystemAdmin: false }])
    h.db.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ delete: jest.fn().mockReturnValueOnce(chain(undefined)), update: jest.fn() }))
    await expect(h.service.revokeRole('target-1', 'assignment-9', ADMIN.id)).resolves.toEqual({ success: true })
    expect(entries(h)[0]).toMatchObject({ actionCode: 'SYSTEM_ROLE_REVOKED', metadata: expect.objectContaining({ result: 'SUCCESS', roleName: 'TENANT_ADMIN' }) })
  })

  it('a tenant-scoped TENANT_ADMIN for a customer root is still assignable (by a system administrator)', async () => {
    const h = harness()
    assignQueue(h, ADMIN, roleRow('TENANT_ADMIN'), ROOT_A)
    queue(h, [])
    succeedInsert(h)
    await expect(h.service.assignRole('target-1', { roleId: 'r-tenant_admin', tenantId: 'root-A' }, ADMIN.id)).resolves.toMatchObject({ roleName: 'TENANT_ADMIN', tenantId: 'root-A', tenantName: 'Acme' })
  })

  it('no code path deletes or rewrites existing assignments (the service only revokes on explicit request)', () => {
    const source = readFileSync(join(__dirname, 'user.service.ts'), 'utf8')
    const assign = source.slice(source.indexOf('async assignRole'), source.indexOf('async revokeRole'))
    expect(assign).not.toMatch(/\.delete\(|\.update\(userSystemRoleAssignments/)
  })
})

describe('privilege ceiling on tenant-scoped grants (real PermissionGuard semantics)', () => {
  const actorAssignments = (rows: Array<{ roleId: string; roleName: string; tenantId: string | null }>) => rows
  /** After the rules: actor assignments, role permission rows, actor tenant rows (only if the actor has TENANT_ADMIN assignments). */
  const ceilingQueue = (h: H, assignments: Array<{ roleId: string; roleName: string; tenantId: string | null }>, roleRows: Array<{ roleId: string; code: string }>, actorTenants?: TenantFacts[]) =>
    queue(h, actorAssignments(assignments), roleRows, ...(actorTenants ? [actorTenants as unknown[]] : []))

  it('an actor who is TENANT_ADMIN of the SAME root may grant TENANT_ADMIN of that root (target ⊆ actor); success is audited (mandatory)', async () => {
    const h = harness()
    assignQueue(h, PLAIN, roleRow('TENANT_ADMIN'), ROOT_A)
    ceilingQueue(h, [{ roleId: 'r-tenant_admin', roleName: 'TENANT_ADMIN', tenantId: 'root-A' }], [], [ROOT_A])
    queue(h, [])
    succeedInsert(h)
    await expect(h.service.assignRole('target-1', { roleId: 'r-tenant_admin', tenantId: 'root-A' }, PLAIN.id)).resolves.toMatchObject({ roleName: 'TENANT_ADMIN' })
    expect(entries(h)).toEqual([expect.objectContaining({ actorId: PLAIN.id, actionCode: 'SYSTEM_ROLE_GRANTED', metadata: expect.objectContaining({ result: 'SUCCESS', roleName: 'TENANT_ADMIN', tenantId: 'root-A' }) })])
  })

  it.each([
    ['an actor with no roles', [], undefined, ROOT_A],
    ['an actor who is TENANT_ADMIN of ANOTHER root', [{ roleId: 'r-tenant_admin', roleName: 'TENANT_ADMIN', tenantId: 'root-B' }], [ROOT_B], ROOT_A],
    ['an actor whose TENANT_ADMIN sits at a STANDARD child (inert)', [{ roleId: 'r-tenant_admin', roleName: 'TENANT_ADMIN', tenantId: 'child-A1' }], [CHILD_A1], ROOT_A],
  ])('%s cannot grant TENANT_ADMIN of root A (PRIVILEGE_CEILING_EXCEEDED): no write, generic code, DENIED audit', async (_label, assignments, actorTenants, tenant) => {
    const h = harness()
    assignQueue(h, PLAIN, roleRow('TENANT_ADMIN'), tenant)
    ceilingQueue(h, assignments as never, [], actorTenants as TenantFacts[] | undefined)
    const error = await h.service.assignRole('target-1', { roleId: 'r-tenant_admin', tenantId: 'root-A' }, PLAIN.id).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(codeOf(error)).toBe('PRIVILEGE_CHANGE_DENIED')
    noMutation(h)
    expect(entries(h)).toEqual([expect.objectContaining({ metadata: expect.objectContaining({ result: 'DENIED', reason: 'PRIVILEGE_CEILING_EXCEEDED' }) })])
    noCredentials([entries(h), error.getResponse()])
  })

  it('a role that is inert at tenant scope (VIEWER at a tenant) is at or below any actor’s set and remains assignable (existing behaviour)', async () => {
    const h = harness()
    assignQueue(h, PLAIN, roleRow('VIEWER'), CHILD_A1)
    ceilingQueue(h, [], [{ roleId: 'r-viewer', code: 'PLATFORM:USER:VIEW' }])
    queue(h, [])
    succeedInsert(h)
    await expect(h.service.assignRole('target-1', { roleId: 'r-viewer', tenantId: 'child-A1' }, PLAIN.id)).resolves.toMatchObject({ roleName: 'VIEWER' })
  })

  it('TENANT_ADMIN at a STANDARD child is inert (guard never matches it) and stays assignable', async () => {
    const h = harness()
    assignQueue(h, PLAIN, roleRow('TENANT_ADMIN'), CHILD_A1)
    ceilingQueue(h, [], [])
    queue(h, [])
    succeedInsert(h)
    await expect(h.service.assignRole('target-1', { roleId: 'r-tenant_admin', tenantId: 'child-A1' }, PLAIN.id)).resolves.toMatchObject({ tenantId: 'child-A1' })
  })

  it('SYSTEM_ADMIN can never be granted by a non-administrator (rule and ceiling agree)', async () => {
    const h = harness()
    assignQueue(h, PLAIN, roleRow('SYSTEM_ADMIN'))
    const error = await h.service.assignRole('target-1', { roleId: 'r-system_admin' }, PLAIN.id).catch(e => e)
    expect(codeOf(error)).toBe('PRIVILEGE_CHANGE_DENIED')
    noMutation(h)
  })

  it('an ACTIVE system administrator’s global role operations keep working under the existing rule (ceiling = everything)', async () => {
    const h = harness()
    assignQueue(h, ADMIN, roleRow('VIEWER'))
    queue(h, [])
    succeedInsert(h)
    await expect(h.service.assignRole('target-1', { roleId: 'r-viewer' }, ADMIN.id)).resolves.toMatchObject({ roleName: 'VIEWER', tenantId: null })
    expect(h.db.select).toHaveBeenCalledTimes(4) // actor, user, role, duplicate check — no ceiling queries for the flag
  })
})

describe('fail-closed on unknown role, scope or permission', () => {
  it('an unknown role is a 404 before any write (no oracle beyond existence of the role id)', async () => {
    const h = harness()
    queue(h, [ADMIN], [TARGET], [])
    expect(await h.service.assignRole('target-1', { roleId: 'ghost-role' }, ADMIN.id).catch(e => e)).toBeInstanceOf(NotFoundException)
    noMutation(h)
    expect(h.audit.log).not.toHaveBeenCalled()
  })

  it('an unknown tenant scope is a 404 BEFORE any write (previously it only failed on the foreign key)', async () => {
    const h = harness()
    queue(h, [ADMIN], [TARGET], [roleRow('VIEWER')], [])
    expect(await h.service.assignRole('target-1', { roleId: 'r-viewer', tenantId: 'ghost-tenant' }, ADMIN.id).catch(e => e)).toBeInstanceOf(NotFoundException)
    noMutation(h)
  })

  it('a tenant of an unknown TYPE fails closed with the ceiling refusal UNKNOWN_SCOPE', async () => {
    const h = harness()
    assignQueue(h, PLAIN, roleRow('VIEWER'), { id: 'weird', type: 'WEIRD', customerRootId: null })
    queue(h, [], [{ roleId: 'r-viewer', code: 'PLATFORM:USER:VIEW' }])
    const error = await h.service.assignRole('target-1', { roleId: 'r-viewer', tenantId: 'weird' }, PLAIN.id).catch(e => e)
    expect(codeOf(error)).toBe('PRIVILEGE_CHANGE_DENIED')
    noMutation(h)
    expect(entries(h)[0]).toMatchObject({ metadata: expect.objectContaining({ reason: 'UNKNOWN_SCOPE' }) })
  })

  it('a role that holds a permission code outside the catalogue fails closed (UNKNOWN_PERMISSION)', async () => {
    const h = harness()
    assignQueue(h, PLAIN, roleRow('CUSTOM'), ROOT_A)
    queue(h, [], [{ roleId: 'r-custom', code: 'PLATFORM:MADE:UP' }])
    const error = await h.service.assignRole('target-1', { roleId: 'r-custom', tenantId: 'root-A' }, PLAIN.id).catch(e => e)
    expect(codeOf(error)).toBe('PRIVILEGE_CHANGE_DENIED')
    noMutation(h)
    expect(entries(h)[0]).toMatchObject({ metadata: expect.objectContaining({ reason: 'UNKNOWN_PERMISSION' }) })
  })
})

describe('order, audit and determinism', () => {
  it('validation is pure and first; the impersonation refusal precedes every database read; the actor is read before the target', async () => {
    const h = harness()
    expect((await h.service.assignRole('target-1', { roleId: '' } as never, PLAIN.id).catch(e => e)).getStatus()).toBe(400)
    expect(h.db.select).not.toHaveBeenCalled()
    const imp = await h.service.assignRole('target-1', { roleId: 'r-viewer' }, PLAIN.id, { impersonation: true, impersonatorUserId: 'imp-1' }).catch(e => e)
    expect(codeOf(imp)).toBe('IMPERSONATION_PRIVILEGE_CHANGE_FORBIDDEN')
    expect(h.db.select).not.toHaveBeenCalled()
    noMutation(h)
  })

  it('an unauthorised (inactive) actor learns nothing about the target or role: one generic refusal after a single read', async () => {
    const h = harness()
    queue(h, [{ ...PLAIN, status: 'LOCKED' }])
    const error = await h.service.assignRole('target-1', { roleId: 'r-system_admin' }, PLAIN.id).catch(e => e)
    expect(codeOf(error)).toBe('PRIVILEGE_CHANGE_DENIED')
    expect(h.db.select).toHaveBeenCalledTimes(1)
    noMutation(h)
    const same = harness()
    queue(same, [{ ...PLAIN, status: 'LOCKED' }])
    const other = await same.service.assignRole('someone-else', { roleId: 'r-viewer', tenantId: 'root-A' }, PLAIN.id).catch(e => e)
    expect((other as ForbiddenException).getResponse()).toEqual(error.getResponse())
  })

  it('the success audit is mandatory: an audit failure after the write surfaces (it is never swallowed) while a denial audit failure never changes the refusal', async () => {
    const h = harness()
    assignQueue(h, ADMIN, roleRow('VIEWER'))
    queue(h, [])
    succeedInsert(h)
    h.audit.log.mockRejectedValue(new Error('audit down'))
    expect(await h.service.assignRole('target-1', { roleId: 'r-viewer' }, ADMIN.id).catch(e => e)).toEqual(new Error('audit down'))

    const d = harness()
    d.audit.log.mockRejectedValue(new Error('audit down'))
    assignQueue(d, ADMIN, roleRow('TENANT_ADMIN'))
    expect(await d.service.assignRole('target-1', { roleId: 'r-tenant_admin' }, ADMIN.id).catch(e => e)).toBeInstanceOf(ForbiddenException)
    noMutation(d)
  })

  it('responses and audit metadata never carry a password, hash, token or OTP', async () => {
    const h = harness()
    assignQueue(h, ADMIN, roleRow('VIEWER'))
    queue(h, [])
    succeedInsert(h)
    const result = await h.service.assignRole('target-1', { roleId: 'r-viewer' }, ADMIN.id)
    noCredentials([result, entries(h)])
  })

  it('the same input produces the same decision and reason on repeated runs', async () => {
    const outcomes: string[] = []
    for (let i = 0; i < 3; i++) {
      const h = harness()
      assignQueue(h, PLAIN, roleRow('TENANT_ADMIN'), ROOT_A)
      queue(h, [], [])
      const error = await h.service.assignRole('target-1', { roleId: 'r-tenant_admin', tenantId: 'root-A' }, PLAIN.id).catch(e => e)
      outcomes.push(`${codeOf(error)}|${(entries(h)[0]?.['metadata'] as { reason: string }).reason}`)
    }
    expect(new Set(outcomes).size).toBe(1)
  })
})

describe('MFA admin reset in an impersonation session', () => {
  function mfa() {
    const db = buildMockDb()
    const audit = { log: jest.fn(async () => undefined) }
    const service = new MfaService(db as never, {} as never, {} as never, {} as never, audit as never)
    return { db, audit, service }
  }

  it('is refused before any lookup or write; only a best-effort DENIED audit is recorded; no target detail leaks', async () => {
    const { db, audit, service } = mfa()
    const error = await service.adminResetMfa(ADMIN.id, null, 'target-1', { impersonation: true, impersonatorUserId: 'imp-1' }).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(codeOf(error)).toBe('IMPERSONATION_PRIVILEGE_CHANGE_FORBIDDEN')
    expect(JSON.stringify(error.getResponse())).not.toMatch(/target-1|imp-1/)
    for (const fn of [db.select, db.insert, db.update, db.delete, db.transaction]) expect(fn).not.toHaveBeenCalled()
    expect(audit.log).toHaveBeenCalledTimes(1)
    expect((audit.log.mock.calls[0] as unknown[])?.[0]).toMatchObject({ actionCode: 'MFA_ADMIN_RESET', metadata: { result: 'DENIED', reason: 'IMPERSONATION_SESSION', impersonatorUserId: 'imp-1' } })
  })

  it('an audit outage cannot turn the refusal into anything else', async () => {
    const { audit, service } = mfa()
    audit.log.mockRejectedValue(new Error('audit down'))
    expect(await service.adminResetMfa(ADMIN.id, null, 'target-1', { impersonation: true }).catch(e => e)).toBeInstanceOf(ForbiddenException)
  })

  it('the controller passes the session flags, and the TASK-027.40-R1 authorisation is unchanged for ordinary sessions', () => {
    const controller = readFileSync(join(__dirname, 'mfa.controller.ts'), 'utf8')
    expect(controller).toContain('impersonation: admin.impersonation === true')
    expect(controller).toContain('if (!admin.isSystemAdmin) throw new ForbiddenException')
    expect(readFileSync(join(__dirname, 'mfa.service.ts'), 'utf8')).toContain("actor.status !== 'ACTIVE' || !actor.isSystemAdmin")
  })
})

describe('scope of this task and static guarantees', () => {
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const user = strip(readFileSync(join(__dirname, 'user.service.ts'), 'utf8'))
  const ceiling = strip(readFileSync(join(__dirname, 'domain', 'privilege-ceiling.domain.ts'), 'utf8'))

  it('the ceiling model is pure: no database, ORM, logging, env or I/O', () => {
    expect(ceiling).not.toMatch(/drizzle|@nestjs|process\.env|console\.|Logger|readFile|fetch\(/)
  })

  it('the new rules add no permission, no role, no route and no peer/MFA/tenant-delegation behaviour', () => {
    expect(user).not.toMatch(/PLATFORM:[A-Z_:]+'/) // no permission literal introduced in the service
    const controller = readFileSync(join(__dirname, 'user.controller.ts'), 'utf8')
    expect((controller.match(/@(Get|Post|Patch|Delete|Put)\(/g) ?? []).length).toBe(14)
    expect(user).not.toMatch(/mfaVerified|MfaEnforcement|breakGlass|break-glass/i)
  })

  it('peer system administrators are still NOT restricted here: a system-administrator actor passes the target rule for a system-administrator target', () => {
    const start = user.indexOf('private async assertTargetRules')
    const rules = user.slice(start, user.indexOf('private async assertWithinPrivilegeCeiling', start))
    expect(rules).toContain('target.isSystemAdmin && !actor.isSystemAdmin')
    expect(rules).not.toMatch(/target\.isSystemAdmin\s*&&\s*actor\.isSystemAdmin/)
  })

  it('the read-only privilege report of TASK-027.45 is untouched and still lists global TENANT_ADMIN assignments', async () => {
    const { analyzePrivilegeSnapshot } = await import('./privilege/privilege-report.domain')
    const report = analyzePrivilegeSnapshot({
      users: [{ id: 'u1', status: 'ACTIVE', isSystemAdmin: false }],
      roles: [{ id: 'r-ta', name: 'TENANT_ADMIN' }],
      assignments: [{ id: 'a1', userId: 'u1', roleId: 'r-ta', tenantId: null }],
      tenants: [],
    })
    expect(report.driftByCategory.GLOBAL_TENANT_ADMIN).toBe(1)
    expect(report.effect).toBe('REPORT_ONLY')
  })
})
