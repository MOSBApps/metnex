import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { BUILTIN_PERMISSIONS } from './domain/system-role.domain'
import { MfaController } from './mfa.controller'
import { MfaService } from './mfa.service'

/**
 * TASK-027.40-R1 (Q-DP22): POST auth/mfa/admin/:userId/reset was protected by authentication only.
 * It is now fail-closed twice — in the controller and, independently, in MfaService.adminResetMfa
 * (which re-reads the actor from the database). No test opens a database or MFA provider.
 */
const ADMIN = { id: 'admin-1', sub: 'admin-1', email: 'admin@example.test', isSystemAdmin: true }
const NORMAL = { id: 'user-1', sub: 'user-1', email: 'user@example.test', isSystemAdmin: false }
const TENANT_ADMIN = { id: 'tadmin-1', sub: 'tadmin-1', email: 'tadmin@example.test', isSystemAdmin: false }
const LEAK = 'Zz9-Leaky-Marker'

function harness() {
  const db = buildMockDb()
  const audit = { log: jest.fn(async () => undefined) }
  const service = new MfaService(db as never, {} as never, {} as never, {} as never, audit as never)
  const controller = new MfaController(service as never)
  return { db, audit, service, controller }
}
type H = ReturnType<typeof harness>
const actorRow = (extra: Record<string, unknown> = {}) => chain([{ id: 'admin-1', status: 'ACTIVE', isSystemAdmin: true, ...extra }])

/** No MFA row was changed and nothing was audited. */
function expectNoWriteNoAudit(h: H) {
  expect(h.db.update).not.toHaveBeenCalled()
  expect(h.db.delete).not.toHaveBeenCalled()
  expect(h.db.insert).not.toHaveBeenCalled()
  expect(h.db.transaction).not.toHaveBeenCalled()
  expect(h.audit.log).not.toHaveBeenCalled()
}

describe('controller: fail-closed for everyone but a system administrator', () => {
  it.each([['a normal user', NORMAL], ['a tenant admin', TENANT_ADMIN], ['a user with isSystemAdmin missing', { id: 'u', email: 'x@y.z' }]])('%s gets 403 with no database access at all', async (_label, actor) => {
    const h = harness()
    const error = await h.controller.adminReset('target-1', actor as never).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(h.db.select).not.toHaveBeenCalled()
    expectNoWriteNoAudit(h)
  })

  it('the permission refusal comes before input validation (no format oracle for unauthorised callers)', async () => {
    const h = harness()
    expect(await h.controller.adminReset('a b;--', NORMAL as never).catch(e => e)).toBeInstanceOf(ForbiddenException)
    expectNoWriteNoAudit(h)
  })

  it('a system administrator with a malformed target id gets 400 and nothing is touched', async () => {
    const h = harness()
    expect(await h.controller.adminReset('a b;--', ADMIN as never).catch(e => e)).toBeInstanceOf(BadRequestException)
    expect(h.db.select).not.toHaveBeenCalled()
    expectNoWriteNoAudit(h)
  })

  it('refusal messages are static and never carry ids, tokens or secrets', async () => {
    const h = harness()
    const error = await h.controller.adminReset(`${LEAK}`, NORMAL as never).catch(e => e)
    expect(JSON.stringify(error.getResponse())).not.toMatch(/Leaky|Marker|user-1|target/)
  })
})

describe('service: an independent second check, re-read from the database', () => {
  it.each([
    ['a normal user', [{ id: 'user-1', status: 'ACTIVE', isSystemAdmin: false }]],
    ['a tenant admin (isSystemAdmin false)', [{ id: 'tadmin-1', status: 'ACTIVE', isSystemAdmin: false }]],
    ['an inactive system admin', [{ id: 'admin-1', status: 'INACTIVE', isSystemAdmin: true }]],
    ['a locked system admin', [{ id: 'admin-1', status: 'LOCKED', isSystemAdmin: true }]],
    ['an actor that does not exist', []],
  ])('%s is refused by the service itself: one lookup, no write, no audit', async (_label, rows) => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain(rows))
    const error = await h.service.adminResetMfa('actor-1', null, 'target-1').catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(h.db.select).toHaveBeenCalledTimes(1)
    expectNoWriteNoAudit(h)
  })

  it.each(['', 'a b', "x';--", 'a'.repeat(101)])('a malformed actor id %j is refused without any database call', async actorId => {
    const h = harness()
    expect(await h.service.adminResetMfa(actorId, null, 'target-1').catch(e => e)).toBeInstanceOf(ForbiddenException)
    expect(h.db.select).not.toHaveBeenCalled()
    expectNoWriteNoAudit(h)
  })

  it('a stale or forged controller claim cannot authorise: the database decides', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ id: 'admin-1', status: 'ACTIVE', isSystemAdmin: false }])) // demoted since the token was issued
    const error = await h.controller.adminReset('target-1', ADMIN as never).catch(e => e) // request.user still claims true
    expect(error).toBeInstanceOf(ForbiddenException)
    expectNoWriteNoAudit(h)
  })

  it('an unknown target is a 404 and writes/audits nothing', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(actorRow()).mockReturnValueOnce(chain([]))
    expect(await h.service.adminResetMfa('admin-1', null, 'missing').catch(e => e)).toBeInstanceOf(NotFoundException)
    expectNoWriteNoAudit(h)
  })

  it('a malformed target id is a 400 after authorisation and touches no MFA row', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(actorRow())
    expect(await h.service.adminResetMfa('admin-1', null, 'a b').catch(e => e)).toBeInstanceOf(BadRequestException)
    expect(h.db.select).toHaveBeenCalledTimes(1)
    expectNoWriteNoAudit(h)
  })
})

