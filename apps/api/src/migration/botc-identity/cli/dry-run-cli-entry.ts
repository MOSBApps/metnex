import { readFileSync, writeFileSync } from 'fs'
import { runIdentityMigrationDryRun } from './dry-run-cli'
import type { DryRunCliInput } from './dry-run-cli'

/**
 * Real executable entry point. Kept as thin as possible — all actual logic lives in the pure,
 * testable `runIdentityMigrationDryRun()` (dry-run-cli.ts). This file's only job is argv parsing,
 * file I/O, and process exit code — it is compiled by the existing `nest build` pipeline (like the
 * rest of `apps/api/src`) and run the same way `dist/main` already is (`node dist/...`), so no new
 * build tool or runtime dependency (ts-node/tsx) is introduced.
 *
 * Usage:
 *   node dist/migration/botc-identity/cli/dry-run-cli-entry.js --input <fixture.json> [--run-id <id>] [--output <report.json>]
 */

interface ParsedArgs {
  inputPath: string
  runId?: string
  outputPath?: string
}

function parseArgs(argv: readonly string[]): ParsedArgs | { usageError: string } {
  let inputPath: string | undefined
  let runId: string | undefined
  let outputPath: string | undefined

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--input') inputPath = argv[++i]
    else if (arg === '--run-id') runId = argv[++i]
    else if (arg === '--output') outputPath = argv[++i]
    else return { usageError: `Bilinmeyen argüman: ${arg}` }
  }

  if (!inputPath) {
    return {
      usageError:
        'Kullanım: node dist/migration/botc-identity/cli/dry-run-cli-entry.js --input <fixture.json> [--run-id <id>] [--output <report.json>]\n' +
        '--input zorunludur (sentetik/in-memory JSON fixture yolu). Bu CLI yalnızca dry-run çalıştırır; --apply seçeneği yoktur.',
    }
  }
  return { inputPath, runId, outputPath }
}

function loadInput(inputPath: string): DryRunCliInput | { usageError: string } {
  let raw: string
  try {
    raw = readFileSync(inputPath, 'utf8')
  } catch (error) {
    return { usageError: `Girdi dosyası okunamadı: ${inputPath} (${error instanceof Error ? error.message : String(error)})` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { usageError: `Girdi dosyası geçerli JSON değil: ${inputPath} (${error instanceof Error ? error.message : String(error)})` }
  }

  if (typeof parsed !== 'object' || parsed === null || !('source' in parsed) || !('approvedTenantAssignmentTable' in parsed)) {
    return { usageError: `Girdi dosyası "source" ve "approvedTenantAssignmentTable" alanlarını içermelidir: ${inputPath}` }
  }
  return parsed as DryRunCliInput
}

export function main(argv: readonly string[]): number {
  const args = parseArgs(argv)
  if ('usageError' in args) {
    process.stderr.write(`${args.usageError}\n`)
    return 2
  }

  const input = loadInput(args.inputPath)
  if ('usageError' in input) {
    process.stderr.write(`${input.usageError}\n`)
    return 2
  }

  const result = runIdentityMigrationDryRun({ input, migrationRunId: args.runId })
  const output = JSON.stringify(result.report ?? { errors: result.errors }, null, 2)

  if (args.outputPath) writeFileSync(args.outputPath, output)
  else process.stdout.write(`${output}\n`)

  return result.exitCode
}

/* istanbul ignore next -- exercised only when run as a real process, not under Jest */
if (require.main === module) {
  process.exitCode = main(process.argv.slice(2))
}
