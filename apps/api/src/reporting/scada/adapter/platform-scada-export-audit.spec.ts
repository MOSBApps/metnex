import type { ScadaExportAuditEntry } from '../export/scada-export.contract'
import { PlatformScadaExportAudit } from './platform-scada-export-audit'

const entry = (over: Partial<ScadaExportAuditEntry> = {}): ScadaExportAuditEntry => ({ actorId: 'u-1', tenantId: 't-1', artifactCode: 'ART_1', format: 'PDF', kind: 'ANALYSIS', result: 'SUCCEEDED', reasonCode: 'OK', rendererMode: 'JASPER', delivery: 'SERVER_FILE', rowCount: 12, simulation: false, correlationId: 'c-1', ...over })

describe('PlatformScadaExportAudit — the EXISTING export audit contract (TASK-027.57), no new action code', () => {
  it('success ⇒ REPORT_EXPORT_SUCCEEDED on ReportArtifact / artifact code with static metadata; the simulation key exists only when true', async () => {
    const log = jest.fn(async () => undefined)
    await new PlatformScadaExportAudit({ log }).record(entry())
    expect(log).toHaveBeenCalledWith({
      actorId: 'u-1',
      actionCode: 'REPORT_EXPORT_SUCCEEDED',
      entityType: 'ReportArtifact',
      entityId: 'ART_1',
      summary: 'Export tamamlandı: ART_1 (PDF)',
      metadata: { tenantId: 't-1', artifactCode: 'ART_1', format: 'PDF', result: 'SUCCEEDED', reasonCode: 'OK', rendererMode: 'JASPER', source: 'SCADA', kind: 'ANALYSIS', delivery: 'SERVER_FILE', rowCount: 12, correlationId: 'c-1' },
    })
    await new PlatformScadaExportAudit({ log }).record(entry({ simulation: true }))
    expect((log.mock.calls[1] as unknown as [{ metadata: Record<string, unknown> }])[0].metadata).toMatchObject({ simulation: true })
  })

  it('failure ⇒ REPORT_EXPORT_FAILED with a static reason; an unknown artifact / format is stored as NULL / "unknown", never a client string', async () => {
    const log = jest.fn(async () => undefined)
    await new PlatformScadaExportAudit({ log }).record(entry({ result: 'FAILED', reasonCode: 'SCADA_EXPORT_EMPTY', artifactCode: null, format: null, kind: null }))
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ actionCode: 'REPORT_EXPORT_FAILED', entityId: null, summary: 'Export başarısız oldu: unknown (unknown)' }))
  })

  it('a write failure is NOT swallowed here (the service turns it into SCADA_AUDIT_FAILED — fail-closed)', async () => {
    const log = jest.fn(async () => { throw new Error('db down') })
    await expect(new PlatformScadaExportAudit({ log }).record(entry())).rejects.toThrow('db down')
  })

  it('the metadata has no filter, label, name, SQL, row or file', async () => {
    const log = jest.fn(async () => undefined)
    await new PlatformScadaExportAudit({ log }).record(entry())
    const keys = Object.keys((log.mock.calls[0] as unknown as [{ metadata: Record<string, unknown> }])[0].metadata)
    expect(keys.sort()).toEqual(['artifactCode', 'correlationId', 'delivery', 'format', 'kind', 'reasonCode', 'rendererMode', 'result', 'rowCount', 'source', 'tenantId'])
  })
})
