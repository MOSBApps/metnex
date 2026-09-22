import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DB, type Db } from '../db/db.module'
import { tenants } from '../db/schema'
import { CustomerSchemaRegistryService } from './customer-schema-registry.service'
import { TenantClosureService } from './tenant-closure.service'

export interface TenantScopeResult {
  tenantId: string
  customerRootTenantId: string
  schemaName: string
  dataScopeTenantIds: string[]
  canEnterData: boolean
  canAggregateChildren: boolean
}

@Injectable()
export class TenantScopeService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly closure: TenantClosureService,
    private readonly registry: CustomerSchemaRegistryService,
  ) {}

  /**
   * Resolves data-plane scope for an already-authorized tenantId (the same value
   * PermissionGuard/PackageFeatureGuard already validated membership for). This answers "what
   * data can this tenant see", not "is the caller allowed to act as this tenant" — never call it
   * with a raw, unvalidated frontend/cookie value.
   *
   * Fails closed for: unknown tenant, PLATFORM_ROOT, inactive tenant, a tenant with no customer
   * root, or a customer root with no ACTIVE schema registry row.
   */
  async resolve(tenantId: string): Promise<TenantScopeResult> {
    const [tenant] = await this.db
      .select({
        id: tenants.id,
        type: tenants.type,
        status: tenants.status,
        customerRootId: tenants.customerRootId,
        canEnterData: tenants.canEnterData,
        canAggregateChildren: tenants.canAggregateChildren,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    if (!tenant) throw new NotFoundException('Tenant bulunamadı')
    if (tenant.type === 'PLATFORM_ROOT') {
      throw new ForbiddenException('Platform root için data-plane scope çözümlenemez')
    }
    if (tenant.status !== 'ACTIVE') throw new ForbiddenException('Tenant aktif değil')
    if (!tenant.customerRootId) throw new ForbiddenException('Tenant bir customer root ağacına ait değil')

    const activeRegistry = await this.registry.getActiveRegistry(tenant.customerRootId)
    if (!activeRegistry) throw new ForbiddenException('Customer root için aktif schema kaydı yok')

    const dataScopeTenantIds = tenant.canAggregateChildren
      ? await this.closure.getDescendantTenantIds(tenantId)
      : [tenantId]

    return {
      tenantId: tenant.id,
      customerRootTenantId: tenant.customerRootId,
      schemaName: activeRegistry.schemaName,
      dataScopeTenantIds,
      canEnterData: tenant.canEnterData,
      canAggregateChildren: tenant.canAggregateChildren,
    }
  }
}
