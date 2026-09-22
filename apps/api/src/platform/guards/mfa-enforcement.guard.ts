import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { eq } from 'drizzle-orm'
import { PlatformAuditService } from '../../audit/platform-audit.service'
import { DB, type Db } from '../../db/db.module'
import { userMfaSettings } from '../../db/schema'
import { REQUIRE_MFA_SETUP_COMPLETE_KEY } from '../decorators/require-mfa-setup-complete.decorator'
import { MfaRequirementService } from '../mfa-requirement.service'
import type { JwtPayload } from '../auth.service'

/**
 * Applied to every controller in scope for TASK-027.48 enforcement (see
 * docs/runbooks/MFA_ENFORCEMENT_ROUTE_MATRIX.md for the exact route list and rationale). A route
 * is only actually gated when combined with `@RequireMfaSetupComplete()` — controllers/routes that
 * are the MFA setup/verification surface itself, or the pre-authentication login/refresh/logout
 * flow, intentionally omit that decorator so a user can always reach the flow that unblocks them.
 * Fail-closed: an unknown/unreadable policy or MFA state denies access, it never grants it.
 */
@Injectable()
export class MfaEnforcementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Db,
    private readonly mfaRequirement: MfaRequirementService,
    private readonly auditService: PlatformAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_MFA_SETUP_COMPLETE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required) return true

    const request = context.switchToHttp().getRequest<{ user: JwtPayload }>()
    const user = request.user
    if (!user) return false

    const isActive = await this.mfaRequirement.isActorActive(user.sub)
    if (!isActive) {
      throw new ForbiddenException('Hesap devre dışı')
    }

    const mfaRequired = await this.mfaRequirement.isRequired(user.sub)
    if (!mfaRequired) return true

    if (user.mfaVerified) return true

    const [mfaSettings] = await this.db
      .select({ isEnabled: userMfaSettings.isEnabled })
      .from(userMfaSettings)
      .where(eq(userMfaSettings.userId, user.sub))
      .limit(1)

    if (!mfaSettings?.isEnabled) {
      await this.writeDenialAudit(user.sub, 'MFA_SETUP_REQUIRED', context)
      throw new ForbiddenException({
        statusCode: 403,
        error: 'MFA_SETUP_REQUIRED',
        message: 'Bu alanı kullanmak için MFA kurulumu gerekiyor.',
      })
    }

    await this.writeDenialAudit(user.sub, 'MFA_SESSION_NOT_VERIFIED', context)
    throw new ForbiddenException({
      statusCode: 403,
      error: 'MFA_SESSION_NOT_VERIFIED',
      message: 'Bu alanı kullanmak için mevcut oturumun MFA ile doğrulanması gerekiyor. Lütfen tekrar giriş yapın.',
    })
  }

  // Best-effort: an audit-write failure must never itself block or unblock a request.
  private async writeDenialAudit(userId: string, reason: 'MFA_SETUP_REQUIRED' | 'MFA_SESSION_NOT_VERIFIED', context: ExecutionContext): Promise<void> {
    try {
      const request = context.switchToHttp().getRequest<{ method: string; url?: string; originalUrl?: string }>()
      await this.auditService.log({
        actorId: userId,
        actionCode: 'MFA_ENFORCEMENT_DENIED',
        entityType: 'UserMfaSettings',
        entityId: userId,
        summary: `MFA zorlaması erişimi reddetti: ${reason}`,
        metadata: { reason, method: request.method, route: request.originalUrl ?? request.url ?? null },
      })
    } catch {
      // logged inside PlatformAuditService already; nothing else to do here
    }
  }
}
