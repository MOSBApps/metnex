import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { RequireMfaSetupComplete } from './decorators/require-mfa-setup-complete.decorator'
import { MfaEnforcementGuard } from './guards/mfa-enforcement.guard'
import { JwtAuthGuard } from './jwt-auth.guard'
import { PermissionGuard, RequirePermission } from './permission.guard'
import {
  AddMemberDto,
  CreateTenantDto,
  TenantListQuery,
  TenantService,
  UpdateTenantDto,
} from './tenant.service'

@Controller('platform/tenants')
@UseGuards(JwtAuthGuard, PermissionGuard, MfaEnforcementGuard)
@RequireMfaSetupComplete()
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  @RequirePermission('PLATFORM:TENANT:VIEW')
  async list(@Query() query: TenantListQuery) {
    return this.tenantService.list(query)
  }

  @Post()
  @RequirePermission('PLATFORM:TENANT:CREATE')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateTenantDto) {
    return this.tenantService.create(body)
  }

  @Get(':id')
  @RequirePermission('PLATFORM:TENANT:VIEW')
  async detail(@Param('id') id: string) {
    return this.tenantService.findById(id)
  }

  @Patch(':id')
  @RequirePermission('PLATFORM:TENANT:UPDATE')
  async update(@Param('id') id: string, @Body() body: UpdateTenantDto) {
    return this.tenantService.update(id, body)
  }

  @Post(':id/suspend')
  @RequirePermission('PLATFORM:TENANT:SUSPEND')
  @HttpCode(HttpStatus.OK)
  async suspend(@Param('id') id: string) {
    return this.tenantService.suspend(id)
  }

  @Post(':id/archive')
  @RequirePermission('PLATFORM:TENANT:ARCHIVE')
  @HttpCode(HttpStatus.OK)
  async archive(@Param('id') id: string) {
    return this.tenantService.archive(id)
  }

  @Get(':id/available-users')
  @RequirePermission('PLATFORM:TENANT:VIEW')
  async availableUsers(@Param('id') tenantId: string) {
    return this.tenantService.availableUsers(tenantId)
  }

  @Post(':id/members')
  @RequirePermission('PLATFORM:TENANT:UPDATE')
  @HttpCode(HttpStatus.CREATED)
  async addMember(@Param('id') tenantId: string, @Body() body: AddMemberDto) {
    return this.tenantService.addMember(tenantId, body)
  }
}
