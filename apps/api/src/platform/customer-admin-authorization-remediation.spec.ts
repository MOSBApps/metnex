import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { BUILTIN_PERMISSIONS } from './domain/system-role.domain'
import { toCustomerUserView, toPlatformUserView, toSessionUserView } from './domain/user-projection.domain'
import { CustomerAdminController } from './saas.controller'
import { SaasService } from './saas.service'
import { UserService } from './user.service'

/**
 * TASK-027.41-R1 — customer-admin authorization and credential projection remediation (F1, F2, F3).
 * Every test is mock-only (no database, HTTP or MFA provider) and every credential value is a fabricated
 * placeholder. These are the enforcing counterparts of the characterization tests that pinned the open
 * behaviour during the audit.
 */
const HASH = 'placeholder-hash-not-a-real-value'
const PASSWORD = 'Aa1-Placeholder-Pass'
const NEW_HASH = 'new-hash-placeholder'
const ACTOR = 'customer-admin-1'
const ROOT = 'root-A'
const TENANT = 'tenant-in-root-A'

const userRow = (over: Record<string, unknown> = {}) => ({
  id: 'target-1', email: 'target@example.test', displayName: 'Hedef Kişi', status: 'ACTIVE', isSystemAdmin: false,
  passwordHash: HASH, mfaSecret: 'placeholder-mfa', refreshToken: 'placeholder-token', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), ...over,
})
const scoped = (over: Record<string, unknown> = {}) => chain([{ user: userRow(over) }])

function harness() {
  const db = buildMockDb()
  const authService = { hashNewPassword: jest.fn(async () => NEW_HASH) }
  const audit = { log: jest.fn(async () => undefined) }
  const customerAccess = {
    assertCustomerAdminScope: jest.fn(async () => ({ customerRoot: { id: ROOT, slug: 'a', type: 'ROOT' } })),
    assertTenantBelongsToCustomerRoot: jest.fn(async (id: string) => ({ id, slug: 'a-child', type: 'STANDARD' })),
  }
  const service = new SaasService(db as never, authService as never, customerAccess as never, {} as never, {} as never, { createClosureForNewTenant: jest.fn() } as never, { ensureSchemaProvisioned: jest.fn() } as never, audit as never)
  return { db, authService, audit, customerAccess, service }
}
type H = ReturnType<typeof harness>

const noWrite = (h: H) => {
  for (const fn of [h.db.insert, h.db.update, h.db.delete, h.db.transaction]) expect(fn).not.toHaveBeenCalled()
}
const auditEntries = (h: H) => h.audit.log.mock.calls.map(call => (call as unknown[])[0] as Record<string, unknown>)
const noCredentialInAudit = (h: H) => {
  const text = JSON.stringify(h.audit.log.mock.calls)
  for (const secret of [PASSWORD, NEW_HASH, HASH, 'placeholder-mfa', 'placeholder-token']) expect(text).not.toContain(secret)
  expect(text).not.toMatch(/passwordHash|"password"|refreshToken|mfaSecret|otp/i)
}

