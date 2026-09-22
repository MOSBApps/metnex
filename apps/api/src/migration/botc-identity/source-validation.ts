import { detectConflictingTenantAssignments } from './duplicate-detection'
import { KNOWN_TENANT_SLUGS } from './tenant-mapping'
import type { ApprovedTenantAssignmentEntry, BotcIdentitySourceSnapshot, BotcSourceEntityType, MigrationIssue } from './types'

/**
 * Preflight validation (TASK-027.13) — the "Preflight" phase (§1 stage 1) of
 * docs/migration/METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md, made concrete for the
 * BOTC identity source. This is read-only: it inspects a snapshot and an approved tenant mapping
 * table and reports structural problems, it never mutates anything and never calls
 * `MigrationRunService`. Callers should run this BEFORE `MigrationRunService.run()` and refuse to
 * proceed (no DRY_RUN, no APPLY) when `isFatal` is true — this keeps the engine itself
 * (docs/migration/METNEX_USER_MIGRATION_IMPLEMENTATION.md) unmodified, exactly as required by this
 * task ("TASK-027.12 motoru yeniden yazılmadan entegrasyon sınırı doğrulanmış olmalı").
 */
export interface SourceValidationResult {
  issues: MigrationIssue[]
  isFatal: boolean
}

function emptyLegacyIdIssues(
  entityType: BotcSourceEntityType,
  records: readonly { legacyId: string }[],
): MigrationIssue[] {
  return records
    .filter(r => r.legacyId.trim().length === 0)
    .map(r => ({
      category: 'FATAL' as const,
      code: 'FATAL_EMPTY_LEGACY_ID',
      description: `${entityType} kaydının legacyId'si boş — kaynak veri bütünlüğü ihlali.`,
      sourceEntityType: entityType,
      sourceLegacyId: r.legacyId,
    }))
}

function duplicateLegacyIdIssues(
  entityType: BotcSourceEntityType,
  records: readonly { legacyId: string }[],
): MigrationIssue[] {
  const seen = new Map<string, number>()
  for (const r of records) seen.set(r.legacyId, (seen.get(r.legacyId) ?? 0) + 1)
  return [...seen.entries()]
    .filter(([legacyId, count]) => count > 1 && legacyId.trim().length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([legacyId, count]) => ({
      category: 'FATAL' as const,
      code: 'FATAL_DUPLICATE_LEGACY_ID',
      description: `${entityType} legacyId "${legacyId}" kaynakta ${count} kez tekrarlanıyor — her kaynak kaydı tek bir hedefe eşlenmelidir (design doc §6).`,
      sourceEntityType: entityType,
      sourceLegacyId: legacyId,
    }))
}

/**
 * Structural validation of the BOTC identity source snapshot and the approved tenant mapping
 * table — independent of, and run prior to, `MigrationRunService`.
 */
