import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { BUILTIN_PERMISSIONS } from './domain/system-role.domain'
import { UserController } from './user.controller'
import { UserService } from './user.service'

/**
 * TASK-027.42 (F4) + TASK-027.46 order — platform user-admin privilege boundary. Mock-only: no database, HTTP or MFA
 * provider; every credential value is a fabricated placeholder.
 *
 * Check order (TASK-027.46): route permission → pure input/ID validation → impersonation refusal → actor re-read
 * (ACTIVE) → target/role/scope resolution → target rules → ceiling → hash → mutation → mandatory success audit.
 * The select queue of every test therefore starts with the ACTOR row.
 */
const PASSWORD = 'Aa1-Placeholder-Pass'
const NEW_HASH = 'new-hash-placeholder'
const HASH = 'placeholder-hash-not-a-real-value'

const ADMIN = { id: 'sysadmin-1', status: 'ACTIVE', isSystemAdmin: true }
const PLAIN = { id: 'platform-admin-2', status: 'ACTIVE', isSystemAdmin: false }
const target = (over: Record<string, unknown> = {}) => ({
  id: 'target-1', email: 'target@example.test', displayName: 'Hedef Kişi', status: 'ACTIVE', isSystemAdmin: false,
  passwordHash: HASH, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), ...over,
})
const SYSADMIN_TARGET = target({ id: 'sysadmin-target', email: 'root@example.test', isSystemAdmin: true })

function harness() {
  const db = buildMockDb()
  const authService = { hashNewPassword: jest.fn(async () => NEW_HASH) }
  const audit = { log: jest.fn(async () => undefined) }
  const service = new UserService(db as never, authService as never, audit as never)
  return { db, authService, audit, service }
}
type H = ReturnType<typeof harness>

/** Queue selects in call order. */
const queue = (h: H, ...rows: unknown[][]) => rows.forEach(r => h.db.select.mockReturnValueOnce(chain(r)))

const noMutation = (h: H) => {
  for (const fn of [h.db.insert, h.db.update, h.db.delete, h.db.transaction]) expect(fn).not.toHaveBeenCalled()
  expect(h.authService.hashNewPassword).not.toHaveBeenCalled()
}
const entries = (h: H) => h.audit.log.mock.calls.map(call => (call as unknown[])[0] as Record<string, unknown>)
const noCredentialText = (value: unknown) => expect(JSON.stringify(value)).not.toMatch(/passwordHash|placeholder-hash|new-hash-placeholder|Placeholder-Pass|"password"|refreshToken|mfaSecret|otp/i)
const denied = (h: H, action: string, reason: string, extra: Record<string, unknown> = {}) =>
  expect(entries(h)).toEqual([expect.objectContaining({ actionCode: action, metadata: expect.objectContaining({ result: 'DENIED', reason, ...extra }) })])
const codeOf = (error: unknown) => (error as ForbiddenException).getResponse() as { code: string; message: string }

