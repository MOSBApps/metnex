import { BadRequestException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import type { JwtSignOptions } from '@nestjs/jwt'
import { JwtService } from '@nestjs/jwt'
import { randomBytes } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { PlatformAuditService } from '../audit/platform-audit.service'
import { DB, type Db } from '../db/db.module'
import { authSessions, userMfaSettings, users } from '../db/schema'
import { hashPassword, hashRefreshToken, verifyPassword } from './crypto'
import { assessSession, computeSessionExpiry, validatePasswordStrength } from './domain/auth.domain'
import { PRIVILEGE_DENIAL } from './domain/privilege-ceiling.domain'
import { normalizeEmail } from './domain/user.domain'
import { MFA_CHALLENGE_SCOPE, MFA_CHALLENGE_TTL } from './mfa-challenge.constants'

export interface JwtPayload {
  sub: string
  email: string
  isSystemAdmin: boolean
  mfaVerified?: boolean
  impersonation?: boolean
  impersonatorUserId?: string
  impersonatorEmail?: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface MfaChallengeResponse {
  requiresMfa: true
  method: 'TOTP'
  mfaChallengeToken: string
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jwtService: JwtService,
    private readonly auditService: PlatformAuditService,
  ) {}

  async login(email: string, password: string, metadata?: Record<string, unknown>): Promise<TokenPair | MfaChallengeResponse> {
    const normalizedEmail = normalizeEmail(email)
    const [user] = await this.db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1)

    if (!user || user.status !== 'ACTIVE') {
      await this.auditService.log({
        actionCode: 'LOGIN_FAILED',
        entityType: 'Auth',
        entityId: normalizedEmail,
        summary: `${normalizedEmail} için giriş denemesi başarısız oldu`,
        metadata,
      })
      throw new UnauthorizedException('INVALID_CREDENTIALS')
    }

    const passwordValid = await verifyPassword(password, user.passwordHash)
    if (!passwordValid) {
      await this.auditService.log({
        actorId: user.id,
        actionCode: 'LOGIN_FAILED',
        entityType: 'Auth',
        entityId: user.id,
        summary: `${user.email} için giriş denemesi başarısız oldu`,
        metadata,
      })
      throw new UnauthorizedException('INVALID_CREDENTIALS')
    }

    const [mfaSettings] = await this.db
      .select({ isEnabled: userMfaSettings.isEnabled })
      .from(userMfaSettings)
      .where(eq(userMfaSettings.userId, user.id))
      .limit(1)

    if (mfaSettings?.isEnabled) {
      const mfaChallengeToken = this.jwtService.sign(
        { sub: user.id, scope: MFA_CHALLENGE_SCOPE },
        { expiresIn: MFA_CHALLENGE_TTL },
      )
      return {
        requiresMfa: true,
        method: 'TOTP',
        mfaChallengeToken,
      }
    }

    await this.auditService.log({
      actorId: user.id,
      actionCode: 'LOGIN_SUCCEEDED',
      entityType: 'Auth',
      entityId: user.id,
      summary: `${user.email} sisteme giriş yaptı`,
      metadata,
    })

    return this.issueTokenPair(user.id, user.email, user.isSystemAdmin, false)
  }

  async refreshAccessToken(refreshToken: string, metadata?: Record<string, unknown>): Promise<TokenPair> {
    const tokenHash = hashRefreshToken(refreshToken)
    const [row] = await this.db
      .select({ session: authSessions, user: users })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(eq(authSessions.refreshTokenHash, tokenHash))
      .limit(1)

    if (!row) throw new UnauthorizedException('INVALID_REFRESH_TOKEN')
    const { session, user } = row

    const assessment = assessSession({ expiresAt: session.expiresAt, isRevoked: session.isRevoked })
    if (!assessment.usable) throw new UnauthorizedException('SESSION_EXPIRED_OR_REVOKED')
    if (user.status !== 'ACTIVE') throw new ForbiddenException('USER_INACTIVE')

    await this.db.update(authSessions).set({ isRevoked: true }).where(eq(authSessions.id, session.id))

    await this.auditService.log({
      actorId: user.id,
      actionCode: 'SESSION_REFRESHED',
      entityType: 'AuthSession',
      entityId: session.id,
      summary: `${user.email} için oturum yenilendi`,
      metadata,
    })

    return this.issueTokenPair(user.id, user.email, user.isSystemAdmin, false)
  }

  async logout(refreshToken: string, metadata?: Record<string, unknown>): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken)
    const [row] = await this.db
      .select({ session: authSessions, user: users })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(eq(authSessions.refreshTokenHash, tokenHash))
      .limit(1)

    await this.db
      .update(authSessions)
      .set({ isRevoked: true })
      .where(and(eq(authSessions.refreshTokenHash, tokenHash), eq(authSessions.isRevoked, false)))

    if (row?.user) {
      await this.auditService.log({
        actorId: row.user.id,
        actionCode: 'LOGOUT',
        entityType: 'AuthSession',
        entityId: row.session.id,
        summary: `${row.user.email} sistemden çıkış yaptı`,
        metadata,
      })
    }
  }

  async validateJwtPayload(payload: JwtPayload) {
    const [user] = await this.db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
    if (!user || user.status !== 'ACTIVE') return null
    // The request user must never carry the credential hash around (defence in depth; see toSessionUserView).
    const { passwordHash: _passwordHash, ...safeUser } = user
    void _passwordHash
    return {
      ...safeUser,
      mfaVerified: payload.mfaVerified ?? false,
      impersonation: payload.impersonation ?? false,
      impersonatorUserId: payload.impersonatorUserId ?? null,
      impersonatorEmail: payload.impersonatorEmail ?? null,
    }
  }

  async hashNewPassword(password: string): Promise<string> {
    return hashPassword(password)
  }

  /**
   * Self-service credential rotation (TASK-027.47, Q-DP24 closure decision 1 — required before the peer
   * system-administrator restriction could be turned on). The caller's current password must verify against the
   * stored hash; the new password goes through the canonical policy. Every active session (refresh token) for the
   * user is revoked on success, forcing re-authentication everywhere within at most the access-token TTL
   * (`JWT_EXPIRES_IN`, default 15m) — the access token itself cannot be revoked immediately: there is no
   * blacklist/denylist infrastructure, so this bounded exposure window is an accepted, documented residual risk
   * (see the decision package), not an oversight. Never logs, audits or returns the password or hash.
   */
  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context: { impersonation?: boolean; impersonatorUserId?: string | null } = {},
  ): Promise<{ success: boolean }> {
    // Impersonation sessions never administer credentials, not even their own — the impersonated identity is not
    // the operator's own account (TASK-027.47-R1, same rule as UserService/MfaService/SaasService). Refused before
    // any lookup, no detail about the target beyond its id, best-effort DENIED audit only.
    if (context.impersonation === true || context.impersonatorUserId) {
      await this.auditService
        .log({
          actorId: userId,
          actionCode: 'USER_SELF_PASSWORD_CHANGED',
          entityType: 'User',
          entityId: userId,
          summary: 'Impersonation oturumunda parola değişikliği reddedildi',
          metadata: { result: 'DENIED', reason: 'IMPERSONATION_SESSION', targetUserId: userId, ...(context.impersonatorUserId ? { impersonatorUserId: context.impersonatorUserId } : {}) },
        })
        .catch(() => undefined)
      throw new ForbiddenException({ code: PRIVILEGE_DENIAL.IMPERSONATION.code, message: PRIVILEGE_DENIAL.IMPERSONATION.message })
    }

    // Pure, I/O-free first (the controller already checked this, but the service re-validates independently — the
    // same defence-in-depth pattern as UserService.setPassword — so it stays safe if ever called from elsewhere).
    const pwCheck = validatePasswordStrength(newPassword)
    if (!pwCheck.valid) throw new BadRequestException(pwCheck.errors)

    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Kod doğrulanamadı.')

    const currentValid = await verifyPassword(currentPassword, user.passwordHash)
    if (!currentValid) {
      await this.auditService.log({
        actorId: userId,
        actionCode: 'USER_SELF_PASSWORD_CHANGED',
        entityType: 'User',
        entityId: userId,
        summary: `${user.email} kendi parolasını değiştirmeye çalıştı`,
        metadata: { result: 'DENIED', reason: 'CURRENT_PASSWORD_INVALID', targetUserId: userId },
      })
      throw new UnauthorizedException('Mevcut parola doğrulanamadı')
    }

    const passwordHash = await hashPassword(newPassword)
    try {
      await this.db.update(users).set({ passwordHash }).where(eq(users.id, userId))
      await this.db.update(authSessions).set({ isRevoked: true }).where(and(eq(authSessions.userId, userId), eq(authSessions.isRevoked, false)))
    } catch (error) {
      await this.auditService.log({
        actorId: userId,
        actionCode: 'USER_SELF_PASSWORD_CHANGED',
        entityType: 'User',
        entityId: userId,
        summary: `${user.email} kendi parolasını değiştiremedi`,
        metadata: { result: 'FAILED', reason: 'ERROR', targetUserId: userId },
      })
      throw error
    }

    await this.auditService.log({
      actorId: userId,
      actionCode: 'USER_SELF_PASSWORD_CHANGED',
      entityType: 'User',
      entityId: userId,
      summary: `${user.email} kendi parolasını değiştirdi`,
      metadata: { result: 'SUCCESS', targetUserId: userId },
    })

    return { success: true }
  }

  async issueTokenPairForVerifiedMfa(userId: string): Promise<TokenPair> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('USER_NOT_FOUND')

    await this.auditService.log({
      actorId: user.id,
      actionCode: 'MFA_LOGIN_VERIFIED',
      entityType: 'Auth',
      entityId: user.id,
      summary: `${user.email} MFA doğrulamasını tamamlayıp sisteme giriş yaptı`,
    })

    return this.issueTokenPair(user.id, user.email, user.isSystemAdmin, true)
  }

  async issueImpersonationAccessToken(actorUserId: string, targetUserId: string) {
    const [[actor], [target]] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, actorUserId)).limit(1),
      this.db.select().from(users).where(eq(users.id, targetUserId)).limit(1),
    ])

    if (!actor || actor.status !== 'ACTIVE' || !actor.isSystemAdmin) {
      throw new UnauthorizedException('IMPERSONATION_NOT_ALLOWED')
    }
    if (!target || target.status !== 'ACTIVE') {
      throw new UnauthorizedException('TARGET_USER_NOT_AVAILABLE')
    }

    const payload: JwtPayload = {
      sub: target.id,
      email: target.email,
      isSystemAdmin: target.isSystemAdmin,
      mfaVerified: true,
      impersonation: true,
      impersonatorUserId: actor.id,
      impersonatorEmail: actor.email,
    }

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: (process.env['JWT_IMPERSONATION_EXPIRES_IN'] ??
        '1h') as JwtSignOptions['expiresIn'],
    })

    await this.auditService.log({
      actorId: actor.id,
      actionCode: 'USER_IMPERSONATION_STARTED',
      entityType: 'User',
      entityId: target.id,
      summary: `${actor.email}, ${target.email} için impersonation başlattı`,
      metadata: {
        impersonatedUserId: target.id,
        impersonatedUserEmail: target.email,
      },
    })

    return {
      accessToken,
      impersonatedUser: {
        id: target.id,
        email: target.email,
        displayName: target.displayName,
      },
      impersonator: {
        id: actor.id,
        email: actor.email,
        displayName: actor.displayName,
      },
    }
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    isSystemAdmin: boolean,
    mfaVerified: boolean = false,
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: userId, email, isSystemAdmin, mfaVerified }
    const accessToken = this.jwtService.sign(payload)

    const rawRefreshToken = randomBytes(32).toString('hex')
    const refreshTokenHash = hashRefreshToken(rawRefreshToken)
    const refreshDays = Number(process.env['JWT_REFRESH_EXPIRES_IN_DAYS'] ?? 7)

    await this.db.insert(authSessions).values({
      userId,
      refreshTokenHash,
      expiresAt: computeSessionExpiry(refreshDays),
      isRevoked: false,
    })

    return { accessToken, refreshToken: rawRefreshToken }
  }
}

