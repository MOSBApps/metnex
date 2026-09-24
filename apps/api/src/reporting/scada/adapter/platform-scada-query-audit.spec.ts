import { PlatformScadaQueryAudit } from './platform-scada-query-audit'
import type { ScadaQueryAuditEntry } from './scada-readonly.port'

describe('PlatformScadaQueryAudit', () => {
  const entry: ScadaQueryAuditEntry = {
    actionCode: 'SCADA_QUERY_DENIED',
    entityType: 'ScadaAnalysisQuery',
    entityId: '00000000-0000-4000-8000-000000000001',
    actorId: 'actor-1',
    tenantId: 't1',
    customerRootTenantId: 'root',
    reasonCode: 'ROW_LIMIT_EXCEEDED',
    rowCount: null,
    columnCount: null,
    durationMs: 7,
    limitReason: 'ROW_LIMIT',
    correlationId: 'srv-1',
  }
  it('maps onto platform_audit_logs with static summary and only the fixed metadata', async () => {
    const log = jest.fn().mockResolvedValue(undefined)
    await new PlatformScadaQueryAudit({ log }).record(entry)
    expect(log).toHaveBeenCalledWith({
      actorId: 'actor-1',
      actionCode: 'SCADA_QUERY_DENIED',
      entityType: 'ScadaAnalysisQuery',
      entityId: entry.entityId,
      summary: 'SCADA analysis query',
      metadata: { tenantId: 't1', customerRootTenantId: 'root', reasonCode: 'ROW_LIMIT_EXCEEDED', rowCount: null, columnCount: null, durationMs: 7, limitReason: 'ROW_LIMIT', correlationId: 'srv-1' },
    })
  })
  it('a null entityId (invalid catalog id) stays null — no empty string, no placeholder identifier', async () => {
    const log = jest.fn().mockResolvedValue(undefined)
    await new PlatformScadaQueryAudit({ log }).record({ ...entry, entityId: null, reasonCode: 'INVALID_CATALOG_ID' })
    expect(log.mock.calls[0]![0]).toMatchObject({ entityId: null, metadata: { reasonCode: 'INVALID_CATALOG_ID' } })
  })
  it('propagates a write failure (so the adapter can fail closed)', async () => {
    await expect(new PlatformScadaQueryAudit({ log: jest.fn().mockRejectedValue(new Error('down')) }).record(entry)).rejects.toThrow('down')
  })
})
