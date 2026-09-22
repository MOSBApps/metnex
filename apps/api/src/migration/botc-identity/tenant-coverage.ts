import { detectConflictingTenantAssignments } from './duplicate-detection'
import { buildTenantAssignmentIndex, resolveTenantAssignment } from './tenant-mapping'
import type { ApprovedTenantAssignmentEntry, ApprovedTenantSlug, BotcSourceUser } from './types'

/**
 * TASK-027.15 — tenant mapping coverage and assignment governance boundary. Entirely read-only:
 * reuses `tenant-mapping.ts` and `duplicate-detection.ts` exactly as they are (Q-M06's mechanism is
 * not touched), never reads `Sirket`, never invents a tenant slug, and never calls
 * `MigrationRunService`. Exists purely to report coverage and to give the per-user tenant mapping
 * record a stable, testable shape.
 */

export type TenantMappingRecordStatus = 'ASSIGNED' | 'UNRESOLVED'

/** Fixed report shape for one user's tenant mapping outcome (task scope item 4). */
export interface TenantMappingReportEntry {
  sourceLegacyUserId: string
  tenantSlug: ApprovedTenantSlug | null
  status: TenantMappingRecordStatus
  errorCode: string | null
  description: string
  migrationRunId: string
  /**
   * Always false: an UNRESOLVED mapping is a data gap in the externally-approved mapping table
   * (Q-M06) — a bare re-run with the SAME table deterministically produces the SAME UNRESOLVED
   * result again (see tenant-coverage.spec.ts). It only becomes ASSIGNED once that external table
   * is updated with a new, approved entry, which is not something this migration run can trigger
   * on its own. This mirrors `permission-coverage.ts`'s `retryable` semantics for unmapped
   * permissions.
   */
  retryable: false
}

export function buildTenantMappingReportEntry(
  userLegacyId: string,
  resolution: { tenantSlug: ApprovedTenantSlug | null; status: TenantMappingRecordStatus },
  migrationRunId: string,
): TenantMappingReportEntry {
  if (resolution.status === 'ASSIGNED' && resolution.tenantSlug) {
    return {
      sourceLegacyUserId: userLegacyId,
      tenantSlug: resolution.tenantSlug,
      status: 'ASSIGNED',
      errorCode: null,
      description: `Kullanıcı ${userLegacyId}, onaylı tenant mapping tablosuna göre ${resolution.tenantSlug} tenant'ına atandı.`,
      migrationRunId,
      retryable: false,
    }
  }
  return {
    sourceLegacyUserId: userLegacyId,
    tenantSlug: null,
    status: 'UNRESOLVED',
    errorCode: 'UNRESOLVED_TENANT_MAPPING',
    description: `Kullanıcı ${userLegacyId} için onaylı mapping tablosunda bir tenant ataması yok (Q-M06/Q-T01/Q-SC01) — tenant membership veya runtime erişim üretilmeyecek.`,
    migrationRunId,
    retryable: false,
  }
}

/**
 * Static, documentary reference of the BOTC location categories already known (from
 * docs/migration/BOTC_MIP_TENANT_LOCATION_MAPPING.md §3) to be ambiguous and therefore pending
 * Q-T01/Q-SC01. This list is NOT derived from `Sirket` or any other runtime source field — using
 * Sirket to explain *why* a given user is UNRESOLVED would itself be "using Sirket as a tenant
 * mapping source", which Q-M06 forbids. It exists purely so the coverage report can point at the
 * already-documented open questions without re-deciding them.
 */
export const KNOWN_PENDING_LOCATION_CATEGORIES = ['MOSBİO KIRIM DEPO', 'SANTRAL', 'KÖMÜR KAZANI', 'GT/SG fiziksel kaynakları'] as const

export interface TenantMappingCoverageReport {
  totalSourceUsers: number
  usersInMappingTable: number
  assignedUsers: number
  unresolvedUsers: number
  conflictRecords: number
  /** Approved-table entries referencing a legacy user id absent from the given source snapshot. */
  orphanMappingRecords: number
  usersByTenant: Record<ApprovedTenantSlug, number>
  knownPendingLocationCategories: readonly string[]
}

export function computeTenantMappingCoverage(
  users: readonly BotcSourceUser[],
  approvedTenantAssignmentTable: readonly ApprovedTenantAssignmentEntry[],
): TenantMappingCoverageReport {
  const userLegacyIds = new Set(users.map(u => u.legacyId))

  const { resolved, issues: conflictIssues } = detectConflictingTenantAssignments(approvedTenantAssignmentTable)
  const tenantAssignmentIndex = buildTenantAssignmentIndex([...resolved.values()])

  let assignedUsers = 0
  let unresolvedUsers = 0
  const usersByTenant: Record<ApprovedTenantSlug, number> = { MOSB: 0, MOSEDAS: 0, MOSBIO: 0 }

  for (const user of users) {
    const resolution = resolveTenantAssignment(user.legacyId, tenantAssignmentIndex)
    if (resolution.status === 'ASSIGNED' && resolution.tenantSlug) {
      assignedUsers += 1
      usersByTenant[resolution.tenantSlug] += 1
    } else {
      unresolvedUsers += 1
    }
  }

  const orphanMappingRecords = approvedTenantAssignmentTable.filter(entry => !userLegacyIds.has(entry.userLegacyId)).length
  const usersInMappingTable = new Set(approvedTenantAssignmentTable.map(entry => entry.userLegacyId)).size

  return {
    totalSourceUsers: users.length,
    usersInMappingTable,
    assignedUsers,
    unresolvedUsers,
    conflictRecords: conflictIssues.length,
    orphanMappingRecords,
    usersByTenant,
    knownPendingLocationCategories: KNOWN_PENDING_LOCATION_CATEGORIES,
  }
}
