import { eq } from 'drizzle-orm'
import type { Db } from '../../../db/db.module'
import { tenants, users } from '../../../db/schema'
import type { TenantRecord } from '../catalog/tenant-guards'
import type { ScadaCallerDirectory } from './scada-api.contract'

/** The caller's tenant record and account state, read from the database — the request supplies neither. */
export class DbScadaCallerDirectory implements ScadaCallerDirectory {
  constructor(private readonly db: Db) {}

  /** The tenant record only (used by the development fixture's tenant gate). */
  async tenant(tenantId: string): Promise<TenantRecord | null> {
    const [tenant] = await this.db.select({ id: tenants.id, type: tenants.type, status: tenants.status, slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
    return tenant ? { id: tenant.id, type: tenant.type as TenantRecord['type'], status: tenant.status as TenantRecord['status'], slug: tenant.slug } : null
  }

  async describe(userId: string, tenantId: string): Promise<{ tenant: TenantRecord | null; userActive: boolean }> {
    const [tenant] = await this.db.select({ id: tenants.id, type: tenants.type, status: tenants.status, slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
    const [user] = await this.db.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1)
    return { tenant: tenant ? { id: tenant.id, type: tenant.type as TenantRecord['type'], status: tenant.status as TenantRecord['status'], slug: tenant.slug } : null, userActive: user?.status === 'ACTIVE' }
  }
}
