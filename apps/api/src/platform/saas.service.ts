import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { PlatformAuditService } from '../audit/platform-audit.service'
import { assertRow } from '../db/assert-row'
import { DB, type Db } from '../db/db.module'
import {
  customerSubscriptions,
  resourcePackages,
  systemRoles,
  tenantMemberships,
  tenants,
  userSystemRoleAssignments,
  users,
} from '../db/schema'
import { CustomerSchemaRegistryService } from '../tenant-scope/customer-schema-registry.service'
import { TenantClosureService } from '../tenant-scope/tenant-closure.service'
import { AuthService } from './auth.service'
import { CustomerAccessService } from './customer-access.service'
import { DatabaseUsageService } from './database-usage.service'
import { validatePasswordStrength } from './domain/auth.domain'
import {
  validateAddMembership,
  validateCreateResourcePackage,
  validateCustomerAdminCreateTenant,
  validateCustomerAdminCreateUser,
  validateId,
  validateSetPassword,
  validateUpdateDisplayName,
} from './domain/platform-input.domain'
import { isValidProvisionSlug, validateProvisionCustomerInput } from './domain/customer-provision.domain'
import { composeTenantSlug } from './domain/tenant.domain'
import { PRIVILEGE_DENIAL } from './domain/privilege-ceiling.domain'
import { toCustomerUserView } from './domain/user-projection.domain'
import { normalizeEmail } from './domain/user.domain'
import { StorageUsageService } from './storage-usage.service'

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED'

export interface UsageMeasurement {
  mbUsed: number | null
  status: 'REAL' | 'APPROXIMATE' | 'UNSUPPORTED'
  message?: string
}

export interface CustomerUsageSnapshot {
  childTenantCount: number
  userCount: number
  storage: UsageMeasurement
  database: UsageMeasurement
}

export interface CustomerSubscriptionOverview {
  customerRoot: {
    id: string
    name: string
    slug: string
  }
  subscription: {
    id: string
    status: SubscriptionStatus
    startsAt: Date
    resourcePackage: {
      id: string
      code: string
      name: string
      description: string | null
      maxChildTenantCount: number
      maxUserCount: number
      maxStorageMb: number
      maxDatabaseMb: number
      isActive: boolean
    }
  }
  usage: CustomerUsageSnapshot
}

export interface CreateResourcePackageDto {
  code: string
  name: string
  description?: string
  maxChildTenantCount: number
  maxUserCount: number
  maxStorageMb: number
  maxDatabaseMb: number
}

export interface ProvisionCustomerDto {
  companyName: string
  companySlug?: string
  packageId: string
  adminEmail: string
  adminDisplayName: string
  adminPassword: string
  notes?: string
}

export interface CustomerAdminCreateTenantDto {
  name: string
  slug?: string
  parentTenantId?: string
  canEnterData?: boolean
  canAggregateChildren?: boolean
}

export interface CustomerAdminCreateUserDto {
  email: string
  displayName: string
  password: string
  tenantId?: string
}

export interface AddMembershipDto {
  tenantId: string
}

/** Extra facts about the caller's session, for audit only (never used for authorization). */
export interface CustomerAdminActionContext {
  impersonatorUserId?: string | null
  /** true for an impersonation session: password changes and membership additions are refused (TASK-027.46) */
  impersonation?: boolean
}

export interface CustomerAdminUpdateUserDto {
  displayName?: string
}

function slugify(value: string) {
  return value
    .trim()
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
}

/** Tenants belonging to a customer root's tree: the root itself, or any tenant whose customerRootId points at it. */
function inCustomerRootTree(customerRootId: string) {
  return or(eq(tenants.id, customerRootId), eq(tenants.customerRootId, customerRootId))
}

