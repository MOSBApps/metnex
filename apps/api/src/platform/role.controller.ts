import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { RequireMfaSetupComplete } from './decorators/require-mfa-setup-complete.decorator'
import { MfaEnforcementGuard } from './guards/mfa-enforcement.guard'
import { JwtAuthGuard } from './jwt-auth.guard'
import { PermissionGuard, RequirePermission } from './permission.guard'
import { AssignPermissionDto, CreateRoleDto, RoleService } from './role.service'

@Controller('platform/roles')
@UseGuards(JwtAuthGuard, PermissionGuard, MfaEnforcementGuard)
@RequireMfaSetupComplete()
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequirePermission('PLATFORM:ROLE:VIEW')
  async list() {
    return this.roleService.list()
  }

  @Post()
  @RequirePermission('PLATFORM:ROLE:CREATE')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateRoleDto) {
    return this.roleService.create(body)
  }

  @Get(':id')
  @RequirePermission('PLATFORM:ROLE:VIEW')
  async detail(@Param('id') id: string) {
    return this.roleService.findById(id)
  }

  @Post(':id/permissions')
  @RequirePermission('PLATFORM:PERMISSION:ASSIGN')
  @HttpCode(HttpStatus.CREATED)
  async assignPermission(@Param('id') id: string, @Body() body: AssignPermissionDto) {
    return this.roleService.assignPermission(id, body)
  }
}