describe('an authorised system administrator keeps the existing behaviour', () => {
  it('resets the target MFA (settings cleared, recovery codes deleted) and audits actor and target', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(actorRow()).mockReturnValueOnce(chain([{ id: 'target-1' }]))
    const update = chain(undefined)
    h.db.update.mockReturnValueOnce(update)
    h.db.delete.mockReturnValueOnce(chain(undefined))
    await expect(h.controller.adminReset('target-1', ADMIN as never)).resolves.toEqual({ success: true })
    expect(update.set).toHaveBeenCalledWith(expect.objectContaining({ isEnabled: false, secretEncrypted: null, keyVersion: null, enabledAt: null }))
    expect(h.db.delete).toHaveBeenCalledTimes(1)
    expect(h.audit.log).toHaveBeenCalledTimes(1)
    expect(h.audit.log).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'admin-1', actionCode: 'MFA_ADMIN_RESET', entityType: 'UserMfaSettings', entityId: 'target-1', metadata: { targetUserId: 'target-1' },
    }))
  })

  it('platform-wide by design: a system administrator may reset a target in any tenant/root (no tenant scope applies to them)', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(actorRow()).mockReturnValueOnce(chain([{ id: 'target-in-other-root' }]))
    h.db.update.mockReturnValueOnce(chain(undefined))
    h.db.delete.mockReturnValueOnce(chain(undefined))
    await expect(h.service.adminResetMfa('admin-1', null, 'target-in-other-root')).resolves.toEqual({ success: true })
  })

  it('the audit record carries only ids — no secret, OTP, recovery code or token field', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(actorRow()).mockReturnValueOnce(chain([{ id: 'target-1' }]))
    h.db.update.mockReturnValueOnce(chain(undefined))
    h.db.delete.mockReturnValueOnce(chain(undefined))
    await h.service.adminResetMfa('admin-1', null, 'target-1')
    const entry = (h.audit.log.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(Object.keys(entry.metadata as object)).toEqual(['targetUserId'])
    expect(JSON.stringify(entry)).not.toMatch(/secret|otp|recovery|token|password|hash/i)
  })
})

describe('static guarantees', () => {
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const controller = strip(readFileSync(join(__dirname, 'mfa.controller.ts'), 'utf8'))
  const service = strip(readFileSync(join(__dirname, 'mfa.service.ts'), 'utf8'))

  it('the endpoint keeps authentication and refuses non-admins before the service call', () => {
    const method = controller.slice(controller.indexOf("@Post('admin/:userId/reset')"), controller.indexOf("@Get('policy')"))
    expect(method).toContain("@UseGuards(AuthGuard('jwt'))")
    expect(method.indexOf('if (!admin.isSystemAdmin) throw new ForbiddenException')).toBeGreaterThan(-1)
    expect(method.indexOf('isSystemAdmin')).toBeLessThan(method.indexOf('this.mfaService'))
  })

  it('adminResetMfa authorises before it writes or audits anything', () => {
    const body = service.slice(service.indexOf('async adminResetMfa'), service.indexOf('async verifyChallenge'))
    const authAt = body.indexOf('!actor.isSystemAdmin')
    expect(authAt).toBeGreaterThan(-1)
    expect(authAt).toBeLessThan(body.indexOf('this.disableInternal'))
    // the only audit before the authorisation is the best-effort DENIED audit of an impersonation refusal
    const successAudit = body.indexOf('this.writeAudit', body.indexOf('this.disableInternal'))
    expect(authAt).toBeLessThan(successAudit)
    expect(body).toContain("actor.status !== 'ACTIVE'")
  })

  it('no new permission code was invented (the catalogue has no MFA entry) and no TENANT_ADMIN/PLATFORM_ROOT shortcut exists', () => {
    expect(BUILTIN_PERMISSIONS.some(code => /MFA/i.test(code))).toBe(false)
    const body = service.slice(service.indexOf('async adminResetMfa'), service.indexOf('async verifyChallenge'))
    expect(body).not.toMatch(/TENANT_ADMIN|PLATFORM_ROOT|bypass|RequirePermission/)
    expect(controller).not.toMatch(/RequirePermission\('[^']*MFA/)
  })

  it('other MFA endpoints still act only on the caller\'s own account (actor id = subject id)', () => {
    for (const call of ['this.mfaService.verifySetup(getUserId(user)', 'this.mfaService.disableTotp(getUserId(user)', 'this.mfaService.regenerateRecoveryCodes(getUserId(user)']) {
      expect(controller).toContain(call)
    }
  })
})
