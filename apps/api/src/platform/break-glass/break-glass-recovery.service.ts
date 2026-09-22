import { createHash, randomUUID, timingSafeEqual } from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { PlatformAuditService } from '../../audit/platform-audit.service'
import { assertRow } from '../../db/assert-row'
import type { Db } from '../../db/db.module'
import { authSessions, breakGlassAttempts, breakGlassRecoveryEvents, systemRoles, userSystemRoleAssignments, users } from '../../db/schema'
import { hashPassword } from '../crypto'
import { validatePasswordStrength } from '../domain/auth.domain'
import { normalizeEmail } from '../domain/user.domain'
import { DrizzlePrivilegeSnapshotPort } from '../privilege/privilege-snapshot.drizzle'
import { analyzePrivilegeSnapshot } from '../privilege/privilege-report.domain'
import {
  BREAK_GLASS_ACTION_CODE,
  BREAK_GLASS_DEFAULT_RATE_LIMIT_MAX_ATTEMPTS,
  BREAK_GLASS_DEFAULT_RATE_LIMIT_WINDOW_MS,
  BREAK_GLASS_ENV,
  BREAK_GLASS_REASON,
  BREAK_GLASS_STATUS,
  type BreakGlassOutcome,
  type BreakGlassReason,
  type BreakGlassStatus,
} from './break-glass.contract'

export interface BreakGlassRecoveryInput {
  token: string
  targetEmail: string
  newPassword: string
}

/** Internal control-flow signal used only to unwind out of the claim transaction without committing it. */
class BreakGlassClaimAbort extends Error {
  constructor(readonly status: 'USED' | 'BLOCKED') {
    super(`break-glass claim aborted: ${status}`)
  }
}

/**
 * Restores access to an EXISTING canonical system-administrator account when no active system administrator can
 * currently act (TASK-027.47, Q-DP24 closure decisions 1 and 4; hardened in TASK-027.47-R1). It is a plain class —
 * deliberately NOT `@Injectable()` and never listed in `platform.module.ts` — so it cannot become reachable
 * through Nest's dependency graph or any controller by accident; only the standalone CLI entrypoint and tests
 * construct it.
 *
 * It never mints new privilege: the target must already hold the canonical global `SYSTEM_ADMIN` role assignment
 * (TASK-027.44/.45's canonical source). Every outcome (success and every refusal, including a wrong token) is
 * audited with a fresh `eventId`; nothing but ids, the static reason/status and that eventId is ever written —
 * never the token, the password or the hash.
 *
 * TASK-027.47-R1 hardening, on top of the TASK-027.47 baseline:
 *  - Persisted, cross-process rate limiting (`break_glass_attempts`, a locked singleton row) — every attempt,
 *    successful or not, counts against a fixed window, independent of whether the supplied token was correct.
 *  - An optional explicit expiry (`BREAK_GLASS_TOKEN_EXPIRES_AT`).
 *  - A durable single-use ledger (`break_glass_recovery_events.tokenHash`, UNIQUE) claimed with
 *    `INSERT ... ON CONFLICT DO NOTHING` inside the same transaction as the password/session write. This is the
 *    sole source of the "only one of two concurrent calls can succeed" guarantee: Postgres serializes the
 *    conflicting inserts, so the loser observes zero claimed rows and is refused as already-used without ever
 *    touching the target's credential.
 */