describe('F1 — membership add is confined to the caller’s customer root', () => {
  it('rejects a user of another root/tenant with 404, writes nothing and audits the denial (actor, target, tenant, root)', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([])) // scoped lookup: no active membership in root-A's tree
    const error = await h.service.addCustomerUserMembership(ACTOR, false, TENANT, 'foreign-user', { tenantId: TENANT }).catch(e => e)
    expect(error).toBeInstanceOf(NotFoundException)
    noWrite(h)
    expect(auditEntries(h)).toEqual([
      expect.objectContaining({
        actorId: ACTOR, actionCode: 'CUSTOMER_MEMBERSHIP_ADD', entityId: 'foreign-user',
        metadata: expect.objectContaining({ result: 'DENIED', reason: 'TARGET_OUT_OF_SCOPE', targetUserId: 'foreign-user', customerRootId: ROOT, tenantId: TENANT }),
      }),
    ])
    noCredentialInAudit(h)
  })

  it('uses the scoped lookup (users ⨝ memberships ⨝ tenants), never a bare user-by-id lookup', async () => {
    const h = harness()
    const lookup = chain([])
    h.db.select.mockReturnValueOnce(lookup)
    await h.service.addCustomerUserMembership(ACTOR, false, TENANT, 'foreign-user', { tenantId: TENANT }).catch(() => undefined)
    expect(lookup.innerJoin).toHaveBeenCalledTimes(2)
  })

  it('rejects a system-administrator target with 403, writes nothing and audits the denial', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(scoped({ isSystemAdmin: true }))
    const error = await h.service.addCustomerUserMembership(ACTOR, false, TENANT, 'target-1', { tenantId: TENANT }).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    noWrite(h)
    expect(auditEntries(h)[0]).toMatchObject({ metadata: expect.objectContaining({ result: 'DENIED', reason: 'TARGET_IS_SYSTEM_ADMIN' }) })
  })

  it('adds an in-root user to another tenant of the same root and audits actor, target, tenant, root and result', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(scoped()).mockReturnValueOnce(chain([]))
    const insert = chain([{ id: 'membership-1', tenantId: TENANT, userId: 'target-1', isActive: true }])
    h.db.insert.mockReturnValueOnce(insert)
    await expect(h.service.addCustomerUserMembership(ACTOR, false, TENANT, 'target-1', { tenantId: TENANT })).resolves.toMatchObject({ id: 'membership-1' })
    expect(insert.values).toHaveBeenCalledWith({ tenantId: TENANT, userId: 'target-1', isActive: true })
    expect(auditEntries(h)).toEqual([
      expect.objectContaining({
        actorId: ACTOR, actionCode: 'CUSTOMER_MEMBERSHIP_ADDED', entityType: 'TenantMembership', entityId: 'membership-1',
        metadata: { result: 'SUCCESS', targetUserId: 'target-1', customerRootId: ROOT, tenantId: TENANT },
      }),
    ])
    noCredentialInAudit(h)
  })

  it('keeps the existing duplicate-membership conflict', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(scoped()).mockReturnValueOnce(chain([{ id: 'existing' }]))
    expect(await h.service.addCustomerUserMembership(ACTOR, false, TENANT, 'target-1', { tenantId: TENANT }).catch(e => e)).toBeInstanceOf(ConflictException)
    noWrite(h)
  })

  it('a tenant outside the root is still refused before any target lookup or write', async () => {
    const h = harness()
    h.customerAccess.assertTenantBelongsToCustomerRoot.mockRejectedValueOnce(new ForbiddenException('yok'))
    expect(await h.service.addCustomerUserMembership(ACTOR, false, TENANT, 'target-1', { tenantId: 'foreign-tenant' }).catch(e => e)).toBeInstanceOf(ForbiddenException)
    expect(h.db.select).not.toHaveBeenCalled()
    noWrite(h)
    expect(h.audit.log).not.toHaveBeenCalled()
  })
})

