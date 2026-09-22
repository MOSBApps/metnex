import { randomUUID } from 'crypto'
import { computeSourceChecksum } from './checksum.util'
import { detectConflictingTenantAssignments, detectDuplicateRoleNames, detectDuplicateUsers } from './duplicate-detection'
import { mapPermissionCode } from './permission-mapping'
import { RoleTemplateService } from './role-template.service'
import { SimulatedTargetState } from './simulated-target'
import { InMemoryStagingStore } from './staging-store'
import { buildTenantAssignmentIndex, resolveTenantAssignment } from './tenant-mapping'
import type {
  ApprovedTenantAssignmentEntry,
  BotcIdentitySourceSnapshot,
  BotcSourceUser,
  DryRunReport,
  MigrationIssue,
  StagingRecord,
} from './types'

export type MigrationRunMode = 'DRY_RUN' | 'APPLY'

export interface MigrationRunInput {
  source: BotcIdentitySourceSnapshot
  approvedTenantAssignmentTable: readonly ApprovedTenantAssignmentEntry[]
  /** Legacy user ids for whom an admin has already manually assigned a temporary password. */
  adminAssignedPasswordLegacyIds?: ReadonlySet<string>
  /**
   * Test/operational hook: legacy user ids to mark FAILED for this run (simulating an apply-time
   * write error) instead of the normal outcome — used to exercise retry-after-failure behavior,
   * since this in-memory engine has no other source of genuine write failures.
   */
  simulateFailureLegacyIds?: ReadonlySet<string>
  stagingStore: InMemoryStagingStore
  targetState: SimulatedTargetState
  mode: MigrationRunMode
  migrationRunId: string
  now?: () => Date
}

export interface MigrationRunResult {
  report: DryRunReport
}

/**
 * Wave 1 identity migration engine (TASK-027.12). Both DRY_RUN and APPLY execute the identical
 * planning logic against private clones of the staging store and simulated target state; APPLY
 * additionally commits the clones back into the caller's instances, DRY_RUN discards them —
 * matching the "dry-run performs no writes" rule from
 * docs/migration/METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md §1. "APPLY" here means
 * writing to the in-memory SimulatedTargetState only — this module never opens a PostgreSQL or SQL
 * Server connection, and never writes to `authSessions`.
 */
export class MigrationRunService {
  private readonly roleTemplateService = new RoleTemplateService()

