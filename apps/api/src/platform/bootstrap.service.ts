import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { assertRow } from '../db/assert-row'
import { DB, type Db } from '../db/db.module'
import {
  permissions,
  rolePermissions,
  systemBootstrap,
  systemRoles,
  tenants,
  userSystemRoleAssignments,
  users,
} from '../db/schema'
import { TenantClosureService } from '../tenant-scope/tenant-closure.service'
import { AuthService } from './auth.service'
import { validatePasswordStrength } from './domain/auth.domain'
import { BUILTIN_PERMISSIONS, BUILTIN_ROLES } from './domain/system-role.domain'
import { normalizeEmail, validateUserCreation } from './domain/user.domain'

export interface BootstrapInput {
  tenantName: string
  tenantSlug?: string
  tenantShortName?: string
  email: string
  password: string
  displayName: string
}

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name)

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly authService: AuthService,
    private readonly tenantClosure: TenantClosureService,
  ) {}

  async isBootstrapped(): Promise<boolean> {
    const [admin] = await this.db.select({ id: users.id }).from(users).where(eq(users.isSystemAdmin, true)).limit(1)
    return !!admin
  }

  async onModuleInit() {
    await this.ensureBuiltinAuthorization()
    await this.ensureBootstrapFromEnv()
  }

  async bootstrapInitialAdmin(input: BootstrapInput) {
    const validation = validateUserCreation(input)
    if (!validation.valid) throw new BadRequestException(validation.errors)

    const pwCheck = validatePasswordStrength(input.password)
    if (!pwCheck.valid) throw new BadRequestException(pwCheck.errors)
    if (input.tenantName.trim().length < 2) {
      throw new BadRequestException('tenantName en az 2 karakter olmalıdır')
    }

    const passwordHash = await this.authService.hashNewPassword(input.password)

    return this.db.transaction(async tx => {
      const [existingAdmin] = await tx.select({ id: users.id }).from(users).where(eq(users.isSystemAdmin, true)).limit(1)
      if (existingAdmin) {
        throw new ForbiddenException('BOOTSTRAP_ALREADY_COMPLETED')
      }

      await this.seedBuiltinAuthorization(tx)

      const autoSlug = input.tenantName
        .toLowerCase()
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50)
      const rootTenant = assertRow(
        await tx
          .insert(tenants)
          .values({
            name: input.tenantName.trim(),
            shortName: input.tenantShortName?.trim() || null,
            slug: input.tenantSlug?.trim() || autoSlug,
            type: 'PLATFORM_ROOT',
            status: 'ACTIVE',
            // PLATFORM_ROOT never resolves a data-plane scope (DEC-0010 §5).
            canEnterData: false,
            canAggregateChildren: false,
          })
          .returning(),
      )

      // customerRootTenantId stays null — PLATFORM_ROOT has no customer root (DEC-0010 §6).
      await this.tenantClosure.createClosureForNewTenant(tx, {
        tenantId: rootTenant.id,
        parentId: null,
        customerRootTenantId: null,
      })

      const user = assertRow(
        await tx
          .insert(users)
          .values({
            email: normalizeEmail(input.email),
            displayName: input.displayName.trim(),
            passwordHash,
            isSystemAdmin: true,
            status: 'ACTIVE',
          })
          .returning(),
      )

      const [systemAdminRole] = await tx.select().from(systemRoles).where(eq(systemRoles.name, 'SYSTEM_ADMIN')).limit(1)
      if (systemAdminRole) {
        await tx.insert(userSystemRoleAssignments).values({ userId: user.id, roleId: systemAdminRole.id, tenantId: null })
      }

      await tx.insert(systemBootstrap).values({ adminUserId: user.id, completedAt: new Date(), singletonKey: 1 })

      return { user, rootTenant }
    })
  }

  private async ensureBootstrapFromEnv() {
    const email = process.env['SYSTEM_ADMIN_EMAIL']?.trim()
    const password = process.env['SYSTEM_ADMIN_PASSWORD']?.trim()
    const displayName =
      process.env['SYSTEM_ADMIN_DISPLAY_NAME']?.trim() || 'System Administrator'

    if (!email || !password) return

    const [existing] = await this.db.select({ id: systemBootstrap.id }).from(systemBootstrap).where(eq(systemBootstrap.singletonKey, 1)).limit(1)
    if (existing) return

    try {
      await this.bootstrapInitialAdmin({
        tenantName: process.env['SYSTEM_ROOT_TENANT_NAME']?.trim() || 'Platform',
        tenantSlug: process.env['SYSTEM_ROOT_TENANT_SLUG']?.trim(),
        tenantShortName: process.env['SYSTEM_ROOT_TENANT_SHORT_NAME']?.trim(),
        email,
        password,
        displayName,
      })
      this.logger.log(`System admin bootstrapped from env: ${email}`)
    } catch (error) {
      if (error instanceof ForbiddenException) return
      this.logger.error('System admin env bootstrap failed', error)
      throw error
    }
  }

  private async ensureBuiltinAuthorization() {
    await this.db.transaction(async tx => {
      await this.seedBuiltinAuthorization(tx)
    })
  }

  private async seedBuiltinAuthorization(tx: Db) {
    for (const permissionCode of BUILTIN_PERMISSIONS) {
      await tx
        .insert(permissions)
        .values({ code: permissionCode, description: permissionCode })
        .onConflictDoNothing({ target: permissions.code })
    }

    const roleMap = new Map<string, { id: string }>()
    for (const role of BUILTIN_ROLES) {
      const saved = assertRow(
        await tx
          .insert(systemRoles)
          .values({ name: role.name, description: role.description, isBuiltin: true })
          .onConflictDoUpdate({ target: systemRoles.name, set: { description: role.description, isBuiltin: true } })
          .returning(),
      )
      roleMap.set(role.name, saved)
    }

    for (const role of BUILTIN_ROLES) {
      const savedRole = roleMap.get(role.name)
      if (!savedRole) continue

      for (const permissionCode of role.permissions) {
        const [permission] = await tx.select().from(permissions).where(eq(permissions.code, permissionCode)).limit(1)
        if (!permission) continue

        await tx
          .insert(rolePermissions)
          .values({ roleId: savedRole.id, permissionId: permission.id })
          .onConflictDoNothing({ target: [rolePermissions.roleId, rolePermissions.permissionId] })
      }
    }
  }
}
