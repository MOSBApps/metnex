import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../platform/current-user.decorator'
import { JwtAuthGuard } from '../platform/jwt-auth.guard'
import { PlatformAuditService } from './platform-audit.service'

interface AuthUser {
  id: string
  isSystemAdmin: boolean
}

@Controller('platform-audit-logs')
@UseGuards(JwtAuthGuard)
export class PlatformAuditController {
  constructor(private readonly auditService: PlatformAuditService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('actorId') actorId?: string,
    @Query('actionCode') actionCode?: string,
    @Query('entityType') entityType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    if (!user.isSystemAdmin) {
      throw new ForbiddenException('Bu endpoint yalnızca sistem yöneticilerine açıktır')
    }

    const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 200)
    const offset = parseInt(offsetStr ?? '0', 10) || 0

    return this.auditService.list({
      actorId,
      actionCode,
      entityType,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      q,
      limit,
      offset,
    })
  }
}