describe('F1 — customer-admin password reset', () => {
  it.each([
    ['a target outside the root', chain([]), NotFoundException, 'TARGET_OUT_OF_SCOPE'],
    ['a system-administrator target', scoped({ isSystemAdmin: true }), ForbiddenException, 'TARGET_IS_SYSTEM_ADMIN'],
  ])('%s is refused: no hash, no write, denial audited without credentials', async (_label, lookup, errorType, reason) => {
    const h = harness()
    h.db.select.mockReturnValueOnce(lookup)
    const error = await h.service.setCustomerUserPassword(ACTOR, false, TENANT, 'target-1', PASSWORD).catch(e => e)
    expect(error).toBeInstanceOf(errorType)
    expect(h.authService.hashNewPassword).not.toHaveBeenCalled()
    noWrite(h)
    expect(auditEntries(h)[0]).toMatchObject({ actorId: ACTOR, actionCode: 'CUSTOMER_USER_PASSWORD_RESET', metadata: expect.objectContaining({ result: 'DENIED', reason }) })
    noCredentialInAudit(h)
  })

  it('the self-change prohibition is kept and audited', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(scoped({ id: ACTOR }))
    expect(await h.service.setCustomerUserPassword(ACTOR, false, TENANT, ACTOR, PASSWORD).catch(e => e)).toBeInstanceOf(ForbiddenException)
    expect(h.authService.hashNewPassword).not.toHaveBeenCalled()
    noWrite(h)
    expect(auditEntries(h)[0]).toMatchObject({ metadata: expect.objectContaining({ result: 'DENIED', reason: 'SELF_CHANGE' }) })
  })

  it('a successful reset hashes once, updates only the password hash and audits actor/target/root/result — never the password or hash', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(scoped())
    const update = chain(undefined)
    h.db.update.mockReturnValueOnce(update)
    await expect(h.service.setCustomerUserPassword(ACTOR, false, TENANT, 'target-1', PASSWORD)).resolves.toEqual({ success: true })
    expect(h.authService.hashNewPassword).toHaveBeenCalledWith(PASSWORD)
    expect(update.set).toHaveBeenCalledWith({ passwordHash: NEW_HASH })
    expect(auditEntries(h)).toEqual([
      expect.objectContaining({ actorId: ACTOR, actionCode: 'CUSTOMER_USER_PASSWORD_RESET', entityId: 'target-1', metadata: { result: 'SUCCESS', targetUserId: 'target-1', customerRootId: ROOT } }),
    ])
    noCredentialInAudit(h)
  })

  it('a failure while writing is audited as FAILED and the error is rethrown', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(scoped())
    h.db.update.mockImplementationOnce(() => { throw new Error('db down') })
    expect(await h.service.setCustomerUserPassword(ACTOR, false, TENANT, 'target-1', PASSWORD).catch(e => e)).toEqual(new Error('db down'))
    expect(auditEntries(h)[0]).toMatchObject({ metadata: expect.objectContaining({ result: 'FAILED', reason: 'ERROR' }) })
    noCredentialInAudit(h)
  })

  it('an audit outage never turns a refusal into anything but the same refusal', async () => {
    const h = harness()
    h.audit.log.mockRejectedValue(new Error('audit down'))
    h.db.select.mockReturnValueOnce(scoped({ isSystemAdmin: true }))
    expect(await h.service.setCustomerUserPassword(ACTOR, false, TENANT, 'target-1', PASSWORD).catch(e => e)).toBeInstanceOf(ForbiddenException)
    noWrite(h)
  })

  it('an unauthorised caller (scope check fails) causes no lookup, hash, write or audit', async () => {
    const h = harness()
    h.customerAccess.assertCustomerAdminScope.mockRejectedValueOnce(new ForbiddenException('scope'))
    expect(await h.service.setCustomerUserPassword('someone', false, 'other-root', 'target-1', PASSWORD).catch(e => e)).toBeInstanceOf(ForbiddenException)
    expect(h.db.select).not.toHaveBeenCalled()
    expect(h.authService.hashNewPassword).not.toHaveBeenCalled()
    noWrite(h)
    expect(h.audit.log).not.toHaveBeenCalled()
  })

  it('a weak password is a plain 400 before any lookup (no audit noise, nothing echoed)', async () => {
    const h = harness()
    const error = await h.service.setCustomerUserPassword(ACTOR, false, TENANT, 'target-1', 'weak').catch(e => e)
    expect(error).toBeInstanceOf(BadRequestException)
    expect(JSON.stringify(error.getResponse())).not.toContain('weak')
    expect(h.db.select).not.toHaveBeenCalled()
    expect(h.audit.log).not.toHaveBeenCalled()
  })
})

