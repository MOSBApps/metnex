import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { and, eq, isNull } from 'drizzle-orm'
import { authenticator } from 'otplib'
import * as QRCode from 'qrcode'
import { PlatformAuditService } from '../audit/platform-audit.service'
import { DB, type Db } from '../db/db.module'
import { tenantSecuritySettings, userMfaRecoveryCodes, userMfaSettings, users, tenants } from '../db/schema'
import { AuthService } from './auth.service'
import { validateMfaPathId } from './domain/mfa-input.domain'
import { PRIVILEGE_DENIAL } from './domain/privilege-ceiling.domain'
import { verifyPassword } from './crypto'
import { MFA_CHALLENGE_SCOPE } from './mfa-challenge.constants'
import { MfaCryptoService } from './mfa-crypto.service'
import { generateRecoveryCodes } from './mfa-recovery-code.util'

const RECOVERY_CODE_COUNT = 10
const OTP_BCRYPT_ROUNDS = 10

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name)

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MfaCryptoService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly auditService: PlatformAuditService,
  ) {}

  async isEnabledForUser(userId: string): Promise<boolean> {
    const [settings] = await this.db
      .select({ isEnabled: userMfaSettings.isEnabled })
      .from(userMfaSettings)
      .where(eq(userMfaSettings.userId, userId))
      .limit(1)
    return settings?.isEnabled ?? false
  }

  async setupTotp(userId: string, email: string): Promise<{ otpauthUri: string; qrDataUri: string; secret: string }> {
    const alreadyEnabled = await this.isEnabledForUser(userId)
    if (alreadyEnabled) {
      throw new BadRequestException('MFA zaten etkin — önce mevcut kurulumu devre dışı bırakmalısınız')
    }

    const secret = authenticator.generateSecret()
    const { encrypted, keyVersion } = this.crypto.encrypt(secret)

    const [existing] = await this.db
      .select({ id: userMfaSettings.id })
      .from(userMfaSettings)
      .where(eq(userMfaSettings.userId, userId))
      .limit(1)

    if (existing) {
      await this.db
        .update(userMfaSettings)
        .set({
          secretEncrypted: encrypted,
          keyVersion,
          isEnabled: false,
          enabledAt: null,
          updatedAt: new Date(),
        })
        .where(eq(userMfaSettings.userId, userId))
    } else {
      await this.db.insert(userMfaSettings).values({
        userId,
        method: 'TOTP',
        secretEncrypted: encrypted,
        keyVersion,
        isEnabled: false,
      })
    }

    const otpauthUri = authenticator.keyuri(email, 'Metnex', secret)
    const qrDataUri = await QRCode.toDataURL(otpauthUri)

    return { otpauthUri, qrDataUri, secret }
  }

  async verifySetup(userId: string, tenantId: string | null, code: string): Promise<{ recoveryCodes: string[] }> {
    const [settings] = await this.db
      .select()
      .from(userMfaSettings)
      .where(eq(userMfaSettings.userId, userId))
      .limit(1)

    if (!settings?.secretEncrypted || settings.isEnabled) {
      throw new BadRequestException('Devam eden bir MFA kurulumu bulunamadı — önce /auth/mfa/totp/setup çağrılmalı')
    }

    const secret = this.crypto.decrypt(settings.secretEncrypted, settings.keyVersion ?? undefined)
    if (!secret || !authenticator.check(code, secret)) {
      throw new UnauthorizedException('Kod doğrulanamadı.')
    }

    const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT)
    const hashedCodes = await Promise.all(recoveryCodes.map(c => bcrypt.hash(c, OTP_BCRYPT_ROUNDS)))

    await this.db.transaction(async tx => {
      await tx
        .update(userMfaSettings)
        .set({ isEnabled: true, enabledAt: new Date(), updatedAt: new Date() })
        .where(eq(userMfaSettings.userId, userId))

      await tx.insert(userMfaRecoveryCodes).values(hashedCodes.map(codeHash => ({ userId, codeHash })))
    })

    await this.writeAudit({
      actorId: userId,
      tenantId,
      action: 'MFA_ENABLED',
      entityId: userId,
    })

    this.logger.log(`MFA (TOTP) etkinleştirildi: userId=${userId}`)
    return { recoveryCodes }
  }

  async disableTotp(
    userId: string,
    tenantId: string | null,
    password: string,
    code: string,
  ): Promise<{ success: boolean }> {
    const [user] = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!user) throw new UnauthorizedException('Kod doğrulanamadı.')

    const passwordValid = await verifyPassword(password, user.passwordHash)
    if (!passwordValid) throw new UnauthorizedException('Kod doğrulanamadı.')

    const [settings] = await this.db
      .select()
      .from(userMfaSettings)
      .where(and(eq(userMfaSettings.userId, userId), eq(userMfaSettings.isEnabled, true)))
      .limit(1)
    if (!settings?.secretEncrypted) {
      throw new BadRequestException('MFA zaten etkin değil')
    }

    const secret = this.crypto.decrypt(settings.secretEncrypted, settings.keyVersion ?? undefined)
    if (!secret || !authenticator.check(code, secret)) {
      throw new UnauthorizedException('Kod doğrulanamadı.')
    }

    await this.disableInternal(userId)
    await this.writeAudit({
      actorId: userId,
      tenantId,
      action: 'MFA_DISABLED',
      entityId: userId,
    })
    this.logger.log(`MFA (TOTP) devre dışı bırakıldı: userId=${userId}`)
    return { success: true }
  }

  async adminResetMfa(
    actorId: string,
    tenantId: string | null,
    targetUserId: string,
    context: { impersonation?: boolean; impersonatorUserId?: string | null; actorMfaVerified?: boolean } = {},
  ): Promise<{ success: boolean }> {
    // Impersonation sessions never administer credentials (TASK-027.46): refused before any lookup, with a static code,
    // no detail about the target and only a best-effort DENIED audit (writeAudit never throws).
    if (context.impersonation === true || context.impersonatorUserId) {
      await this.writeAudit({
        actorId,
        tenantId,
        action: 'MFA_ADMIN_RESET',
        entityId: validateMfaPathId(targetUserId, 'Kullanıcı').valid ? targetUserId : actorId,
        newValue: { result: 'DENIED', reason: 'IMPERSONATION_SESSION', ...(context.impersonatorUserId ? { impersonatorUserId: context.impersonatorUserId } : {}) },
      })
      throw new ForbiddenException({ code: PRIVILEGE_DENIAL.IMPERSONATION.code, message: PRIVILEGE_DENIAL.IMPERSONATION.message })
    }
    // Second, controller-independent authorization (TASK-027.40-R1). The actor is re-read from the database so a
    // stale or forged claim cannot authorize: only an ACTIVE system administrator may reset another user's MFA.
    // No permission code exists for this action yet, so system-administrator-only is the interim rule (Q-DP22).
    // Nothing is written and nothing is audited before this check passes.
    const actorCheck = validateMfaPathId(actorId, 'Kullanıcı')
    const [actor] = actorCheck.valid
      ? await this.db
          .select({ id: users.id, status: users.status, isSystemAdmin: users.isSystemAdmin, mfaEnabled: userMfaSettings.isEnabled })
          .from(users)
          .leftJoin(userMfaSettings, eq(userMfaSettings.userId, users.id))
          .where(eq(users.id, actorId))
          .limit(1)
      : []
    if (!actor || actor.status !== 'ACTIVE' || !actor.isSystemAdmin) {
      throw new ForbiddenException('Bu işlem için yetkiniz bulunmuyor')
    }

    // Q-DP22c(1): if the actor's own account has MFA enabled, this admin surface requires the
    // current session to itself be MFA-verified (not just password-authenticated) — a stolen
    // password-only session must not be able to strip another user's MFA. An actor who has not
    // enabled MFA yet is temporarily allowed through (no bootstrap/recovery path would exist
    // otherwise) but the allowance is recorded in the audit trail for later review.
    const actorMfaEnabled = actor.mfaEnabled === true
    if (actorMfaEnabled && context.actorMfaVerified !== true) {
      await this.writeAudit({
        actorId, tenantId, action: 'MFA_ADMIN_RESET', entityId: targetUserId,
        newValue: { result: 'DENIED', reason: 'ACTOR_MFA_NOT_VERIFIED' },
      })
      throw new ForbiddenException('Bu işlem için mevcut oturumunuzun MFA ile doğrulanmış olması gerekiyor')
    }

    const targetCheck = validateMfaPathId(targetUserId, 'Kullanıcı')
    if (!targetCheck.valid) throw new BadRequestException(targetCheck.errors)
    const [target] = await this.db.select({ id: users.id, isSystemAdmin: users.isSystemAdmin }).from(users).where(eq(users.id, targetUserId)).limit(1)
    if (!target) throw new NotFoundException('Kullanıcı bulunamadı')

    // A system administrator may not MFA-reset themselves through this admin surface — use totp/disable (password +
    // code) instead — and, as of TASK-027.47 (Model B), may not MFA-reset a PEER system administrator either.
    if (targetUserId === actorId) {
      await this.writeAudit({
        actorId, tenantId, action: 'MFA_ADMIN_RESET', entityId: targetUserId,
        newValue: { result: 'DENIED', reason: 'SELF_CHANGE' },
      })
      throw new ForbiddenException('Kendi MFA ayarınızı bu yüzeyden sıfırlayamazsınız — totp/disable kullanın')
    }
    if (target.isSystemAdmin) {
      await this.writeAudit({
        actorId, tenantId, action: 'MFA_ADMIN_RESET', entityId: targetUserId,
        newValue: { result: 'DENIED', reason: 'PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED' },
      })
      throw new ForbiddenException({ code: PRIVILEGE_DENIAL.PEER_SYSTEM_ADMIN_CREDENTIAL.code, message: PRIVILEGE_DENIAL.PEER_SYSTEM_ADMIN_CREDENTIAL.message })
    }

    await this.disableInternal(targetUserId)
    await this.writeAudit({
      actorId,
      tenantId,
      action: 'MFA_ADMIN_RESET',
      entityId: targetUserId,
      newValue: actorMfaEnabled ? { targetUserId } : { targetUserId, actorMfaBypassWarning: 'ACTOR_HAS_NO_MFA_ENABLED' },
    })
    this.logger.warn(`MFA admin reset: actor=${actorId} target=${targetUserId}`)
    return { success: true }
  }

  async verifyChallenge(challengeToken: string, input: { code?: string; recoveryCode?: string }) {
    let payload: { sub: string; scope: string }
    try {
      payload = this.jwtService.verify(challengeToken)
    } catch {
      throw new UnauthorizedException('Kod doğrulanamadı.')
    }
    if (payload.scope !== MFA_CHALLENGE_SCOPE) {
      throw new UnauthorizedException('Kod doğrulanamadı.')
    }

    const userId = payload.sub

    const [user] = await this.db.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1)
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Kod doğrulanamadı.')
    }

    const [settings] = await this.db
      .select()
      .from(userMfaSettings)
      .where(and(eq(userMfaSettings.userId, userId), eq(userMfaSettings.isEnabled, true)))
      .limit(1)
    if (!settings?.secretEncrypted) {
      throw new UnauthorizedException('Kod doğrulanamadı.')
    }

    const verified = input.recoveryCode
      ? await this.verifyAndConsumeRecoveryCode(userId, input.recoveryCode)
      : input.code
        ? this.verifyTotpCode(settings.secretEncrypted, settings.keyVersion, input.code)
        : false

    if (!verified) {
      await this.writeAudit({
        actorId: userId,
        tenantId: null,
        action: 'MFA_CHALLENGE_FAILED',
        entityId: userId,
        newValue: { method: input.recoveryCode ? 'RECOVERY_CODE' : 'TOTP' },
      })
      throw new UnauthorizedException('Kod doğrulanamadı.')
    }

    await this.db.update(userMfaSettings).set({ lastVerifiedAt: new Date() }).where(eq(userMfaSettings.userId, userId))

    return this.authService.issueTokenPairForVerifiedMfa(userId)
  }

  async regenerateRecoveryCodes(
    userId: string,
    tenantId: string | null,
    code: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const [settings] = await this.db
      .select()
      .from(userMfaSettings)
      .where(and(eq(userMfaSettings.userId, userId), eq(userMfaSettings.isEnabled, true)))
      .limit(1)
    if (!settings?.secretEncrypted) {
      throw new BadRequestException('MFA etkin değil')
    }

    const secret = this.crypto.decrypt(settings.secretEncrypted, settings.keyVersion ?? undefined)
    if (!secret || !authenticator.check(code, secret)) {
      throw new UnauthorizedException('Kod doğrulanamadı.')
    }

    const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT)
    const hashedCodes = await Promise.all(recoveryCodes.map(c => bcrypt.hash(c, OTP_BCRYPT_ROUNDS)))

    await this.db
      .delete(userMfaRecoveryCodes)
      .where(and(eq(userMfaRecoveryCodes.userId, userId), isNull(userMfaRecoveryCodes.usedAt)))
    await this.db.insert(userMfaRecoveryCodes).values(hashedCodes.map(codeHash => ({ userId, codeHash })))

    await this.writeAudit({
      actorId: userId,
      tenantId,
      action: 'MFA_RECOVERY_CODES_REGENERATED',
      entityId: userId,
    })

    return { recoveryCodes }
  }

  /**
   * Fail-closed, controller-independent authorization for the tenant MFA policy surface
   * (Q-DP22b): only an ACTIVE system administrator may read or change any tenant's policy. No
   * per-tenant permission code exists for this yet (interim rule, same shape as Q-DP22 admin
   * reset) — the actor is re-read from the database so a stale/forged JWT claim cannot authorize.
   */
  private async assertActingSystemAdmin(actorId: string): Promise<void> {
    const actorCheck = validateMfaPathId(actorId, 'Kullanıcı')
    const [actor] = actorCheck.valid
      ? await this.db.select({ status: users.status, isSystemAdmin: users.isSystemAdmin }).from(users).where(eq(users.id, actorId)).limit(1)
      : []
    if (!actor || actor.status !== 'ACTIVE' || !actor.isSystemAdmin) {
      throw new ForbiddenException('Bu işlem için yetkiniz bulunmuyor')
    }
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const [tenant] = await this.db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
    if (!tenant) throw new NotFoundException('Kiracı bulunamadı')
  }

  async getTenantPolicy(actorId: string, tenantId: string): Promise<{ mfaRequired: boolean }> {
    await this.assertActingSystemAdmin(actorId)
    await this.assertTenantExists(tenantId)
    const [row] = await this.db
      .select({ mfaRequired: tenantSecuritySettings.mfaRequired })
      .from(tenantSecuritySettings)
      .where(eq(tenantSecuritySettings.tenantId, tenantId))
      .limit(1)
    return { mfaRequired: row?.mfaRequired ?? false }
  }

  async setTenantPolicy(actorId: string, tenantId: string, mfaRequired: boolean): Promise<{ mfaRequired: boolean }> {
    await this.assertActingSystemAdmin(actorId)
    await this.assertTenantExists(tenantId)

    const [existing] = await this.db
      .select({ tenantId: tenantSecuritySettings.tenantId, mfaRequired: tenantSecuritySettings.mfaRequired })
      .from(tenantSecuritySettings)
      .where(eq(tenantSecuritySettings.tenantId, tenantId))
      .limit(1)

    if (existing) {
      await this.db
        .update(tenantSecuritySettings)
        .set({ mfaRequired, updatedAt: new Date(), updatedBy: actorId })
        .where(eq(tenantSecuritySettings.tenantId, tenantId))
    } else {
      await this.db.insert(tenantSecuritySettings).values({
        tenantId,
        mfaRequired,
        updatedBy: actorId,
      })
    }

    await this.writeAudit({
      actorId,
      tenantId,
      action: 'MFA_POLICY_UPDATED',
      entityId: tenantId,
      newValue: { mfaRequired, previous: existing?.mfaRequired ?? false },
    })

    return { mfaRequired }
  }

  private verifyTotpCode(secretEncrypted: string, keyVersion: string | null, code: string): boolean {
    const secret = this.crypto.decrypt(secretEncrypted, keyVersion ?? undefined)
    if (!secret) return false
    return authenticator.check(code, secret)
  }

  private async verifyAndConsumeRecoveryCode(userId: string, recoveryCode: string): Promise<boolean> {
    const candidates = await this.db
      .select()
      .from(userMfaRecoveryCodes)
      .where(and(eq(userMfaRecoveryCodes.userId, userId), isNull(userMfaRecoveryCodes.usedAt)))

    for (const candidate of candidates) {
      const matches = await bcrypt.compare(recoveryCode, candidate.codeHash)
      if (matches) {
        const consumed = await this.db
          .update(userMfaRecoveryCodes)
          .set({ usedAt: new Date() })
          .where(and(eq(userMfaRecoveryCodes.id, candidate.id), isNull(userMfaRecoveryCodes.usedAt)))
          .returning({ id: userMfaRecoveryCodes.id })
        if (consumed.length === 0) return false
        return true
      }
    }
    return false
  }

  private async disableInternal(userId: string): Promise<void> {
    await this.db
      .update(userMfaSettings)
      .set({
        isEnabled: false,
        secretEncrypted: null,
        keyVersion: null,
        enabledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(userMfaSettings.userId, userId))
    await this.db.delete(userMfaRecoveryCodes).where(eq(userMfaRecoveryCodes.userId, userId))
  }

  private async writeAudit(opts: {
    actorId: string | null
    tenantId: string | null
    action: string
    entityId?: string | null
    newValue?: unknown
  }): Promise<void> {
    try {
      await this.auditService.log({
        actorId: opts.actorId,
        actionCode: opts.action,
        entityType: 'UserMfaSettings',
        entityId: opts.entityId ?? opts.actorId ?? 'system',
        summary: `MFA Aksiyonu: ${opts.action}`,
        metadata: (opts.newValue as Record<string, unknown>) ?? null,
      })
    } catch (e) {
      this.logger.warn(`MFA audit log yazılamadı (${opts.action}): ${e}`)
    }
  }
}