describe('F4 — password reset', () => {
  it('no actor — not even another system administrator — can reset a system-administrator target’s password (TASK-027.47, Model B: peer credential restriction)', async () => {
    for (const actor of [PLAIN, ADMIN]) {
      const h = harness()
      queue(h, [actor], [SYSADMIN_TARGET])
      const error = await h.service.setPassword('sysadmin-target', PASSWORD, actor.id).catch(e => e)
      expect(error).toBeInstanceOf(ForbiddenException)
      expect(codeOf(error).code).toBe('PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED')
      noMutation(h)
      denied(h, 'USER_PASSWORD_RESET', 'PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED', { targetUserId: 'sysadmin-target' })
      noCredentialText(entries(h))
      noCredentialText(error.getResponse())
    }
  })

  it('a non-admin platform administrator keeps the existing ability to reset an ordinary user’s password, and the target’s sessions are revoked', async () => {
    const h = harness()
    queue(h, [PLAIN], [target()])
    const passwordUpdate = chain(undefined)
    const sessionUpdate = chain(undefined)
    h.db.update.mockReturnValueOnce(passwordUpdate).mockReturnValueOnce(sessionUpdate)
    await expect(h.service.setPassword('target-1', PASSWORD, PLAIN.id)).resolves.toEqual({ success: true })
    expect(passwordUpdate.set).toHaveBeenCalledWith({ passwordHash: NEW_HASH })
    expect(sessionUpdate.set).toHaveBeenCalledWith({ isRevoked: true })
  })

  it('the self-change prohibition is kept and audited', async () => {
    const h = harness()
    queue(h, [ADMIN], [target({ id: ADMIN.id, isSystemAdmin: true })])
    expect(await h.service.setPassword(ADMIN.id, PASSWORD, ADMIN.id).catch(e => e)).toBeInstanceOf(ForbiddenException)
    noMutation(h)
    denied(h, 'USER_PASSWORD_RESET', 'SELF_CHANGE')
  })

  it.each([['an unknown actor', []], ['an inactive actor', [{ ...PLAIN, status: 'INACTIVE' }]], ['a locked actor', [{ ...ADMIN, status: 'LOCKED' }]]])('%s is refused first (fail closed): no target lookup at all', async (_label, actorRows) => {
    const h = harness()
    queue(h, actorRows)
    expect(await h.service.setPassword('target-1', PASSWORD, 'ghost').catch(e => e)).toBeInstanceOf(ForbiddenException)
    expect(h.db.select).toHaveBeenCalledTimes(1)
    noMutation(h)
    denied(h, 'USER_PASSWORD_RESET', 'ACTOR_NOT_ACTIVE')
  })

  it('a missing actor id is refused without any database read', async () => {
    const h = harness()
    expect(await h.service.update('target-1', { displayName: 'Yeni Ad' }, undefined).catch(e => e)).toBeInstanceOf(ForbiddenException)
    expect(h.db.select).not.toHaveBeenCalled()
    noMutation(h)
  })

  it('an unknown target is a plain 404 after the actor check, with no hash, write or audit', async () => {
    const h = harness()
    queue(h, [PLAIN], [])
    expect(await h.service.setPassword('missing', PASSWORD, PLAIN.id).catch(e => e)).toBeInstanceOf(NotFoundException)
    expect(h.db.select).toHaveBeenCalledTimes(2)
    noMutation(h)
    expect(h.audit.log).not.toHaveBeenCalled()
  })

  it('a write failure is audited as FAILED and rethrown; an audit outage never changes a refusal', async () => {
    const h = harness()
    queue(h, [PLAIN], [target()])
    h.db.update.mockImplementationOnce(() => { throw new Error('db down') })
    expect(await h.service.setPassword('target-1', PASSWORD, PLAIN.id).catch(e => e)).toEqual(new Error('db down'))
    expect(entries(h)[0]).toMatchObject({ metadata: expect.objectContaining({ result: 'FAILED', reason: 'ERROR' }) })
    noCredentialText(entries(h))

    const h2 = harness()
    h2.audit.log.mockRejectedValue(new Error('audit down'))
    queue(h2, [PLAIN], [SYSADMIN_TARGET])
    expect(await h2.service.setPassword('sysadmin-target', PASSWORD, PLAIN.id).catch(e => e)).toBeInstanceOf(ForbiddenException)
    noMutation(h2)
  })

  it('pure validation stays first and is side-effect free: a weak password is a 400 before any lookup', async () => {
    const h = harness()
    expect((await h.service.setPassword('target-1', 'weak', PLAIN.id).catch(e => e)).getStatus()).toBe(400)
    expect(h.db.select).not.toHaveBeenCalled()
    noMutation(h)
  })
})

