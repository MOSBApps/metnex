import { ForbiddenException } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMockDb, chain } from '../../db/test-helpers/drizzle-mock'
import { REQUIRE_MFA_SETUP_COMPLETE_KEY } from '../decorators/require-mfa-setup-complete.decorator'
import { MfaEnforcementGuard } from './mfa-enforcement.guard'

/**
 * TASK-027.48 review (AI1/PO) — explicit, end-to-end proof of the four properties the route
 * matrix (docs/runbooks/MFA_ENFORCEMENT_ROUTE_MATRIX.md) claims, in one place:
 *   1. The MFA setup/verification surface itself carries no @RequireMfaSetupComplete() — it is
 *      always reachable, whatever the caller's current MFA state is.
 *   2. Login/refresh/logout carry no JWT guard at all — unauthenticated by design, unaffected.
 *   3. A user whose policy requires MFA but who hasn't set it up yet is never fully locked out of
 *      the API: the exact same guard instance that blocks a protected route lets the setup
 *      endpoints through for that same user in that same state.
 *   4. A user with MFA required and not yet verified reaches only the setup/verification flow —
 *      every other protected route it was tested against still denies.
 * endpoint-authorization-inventory.spec.ts pins the guard *wiring* (which controller has which
 * guard); mfa-enforcement.guard.spec.ts pins the guard's own decision branches in isolation. This
 * file is the property that ties them together for the specific "not locked out" claim.
 */
const SRC = join(__dirname, '..', '..')

const EXEMPT_MFA_FLOW_FILE = join(SRC, 'platform', 'mfa.controller.ts')
const EXEMPT_MFA_FLOW_METHODS = [
  'async getStatus',
  'async setupTotp',
  'async verifySetup',
  'async disableTotp',
  'async verifyChallenge',
  'async regenerateRecoveryCodes',
]

// auth.controller.ts also has POST change-password, which IS @RequireMfaSetupComplete()-gated —
// checked per-method below, not at whole-file granularity.
const EXEMPT_AUTH_METHODS = ['async login', 'async refresh', 'async logout', 'me(']

const EXEMPT_WHOLE_FILES = [
  join(SRC, 'platform', 'me.controller.ts'), // app-shell identity bootstrap
  join(SRC, 'platform', 'bootstrap.controller.ts'), // first-run, no guard at all
  join(SRC, 'health.controller.ts'),
]

describe('MFA enforcement route matrix: setup/verification flow stays reachable', () => {
  it('property 1 — none of the six self-service MFA endpoints carry @RequireMfaSetupComplete()', () => {
    const source = readFileSync(EXEMPT_MFA_FLOW_FILE, 'utf8')
    for (const method of EXEMPT_MFA_FLOW_METHODS) {
      const start = source.indexOf(method)
      expect(start).toBeGreaterThan(-1)
      // The nearest preceding blank-line-separated decorator block for this method.
      const decoratorBlockStart = source.lastIndexOf('\n\n', start)
      const decorators = source.slice(decoratorBlockStart, start)
      expect(decorators).not.toContain('RequireMfaSetupComplete')
    }
  })

  it('property 2 — auth/me, platform/me/*, bootstrap and health carry no @RequireMfaSetupComplete() anywhere in the file', () => {
    for (const file of EXEMPT_WHOLE_FILES) {
      expect(readFileSync(file, 'utf8')).not.toContain('RequireMfaSetupComplete')
    }
  })

  it('property 2a — login/refresh/logout/me on auth.controller.ts specifically carry no @RequireMfaSetupComplete() (change-password on the same file does, and must not leak onto these)', () => {
    const source = readFileSync(join(SRC, 'platform', 'auth.controller.ts'), 'utf8')
    for (const method of EXEMPT_AUTH_METHODS) {
      const start = source.indexOf(method)
      expect(start).toBeGreaterThan(-1)
      const decoratorBlockStart = source.lastIndexOf('\n\n', start)
      const decorators = source.slice(decoratorBlockStart, start)
      expect(decorators).not.toContain('RequireMfaSetupComplete')
    }
  })

  it('property 2b — login/refresh/logout specifically carry no guard at all (public, unaffected by MFA)', () => {
    const source = readFileSync(join(SRC, 'platform', 'auth.controller.ts'), 'utf8')
    for (const method of ['async login', 'async refresh', 'async logout']) {
      const start = source.indexOf(method)
      const decoratorBlockStart = source.lastIndexOf('\n\n', start)
      const decorators = source.slice(decoratorBlockStart, start)
      expect(decorators).not.toMatch(/UseGuards/)
    }
  })
})