describe('F2 — responses never carry a raw users row', () => {
  const FORBIDDEN = /passwordHash|mfaSecret|refreshToken|placeholder-hash|placeholder-mfa|placeholder-token/

  it('PATCH customer-admin/users/:id (with and without displayName) returns the safe view only', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(scoped())
    const noChange = (await h.service.updateCustomerUser(ACTOR, false, TENANT, 'target-1', {})) as unknown as Record<string, unknown>
    expect(Object.keys(noChange).sort()).toEqual(['createdAt', 'displayName', 'email', 'id', 'status', 'updatedAt'])
    expect(JSON.stringify(noChange)).not.toMatch(FORBIDDEN)

    const h2 = harness()
    h2.db.select.mockReturnValueOnce(scoped())
    h2.db.update.mockReturnValueOnce(chain([userRow({ displayName: 'Yeni Ad' })]))
    const changed = (await h2.service.updateCustomerUser(ACTOR, false, TENANT, 'target-1', { displayName: 'Yeni Ad' })) as unknown as Record<string, unknown>
    expect(changed['displayName']).toBe('Yeni Ad')
    expect(JSON.stringify(changed)).not.toMatch(FORBIDDEN)
    expect(auditEntries(h2)[0]).toMatchObject({ actionCode: 'CUSTOMER_USER_UPDATED', actorId: ACTOR, entityId: 'target-1', metadata: expect.objectContaining({ result: 'SUCCESS', targetUserId: 'target-1', customerRootId: ROOT, beforeDisplayName: 'Hedef Kişi', afterDisplayName: 'Yeni Ad' }) })
    noCredentialInAudit(h2)
  })

  it('an update of an out-of-root or system-administrator target is refused and audited', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([]))
    expect(await h.service.updateCustomerUser(ACTOR, false, TENANT, 'foreign', { displayName: 'Ad Soyad' }).catch(e => e)).toBeInstanceOf(NotFoundException)
    const h2 = harness()
    h2.db.select.mockReturnValueOnce(scoped({ isSystemAdmin: true }))
    expect(await h2.service.updateCustomerUser(ACTOR, false, TENANT, 'target-1', { displayName: 'Ad Soyad' }).catch(e => e)).toBeInstanceOf(ForbiddenException)
    for (const ctx of [h, h2]) {
      noWrite(ctx)
      expect(auditEntries(ctx)[0]).toMatchObject({ actionCode: 'CUSTOMER_USER_UPDATE_DENIED', metadata: expect.objectContaining({ result: 'DENIED' }) })
    }
  })

  it('POST customer-admin/users (create) source returns the safe view and audits the creation (actor, target, tenant, root)', () => {
    const source = readFileSync(join(__dirname, 'saas.service.ts'), 'utf8')
    const body = source.slice(source.indexOf('async createCustomerUser'), source.indexOf('async updateCustomerUser'))
    expect(body).toContain('return toCustomerUserView(created)')
    expect(body).not.toMatch(/return created\s*\n/)
    expect(body).toContain("action: 'CUSTOMER_USER_CREATED'")
    expect(body).toMatch(/actorId: userId[\s\S]*tenantId[\s\S]*targetUserId: created\.id[\s\S]*result: 'SUCCESS'/)
  })

  it('projections whitelist: any extra column (credential, MFA, token) is dropped', () => {
    const row = userRow()
    for (const view of [toCustomerUserView(row), toPlatformUserView(row), toSessionUserView({ ...row, mfaVerified: true })]) {
      expect(JSON.stringify(view)).not.toMatch(FORBIDDEN)
    }
    expect(Object.keys(toCustomerUserView(row)).sort()).toEqual(['createdAt', 'displayName', 'email', 'id', 'status', 'updatedAt'])
    expect(Object.keys(toPlatformUserView(row)).sort()).toEqual(['createdAt', 'displayName', 'email', 'id', 'isSystemAdmin', 'status', 'updatedAt'])
    expect(Object.keys(toSessionUserView(row)).sort()).toEqual(['displayName', 'email', 'id', 'impersonation', 'impersonatorEmail', 'impersonatorUserId', 'isSystemAdmin', 'mfaVerified', 'status'])
    expect(toCustomerUserView(row)).not.toHaveProperty('isSystemAdmin')
  })

  describe('platform user endpoints had the same leak (the projection helper returned the row unchanged)', () => {
    function users() {
      const db = buildMockDb()
      const authService = { hashNewPassword: jest.fn(async () => NEW_HASH) }
      const audit = { log: jest.fn(async () => undefined) }
      return { db, service: new UserService(db as never, authService as never, audit as never) }
    }

    it('list, create, update and deactivate responses carry no credential fields', async () => {
      const a = users()
      a.db.select.mockReturnValueOnce(chain([userRow()])).mockReturnValueOnce(chain([{ count: 1 }]))
      const list = await a.service.list({})
      expect(JSON.stringify(list)).not.toMatch(FORBIDDEN)

      const b = users()
      b.db.select.mockReturnValueOnce(chain([]))
      b.db.insert.mockReturnValueOnce(chain([userRow()]))
      expect(JSON.stringify(await b.service.create({ email: 'x@example.test', displayName: 'Yeni Kişi', password: PASSWORD }, ACTOR))).not.toMatch(FORBIDDEN)

      const c = users()
      c.db.select.mockReturnValueOnce(chain([userRow()])).mockReturnValueOnce(chain([{ id: ACTOR, status: 'ACTIVE', isSystemAdmin: false }]))
      c.db.update.mockReturnValueOnce(chain([userRow({ displayName: 'Yeni Ad' })]))
      expect(JSON.stringify(await c.service.update('target-1', { displayName: 'Yeni Ad' }, ACTOR))).not.toMatch(FORBIDDEN)

      const d = users()
      d.db.select.mockReturnValueOnce(chain([userRow()])).mockReturnValueOnce(chain([{ id: 'someone-else', status: 'ACTIVE', isSystemAdmin: false }]))
      d.db.update.mockReturnValueOnce(chain([userRow({ status: 'INACTIVE' })]))
      expect(JSON.stringify(await d.service.deactivate('target-1', 'someone-else').catch(e => e))).not.toMatch(FORBIDDEN)
    })

    it('detail (findById) carries no credential fields', async () => {
      const e = users()
      e.db.select.mockReturnValueOnce(chain([userRow()])).mockReturnValueOnce(chain([]))
      expect(JSON.stringify(await e.service.findById('target-1'))).not.toMatch(FORBIDDEN)
    })

    it('the list keeps the fields the platform UI uses (id, email, displayName, isSystemAdmin, status, dates)', async () => {
      const a = users()
      a.db.select.mockReturnValueOnce(chain([userRow({ isSystemAdmin: true })])).mockReturnValueOnce(chain([{ count: 1 }]))
      const { users: rows } = await a.service.list({})
      expect(rows[0]).toMatchObject({ id: 'target-1', email: 'target@example.test', displayName: 'Hedef Kişi', isSystemAdmin: true, status: 'ACTIVE' })
    })
  })
})

