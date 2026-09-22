import { scanForCredentialFields } from './password-boundary'
import { scanForSessionOrTokenFields } from './session-boundary'
import { InMemoryStagingStore } from './staging-store'
import { SimulatedTargetState } from './simulated-target'
import type { MappingStatus, MigrationIssue, PasswordStrategy, TenantMembershipStatus } from './types'

/**
 * TASK-027.19 — identity migration execution reconciliation (design doc's Verification/
 * Reconciliation phases, §1 stages 6-7, made concrete for identity). Entirely read-only/pure:
 * compares two already-produced dry-run snapshots, never runs `MigrationRunService`, never opens a
 * real DB connection, never writes a physical `migration_staging_identity` table (Q-ID01
 * untouched).
 */

export type ReconciliationStatus = 'MATCHED' | 'CHANGED' | 'BLOCKED' | 'UNRESOLVED' | 'INVALID_INPUT'

export interface ReconciliationUserRecord {
  sourceLegacyId: string
  mappingStatus: MappingStatus
  targetId: string | null
  sourceChecksum: string
  tenantMembershipStatus: TenantMembershipStatus | undefined
  passwordStrategies: PasswordStrategy[] | undefined
}

/**
 * A comparable snapshot of one dry-run's outcome. Built by `buildReconciliationSnapshot()` from a
 * live `InMemoryStagingStore`/`SimulatedTargetState` pair right after a `DRY_RUN`, or constructed
 * directly in tests/fixtures.
 */
export interface ReconciliationInputSnapshot {
  migrationRunId: string
  users: ReconciliationUserRecord[]
  roleTemplateCount: number
  permissionMappedCount: number
  permissionUnmappedCount: number
  issues: MigrationIssue[]
}

export interface ReconciliationUserDiffEntry {
  sourceLegacyId: string
  before: ReconciliationUserRecord | null
  after: ReconciliationUserRecord | null
}

export interface ReconciliationPasswordDiffEntry {
  sourceLegacyId: string
  before: PasswordStrategy[]
  after: PasswordStrategy[]
  adminAssignedLost: boolean
}

export interface ReconciliationChecksumDiffEntry {
  sourceLegacyId: string
  before: string | null
  after: string | null
}

export interface ReconciliationReport {
  migrationRunId: string
  comparedRunId: string
  generatedAt: string
  sourceChecksumDiffs: ReconciliationChecksumDiffEntry[]
  added: ReconciliationUserDiffEntry[]
  removed: ReconciliationUserDiffEntry[]
  changed: ReconciliationUserDiffEntry[]
  unchanged: ReconciliationUserDiffEntry[]
  unresolved: ReconciliationUserDiffEntry[]
  conflicts: MigrationIssue[]
  passwordStrategyDiffs: ReconciliationPasswordDiffEntry[]
  roleTemplateCountDiff: number
  permissionMappedDiff: number
  permissionUnmappedDiff: number
  blockingIssues: MigrationIssue[]
  warnings: MigrationIssue[]
  reconciliationStatus: ReconciliationStatus
}

/** Builds a comparable snapshot from a completed (in-memory) dry-run's stores + issue list. */
export function buildReconciliationSnapshot(params: {
  migrationRunId: string
  stagingStore: InMemoryStagingStore
  targetState: SimulatedTargetState
  issues: readonly MigrationIssue[]
  roleTemplateCount: number
  permissionMappedCount: number
  permissionUnmappedCount: number
}): ReconciliationInputSnapshot {
  const users: ReconciliationUserRecord[] = params.stagingStore
    .all()
    .filter(r => r.sourceEntityType === 'USER')
    .map(r => ({
      sourceLegacyId: r.sourceLegacyId,
      mappingStatus: r.mappingStatus,
      targetId: r.targetId,
      sourceChecksum: r.sourceChecksum,
      tenantMembershipStatus: r.tenantMembershipStatus,
      passwordStrategies: params.targetState.usersByLegacyId.get(r.sourceLegacyId)?.passwordStrategies,
    }))
    .sort((a, b) => a.sourceLegacyId.localeCompare(b.sourceLegacyId))

  return {
    migrationRunId: params.migrationRunId,
    users,
    roleTemplateCount: params.roleTemplateCount,
    permissionMappedCount: params.permissionMappedCount,
    permissionUnmappedCount: params.permissionUnmappedCount,
    issues: [...params.issues],
  }
}

