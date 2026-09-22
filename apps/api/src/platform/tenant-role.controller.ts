import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Delete, UseGuards } from '@nestjs/common'
import { CurrentUser } from './current-user.decorator'
import { RequireMfaSetupComplete } from './decorators/require-mfa-setup-complete.decorator'
import { validateId } from './domain/platform-input.domain'
import { MfaEnforcementGuard } from './guards/mfa-enforcement.guard'
import { TenantHeaderFormatGuard } from './guards/tenant-header-format.guard'
import { JwtAuthGuard } from './jwt-auth.guard'
import { PermissionGuard, RequirePermission } from './permission.guard'
import { TenantRoleService } from './tenant-role.service'
import { TenantMembershipGuard } from './tenant-membership.guard'

interface AuthUser {
  id: string
  isSystemAdmin: boolean
  impersonatorUserId?: string | null
  impersonation?: boolean
}

interface AssignTenantRoleBody {
  roleId: string
}

const sessionContext = (user: AuthUser) => ({ impersonatorUserId: user.impersonatorUserId ?? null, impersonation: user.impersonation === true })

/**
 * Tenant-role delegation (TASK-027.49). The acting tenant is always the `X-Tenant-Id` header,
 * resolved to its customer root — same convention as settings/*-controller.ts. Every route
 * requires an ACTIVE, non-impersonated TENANT_ADMIN of that root, or a system administrator
 * (enforced independently in TenantRoleService, not just by PermissionGuard).
 */
@Controller('tenant-roles')
@UseGuards(JwtAuthGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard, MfaEnforcementGuard)
@RequireMfaSetupComplete()
export class TenantRoleController {
  constructor(private readonly tenantRoleService: TenantRoleService) {}

  @Get()
  @RequirePermission('TENANT:ROLE:VIEW')
  async list(@CurrentUser() user: AuthUser, @Headers('x-tenant-id') tenantId: string) {
    return this.tenantRoleService.listRoles(user.id, tenantId, sessionContext(user))
  }

  @Get('assignable')
  @RequirePermission('TENANT:ROLE:VIEW')
  async assignable(@CurrentUser() user: AuthUser, @Headers('x-tenant-id') tenantId: string) {
    return this.tenantRoleService.listAssignableRoles(user.id, tenantId, sessionContext(user))
  }

  @Get('users/:userId')
  @RequirePermission('TENANT:ROLE:VIEW')
  async userAssignments(@Param('userId') userId: string, @CurrentUser() user: AuthUser, @Headers('x-tenant-id') tenantId: string) {
    return this.tenantRoleService.listUserAssignments(user.id, tenantId, userId, sessionContext(user))
  }

  @Post('users/:userId')
  @RequirePermission('TENANT:ROLE:ASSIGN')
  @HttpCode(HttpStatus.CREATED)
  async assign(
    @Param('userId') userId: string,
    @Body() body: AssignTenantRoleBody,
    @CurrentUser() user: AuthUser,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    const validation = validateId(body?.roleId, 'Rol')
    if (!validation.valid) throw new BadRequestException(validation.errors)
    return this.tenantRoleService.assignRole(user.id, tenantId, userId, body.roleId, sessionContext(user))
  }

  @Delete('users/:userId/:assignmentId')
  @RequirePermission('TENANT:ROLE:REVOKE')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('userId') userId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentUser() user: AuthUser,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.tenantRoleService.revokeRole(user.id, tenantId, userId, assignmentId, sessionContext(user))
  }
}