export function validateSourceSnapshot(
  source: BotcIdentitySourceSnapshot,
  approvedTenantAssignmentTable: readonly ApprovedTenantAssignmentEntry[],
): SourceValidationResult {
  const issues: MigrationIssue[] = []

  // Empty legacy id (any entity type).
  issues.push(...emptyLegacyIdIssues('USER', source.users))
  issues.push(...emptyLegacyIdIssues('ROLE', source.roles))
  issues.push(...emptyLegacyIdIssues('PERMISSION', source.permissions))
  issues.push(...emptyLegacyIdIssues('USER_PERMISSION', source.userPermissions))

  // Duplicate legacy id within the same entity type — the engine's staging store keys records by
  // (entityType, legacyId), so an undetected duplicate here would silently collide.
  issues.push(...duplicateLegacyIdIssues('USER', source.users))
  issues.push(...duplicateLegacyIdIssues('ROLE', source.roles))
  issues.push(...duplicateLegacyIdIssues('PERMISSION', source.permissions))
  issues.push(...duplicateLegacyIdIssues('USER_PERMISSION', source.userPermissions))

  // Missing required fields.
  for (const user of source.users) {
    if (user.username.trim().length === 0) {
      issues.push({
        category: 'FATAL',
        code: 'FATAL_MISSING_REQUIRED_FIELD',
        description: `User ${user.legacyId}: Username boş.`,
        sourceEntityType: 'USER',
        sourceLegacyId: user.legacyId,
      })
    }
  }
  for (const role of source.roles) {
    if (role.name.trim().length === 0) {
      issues.push({
        category: 'FATAL',
        code: 'FATAL_MISSING_REQUIRED_FIELD',
        description: `Role ${role.legacyId}: Name boş.`,
        sourceEntityType: 'ROLE',
        sourceLegacyId: role.legacyId,
      })
    }
  }
  for (const permission of source.permissions) {
    if (permission.permissionName.trim().length === 0) {
      issues.push({
        category: 'FATAL',
        code: 'FATAL_MISSING_REQUIRED_FIELD',
        description: `Permission ${permission.legacyId}: PermissionName boş.`,
        sourceEntityType: 'PERMISSION',
        sourceLegacyId: permission.legacyId,
      })
    }
  }

  // Orphan references (FK-like relationships that don't resolve within this snapshot).
  const roleLegacyIds = new Set(source.roles.map(r => r.legacyId))
  const userLegacyIds = new Set(source.users.map(u => u.legacyId))
  const permissionLegacyIds = new Set(source.permissions.map(p => p.legacyId))

  for (const user of source.users) {
    if (user.roleLegacyId && !roleLegacyIds.has(user.roleLegacyId)) {
      issues.push({
        category: 'RECOVERABLE',
        code: 'RECOVERABLE_ORPHAN_ROLE_REFERENCE',
        description: `User ${user.legacyId}, var olmayan Role ${user.roleLegacyId}'e referans veriyor.`,
        sourceEntityType: 'USER',
        sourceLegacyId: user.legacyId,
      })
    }
  }
  for (const grant of source.userPermissions) {
    if (!userLegacyIds.has(grant.userLegacyId)) {
      issues.push({
        category: 'RECOVERABLE',
        code: 'RECOVERABLE_ORPHAN_USER_REFERENCE',
        description: `UserPermission ${grant.legacyId}, var olmayan User ${grant.userLegacyId}'e referans veriyor.`,
        sourceEntityType: 'USER_PERMISSION',
        sourceLegacyId: grant.legacyId,
      })
    }
    if (!permissionLegacyIds.has(grant.permissionLegacyId)) {
      issues.push({
        category: 'RECOVERABLE',
        code: 'RECOVERABLE_ORPHAN_PERMISSION_REFERENCE',
        description: `UserPermission ${grant.legacyId}, var olmayan Permission ${grant.permissionLegacyId}'e referans veriyor.`,
        sourceEntityType: 'USER_PERMISSION',
        sourceLegacyId: grant.legacyId,
      })
    }
  }

  // Approved tenant mapping table — empty/invalid slug, orphan entries, exact duplicates, conflicts.
  for (const entry of approvedTenantAssignmentTable) {
    // `tenantSlug` is typed as `ApprovedTenantSlug | null`, but this validator exists precisely to
    // catch malformed data crossing an untyped adapter boundary (e.g. a CSV row parsed as `''`
    // instead of `null`) — cast to `string` only for this runtime guard, not to widen the type.
    if ((entry.tenantSlug as string) === '') {
      // Distinct from `null` (intentionally unresolved-for-now, valid) — an empty string is
      // malformed input, e.g. from an untyped CSV/adapter boundary.
      issues.push({
        category: 'FATAL',
        code: 'FATAL_EMPTY_TENANT_SLUG',
        description: `Onaylı tenant mapping tablosunda kullanıcı ${entry.userLegacyId} için tenant slug boş string ("") — \`null\` (henüz çözülmedi) ile karıştırılmamalı, bu geçersiz bir girdidir.`,
        sourceEntityType: 'USER',
        sourceLegacyId: entry.userLegacyId,
      })
    } else if (entry.tenantSlug !== null && !KNOWN_TENANT_SLUGS.includes(entry.tenantSlug)) {
      issues.push({
        category: 'FATAL',
        code: 'FATAL_INVALID_TENANT_SLUG',
        description: `Onaylı tenant mapping tablosunda kullanıcı ${entry.userLegacyId} için bilinmeyen tenant slug "${entry.tenantSlug}" (yalnızca MOSB/MOSEDAS/MOSBIO kabul edilir — Q-M06).`,
        sourceEntityType: 'USER',
        sourceLegacyId: entry.userLegacyId,
      })
    }
  }

  const userLegacyIdsForTenantCheck = new Set(source.users.map(u => u.legacyId))
  for (const entry of approvedTenantAssignmentTable) {
    if (!userLegacyIdsForTenantCheck.has(entry.userLegacyId)) {
      issues.push({
        category: 'RECOVERABLE',
        code: 'RECOVERABLE_ORPHAN_TENANT_MAPPING_ENTRY',
        description: `Onaylı tenant mapping tablosunda, bu kaynak snapshot'ında bulunmayan kullanıcı ${entry.userLegacyId} için bir kayıt var.`,
        sourceEntityType: 'USER',
        sourceLegacyId: entry.userLegacyId,
      })
    }
  }

  const exactDuplicateRowCounts = new Map<string, number>()
  for (const entry of approvedTenantAssignmentTable) {
    const key = `${entry.userLegacyId}::${entry.tenantSlug ?? 'null'}`
    exactDuplicateRowCounts.set(key, (exactDuplicateRowCounts.get(key) ?? 0) + 1)
  }
  for (const [key, count] of [...exactDuplicateRowCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (count <= 1) continue
    const userLegacyId = key.split('::')[0] as string
    issues.push({
      category: 'WARNING',
      code: 'WARNING_DUPLICATE_TENANT_MAPPING_ROW',
      description: `Kullanıcı ${userLegacyId} için onaylı mapping tablosunda tam aynı satır ${count} kez tekrarlanıyor — zararsız (idempotent no-op) ama veri hijyeni açısından not edildi.`,
      sourceEntityType: 'USER',
      sourceLegacyId: userLegacyId,
    })
  }

  const { issues: conflictIssues } = detectConflictingTenantAssignments(approvedTenantAssignmentTable)
  issues.push(...conflictIssues)

  return { issues, isFatal: issues.some(i => i.category === 'FATAL') }
}
