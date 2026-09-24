import type { PlatformAuditService } from '../../../audit/platform-audit.service'
import type { ScadaExportAuditEntry, ScadaExportAuditPort } from '../export/scada-export.contract'

/**
 * TASK-027.74 — maps a SCADA export record onto the EXISTING export audit contract of TASK-027.57: the same action codes
 * (REPORT_EXPORT_SUCCEEDED / REPORT_EXPORT_FAILED), the same entity (ReportArtifact / artifact code) and the same metadata keys, plus
 * static SCADA facts. No new action code. Metadata never holds a filter value, a label, a name, SQL, a row or a file. A write failure
 * is NOT swallowed here: the service turns it into SCADA_AUDIT_FAILED (fail-closed).
 */
export class PlatformScadaExportAudit implements ScadaExportAuditPort {
  constructor(private readonly platformAudit: Pick<PlatformAuditService, 'log'>) {}

  async record(entry: ScadaExportAuditEntry): Promise<void> {
    const ok = entry.result === 'SUCCEEDED'
    await this.platformAudit.log({
      actorId: entry.actorId,
      actionCode: ok ? 'REPORT_EXPORT_SUCCEEDED' : 'REPORT_EXPORT_FAILED',
      entityType: 'ReportArtifact',
      entityId: entry.artifactCode,
      summary: `Export ${ok ? 'tamamlandı' : 'başarısız oldu'}: ${entry.artifactCode ?? 'unknown'} (${entry.format ?? 'unknown'})`,
      metadata: {
        tenantId: entry.tenantId,
        artifactCode: entry.artifactCode,
        format: entry.format,
        result: entry.result,
        reasonCode: entry.reasonCode,
        rendererMode: entry.rendererMode,
        source: 'SCADA',
        kind: entry.kind,
        delivery: entry.delivery,
        rowCount: entry.rowCount,
        correlationId: entry.correlationId,
        ...(entry.simulation ? { simulation: true } : {}),
      },
    })
  }
}