describe('F4 — SYSTEM_ADMIN and global role changes', () => {
  const role = (name: string, id = `role-${name.toLowerCase()}`) => ({ id, name })
  /** actor, target user, role [, tenant] */
  const sequence = (h: H, actor: Record<string, unknown>, roleRow: Record<string, unknown>, user = target(), tenant?: Record<string, unknown>) =>
    queue(h, [actor], [user], [roleRow], ...(tenant ? [[tenant]] : []))
  const ROOT = { id: 'root-A', type: 'ROOT', customerRootId: null, name: 'Acme', slug: 'acme' }

  it('an actor who is not a system administrator cannot grant SYSTEM_ADMIN — to anyone, including themselves', async () => {
    for (const userId of ['target-1', PLAIN.id]) {
      const h = harness()
      sequence(h, PLAIN, role('SYSTEM_ADMIN'), target({ id: userId }))
      const error = await h.service.assignRole(userId, { roleId: 'role-system_admin' }, PLAIN.id).catch(e => e)
      expect(error).toBeInstanceOf(ForbiddenException)
      expect(codeOf(error).code).toBe('PRIVILEGE_CHANGE_DENIED')
      noMutation(h)
      denied(h, 'SYSTEM_ROLE_GRANTED', 'GLOBAL_ROLE_CHANGE_REQUIRES_SYSTEM_ADMIN', { targetUserId: userId })
    }
  })

  it('a NEW global TENANT_ADMIN is refused for every actor with its own static code (see the ceiling spec for the full matrix)', async () => {
    const h = harness()
    sequence(h, PLAIN, role('TENANT_ADMIN'))
    const error = await h.service.assignRole('target-1', { roleId: 'role-tenant_admin' }, PLAIN.id).catch(e => e)
    expect(codeOf(error).code).toBe('GLOBAL_TENANT_ADMIN_FORBIDDEN')
    noMutation(h)
    denied(h, 'SYSTEM_ROLE_GRANTED', 'GLOBAL_TENANT_ADMIN_FORBIDDEN')
  })

  it('a tenant-scoped grant of a role that is inert at tenant scope (e.g. VIEWER) by a non-admin keeps working; success is audited', async () => {
    const h = harness()
    sequence(h, PLAIN, role('VIEWER'), target(), ROOT)
    queue(h, [], [{ roleId: 'role-viewer', code: 'PLATFORM:USER:VIEW' }] as unknown[], []) // actor assignments, role permission rows, existing-assignment check
    // ceiling reads: actor assignments ([]) then role permission rows; then the duplicate check
    h.db.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ insert: jest.fn().mockReturnValueOnce(chain([{ id: 'assignment-1' }])), update: jest.fn() }))
    await expect(h.service.assignRole('target-1', { roleId: 'role-viewer', tenantId: 'root-A' }, PLAIN.id)).resolves.toMatchObject({ roleName: 'VIEWER', tenantId: 'root-A', tenantName: 'Acme' })
    expect(entries(h)[0]).toMatchObject({ actionCode: 'SYSTEM_ROLE_GRANTED', metadata: expect.objectContaining({ result: 'SUCCESS', targetUserId: 'target-1' }) })
  })

  it('a system administrator may grant SYSTEM_ADMIN to another user (flips isSystemAdmin) and it is audited', async () => {
    const h = harness()
    sequence(h, ADMIN, role('SYSTEM_ADMIN'))
    queue(h, [])
    const flip = chain(undefined)
    h.db.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ insert: jest.fn().mockReturnValueOnce(chain([{ id: 'assignment-1' }])), update: jest.fn().mockReturnValueOnce(flip) }))
    const result = await h.service.assignRole('target-1', { roleId: 'role-system_admin' }, ADMIN.id)
    expect(flip.set).toHaveBeenCalledWith({ isSystemAdmin: true })
    expect(entries(h)[0]).toMatchObject({ actorId: ADMIN.id, actionCode: 'SYSTEM_ROLE_GRANTED', metadata: expect.objectContaining({ result: 'SUCCESS', roleName: 'SYSTEM_ADMIN', targetUserId: 'target-1' }) })
    noCredentialText(result)
    noCredentialText(entries(h))
  })

  it('no actor — not even another system administrator — may assign ANY role to a system-administrator target (TASK-027.47, Model B)', async () => {
    for (const actor of [PLAIN, ADMIN]) {
      const h = harness()
      sequence(h, actor, role('VIEWER'), SYSADMIN_TARGET, ROOT)
      const error = await h.service.assignRole('sysadmin-target', { roleId: 'role-viewer', tenantId: 'root-A' }, actor.id).catch(e => e)
      expect(error).toBeInstanceOf(ForbiddenException)
      expect(codeOf(error).code).toBe('PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED')
      noMutation(h)
      denied(h, 'SYSTEM_ROLE_GRANTED', 'PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED')
    }
  })

  const assignment = (over: Record<string, unknown> = {}) => ({
    assignment: { id: 'assignment-1', userId: 'target-1', tenantId: null, ...over }, roleName: 'SYSTEM_ADMIN', userEmail: 'target@example.test', userIsSystemAdmin: true,
  })

  it('a non-admin cannot revoke SYSTEM_ADMIN or any global role', async () => {
    for (const row of [assignment(), { ...assignment(), roleName: 'VIEWER', userIsSystemAdmin: false }, { ...assignment(), roleName: 'TENANT_ADMIN', userIsSystemAdmin: false }]) {
      const h = harness()
      queue(h, [PLAIN], [row])
      expect(await h.service.revokeRole('target-1', 'assignment-1', PLAIN.id).catch(e => e)).toBeInstanceOf(ForbiddenException)
      noMutation(h)
      expect(entries(h)[0]).toMatchObject({ actionCode: 'SYSTEM_ROLE_REVOKED', metadata: expect.objectContaining({ result: 'DENIED' }) })
    }
  })

  it('no actor — not even another system administrator — may revoke a system-administrator target’s global SYSTEM_ADMIN role (TASK-027.47, Model B); an existing global TENANT_ADMIN is unaffected (nothing is auto-deleted; the target there is not a system administrator) and stays revocable', async () => {
    const h = harness()
    queue(h, [ADMIN], [assignment()])
    const error = await h.service.revokeRole('target-1', 'assignment-1', ADMIN.id).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(codeOf(error).code).toBe('PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED')
    noMutation(h)
    denied(h, 'SYSTEM_ROLE_REVOKED', 'PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED')

    const ta = harness()
    queue(ta, [ADMIN], [{ ...assignment(), roleName: 'TENANT_ADMIN', userIsSystemAdmin: false }])
    ta.db.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ delete: jest.fn().mockReturnValueOnce(chain(undefined)), update: jest.fn() }))
    await expect(ta.service.revokeRole('target-1', 'assignment-1', ADMIN.id)).resolves.toEqual({ success: true })
  })

  it('the last-SYSTEM_ADMIN guard is still reachable as defence-in-depth for a bayrak↔rol drift (TASK-027.45): a flag=false target with a canonical global SYSTEM_ADMIN assignment is not caught by the peer restriction, so the count check still applies', async () => {
    const drifted = { ...assignment(), userIsSystemAdmin: false } // canonical role present, flag drifted false
    const h = harness()
    queue(h, [ADMIN], [drifted], [{ id: 'a1' }, { id: 'a2' }])
    const del = chain(undefined)
    h.db.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ delete: jest.fn().mockReturnValueOnce(del), update: jest.fn().mockReturnValueOnce(chain(undefined)) }))
    await expect(h.service.revokeRole('target-1', 'assignment-1', ADMIN.id)).resolves.toEqual({ success: true })
    expect(entries(h)[0]).toMatchObject({ actionCode: 'SYSTEM_ROLE_REVOKED', metadata: expect.objectContaining({ result: 'SUCCESS' }) })

    const last = harness()
    queue(last, [ADMIN], [drifted], [{ id: 'a1' }])
    expect(await last.service.revokeRole('target-1', 'assignment-1', ADMIN.id).catch(e => e)).toBeInstanceOf(ForbiddenException)
    noMutation(last)
  })

  it('a non-admin keeps the ability to revoke a tenant-scoped role of an ordinary user', async () => {
    const h = harness()
    queue(h, [PLAIN], [{ ...assignment({ tenantId: 'tenant-1' }), roleName: 'TENANT_ADMIN', userIsSystemAdmin: false }])
    h.db.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ delete: jest.fn().mockReturnValueOnce(chain(undefined)), update: jest.fn() }))
    await expect(h.service.revokeRole('target-1', 'assignment-1', PLAIN.id)).resolves.toEqual({ success: true })
  })

  it('tenant users cannot reach platform privilege: PLATFORM:* is evaluated from GLOBAL assignments only, and only a system administrator can create those', () => {
    const guard = readFileSync(join(__dirname, 'permission.guard.ts'), 'utf8')
    const platformBranch = guard.slice(guard.indexOf("required.startsWith('PLATFORM:')"), guard.indexOf('} else if (tenantId)'))
    expect(platformBranch).toContain('isNull(userSystemRoleAssignments.tenantId)')
  })
})

