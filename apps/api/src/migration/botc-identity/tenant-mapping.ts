import type { ApprovedTenantAssignmentEntry, ApprovedTenantSlug, TenantMembershipStatus } from './types'

/**
 * Q-M06 closure (TASK-027.12-R1): tenant assignment is NOT derived from `Sirket` or any other
 * free-text BOTC field — it comes from a separately approved external mapping table, keyed by the
 * BOTC user's legacy id. This module does not invent that table; callers must supply it.
 */
export const KNOWN_TENANT_SLUGS: readonly ApprovedTenantSlug[] = ['MOSB', 'MOSEDAS', 'MOSBIO']

export interface TenantAssignmentResolution {
  tenantSlug: ApprovedTenantSlug | null
  status: TenantMembershipStatus
}

export function buildTenantAssignmentIndex(
  table: readonly ApprovedTenantAssignmentEntry[],
): Map<string, ApprovedTenantSlug | null> {
  const index = new Map<string, ApprovedTenantSlug | null>()
  for (const entry of table) {
    if (entry.tenantSlug !== null && !KNOWN_TENANT_SLUGS.includes(entry.tenantSlug)) {
      throw new Error(`Unknown tenant slug in approved assignment table: ${entry.tenantSlug}`)
    }
    index.set(entry.userLegacyId, entry.tenantSlug)
  }
  return index
}

/** UNRESOLVED unless the approved table has an explicit, non-null tenant slug for this user. */
export function resolveTenantAssignment(
  userLegacyId: string,
  assignmentIndex: ReadonlyMap<string, ApprovedTenantSlug | null>,
): TenantAssignmentResolution {
  const tenantSlug = assignmentIndex.get(userLegacyId) ?? null
  return tenantSlug ? { tenantSlug, status: 'ASSIGNED' } : { tenantSlug: null, status: 'UNRESOLVED' }
}
