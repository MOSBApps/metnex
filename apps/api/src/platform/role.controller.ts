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
import { JwtAuthGuard } from './jwt-auth.guard'
import { PermissionGuard, RequirePermission } from './permission.guard'
import { AssignPermissionDto, CreateRoleDto, RoleService } from './role.service'

@Controller('platform/roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
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
