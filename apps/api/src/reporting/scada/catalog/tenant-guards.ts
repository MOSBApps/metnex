import { CatalogError } from './catalog-rules'

/**
 * DEC-0014 / DEC-0015 (Q-SC01 C): MOSEDAŞ is NOT a Metnex tenant — it is at most a physical
 * source/database name. A source can therefore never be mapped to a tenant that is (or is named
 * like) MOSEDAŞ, and no tenant is ever created here. This file is the ONLY production place that
 * names it, as a rejection rule (allow-listed by the static consistency tests).
 */
const FORBIDDEN_TENANT_SLUG = 'mosedas'

export interface TenantRecord {
  id: string
  type: 'PLATFORM_ROOT' | 'ROOT' | 'STANDARD'
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'
  slug: string
}

const fold = (value: string) => value.toLowerCase().replace(/ş/g, 's').replace(/ı/g, 'i').replace(/[^a-z0-9]/g, '')

export function assertMappableTenant(tenant: TenantRecord | null): asserts tenant is TenantRecord {
  if (!tenant) throw new CatalogError('TENANT_NOT_FOUND')
  if (tenant.type === 'PLATFORM_ROOT') throw new CatalogError('TENANT_NOT_MAPPABLE')
  if (tenant.status !== 'ACTIVE') throw new CatalogError('TENANT_NOT_ACTIVE')
  if (fold(tenant.slug) === FORBIDDEN_TENANT_SLUG) throw new CatalogError('MOSEDAS_IS_NOT_A_TENANT')
}

/** TASK-027.73-R1: true for the excluded organisation's record — discovery must not LIST anything mapped to it (not merely mark it blocked). */
export function isExcludedOrganisationTenant(tenant: TenantRecord | null): boolean {
  return tenant !== null && fold(tenant.slug) === FORBIDDEN_TENANT_SLUG
}