function isValidSnapshot(value: unknown): value is ReconciliationInputSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.migrationRunId === 'string' &&
    v.migrationRunId.length > 0 &&
    Array.isArray(v.users) &&
    Array.isArray(v.issues) &&
    typeof v.roleTemplateCount === 'number' &&
    typeof v.permissionMappedCount === 'number' &&
    typeof v.permissionUnmappedCount === 'number'
  )
}

function samePasswordStrategies(a: PasswordStrategy[] | undefined, b: PasswordStrategy[] | undefined): boolean {
  const sortedA = [...(a ?? [])].sort()
  const sortedB = [...(b ?? [])].sort()
  return sortedA.length === sortedB.length && sortedA.every((v, i) => v === sortedB[i])
}

function sameUserRecord(a: ReconciliationUserRecord, b: ReconciliationUserRecord): boolean {
  return (
    a.mappingStatus === b.mappingStatus &&
    // `targetId` is a freshly generated UUID for every independent run that has no shared staging
    // store to preserve it across — comparing its exact value would make any two independent
    // (first-time) dry-runs of identical source data spuriously "differ" (the same UUID-vs-report
    // pitfall already fixed for the CLI in TASK-027.18). Only presence/absence is meaningful here.
    (a.targetId !== null) === (b.targetId !== null) &&
    a.sourceChecksum === b.sourceChecksum &&
    a.tenantMembershipStatus === b.tenantMembershipStatus &&
    samePasswordStrategies(a.passwordStrategies, b.passwordStrategies)
  )
}

