/**
 * BOTC -> Metnex identity migration (Wave 1, TASK-027.12).
 *
 * These types model the source data, the conceptual staging record, and the simulated target
 * state used by the dry-run/apply engine in this module. No physical Drizzle schema or migration
 * exists for `migration_staging_identity` — Q-ID01 (schema placement + retention) is still open
 * (see docs/migration/BOTC_MIGRATION_OPEN_QUESTIONS.md), so staging is intentionally an in-memory
 * simulation only (see staging-store.ts). No PostgreSQL apply, no SQL Server connection, and no
 * `authSessions` writes happen anywhere in this module.
 */

export type BotcSourceEntityType = 'USER' | 'ROLE' | 'PERMISSION' | 'USER_PERMISSION'

export interface BotcSourceUser {
  legacyId: string
  username: string
  fullName: string
  isActive: boolean
  email: string | null
  createdDate: string
  roleLegacyId: string | null
  sirket: string | null
}

export interface BotcSourceRole {
  legacyId: string
  name: string
}

export interface BotcSourcePermission {
  legacyId: string
  permissionName: string
}

export interface BotcSourceUserPermission {
  legacyId: string
  userLegacyId: string
  permissionLegacyId: string
}

export interface BotcIdentitySourceSnapshot {
  users: BotcSourceUser[]
  roles: BotcSourceRole[]
  permissions: BotcSourcePermission[]
  userPermissions: BotcSourceUserPermission[]
}

/** Approved business tenants (Q-M06 closure — TASK-027.12-R1). No other slug may be produced. */
export type ApprovedTenantSlug = 'MOSB' | 'MOSEDAS' | 'MOSBIO'

/** A single row of the separately-approved, external user->tenant mapping table (Q-M06). */
export interface ApprovedTenantAssignmentEntry {
  userLegacyId: string
  tenantSlug: ApprovedTenantSlug | null
}

export type MappingStatus = 'PENDING' | 'BLOCKED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED'

export type TenantMembershipStatus = 'UNRESOLVED' | 'ASSIGNED'

/** Q-A03/Q-PW01 closure — RESET_REQUIRED is mandatory; ADMIN_ASSIGNED is an additive channel flag. */
export type PasswordStrategy = 'RESET_REQUIRED' | 'ADMIN_ASSIGNED'

export interface StagingRecord {
  id: string
  sourceLegacyId: string
  sourceEntityType: BotcSourceEntityType
  targetEntityType: string
  targetId: string | null
  migrationRunId: string
  mappingStatus: MappingStatus
  errorCode: string | null
  errorDescription: string | null
  sourceChecksum: string
  createdAt: string
  updatedAt: string
  tenantMembershipStatus?: TenantMembershipStatus
}

export type ErrorCategory = 'FATAL' | 'RECOVERABLE' | 'WARNING' | 'SKIPPED'

export interface MigrationIssue {
  category: ErrorCategory
  code: string
  description: string
  sourceEntityType: BotcSourceEntityType
  sourceLegacyId: string
}

export interface DryRunReport {
  migrationRunId: string
  generatedAt: string
  totalSourceRecords: number
  usersToCreate: number
  usersToUpdate: number
  usersToSkip: number
  conflicts: number
  roleAndPermissionChanges: {
    tenantRoleTemplatesToCreate: number
    permissionCodesMapped: number
    permissionCodesUnmapped: number
  }
  tenantMembershipResults: {
    assigned: number
    unresolved: number
  }
  unresolvedRecords: Array<{ sourceEntityType: BotcSourceEntityType; sourceLegacyId: string; reason: string }>
  errorsAndWarnings: MigrationIssue[]
  passwordStrategySummary: Record<PasswordStrategy, number>
}
