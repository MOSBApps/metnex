import { ForbiddenException } from '@nestjs/common'
import { buildMockDb, chain } from '../../db/test-helpers/drizzle-mock'
import { REQUIRE_MFA_SETUP_COMPLETE_KEY } from '../decorators/require-mfa-setup-complete.decorator'
import { MfaEnforcementGuard } from './mfa-enforcement.guard'

/**
 * TASK-027.48 — direct behavioural coverage of the guard the wiring tests (route matrix,
 * endpoint-authorization-inventory) only assert is *present* on a controller. This file asserts
 * what it actually *does*. No database or HTTP server is opened.
 */
function ctx(opts: { required: boolean; user?: { sub: string; mfaVerified?: boolean } | null }) {
  const request = { user: opts.user, method: 'GET', originalUrl: '/platform/users' }
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never
}

function harness() {
  const db = buildMockDb()
  const reflector = { getAllAndOverride: jest.fn() }
  const mfaRequirement = { isActorActive: jest.fn(), isRequired: jest.fn() }
  const audit = { log: jest.fn(async () => undefined) }
  const guard = new MfaEnforcementGuard(reflector as never, db as never, mfaRequirement as never, audit as never)
  return { db, reflector, mfaRequirement, audit, guard }
}

describe('MfaEnforcementGuard: opt-in via @RequireMfaSetupComplete()', () => {
  it('allows the request through with no database access when the decorator is absent', async () => {
    const h = harness()
    h.reflector.getAllAndOverride.mockReturnValue(false)
    await expect(h.guard.canActivate(ctx({ required: false }))).resolves.toBe(true)
    expect(h.db.select).not.toHaveBeenCalled()
    expect(h.mfaRequirement.isActorActive).not.toHaveBeenCalled()
  })

  it('reads the metadata via the same key the decorator sets, checking handler and class', async () => {
    const h = harness()
    h.reflector.getAllAndOverride.mockReturnValue(false)
    await h.guard.canActivate(ctx({ required: false }))
    expect(h.reflector.getAllAndOverride).toHaveBeenCalledWith(REQUIRE_MFA_SETUP_COMPLETE_KEY, [expect.anything(), expect.anything()])
  })

  it('denies (false, no throw) when the decorator is present but no user is attached to the request', async () => {
    const h = harness()
    h.reflector.getAllAndOverride.mockReturnValue(true)
    await expect(h.guard.canActivate(ctx({ required: true, user: null }))).resolves.toBe(false)
  })
})

describe('MfaEnforcementGuard: fail-closed decision tree', () => {
  it('refuses an inactive/deactivated account before checking any MFA state', async () => {
    const h = harness()
    h.reflector.getAllAndOverride.mockReturnValue(true)
    h.mfaRequirement.isActorActive.mockResolvedValue(false)
    const error = await h.guard.canActivate(ctx({ required: true, user: { sub: 'u1' } })).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(h.mfaRequirement.isRequired).not.toHaveBeenCalled()
    expect(h.db.select).not.toHaveBeenCalled()
  })

  it('passes through with no MFA-state lookup when the tenant/role policy does not require MFA for this actor', async () => {
    const h = harness()
    h.reflector.getAllAndOverride.mockReturnValue(true)
    h.mfaRequirement.isActorActive.mockResolvedValue(true)
    h.mfaRequirement.isRequired.mockResolvedValue(false)
    await expect(h.guard.canActivate(ctx({ required: true, user: { sub: 'u1' } }))).resolves.toBe(true)
    expect(h.db.select).not.toHaveBeenCalled()
    expect(h.audit.log).not.toHaveBeenCalled()
  })

  it('passes through when MFA is required and the current session token already carries mfaVerified: true', async () => {
    const h = harness()
    h.reflector.getAllAndOverride.mockReturnValue(true)
    h.mfaRequirement.isActorActive.mockResolvedValue(true)
    h.mfaRequirement.isRequired.mockResolvedValue(true)
    await expect(h.guard.canActivate(ctx({ required: true, user: { sub: 'u1', mfaVerified: true } }))).resolves.toBe(true)
    expect(h.db.select).not.toHaveBeenCalled() // mfaVerified short-circuits the MFA-settings lookup
    expect(h.audit.log).not.toHaveBeenCalled()
  })

  it('MFA_SETUP_REQUIRED: required + not verified + MFA never enabled — denies, writes an audit entry, never throws on the audit write itself', async () => {
    const h = harness()
    h.reflector.getAllAndOverride.mockReturnValue(true)
    h.mfaRequirement.isActorActive.mockResolvedValue(true)
    h.mfaRequirement.isRequired.mockResolvedValue(true)
    h.db.select.mockReturnValueOnce(chain([{ isEnabled: false }]))
    const error = await h.guard.canActivate(ctx({ required: true, user: { sub: 'u1', mfaVerified: false } })).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(error.getResponse()).toEqual(expect.objectContaining({ error: 'MFA_SETUP_REQUIRED' }))
    expect(h.audit.log).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'u1', actionCode: 'MFA_ENFORCEMENT_DENIED', metadata: expect.objectContaining({ reason: 'MFA_SETUP_REQUIRED' }),
    }))
  })

  it('MFA_SESSION_NOT_VERIFIED: required + not verified + MFA already enabled — denies and asks for a fresh, MFA-verified login', async () => {
    const h = harness()
    h.reflector.getAllAndOverride.mockReturnValue(true)
    h.mfaRequirement.isActorActive.mockResolvedValue(true)
    h.mfaRequirement.isRequired.mockResolvedValue(true)
    h.db.select.mockReturnValueOnce(chain([{ isEnabled: true }]))
    const error = await h.guard.canActivate(ctx({ required: true, user: { sub: 'u1', mfaVerified: false } })).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(error.getResponse()).toEqual(expect.objectContaining({ error: 'MFA_SESSION_NOT_VERIFIED' }))
    expect(h.audit.log).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'u1', actionCode: 'MFA_ENFORCEMENT_DENIED', metadata: expect.objectContaining({ reason: 'MFA_SESSION_NOT_VERIFIED' }),
    }))
  })

  it('a failed audit write never itself blocks or unblocks the request (best-effort)', async () => {
    const h = harness()
    h.reflector.getAllAndOverride.mockReturnValue(true)
    h.mfaRequirement.isActorActive.mockResolvedValue(true)
    h.mfaRequirement.isRequired.mockResolvedValue(true)
    h.db.select.mockReturnValueOnce(chain([{ isEnabled: false }]))
    h.audit.log.mockRejectedValueOnce(new Error('audit db down'))
    const error = await h.guard.canActivate(ctx({ required: true, user: { sub: 'u1' } })).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException) // still denies — the audit failure did not turn the denial into a 500 or a silent allow
  })

  it('no OTP, TOTP secret, recovery code or token ever appears in the denial audit metadata', async () => {
    const h = harness()
    h.reflector.getAllAndOverride.mockReturnValue(true)
    h.mfaRequirement.isActorActive.mockResolvedValue(true)
    h.mfaRequirement.isRequired.mockResolvedValue(true)
    h.db.select.mockReturnValueOnce(chain([{ isEnabled: false }]))
    await h.guard.canActivate(ctx({ required: true, user: { sub: 'u1' } })).catch(() => undefined)
    const entry = (h.audit.log.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(JSON.stringify(entry)).not.toMatch(/secret|otp|recovery|token|password|hash/i)
  })
})
