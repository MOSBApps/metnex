import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../platform/current-user.decorator'
import { RequireMfaSetupComplete } from '../platform/decorators/require-mfa-setup-complete.decorator'
import { MfaEnforcementGuard } from '../platform/guards/mfa-enforcement.guard'
import { JwtAuthGuard } from '../platform/jwt-auth.guard'
import { PerfDbDiagnosticsService } from './perf-db-diagnostics.service'
import {
  validateExplainBody,
  validatePerfId,
  validatePerfSettingsBody,
  validateSlowQueriesQuery,
  validateSlowRequestsQuery,
} from './perf-input.domain'
import { PerfSettingsService } from './perf-settings.service'

interface AuthUser {
  id: string
  isSystemAdmin: boolean
}

function assertSystemAdmin(user: AuthUser) {
  if (!user.isSystemAdmin) {
    throw new ForbiddenException('Bu endpoint yalnızca sistem yöneticilerine açıktır')
  }
}

@Controller('admin/perf')
@UseGuards(JwtAuthGuard, MfaEnforcementGuard)
@RequireMfaSetupComplete()
export class PerfAdminController {
  constructor(
    private readonly diagnostics: PerfDbDiagnosticsService,
    private readonly settings: PerfSettingsService,
  ) {}

  @Get('overview')
  async overview(@CurrentUser() user: AuthUser) {
    assertSystemAdmin(user)
    return this.diagnostics.overview()
  }

  @Get('tables')
  async tables(@CurrentUser() user: AuthUser) {
    assertSystemAdmin(user)
    return this.diagnostics.tableStats()
  }

  @Get('indexes')
  async indexes(@CurrentUser() user: AuthUser) {
    assertSystemAdmin(user)
    return this.diagnostics.indexStats()
  }

  @Get('slow-requests')
  async slowRequests(
    @CurrentUser() user: AuthUser,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
    @Query('tenantId') tenantId?: string,
    @Query('route') route?: string,
    @Query('statusCode') statusCodeStr?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    assertSystemAdmin(user)
    const validation = validateSlowRequestsQuery({ limit: limitStr, offset: offsetStr, tenantId, route, statusCode: statusCodeStr, from, to })
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.diagnostics.slowRequests(
      Math.min(parseInt(limitStr ?? '50', 10) || 50, 200),
      parseInt(offsetStr ?? '0', 10) || 0,
      {
        tenantId,
        route,
        statusCode: statusCodeStr ? parseInt(statusCodeStr, 10) || undefined : undefined,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      },
    )
  }

  @Get('slow-requests/:id')
  async slowRequestDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    assertSystemAdmin(user)
    const validation = validatePerfId(id)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    const detail = await this.diagnostics.slowRequestDetail(id)
    if (!detail) throw new NotFoundException('Yavaş istek logu bulunamadı')
    return detail
  }

  @Get('slow-queries')
  async slowQueries(
    @CurrentUser() user: AuthUser,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    assertSystemAdmin(user)
    const validation = validateSlowQueriesQuery({ limit: limitStr, offset: offsetStr, tenantId })
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.diagnostics.slowQuerySummary(
      Math.min(parseInt(limitStr ?? '30', 10) || 30, 100),
      parseInt(offsetStr ?? '0', 10) || 0,
      tenantId,
    )
  }

  @Get('recommendations')
  async recommendations(@CurrentUser() user: AuthUser) {
    assertSystemAdmin(user)
    return this.diagnostics.recommendations()
  }

  @Post('explain')
  async explain(@CurrentUser() user: AuthUser, @Body() body: { queryHash?: string }) {
    assertSystemAdmin(user)
    const validation = validateExplainBody(body)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.diagnostics.explainQuery(body.queryHash)
  }

  @Get('settings')
  async getSettings(@CurrentUser() user: AuthUser) {
    assertSystemAdmin(user)
    return this.settings.getSettings()
  }

  @Patch('settings')
  async updateSettings(
    @CurrentUser() user: AuthUser,
    @Body() body: { slowRequestThresholdMs?: number; dbTraceEnabled?: boolean },
  ) {
    assertSystemAdmin(user)
    const validation = validatePerfSettingsBody(body)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.settings.updateSettings(body, user.id)
  }
}