describe('F3 — GET /auth/me and the request user', () => {
  it('returns the session projection only', () => {
    const controller = new AuthController({} as never)
    const requestUser = { ...userRow(), mfaVerified: true, impersonation: true, impersonatorUserId: 'imp-1', impersonatorEmail: 'imp@example.test' }
    const { user } = controller.me(requestUser)
    expect(user).toEqual({
      id: 'target-1', email: 'target@example.test', displayName: 'Hedef Kişi', status: 'ACTIVE', isSystemAdmin: false,
      mfaVerified: true, impersonation: true, impersonatorUserId: 'imp-1', impersonatorEmail: 'imp@example.test',
    })
    expect(JSON.stringify(user)).not.toMatch(/passwordHash|mfaSecret|refreshToken|placeholder-/)
  })

  it('validateJwtPayload no longer puts the credential hash on the request user', async () => {
    const db = buildMockDb()
    db.select.mockReturnValueOnce(chain([userRow()]))
    const auth = new AuthService(db as never, {} as never, {} as never)
    const requestUser = (await auth.validateJwtPayload({ sub: 'target-1', email: 'target@example.test', isSystemAdmin: false })) as Record<string, unknown>
    expect(requestUser).not.toHaveProperty('passwordHash')
    expect(requestUser).toMatchObject({ id: 'target-1', isSystemAdmin: false, mfaVerified: false, impersonation: false })
  })
})