describe('F4 — update, deactivation and membership administration', () => {
  it.each([
    ['update', (h: H) => h.service.update('sysadmin-target', { displayName: 'Yeni Ad' }, PLAIN.id), 'USER_UPDATED'],
    ['deactivate', (h: H) => h.service.deactivate('sysadmin-target', PLAIN.id), 'USER_DEACTIVATED'],
    ['addMembership', (h: H) => h.service.addMembership('sysadmin-target', 'tenant-1', PLAIN.id), 'TENANT_MEMBERSHIP_ADDED'],
  ])('%s of a system-administrator target by a non-admin is refused before any mutation', async (_label, call, action) => {
    const h = harness()
    queue(h, [PLAIN], [SYSADMIN_TARGET])
    expect(await call(h).catch(e => e)).toBeInstanceOf(ForbiddenException)
    noMutation(h)
    denied(h, action, 'TARGET_IS_SYSTEM_ADMIN')
  })

  it('removeMembership of a system-administrator target by a non-admin is refused', async () => {
    const h = harness()
    queue(h, [PLAIN], [{ membership: { id: 'm1', userId: 'sysadmin-target', tenantId: 't1' }, userEmail: 'root@example.test', userIsSystemAdmin: true, tenantName: 'Acme' }])
    expect(await h.service.removeMembership('sysadmin-target', 'm1', PLAIN.id).catch(e => e)).toBeInstanceOf(ForbiddenException)
    noMutation(h)
    denied(h, 'TENANT_MEMBERSHIP_REMOVED', 'TARGET_IS_SYSTEM_ADMIN')
  })

  it('a system administrator keeps update/deactivate rights over another system administrator and self/last-admin guards remain', async () => {
    const upd = harness()
    queue(upd, [ADMIN], [SYSADMIN_TARGET])
    upd.db.update.mockReturnValueOnce(chain([{ ...SYSADMIN_TARGET, displayName: 'Yeni Ad' }]))
    const view = await upd.service.update('sysadmin-target', { displayName: 'Yeni Ad' }, ADMIN.id)
    noCredentialText(view)
    expect(entries(upd)[0]).toMatchObject({ actionCode: 'USER_UPDATED', metadata: expect.objectContaining({ result: 'SUCCESS', afterDisplayName: 'Yeni Ad' }) })

    const self = harness()
    queue(self, [ADMIN], [{ ...SYSADMIN_TARGET, id: ADMIN.id }], [{ count: 2 }])
    expect(await self.service.deactivate(ADMIN.id, ADMIN.id).catch(e => e)).toBeInstanceOf(ForbiddenException)
    noMutation(self)

    const lastAdmin = harness()
    queue(lastAdmin, [ADMIN], [SYSADMIN_TARGET], [{ count: 1 }])
    expect(await lastAdmin.service.deactivate('sysadmin-target', ADMIN.id).catch(e => e)).toBeInstanceOf(ForbiddenException)
    noMutation(lastAdmin)
  })

  it('a non-admin still administers ordinary users (existing behaviour preserved) and only safe views come back', async () => {
    const h = harness()
    queue(h, [PLAIN], [target()])
    h.db.update.mockReturnValueOnce(chain([target({ status: 'INACTIVE' })]))
    const view = await h.service.deactivate('target-1', PLAIN.id)
    expect(view).toMatchObject({ id: 'target-1', status: 'INACTIVE' })
    noCredentialText(view)
  })

  it('an unrelated conflict does not leak the privilege state: a non-admin gets 403 for a system administrator even when it is already inactive', async () => {
    const h = harness()
    queue(h, [PLAIN], [{ ...SYSADMIN_TARGET, status: 'INACTIVE' }])
    const error = await h.service.deactivate('sysadmin-target', PLAIN.id).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(error).not.toBeInstanceOf(ConflictException)
  })
})