describe('MFA enforcement route matrix: a required-but-unset-up user is not locked out', () => {
  function harness() {
    const db = buildMockDb()
    const reflector = { getAllAndOverride: jest.fn() }
    const mfaRequirement = { isActorActive: jest.fn(async () => true), isRequired: jest.fn(async () => true) }
    const audit = { log: jest.fn(async () => undefined) }
    const guard = new MfaEnforcementGuard(reflector as never, db as never, mfaRequirement as never, audit as never)
    return { db, reflector, mfaRequirement, audit, guard }
  }

  function ctx(decorated: boolean, userMfaVerified = false) {
    const request = { user: { sub: 'u1', mfaVerified: userMfaVerified }, method: 'GET', originalUrl: '/x' }
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
      __decorated: decorated,
    } as never
  }

  it('property 3 — the same guard, same user, same MFA state: denies a @RequireMfaSetupComplete() route but passes a route without the decorator (the exempt MFA-flow shape)', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ isEnabled: false }]))
    h.reflector.getAllAndOverride.mockReturnValueOnce(true) // simulates e.g. GET /platform/users
    const protectedRouteResult = await h.guard.canActivate(ctx(true)).catch(e => e)
    expect(protectedRouteResult).toBeInstanceOf(ForbiddenException)

    h.reflector.getAllAndOverride.mockReturnValueOnce(false) // simulates e.g. POST /auth/mfa/totp/setup (no decorator)
    const setupRouteResult = await h.guard.canActivate(ctx(false))
    expect(setupRouteResult).toBe(true) // reachable — this is the property that prevents lockout
  })

  it('property 4 — every protected route this user is tried against denies consistently (fail-closed, not intermittent)', async () => {
    const h = harness()
    h.db.select
      .mockReturnValueOnce(chain([{ isEnabled: false }]))
      .mockReturnValueOnce(chain([{ isEnabled: false }]))
      .mockReturnValueOnce(chain([{ isEnabled: false }]))
    h.reflector.getAllAndOverride.mockReturnValue(true) // every route in this loop is @RequireMfaSetupComplete()-decorated

    const results = await Promise.all([
      h.guard.canActivate(ctx(true)).catch(e => e),
      h.guard.canActivate(ctx(true)).catch(e => e),
      h.guard.canActivate(ctx(true)).catch(e => e),
    ])
    for (const result of results) {
      expect(result).toBeInstanceOf(ForbiddenException)
      expect((result as ForbiddenException).getResponse()).toEqual(expect.objectContaining({ error: 'MFA_SETUP_REQUIRED' }))
    }
  })

  it('once mfaVerified is true on the session (post-challenge), the same protected route passes with no further DB lookup', async () => {
    const h = harness()
    h.reflector.getAllAndOverride.mockReturnValueOnce(true)
    const result = await h.guard.canActivate(ctx(true, true))
    expect(result).toBe(true)
    expect(h.db.select).not.toHaveBeenCalled()
  })
})

describe('MFA enforcement route matrix: metadata key is stable', () => {
  it('the reflector reads the exact key the decorator writes (regression guard for a silent rename)', () => {
    expect(REQUIRE_MFA_SETUP_COMPLETE_KEY).toBe('requireMfaSetupComplete')
  })
})
