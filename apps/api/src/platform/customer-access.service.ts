import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { DB, type Db } from '../db/db.module'
import { systemRoles, tenants, userSystemRoleAssignments } from '../db/schema'

const TENANT_SELECT = {
  id: tenants.id,
  name: tenants.name,
  slug: tenants.slug,
  type: tenants.type,
  status: tenants.status,
  parentId: tenants.parentId,
  customerRootId: tenants.customerRootId,
} as const

@Injectable()
export class CustomerAccessService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async resolveCustomerRoot(tenantId: string) {
    const [tenant] = await this.db.select(TENANT_SELECT).from(tenants).where(eq(tenants.id, tenantId)).limit(1)

    if (!tenant || tenant.status !== 'ACTIVE') {
      throw new BadRequestException('Aktif tenant bulunamadı')
    }

    if (tenant.type === 'PLATFORM_ROOT') {
      throw new ForbiddenException('Platform root tenant customer-admin scope olarak kullanılamaz')
    }

    const customerRootId = tenant.type === 'ROOT' ? tenant.id : tenant.customerRootId
    if (!customerRootId) {
      throw new ForbiddenException('Bu tenant bir customer root ağacına bağlı değil')
    }

    const [customerRoot] = await this.db
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug, type: tenants.type, status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, customerRootId))
      .limit(1)

    if (!customerRoot || customerRoot.status !== 'ACTIVE' || customerRoot.type !== 'ROOT') {
      throw new NotFoundException('Customer root tenant bulunamadı')
    }

    return { tenant, customerRoot }
  }

  async assertCustomerAdminScope(userId: string, isSystemAdmin: boolean, tenantId: string) {
    const scope = await this.resolveCustomerRoot(tenantId)
    if (isSystemAdmin) return scope

    const [assignment] = await this.db
      .select({ id: userSystemRoleAssignments.id })
      .from(userSystemRoleAssignments)
      .innerJoin(systemRoles, eq(userSystemRoleAssignments.roleId, systemRoles.id))
      .where(
        and(
          eq(userSystemRoleAssignments.userId, userId),
          eq(userSystemRoleAssignments.tenantId, scope.customerRoot.id),
          eq(systemRoles.name, 'TENANT_ADMIN'),
        ),
      )
      .limit(1)

    if (!assignment) {
      throw new ForbiddenException('Bu müşteri ağacını yönetme yetkiniz yok')
    }

    return scope
  }

  async assertTenantBelongsToCustomerRoot(targetTenantId: string, customerRootId: string) {
    const [tenant] = await this.db.select(TENANT_SELECT).from(tenants).where(eq(tenants.id, targetTenantId)).limit(1)

    if (!tenant) throw new NotFoundException('Tenant bulunamadı')

    const belongs =
      tenant.id === customerRootId ||
      tenant.customerRootId === customerRootId ||
      (tenant.type === 'ROOT' && tenant.id === customerRootId)

    if (!belongs) {
      throw new ForbiddenException('Tenant bu customer root ağacına ait değil')
    }

    return tenant
  }
}
