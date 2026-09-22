import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, desc, eq, ilike, notInArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { assertRow } from '../db/assert-row'
import { DB, type Db } from '../db/db.module'
import { customerSubscriptions, resourcePackages, tenantMemberships, tenants, users } from '../db/schema'
import { TenantClosureService } from '../tenant-scope/tenant-closure.service'
import {
  canArchiveTenant,
  canSuspendTenant,
  composeTenantSlug,
  validateTenantCreation,
} from './domain/tenant.domain'
import {
  validateAddMember,
  validateCreateTenant,
  validateId,
  validateTenantListQuery,
  validateUpdateTenant,
} from './domain/platform-input.domain'

export interface TenantListQuery {
  q?: string
  status?: string
}

export interface CreateTenantDto {
  name: string
  slug?: string
  parentId?: string | null
  canEnterData?: boolean
  canAggregateChildren?: boolean
}

export interface UpdateTenantDto {
  name?: string
  packageId?: string | null
}

export interface AddMemberDto {
  userId: string
}

const parentTenants = alias(tenants, 'parent_tenants')
const rootTenants = alias(tenants, 'root_tenants')

function toTenantRow(row: {
  tenant: typeof tenants.$inferSelect
  parentName?: string | null
  parentSlug?: string | null
  customerRootName?: string | null
  customerRootSlug?: string | null
  packageId?: string | null
  packageName?: string | null
  packageCode?: string | null
  memberCount: number
}) {
  return {
    id: row.tenant.id,
    name: row.tenant.name,
    shortName: row.tenant.shortName ?? null,
    slug: row.tenant.slug,
    type: row.tenant.type ?? 'STANDARD',
    parentId: row.tenant.parentId ?? null,
    parentName: row.parentName ?? null,
    parentSlug: row.parentSlug ?? null,
    customerRootId: row.tenant.customerRootId ?? null,
    customerRootName: row.customerRootName ?? null,
    customerRootSlug: row.customerRootSlug ?? null,
    packageId: row.packageId ?? null,
    packageName: row.packageName ?? null,
    packageCode: row.packageCode ?? null,
    status: row.tenant.status,
    memberCount: row.memberCount,
    createdAt: row.tenant.createdAt,
    updatedAt: row.tenant.updatedAt,
  }
}

