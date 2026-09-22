import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { BREAK_GLASS_STATUS } from './break-glass/break-glass.contract'
import { BreakGlassRecoveryService } from './break-glass/break-glass-recovery.service'
import { PRIVILEGE_DENIAL } from './domain/privilege-ceiling.domain'
import { MfaController } from './mfa.controller'
import { MfaService } from './mfa.service'
import { DrizzlePrivilegeSnapshotPort } from './privilege/privilege-snapshot.drizzle'

/**
 * TASK-027.47 — eş sistem yöneticisi yönetimi (Model B, Q-DP24 closure decision 2), self-service credential
 * rotation (decision 1) and break-glass recovery (decision 4). Mock-only: no database, HTTP or MFA provider is
 * used anywhere in this file, and every credential/token value is a fabricated placeholder.
 */
// A handful of tests below call the REAL scrypt-based hashPassword/verifyPassword (deliberately, to prove the
// self-service flow checks a genuine hash rather than a stub). scrypt is CPU-heavy; under the full check.sh gate's
// parallel test-worker load this can exceed Jest's 5s default, so the file gets a longer default timeout.
jest.setTimeout(20_000)
const CURRENT = 'Old-Placeholder-Pass1'
const NEW = 'New-Placeholder-Pass1'
const OLD_HASH = 'old-hash-placeholder'
const TOKEN = 'placeholder-break-glass-token-value'

const forbid = (error: unknown) => expect(error).toBeInstanceOf(ForbiddenException)
const codeOf = (error: unknown) => (error as ForbiddenException).getResponse() as { code: string; message: string }
const noCredential = (value: unknown) =>
  expect(JSON.stringify(value)).not.toMatch(/Old-Placeholder-Pass1|New-Placeholder-Pass1|new-hash-placeholder|old-hash-placeholder|placeholder-break-glass-token|"password"|passwordHash|refreshToken|otp/i)

// ── Self-service credential rotation ─────────────────────────────────────────

function authHarness() {
  const db = buildMockDb()
  const audit = { log: jest.fn(async () => undefined) }
  const service = new AuthService(db as never, {} as never, audit as never)
  return { db, audit, service }
}

const USER_ROW = { id: 'user-1', email: 'user@example.test', passwordHash: OLD_HASH, status: 'ACTIVE', isSystemAdmin: false }
const ADMIN_ROW = { id: 'sysadmin-1', email: 'admin@example.test', passwordHash: OLD_HASH, status: 'ACTIVE', isSystemAdmin: true }

