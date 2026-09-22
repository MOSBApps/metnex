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
import { JwtAuthGuard } from '../platform/jwt-auth.guard'
import { PermissionGuard, RequirePermission } from '../platform/permission.guard'
import { TenantHeaderFormatGuard } from '../platform/guards/tenant-header-format.guard'
import { TenantMembershipGuard } from '../platform/tenant-membership.guard'
import { validateAiSettings } from './settings-input.domain'
import { TenantSettingsService, UpsertAiOverrideDto } from './tenant-settings.service'

@Controller('settings/ai-provider')
@UseGuards(JwtAuthGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard)
export class TenantSettingsAiController {
  constructor(private readonly svc: TenantSettingsService) {}

  private requireTenantId(tenantId: string | undefined): asserts tenantId is string {
    if (!tenantId) throw new BadRequestException('X-Tenant-Id header zorunludur')
  }

  @Get('effective')
  @RequirePermission('SETTINGS:AI_PROVIDER:VIEW')
  async getEffective(@Headers('x-tenant-id') tenantId: string) {
    this.requireTenantId(tenantId)
    return this.svc.resolveEffectiveAiProvider(tenantId)
  }

  @Get('override')
  @RequirePermission('SETTINGS:AI_PROVIDER:VIEW')
  async getOverride(@Headers('x-tenant-id') tenantId: string) {
    this.requireTenantId(tenantId)
    return (await this.svc.getAiProviderOverride(tenantId)) ?? { exists: false }
  }

  @Put('override')
  @RequirePermission('SETTINGS:AI_PROVIDER:MANAGE')
  async upsertOverride(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: UpsertAiOverrideDto,
  ) {
    this.requireTenantId(tenantId)
    const validation = validateAiSettings(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.svc.upsertAiProviderOverride(tenantId, dto)
  }

  @Delete('override')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('SETTINGS:AI_PROVIDER:MANAGE')
  async deleteOverride(@Headers('x-tenant-id') tenantId: string) {
    this.requireTenantId(tenantId)
    await this.svc.deleteAiProviderOverride(tenantId)
  }
}