@Injectable()
export class SaasService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly authService: AuthService,
    private readonly customerAccessService: CustomerAccessService,
    private readonly storageUsageService: StorageUsageService,
    private readonly databaseUsageService: DatabaseUsageService,
    private readonly tenantClosure: TenantClosureService,
    private readonly schemaRegistry: CustomerSchemaRegistryService,
    private readonly auditService: PlatformAuditService,
  ) {}

  private readonly logger = new Logger(SaasService.name)

  async listPackages() {
    const packages = await this.db
      .select()
      .from(resourcePackages)
      .orderBy(desc(resourcePackages.isActive), asc(resourcePackages.maxChildTenantCount), asc(resourcePackages.name))

    return { packages }
  }

  async listSubscriptions() {
    const rows = await this.db
      .select({
        subscription: customerSubscriptions,
        resourcePackage: resourcePackages,
        customerRootTenant: { id: tenants.id, name: tenants.name, slug: tenants.slug },
      })
      .from(customerSubscriptions)
      .innerJoin(resourcePackages, eq(customerSubscriptions.resourcePackageId, resourcePackages.id))
      .innerJoin(tenants, eq(customerSubscriptions.customerRootTenantId, tenants.id))
      .orderBy(desc(customerSubscriptions.createdAt))

    const items = await Promise.all(
      rows.map(row =>
        this.buildSubscriptionOverview({
          id: row.subscription.id,
          status: row.subscription.status,
          startsAt: row.subscription.startsAt,
          resourcePackage: row.resourcePackage,
          customerRootTenant: row.customerRootTenant,
        }),
      ),
    )

    return { subscriptions: items }
  }

  async createPackage(dto: CreateResourcePackageDto) {
    const validation = validateCreateResourcePackage(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)

    const code = dto.code.trim().toUpperCase()
    const name = dto.name.trim()
    if (code.length < 2 || name.length < 2) {
      throw new BadRequestException('Paket kodu ve adı en az 2 karakter olmalıdır')
    }

    const numericFields = [dto.maxChildTenantCount, dto.maxUserCount, dto.maxStorageMb, dto.maxDatabaseMb]
    if (numericFields.some(value => !Number.isInteger(value) || value < 0)) {
      throw new BadRequestException('Paket limitleri sıfır veya pozitif tam sayı olmalıdır')
    }

    try {
      const created = assertRow(
        await this.db
          .insert(resourcePackages)
          .values({
            code,
            name,
            description: dto.description?.trim() || null,
            maxChildTenantCount: dto.maxChildTenantCount,
            maxUserCount: dto.maxUserCount,
            maxStorageMb: dto.maxStorageMb,
            maxDatabaseMb: dto.maxDatabaseMb,
            isActive: true,
          })
          .returning(),
      )
      return created
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`"${code}" kodlu paket zaten var`)
      }
      throw error
    }
  }

  async provisionCustomer(dto: ProvisionCustomerDto) {
    // Input is validated before any query or write: an invalid request cannot create a tenant, user, subscription or schema.
    const validation = validateProvisionCustomerInput(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    const derivedSlug = dto.companySlug?.trim() || slugify(dto.companyName)
    if (!derivedSlug || !isValidProvisionSlug(derivedSlug)) {
      throw new BadRequestException(['Müşteri adından geçerli bir slug üretilemedi; lütfen slug girin'])
    }

    const [packageRow] = await this.db.select().from(resourcePackages).where(eq(resourcePackages.id, dto.packageId.trim())).limit(1)
    if (!packageRow || !packageRow.isActive) {
      throw new NotFoundException('Aktif paket bulunamadı')
    }

    const [platformRoot] = await this.db.select({ id: tenants.id }).from(tenants).where(eq(tenants.type, 'PLATFORM_ROOT')).limit(1)
    if (!platformRoot) {
      throw new NotFoundException('Platform root tenant bulunamadı')
    }

    const email = normalizeEmail(dto.adminEmail)
    const [existingUser] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (existingUser) throw new ConflictException('Bu e-posta adresi zaten kullanımda')

    const slug = derivedSlug
    const [existingTenant] = await this.db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1)
    if (existingTenant) throw new ConflictException(`"${slug}" slug'ı zaten kullanımda`)

    const passwordHash = await this.authService.hashNewPassword(dto.adminPassword)

    const result = await this.db.transaction(async tx => {
      const customerRoot = assertRow(
        await tx
          .insert(tenants)
          .values({
            name: dto.companyName.trim(),
            slug,
            type: 'ROOT',
            status: 'ACTIVE',
            parentId: platformRoot.id,
            // A customer root always aggregates its whole tree and may enter its own data.
            canEnterData: true,
            canAggregateChildren: true,
          })
          .returning(),
      )

      await tx.update(tenants).set({ customerRootId: customerRoot.id }).where(eq(tenants.id, customerRoot.id))

      // Closure-wise a customer root is its own apex — PLATFORM_ROOT is deliberately excluded
      // from customer-root data scope, so parentId is null here even though the tenant row's
      // own parentId points at PLATFORM_ROOT for tree bookkeeping.
      await this.tenantClosure.createClosureForNewTenant(tx, {
        tenantId: customerRoot.id,
        parentId: null,
        customerRootTenantId: customerRoot.id,
      })

      const adminUser = assertRow(
        await tx
          .insert(users)
          .values({ email, displayName: dto.adminDisplayName.trim(), passwordHash, isSystemAdmin: false, status: 'ACTIVE' })
          .returning(),
      )

      await tx.insert(tenantMemberships).values({ tenantId: customerRoot.id, userId: adminUser.id, isActive: true })

      const [tenantAdminRole] = await tx.select().from(systemRoles).where(eq(systemRoles.name, 'TENANT_ADMIN')).limit(1)
      if (!tenantAdminRole) {
        throw new NotFoundException('TENANT_ADMIN rolü bulunamadı')
      }

      await tx.insert(userSystemRoleAssignments).values({ userId: adminUser.id, roleId: tenantAdminRole.id, tenantId: customerRoot.id })

      const subscriptionRow = assertRow(
        await tx
          .insert(customerSubscriptions)
          .values({
            customerRootTenantId: customerRoot.id,
            resourcePackageId: packageRow.id,
            status: 'ACTIVE',
            notes: dto.notes?.trim() || null,
          })
          .returning(),
      )

      return {
        customerRootTenant: {
          id: customerRoot.id,
          name: customerRoot.name,
          slug: customerRoot.slug,
          type: customerRoot.type,
        },
        tenantAdmin: {
          id: adminUser.id,
          email: adminUser.email,
          displayName: adminUser.displayName,
        },
        subscription: { ...subscriptionRow, resourcePackage: packageRow },
      }
    })

    // Deliberately outside the tenant-creation transaction (DEC-0010 §10): the customer root
    // already exists as a normal tenant even if schema provisioning fails here. A FAILED
    // registry row is retried by re-invoking ensureSchemaProvisioned, not by re-creating the
    // tenant.
    await this.schemaRegistry.ensureSchemaProvisioned(result.customerRootTenant.id, result.customerRootTenant.slug)

    return result
  }

  async getCustomerOverview(userId: string, isSystemAdmin: boolean, activeTenantId: string) {
    const { customerRoot } = await this.customerAccessService.assertCustomerAdminScope(userId, isSystemAdmin, activeTenantId)

    const [subscriptionRow] = await this.db
      .select({ subscription: customerSubscriptions, resourcePackage: resourcePackages })
      .from(customerSubscriptions)
      .innerJoin(resourcePackages, eq(customerSubscriptions.resourcePackageId, resourcePackages.id))
      .where(eq(customerSubscriptions.customerRootTenantId, customerRoot.id))
      .limit(1)
    if (!subscriptionRow) {
      throw new NotFoundException('Bu customer root için abonelik bulunamadı')
    }

    return this.buildSubscriptionOverview({
      id: subscriptionRow.subscription.id,
      status: subscriptionRow.subscription.status,
      startsAt: subscriptionRow.subscription.startsAt,
      resourcePackage: subscriptionRow.resourcePackage,
      customerRootTenant: customerRoot,
    })
  }

  async listCustomerTenants(userId: string, isSystemAdmin: boolean, activeTenantId: string) {
    const { customerRoot } = await this.customerAccessService.assertCustomerAdminScope(userId, isSystemAdmin, activeTenantId)
    const parentTenants = alias(tenants, 'parent_tenants')
    const rootTenants = alias(tenants, 'root_tenants')

    const rows = await this.db
      .select({
        tenant: tenants,
        parentName: parentTenants.name,
        parentSlug: parentTenants.slug,
        customerRootName: rootTenants.name,
        customerRootSlug: rootTenants.slug,
        memberCount: sql<number>`count(${tenantMemberships.id})::int`,
      })
      .from(tenants)
      .leftJoin(parentTenants, eq(tenants.parentId, parentTenants.id))
      .leftJoin(rootTenants, eq(tenants.customerRootId, rootTenants.id))
      .leftJoin(tenantMemberships, eq(tenantMemberships.tenantId, tenants.id))
      .where(inCustomerRootTree(customerRoot.id))
      .groupBy(tenants.id, parentTenants.id, rootTenants.id)
      .orderBy(asc(tenants.type), desc(tenants.createdAt))

    return {
      customerRoot,
      tenants: rows.map(row => ({
        id: row.tenant.id,
        name: row.tenant.name,
        slug: row.tenant.slug,
        type: row.tenant.type,
        status: row.tenant.status,
        parentId: row.tenant.parentId,
        parentName: row.parentName ?? null,
        parentSlug: row.parentSlug ?? null,
        customerRootId: row.tenant.customerRootId,
        customerRootName: row.customerRootName ?? null,
        customerRootSlug: row.customerRootSlug ?? null,
        memberCount: row.memberCount,
        createdAt: row.tenant.createdAt,
      })),
    }
  }

  async createCustomerTenant(
    userId: string,
    isSystemAdmin: boolean,
    activeTenantId: string,
    dto: CustomerAdminCreateTenantDto,
  ) {
    const validation = validateCustomerAdminCreateTenant(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    if (!(typeof dto.slug === 'string' && dto.slug.trim()) && !slugify(dto.name)) {
      throw new BadRequestException(['Kiracı adından geçerli bir slug üretilemedi; lütfen slug girin'])
    }

    const { customerRoot } = await this.customerAccessService.assertCustomerAdminScope(userId, isSystemAdmin, activeTenantId)
    const subscription = await this.loadActiveSubscription(customerRoot.id)

    const { count: currentChildCount } = assertRow(
      await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tenants)
        .where(and(eq(tenants.customerRootId, customerRoot.id), sql`${tenants.id} != ${customerRoot.id}`)),
    )
    if (currentChildCount >= subscription.resourcePackage.maxChildTenantCount) {
      throw new ConflictException('Paket child tenant limitine ulaşıldı')
    }

    const baseSlug = dto.slug?.trim() || slugify(dto.name)

    let parentId = customerRoot.id
    let parentSlug = customerRoot.slug
    if (dto.parentTenantId) {
      const parent = await this.customerAccessService.assertTenantBelongsToCustomerRoot(dto.parentTenantId, customerRoot.id)
      if (parent.type === 'PLATFORM_ROOT') {
        throw new ForbiddenException('Platform root altına child tenant açılamaz')
      }
      parentId = parent.id
      parentSlug = parent.slug
    }

    const slug = composeTenantSlug(baseSlug, parentSlug)
    const [existing] = await this.db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1)
    if (existing) throw new ConflictException(`"${slug}" slug'ı zaten kullanımda`)

    return this.db.transaction(async tx => {
      const tenant = assertRow(
        await tx
          .insert(tenants)
          .values({
            name: dto.name.trim(),
            slug,
            type: 'STANDARD',
            status: 'ACTIVE',
            parentId,
            customerRootId: customerRoot.id,
            canEnterData: dto.canEnterData ?? true,
            canAggregateChildren: dto.canAggregateChildren ?? false,
          })
          .returning(),
      )

      await this.tenantClosure.createClosureForNewTenant(tx, {
        tenantId: tenant.id,
        parentId,
        customerRootTenantId: customerRoot.id,
      })

      return tenant
    })
  }

  async listCustomerUsers(userId: string, isSystemAdmin: boolean, activeTenantId: string) {
    const { customerRoot } = await this.customerAccessService.assertCustomerAdminScope(userId, isSystemAdmin, activeTenantId)

    const rows = await this.db
      .select({
        membership: tenantMemberships,
        tenant: { id: tenants.id, name: tenants.name, slug: tenants.slug, type: tenants.type },
        user: users,
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
      .innerJoin(users, eq(tenantMemberships.userId, users.id))
      .where(and(eq(tenantMemberships.isActive, true), inCustomerRootTree(customerRoot.id)))
      .orderBy(desc(users.createdAt))

    const userMap = new Map<
      string,
      {
        id: string
        email: string
        displayName: string
        status: string
        createdAt: Date
        memberships: { id: string; tenantId: string; tenantName: string; tenantSlug: string; tenantType: string }[]
      }
    >()
    for (const row of rows) {
      let entry = userMap.get(row.user.id)
      if (!entry) {
        entry = {
          id: row.user.id,
          email: row.user.email,
          displayName: row.user.displayName,
          status: row.user.status,
          createdAt: row.user.createdAt,
          memberships: [],
        }
        userMap.set(row.user.id, entry)
      }
      entry.memberships.push({
        id: row.membership.id,
        tenantId: row.membership.tenantId,
        tenantName: row.tenant.name,
        tenantSlug: row.tenant.slug,
        tenantType: row.tenant.type,
      })
    }

    return { customerRoot, users: Array.from(userMap.values()) }
  }

  async createCustomerUser(
    userId: string,
    isSystemAdmin: boolean,
    activeTenantId: string,
    dto: CustomerAdminCreateUserDto,
    context: CustomerAdminActionContext = {},
  ) {
    const validation = validateCustomerAdminCreateUser(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    const { customerRoot } = await this.customerAccessService.assertCustomerAdminScope(userId, isSystemAdmin, activeTenantId)
    const subscription = await this.loadActiveSubscription(customerRoot.id)

    const distinctMemberUsers = await this.db
      .selectDistinct({ userId: tenantMemberships.userId })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
      .where(and(eq(tenantMemberships.isActive, true), inCustomerRootTree(customerRoot.id)))
    if (distinctMemberUsers.length >= subscription.resourcePackage.maxUserCount) {
      throw new ConflictException('Paket kullanıcı limitine ulaşıldı')
    }

    const email = normalizeEmail(dto.email)
    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (existing) throw new ConflictException('Bu e-posta adresi zaten kullanımda')

    const passwordHash = await this.authService.hashNewPassword(dto.password)
    const tenantId = dto.tenantId
      ? (await this.customerAccessService.assertTenantBelongsToCustomerRoot(dto.tenantId, customerRoot.id)).id
      : customerRoot.id

    const created = await this.db.transaction(async tx => {
      const user = assertRow(
        await tx
          .insert(users)
          .values({ email, displayName: dto.displayName.trim(), passwordHash, status: 'ACTIVE', isSystemAdmin: false })
          .returning(),
      )

      await tx.insert(tenantMemberships).values({ tenantId, userId: user.id, isActive: true })

      return user
    })

    await this.auditCustomerAdmin({
      actorId: userId,
      action: 'CUSTOMER_USER_CREATED',
      entityType: 'User',
      entityId: created.id,
      summary: 'Müşteri yöneticisi yeni kullanıcı oluşturdu',
      customerRootId: customerRoot.id,
      tenantId,
      targetUserId: created.id,
      result: 'SUCCESS',
      context,
    })

    // Never the raw row: it carries the password hash.
    return toCustomerUserView(created)
  }

  async updateCustomerUser(
    userId: string,
    isSystemAdmin: boolean,
    activeTenantId: string,
    targetUserId: string,
    dto: CustomerAdminUpdateUserDto,
    context: CustomerAdminActionContext = {},
  ) {
    const validation = validateUpdateDisplayName(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    const idCheck = validateId(targetUserId, 'Kullanıcı')
    if (!idCheck.valid) throw new BadRequestException(idCheck.errors)
    const { customerRoot } = await this.customerAccessService.assertCustomerAdminScope(userId, isSystemAdmin, activeTenantId)
    const target = await this.resolveManageableCustomerUser({
      actorId: userId, customerRootId: customerRoot.id, targetUserId, action: 'CUSTOMER_USER_UPDATE_DENIED', context,
    })

    if (dto.displayName === undefined) {
      return toCustomerUserView(target)
    }

    const displayName = dto.displayName.trim()
    if (displayName.length < 2) {
      throw new BadRequestException('Görünen ad en az 2 karakter olmalıdır')
    }

    const updated = assertRow(await this.db.update(users).set({ displayName }).where(eq(users.id, target.id)).returning())

    await this.auditCustomerAdmin({
      actorId: userId,
      action: 'CUSTOMER_USER_UPDATED',
      entityType: 'User',
      entityId: target.id,
      summary: 'Müşteri yöneticisi kullanıcının görünen adını güncelledi',
      customerRootId: customerRoot.id,
      targetUserId: target.id,
      result: 'SUCCESS',
      context,
      extra: { beforeDisplayName: target.displayName, afterDisplayName: updated.displayName },
    })

    return toCustomerUserView(updated)
  }

  async setCustomerUserPassword(
    userId: string,
    isSystemAdmin: boolean,
    activeTenantId: string,
    targetUserId: string,
    password: string,
    context: CustomerAdminActionContext = {},
  ) {
    const validation = validateSetPassword({ password })
    if (!validation.valid) throw new BadRequestException(validation.errors)
    const idCheck = validateId(targetUserId, 'Kullanıcı')
    if (!idCheck.valid) throw new BadRequestException(idCheck.errors)
    await this.assertNotImpersonated(userId, 'CUSTOMER_USER_PASSWORD_RESET', targetUserId, context)
    const { customerRoot } = await this.customerAccessService.assertCustomerAdminScope(userId, isSystemAdmin, activeTenantId)
    const target = await this.resolveManageableCustomerUser({
      actorId: userId, customerRootId: customerRoot.id, targetUserId, action: 'CUSTOMER_USER_PASSWORD_RESET', context,
    })
    if (target.id === userId) {
      await this.auditCustomerAdmin({
        actorId: userId, action: 'CUSTOMER_USER_PASSWORD_RESET', entityType: 'User', entityId: target.id,
        summary: 'Müşteri yöneticisi parola değişikliği reddedildi', customerRootId: customerRoot.id, targetUserId: target.id,
        result: 'DENIED', reason: 'SELF_CHANGE', context,
      }, true)
      throw new ForbiddenException('Kendi parolanızı bu yüzeyden değiştiremezsiniz')
    }

    const pwCheck = validatePasswordStrength(password)
    if (!pwCheck.valid) throw new BadRequestException(pwCheck.errors)

    try {
      const passwordHash = await this.authService.hashNewPassword(password)
      await this.db.update(users).set({ passwordHash }).where(eq(users.id, target.id))
    } catch (error) {
      await this.auditCustomerAdmin({
        actorId: userId, action: 'CUSTOMER_USER_PASSWORD_RESET', entityType: 'User', entityId: target.id,
        summary: 'Müşteri yöneticisi parola değişikliği başarısız oldu', customerRootId: customerRoot.id, targetUserId: target.id,
        result: 'FAILED', reason: 'ERROR', context,
      }, true)
      throw error
    }

    await this.auditCustomerAdmin({
      actorId: userId, action: 'CUSTOMER_USER_PASSWORD_RESET', entityType: 'User', entityId: target.id,
      summary: 'Müşteri yöneticisi kullanıcı parolasını yeniledi', customerRootId: customerRoot.id, targetUserId: target.id,
      result: 'SUCCESS', context,
    })

    return { success: true }
  }

  async addCustomerUserMembership(
    userId: string,
    isSystemAdmin: boolean,
    activeTenantId: string,
    targetUserId: string,
    dto: AddMembershipDto,
    context: CustomerAdminActionContext = {},
  ) {
    const validation = validateAddMembership(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    const idCheck = validateId(targetUserId, 'Kullanıcı')
    if (!idCheck.valid) throw new BadRequestException(idCheck.errors)
    await this.assertNotImpersonated(userId, 'CUSTOMER_MEMBERSHIP_ADD', targetUserId, context)
    const { customerRoot } = await this.customerAccessService.assertCustomerAdminScope(userId, isSystemAdmin, activeTenantId)
    const tenant = await this.customerAccessService.assertTenantBelongsToCustomerRoot(dto.tenantId, customerRoot.id)

    // The target must ALREADY belong to this customer root (active membership somewhere in its tree) and must
    // not be a system administrator. A user of another customer root cannot be pulled into this one.
    const target = await this.resolveManageableCustomerUser({
      actorId: userId, customerRootId: customerRoot.id, targetUserId, action: 'CUSTOMER_MEMBERSHIP_ADD', context, tenantId: tenant.id,
    })

    const [existing] = await this.db
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, tenant.id), eq(tenantMemberships.userId, target.id)))
      .limit(1)
    if (existing) throw new ConflictException('Kullanıcı zaten bu tenantta üye')

    const membership = assertRow(
      await this.db
        .insert(tenantMemberships)
        .values({ tenantId: tenant.id, userId: target.id, isActive: true })
        .returning(),
    )

    await this.auditCustomerAdmin({
      actorId: userId,
      action: 'CUSTOMER_MEMBERSHIP_ADDED',
      entityType: 'TenantMembership',
      entityId: membership.id,
      summary: 'Müşteri yöneticisi kullanıcıyı tenanta üye yaptı',
      customerRootId: customerRoot.id,
      tenantId: tenant.id,
      targetUserId: target.id,
      result: 'SUCCESS',
      context,
    })

    return membership
  }

  /**
   * Impersonation sessions may not change another user's password or memberships (TASK-027.46). Refused before any scope or
   * target lookup with a static code; only a best-effort DENIED audit is written (ids only, never target details).
   */
  private async assertNotImpersonated(actorId: string, action: string, targetUserId: string, context: CustomerAdminActionContext) {
    if (context.impersonation !== true && !context.impersonatorUserId) return
    try {
      await this.auditService.log({
        actorId,
        actionCode: action,
        entityType: 'User',
        entityId: targetUserId,
        summary: 'Impersonation oturumunda müşteri yöneticisi işlemi reddedildi',
        metadata: { result: 'DENIED', reason: 'IMPERSONATION_SESSION', targetUserId, ...(context.impersonatorUserId ? { impersonatorUserId: context.impersonatorUserId } : {}) },
      })
    } catch {
      this.logger.warn(`Customer-admin audit yazılamadı (${action}/DENIED)`)
    }
    throw new ForbiddenException({ code: PRIVILEGE_DENIAL.IMPERSONATION.code, message: PRIVILEGE_DENIAL.IMPERSONATION.message })
  }

  /**
   * Resolves the target of a customer-admin action. It must have an ACTIVE membership inside the caller's
   * customer-root tree (otherwise 404, identical to "does not exist") and must not be a system administrator
   * (403). Denials are audited best-effort and never change the refusal.
   */
  private async resolveManageableCustomerUser(input: {
    actorId: string
    customerRootId: string
    targetUserId: string
    action: string
    context: CustomerAdminActionContext
    tenantId?: string
  }) {
    const target = await this.findCustomerScopedUser(input.targetUserId, input.customerRootId)
    if (!target) {
      await this.auditCustomerAdmin({
        actorId: input.actorId, action: input.action, entityType: 'User', entityId: input.targetUserId,
        summary: 'Müşteri yöneticisi işlemi reddedildi: hedef kapsam dışı', customerRootId: input.customerRootId,
        tenantId: input.tenantId, targetUserId: input.targetUserId, result: 'DENIED', reason: 'TARGET_OUT_OF_SCOPE', context: input.context,
      }, true)
      throw new NotFoundException('Kullanıcı bulunamadı')
    }
    if (target.isSystemAdmin) {
      await this.auditCustomerAdmin({
        actorId: input.actorId, action: input.action, entityType: 'User', entityId: target.id,
        summary: 'Müşteri yöneticisi işlemi reddedildi: hedef sistem yöneticisi', customerRootId: input.customerRootId,
        tenantId: input.tenantId, targetUserId: target.id, result: 'DENIED', reason: 'TARGET_IS_SYSTEM_ADMIN', context: input.context,
      }, true)
      throw new ForbiddenException('Sistem yöneticisi hesapları bu yüzeyden yönetilemez')
    }
    return target
  }

  /**
   * Audit for customer-admin mutations: actor, target, tenant/root and result, plus the impersonator when the
   * session is an impersonation. Metadata never contains a password, hash, token or OTP (only ids and a static
   * reason code). `bestEffort` is used for denials/failures so an audit outage cannot turn a refusal into a success.
   */
  private async auditCustomerAdmin(
    entry: {
      actorId: string
      action: string
      entityType: string
      entityId: string
      summary: string
      customerRootId: string
      tenantId?: string
      targetUserId: string
      result: 'SUCCESS' | 'DENIED' | 'FAILED'
      reason?: string
      context: CustomerAdminActionContext
      extra?: Record<string, unknown>
    },
    bestEffort = false,
  ) {
    const write = () =>
      this.auditService.log({
        actorId: entry.actorId,
        actionCode: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        summary: entry.summary,
        metadata: {
          result: entry.result,
          ...(entry.reason ? { reason: entry.reason } : {}),
          targetUserId: entry.targetUserId,
          customerRootId: entry.customerRootId,
          ...(entry.tenantId ? { tenantId: entry.tenantId } : {}),
          ...(entry.context.impersonatorUserId ? { impersonatorUserId: entry.context.impersonatorUserId } : {}),
          ...(entry.extra ?? {}),
        },
      })
    if (!bestEffort) return write()
    try {
      await write()
    } catch {
      this.logger.warn(`Customer-admin audit yazılamadı (${entry.action}/${entry.result})`)
    }
  }

  /** Finds a user only if they have an active membership somewhere in this customer root's tree. */
  private async findCustomerScopedUser(targetUserId: string, customerRootId: string) {
    const [row] = await this.db
      .select({ user: users })
      .from(users)
      .innerJoin(tenantMemberships, eq(tenantMemberships.userId, users.id))
      .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
      .where(and(eq(users.id, targetUserId), eq(tenantMemberships.isActive, true), inCustomerRootTree(customerRootId)))
      .limit(1)
    return row?.user ?? null
  }

  private async loadActiveSubscription(customerRootId: string) {
    const [row] = await this.db
      .select({ subscription: customerSubscriptions, resourcePackage: resourcePackages })
      .from(customerSubscriptions)
      .innerJoin(resourcePackages, eq(customerSubscriptions.resourcePackageId, resourcePackages.id))
      .where(eq(customerSubscriptions.customerRootTenantId, customerRootId))
      .limit(1)

    if (!row) {
      throw new NotFoundException('Customer subscription bulunamadı')
    }
    if (row.subscription.status !== 'ACTIVE' && row.subscription.status !== 'TRIAL') {
      throw new ConflictException('Abonelik aktif değil')
    }

    return { ...row.subscription, resourcePackage: row.resourcePackage }
  }

  private async buildCustomerUsageSnapshot(customerRootId: string): Promise<CustomerUsageSnapshot> {
    const [tenantCountRows, distinctMemberUsers, storageUsage, dbUsage] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tenants)
        .where(and(eq(tenants.customerRootId, customerRootId), sql`${tenants.id} != ${customerRootId}`)),
      this.db
        .selectDistinct({ userId: tenantMemberships.userId })
        .from(tenantMemberships)
        .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
        .where(and(eq(tenantMemberships.isActive, true), inCustomerRootTree(customerRootId))),
      this.storageUsageService.getCustomerRootUsageMb(customerRootId),
      this.databaseUsageService.getCustomerRootUsageMb(customerRootId),
    ])
    const { count: tenantCount } = assertRow(tenantCountRows)

    return {
      childTenantCount: tenantCount,
      userCount: distinctMemberUsers.length,
      storage: storageUsage,
      database: dbUsage,
    }
  }

  private async buildSubscriptionOverview(subscription: {
    id: string
    status: SubscriptionStatus
    startsAt: Date
    resourcePackage: {
      id: string
      code: string
      name: string
      description: string | null
      maxChildTenantCount: number
      maxUserCount: number
      maxStorageMb: number
      maxDatabaseMb: number
      isActive: boolean
    }
    customerRootTenant: {
      id: string
      name: string
      slug: string
    }
  }): Promise<CustomerSubscriptionOverview> {
    const usage = await this.buildCustomerUsageSnapshot(subscription.customerRootTenant.id)

    return {
      customerRoot: subscription.customerRootTenant,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        startsAt: subscription.startsAt,
        resourcePackage: subscription.resourcePackage,
      },
      usage,
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505'
}
