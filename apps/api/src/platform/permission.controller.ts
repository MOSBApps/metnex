import { Controller, Get, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from './jwt-auth.guard'
import { PermissionGuard, RequirePermission } from './permission.guard'
import { RoleService } from './role.service'

@Controller('platform/permissions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PermissionController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequirePermission('PLATFORM:PERMISSION:VIEW')
  async list() {
    return this.roleService.availablePermissions()
  }
}
