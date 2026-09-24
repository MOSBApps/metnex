import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Db } from '../../../db/db.module'
import { tenants } from '../../../db/schema'
import { isDevFixtureEnabled } from '../../dataset/dev-fixture-dataset.provider'
import { fixtureSourceZone } from '../fixture/scada-fixture-artifact'

/**
 * TASK-027.73-R4 — DEVELOPMENT-ONLY data-plane scope for the SCADA CSV fixture.
 *
 * `TenantScopeService.resolve()` needs an ACTIVE customer schema registry row, which a local development database does not have, so
 * the fixture screen was answered "SCADA_SCOPE_DENIED". This resolver answers the SAME question ("what data may this tenant see")
 * for the SCADA development API ONLY, from the tenant records that already exist — and nothing else:
 *
 *  - it only READS `tenants` (no insert / update / delete / DDL / raw SQL; no registry, closure, membership or schema is touched);
 *  - it is registered ONLY by `scadaApiProviders()` and ONLY when all four gates below are open; `TenantScopeService` and every
 *    other module keep their behaviour (no ACTIVE registry ⇒ fail-closed);
 *  - it is called only AFTER the guard chain (JWT → MFA → tenant header → membership → REPORT:ARTIFACT:VIEW): it cannot grant access
 *    the guards refused, and the tenant id it receives is the guarded header, never a request field;
 *  - data scope = the tenant itself. Children are NEVER added (no approved aggregation rule for the fixture); other roots are unreachable.
 */
export const SCADA_FIXTURE_SCOPE_BRIDGE_ENV = 'REPORTING_DEV_FIXTURE_SCOPE_BRIDGE'

/** All four gates: NODE_ENV=development, REPORTING_DEV_FIXTURES=true, the explicit bridge flag = true, a valid IANA source zone. */
export function isDevFixtureScopeBridgeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isDevFixtureEnabled(env) && env[SCADA_FIXTURE_SCOPE_BRIDGE_ENV] === 'true' && fixtureSourceZone(env) !== null
}

export interface DevBridgeScope {
  tenantId: string
  customerRootTenantId: string
  /** An internal marker that does not look like a physical schema; never returned, never used to build SQL / search_path. */
  schemaName: '@dev-scope-bridge'
  dataScopeTenantIds: string[]
  canEnterData: boolean
  canAggregateChildren: boolean
  devScopeBridge: true
}

export class DevFixtureScopeResolver {
  constructor(private readonly db: Db) {}

  async resolve(tenantId: string): Promise<DevBridgeScope> {
    if (typeof tenantId !== 'string' || tenantId === '') throw new NotFoundException('Tenant bulunamadı')
    const [tenant] = await this.db
      .select({ id: tenants.id, type: tenants.type, status: tenants.status, customerRootId: tenants.customerRootId, canEnterData: tenants.canEnterData, canAggregateChildren: tenants.canAggregateChildren })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    if (!tenant) throw new NotFoundException('Tenant bulunamadı')
    if (tenant.type === 'PLATFORM_ROOT') throw new ForbiddenException('Platform root için data-plane scope çözümlenemez')
    if (tenant.status !== 'ACTIVE') throw new ForbiddenException('Tenant aktif değil')
    if (!tenant.customerRootId) throw new ForbiddenException('Tenant bir customer root ağacına ait değil')
    const [root] = await this.db.select({ id: tenants.id, type: tenants.type, status: tenants.status }).from(tenants).where(eq(tenants.id, tenant.customerRootId)).limit(1)
    if (!root || root.type === 'PLATFORM_ROOT') throw new ForbiddenException('Customer root bulunamadı')
    if (root.status !== 'ACTIVE') throw new ForbiddenException('Customer root aktif değil')
    return {
      tenantId: tenant.id,
      customerRootTenantId: tenant.customerRootId,
      schemaName: '@dev-scope-bridge',
      dataScopeTenantIds: [tenant.id], // children are never added automatically
      canEnterData: tenant.canEnterData,
      canAggregateChildren: tenant.canAggregateChildren,
      devScopeBridge: true,
    }
  }
}
