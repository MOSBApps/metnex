import { Body, Controller, Get, Headers, HttpCode, HttpException, Param, Post, UseGuards } from '@nestjs/common'
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
 * TASK-027.71-R1 — DEVELOPMENT-ONLY virtual column management. This controller is added to the reporting module ONLY when
 * `isDevFixtureScopeBridgeEnabled()` (see `scadaApiControllers`): in every other environment these routes do not exist (404).
 * Same guard chain as the analysis controller and the existing `REPORT:ARTIFACT:VIEW` permission (no new code); who may WRITE
 * (create / activate / disable) is decided in the service by the existing role model (active system administrator or the
 * customer root's TENANT_ADMIN). The raw body goes to the pure validator only and is never logged; no expression is ever returned.
 */
@Controller('reports')
@UseGuards(JwtAuthGuard, MfaEnforcementGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard)
@RequireMfaSetupComplete()
export class ScadaVirtualColumnController {
  constructor(private readonly analysis: ScadaAnalysisApiService) {}

  @Get(':code/analysis/virtual-columns')
  @RequirePermission('REPORT:ARTIFACT:VIEW')
  async list(@Headers('x-tenant-id') tenantId: string | undefined, @CurrentUser() user: AuthUser, @Param('code') code: string) {
    try {
      return await this.analysis.listVirtualColumns({ actor: { id: user.id }, tenantId: requireTenantId(tenantId), routeCode: code })
    } catch (error) {
      return toHttp(error)
    }
  }

  @Post(':code/analysis/virtual-columns')
  @HttpCode(201)
  @RequirePermission('REPORT:ARTIFACT:VIEW')
  async create(@Headers('x-tenant-id') tenantId: string | undefined, @CurrentUser() user: AuthUser, @Param('code') code: string, @Body() body: unknown) {
    try {
      return await this.analysis.createVirtualColumn({ actor: { id: user.id }, tenantId: requireTenantId(tenantId), routeCode: code, body })
    } catch (error) {
      return toHttp(error)
    }
  }

  @Post(':code/analysis/virtual-columns/:id/activate')
  @HttpCode(200)
  @RequirePermission('REPORT:ARTIFACT:VIEW')
  async activate(@Headers('x-tenant-id') tenantId: string | undefined, @CurrentUser() user: AuthUser, @Param('code') code: string, @Param('id') id: string) {
    try {
      return await this.analysis.activateVirtualColumn({ actor: { id: user.id }, tenantId: requireTenantId(tenantId), routeCode: code, param: id })
    } catch (error) {
      return toHttp(error)
    }
  }

  @Post(':code/analysis/virtual-columns/:id/disable')
  @HttpCode(200)
  @RequirePermission('REPORT:ARTIFACT:VIEW')
  async disable(@Headers('x-tenant-id') tenantId: string | undefined, @CurrentUser() user: AuthUser, @Param('code') code: string, @Param('id') id: string) {
    try {
      return await this.analysis.disableVirtualColumn({ actor: { id: user.id }, tenantId: requireTenantId(tenantId), routeCode: code, param: id })
    } catch (error) {
      return toHttp(error)
    }
  }
}
