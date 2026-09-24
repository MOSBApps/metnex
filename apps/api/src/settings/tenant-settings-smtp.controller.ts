import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
} from '@nestjs/common'
import { RequireMfaSetupComplete } from '../platform/decorators/require-mfa-setup-complete.decorator'
import { MfaEnforcementGuard } from '../platform/guards/mfa-enforcement.guard'
import { JwtAuthGuard } from '../platform/jwt-auth.guard'
import { PermissionGuard, RequirePermission } from '../platform/permission.guard'
import { TenantHeaderFormatGuard } from '../platform/guards/tenant-header-format.guard'
import { TenantMembershipGuard } from '../platform/tenant-membership.guard'
import { validateSmtpSettings } from './settings-input.domain'
import { TenantSettingsService, UpsertSmtpOverrideDto } from './tenant-settings.service'

@Controller('settings/smtp')
@UseGuards(JwtAuthGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard, MfaEnforcementGuard)
@RequireMfaSetupComplete()
export class TenantSettingsSmtpController {
  constructor(private readonly svc: TenantSettingsService) {}

  private requireTenantId(tenantId: string | undefined): asserts tenantId is string {
    if (!tenantId) throw new BadRequestException('X-Tenant-Id header zorunludur')
  }

  @Get('effective')
  @RequirePermission('SETTINGS:SMTP:VIEW')
  async getEffective(@Headers('x-tenant-id') tenantId: string) {
    this.requireTenantId(tenantId)
    return this.svc.resolveEffectiveSmtp(tenantId)
  }

  @Get('override')
  @RequirePermission('SETTINGS:SMTP:VIEW')
  async getOverride(@Headers('x-tenant-id') tenantId: string) {
    this.requireTenantId(tenantId)
    return (await this.svc.getSmtpOverride(tenantId)) ?? { exists: false }
  }

  @Put('override')
  @RequirePermission('SETTINGS:SMTP:MANAGE')
  async upsertOverride(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: UpsertSmtpOverrideDto,
  ) {
    this.requireTenantId(tenantId)
    const validation = validateSmtpSettings(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.svc.upsertSmtpOverride(tenantId, dto)
  }

  @Delete('override')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('SETTINGS:SMTP:MANAGE')
  async deleteOverride(@Headers('x-tenant-id') tenantId: string) {
    this.requireTenantId(tenantId)
    await this.svc.deleteSmtpOverride(tenantId)
  }
}
