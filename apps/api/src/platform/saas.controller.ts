import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { CurrentUser } from './current-user.decorator'
import { RequireMfaSetupComplete } from './decorators/require-mfa-setup-complete.decorator'
import { MfaEnforcementGuard } from './guards/mfa-enforcement.guard'
import { JwtAuthGuard } from './jwt-auth.guard'
import { PermissionGuard, RequirePermission } from './permission.guard'
import {
  AddMembershipDto,
  CreateResourcePackageDto,
  CustomerAdminCreateTenantDto,
  CustomerAdminCreateUserDto,
  ProvisionCustomerDto,
  SaasService,
} from './saas.service'

interface AuthUser {
  id: string
  isSystemAdmin: boolean
  impersonatorUserId?: string | null
  impersonation?: boolean
}

const sessionContext = (user: AuthUser) => ({ impersonatorUserId: user.impersonatorUserId ?? null, impersonation: user.impersonation === true })

@Controller('platform/saas')
@UseGuards(JwtAuthGuard, PermissionGuard, MfaEnforcementGuard)
@RequireMfaSetupComplete()
export class SaasController {
  constructor(private readonly saasService: SaasService) {}

  @Get('packages')
  @RequirePermission('PLATFORM:PACKAGE:VIEW')
  async listPackages() {
    return this.saasService.listPackages()
  }

  @Post('packages')
  @RequirePermission('PLATFORM:PACKAGE:MANAGE')
  @HttpCode(HttpStatus.CREATED)
  async createPackage(@Body() body: CreateResourcePackageDto) {
    return this.saasService.createPackage(body)
  }

  @Post('customers/provision')
  @RequirePermission('PLATFORM:CUSTOMER:PROVISION')
  @HttpCode(HttpStatus.CREATED)
  async provisionCustomer(@Body() body: ProvisionCustomerDto) {
    return this.saasService.provisionCustomer(body)
  }

  @Get('subscriptions')
  @RequirePermission('PLATFORM:PACKAGE:VIEW')
  async listSubscriptions() {
    return this.saasService.listSubscriptions()
  }
}

@Controller('customer-admin')
@UseGuards(JwtAuthGuard, PermissionGuard, MfaEnforcementGuard)
@RequireMfaSetupComplete()
export class CustomerAdminController {
  constructor(private readonly saasService: SaasService) {}

  @Get('overview')
  @RequirePermission('CUSTOMER:ADMIN:VIEW')
  async overview(
    @CurrentUser() user: AuthUser,
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    return this.saasService.getCustomerOverview(user.id, user.isSystemAdmin, tenantId ?? '')
  }

  @Get('subscription')
  @RequirePermission('CUSTOMER:ADMIN:VIEW')
  async subscription(
    @CurrentUser() user: AuthUser,
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    return this.saasService.getCustomerOverview(user.id, user.isSystemAdmin, tenantId ?? '')
  }

  @Get('tenants')
  @RequirePermission('CUSTOMER:ADMIN:VIEW')
  async listTenants(
    @CurrentUser() user: AuthUser,
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    return this.saasService.listCustomerTenants(user.id, user.isSystemAdmin, tenantId ?? '')
  }

  @Post('tenants')
  @RequirePermission('CUSTOMER:ADMIN:MANAGE')
  @HttpCode(HttpStatus.CREATED)
  async createTenant(
    @CurrentUser() user: AuthUser,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Body() body: CustomerAdminCreateTenantDto,
  ) {
    return this.saasService.createCustomerTenant(user.id, user.isSystemAdmin, tenantId ?? '', body)
  }

  @Get('users')
  @RequirePermission('CUSTOMER:ADMIN:VIEW')
  async listUsers(
    @CurrentUser() user: AuthUser,
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    return this.saasService.listCustomerUsers(user.id, user.isSystemAdmin, tenantId ?? '')
  }

  @Post('users')
  @RequirePermission('CUSTOMER:ADMIN:MANAGE')
  @HttpCode(HttpStatus.CREATED)
  async createUser(
    @CurrentUser() user: AuthUser,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Body() body: CustomerAdminCreateUserDto,
  ) {
    return this.saasService.createCustomerUser(user.id, user.isSystemAdmin, tenantId ?? '', body, sessionContext(user))
  }

  @Patch('users/:id')
  @RequirePermission('CUSTOMER:ADMIN:MANAGE')
  async updateUser(
    @CurrentUser() user: AuthUser,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Param('id') targetUserId: string,
    @Body() body: { displayName?: string },
  ) {
    return this.saasService.updateCustomerUser(
      user.id,
      user.isSystemAdmin,
      tenantId ?? '',
      targetUserId,
      body,
      sessionContext(user),
    )
  }

  @Post('users/:id/set-password')
  @RequirePermission('CUSTOMER:ADMIN:MANAGE')
  @HttpCode(HttpStatus.OK)
  async setUserPassword(
    @CurrentUser() user: AuthUser,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Param('id') targetUserId: string,
    @Body() body: { password: string },
  ) {
    return this.saasService.setCustomerUserPassword(
      user.id,
      user.isSystemAdmin,
      tenantId ?? '',
      targetUserId,
      body.password,
      sessionContext(user),
    )
  }

  @Post('users/:id/memberships')
  @RequirePermission('CUSTOMER:ADMIN:MANAGE')
  @HttpCode(HttpStatus.CREATED)
  async addMembership(
    @CurrentUser() user: AuthUser,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Param('id') targetUserId: string,
    @Body() body: AddMembershipDto,
  ) {
    return this.saasService.addCustomerUserMembership(
      user.id,
      user.isSystemAdmin,
      tenantId ?? '',
      targetUserId,
      body,
      sessionContext(user),
    )
  }
}
