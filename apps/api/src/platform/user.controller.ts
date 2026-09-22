import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { CurrentUser } from './current-user.decorator'
import { JwtAuthGuard } from './jwt-auth.guard'
import { PermissionGuard, RequirePermission } from './permission.guard'
import { AssignRoleDto, CreateUserDto, UpdateUserDto, UserListQuery, UserService } from './user.service'

interface AuthUser {
  id: string
  impersonatorUserId?: string | null
  impersonation?: boolean
}

const sessionContext = (user: AuthUser) => ({ impersonatorUserId: user.impersonatorUserId ?? null, impersonation: user.impersonation === true })

@Controller('platform/users')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequirePermission('PLATFORM:USER:VIEW')
  async list(@Query() query: UserListQuery) {
    return this.userService.list(query)
  }

  @Post()
  @RequirePermission('PLATFORM:USER:CREATE')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.userService.create(body, user.id)
  }

  @Get('assignable-roles')
  @RequirePermission('PLATFORM:USER:ASSIGN_ROLE')
  async listAssignableRoles() {
    return this.userService.listAssignableRoles()
  }

  @Get('assignable-tenants')
  @RequirePermission('PLATFORM:USER:MANAGE_MEMBERSHIP')
  async listAssignableTenants() {
    return this.userService.listAssignableTenants()
  }

  @Get(':id')
  @RequirePermission('PLATFORM:USER:VIEW')
  async detail(@Param('id') id: string) {
    return this.userService.findById(id)
  }

  @Patch(':id')
  @RequirePermission('PLATFORM:USER:UPDATE')
  async update(@Param('id') id: string, @Body() body: UpdateUserDto, @CurrentUser() user: AuthUser) {
    return this.userService.update(id, body, user.id, sessionContext(user))
  }

  @Post(':id/set-password')
  @RequirePermission('PLATFORM:USER:UPDATE')
  @HttpCode(HttpStatus.OK)
  async setPassword(
    @Param('id') id: string,
    @Body() body: { password: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.userService.setPassword(id, body.password, user.id, sessionContext(user))
  }

  @Post(':id/impersonate')
  @RequirePermission('PLATFORM:USER:UPDATE')
  @HttpCode(HttpStatus.OK)
  async impersonate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.userService.impersonate(id, user.id)
  }

  @Post(':id/deactivate')
  @RequirePermission('PLATFORM:USER:DEACTIVATE')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.userService.deactivate(id, user.id, sessionContext(user))
  }

  @Post(':id/roles')
  @RequirePermission('PLATFORM:USER:ASSIGN_ROLE')
  @HttpCode(HttpStatus.CREATED)
  async assignRole(@Param('id') userId: string, @Body() body: AssignRoleDto, @CurrentUser() user: AuthUser) {
    return this.userService.assignRole(userId, body, user.id, sessionContext(user))
  }

  @Delete(':id/roles/:assignmentId')
  @RequirePermission('PLATFORM:USER:REVOKE_ROLE')
  @HttpCode(HttpStatus.OK)
  async revokeRole(
    @Param('id') userId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.userService.revokeRole(userId, assignmentId, user.id, sessionContext(user))
  }

  @Get(':id/memberships')
  @RequirePermission('PLATFORM:USER:VIEW')
  async listMemberships(@Param('id') userId: string) {
    return this.userService.listMemberships(userId)
  }

  @Post(':id/memberships')
  @RequirePermission('PLATFORM:USER:MANAGE_MEMBERSHIP')
  @HttpCode(HttpStatus.CREATED)
  async addMembership(
    @Param('id') userId: string,
    @Body() body: { tenantId: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.userService.addMembership(userId, body.tenantId, user.id, sessionContext(user))
  }

  @Delete(':id/memberships/:membershipId')
  @RequirePermission('PLATFORM:USER:MANAGE_MEMBERSHIP')
  @HttpCode(HttpStatus.OK)
  async removeMembership(
    @Param('id') userId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.userService.removeMembership(userId, membershipId, user.id, sessionContext(user))
  }
}
