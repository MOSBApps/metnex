import { randomUUID } from 'crypto'
import { scanForCredentialFields } from '../password-boundary'
import { computePermissionMappingCoverage } from '../permission-coverage'
import { scanForSessionOrTokenFields } from '../session-boundary'
import { validateSourceSnapshot } from '../source-validation'
import { MigrationRunService } from '../migration-run.service'
import { SimulatedTargetState } from '../simulated-target'
import { InMemoryStagingStore } from '../staging-store'
import { computeTenantMappingCoverage, KNOWN_PENDING_LOCATION_CATEGORIES } from '../tenant-coverage'
import type { ApprovedTenantAssignmentEntry, BotcIdentitySourceSnapshot, MigrationIssue, PasswordStrategy } from '../types'

/**
 * TASK-027.18 — a safe, deterministic, in-memory dry-run CLI for the identity migration engine
 * (TASK-027.12–027.17). This module is pure/testable — `runIdentityMigrationDryRun()` never
 * touches process.argv/stdin/stdout/exit, never opens a real DB connection, and only ever runs
 * `MigrationRunService` in `DRY_RUN` mode. There is structurally no `--apply` flag anywhere in
 * this CLI — `mode: 'APPLY'` is never passed to the engine, making a real PostgreSQL apply
 * impossible through this entry point.
 */

export interface DryRunCliInput {
  source: BotcIdentitySourceSnapshot
  approvedTenantAssignmentTable: ApprovedTenantAssignmentEntry[]
  adminAssignedPasswordLegacyIds?: string[]
  simulateFailureLegacyIds?: string[]
}

export interface DryRunCliReport {
  migrationRunId: string
  generatedAt: string
  sourceRecordCounts: { users: number; roles: number; permissions: number; userPermissions: number; total: number }
  userResults: { toCreate: number; toUpdate: number; toSkip: number }
  roleTemplateResults: { toCreate: number }
  permissionResults: { mapped: number; unmapped: number }
  tenantResults: { assigned: number; unresolved: number; conflicts: number; orphanMappingRecords: number }
  passwordStrategySummary: Record<PasswordStrategy, number>
  credentialSessionBoundary: { violations: number; passed: boolean }
  issues: { fatal: MigrationIssue[]; recoverable: MigrationIssue[]; warning: MigrationIssue[] }
  pendingLocationCategories: readonly string[]
  applyPerformed: false
  applyNote: string
}

export type DryRunCliExitCode = 0 | 1 | 2

export interface DryRunCliResult {
  exitCode: DryRunCliExitCode
  report?: DryRunCliReport
  /** Usage/preflight-level errors (exit code 2), never a real credential/secret value. */
  errors?: string[]
}

const APPLY_NOTE =
  'Bu çalıştırma yalnızca dry-run modundadır — hiçbir PostgreSQL/SQL Server bağlantısı kurulmadı, ' +
  'hiçbir gerçek apply yapılmadı, hiçbir kalıcı migration state yazılmadı (yalnızca bu rapor çıktısı ' +
  'dosya sistemine yazılabilir).'

function groupIssues(issues: readonly MigrationIssue[]): DryRunCliReport['issues'] {
  return {
    fatal: issues.filter(i => i.category === 'FATAL'),
    recoverable: issues.filter(i => i.category === 'RECOVERABLE'),
    warning: issues.filter(i => i.category === 'WARNING'),
  }
}

/**
 * The pure dry-run core. `stagingStore`/`targetState` are optional and exist only so tests can
 * exercise cross-invocation idempotency/retry in-process (see dry-run-cli.spec.ts) — the real CLI
 * entry point below always creates fresh ones, since this tool intentionally carries no state
 * between separate process invocations.
 */
