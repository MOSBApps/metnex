import { Controller, Get, Headers, Param, Query, Res, UseGuards } from '@nestjs/common'
import { Response } from 'express'
import { requireTenantId } from '../common/tenant-header.util'
import { CurrentUser } from '../platform/current-user.decorator'
import { RequireMfaSetupComplete } from '../platform/decorators/require-mfa-setup-complete.decorator'
import { MfaEnforcementGuard } from '../platform/guards/mfa-enforcement.guard'
import { JwtAuthGuard } from '../platform/jwt-auth.guard'
import { PermissionGuard, RequirePermission } from '../platform/permission.guard'
import { ReportRenderService } from './report-render.service'
import { ReportingService } from './reporting.service'

interface AuthUser {
  id: string
}

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionGuard, MfaEnforcementGuard)
@RequireMfaSetupComplete()
export class ReportingController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly reportRender: ReportRenderService,
  ) {}

  @Get('artifacts')
  @RequirePermission('REPORT:ARTIFACT:VIEW')
  async listArtifacts(@Headers('x-tenant-id') tenantId: string | undefined) {
    return this.reporting.listArtifacts(requireTenantId(tenantId))
  }

  /**
   * TASK-027.54 — structured JSON (artifact + raw rows), for the web analysis screen's chart and
   * table. `render` (HTML preview) and `export` (PDF/XLSX) are unchanged; this is additive.
   */
  @Get(':code/data')
  @RequirePermission('REPORT:ARTIFACT:VIEW')
  async data(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Param('code') code: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
  ) {
    return this.reporting.loadData(requireTenantId(tenantId), code, { q, status })
  }

  @Get(':code/render')
  @RequirePermission('REPORT:ARTIFACT:VIEW')
  async render(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Param('code') code: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
  ) {
    return this.reporting.renderHtml(requireTenantId(tenantId), code, { q, status })
  }

  @Get(':code/export/:format')
  @RequirePermission('REPORT:ARTIFACT:EXPORT')
  async export(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Param('code') code: string,
    @Param('format') format: 'PDF' | 'XLSX',
    @Res() res: Response,
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
  ) {
    // TASK-027.57 — user.id (the JWT-validated, DB-re-read session actor `PermissionGuard` already
    // authorized this request for) is only for the export audit trail `exportReport` now writes.
    const payload = await this.reporting.exportReport(requireTenantId(tenantId), code, format, { q, status }, user.id)
    this.reporting.writeDownload(res, payload)
  }

  @Get('renderer/health')
  @RequirePermission('REPORT:ARTIFACT:VIEW')
  async health() {
    return this.reportRender.getHealth()
  }
}
