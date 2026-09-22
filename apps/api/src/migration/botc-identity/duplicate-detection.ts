import type {
  ApprovedTenantAssignmentEntry,
  BotcSourceRole,
  BotcSourceUser,
  MigrationIssue,
} from './types'

/**
 * Deterministic duplicate/conflict detection (task requirement #10). "Deterministic" here means:
 * given the same input array twice, the same records are always flagged and the same one is
 * always treated as the resolved/authoritative record — the one with the lexicographically
 * smallest `legacyId` wins, later duplicates are reported as recoverable issues and excluded from
 * the winner's normal flow by the caller.
 */
export function detectDuplicateUsers(users: readonly BotcSourceUser[]): {
  winners: Map<string, BotcSourceUser>
  issues: MigrationIssue[]
} {
  const byEmail = new Map<string, BotcSourceUser[]>()
  const byUsername = new Map<string, BotcSourceUser[]>()
  for (const user of users) {
    const emailKey = user.email?.trim().toLowerCase()
    if (emailKey) byEmail.set(emailKey, [...(byEmail.get(emailKey) ?? []), user])
    const usernameKey = user.username.trim().toLowerCase()
    byUsername.set(usernameKey, [...(byUsername.get(usernameKey) ?? []), user])
  }

  const losers = new Set<string>()
  const issues: MigrationIssue[] = []

  for (const group of [...byEmail.values(), ...byUsername.values()]) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.legacyId.localeCompare(b.legacyId))
    const winner = sorted[0]
    if (!winner) continue
    const rest = sorted.slice(1)
    for (const duplicate of rest) {
      if (losers.has(duplicate.legacyId)) continue
      losers.add(duplicate.legacyId)
      issues.push({
        category: 'RECOVERABLE',
        code: 'RECOVERABLE_DUPLICATE_USER',
        description: `Kullanıcı ${duplicate.legacyId}, ${winner.legacyId} ile aynı email/username değerini paylaşıyor — daha küçük legacyId (${winner.legacyId}) esas alındı, bu kayıt atlandı.`,
        sourceEntityType: 'USER',
        sourceLegacyId: duplicate.legacyId,
      })
    }
  }

  const winners = new Map<string, BotcSourceUser>()
  for (const user of users) {
    if (!losers.has(user.legacyId)) winners.set(user.legacyId, user)
  }
  return { winners, issues }
}

export function detectDuplicateRoleNames(roles: readonly BotcSourceRole[]): MigrationIssue[] {
  const byName = new Map<string, BotcSourceRole[]>()
  for (const role of roles) {
    const key = role.name.trim().toLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), role])
  }
  const issues: MigrationIssue[] = []
  for (const group of byName.values()) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.legacyId.localeCompare(b.legacyId))
    const winner = sorted[0]
    if (!winner) continue
    const rest = sorted.slice(1)
    for (const duplicate of rest) {
      issues.push({
        category: 'WARNING',
        code: 'WARNING_DUPLICATE_ROLE_NAME',
        description: `Rol ${duplicate.legacyId} ("${duplicate.name}"), ${winner.legacyId} ile aynı ismi paylaşıyor.`,
        sourceEntityType: 'ROLE',
        sourceLegacyId: duplicate.legacyId,
      })
    }
  }
  return issues
}

/**
 * A user appearing more than once in the approved tenant assignment table (Q-M06) with
 * conflicting non-null tenant slugs is a fatal data-quality issue in the approved table itself.
 *
 * TASK-027.15-R1 security correction: a conflicted user's entry is now **removed** from
 * `resolved` entirely (not "first entry wins") — any downstream consumer
 * (`MigrationRunService`, `computeTenantMappingCoverage`) builds its tenant assignment index from
 * `resolved`, so a user absent from it resolves to `UNRESOLVED` via the normal "not in the
 * approved table" path, exactly like a user with no mapping entry at all. Deterministic *first
 * entry* selection previously used here was only ever meant for diagnostic/reporting purposes
 * (which value to mention first in the fatal issue text) — it must never double as the value
 * written to `tenantMemberships`. `FATAL_CONFLICTING_TENANT_ASSIGNMENT` is still reported for
 * every conflict, unchanged.
 */
export function detectConflictingTenantAssignments(table: readonly ApprovedTenantAssignmentEntry[]): {
  resolved: Map<string, ApprovedTenantAssignmentEntry>
  issues: MigrationIssue[]
} {
  const resolved = new Map<string, ApprovedTenantAssignmentEntry>()
  const conflictedUserLegacyIds = new Set<string>()
  const issues: MigrationIssue[] = []
  for (const entry of table) {
    if (conflictedUserLegacyIds.has(entry.userLegacyId)) continue // already flagged — no further access value can be resolved for this user

    const existing = resolved.get(entry.userLegacyId)
    if (!existing) {
      resolved.set(entry.userLegacyId, entry)
      continue
    }
    if (existing.tenantSlug !== entry.tenantSlug) {
      issues.push({
        category: 'FATAL',
        code: 'FATAL_CONFLICTING_TENANT_ASSIGNMENT',
        description: `Kullanıcı ${entry.userLegacyId} için onaylı mapping tablosunda çelişen tenant ataması var (${existing.tenantSlug ?? 'null'} vs ${entry.tenantSlug ?? 'null'}) — bu kullanıcı için hiçbir tenant ataması/erişimi üretilmeyecek, çözülene kadar UNRESOLVED kalır.`,
        sourceEntityType: 'USER',
        sourceLegacyId: entry.userLegacyId,
      })
      resolved.delete(entry.userLegacyId)
      conflictedUserLegacyIds.add(entry.userLegacyId)
    }
  }
  return { resolved, issues }
}
