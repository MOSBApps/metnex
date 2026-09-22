import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { CurrentUser } from './current-user.decorator'
import {
  validateDisableTotp,
  validateMfaPathId,
  validateRegenerateRecoveryCodes,
  validateSetTenantMfaPolicy,
  validateVerifyMfaChallenge,
  validateVerifyTotpSetup,
} from './domain/mfa-input.domain'
import { DisableTotpDto, RegenerateRecoveryCodesDto, SetTenantMfaPolicyDto, VerifyMfaChallengeDto, VerifyTotpSetupDto } from './dto/mfa.dto'
import { MfaService } from './mfa.service'

interface RequestUser {
  id: string
  sub?: string
  email: string
  isSystemAdmin: boolean
  impersonation?: boolean
  impersonatorUserId?: string | null
}

function getUserId(user: RequestUser): string {
  return user.sub ?? user.id
}

@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('status')
  async getStatus(@CurrentUser() user: RequestUser) {
    return { enabled: await this.mfaService.isEnabledForUser(getUserId(user)) }
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('totp/setup')
  @HttpCode(HttpStatus.OK)
  async setupTotp(@CurrentUser() user: RequestUser) {
    return this.mfaService.setupTotp(getUserId(user), user.email)
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('totp/verify-setup')
  @HttpCode(HttpStatus.OK)
  async verifySetup(@CurrentUser() user: RequestUser, @Body() dto: VerifyTotpSetupDto) {
    const validation = validateVerifyTotpSetup(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.mfaService.verifySetup(getUserId(user), null, dto.code)
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('totp/disable')
  @HttpCode(HttpStatus.OK)
  async disableTotp(@CurrentUser() user: RequestUser, @Body() dto: DisableTotpDto) {
    const validation = validateDisableTotp(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.mfaService.disableTotp(getUserId(user), null, dto.password, dto.code)
  }

  @Post('challenge/verify')
  @HttpCode(HttpStatus.OK)
  async verifyChallenge(@Body() dto: VerifyMfaChallengeDto) {
    const validation = validateVerifyMfaChallenge(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.mfaService.verifyChallenge(dto.challengeToken, {
      code: dto.code,
      recoveryCode: dto.recoveryCode,
    })
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('recovery-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  async regenerateRecoveryCodes(@CurrentUser() user: RequestUser, @Body() dto: RegenerateRecoveryCodesDto) {
    const validation = validateRegenerateRecoveryCodes(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.mfaService.regenerateRecoveryCodes(getUserId(user), null, dto.code)
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('admin/:userId/reset')
  @HttpCode(HttpStatus.OK)
  async adminReset(@Param('userId') userId: string, @CurrentUser() admin: RequestUser) {
    // Fail-closed: only system administrators may reset another user's MFA. MfaService.adminResetMfa
    // re-checks this against the database, so the service is safe even when called from elsewhere.
    if (!admin.isSystemAdmin) throw new ForbiddenException('Bu endpoint yalnızca sistem yöneticilerine açıktır')
    const validation = validateMfaPathId(userId, 'Kullanıcı')
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.mfaService.adminResetMfa(getUserId(admin), null, userId, {
      impersonation: admin.impersonation === true,
      impersonatorUserId: admin.impersonatorUserId ?? null,
    })
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('policy')
  async getPolicy(@Param('tenantId') tenantId: string) {
    if (tenantId !== undefined) {
      const validation = validateMfaPathId(tenantId, 'Kiracı')
      if (!validation.valid) throw new BadRequestException(validation.errors)
    }
    if (!tenantId) return { mfaRequired: false }
    return this.mfaService.getTenantPolicy(tenantId)
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('policy')
  async setPolicy(@CurrentUser() user: RequestUser, @Param('tenantId') tenantId: string, @Body() dto: SetTenantMfaPolicyDto) {
    const validation = validateSetTenantMfaPolicy(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    if (tenantId !== undefined) {
      const validation = validateMfaPathId(tenantId, 'Kiracı')
      if (!validation.valid) throw new BadRequestException(validation.errors)
    }
    if (!tenantId) return { mfaRequired: false }
    return this.mfaService.setTenantPolicy(tenantId, dto.mfaRequired, getUserId(user))
  }
}