@Injectable()
export class TenantService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly tenantClosure: TenantClosureService,
  ) {}

  private async getMemberCount(tenantId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantMemberships)
      .where(eq(tenantMemberships.tenantId, tenantId))
    return rows[0]?.count ?? 0
  }

  async list(query: TenantListQuery) {
    const validation = validateTenantListQuery(query)
    if (!validation.valid) throw new BadRequestException(validation.errors)

    const conditions = []
    if (query.status) conditions.push(eq(tenants.status, query.status as 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'))
    if (query.q) {
      const pattern = `%${query.q.trim()}%`
      conditions.push(or(ilike(tenants.name, pattern), ilike(tenants.slug, pattern)))
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          tenant: tenants,
          parentName: parentTenants.name,
          parentSlug: parentTenants.slug,
          customerRootName: rootTenants.name,
          customerRootSlug: rootTenants.slug,
          packageId: resourcePackages.id,
          packageName: resourcePackages.name,
          packageCode: resourcePackages.code,
          memberCount: sql<number>`count(distinct ${tenantMemberships.id})::int`,
        })
        .from(tenants)
        .leftJoin(parentTenants, eq(tenants.parentId, parentTenants.id))
        .leftJoin(rootTenants, eq(tenants.customerRootId, rootTenants.id))
        .leftJoin(
          customerSubscriptions,
          eq(sql`coalesce(${tenants.customerRootId}, ${tenants.id})`, customerSubscriptions.customerRootTenantId),
        )
        .leftJoin(resourcePackages, eq(customerSubscriptions.resourcePackageId, resourcePackages.id))
        .leftJoin(tenantMemberships, eq(tenantMemberships.tenantId, tenants.id))
        .where(where)
        .groupBy(
          tenants.id,
          tenants.name,
          tenants.shortName,
          tenants.slug,
          tenants.type,
          tenants.status,
          tenants.parentId,
          tenants.customerRootId,
          tenants.canEnterData,
          tenants.canAggregateChildren,
          tenants.createdAt,
          tenants.updatedAt,
          parentTenants.id,
          parentTenants.name,
          parentTenants.slug,
          rootTenants.id,
          rootTenants.name,
          rootTenants.slug,
          customerSubscriptions.id,
          resourcePackages.id,
          resourcePackages.name,
          resourcePackages.code,
        )
        .orderBy(desc(tenants.createdAt))
        .limit(200),
      this.db.select({ count: sql<number>`count(*)::int` }).from(tenants).where(where),
    ])
    const total = totalRows[0]?.count ?? 0

    return {
      tenants: rows.map(row =>
        toTenantRow({
          tenant: row.tenant,
          parentName: row.parentName,
          parentSlug: row.parentSlug,
          customerRootName: row.customerRootName,
          customerRootSlug: row.customerRootSlug,
          packageId: row.packageId,
          packageName: row.packageName,
          packageCode: row.packageCode,
          memberCount: row.memberCount,
        }),
      ),
      total,
    }
  }

  async create(dto: CreateTenantDto) {
    // A customer ROOT is provisioned only through SaasService.provisionCustomer (package, admin,
    // subscription and data-plane schema in one flow). Creating one here would leave a ROOT with no
    // registry row and no schema, silently unusable for tenant data — so refuse before touching anything.
    if (typeof dto !== 'object' || dto === null || Array.isArray(dto)) throw new BadRequestException(['Geçersiz istek gövdesi'])
    if (dto.parentId === undefined || dto.parentId === null || dto.parentId === '') {
      throw new BadRequestException({
        code: 'ROOT_PROVISIONING_REQUIRED',
        message: 'Müşteri kök tenant genel tenant oluşturma ile açılamaz; müşteri provizyon akışını kullanın',
      })
    }

    const shape = validateCreateTenant(dto)
    if (!shape.valid) throw new BadRequestException(shape.errors)
    const validation = validateTenantCreation(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors.join(', '))

    const [parent] = await this.db
      .select({ id: tenants.id, slug: tenants.slug, type: tenants.type, customerRootId: tenants.customerRootId })
      .from(tenants)
      .where(eq(tenants.id, dto.parentId))
      .limit(1)
    if (!parent) throw new NotFoundException('Üst kiracı bulunamadı')
    if (parent.type === 'PLATFORM_ROOT') {
      throw new BadRequestException('Platform root altına doğrudan child tenant açılamaz')
    }
    const slug = composeTenantSlug(validation.resolvedSlug, parent.slug)
    const customerRootId = parent.type === 'ROOT' ? parent.id : parent.customerRootId

    const [existing] = await this.db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1)
    if (existing) throw new ConflictException(`"${slug}" slug'ı zaten kullanımda`)

    const tenant = await this.db.transaction(async tx => {
      const created = assertRow(
        await tx
          .insert(tenants)
          .values({
            name: dto.name.trim(),
            slug,
            status: 'ACTIVE',
            type: 'STANDARD',
            parentId: parent.id,
            customerRootId,
            canEnterData: dto.canEnterData ?? true,
            canAggregateChildren: dto.canAggregateChildren ?? false,
          })
          .returning(),
      )

      await this.tenantClosure.createClosureForNewTenant(tx, {
        tenantId: created.id,
        parentId: parent.id,
        customerRootTenantId: customerRootId,
      })

      return created
    })

    return this.findById(tenant.id)
  }

  async findById(id: string) {
    const [row] = await this.db
      .select({
        tenant: tenants,
        parentName: parentTenants.name,
        parentSlug: parentTenants.slug,
        customerRootName: rootTenants.name,
        customerRootSlug: rootTenants.slug,
        packageId: resourcePackages.id,
        packageName: resourcePackages.name,
        packageCode: resourcePackages.code,
        memberCount: sql<number>`count(distinct ${tenantMemberships.id})::int`,
      })
      .from(tenants)
      .leftJoin(parentTenants, eq(tenants.parentId, parentTenants.id))
      .leftJoin(rootTenants, eq(tenants.customerRootId, rootTenants.id))
      .leftJoin(
        customerSubscriptions,
        eq(sql`coalesce(${tenants.customerRootId}, ${tenants.id})`, customerSubscriptions.customerRootTenantId),
      )
      .leftJoin(resourcePackages, eq(customerSubscriptions.resourcePackageId, resourcePackages.id))
      .leftJoin(tenantMemberships, eq(tenantMemberships.tenantId, tenants.id))
      .where(eq(tenants.id, id))
      .groupBy(
        tenants.id,
        tenants.name,
        tenants.shortName,
        tenants.slug,
        tenants.type,
        tenants.status,
        tenants.parentId,
        tenants.customerRootId,
        tenants.canEnterData,
        tenants.canAggregateChildren,
        tenants.createdAt,
        tenants.updatedAt,
        parentTenants.id,
        parentTenants.name,
        parentTenants.slug,
        rootTenants.id,
        rootTenants.name,
        rootTenants.slug,
        customerSubscriptions.id,
        resourcePackages.id,
        resourcePackages.name,
        resourcePackages.code,
      )
      .limit(1)

    if (!row) throw new NotFoundException('Kiracı bulunamadı')
    return toTenantRow({
      tenant: row.tenant,
      parentName: row.parentName,
      parentSlug: row.parentSlug,
      customerRootName: row.customerRootName,
      customerRootSlug: row.customerRootSlug,
      packageId: row.packageId,
      packageName: row.packageName,
      packageCode: row.packageCode,
      memberCount: row.memberCount,
    })
  }

  async update(id: string, dto: UpdateTenantDto) {
    const validation = validateUpdateTenant(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    const idCheck = validateId(id, 'Kiracı')
    if (!idCheck.valid) throw new BadRequestException(idCheck.errors)
    const [existing] = await this.db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
    if (!existing) throw new NotFoundException('Kiracı bulunamadı')

    if (dto.name !== undefined) {
      const name = dto.name.trim()
      if (name.length < 2) throw new BadRequestException('Kiracı adı en az 2 karakter olmalıdır')
      await this.db.update(tenants).set({ name, updatedAt: new Date() }).where(eq(tenants.id, id))
    }

    if (dto.packageId !== undefined && dto.packageId) {
      const targetRootId = existing.type === 'ROOT' ? existing.id : (existing.customerRootId ?? existing.id)
      const [pkg] = await this.db.select({ id: resourcePackages.id }).from(resourcePackages).where(eq(resourcePackages.id, dto.packageId)).limit(1)
      if (!pkg) throw new NotFoundException('Seçilen paket bulunamadı')

      await this.db
        .insert(customerSubscriptions)
        .values({
          customerRootTenantId: targetRootId,
          resourcePackageId: dto.packageId,
          status: 'ACTIVE',
        })
        .onConflictDoUpdate({
          target: customerSubscriptions.customerRootTenantId,
          set: { resourcePackageId: dto.packageId, status: 'ACTIVE', updatedAt: new Date() },
        })
    }

    return this.findById(id)
  }

  async suspend(id: string) {
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
    if (!tenant) throw new NotFoundException('Kiracı bulunamadı')

    const check = canSuspendTenant(tenant.status)
    if (!check.allowed) {
      if (check.reason === 'ALREADY_SUSPENDED') {
        throw new ConflictException('Kiracı zaten askıya alınmış')
      }
      throw new ConflictException('Arşivlenmiş kiracı askıya alınamaz')
    }

    await this.db.update(tenants).set({ status: 'SUSPENDED', updatedAt: new Date() }).where(eq(tenants.id, id))
    return this.findById(id)
  }

  async archive(id: string) {
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
    if (!tenant) throw new NotFoundException('Kiracı bulunamadı')

    const activeMemberCountRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, id), eq(tenantMemberships.isActive, true)))
    const activeMemberCount = activeMemberCountRows[0]?.count ?? 0
    const check = canArchiveTenant(tenant.status, activeMemberCount)

    if (!check.allowed) {
      if (check.reason === 'ALREADY_ARCHIVED') {
        throw new ConflictException('Kiracı zaten arşivlenmiş')
      }
      throw new ForbiddenException('Aktif üyeleri olan kiracı arşivlenemez')
    }

    await this.db.update(tenants).set({ status: 'ARCHIVED', updatedAt: new Date() }).where(eq(tenants.id, id))
    return this.findById(id)
  }

  async availableUsers(tenantId: string) {
    const [tenant] = await this.db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
    if (!tenant) throw new NotFoundException('Kiracı bulunamadı')

    const memberships = await this.db
      .select({ userId: tenantMemberships.userId })
      .from(tenantMemberships)
      .where(eq(tenantMemberships.tenantId, tenantId))
    const memberIds = memberships.map(item => item.userId)

    const rows = await this.db
      .select({ id: users.id, email: users.email, displayName: users.displayName })
      .from(users)
      .where(
        memberIds.length > 0 ? and(eq(users.status, 'ACTIVE'), notInArray(users.id, memberIds)) : eq(users.status, 'ACTIVE'),
      )
      .orderBy(users.email)

    return { users: rows }
  }

  async addMember(tenantId: string, dto: AddMemberDto) {
    const validation = validateAddMember(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    const idCheck = validateId(tenantId, 'Kiracı')
    if (!idCheck.valid) throw new BadRequestException(idCheck.errors)
    const [tenant] = await this.db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
    if (!tenant) throw new NotFoundException('Kiracı bulunamadı')

    const [user] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, dto.userId)).limit(1)
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı')

    const [existing] = await this.db
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, dto.userId)))
      .limit(1)
    if (existing) throw new ConflictException('Kullanıcı zaten bu kiracıda üye')

    return assertRow(await this.db.insert(tenantMemberships).values({ tenantId, userId: dto.userId, isActive: true }).returning())
  }
}