describe('self-service credential rotation (POST auth/change-password) — Q-DP24 closure decision 1, prerequisite for Model B', () => {
  it('a system administrator may rotate their own password with the current password + a policy-compliant new one', async () => {
    const h = authHarness()
    const { hashPassword } = await import('./crypto')
    const realHash = await hashPassword(CURRENT)
    h.db.select.mockReturnValueOnce(chain([{ ...ADMIN_ROW, passwordHash: realHash }]))
    const passwordUpdate = chain(undefined)
    const sessionUpdate = chain(undefined)
    h.db.update.mockReturnValueOnce(passwordUpdate).mockReturnValueOnce(sessionUpdate)
    await expect(h.service.changeOwnPassword(ADMIN_ROW.id, CURRENT, NEW)).resolves.toEqual({ success: true })
    expect(sessionUpdate.set).toHaveBeenCalledWith({ isRevoked: true })
  })

  it('a normal (non-admin) user may also rotate their own password — self-service is not admin-only', async () => {
    const h = authHarness()
    const { hashPassword } = await import('./crypto')
    const realHash = await hashPassword(CURRENT)
    h.db.select.mockReturnValueOnce(chain([{ ...USER_ROW, passwordHash: realHash }]))
    const passwordUpdate = chain(undefined)
    const sessionUpdate = chain(undefined)
    h.db.update.mockReturnValueOnce(passwordUpdate).mockReturnValueOnce(sessionUpdate)
    await expect(h.service.changeOwnPassword(USER_ROW.id, CURRENT, NEW)).resolves.toEqual({ success: true })
    expect(passwordUpdate.set).toHaveBeenCalledWith(expect.objectContaining({ passwordHash: expect.any(String) }))
    expect((passwordUpdate.set as jest.Mock).mock.calls[0][0].passwordHash).not.toBe(realHash)
  })

  it('a wrong current password is refused, the stored password is never touched, and the denial is audited without any credential', async () => {
    const h = authHarness()
    const { hashPassword } = await import('./crypto')
    const realHash = await hashPassword(CURRENT)
    h.db.select.mockReturnValueOnce(chain([{ ...ADMIN_ROW, passwordHash: realHash }]))
    const error = await h.service.changeOwnPassword(ADMIN_ROW.id, 'totally-wrong-password', NEW).catch(e => e)
    expect(error).toBeInstanceOf(UnauthorizedException)
    expect(h.db.update).not.toHaveBeenCalled()
    const entry = (h.audit.log.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(entry).toMatchObject({ actionCode: 'USER_SELF_PASSWORD_CHANGED', metadata: expect.objectContaining({ result: 'DENIED', reason: 'CURRENT_PASSWORD_INVALID' }) })
    noCredential(entry)
  })

  it('the canonical password policy governs the new password: a weak new password is refused before any lookup, current password untouched', async () => {
    const h = authHarness()
    const error = await h.service.changeOwnPassword('user-1', CURRENT, 'weak').catch(e => e)
    expect(error).toBeInstanceOf(BadRequestException)
    expect(h.db.select).not.toHaveBeenCalled()
    expect(h.db.update).not.toHaveBeenCalled()
  })

  it('on success: only the hash column changes, every active refresh session for that user is revoked, and the audit carries no credential', async () => {
    const h = authHarness()
    const { hashPassword } = await import('./crypto')
    const realHash = await hashPassword(CURRENT)
    h.db.select.mockReturnValueOnce(chain([{ ...USER_ROW, passwordHash: realHash }]))
    const passwordUpdate = chain(undefined)
    const sessionUpdate = chain(undefined)
    h.db.update.mockReturnValueOnce(passwordUpdate).mockReturnValueOnce(sessionUpdate)
    await expect(h.service.changeOwnPassword('user-1', CURRENT, NEW)).resolves.toEqual({ success: true })
    expect(sessionUpdate.set).toHaveBeenCalledWith({ isRevoked: true })
    const entry = (h.audit.log.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(entry).toMatchObject({ actionCode: 'USER_SELF_PASSWORD_CHANGED', actorId: 'user-1', entityId: 'user-1', metadata: { result: 'SUCCESS', targetUserId: 'user-1' } })
    noCredential(entry)
  })

  it('a write failure is audited as FAILED and rethrown; nothing is silently swallowed', async () => {
    const h = authHarness()
    const { hashPassword } = await import('./crypto')
    const realHash = await hashPassword(CURRENT)
    h.db.select.mockReturnValueOnce(chain([{ ...USER_ROW, passwordHash: realHash }]))
    h.db.update.mockImplementationOnce(() => { throw new Error('db down') })
    await expect(h.service.changeOwnPassword('user-1', CURRENT, NEW)).rejects.toThrow('db down')
    const entry = (h.audit.log.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(entry).toMatchObject({ metadata: expect.objectContaining({ result: 'FAILED', reason: 'ERROR' }) })
  })

  it('has no target/user-id field in its request body — structurally, an actor can only ever rotate THEIR OWN credential, never a tenant admin’s or anyone else’s', async () => {
    const svc = { changeOwnPassword: jest.fn(async () => ({ success: true })) }
    const controller = new AuthController(svc as never)
    await controller.changePassword({ currentPassword: CURRENT, newPassword: NEW }, { id: 'user-1' })
    expect(svc.changeOwnPassword).toHaveBeenCalledWith('user-1', CURRENT, NEW, { impersonation: false, impersonatorUserId: null })
    const source = readFileSync(join(__dirname, 'auth.controller.ts'), 'utf8')
    const method = source.slice(source.indexOf('async changePassword'), source.indexOf('\n}'))
    expect(method).not.toMatch(/@Param\(|targetUserId|userId:/i)
  })

  it('rejects a malformed body before any lookup (missing fields, wrong types)', async () => {
    for (const body of [{}, { currentPassword: '' }, { currentPassword: CURRENT }, { currentPassword: 5, newPassword: NEW }, { currentPassword: CURRENT, newPassword: 5 }]) {
      const svc = { changeOwnPassword: jest.fn() }
      const controller = new AuthController(svc as never)
      const error = await controller.changePassword(body as never, { id: 'user-1' }).catch(e => e)
      expect(error).toBeInstanceOf(BadRequestException)
      expect(svc.changeOwnPassword).not.toHaveBeenCalled()
    }
  })

  it('an impersonation session cannot rotate ANY password, not even the impersonated identity’s own — refused before any lookup, no credential touched', async () => {
    const h = authHarness()
    const error = await h.service.changeOwnPassword('user-1', CURRENT, NEW, { impersonation: true, impersonatorUserId: 'sysadmin-1' }).catch(e => e)
    forbid(error)
    expect(codeOf(error)).toEqual({ code: PRIVILEGE_DENIAL.IMPERSONATION.code, message: PRIVILEGE_DENIAL.IMPERSONATION.message })
    expect(h.db.select).not.toHaveBeenCalled()
    expect(h.db.update).not.toHaveBeenCalled()
    const entry = (h.audit.log.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(entry).toMatchObject({ metadata: expect.objectContaining({ result: 'DENIED', reason: 'IMPERSONATION_SESSION', impersonatorUserId: 'sysadmin-1' }) })
    noCredential(entry)
  })

  it('the controller forwards the session’s impersonation flag and impersonator id from the JWT-derived user, not from the request body', async () => {
    const svc = { changeOwnPassword: jest.fn(async () => ({ success: true })) }
    const controller = new AuthController(svc as never)
    await controller.changePassword({ currentPassword: CURRENT, newPassword: NEW }, { id: 'user-1', impersonation: true, impersonatorUserId: 'sysadmin-1' })
    expect(svc.changeOwnPassword).toHaveBeenCalledWith('user-1', CURRENT, NEW, { impersonation: true, impersonatorUserId: 'sysadmin-1' })
  })
})

// ── Peer system-administrator restriction across MFA reset ─────────────────

function mfaHarness() {
  const db = buildMockDb()
  const audit = { log: jest.fn(async () => undefined) }
  const service = new MfaService(db as never, {} as never, {} as never, {} as never, audit as never)
  return { db, audit, service }
}

describe('MFA reset actor/target rule (TASK-027.47 extends TASK-027.40-R1)', () => {
  const actorRow = chain([{ id: 'sysadmin-1', status: 'ACTIVE', isSystemAdmin: true }])

  it('a system administrator cannot reset their OWN MFA through this admin surface', async () => {
    const h = mfaHarness()
    h.db.select.mockReturnValueOnce(actorRow).mockReturnValueOnce(chain([{ id: 'sysadmin-1', isSystemAdmin: true }]))
    const error = await h.service.adminResetMfa('sysadmin-1', null, 'sysadmin-1').catch(e => e)
    forbid(error)
    expect(h.db.update).not.toHaveBeenCalled()
    expect(h.db.delete).not.toHaveBeenCalled()
    const entry = (h.audit.log.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect((entry.metadata as Record<string, unknown>)).toMatchObject({ result: 'DENIED', reason: 'SELF_CHANGE' })
  })

  it('a system administrator cannot reset a PEER system administrator’s MFA (Model B)', async () => {
    const h = mfaHarness()
    h.db.select.mockReturnValueOnce(actorRow).mockReturnValueOnce(chain([{ id: 'target-1', isSystemAdmin: true }]))
    const error = await h.service.adminResetMfa('sysadmin-1', null, 'target-1').catch(e => e)
    forbid(error)
    expect(codeOf(error)).toEqual({ code: PRIVILEGE_DENIAL.PEER_SYSTEM_ADMIN_CREDENTIAL.code, message: PRIVILEGE_DENIAL.PEER_SYSTEM_ADMIN_CREDENTIAL.message })
    expect(h.db.update).not.toHaveBeenCalled()
    expect(h.db.delete).not.toHaveBeenCalled()
    const entry = (h.audit.log.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect((entry.metadata as Record<string, unknown>)).toMatchObject({ result: 'DENIED', reason: 'PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED' })
  })

  it('a system administrator may still reset an ORDINARY user’s MFA (unchanged since TASK-027.40-R1)', async () => {
    const h = mfaHarness()
    h.db.select.mockReturnValueOnce(actorRow).mockReturnValueOnce(chain([{ id: 'target-1', isSystemAdmin: false }]))
    const update = chain(undefined)
    h.db.update.mockReturnValueOnce(update)
    h.db.delete.mockReturnValueOnce(chain(undefined))
    await expect(h.service.adminResetMfa('sysadmin-1', null, 'target-1')).resolves.toEqual({ success: true })
    expect(update.set).toHaveBeenCalledWith(expect.objectContaining({ isEnabled: false }))
  })

  it('the controller keeps its own sysadmin-only route check ahead of the service (unchanged)', () => {
    const controller = new MfaController({ adminResetMfa: jest.fn() } as never)
    expect(controller.adminReset).toBeInstanceOf(Function)
    const source = readFileSync(join(__dirname, 'mfa.controller.ts'), 'utf8')
    expect(source).toContain('if (!admin.isSystemAdmin) throw new ForbiddenException')
  })
})

// ── Break-glass recovery ─────────────────────────────────────────────────────

const SYSTEM_ROLE_ROW = { id: 'role-sa', name: 'SYSTEM_ADMIN' }
function breakGlassHarness(env: Record<string, string | undefined> = {}) {
  const db = buildMockDb()
  const audit = { log: jest.fn(async () => undefined) }
  const service = new BreakGlassRecoveryService(db as never, audit as never, { BREAK_GLASS_RECOVERY_TOKEN: TOKEN, ...env } as never)
  return { db, audit, service }
}
const noRead = (h: ReturnType<typeof breakGlassHarness>) => expect(h.db.select).not.toHaveBeenCalled()
const noWrite = (h: ReturnType<typeof breakGlassHarness>) => {
  for (const fn of [h.db.insert, h.db.update, h.db.delete, h.db.transaction]) expect(fn).not.toHaveBeenCalled()
}

/** Queues the three DB calls `claimRateLimitSlot()` makes inside its own transaction: an upsert of the
 * singleton row, a `SELECT ... FOR UPDATE` read of it, and the incremented write-back. `attemptCount`/
 * `windowStartAt` let a test start from an already-primed counter (to force RATE_LIMITED or to prove an
 * expired window resets). */
function queueRateLimitOk(h: ReturnType<typeof breakGlassHarness>, attemptCount = 0, windowStartAt: Date = new Date()) {
  h.db.insert.mockReturnValueOnce(chain(undefined))
  h.db.select.mockReturnValueOnce(chain([{ singletonKey: 1, windowStartAt, attemptCount }]))
  h.db.update.mockReturnValueOnce(chain(undefined))
}

/** Stubs `DrizzlePrivilegeSnapshotPort.prototype.load` directly (rather than four chained `db.select` mocks per
 * call site — the service reads this report twice per attempt, once before and once inside the claim
 * transaction) so a test only has to state the one fact that matters: how many ACTIVE system administrators
 * currently exist. */
function mockAdminCount(count: number) {
  const snapshot =
    count > 0
      ? {
          users: [{ id: 'admin-0', status: 'ACTIVE', isSystemAdmin: true }],
          roles: [SYSTEM_ROLE_ROW],
          assignments: [{ id: 'assignment-admin-0', userId: 'admin-0', roleId: 'role-sa', tenantId: null }],
          tenants: [],
        }
      : { users: [], roles: [], assignments: [], tenants: [] }
  return jest.spyOn(DrizzlePrivilegeSnapshotPort.prototype, 'load').mockResolvedValue(snapshot as never)
}

/** Queues the two `db.select` calls (target lookup, canonical SYSTEM_ADMIN assignment lookup) and the claim
 * `db.insert` a run that reaches the final transaction needs, ending in a won or lost claim. */
function queueTargetAndClaim(h: ReturnType<typeof breakGlassHarness>, claimWon: boolean) {
  h.db.select.mockReturnValueOnce(chain([{ id: 'target-1' }])).mockReturnValueOnce(chain([{ id: 'assignment-1' }]))
  h.db.insert.mockReturnValueOnce(chain(claimWon ? [{ id: 'claim-1' }] : []))
}

afterEach(() => jest.restoreAllMocks())

describe('break-glass recovery — last-administrator scenario only (TASK-027.47, Q-DP24 closure decision 4; hardened in TASK-027.47-R1)', () => {
  it('refuses outright when no token is configured (disabled by default) — no database access at all', async () => {
    const h = breakGlassHarness({ BREAK_GLASS_RECOVERY_TOKEN: undefined })
    const outcome = await h.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: NEW })
    expect(outcome).toMatchObject({ success: false, reason: 'BREAK_GLASS_NOT_CONFIGURED', status: BREAK_GLASS_STATUS.INVALID })
    noRead(h); noWrite(h)
    expect(h.audit.log).toHaveBeenCalledTimes(1)
  })

  it.each(['', 'wrong-token', TOKEN.slice(0, -1), TOKEN + 'x', TOKEN.toUpperCase()])(
    'refuses a wrong or malformed token %j — constant-time compare, only the persisted rate-limit counter is touched, no token echoed',
    async provided => {
      const h = breakGlassHarness()
      queueRateLimitOk(h)
      const outcome = await h.service.recover({ token: provided, targetEmail: 'root@example.test', newPassword: NEW })
      expect(outcome).toMatchObject({ success: false, reason: 'INVALID_TOKEN', status: BREAK_GLASS_STATUS.INVALID })
      expect(h.db.insert).toHaveBeenCalledTimes(1) // the rate-limit counter only — no ledger claim was attempted
      expect(h.db.select).toHaveBeenCalledTimes(1) // the rate-limit row only — target/assignment never looked up
      noCredential(h.audit.log.mock.calls[0])
    },
  )

  it('refuses a token past its configured BREAK_GLASS_TOKEN_EXPIRES_AT, before any target lookup or claim attempt', async () => {
    const h = breakGlassHarness({ BREAK_GLASS_TOKEN_EXPIRES_AT: new Date(Date.now() - 60_000).toISOString() })
    queueRateLimitOk(h)
    const outcome = await h.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: NEW })
    expect(outcome).toMatchObject({ success: false, reason: 'TOKEN_EXPIRED', status: BREAK_GLASS_STATUS.EXPIRED })
    expect(h.db.insert).toHaveBeenCalledTimes(1)
  })

  it('a malformed BREAK_GLASS_TOKEN_EXPIRES_AT value is treated as expired (fail closed, never fail open on a bad date)', async () => {
    const h = breakGlassHarness({ BREAK_GLASS_TOKEN_EXPIRES_AT: 'not-a-date' })
    queueRateLimitOk(h)
    const outcome = await h.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: NEW })
    expect(outcome).toMatchObject({ success: false, reason: 'TOKEN_EXPIRED', status: BREAK_GLASS_STATUS.EXPIRED })
  })

  it('a future BREAK_GLASS_TOKEN_EXPIRES_AT does not block an otherwise-legitimate recovery', async () => {
    const h = breakGlassHarness({ BREAK_GLASS_TOKEN_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString() })
    queueRateLimitOk(h)
    mockAdminCount(0)
    queueTargetAndClaim(h, true)
    h.db.update.mockReturnValueOnce(chain(undefined)).mockReturnValueOnce(chain(undefined))
    await expect(h.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: NEW })).resolves.toMatchObject({ success: true })
  })

  it('refuses once the persisted attempt counter is already at the configured threshold — before the token is even compared, and before any target lookup', async () => {
    const h = breakGlassHarness({ BREAK_GLASS_RATE_LIMIT_MAX_ATTEMPTS: '5' })
    queueRateLimitOk(h, 5) // already at the threshold; this attempt pushes the persisted count to 6
    const outcome = await h.service.recover({ token: 'not-even-the-real-token', targetEmail: 'root@example.test', newPassword: NEW })
    expect(outcome).toMatchObject({ success: false, reason: 'RATE_LIMITED', status: BREAK_GLASS_STATUS.RATE_LIMITED })
    expect(h.db.select).toHaveBeenCalledTimes(1) // the rate-limit row only
    expect(h.db.insert).toHaveBeenCalledTimes(1)
    noCredential(h.audit.log.mock.calls[0])
  })

  it('resets the attempt window once it has expired, so an old burst does not permanently lock out recovery', async () => {
    const h = breakGlassHarness()
    queueRateLimitOk(h, 5, new Date(Date.now() - 20 * 60 * 1000)) // 20 minutes old — past the 15-minute default window
    mockAdminCount(0)
    queueTargetAndClaim(h, true)
    h.db.update.mockReturnValueOnce(chain(undefined)).mockReturnValueOnce(chain(undefined))
    await expect(h.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: NEW })).resolves.toMatchObject({ success: true })
  })

  it('refuses when an ACTIVE system administrator already exists — break-glass is for the lost-last-admin scenario only', async () => {
    const h = breakGlassHarness()
    queueRateLimitOk(h)
    mockAdminCount(1)
    const outcome = await h.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: NEW })
    expect(outcome).toMatchObject({ success: false, reason: 'ACTIVE_ADMIN_EXISTS', status: BREAK_GLASS_STATUS.BLOCKED })
    expect(h.db.insert).toHaveBeenCalledTimes(1)
  })

  it('refuses a policy-violating new password — canonical validatePasswordStrength, not a bespoke rule', async () => {
    const h = breakGlassHarness()
    queueRateLimitOk(h)
    mockAdminCount(0)
    const outcome = await h.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: 'weak' })
    expect(outcome).toMatchObject({ success: false, reason: 'WEAK_PASSWORD', status: BREAK_GLASS_STATUS.INVALID })
    expect(h.db.insert).toHaveBeenCalledTimes(1)
  })

  it('refuses an unknown target email', async () => {
    const h = breakGlassHarness()
    queueRateLimitOk(h)
    mockAdminCount(0)
    h.db.select.mockReturnValueOnce(chain([])) // target lookup by email
    const outcome = await h.service.recover({ token: TOKEN, targetEmail: 'nobody@example.test', newPassword: NEW })
    expect(outcome).toMatchObject({ success: false, reason: 'TARGET_NOT_FOUND', status: BREAK_GLASS_STATUS.INVALID })
    expect(h.db.insert).toHaveBeenCalledTimes(1)
  })

  it('never mints new privilege: refuses a target that does NOT already hold the canonical global SYSTEM_ADMIN role assignment', async () => {
    const h = breakGlassHarness()
    queueRateLimitOk(h)
    mockAdminCount(0)
    h.db.select.mockReturnValueOnce(chain([{ id: 'target-1' }])) // target lookup
    h.db.select.mockReturnValueOnce(chain([])) // canonical assignment lookup — none
    const outcome = await h.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: NEW })
    expect(outcome).toMatchObject({ success: false, reason: 'TARGET_NOT_SYSTEM_ADMIN', status: BREAK_GLASS_STATUS.INVALID })
    expect(h.db.insert).toHaveBeenCalledTimes(1)
  })

  it('on success: hashes the password, sets status ACTIVE and the flag true, revokes every active session, claims the single-use ledger, and audits actor=null/target/eventId/status/result only', async () => {
    const h = breakGlassHarness()
    queueRateLimitOk(h)
    mockAdminCount(0)
    queueTargetAndClaim(h, true)
    const userUpdate = chain(undefined)
    const sessionUpdate = chain(undefined)
    h.db.update.mockReturnValueOnce(userUpdate).mockReturnValueOnce(sessionUpdate)
    const outcome = await h.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: NEW })
    expect(outcome).toMatchObject({ success: true, status: BREAK_GLASS_STATUS.USED })
    expect(typeof outcome.eventId).toBe('string')
    expect(h.db.insert).toHaveBeenCalledTimes(2) // rate-limit counter + the ledger claim
    expect(userUpdate.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'ACTIVE', isSystemAdmin: true }))
    expect(sessionUpdate.set).toHaveBeenCalledWith({ isRevoked: true })
    const entry = (h.audit.log.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(entry).toMatchObject({ actorId: null, actionCode: 'BREAK_GLASS_RECOVERY', entityId: 'target-1' })
    expect(Object.keys(entry.metadata as object).sort()).toEqual(['eventId', 'result', 'status', 'targetUserId'])
    noCredential(entry)
  })

  it('is naturally single-use via the admin-count invariant: after a successful recovery, a second attempt is refused because an active administrator now exists', async () => {
    const h = breakGlassHarness()
    queueRateLimitOk(h)
    mockAdminCount(0)
    queueTargetAndClaim(h, true)
    h.db.update.mockReturnValueOnce(chain(undefined)).mockReturnValueOnce(chain(undefined))
    await expect(h.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: NEW })).resolves.toMatchObject({ success: true })

    const h2 = breakGlassHarness()
    queueRateLimitOk(h2)
    mockAdminCount(1)
    const second = await h2.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: NEW })
    expect(second).toMatchObject({ success: false, reason: 'ACTIVE_ADMIN_EXISTS', status: BREAK_GLASS_STATUS.BLOCKED })
    expect(h2.db.insert).toHaveBeenCalledTimes(1)
  })

  it('is single-use via the persisted ledger, not only the admin-count check: a second attempt with the SAME token is refused as already-used even when the admin-count read still reports zero (e.g. the recovered admin was later deactivated)', async () => {
    const h = breakGlassHarness()
    queueRateLimitOk(h)
    mockAdminCount(0)
    queueTargetAndClaim(h, false) // the claim insert conflicts: this token was already consumed
    const outcome = await h.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: NEW })
    expect(outcome).toMatchObject({ success: false, reason: 'TOKEN_ALREADY_USED', status: BREAK_GLASS_STATUS.USED })
    expect(h.db.update).toHaveBeenCalledTimes(1) // only the rate-limit counter — users/authSessions were never touched
  })

  it('the claim is the sole mutual-exclusion point: whichever of two attempts on the same token wins the atomic INSERT succeeds, the loser is refused as already-used and never writes a credential — proved here as two sequential calls against the same ledger row; true concurrent interleaving is Postgres’s unique-constraint guarantee (see the migration) and is exercised for real only by the controlled local-DB smoke test, not by this mock', async () => {
    const winner = breakGlassHarness()
    queueRateLimitOk(winner)
    mockAdminCount(0)
    queueTargetAndClaim(winner, true)
    winner.db.update.mockReturnValueOnce(chain(undefined)).mockReturnValueOnce(chain(undefined))
    const winOutcome = await winner.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: NEW })

    const loser = breakGlassHarness()
    queueRateLimitOk(loser)
    mockAdminCount(0)
    queueTargetAndClaim(loser, false)
    const loseOutcome = await loser.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: NEW })

    expect([winOutcome.success, loseOutcome.success].filter(Boolean)).toHaveLength(1)
    expect(loseOutcome).toMatchObject({ success: false, reason: 'TOKEN_ALREADY_USED' })
    expect(loser.db.update).toHaveBeenCalledTimes(1)
  })

  it('a write failure inside the claim transaction is audited as FAILED (not silently succeeded) and rethrown', async () => {
    const h = breakGlassHarness()
    queueRateLimitOk(h)
    mockAdminCount(0)
    queueTargetAndClaim(h, true)
    h.db.update.mockImplementationOnce(() => { throw new Error('db down') })
    await expect(h.service.recover({ token: TOKEN, targetEmail: 'root@example.test', newPassword: NEW })).rejects.toThrow()
    const entry = (h.audit.log.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(entry).toMatchObject({ metadata: expect.objectContaining({ result: 'FAILED', reason: 'ERROR', status: BREAK_GLASS_STATUS.FAILED }) })
  })

  it('every refusal carries a distinct eventId that never embeds the provided token, password or target email', async () => {
    const h = breakGlassHarness()
    queueRateLimitOk(h)
    const outcome = await h.service.recover({ token: 'wrong', targetEmail: 'root@example.test', newPassword: NEW })
    expect(outcome.eventId).toMatch(/^[0-9a-f-]{36}$/)
    noCredential(outcome)
  })
})