describe('impersonation (TASK-027.46: password changes and membership additions are refused; other actions record the impersonator)', () => {
  const IMP = { impersonatorUserId: 'sysadmin-9', impersonation: true }

  it('setCustomerUserPassword is refused in an impersonation session before scope/target lookups, hash or writes; DENIED audit is best-effort with ids only', async () => {
    const h = harness()
    const error = await h.service.setCustomerUserPassword(ACTOR, false, TENANT, 'target-1', PASSWORD, IMP).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect((error as ForbiddenException).getResponse()).toEqual({ code: 'IMPERSONATION_PRIVILEGE_CHANGE_FORBIDDEN', message: expect.any(String) })
    expect(h.customerAccess.assertCustomerAdminScope).not.toHaveBeenCalled()
    expect(h.db.select).not.toHaveBeenCalled()
    expect(h.authService.hashNewPassword).not.toHaveBeenCalled()
    noWrite(h)
    expect(auditEntries(h)).toEqual([expect.objectContaining({ actorId: ACTOR, actionCode: 'CUSTOMER_USER_PASSWORD_RESET', metadata: { result: 'DENIED', reason: 'IMPERSONATION_SESSION', targetUserId: 'target-1', impersonatorUserId: 'sysadmin-9' } })])
    noCredentialInAudit(h)
  })

  it('addCustomerUserMembership is refused in an impersonation session the same way', async () => {
    const h = harness()
    const error = await h.service.addCustomerUserMembership(ACTOR, false, TENANT, 'target-1', { tenantId: TENANT }, IMP).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(h.customerAccess.assertCustomerAdminScope).not.toHaveBeenCalled()
    expect(h.db.select).not.toHaveBeenCalled()
    noWrite(h)
    expect(auditEntries(h)[0]).toMatchObject({ actionCode: 'CUSTOMER_MEMBERSHIP_ADD', metadata: expect.objectContaining({ result: 'DENIED', reason: 'IMPERSONATION_SESSION' }) })
  })

  it('a refusal audit outage still refuses, and an impersonated system-administrator session gets no exception', async () => {
    const h = harness()
    h.audit.log.mockRejectedValue(new Error('audit down'))
    expect(await h.service.setCustomerUserPassword('sysadmin-target', true, TENANT, 'target-1', PASSWORD, IMP).catch(e => e)).toBeInstanceOf(ForbiddenException)
    noWrite(h)
  })

  it('an impersonation flag without an impersonator id (or the reverse) is refused too (fail closed)', async () => {
    for (const context of [{ impersonation: true }, { impersonatorUserId: 'imp-1' }]) {
      const h = harness()
      expect(await h.service.addCustomerUserMembership(ACTOR, false, TENANT, 'target-1', { tenantId: TENANT }, context).catch(e => e)).toBeInstanceOf(ForbiddenException)
      expect(h.customerAccess.assertCustomerAdminScope).not.toHaveBeenCalled()
    }
  })

  it('actions that are not password/membership changes still work in an impersonation session and record the impersonator', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(scoped())
    h.db.update.mockReturnValueOnce(chain([userRow({ displayName: 'Yeni Ad' })]))
    await h.service.updateCustomerUser(ACTOR, false, TENANT, 'target-1', { displayName: 'Yeni Ad' }, IMP)
    expect(auditEntries(h)[0]).toMatchObject({ actorId: ACTOR, metadata: expect.objectContaining({ result: 'SUCCESS', impersonatorUserId: 'sysadmin-9' }) })

    const plain = harness()
    plain.db.select.mockReturnValueOnce(scoped()).mockReturnValueOnce(chain([]))
    plain.db.insert.mockReturnValueOnce(chain([{ id: 'membership-2' }]))
    await plain.service.addCustomerUserMembership(ACTOR, false, TENANT, 'target-1', { tenantId: TENANT })
    expect(auditEntries(plain)[0]?.['metadata']).not.toHaveProperty('impersonatorUserId')
  })

  it('an impersonated session gets no extra reach on the remaining actions: out-of-root targets are refused the same way (denials carry the impersonator)', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([]))
    expect(await h.service.updateCustomerUser(ACTOR, false, TENANT, 'foreign', { displayName: 'Ad Soyad' }, IMP).catch(e => e)).toBeInstanceOf(NotFoundException)
    expect(auditEntries(h)[0]).toMatchObject({ metadata: expect.objectContaining({ reason: 'TARGET_OUT_OF_SCOPE', impersonatorUserId: 'sysadmin-9' }) })
  })

  it('the controller forwards request.user (impersonator id and impersonation flag) as audit/refusal context for all four mutations', async () => {
    const saas = { createCustomerUser: jest.fn(), updateCustomerUser: jest.fn(), setCustomerUserPassword: jest.fn(), addCustomerUserMembership: jest.fn() }
    const controller = new CustomerAdminController(saas as never)
    const user = { id: ACTOR, isSystemAdmin: false, impersonatorUserId: 'sysadmin-9', impersonation: true }
    const context = { impersonatorUserId: 'sysadmin-9', impersonation: true }
    await controller.createUser(user, TENANT, { email: 'a@b.co', displayName: 'Ad Soyad', password: PASSWORD })
    await controller.updateUser(user, TENANT, 't1', { displayName: 'Ad Soyad' })
    await controller.setUserPassword(user, TENANT, 't1', { password: PASSWORD })
    await controller.addMembership(user, TENANT, 't1', { tenantId: TENANT })
    expect(saas.createCustomerUser).toHaveBeenCalledWith(ACTOR, false, TENANT, expect.anything(), context)
    expect(saas.updateCustomerUser).toHaveBeenCalledWith(ACTOR, false, TENANT, 't1', expect.anything(), context)
    expect(saas.setCustomerUserPassword).toHaveBeenCalledWith(ACTOR, false, TENANT, 't1', PASSWORD, context)
    expect(saas.addCustomerUserMembership).toHaveBeenCalledWith(ACTOR, false, TENANT, 't1', expect.anything(), context)
  })
})