export function runIdentityMigrationDryRun(params: {
  input: DryRunCliInput
  migrationRunId?: string
  now?: () => Date
  stagingStore?: InMemoryStagingStore
  targetState?: SimulatedTargetState
}): DryRunCliResult {
  const { input } = params
  const now = params.now ?? (() => new Date())
  const migrationRunId = params.migrationRunId ?? randomUUID()

  // Input hygiene gate: the raw fixture itself must never carry a credential/session-shaped field,
  // even before the engine runs (item 9 applied at the earliest possible point).
  const inputCredentialViolations = scanForCredentialFields(input)
  const inputSessionViolations = scanForSessionOrTokenFields(input)
  if (inputCredentialViolations.length > 0 || inputSessionViolations.length > 0) {
    return {
      exitCode: 1,
      errors: [
        `Girdi fixture'ı credential/session-benzeri alan içeriyor, işlenmedi: ${[...inputCredentialViolations, ...inputSessionViolations].map(v => v.path).join(', ')}`,
      ],
    }
  }

  // Stage: source snapshot + tenant mapping validation (Preflight, TASK-027.13/15).
  const preflight = validateSourceSnapshot(input.source, input.approvedTenantAssignmentTable)

  // Stage: permission coverage + tenant coverage (read-only, computed regardless of fatal status
  // so the report can explain *why* the run was blocked, per kabul kriteri "conflict/unmapped
  // davranışı raporlanmalı" — even a fatal preflight result still gets a full coverage report).
  const permissionCoverage = computePermissionMappingCoverage(input.source.permissions)
  const tenantCoverage = computeTenantMappingCoverage(input.source.users, input.approvedTenantAssignmentTable)

  if (preflight.isFatal) {
    // Kapsam madde 4: fatal validation durumunda migration engine ÇALIŞTIRILMAZ.
    const report: DryRunCliReport = {
      migrationRunId,
      generatedAt: now().toISOString(),
      sourceRecordCounts: {
        users: input.source.users.length,
        roles: input.source.roles.length,
        permissions: input.source.permissions.length,
        userPermissions: input.source.userPermissions.length,
        total: input.source.users.length + input.source.roles.length + input.source.permissions.length + input.source.userPermissions.length,
      },
      userResults: { toCreate: 0, toUpdate: 0, toSkip: 0 },
      roleTemplateResults: { toCreate: 0 },
      permissionResults: { mapped: permissionCoverage.approvedMappings.length, unmapped: permissionCoverage.unmappedBotcPermissions.length },
      tenantResults: {
        assigned: 0,
        unresolved: input.source.users.length,
        conflicts: tenantCoverage.conflictRecords,
        orphanMappingRecords: tenantCoverage.orphanMappingRecords,
      },
      passwordStrategySummary: { RESET_REQUIRED: 0, ADMIN_ASSIGNED: 0 },
      credentialSessionBoundary: { violations: 0, passed: true },
      issues: groupIssues(preflight.issues),
      pendingLocationCategories: KNOWN_PENDING_LOCATION_CATEGORIES,
      applyPerformed: false,
      applyNote: APPLY_NOTE,
    }
    return { exitCode: 1, report }
  }

  // Stage: migration engine dry-run (DRY_RUN only — this CLI has no APPLY code path at all).
  const service = new MigrationRunService()
  const stagingStore = params.stagingStore ?? new InMemoryStagingStore()
  const targetState = params.targetState ?? new SimulatedTargetState()
  const adminAssignedPasswordLegacyIds = new Set(input.adminAssignedPasswordLegacyIds ?? [])
  const simulateFailureLegacyIds = new Set(input.simulateFailureLegacyIds ?? [])

  const { report: engineReport } = service.run({
    source: input.source,
    approvedTenantAssignmentTable: input.approvedTenantAssignmentTable,
    adminAssignedPasswordLegacyIds,
    simulateFailureLegacyIds,
    stagingStore,
    targetState,
    mode: 'DRY_RUN',
    migrationRunId,
    now,
  })

  // Stage: credential/session redaction, applied defensively to the actual engine output too
  // (item 9) — this should always be empty by construction, this is proof, not an assumption.
  const outputCredentialViolations = scanForCredentialFields(engineReport)
  const outputSessionViolations = scanForSessionOrTokenFields(engineReport)
  const boundaryViolationCount = outputCredentialViolations.length + outputSessionViolations.length

  const allIssues = [...engineReport.errorsAndWarnings, ...preflight.issues]
  const report: DryRunCliReport = {
    migrationRunId: engineReport.migrationRunId,
    generatedAt: engineReport.generatedAt,
    sourceRecordCounts: {
      users: input.source.users.length,
      roles: input.source.roles.length,
      permissions: input.source.permissions.length,
      userPermissions: input.source.userPermissions.length,
      total: engineReport.totalSourceRecords,
    },
    userResults: { toCreate: engineReport.usersToCreate, toUpdate: engineReport.usersToUpdate, toSkip: engineReport.usersToSkip },
    roleTemplateResults: { toCreate: engineReport.roleAndPermissionChanges.tenantRoleTemplatesToCreate },
    permissionResults: {
      mapped: engineReport.roleAndPermissionChanges.permissionCodesMapped,
      unmapped: engineReport.roleAndPermissionChanges.permissionCodesUnmapped,
    },
    tenantResults: {
      assigned: engineReport.tenantMembershipResults.assigned,
      unresolved: engineReport.tenantMembershipResults.unresolved,
      conflicts: tenantCoverage.conflictRecords,
      orphanMappingRecords: tenantCoverage.orphanMappingRecords,
    },
    passwordStrategySummary: engineReport.passwordStrategySummary,
    credentialSessionBoundary: { violations: boundaryViolationCount, passed: boundaryViolationCount === 0 },
    issues: groupIssues(allIssues),
    pendingLocationCategories: KNOWN_PENDING_LOCATION_CATEGORIES,
    applyPerformed: false,
    applyNote: APPLY_NOTE,
  }

  const exitCode: DryRunCliExitCode = boundaryViolationCount > 0 || report.issues.fatal.length > 0 ? 1 : 0
  return { exitCode, report }
}