  run(input: MigrationRunInput): MigrationRunResult {
    const now = input.now ?? (() => new Date())
    const nowIso = () => now().toISOString()

    const stagingClone = input.stagingStore.clone()
    const targetClone = input.targetState.clone()
    const issues: MigrationIssue[] = []

    const { winners: uniqueUsers, issues: duplicateUserIssues } = detectDuplicateUsers(input.source.users)
    issues.push(...duplicateUserIssues)
    issues.push(...detectDuplicateRoleNames(input.source.roles))

    const { resolved: resolvedTenantTable, issues: tenantConflictIssues } = detectConflictingTenantAssignments(
      input.approvedTenantAssignmentTable,
    )
    issues.push(...tenantConflictIssues)
    const tenantAssignmentIndex = buildTenantAssignmentIndex([...resolvedTenantTable.values()])

    let usersToCreate = 0
    let usersToUpdate = 0
    let usersToSkip = 0
    const unresolvedRecords: DryRunReport['unresolvedRecords'] = []
    const adminAssigned = input.adminAssignedPasswordLegacyIds ?? new Set<string>()
    const passwordStrategySummary: DryRunReport['passwordStrategySummary'] = { RESET_REQUIRED: 0, ADMIN_ASSIGNED: 0 }

    const sortedUsers = [...uniqueUsers.values()].sort((a, b) => a.legacyId.localeCompare(b.legacyId))
    const resolvedTargetIdByLegacyUserId = new Map<string, string>()

    for (const user of sortedUsers) {
      const checksum = computeSourceChecksum(user)
      const existing = stagingClone.findByLegacy('USER', user.legacyId)
      const simulateFailure = input.simulateFailureLegacyIds?.has(user.legacyId) ?? false
      const record = this.planUserRecord(user, checksum, existing, input.migrationRunId, nowIso, issues, simulateFailure)
      stagingClone.upsert(record)

      if (record.mappingStatus === 'SKIPPED') {
        usersToSkip += 1
        if (record.targetId) resolvedTargetIdByLegacyUserId.set(user.legacyId, record.targetId)
      } else if (record.mappingStatus === 'COMPLETED' && record.targetId) {
        resolvedTargetIdByLegacyUserId.set(user.legacyId, record.targetId)
        if (existing?.mappingStatus === 'COMPLETED' || existing?.mappingStatus === 'SKIPPED') usersToUpdate += 1
        else usersToCreate += 1

        // ADMIN_ASSIGNED is sticky once recorded (TASK-027.16): it represents a fact that already
        // happened ("an admin assigned a temporary password"), not a live input that must be
        // re-supplied on every run. Without this, a later run that updates this user (checksum
        // changed) without re-passing their legacyId in `adminAssignedPasswordLegacyIds` would
        // silently drop the flag — this mirrors the targetId-preservation principle already used
        // for updates elsewhere in this method.
        const previousStrategies = targetClone.usersByLegacyId.get(user.legacyId)?.passwordStrategies ?? []
        const passwordStrategies: Array<'RESET_REQUIRED' | 'ADMIN_ASSIGNED'> = ['RESET_REQUIRED']
        if (adminAssigned.has(user.legacyId) || previousStrategies.includes('ADMIN_ASSIGNED')) {
          passwordStrategies.push('ADMIN_ASSIGNED')
        }
        for (const strategy of passwordStrategies) passwordStrategySummary[strategy] += 1

        targetClone.usersByLegacyId.set(user.legacyId, {
          id: record.targetId,
          sourceLegacyId: user.legacyId,
          email: this.resolveEmail(user),
          displayName: user.fullName,
          status: user.isActive ? 'ACTIVE' : 'INACTIVE',
          passwordStrategies,
        })
      }

      // Tenant membership is a layer independent of identity mapping (design doc §8.1) — it is
      // only actually written if identity resolved to a targetId.
      const targetId = record.targetId
      const resolution = resolveTenantAssignment(user.legacyId, tenantAssignmentIndex)
      record.tenantMembershipStatus = resolution.status
      if (targetId && resolution.status === 'ASSIGNED' && resolution.tenantSlug) {
        targetClone.tenantMembershipsByUserId.set(targetId, { userId: targetId, tenantSlug: resolution.tenantSlug })
      } else if (resolution.status === 'UNRESOLVED') {
        unresolvedRecords.push({
          sourceEntityType: 'USER',
          sourceLegacyId: user.legacyId,
          reason: 'Tenant ataması onaylı mapping tablosunda bulunamadı (Q-M06/Q-T01) — tenantMembershipStatus = UNRESOLVED.',
        })
      }
    }

    // Permission catalogue mapping (Q-M03 closure).
    let permissionCodesMapped = 0
    let permissionCodesUnmapped = 0
    const permissionsByLegacyId = new Map<string, string>()
    for (const permission of input.source.permissions) {
      permissionsByLegacyId.set(permission.legacyId, permission.permissionName)
      const checksum = computeSourceChecksum(permission)
      const existing = stagingClone.findByLegacy('PERMISSION', permission.legacyId)
      const code = mapPermissionCode(permission.permissionName)
      if (code) {
        permissionCodesMapped += 1
        stagingClone.upsert(
          this.buildRecord(existing, permission.legacyId, 'PERMISSION', 'tenantRolePermissions', code, 'COMPLETED', null, null, checksum, input.migrationRunId, nowIso),
        )
      } else {
        permissionCodesUnmapped += 1
        const errorCode = 'RECOVERABLE_UNMAPPED_PERMISSION'
        const errorDescription = `BOTC izni "${permission.permissionName}" için onaylı MODULE:RESOURCE:ACTION eşlemesi yok (Q-M03 taslağında bu izin için kod tanımlanmamış).`
        issues.push({ category: 'RECOVERABLE', code: errorCode, description: errorDescription, sourceEntityType: 'PERMISSION', sourceLegacyId: permission.legacyId })
        stagingClone.upsert(
          this.buildRecord(existing, permission.legacyId, 'PERMISSION', 'tenantRolePermissions', null, 'BLOCKED', errorCode, errorDescription, checksum, input.migrationRunId, nowIso),
        )
      }
    }

    // Role template clustering (Q-M04 closure) — only over users whose identity resolved.
    const rolesByLegacyId = new Map(input.source.roles.map(r => [r.legacyId, r]))
    const identityResolvedUsers = sortedUsers.filter(u => resolvedTargetIdByLegacyUserId.has(u.legacyId))
    const effectiveByUser = this.roleTemplateService.computeEffectivePermissions(
      identityResolvedUsers,
      input.source.userPermissions,
      permissionsByLegacyId,
    )
    const templates = this.roleTemplateService.buildTemplates(effectiveByUser, identityResolvedUsers, rolesByLegacyId)

    for (const template of templates) {
      targetClone.roleTemplatesById.set(template.templateId, {
        id: template.templateId,
        name: template.name,
        permissionCodes: template.permissionCodes,
      })
      for (const userLegacyId of template.memberUserLegacyIds) {
        const userId = resolvedTargetIdByLegacyUserId.get(userLegacyId)
        if (!userId) continue
        const alreadyAssigned = targetClone.roleAssignments.some(a => a.userId === userId && a.roleTemplateId === template.templateId)
        if (!alreadyAssigned) targetClone.roleAssignments.push({ userId, roleTemplateId: template.templateId })
      }
    }

    // USER_PERMISSION staging records — each raw grant either fed a template or was blocked.
    const templateIdBySignature = new Map(templates.map(t => [t.permissionCodes.join('|'), t.templateId]))
    for (const grant of input.source.userPermissions) {
      const checksum = computeSourceChecksum(grant)
      const existing = stagingClone.findByLegacy('USER_PERMISSION', grant.legacyId)
      const permissionName = permissionsByLegacyId.get(grant.permissionLegacyId)
      const effective = effectiveByUser.get(grant.userLegacyId)
      const code = permissionName ? mapPermissionCode(permissionName) : null
      if (effective && code) {
        const templateId = templateIdBySignature.get(effective.mappedPermissionCodes.join('|')) ?? null
        stagingClone.upsert(
          this.buildRecord(existing, grant.legacyId, 'USER_PERMISSION', 'tenantRolePermissions', templateId, templateId ? 'COMPLETED' : 'BLOCKED', null, null, checksum, input.migrationRunId, nowIso),
        )
      } else {
        const errorCode = !effective ? 'RECOVERABLE_UNRESOLVED_USER_FOR_GRANT' : 'RECOVERABLE_UNMAPPED_PERMISSION'
        const errorDescription = !effective
          ? `UserPermission ${grant.legacyId}, kimliği çözülemeyen kullanıcı ${grant.userLegacyId}'e ait.`
          : `UserPermission ${grant.legacyId}, eşlenemeyen izin ${grant.permissionLegacyId}'e ait.`
        issues.push({ category: 'RECOVERABLE', code: errorCode, description: errorDescription, sourceEntityType: 'USER_PERMISSION', sourceLegacyId: grant.legacyId })
        stagingClone.upsert(
          this.buildRecord(existing, grant.legacyId, 'USER_PERMISSION', 'tenantRolePermissions', null, 'BLOCKED', errorCode, errorDescription, checksum, input.migrationRunId, nowIso),
        )
      }
    }

    const tenantAssignedCount = [...targetClone.tenantMembershipsByUserId.values()].length
    const report: DryRunReport = {
      migrationRunId: input.migrationRunId,
      generatedAt: nowIso(),
      totalSourceRecords:
        input.source.users.length + input.source.roles.length + input.source.permissions.length + input.source.userPermissions.length,
      usersToCreate,
      usersToUpdate,
      usersToSkip,
      conflicts: issues.filter(i => i.code === 'RECOVERABLE_DUPLICATE_USER' || i.code === 'FATAL_CONFLICTING_TENANT_ASSIGNMENT').length,
      roleAndPermissionChanges: {
        tenantRoleTemplatesToCreate: templates.length,
        permissionCodesMapped,
        permissionCodesUnmapped,
      },
      tenantMembershipResults: {
        assigned: tenantAssignedCount,
        unresolved: unresolvedRecords.length,
      },
      unresolvedRecords,
      errorsAndWarnings: issues,
      passwordStrategySummary,
    }

    if (input.mode === 'APPLY') {
      input.stagingStore.restoreFrom(stagingClone)
      input.targetState.restoreFrom(targetClone)
    }

    return { report }
  }