describe('impersonation adds no privilege (TASK-027.46: privilege and credential operations are refused outright)', () => {
  const IMP = { impersonation: true, impersonatorUserId: ADMIN.id }

  it.each([
    ['setPassword', (h: H) => h.service.setPassword('target-1', PASSWORD, PLAIN.id, IMP), 'USER_PASSWORD_RESET'],
    ['deactivate', (h: H) => h.service.deactivate('target-1', PLAIN.id, IMP), 'USER_DEACTIVATED'],
    ['assignRole', (h: H) => h.service.assignRole('target-1', { roleId: 'role-viewer' }, PLAIN.id, IMP), 'SYSTEM_ROLE_GRANTED'],
    ['revokeRole', (h: H) => h.service.revokeRole('target-1', 'assignment-1', PLAIN.id, IMP), 'SYSTEM_ROLE_REVOKED'],
    ['addMembership', (h: H) => h.service.addMembership('target-1', 'tenant-1', PLAIN.id, IMP), 'TENANT_MEMBERSHIP_ADDED'],
    ['removeMembership', (h: H) => h.service.removeMembership('target-1', 'm1', PLAIN.id, IMP), 'TENANT_MEMBERSHIP_REMOVED'],
  ])('%s is refused in an impersonation session before ANY database read, with a static code and a best-effort DENIED audit', async (_label, call, action) => {
    const h = harness()
    const error = await call(h).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(codeOf(error)).toEqual({ code: 'IMPERSONATION_PRIVILEGE_CHANGE_FORBIDDEN', message: expect.any(String) })
    expect(JSON.stringify(error.getResponse())).not.toMatch(/target-1|role-viewer|assignment-1|sysadmin|passw/i)
    expect(h.db.select).not.toHaveBeenCalled()
    noMutation(h)
    denied(h, action, 'IMPERSONATION_SESSION', { impersonatorUserId: ADMIN.id })
    noCredentialText(entries(h))
  })

  it('the refusal applies even when the impersonated session subject is a system administrator', async () => {
    const h = harness()
    expect(await h.service.setPassword('target-1', PASSWORD, ADMIN.id, IMP).catch(e => e)).toBeInstanceOf(ForbiddenException)
    expect(h.db.select).not.toHaveBeenCalled()
    noMutation(h)
  })

  it('an impersonation flag without an impersonator id (or the reverse) is still refused (fail closed)', async () => {
    for (const context of [{ impersonation: true }, { impersonatorUserId: 'imp-1' }]) {
      const h = harness()
      expect(await h.service.deactivate('target-1', PLAIN.id, context).catch(e => e)).toBeInstanceOf(ForbiddenException)
      expect(h.db.select).not.toHaveBeenCalled()
    }
  })

  it('a refusal audit outage still refuses (audit is best-effort for denials)', async () => {
    const h = harness()
    h.audit.log.mockRejectedValue(new Error('audit down'))
    expect(await h.service.setPassword('target-1', PASSWORD, PLAIN.id, IMP).catch(e => e)).toBeInstanceOf(ForbiddenException)
    noMutation(h)
  })

  it('operations that are NOT privilege/credential changes (display-name update) keep working and record the impersonator', async () => {
    const h = harness()
    queue(h, [PLAIN], [target()])
    h.db.update.mockReturnValueOnce(chain([target({ displayName: 'Yeni Ad' })]))
    await h.service.update('target-1', { displayName: 'Yeni Ad' }, PLAIN.id, IMP)
    expect(entries(h)[0]?.['metadata']).toMatchObject({ result: 'SUCCESS', impersonatorUserId: ADMIN.id })
  })

  it('ordinary sessions do not carry an impersonator in the success audit', async () => {
    const plain = harness()
    queue(plain, [PLAIN], [target()])
    plain.db.update.mockReturnValueOnce(chain(undefined)).mockReturnValueOnce(chain(undefined))
    await plain.service.setPassword('target-1', PASSWORD, PLAIN.id)
    expect(entries(plain)[0]?.['metadata']).not.toHaveProperty('impersonatorUserId')
  })

  it('the controller forwards the session (impersonation flag and impersonator id) as context for all seven mutations', async () => {
    const svc = { update: jest.fn(), setPassword: jest.fn(), deactivate: jest.fn(), assignRole: jest.fn(), revokeRole: jest.fn(), addMembership: jest.fn(), removeMembership: jest.fn() }
    const controller = new UserController(svc as never)
    const user = { id: PLAIN.id, impersonatorUserId: 'imp-1', impersonation: true }
    const context = { impersonatorUserId: 'imp-1', impersonation: true }
    await controller.update('t', { displayName: 'Ad Soyad' }, user)
    await controller.setPassword('t', { password: PASSWORD }, user)
    await controller.deactivate('t', user)
    await controller.assignRole('t', { roleId: 'r' }, user)
    await controller.revokeRole('t', 'a', user)
    await controller.addMembership('t', { tenantId: 'x' }, user)
    await controller.removeMembership('t', 'm', user)
    expect(svc.update).toHaveBeenCalledWith('t', expect.anything(), PLAIN.id, context)
    expect(svc.setPassword).toHaveBeenCalledWith('t', PASSWORD, PLAIN.id, context)
    expect(svc.deactivate).toHaveBeenCalledWith('t', PLAIN.id, context)
    expect(svc.assignRole).toHaveBeenCalledWith('t', expect.anything(), PLAIN.id, context)
    expect(svc.revokeRole).toHaveBeenCalledWith('t', 'a', PLAIN.id, context)
    expect(svc.addMembership).toHaveBeenCalledWith('t', 'x', PLAIN.id, context)
    expect(svc.removeMembership).toHaveBeenCalledWith('t', 'm', PLAIN.id, context)
    const ordinary = { id: PLAIN.id }
    await controller.deactivate('t', ordinary)
    expect(svc.deactivate).toHaveBeenLastCalledWith('t', PLAIN.id, { impersonatorUserId: null, impersonation: false })
  })
})

