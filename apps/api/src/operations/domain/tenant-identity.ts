/**
 * TASK-029.01 — the tenant record shape this domain reads. It is a STRUCTURAL copy of the real
 * `tenants` row shape (see `apps/api/src/db/schema/platform.ts` / `apps/api/src/tenant-scope/`),
 * not an import of it: this domain module must stay independently readable and testable without
 * a NestJS/DB wiring (DEC-0017 — pure domain/reference contract only, no API/UI/DB in this task).
 */
export interface TenantIdentity {
  tenantId: string
  type: 'PLATFORM_ROOT' | 'ROOT' | 'STANDARD'
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'
  slug: string
}

/**
 * DEC-0014 / DEC-0017 (D-04 stays OPEN): MOSEDAŞ is not, and must never become, a Metnex tenant.
 * This is an INDEPENDENT copy of the same rule already enforced in
 * `apps/api/src/reporting/scada/catalog/tenant-guards.ts` (defense in depth — the same pattern the
 * repo already uses between the API's and the Jasper renderer's own JRXML sandbox checks). This
 * file does NOT resolve the separate, still-open conflict between this rule and the approved
 * migration slug list (`apps/api/src/migration/botc-identity/tenant-mapping.ts`) — D-04 is reported,
 * not silently fixed, by this task.
 */
const FORBIDDEN_TENANT_SLUG = 'mosedas'

const fold = (value: string) => value.toLowerCase().replace(/ş/g, 's').replace(/ı/g, 'i').replace(/[^a-z0-9]/g, '')

export function isForbiddenMosedasTenant(tenant: Pick<TenantIdentity, 'slug'>): boolean {
  return fold(tenant.slug) === FORBIDDEN_TENANT_SLUG
}

export function isMappableTenant(tenant: TenantIdentity | null): tenant is TenantIdentity {
  if (!tenant) return false
  if (tenant.type === 'PLATFORM_ROOT') return false
  if (tenant.status !== 'ACTIVE') return false
  if (isForbiddenMosedasTenant(tenant)) return false
  return true
}