  private resolveEmail(user: BotcSourceUser): string {
    const email = user.email?.trim()
    if (email) return email
    return user.username.trim()
  }

  private planUserRecord(
    user: BotcSourceUser,
    checksum: string,
    existing: StagingRecord | undefined,
    migrationRunId: string,
    nowIso: () => string,
    issues: MigrationIssue[],
    simulateFailure: boolean,
  ): StagingRecord {
    // Idempotent no-op: unchanged source, already completed/skipped in a previous run.
    if (existing && (existing.mappingStatus === 'COMPLETED' || existing.mappingStatus === 'SKIPPED') && existing.sourceChecksum === checksum) {
      return { ...existing, mappingStatus: 'SKIPPED', migrationRunId, updatedAt: nowIso() }
    }

    if (simulateFailure) {
      const errorCode = 'RECOVERABLE_SIMULATED_WRITE_FAILURE'
      const errorDescription = `Kullanıcı ${user.legacyId} için apply sırasında bir yazma hatası simüle edildi — sonraki çalıştırmada otomatik yeniden denenir.`
      issues.push({ category: 'RECOVERABLE', code: errorCode, description: errorDescription, sourceEntityType: 'USER', sourceLegacyId: user.legacyId })
      // FAILED never carries a partial targetId — an unwritten record stays null, a previously
      // COMPLETED one that failed on update keeps its prior value (design doc §4.2).
      const preservedTargetId = existing?.mappingStatus === 'COMPLETED' || existing?.mappingStatus === 'SKIPPED' ? existing.targetId : null
      return this.buildRecord(existing, user.legacyId, 'USER', 'users', preservedTargetId, 'FAILED', errorCode, errorDescription, checksum, migrationRunId, nowIso)
    }

    const candidateEmail = this.resolveEmail(user)
    const emailValid = candidateEmail.includes('@') && candidateEmail.length > 3
    const displayNameValid = user.fullName.trim().length > 0

    if (!emailValid || !displayNameValid) {
      const errorCode = !emailValid ? 'RECOVERABLE_INVALID_EMAIL' : 'RECOVERABLE_MISSING_DISPLAY_NAME'
      const errorDescription = !emailValid
        ? `Kullanıcı ${user.legacyId} için geçerli bir email/username türetilemedi ("${candidateEmail}").`
        : `Kullanıcı ${user.legacyId} için FullName boş.`
      issues.push({ category: 'RECOVERABLE', code: errorCode, description: errorDescription, sourceEntityType: 'USER', sourceLegacyId: user.legacyId })
      return this.buildRecord(existing, user.legacyId, 'USER', 'users', null, 'BLOCKED', errorCode, errorDescription, checksum, migrationRunId, nowIso)
    }

    // Retry (FAILED) or first-time success always gets a fresh target id — a FAILED record never
    // carries a partial targetId (design doc §4.2). An update (checksum changed on an already
    // COMPLETED/SKIPPED record) preserves the previous target id.
    const targetId =
      existing && (existing.mappingStatus === 'COMPLETED' || existing.mappingStatus === 'SKIPPED') && existing.targetId
        ? existing.targetId
        : randomUUID()

    return this.buildRecord(existing, user.legacyId, 'USER', 'users', targetId, 'COMPLETED', null, null, checksum, migrationRunId, nowIso)
  }

  private buildRecord(
    existing: StagingRecord | undefined,
    sourceLegacyId: string,
    sourceEntityType: StagingRecord['sourceEntityType'],
    targetEntityType: string,
    targetId: string | null,
    mappingStatus: StagingRecord['mappingStatus'],
    errorCode: string | null,
    errorDescription: string | null,
    sourceChecksum: string,
    migrationRunId: string,
    nowIso: () => string,
  ): StagingRecord {
    const timestamp = nowIso()
    return {
      id: existing?.id ?? randomUUID(),
      sourceLegacyId,
      sourceEntityType,
      targetEntityType,
      targetId,
      migrationRunId,
      mappingStatus,
      errorCode,
      errorDescription,
      sourceChecksum,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      tenantMembershipStatus: existing?.tenantMembershipStatus,
    }
  }
}