describe('authorization model unchanged', () => {
  it('adds no permission code, no new route and keeps the scope check ahead of every target lookup', () => {
    const controller = readFileSync(join(__dirname, 'saas.controller.ts'), 'utf8')
    const used = new Set([...controller.matchAll(/@RequirePermission\('([^']+)'\)/g)].map(m => m[1]))
    for (const code of used) expect(BUILTIN_PERMISSIONS as readonly string[]).toContain(code)
    const service = readFileSync(join(__dirname, 'saas.service.ts'), 'utf8')
    for (const method of ['async updateCustomerUser', 'async setCustomerUserPassword', 'async addCustomerUserMembership']) {
      const body = service.slice(service.indexOf(method), service.indexOf(method) + 1400)
      expect(body.indexOf('assertCustomerAdminScope(')).toBeLessThan(body.indexOf('resolveManageableCustomerUser('))
    }
  })

  it('has no isSystemAdmin/TENANT_ADMIN/impersonation bypass in the new authorization helpers', () => {
    const service = readFileSync(join(__dirname, 'saas.service.ts'), 'utf8')
    const auditAt = service.indexOf('private async auditCustomerAdmin')
    const helper = service.slice(service.indexOf('private async resolveManageableCustomerUser'), service.lastIndexOf('/**', auditAt))
    expect(helper).not.toMatch(/impersonat|TENANT_ADMIN|PLATFORM_ROOT|bypass/i)
    expect(helper.match(/isSystemAdmin/g)).toHaveLength(1) // only to REFUSE a system-administrator target
  })
})