export class BreakGlassRecoveryService {
  constructor(
    private readonly db: Db,
    private readonly auditService: PlatformAuditService,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async recover(input: BreakGlassRecoveryInput): Promise<BreakGlassOutcome> {
    const eventId = randomUUID()

    const configuredToken = this.env[BREAK_GLASS_ENV.TOKEN]
    if (!configuredToken) return this.deny(eventId, null, BREAK_GLASS_REASON.NOT_CONFIGURED, BREAK_GLASS_STATUS.INVALID)

    const rateLimited = await this.claimRateLimitSlot()
    if (rateLimited) return this.deny(eventId, null, BREAK_GLASS_REASON.RATE_LIMITED, BREAK_GLASS_STATUS.RATE_LIMITED)

    if (!this.tokensMatch(input.token, configuredToken)) {
      return this.deny(eventId, null, BREAK_GLASS_REASON.INVALID_TOKEN, BREAK_GLASS_STATUS.INVALID)
    }

    const expiresAtRaw = this.env[BREAK_GLASS_ENV.TOKEN_EXPIRES_AT]
    if (expiresAtRaw) {
      const expiresAt = new Date(expiresAtRaw)
      if (Number.isNaN(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
        return this.deny(eventId, null, BREAK_GLASS_REASON.TOKEN_EXPIRED, BREAK_GLASS_STATUS.EXPIRED)
      }
    }

    const report = analyzePrivilegeSnapshot(await new DrizzlePrivilegeSnapshotPort(this.db).load())
    if (report.invariant.activeSystemAdminCount > 0) {
      return this.deny(eventId, null, BREAK_GLASS_REASON.ACTIVE_ADMIN_EXISTS, BREAK_GLASS_STATUS.BLOCKED)
    }

    const pwCheck = validatePasswordStrength(input.newPassword)
    if (!pwCheck.valid) return this.deny(eventId, null, BREAK_GLASS_REASON.WEAK_PASSWORD, BREAK_GLASS_STATUS.INVALID)

    const email = normalizeEmail(input.targetEmail)
    const [target] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (!target) return this.deny(eventId, null, BREAK_GLASS_REASON.TARGET_NOT_FOUND, BREAK_GLASS_STATUS.INVALID)

    const [canonicalAssignment] = await this.db
      .select({ id: userSystemRoleAssignments.id })
      .from(userSystemRoleAssignments)
      .innerJoin(systemRoles, eq(userSystemRoleAssignments.roleId, systemRoles.id))
      .where(and(eq(userSystemRoleAssignments.userId, target.id), eq(systemRoles.name, 'SYSTEM_ADMIN'), isNull(userSystemRoleAssignments.tenantId)))
      .limit(1)
    if (!canonicalAssignment) {
      return this.deny(eventId, target.id, BREAK_GLASS_REASON.TARGET_NOT_SYSTEM_ADMIN, BREAK_GLASS_STATUS.INVALID)
    }

    const tokenHash = createHash('sha256').update(configuredToken).digest('hex')

    try {
      await this.db.transaction(async tx => {
        const claimed = await tx
          .insert(breakGlassRecoveryEvents)
          .values({ tokenHash, eventId, targetUserId: target.id })
          .onConflictDoNothing({ target: breakGlassRecoveryEvents.tokenHash })
          .returning({ id: breakGlassRecoveryEvents.id })
        if (claimed.length === 0) throw new BreakGlassClaimAbort('USED')

        // Re-read (via a fresh, non-transactional read — DrizzlePrivilegeSnapshotPort takes a plain Db, not
        // a transaction handle) right after winning the claim: narrows, though does not perfectly linearize,
        // the window between the pre-check above and the point this call actually commits a recovery.
        const insideReport = analyzePrivilegeSnapshot(await new DrizzlePrivilegeSnapshotPort(this.db).load())
        if (insideReport.invariant.activeSystemAdminCount > 0) throw new BreakGlassClaimAbort('BLOCKED')

        const passwordHash = await hashPassword(input.newPassword)
        await tx.update(users).set({ passwordHash, status: 'ACTIVE', isSystemAdmin: true }).where(eq(users.id, target.id))
        await tx.update(authSessions).set({ isRevoked: true }).where(and(eq(authSessions.userId, target.id), eq(authSessions.isRevoked, false)))
      })
    } catch (error) {
      if (error instanceof BreakGlassClaimAbort) {
        if (error.status === 'USED') return this.deny(eventId, target.id, BREAK_GLASS_REASON.TOKEN_ALREADY_USED, BREAK_GLASS_STATUS.USED)
        return this.deny(eventId, target.id, BREAK_GLASS_REASON.ACTIVE_ADMIN_EXISTS, BREAK_GLASS_STATUS.BLOCKED)
      }
      await this.audit(eventId, target.id, 'FAILED', BREAK_GLASS_STATUS.FAILED, BREAK_GLASS_REASON.ERROR)
      throw new Error('break-glass recovery failed to write')
    }

    await this.audit(eventId, target.id, 'SUCCESS', BREAK_GLASS_STATUS.USED)
    return { success: true, eventId, status: BREAK_GLASS_STATUS.USED }
  }

  /**
   * Atomically increments the persisted, singleton rate-limit counter inside a `SELECT ... FOR UPDATE`
   * transaction, which serializes concurrent callers — a real, durable, cross-process mechanism (Postgres, not
   * in-memory), because this service already requires direct database access. Returns true when this attempt
   * pushed the window's count over the configured threshold.
   */
  private async claimRateLimitSlot(): Promise<boolean> {
    const maxAttempts = Number(this.env[BREAK_GLASS_ENV.RATE_LIMIT_MAX_ATTEMPTS] ?? BREAK_GLASS_DEFAULT_RATE_LIMIT_MAX_ATTEMPTS)
    const windowMs = Number(this.env[BREAK_GLASS_ENV.RATE_LIMIT_WINDOW_MS] ?? BREAK_GLASS_DEFAULT_RATE_LIMIT_WINDOW_MS)

    return this.db.transaction(async tx => {
      await tx.insert(breakGlassAttempts).values({ singletonKey: 1 }).onConflictDoNothing({ target: breakGlassAttempts.singletonKey })
      const row = assertRow(await tx.select().from(breakGlassAttempts).where(eq(breakGlassAttempts.singletonKey, 1)).for('update'))

      const now = Date.now()
      const windowExpired = now - row.windowStartAt.getTime() > windowMs
      const nextCount = windowExpired ? 1 : row.attemptCount + 1
      const nextWindowStart = windowExpired ? new Date(now) : row.windowStartAt

      await tx.update(breakGlassAttempts).set({ attemptCount: nextCount, windowStartAt: nextWindowStart }).where(eq(breakGlassAttempts.singletonKey, 1))

      return nextCount > maxAttempts
    })
  }

  /** sha256 both sides first so `timingSafeEqual` never sees operands of different length (which it rejects). */
  private tokensMatch(provided: string, configured: string): boolean {
    if (!provided) return false
    const a = createHash('sha256').update(provided).digest()
    const b = createHash('sha256').update(configured).digest()
    return timingSafeEqual(a, b)
  }

  private async deny(eventId: string, targetUserId: string | null, reason: BreakGlassReason, status: BreakGlassStatus): Promise<BreakGlassOutcome> {
    await this.audit(eventId, targetUserId, 'DENIED', status, reason)
    return { success: false, eventId, status, reason }
  }

  /** Every outcome is audited, success included — a break-glass event with no audit trail is not acceptable. */
  private async audit(
    eventId: string,
    targetUserId: string | null,
    result: 'SUCCESS' | 'DENIED' | 'FAILED',
    status: BreakGlassStatus,
    reason?: BreakGlassReason,
  ) {
    await this.auditService.log({
      actorId: null,
      actionCode: BREAK_GLASS_ACTION_CODE,
      entityType: 'User',
      entityId: targetUserId ?? 'BREAK_GLASS',
      summary: 'Break-glass sistem yöneticisi kurtarma işlemi',
      metadata: {
        result,
        status,
        eventId,
        ...(reason ? { reason } : {}),
        ...(targetUserId ? { targetUserId } : {}),
      },
    })
  }
}
