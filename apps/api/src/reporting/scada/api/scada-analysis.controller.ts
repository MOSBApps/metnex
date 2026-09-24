import { Body, Controller, Get, Headers, HttpCode, HttpException, Param, Post, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
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

/** A static, code-only error body: never a provider text, SQL, a name or an echo of the request. */
function toHttp(error: unknown): never {
  if (error instanceof HttpException) throw error // e.g. the missing-header BadRequest raised before the service
  if (error instanceof ScadaApiError) throw new HttpException({ statusCode: error.status, code: error.code, message: error.code }, error.status)
  throw new HttpException({ statusCode: 500, code: 'SCADA_INTERNAL_ERROR', message: 'SCADA_INTERNAL_ERROR' }, 500)
}

/**
 * TASK-027.72 — additive SCADA analysis endpoints of the reporting module. Guard ORDER (declared, executed left to right):
 * JWT authentication → MFA enforcement → tenant header format → tenant membership → permission (`REPORT:ARTIFACT:VIEW`, the
 * existing view permission; no new code). The pure request validation and every source / preset authorisation run inside the
 * service, after ALL guards. The raw body is handed to the validator only — never to a domain service and never logged.
 */
@Controller('reports')
@UseGuards(JwtAuthGuard, MfaEnforcementGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard)
@RequireMfaSetupComplete()
export class ScadaAnalysisController {
  constructor(private readonly analysis: ScadaAnalysisApiService) {}

  @Post(':code/analysis/query')
  @HttpCode(200)
  @RequirePermission('REPORT:ARTIFACT:VIEW')
  async analyse(@Headers('x-tenant-id') tenantId: string | undefined, @CurrentUser() user: AuthUser, @Param('code') code: string, @Body() body: unknown) {
    try {
      return await this.analysis.runAnalysis({ actor: { id: user.id }, tenantId: requireTenantId(tenantId), routeCode: code, body })
    } catch (error) {
      return toHttp(error)
    }
  }

  /**
   * TASK-027.74 — export of the analysis / comparison on screen (CSV, XLSX, PDF; PNG returns the caption only). Same guard chain, but
   * the EXISTING export permission `REPORT:ARTIFACT:EXPORT` (its denial is audited by the PermissionGuard as REPORT_EXPORT_DENIED,
   * before any provider is reached). Errors are static codes; bytes leave only after the export audit record is durable.
   */
  @Post(':code/analysis/export/:format')
  @HttpCode(200)
  @RequirePermission('REPORT:ARTIFACT:EXPORT')
  async exportAnalysis(@Headers('x-tenant-id') tenantId: string | undefined, @CurrentUser() user: AuthUser, @Param('code') code: string, @Param('format') format: string, @Body() body: unknown, @Res() res: Response) {
    let result
    try {
      result = await this.analysis.runExport({ actor: { id: user.id }, tenantId: requireTenantId(tenantId), routeCode: code, param: format, body })
    } catch (error) {
      return toHttp(error)
    }
    if (result.kind === 'PNG_CAPTION') {
      res.status(200).json({ format: result.format, exportId: result.exportId, fileName: result.fileName, title: result.title, captionLines: result.captionLines, developmentLabel: result.developmentLabel, rowCount: result.rowCount })
      return
    }
    res.setHeader('Content-Type', result.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).send(result.buffer)
  }

  /** PNG step 2: the browser reports the outcome once the PNG bytes exist (or failed to); the success audit is written here, never before. */
  @Post(':code/analysis/export/PNG/complete')
  @HttpCode(200)
  @RequirePermission('REPORT:ARTIFACT:EXPORT')
  async completePngExport(@Headers('x-tenant-id') tenantId: string | undefined, @CurrentUser() user: AuthUser, @Param('code') code: string, @Body() body: unknown) {
    try {
      return await this.analysis.completePngExport({ actor: { id: user.id }, tenantId: requireTenantId(tenantId), routeCode: code, body })
    } catch (error) {
      return toHttp(error)
    }
  }

  @Post(':code/analysis/compare')
  @HttpCode(200)
  @RequirePermission('REPORT:ARTIFACT:VIEW')
  async compare(@Headers('x-tenant-id') tenantId: string | undefined, @CurrentUser() user: AuthUser, @Param('code') code: string, @Body() body: unknown) {
    try {
      return await this.analysis.runComparison({ actor: { id: user.id }, tenantId: requireTenantId(tenantId), routeCode: code, body })
    } catch (error) {
      return toHttp(error)
    }
  }

  @Get(':code/analysis/catalog')
  @RequirePermission('REPORT:ARTIFACT:VIEW')
  async catalog(@Headers('x-tenant-id') tenantId: string | undefined, @CurrentUser() user: AuthUser, @Param('code') code: string) {
    try {
      return await this.analysis.getCatalog({ actor: { id: user.id }, tenantId: requireTenantId(tenantId), routeCode: code })
    } catch (error) {
      return toHttp(error)
    }
  }

  @Get(':code/analysis/presets')
  @RequirePermission('REPORT:ARTIFACT:VIEW')
  async listPresets(@Headers('x-tenant-id') tenantId: string | undefined, @CurrentUser() user: AuthUser, @Param('code') code: string) {
    try {
      return await this.analysis.listPresets({ actor: { id: user.id }, tenantId: requireTenantId(tenantId), routeCode: code })
    } catch (error) {
      return toHttp(error)
    }
  }

  @Get(':code/analysis/presets/:presetId')
  @RequirePermission('REPORT:ARTIFACT:VIEW')
  async getPreset(@Headers('x-tenant-id') tenantId: string | undefined, @CurrentUser() user: AuthUser, @Param('code') code: string, @Param('presetId') presetId: string) {
    try {
      return await this.analysis.getPreset({ actor: { id: user.id }, tenantId: requireTenantId(tenantId), routeCode: code, param: presetId })
    } catch (error) {
      return toHttp(error)
    }
  }
}
