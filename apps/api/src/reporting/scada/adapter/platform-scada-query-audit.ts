import type { PlatformAuditService } from '../../../audit/platform-audit.service'
import type { ScadaQueryAuditEntry, ScadaQueryAuditPort } from './scada-readonly.port'

/**
 * Maps a SCADA query audit entry onto the existing `platform_audit_logs` (DEC-0015). Not registered in
 * any Nest module by TASK-027.64. Summary text is static; metadata carries only the fixed numeric/code
 * fields — never names, SQL, parameters or rows (`scrubSecrets` still runs inside `PlatformAuditService`).
 */
export class PlatformScadaQueryAudit implements ScadaQueryAuditPort {
  constructor(private readonly platformAudit: Pick<PlatformAuditService, 'log'>) {}

  async record(entry: ScadaQueryAuditEntry): Promise<void> {
    await this.platformAudit.log({
      actorId: entry.actorId,
      actionCode: entry.actionCode,
      entityType: entry.entityType,
      // A null entityId (invalid catalog id) is stored as a real NULL — never '', a nil UUID or any sentinel.
      // Needs migration 0005 (entityId nullable); until it is applied the insert fails and the adapter fails closed.
      entityId: entry.entityId,
      summary: 'SCADA analysis query',
      metadata: {
        tenantId: entry.tenantId,
        customerRootTenantId: entry.customerRootTenantId,
        reasonCode: entry.reasonCode,
        rowCount: entry.rowCount,
        columnCount: entry.columnCount,
        durationMs: entry.durationMs,
        limitReason: entry.limitReason,
        correlationId: entry.correlationId,
      },
    })
  }
}
