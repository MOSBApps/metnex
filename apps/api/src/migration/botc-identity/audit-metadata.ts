import { randomUUID } from 'crypto'
import type { DryRunReport } from './types'

/**
 * Mirrors the field shape of `apps/api/src/audit/platform-audit.service.ts`
 * (`actorId`/`actionCode`/`entityType`/`entityId`/`summary`/`metadata`) per
 * docs/migration/METNEX_MIGRATION_DRYRUN_IDEMPOTENCY_ROLLBACK_STANDARD.md §9. This module never
 * calls `PlatformAuditService` or writes to `platform_audit_log` — it only builds the record shape
 * so a caller with real DB/audit access can persist it once apply is approved for real infra.
 */
export interface MigrationRunAuditMetadata {
  actorId: string
  actionCode: 'MIGRATION:BOT_APP_USERS:DRY_RUN' | 'MIGRATION:BOT_APP_USERS:APPLY'
  entityType: 'migration_run'
  entityId: string
  summary: string
  metadata: {
    migrationRunId: string
    startedAt: string
    finishedAt: string
    report: DryRunReport
  }
}

export function generateMigrationRunId(): string {
  return randomUUID()
}

export function buildAuditMetadata(params: {
  actorId: string
  mode: 'DRY_RUN' | 'APPLY'
  startedAt: string
  finishedAt: string
  report: DryRunReport
}): MigrationRunAuditMetadata {
  const { actorId, mode, startedAt, finishedAt, report } = params
  return {
    actorId,
    actionCode: mode === 'DRY_RUN' ? 'MIGRATION:BOT_APP_USERS:DRY_RUN' : 'MIGRATION:BOT_APP_USERS:APPLY',
    entityType: 'migration_run',
    entityId: report.migrationRunId,
    summary: `${report.usersToCreate} kullanıcı oluşturulacak/oluşturuldu, ${report.usersToSkip} atlandı, ${report.tenantMembershipResults.unresolved} tenant ataması çözülemedi, ${report.errorsAndWarnings.length} hata/uyarı.`,
    metadata: { migrationRunId: report.migrationRunId, startedAt, finishedAt, report },
  }
}
