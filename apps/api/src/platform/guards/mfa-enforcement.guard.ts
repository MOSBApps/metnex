import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { eq } from 'drizzle-orm'
import { PlatformAuditService } from '../../audit/platform-audit.service'
import { DB, type Db } from '../../db/db.module'
import { userMfaSettings } from '../../db/schema'
import { REQUIRE_MFA_SETUP_COMPLETE_KEY } from '../decorators/require-mfa-setup-complete.decorator'
import { MfaRequirementService } from '../mfa-requirement.service'

/**
 * The object `JwtStrategy.validate()` actually attaches to `request.user` is
 * `AuthService.validateJwtPayload()`'s return value — a spread of the `users` row plus a few JWT
 * claims — which carries `id`, not `sub` (`sub` only exists on the raw, pre-validation JWT
 * payload). Reading `user.sub` here always resolved to `undefined`, so every MFA-enforced request
 * from every real user hit the `isActorActive(undefined)` → no matching row → "Hesap devre dışı"
 * path, regardless of the user's actual DB status (TASK-027.60 root cause). `mfa.controller.ts`
 * already guards against this ambiguity with the same `sub ?? id` fallback — mirrored here.
 */
interface RequestUser {
  id: string
  sub?: string
}

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

    const request = context.switchToHttp().getRequest<{ user: RequestUser & { mfaVerified?: boolean } }>()
    const user = request.user
    if (!user) return false
    const userId = user.sub ?? user.id
    if (!userId) return false

    const isActive = await this.mfaRequirement.isActorActive(userId)
    if (!isActive) {
      throw new ForbiddenException('Hesap devre dışı')
    }

    const mfaRequired = await this.mfaRequirement.isRequired(userId)
    if (!mfaRequired) return true

    if (user.mfaVerified) return true

    const [mfaSettings] = await this.db
      .select({ isEnabled: userMfaSettings.isEnabled })
      .from(userMfaSettings)
      .where(eq(userMfaSettings.userId, userId))
      .limit(1)

    if (!mfaSettings?.isEnabled) {
      await this.writeDenialAudit(userId, 'MFA_SETUP_REQUIRED', context)
      throw new ForbiddenException({
        statusCode: 403,
        error: 'MFA_SETUP_REQUIRED',
        message: 'Bu alanı kullanmak için MFA kurulumu gerekiyor.',
      })
    }

    await this.writeDenialAudit(userId, 'MFA_SESSION_NOT_VERIFIED', context)
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