function dedupeIssues(issues: readonly MigrationIssue[]): MigrationIssue[] {
  const seen = new Set<string>()
  const result: MigrationIssue[] = []
  for (const issue of issues) {
    const key = `${issue.code}::${issue.sourceEntityType}::${issue.sourceLegacyId}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(issue)
  }
  return result.sort((a, b) => (a.sourceLegacyId + a.code).localeCompare(b.sourceLegacyId + b.code))
}

/**
 * Compares two dry-run snapshots and classifies the result deterministically. Input order never
 * affects the outcome — all record lists are sorted by `sourceLegacyId` (or `code` for issues).
 */
export function reconcileMigrationRuns(before: unknown, after: unknown, params?: { now?: () => Date }): ReconciliationReport {
  const now = params?.now ?? (() => new Date())
  const generatedAt = now().toISOString()

  if (!isValidSnapshot(before) || !isValidSnapshot(after)) {
    return {
      migrationRunId: isValidSnapshot(before) ? before.migrationRunId : 'INVALID',
      comparedRunId: isValidSnapshot(after) ? after.migrationRunId : 'INVALID',
      generatedAt,
      sourceChecksumDiffs: [],
      added: [],
      removed: [],
      changed: [],
      unchanged: [],
      unresolved: [],
      conflicts: [],
      passwordStrategyDiffs: [],
      roleTemplateCountDiff: 0,
      permissionMappedDiff: 0,
      permissionUnmappedDiff: 0,
      blockingIssues: [],
      warnings: [],
      reconciliationStatus: 'INVALID_INPUT',
    }
  }

  // Session/credential boundary: neither snapshot may ever carry such a field (kapsam madde 8) —
  // this check runs on the raw, already-validated snapshots, before any diffing.
  const boundaryViolations = [...scanForCredentialFields(before), ...scanForCredentialFields(after), ...scanForSessionOrTokenFields(before), ...scanForSessionOrTokenFields(after)]
  if (boundaryViolations.length > 0) {
    const violationIssue: MigrationIssue = {
      category: 'FATAL',
      code: 'FATAL_RECONCILIATION_CREDENTIAL_OR_SESSION_FIELD',
      description: `Reconciliation girdisinde credential/session-benzeri alan bulundu: ${boundaryViolations.map(v => v.path).join(', ')} — karşılaştırma yapılmadı.`,
      sourceEntityType: 'USER',
      sourceLegacyId: '',
    }
    return {
      migrationRunId: before.migrationRunId,
      comparedRunId: after.migrationRunId,
      generatedAt,
      sourceChecksumDiffs: [],
      added: [],
      removed: [],
      changed: [],
      unchanged: [],
      unresolved: [],
      conflicts: [],
      passwordStrategyDiffs: [],
      roleTemplateCountDiff: 0,
      permissionMappedDiff: 0,
      permissionUnmappedDiff: 0,
      blockingIssues: [violationIssue],
      warnings: [],
      reconciliationStatus: 'BLOCKED',
    }
  }

  const combinedIssues = dedupeIssues([...before.issues, ...after.issues])
  const blockingIssues = combinedIssues.filter(i => i.category === 'FATAL')
  const warnings = combinedIssues.filter(i => i.category === 'WARNING')
  const conflicts = combinedIssues.filter(i => i.code === 'FATAL_CONFLICTING_TENANT_ASSIGNMENT')

  const roleTemplateCountDiff = after.roleTemplateCount - before.roleTemplateCount
  const permissionMappedDiff = after.permissionMappedCount - before.permissionMappedCount
  const permissionUnmappedDiff = after.permissionUnmappedCount - before.permissionUnmappedCount

  // Kapsam madde 6: a blocked run (any FATAL, including conflict) never gets a meaningful
  // per-user diff — attempting one could misreport "all users removed" when the run simply never
  // executed. No membership/access diff is produced for anyone in this state.
  if (blockingIssues.length > 0) {
    return {
      migrationRunId: before.migrationRunId,
      comparedRunId: after.migrationRunId,
      generatedAt,
      sourceChecksumDiffs: [],
      added: [],
      removed: [],
      changed: [],
      unchanged: [],
      unresolved: [],
      conflicts,
      passwordStrategyDiffs: [],
      roleTemplateCountDiff,
      permissionMappedDiff,
      permissionUnmappedDiff,
      blockingIssues,
      warnings,
      reconciliationStatus: 'BLOCKED',
    }
  }

  const beforeByLegacyId = new Map(before.users.map(u => [u.sourceLegacyId, u]))
  const afterByLegacyId = new Map(after.users.map(u => [u.sourceLegacyId, u]))
  const allLegacyIds = [...new Set([...beforeByLegacyId.keys(), ...afterByLegacyId.keys()])].sort((a, b) => a.localeCompare(b))

  const added: ReconciliationUserDiffEntry[] = []
  const removed: ReconciliationUserDiffEntry[] = []
  const changed: ReconciliationUserDiffEntry[] = []
  const unchanged: ReconciliationUserDiffEntry[] = []
  const unresolved: ReconciliationUserDiffEntry[] = []
  const sourceChecksumDiffs: ReconciliationChecksumDiffEntry[] = []
  const passwordStrategyDiffs: ReconciliationPasswordDiffEntry[] = []

  for (const sourceLegacyId of allLegacyIds) {
    const beforeUser = beforeByLegacyId.get(sourceLegacyId) ?? null
    const afterUser = afterByLegacyId.get(sourceLegacyId) ?? null
    const entry: ReconciliationUserDiffEntry = { sourceLegacyId, before: beforeUser, after: afterUser }

    if (!beforeUser && afterUser) added.push(entry)
    else if (beforeUser && !afterUser) removed.push(entry)
    else if (beforeUser && afterUser) {
      if (sameUserRecord(beforeUser, afterUser)) unchanged.push(entry)
      else changed.push(entry)

      if (beforeUser.sourceChecksum !== afterUser.sourceChecksum) {
        sourceChecksumDiffs.push({ sourceLegacyId, before: beforeUser.sourceChecksum, after: afterUser.sourceChecksum })
      }
      if (!samePasswordStrategies(beforeUser.passwordStrategies, afterUser.passwordStrategies)) {
        const adminAssignedLost = (beforeUser.passwordStrategies ?? []).includes('ADMIN_ASSIGNED') && !(afterUser.passwordStrategies ?? []).includes('ADMIN_ASSIGNED')
        passwordStrategyDiffs.push({
          sourceLegacyId,
          before: beforeUser.passwordStrategies ?? [],
          after: afterUser.passwordStrategies ?? [],
          adminAssignedLost,
        })
      }
    }

    if (afterUser?.tenantMembershipStatus === 'UNRESOLVED') unresolved.push(entry)
  }

  const hasAnyChange =
    added.length > 0 ||
    removed.length > 0 ||
    changed.length > 0 ||
    passwordStrategyDiffs.length > 0 ||
    roleTemplateCountDiff !== 0 ||
    permissionMappedDiff !== 0 ||
    permissionUnmappedDiff !== 0

  const reconciliationStatus: ReconciliationStatus = unresolved.length > 0 ? 'UNRESOLVED' : hasAnyChange ? 'CHANGED' : 'MATCHED'

  return {
    migrationRunId: before.migrationRunId,
    comparedRunId: after.migrationRunId,
    generatedAt,
    sourceChecksumDiffs,
    added,
    removed,
    changed,
    unchanged,
    unresolved,
    conflicts,
    passwordStrategyDiffs,
    roleTemplateCountDiff,
    permissionMappedDiff,
    permissionUnmappedDiff,
    blockingIssues,
    warnings,
    reconciliationStatus,
  }
}
