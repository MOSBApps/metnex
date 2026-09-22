import { readFileSync, writeFileSync } from 'fs'
import { runIdentityMigrationDryRun } from './dry-run-cli'
import type { DryRunCliInput } from './dry-run-cli'
import { MigrationRunService } from '../migration-run.service'
import { buildReconciliationSnapshot, reconcileMigrationRuns } from '../reconciliation'
import type { ReconciliationInputSnapshot } from '../reconciliation'
import { SimulatedTargetState } from '../simulated-target'
import { InMemoryStagingStore } from '../staging-store'

/**
 * TASK-027.19 — reconciliation CLI entry point. Additive: does not modify `dry-run-cli.ts` or
 * `dry-run-cli-entry.ts` (TASK-027.18) at all. Runs two independent, in-memory `DRY_RUN`s (one per
 * `--before`/`--after` fixture) and reconciles their outcomes. There is no `--apply` here either —
 * exactly the same structural guarantee as the dry-run CLI (mode is always `DRY_RUN`).
 *
 * Usage:
 *   node dist/migration/botc-identity/cli/reconcile-cli-entry.js --before <fixture.json> --after <fixture.json> [--output <report.json>]
 */

interface ParsedArgs {
  beforePath: string
  afterPath: string
  outputPath?: string
}

function parseArgs(argv: readonly string[]): ParsedArgs | { usageError: string } {
  let beforePath: string | undefined
  let afterPath: string | undefined
  let outputPath: string | undefined

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--before') beforePath = argv[++i]
    else if (arg === '--after') afterPath = argv[++i]
    else if (arg === '--output') outputPath = argv[++i]
    else return { usageError: `Bilinmeyen argüman: ${arg}` }
  }

  if (!beforePath || !afterPath) {
    return {
      usageError:
        'Kullanım: node dist/migration/botc-identity/cli/reconcile-cli-entry.js --before <fixture.json> --after <fixture.json> [--output <report.json>]\n' +
        '--before ve --after zorunludur. Bu CLI yalnızca dry-run karşılaştırması yapar; --apply seçeneği yoktur.',
    }
  }
  return { beforePath, afterPath, outputPath }
}

function loadInput(path: string, label: string): DryRunCliInput | { usageError: string } {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    return { usageError: `${label} dosyası okunamadı: ${path} (${error instanceof Error ? error.message : String(error)})` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { usageError: `${label} dosyası geçerli JSON değil: ${path} (${error instanceof Error ? error.message : String(error)})` }
  }
  if (typeof parsed !== 'object' || parsed === null || !('source' in parsed) || !('approvedTenantAssignmentTable' in parsed)) {
    return { usageError: `${label} dosyası "source" ve "approvedTenantAssignmentTable" alanlarını içermelidir: ${path}` }
  }
  return parsed as DryRunCliInput
}

/**
 * Captures a reconciliation snapshot for one fixture. First runs the standard, unmodified
 * TASK-027.18 `DRY_RUN` path (reusing its preflight validation and aggregate report as-is — no
 * duplicated logic). If that reports a FATAL issue, the run is blocked and no per-user snapshot is
 * attempted (matches `reconcileMigrationRuns`'s own "blocked -> no diff" rule). Otherwise, since
 * `DRY_RUN` mode never writes to its stores by design (TASK-027.12), this function separately
 * materializes per-user staging records into a **throwaway, function-local** store pair — by
 * calling the same engine in its ordinary in-memory "APPLY" mode, exactly like every other test in
 * this module does. Both stores are discarded the instant this function returns; nothing is ever
 * persisted to a real database, a physical staging table, or the file system.
 */
function captureSnapshot(input: DryRunCliInput, migrationRunId: string): ReconciliationInputSnapshot {
  const dryRun = runIdentityMigrationDryRun({ input, migrationRunId })
  if (dryRun.exitCode !== 0 || !dryRun.report) {
    return {
      migrationRunId,
      users: [],
      roleTemplateCount: 0,
      permissionMappedCount: 0,
      permissionUnmappedCount: 0,
      issues: [...(dryRun.report?.issues.fatal ?? [])],
    }
  }

  const stagingStore = new InMemoryStagingStore()
  const targetState = new SimulatedTargetState()
  const service = new MigrationRunService()
  const { report } = service.run({
    source: input.source,
    approvedTenantAssignmentTable: input.approvedTenantAssignmentTable,
    adminAssignedPasswordLegacyIds: new Set(input.adminAssignedPasswordLegacyIds ?? []),
    simulateFailureLegacyIds: new Set(input.simulateFailureLegacyIds ?? []),
    stagingStore,
    targetState,
    mode: 'APPLY', // in-memory materialization only — see doc comment above; never a real DB apply
    migrationRunId,
  })

  return buildReconciliationSnapshot({
    migrationRunId,
    stagingStore,
    targetState,
    issues: report.errorsAndWarnings,
    roleTemplateCount: report.roleAndPermissionChanges.tenantRoleTemplatesToCreate,
    permissionMappedCount: report.roleAndPermissionChanges.permissionCodesMapped,
    permissionUnmappedCount: report.roleAndPermissionChanges.permissionCodesUnmapped,
  })
}

export function main(argv: readonly string[]): number {
  const args = parseArgs(argv)
  if ('usageError' in args) {
    process.stderr.write(`${args.usageError}\n`)
    return 2
  }

  const beforeInput = loadInput(args.beforePath, '--before')
  if ('usageError' in beforeInput) {
    process.stderr.write(`${beforeInput.usageError}\n`)
    return 2
  }
  const afterInput = loadInput(args.afterPath, '--after')
  if ('usageError' in afterInput) {
    process.stderr.write(`${afterInput.usageError}\n`)
    return 2
  }

  const before = captureSnapshot(beforeInput, 'before')
  const after = captureSnapshot(afterInput, 'after')
  const reportResult = reconcileMigrationRuns(before, after)

  const output = JSON.stringify(reportResult, null, 2)
  if (args.outputPath) writeFileSync(args.outputPath, output)
  else process.stdout.write(`${output}\n`)

  const exitCode = reportResult.reconciliationStatus === 'BLOCKED' || reportResult.reconciliationStatus === 'INVALID_INPUT' ? 1 : 0
  return exitCode
}

/* istanbul ignore next -- exercised only when run as a real process, not under Jest */
if (require.main === module) {
  process.exitCode = main(process.argv.slice(2))
}
