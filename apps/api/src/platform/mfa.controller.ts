import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, Patch, Post, Res, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { Response } from 'express'
import { COOKIE_MAX_AGE_MS, REFRESH_COOKIE } from './auth.controller'
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
  mfaVerified?: boolean
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
  async verifyChallenge(@Body() dto: VerifyMfaChallengeDto, @Res({ passthrough: true }) res: Response) {
    const validation = validateVerifyMfaChallenge(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    const { accessToken, refreshToken } = await this.mfaService.verifyChallenge(dto.challengeToken, {
      code: dto.code,
      recoveryCode: dto.recoveryCode,
    })
    // Same httpOnly refresh cookie contract as POST /auth/login — an MFA-verified login must be
    // able to silently refresh its session exactly like a non-MFA login.
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/',
    })
    return { accessToken }
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
      actorMfaVerified: admin.mfaVerified === true,
    })
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('policy/:tenantId')
  async getPolicy(@CurrentUser() user: RequestUser, @Param('tenantId') tenantId: string) {
    if (!user.isSystemAdmin) throw new ForbiddenException('Bu endpoint yalnızca sistem yöneticilerine açıktır')
    const validation = validateMfaPathId(tenantId, 'Kiracı')
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.mfaService.getTenantPolicy(getUserId(user), tenantId)
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('policy/:tenantId')
  async setPolicy(@CurrentUser() user: RequestUser, @Param('tenantId') tenantId: string, @Body() dto: SetTenantMfaPolicyDto) {
    if (!user.isSystemAdmin) throw new ForbiddenException('Bu endpoint yalnızca sistem yöneticilerine açıktır')
    const idValidation = validateMfaPathId(tenantId, 'Kiracı')
    if (!idValidation.valid) throw new BadRequestException(idValidation.errors)
    const validation = validateSetTenantMfaPolicy(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.mfaService.setTenantPolicy(getUserId(user), tenantId, dto.mfaRequired)
  }
}