describe('static guarantees', () => {
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const service = strip(readFileSync(join(__dirname, 'user.service.ts'), 'utf8'))
  const controller = readFileSync(join(__dirname, 'user.controller.ts'), 'utf8')

  it('the actor is re-read (requirePrivilegeActor) before any target lookup, hash, mutation or success audit in the seven administered operations', () => {
    for (const method of ['async update(', 'async setPassword(', 'async deactivate(', 'async assignRole(', 'async revokeRole(', 'async addMembership(', 'async removeMembership(']) {
      const start = service.indexOf(method)
      const end = service.indexOf('\n  async ', start + 10)
      const body = service.slice(start, end === -1 ? undefined : end)
      const actorAt = body.indexOf('this.requirePrivilegeActor(')
      expect([method, actorAt > -1]).toEqual([method, true])
      const firstEffect = body.search(/this\.db\.(select|update|delete|insert|transaction)\(|hashNewPassword\(|this\.auditService\.log\(/)
      expect([method, actorAt < firstEffect]).toEqual([method, true])
    }
  })

  it('privilege and credential operations block impersonation; only the display-name update does not', () => {
    for (const [method, blocks] of [['async update(', 'false'], ['async setPassword(', 'true'], ['async deactivate(', 'true'], ['async assignRole(', 'true'], ['async revokeRole(', 'true'], ['async addMembership(', 'true'], ['async removeMembership(', 'true']] as const) {
      const start = service.indexOf(method)
      const end = service.indexOf('\n  async ', start + 10)
      expect([method, service.slice(start, end === -1 ? undefined : end).includes(`this.requirePrivilegeActor(op, ${blocks})`)]).toEqual([method, true])
    }
  })

  it('keeps every route permission and adds none', () => {
    const used = [...controller.matchAll(/@RequirePermission\('([^']+)'\)/g)].map(m => m[1] as string)
    for (const code of used) expect(BUILTIN_PERMISSIONS as readonly string[]).toContain(code)
    expect(controller).toContain('@UseGuards(JwtAuthGuard, PermissionGuard, MfaEnforcementGuard)')
    expect(used.filter(code => /MFA|PRIVILEGE|SYSTEM_ADMIN/.test(code))).toEqual([])
  })

  it('the actor helper reads only the database row of the actor: no token claim, TENANT_ADMIN or PLATFORM_ROOT shortcut', () => {
    const start = service.indexOf('private async requirePrivilegeActor')
    const helper = service.slice(start, service.indexOf('private async assertTargetRules', start))
    expect(helper).not.toMatch(/TENANT_ADMIN|PLATFORM_ROOT|bypass|isSystemAdmin:\s*true/i)
    expect(helper).toContain('users.isSystemAdmin')
  })

  it('no route was added and the impersonation service check is untouched', () => {
    expect((controller.match(/@(Get|Post|Patch|Delete|Put)\(/g) ?? []).length).toBe(14)
    const auth = readFileSync(join(__dirname, 'auth.service.ts'), 'utf8')
    expect(auth).toContain("!actor.isSystemAdmin")
  })
})
