import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { eq } from 'drizzle-orm'
import { DB, type Db } from '../../db/db.module'
import { userMfaSettings } from '../../db/schema'
import { REQUIRE_MFA_SETUP_COMPLETE_KEY } from '../decorators/require-mfa-setup-complete.decorator'
import { MfaRequirementService } from '../mfa-requirement.service'
import type { JwtPayload } from '../auth.service'

@Injectable()
export class MfaEnforcementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Db,
    private readonly mfaRequirement: MfaRequirementService,
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
      throw new ForbiddenException({
        statusCode: 403,
        error: 'MFA_SETUP_REQUIRED',
        message: 'Bu alanı kullanmak için MFA kurulumu gerekiyor.',
      })
    }

    throw new ForbiddenException({
      statusCode: 403,
      error: 'MFA_SESSION_NOT_VERIFIED',
      message: 'Bu alanı kullanmak için mevcut oturumun MFA ile doğrulanması gerekiyor. Lütfen tekrar giriş yapın.',
    })
  }
}
