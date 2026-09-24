import { Body, Controller, Headers, HttpCode, HttpException, Param, Post, UseGuards } from '@nestjs/common'
import { requireTenantId } from '../../../common/tenant-header.util'
import { CurrentUser } from '../../../platform/current-user.decorator'
import { RequireMfaSetupComplete } from '../../../platform/decorators/require-mfa-setup-complete.decorator'
import { MfaEnforcementGuard } from '../../../platform/guards/mfa-enforcement.guard'
import { TenantHeaderFormatGuard } from '../../../platform/guards/tenant-header-format.guard'
import { JwtAuthGuard } from '../../../platform/jwt-auth.guard'
import { PermissionGuard, RequirePermission } from '../../../platform/permission.guard'
import { TenantMembershipGuard } from '../../../platform/tenant-membership.guard'
import { ScadaApiError } from './scada-api.contract'
import { ScadaAnalysisApiService } from './scada-analysis-api.service'

interface AuthUser {
  id: string
}

function toHttp(error: unknown): never {
  if (error instanceof HttpException) throw error
  if (error instanceof ScadaApiError) throw new HttpException({ statusCode: error.status, code: error.code, message: error.code }, error.status)
  throw new HttpException({ statusCode: 500, code: 'SCADA_INTERNAL_ERROR', message: 'SCADA_INTERNAL_ERROR' }, 500)
}

/**
 * TASK-027.59-R1 — DEVELOPMENT-ONLY preset creation (the list / read routes are the always-registered ones of the analysis controller).
 * Registered ONLY behind the four development gates (development + fixture + scope bridge + valid zone): in every other environment
 * the route does not exist (404). Same guard chain and the EXISTING `REPORT:ARTIFACT:VIEW` (no new permission); sharing a preset with the
 * tenant is decided by the service through the existing role model.
 */
@Controller('reports')
@UseGuards(JwtAuthGuard, MfaEnforcementGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard)
@RequireMfaSetupComplete()
export class ScadaPresetController {
  constructor(private readonly analysis: ScadaAnalysisApiService) {}

  @Post(':code/analysis/presets')
  @HttpCode(201)
  @RequirePermission('REPORT:ARTIFACT:VIEW')
  async create(@Headers('x-tenant-id') tenantId: string | undefined, @CurrentUser() user: AuthUser, @Param('code') code: string, @Body() body: unknown) {
    try {
      return await this.analysis.createPreset({ actor: { id: user.id }, tenantId: requireTenantId(tenantId), routeCode: code, body })
    } catch (error) {
      return toHttp(error)
    }
  }
}
