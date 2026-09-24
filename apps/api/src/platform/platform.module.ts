import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { AuditModule } from '../audit/audit.module'
import { DbModule } from '../db/db.module'
import { TenantScopeModule } from '../tenant-scope/tenant-scope.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { BootstrapController } from './bootstrap.controller'
import { BootstrapService } from './bootstrap.service'
import { CustomerAccessService } from './customer-access.service'
import { DatabaseUsageService } from './database-usage.service'
import { JwtStrategy } from './jwt.strategy'
import { MeController } from './me.controller'
import { MeService } from './me.service'
import { MfaCryptoService } from './mfa-crypto.service'
import { MfaRequirementService } from './mfa-requirement.service'
import { MfaController } from './mfa.controller'
import { MfaService } from './mfa.service'
import { MfaEnforcementGuard } from './guards/mfa-enforcement.guard'
import { PrivilegeAuditService } from './privilege/privilege-audit.service'
import { DrizzlePrivilegeSnapshotPort } from './privilege/privilege-snapshot.drizzle'
import { PRIVILEGE_SNAPSHOT_PORT } from './privilege/privilege-snapshot.port'
import { PermissionController } from './permission.controller'
import { RoleController } from './role.controller'
import { RoleService } from './role.service'
import { CustomerAdminController, SaasController } from './saas.controller'
import { SaasService } from './saas.service'
import { StorageUsageService } from './storage-usage.service'
import { TenantController } from './tenant.controller'
import { TenantRoleController } from './tenant-role.controller'
import { TenantRoleService } from './tenant-role.service'
import { TenantService } from './tenant.service'
import { UserController } from './user.controller'
import { UserService } from './user.service'

const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? '15m'

@Module({
  imports: [
    DbModule,
    AuditModule,
    TenantScopeModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: jwtExpiresIn as never },
    }),
  ],
  controllers: [
    AuthController,
    BootstrapController,
    MeController,
    MfaController,
    PermissionController,
    RoleController,
    TenantController,
    TenantRoleController,
    UserController,
    SaasController,
    CustomerAdminController,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    BootstrapService,
    MeService,
    MfaService,
    MfaCryptoService,
    MfaRequirementService,
    MfaEnforcementGuard,
    { provide: PRIVILEGE_SNAPSHOT_PORT, useClass: DrizzlePrivilegeSnapshotPort },
    PrivilegeAuditService,
    RoleService,
    TenantService,
    TenantRoleService,
    UserService,
    SaasService,
    CustomerAccessService,
    StorageUsageService,
    DatabaseUsageService,
  ],
  exports: [AuthService, BootstrapService, SaasService, CustomerAccessService, MfaService, MfaEnforcementGuard],
})
export class PlatformModule {}

