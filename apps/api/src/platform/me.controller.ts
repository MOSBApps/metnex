import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common'
import { CurrentUser } from './current-user.decorator'
import { validateSetActiveTenant } from './domain/platform-input.domain'
import { JwtAuthGuard } from './jwt-auth.guard'
import { MeService } from './me.service'

interface AuthUser {
  id: string
  email: string
  isSystemAdmin: boolean
}

interface SetActiveTenantDto {
  tenantId: string
}

@Controller('platform/me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get('tenants')
  async myTenants(@CurrentUser() user: AuthUser) {
    return this.meService.getMyTenants(user.id, user.isSystemAdmin)
  }

  @Post('active-tenant')
  @HttpCode(HttpStatus.OK)
  async setActiveTenant(@Body() body: SetActiveTenantDto, @CurrentUser() user: AuthUser) {
    const validation = validateSetActiveTenant(body)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.meService.validateActiveTenant(user.id, body.tenantId, user.isSystemAdmin)
  }

  @Get('tenant-permissions')
  async myTenantPermissions(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header zorunludur')
    }
    return this.meService.getMyTenantPermissions(user.id, tenantId, user.isSystemAdmin)
  }
}