describe('break-glass static boundary — never a normal endpoint (TASK-027.47)', () => {
  const SRC = join(__dirname, '..')
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const service = strip(readFileSync(join(__dirname, 'break-glass', 'break-glass-recovery.service.ts'), 'utf8'))
  const entrypoint = readFileSync(join(__dirname, 'break-glass', 'break-glass-recovery.entrypoint.ts'), 'utf8')

  it('the recovery service is NOT `@Injectable()` and is not listed in platform.module.ts — it cannot be reached through Nest DI or any route', () => {
    expect(service).not.toMatch(/@Injectable\(\)/)
    const module = readFileSync(join(__dirname, 'platform.module.ts'), 'utf8')
    expect(module).not.toMatch(/BreakGlassRecoveryService/)
  })

  it('no controller imports the break-glass module', () => {
    const exposers = walk(SRC).filter(f => f.endsWith('.controller.ts') && /break-glass/.test(readFileSync(f, 'utf8')))
    expect(exposers).toEqual([])
  })

  it('the entrypoint requires DATABASE_URL and all three break-glass env vars before touching the database, and never prints the token, password or a hash', () => {
    expect(entrypoint).toContain('requireDatabaseUrl')
    expect(entrypoint).toContain('BREAK_GLASS_RECOVERY_TOKEN')
    expect(entrypoint).toContain('BREAK_GLASS_TARGET_EMAIL')
    expect(entrypoint).toContain('BREAK_GLASS_NEW_PASSWORD')
    // Only the ENV VAR NAMES (BREAK_GLASS_ENV.TOKEN etc.) may appear in a log line — never the local `token` or
    // `newPassword` variables that hold the actual secret values.
    expect(entrypoint).not.toMatch(/\$\{token\}/)
    expect(entrypoint).not.toMatch(/\$\{newPassword\}/)
  })

  it('does not run anything at import time (only when executed as the entrypoint), mirroring migrate.ts', () => {
    expect(entrypoint).toContain("if (require.main === module)")
  })

  it('the service module imports no HTTP, controller or route-related module', () => {
    expect(service).not.toMatch(/@nestjs\/common|Controller|@(Get|Post|Patch|Delete)\(/)
  })

  it('the token comparison uses timingSafeEqual, never a plain string equality, and hashes both operands first', () => {
    expect(service).toContain('timingSafeEqual')
    expect(service).not.toMatch(/token\s*===\s*(configuredToken|input\.token)/)
  })
})

// ── Mutation-checked invariants (required by the task) ──────────────────────

describe('mutation checks — each of these MUST break tests when the guard is removed', () => {
  it('the peer system-administrator restriction is wired into assertTargetRules (removing it is checked by mutating user.service.ts in CI-equivalent review; see backlog report for the manual mutation run)', () => {
    const source = readFileSync(join(__dirname, 'user.service.ts'), 'utf8')
    expect(source).toContain("if (opts.credentialClass && target.isSystemAdmin)")
    expect((source.match(/credentialClass: true/g) ?? []).length).toBe(3) // setPassword, assignRole, revokeRole
  })

  it('break-glass actor/token/rate-limit/admin-count checks appear before the claim transaction (its first write)', () => {
    const source = readFileSync(join(__dirname, 'break-glass', 'break-glass-recovery.service.ts'), 'utf8')
    const start = source.indexOf('async recover(')
    const body = source.slice(start)
    const firstWrite = body.search(/this\.db\.(update|insert|delete|transaction)\(/)
    for (const check of ['configuredToken', 'claimRateLimitSlot', 'tokensMatch', 'activeSystemAdminCount', 'canonicalAssignment']) {
      const at = body.indexOf(check)
      expect([check, at > -1 && at < firstWrite]).toEqual([check, true])
    }
  })

  it('the single-use ledger claim (unique tokenHash + onConflictDoNothing) is checked before the credential is ever written', () => {
    const source = readFileSync(join(__dirname, 'break-glass', 'break-glass-recovery.service.ts'), 'utf8')
    const start = source.indexOf('async recover(')
    const body = source.slice(start)
    const claimAt = body.indexOf('breakGlassRecoveryEvents')
    const userWriteAt = body.indexOf('tx.update(users)')
    expect(claimAt).toBeGreaterThan(-1)
    expect(userWriteAt).toBeGreaterThan(claimAt)
  })

  it('the rate-limit counter is checked/incremented inside a locked (SELECT ... FOR UPDATE) transaction, not a plain read-then-write', () => {
    const source = readFileSync(join(__dirname, 'break-glass', 'break-glass-recovery.service.ts'), 'utf8')
    expect(source).toContain(".for('update')")
    expect(source).toMatch(/claimRateLimitSlot[\s\S]*?this\.db\.transaction/)
  })

  it('the last-SYSTEM_ADMIN count guard in revokeRole is still present in source (defence-in-depth for flag drift)', () => {
    const source = readFileSync(join(__dirname, 'user.service.ts'), 'utf8')
    expect(source).toContain('Sistemdeki son SYSTEM_ADMIN rol ataması geri alınamaz')
  })

  it('credential redaction: no source file in this feature area echoes a raw password/token variable into a log, audit metadata literal or thrown message', () => {
    for (const file of ['auth.service.ts', 'auth.controller.ts', 'mfa.service.ts', 'user.service.ts', 'break-glass/break-glass-recovery.service.ts', 'break-glass/break-glass-recovery.entrypoint.ts']) {
      const source = readFileSync(join(__dirname, file), 'utf8')
      expect(source).not.toMatch(/summary:\s*`[^`]*\$\{(password|newPassword|currentPassword|token|passwordHash)\}/i)
    }
  })
})
