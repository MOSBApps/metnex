import { Controller, Get, UseGuards } from '@nestjs/common'
import { RequireMfaSetupComplete } from './decorators/require-mfa-setup-complete.decorator'
import { MfaEnforcementGuard } from './guards/mfa-enforcement.guard'
import { JwtAuthGuard } from './jwt-auth.guard'
import { PermissionGuard, RequirePermission } from './permission.guard'
import { RoleService } from './role.service'

@Controller('platform/permissions')
@UseGuards(JwtAuthGuard, PermissionGuard, MfaEnforcementGuard)
@RequireMfaSetupComplete()
export class PermissionController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequirePermission('PLATFORM:PERMISSION:VIEW')
  async list() {
    return this.roleService.availablePermissions()
  }
}
