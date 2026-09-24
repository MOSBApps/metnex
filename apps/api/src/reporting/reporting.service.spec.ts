import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { DEV_FIXTURE_ARTIFACT, DEV_FIXTURE_ARTIFACT_CODE } from './dataset/dev-fixture-dataset.provider'
import { ReportDatasetResolver } from './dataset/report-dataset.resolver'
import { ReportingService } from './reporting.service'

/**
 * TASK-027.54 — `loadData` (the new JSON endpoint's service method). `renderHtml`/`exportReport`
 * are pre-existing and unchanged; not re-tested here.
 *
 * DEC-0012 governs this file directly: reporting core seeds zero rows and registers zero dataset
 * providers by default (the Demo Operations sample artifact/provider it removed). An earlier
 * revision of this task violated that by adding a runtime `onModuleInit` demo-artifact seed and a
 * demo dataset provider — reverted per AI1 review. `no regression against DEC-0012` below is a
 * static guard against that regression recurring, not just a behavioural check.
 */
function harness() {
  const db = buildMockDb()
  const provider = { supports: jest.fn(), loadDataset: jest.fn() }
  const resolver = new ReportDatasetResolver([provider as never])
  const reportRender = { isConfigured: jest.fn(() => false), render: jest.fn() }
  const templateRegistry = { resolve: jest.fn() }
  const auditService = { log: jest.fn(async () => undefined) }
  const service = new ReportingService(db as never, resolver, reportRender as never, templateRegistry as never, auditService as never)
  return { db, provider, reportRender, templateRegistry, auditService, service }
}

describe('ReportingService.loadData', () => {
  it('returns { artifact, rows, totalAmount } — no HTML built, unlike renderHtml', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ code: 'A1', title: 'Artifact 1', isActive: true }]))
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [{ no: '1', label: 'x', occurredAt: '2026-01-01', status: 'OK', quantity: 1, unitPrice: 1, amount: 1 }], totalAmount: 1 })

    const result = await h.service.loadData('tenant-1', 'A1', {})
    expect(result).toEqual({
      artifact: { code: 'A1', title: 'Artifact 1', isActive: true },
      rows: [{ no: '1', label: 'x', occurredAt: '2026-01-01', status: 'OK', quantity: 1, unitPrice: 1, amount: 1 }],
      totalAmount: 1,
    })
    expect(result).not.toHaveProperty('html')
  })

  it('passes q/status filters through to the provider unchanged', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ code: 'A1', isActive: true }]))
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [], totalAmount: 0 })

    await h.service.loadData('tenant-1', 'A1', { q: 'search', status: 'FAILED' })
    expect(h.provider.loadDataset).toHaveBeenCalledWith('tenant-1', { q: 'search', status: 'FAILED' })
  })

  it('a missing artifact is a 404, the dataset resolver/provider is never reached', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([]))
    const error = await h.service.loadData('tenant-1', 'MISSING', {}).catch(e => e)
    expect(error).toBeInstanceOf(NotFoundException)
    expect(h.provider.loadDataset).not.toHaveBeenCalled()
  })

  it('an inactive artifact is also a 404 (same rule renderHtml/exportReport already enforce)', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ code: 'A1', isActive: false }]))
    const error = await h.service.loadData('tenant-1', 'A1', {}).catch(e => e)
    expect(error).toBeInstanceOf(NotFoundException)
  })

  it('an artifact with no matching dataset provider is a 404 (the pre-existing resolver behaviour, and DEC-0012\'s intended default state when no domain module has registered one yet)', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ code: 'UNMAPPED', isActive: true }]))
    h.provider.supports.mockReturnValue(false)
    const error = await h.service.loadData('tenant-1', 'UNMAPPED', {}).catch(e => e)
    expect(error).toBeInstanceOf(NotFoundException)
  })
})

describe('ReportingService.loadData — tenant isolation', () => {
  it('the tenantId passed to loadData is exactly what reaches the provider, unmodified by filters', async () => {
    const h = harness()
    h.db.select.mockReturnValue(chain([{ code: 'A1', isActive: true }]))
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValue({ rows: [], totalAmount: 0 })

    await h.service.loadData('tenant-a', 'A1', { q: 'tenant-b', status: 'tenant-c' })
    expect(h.provider.loadDataset).toHaveBeenCalledWith('tenant-a', { q: 'tenant-b', status: 'tenant-c' })
  })

  it('two calls for two different tenants each carry their own tenantId — no shared/stale state between calls', async () => {
    const h = harness()
    h.db.select.mockReturnValue(chain([{ code: 'A1', isActive: true }]))
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValue({ rows: [], totalAmount: 0 })

    await h.service.loadData('tenant-a', 'A1', {})
    await h.service.loadData('tenant-b', 'A1', {})

    expect(h.provider.loadDataset).toHaveBeenNthCalledWith(1, 'tenant-a', {})
    expect(h.provider.loadDataset).toHaveBeenNthCalledWith(2, 'tenant-b', {})
  })
})

describe('ReportingService — no regression against DEC-0012 (no seed, no default provider)', () => {
  it('does not implement OnModuleInit / seed anything at startup', () => {
    const h = harness()
    expect((h.service as unknown as { onModuleInit?: unknown }).onModuleInit).toBeUndefined()
  })

  it('never calls db.insert — this service is read-only against report_artifacts', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ code: 'A1', isActive: true }]))
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [], totalAmount: 0 })

    await h.service.loadData('tenant-1', 'A1', {})
    expect(h.db.insert).not.toHaveBeenCalled()
  })
})

/**
 * TASK-027.55 — `getArtifact`/`listArtifacts` substitute an in-memory `DEV_FIXTURE_ARTIFACT` for a
 * DB lookup, but only when `isDevFixtureEnabled()` (NODE_ENV=development AND
 * REPORTING_DEV_FIXTURES=true) — re-evaluated on every call via `process.env`, not cached. This
 * never writes to `report_artifacts`; see the `db.insert` assertion in every case below.
 */
describe('ReportingService — dev fixture artifact substitution (env-gated, no DB write)', () => {
  const ORIGINAL_ENV = { ...process.env }
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('returns the in-memory DEV_FIXTURE_ARTIFACT without touching the DB when enabled and the code matches', async () => {
    process.env.NODE_ENV = 'development'
    process.env.REPORTING_DEV_FIXTURES = 'true'
    const h = harness()

    const artifact = await h.service.getArtifact('tenant-1', DEV_FIXTURE_ARTIFACT_CODE)
    expect(artifact).toEqual(DEV_FIXTURE_ARTIFACT)
    expect(h.db.select).not.toHaveBeenCalled()
  })

  it('falls through to the real DB lookup for any other code, even when the fixture flag is enabled', async () => {
    process.env.NODE_ENV = 'development'
    process.env.REPORTING_DEV_FIXTURES = 'true'
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ code: 'REAL_ARTIFACT', isActive: true }]))

    const artifact = await h.service.getArtifact('tenant-1', 'REAL_ARTIFACT')
    expect(artifact).toEqual({ code: 'REAL_ARTIFACT', isActive: true })
    expect(h.db.select).toHaveBeenCalledTimes(1)
  })

  it('does NOT substitute the fixture artifact when NODE_ENV=production, even if the code matches — falls through to a real (empty) DB lookup and 404s', async () => {
    process.env.NODE_ENV = 'production'
    process.env.REPORTING_DEV_FIXTURES = 'true'
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([]))

    const error = await h.service.getArtifact('tenant-1', DEV_FIXTURE_ARTIFACT_CODE).catch(e => e)
    expect(error).toBeInstanceOf(NotFoundException)
    expect(h.db.select).toHaveBeenCalledTimes(1)
  })

  it('does NOT substitute the fixture artifact when the flag is missing, even in development', async () => {
    process.env.NODE_ENV = 'development'
    delete process.env.REPORTING_DEV_FIXTURES
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([]))

    const error = await h.service.getArtifact('tenant-1', DEV_FIXTURE_ARTIFACT_CODE).catch(e => e)
    expect(error).toBeInstanceOf(NotFoundException)
    expect(h.db.select).toHaveBeenCalledTimes(1)
  })

  it('listArtifacts prepends the fixture artifact only when enabled', async () => {
    process.env.NODE_ENV = 'development'
    process.env.REPORTING_DEV_FIXTURES = 'true'
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ code: 'REAL_ARTIFACT', isActive: true }]))

    const result = await h.service.listArtifacts('tenant-1')
    expect(result.artifacts[0]).toEqual(DEV_FIXTURE_ARTIFACT)
    // TASK-027.73-R1: the in-memory development CSV snapshot artifact follows it (same flag, never persisted)
    expect((result.artifacts[1] as { code: string }).code).toBe('SCADA_HOURLY_ANALYSIS')
    expect(result.artifacts).toHaveLength(3)
  })

  it('listArtifacts never includes the fixture artifact when disabled', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.REPORTING_DEV_FIXTURES
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ code: 'REAL_ARTIFACT', isActive: true }]))

    const result = await h.service.listArtifacts('tenant-1')
    expect(result.artifacts).toEqual([{ code: 'REAL_ARTIFACT', isActive: true }])
  })

  it('getArtifact/listArtifacts never call db.insert regardless of fixture mode', async () => {
    process.env.NODE_ENV = 'development'
    process.env.REPORTING_DEV_FIXTURES = 'true'
    const h = harness()
    h.db.select.mockReturnValue(chain([]))

    await h.service.getArtifact('tenant-1', DEV_FIXTURE_ARTIFACT_CODE).catch(() => undefined)
    await h.service.listArtifacts('tenant-1').catch(() => undefined)
    expect(h.db.insert).not.toHaveBeenCalled()
  })
})

const EXPORTABLE_ARTIFACT = { code: 'A1', title: 'Artifact 1', isActive: true, supportedOutputFormats: ['PDF', 'XLSX'], templatePath: null }
const SAMPLE_ROW = { no: '1', label: 'x', occurredAt: '2026-01-01T00:00:00.000Z', status: 'OK', quantity: 2, unitPrice: 5, amount: 10 }

/**
 * TASK-027.56 — `exportReport` had no direct unit coverage before this task (only the real-network
 * suite in reporting.jasper-integration.spec.ts exercised it, and only when a live renderer is
 * reachable). This block covers the Jasper-configured/fallback branch, filters, format validation,
 * tenant isolation, and the PDF/XLSX magic-number/secret-redaction guarantees at the mock level —
 * independent of whether a real renderer container happens to be running.
 */
describe('ReportingService.exportReport', () => {
  it('rejects an unsupported format before touching the artifact/provider at all', async () => {
    const h = harness()
    const error = await h.service.exportReport('tenant-1', 'A1', 'RTF' as never, {}, 'actor-1').catch(e => e)
    expect(error).toBeInstanceOf(BadRequestException)
    expect(h.db.select).not.toHaveBeenCalled()
  })

  it('a missing artifact is a 404, the dataset resolver/provider is never reached', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([]))
    const error = await h.service.exportReport('tenant-1', 'MISSING', 'PDF', {}, 'actor-1').catch(e => e)
    expect(error).toBeInstanceOf(NotFoundException)
    expect(h.provider.loadDataset).not.toHaveBeenCalled()
  })

  it('an inactive artifact is a 404, same as loadData/renderHtml — and this never reaches the audit write (no denial/success/failure audit for a plain 404)', async () => {
    const h = harness()
    // supports(true) proves the 404 comes from getArtifact's own isActive check, not incidentally
    // from ReportDatasetResolver.resolve() rejecting an unconfigured provider (which would also
    // throw NotFoundException and mask a broken isActive check).
    h.provider.supports.mockReturnValue(true)
    h.db.select.mockReturnValueOnce(chain([{ ...EXPORTABLE_ARTIFACT, isActive: false }]))
    const error = await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-1').catch(e => e)
    expect(error).toBeInstanceOf(NotFoundException)
    expect(h.provider.loadDataset).not.toHaveBeenCalled()
    expect(h.auditService.log).not.toHaveBeenCalled()
  })

  it('rejects a format the artifact does not declare in supportedOutputFormats', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ ...EXPORTABLE_ARTIFACT, supportedOutputFormats: ['XLSX'] }]))
    h.provider.supports.mockReturnValue(true)
    const error = await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-1').catch(e => e)
    expect(error).toBeInstanceOf(BadRequestException)
    expect(h.provider.loadDataset).not.toHaveBeenCalled()
  })

  it('passes q/status filters through to the provider unchanged', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([EXPORTABLE_ARTIFACT]))
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [], totalAmount: 0 })

    await h.service.exportReport('tenant-1', 'A1', 'PDF', { q: 'search', status: 'FAILED' }, 'actor-1')
    expect(h.provider.loadDataset).toHaveBeenCalledWith('tenant-1', { q: 'search', status: 'FAILED' })
  })

  describe('tenant isolation', () => {
    it('the tenantId reaching the provider is exact, unmodified by filters', async () => {
      const h = harness()
      h.db.select.mockReturnValue(chain([EXPORTABLE_ARTIFACT]))
      h.provider.supports.mockReturnValue(true)
      h.provider.loadDataset.mockResolvedValue({ rows: [], totalAmount: 0 })

      await h.service.exportReport('tenant-a', 'A1', 'PDF', { q: 'tenant-b' }, 'actor-1')
      expect(h.provider.loadDataset).toHaveBeenCalledWith('tenant-a', { q: 'tenant-b' })
    })

    it('two exports for two different tenants each carry their own tenantId', async () => {
      const h = harness()
      h.db.select.mockReturnValue(chain([EXPORTABLE_ARTIFACT]))
      h.provider.supports.mockReturnValue(true)
      h.provider.loadDataset.mockResolvedValue({ rows: [], totalAmount: 0 })

      await h.service.exportReport('tenant-a', 'A1', 'PDF', {}, 'actor-1')
      await h.service.exportReport('tenant-b', 'A1', 'PDF', {}, 'actor-1')
      expect(h.provider.loadDataset).toHaveBeenNthCalledWith(1, 'tenant-a', {})
      expect(h.provider.loadDataset).toHaveBeenNthCalledWith(2, 'tenant-b', {})
    })
  })

  describe('renderer / fallback branching', () => {
    it('calls ReportRenderService.render when the renderer is configured, with the resolved rows', async () => {
      const h = harness()
      h.db.select.mockReturnValueOnce(chain([EXPORTABLE_ARTIFACT]))
      h.provider.supports.mockReturnValue(true)
      h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
      h.reportRender.isConfigured.mockReturnValue(true)
      h.reportRender.render.mockResolvedValueOnce({ buffer: Buffer.from('x'), contentType: 'application/pdf', fileName: 'a1.pdf' })

      await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-1')
      expect(h.reportRender.render).toHaveBeenCalledWith({
        artifactCode: 'A1',
        templateId: null,
        format: 'PDF',
        rows: [SAMPLE_ROW],
      })
    })

    it('never calls the renderer when it is not configured — uses the in-process fallback instead', async () => {
      const h = harness()
      h.db.select.mockReturnValueOnce(chain([EXPORTABLE_ARTIFACT]))
      h.provider.supports.mockReturnValue(true)
      h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
      h.reportRender.isConfigured.mockReturnValue(false)

      await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-1')
      expect(h.reportRender.render).not.toHaveBeenCalled()
    })

    it('fallback PDF starts with the real %PDF- magic number', async () => {
      const h = harness()
      h.db.select.mockReturnValueOnce(chain([EXPORTABLE_ARTIFACT]))
      h.provider.supports.mockReturnValue(true)
      h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
      h.reportRender.isConfigured.mockReturnValue(false)

      const result = await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-1')
      expect(result.buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-')
      expect(result.contentType).toBe('application/pdf')
    })

    it('fallback XLSX starts with the real PK (ZIP) magic number', async () => {
      const h = harness()
      h.db.select.mockReturnValueOnce(chain([EXPORTABLE_ARTIFACT]))
      h.provider.supports.mockReturnValue(true)
      h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
      h.reportRender.isConfigured.mockReturnValue(false)

      const result = await h.service.exportReport('tenant-1', 'A1', 'XLSX', {}, 'actor-1')
      expect(result.buffer.subarray(0, 2).toString('utf8')).toBe('PK')
      expect(result.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    })

    it('propagates a renderer failure (e.g. BadGatewayException) rather than silently falling back — no fake success', async () => {
      const h = harness()
      h.db.select.mockReturnValueOnce(chain([EXPORTABLE_ARTIFACT]))
      h.provider.supports.mockReturnValue(true)
      h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
      h.reportRender.isConfigured.mockReturnValue(true)
      const rendererError = new Error('renderer unreachable')
      h.reportRender.render.mockRejectedValueOnce(rendererError)

      const error = await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-1').catch(e => e)
      expect(error).toBe(rendererError)
    })
  })

  describe('safe filename / no secret leakage', () => {
    it('fallback PDF file name is built from the artifact code via buildReportFileName (no raw user input)', async () => {
      const h = harness()
      h.db.select.mockReturnValueOnce(chain([{ ...EXPORTABLE_ARTIFACT, code: '../../evil\r\nX: 1' }]))
      h.provider.supports.mockReturnValue(true)
      h.provider.loadDataset.mockResolvedValueOnce({ rows: [], totalAmount: 0 })
      h.reportRender.isConfigured.mockReturnValue(false)

      const result = await h.service.exportReport('tenant-1', '../../evil\r\nX: 1', 'PDF', {}, 'actor-1')
      expect(result.fileName).not.toMatch(/[\r\n]/)
      expect(result.fileName).not.toContain('..')
      expect(result.fileName).not.toContain('/')
    })

    it('the fallback PDF/XLSX buffer never contains a secret/token/connection-string-shaped substring', async () => {
      const h = harness()
      h.db.select.mockReturnValue(chain([EXPORTABLE_ARTIFACT]))
      h.provider.supports.mockReturnValue(true)
      h.provider.loadDataset.mockResolvedValue({ rows: [SAMPLE_ROW], totalAmount: 10 })
      h.reportRender.isConfigured.mockReturnValue(false)

      const pdf = await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-1')
      const xlsx = await h.service.exportReport('tenant-1', 'A1', 'XLSX', {}, 'actor-1')
      expect(pdf.buffer.toString('latin1')).not.toMatch(/postgres(?:ql)?:\/\/|secret|password|Authorization: Bearer/i)
      expect(xlsx.buffer.toString('latin1')).not.toMatch(/postgres(?:ql)?:\/\/|secret|password|Authorization: Bearer/i)
    })
  })
})

/**
 * TASK-027.56 — the visible "Geliştirme simülasyon verisi" marker row `exportReport` prepends for
 * the dev fixture artifact, env-gated exactly like the artifact substitution itself.
 */
describe('ReportingService.exportReport — dev fixture export label row', () => {
  const ORIGINAL_ENV = { ...process.env }
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('the fallback PDF bytes visibly contain the "Geliştirme simülasyon verisi" label text', async () => {
    process.env.NODE_ENV = 'development'
    process.env.REPORTING_DEV_FIXTURES = 'true'
    const h = harness()
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
    h.reportRender.isConfigured.mockReturnValue(false)

    const result = await h.service.exportReport('tenant-1', DEV_FIXTURE_ARTIFACT_CODE, 'PDF', {}, 'actor-1')
    expect(result.buffer.toString('utf8')).toContain('Geliştirme simülasyon verisi')
  })

  it('the fallback XLSX rows visibly contain the "Geliştirme simülasyon verisi" label text', async () => {
    process.env.NODE_ENV = 'development'
    process.env.REPORTING_DEV_FIXTURES = 'true'
    const h = harness()
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
    h.reportRender.isConfigured.mockReturnValue(false)

    const result = await h.service.exportReport('tenant-1', DEV_FIXTURE_ARTIFACT_CODE, 'XLSX', {}, 'actor-1')
    // XLSX is a ZIP; the shared-strings/sheet XML inside is not plaintext-searchable without
    // unzipping, but buildSimpleXlsx is a minimal (uncompressed-content) writer — a direct search
    // still finds the label because the string table entry isn't deflated in this writer.
    expect(result.buffer.toString('latin1')).toContain('Geli')
  })

  it('does NOT prepend the label row for a real (non-fixture) artifact, even when the fixture flag is enabled', async () => {
    process.env.NODE_ENV = 'development'
    process.env.REPORTING_DEV_FIXTURES = 'true'
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([EXPORTABLE_ARTIFACT]))
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
    h.reportRender.isConfigured.mockReturnValue(true)
    h.reportRender.render.mockResolvedValueOnce({ buffer: Buffer.from('x'), contentType: 'application/pdf', fileName: 'a1.pdf' })

    await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-1')
    expect(h.reportRender.render).toHaveBeenCalledWith(expect.objectContaining({ rows: [SAMPLE_ROW] }))
  })

  it('does NOT prepend the label row when the fixture flag is disabled, even for the fixture code (falls through to a real 404)', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.REPORTING_DEV_FIXTURES
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([]))

    const error = await h.service.exportReport('tenant-1', DEV_FIXTURE_ARTIFACT_CODE, 'PDF', {}, 'actor-1').catch(e => e)
    expect(error).toBeInstanceOf(NotFoundException)
  })

  it('the label row is also sent to the renderer (Jasper path), not only the fallback path', async () => {
    process.env.NODE_ENV = 'development'
    process.env.REPORTING_DEV_FIXTURES = 'true'
    const h = harness()
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
    h.reportRender.isConfigured.mockReturnValue(true)
    h.reportRender.render.mockResolvedValueOnce({ buffer: Buffer.from('x'), contentType: 'application/pdf', fileName: 'x.pdf' })

    await h.service.exportReport('tenant-1', DEV_FIXTURE_ARTIFACT_CODE, 'PDF', {}, 'actor-1')
    const [[callArg]] = h.reportRender.render.mock.calls as [[{ rows: Array<{ label: string }> }]]
    expect(callArg.rows[0]?.label).toBe('Geliştirme simülasyon verisi')
    expect(callArg.rows[1]).toEqual(SAMPLE_ROW)
  })
})

/**
 * TASK-027.57 — export success/failure audit. `PermissionGuard`'s own spec covers the *denial*
 * audit (which happens before this method is ever reached, since a denial never lets the
 * controller/service run at all); this covers the two outcomes only `exportReport` itself can
 * produce: a real success (after the file bytes exist) and a real failure (renderer/fallback
 * threw) — both written via the same `PlatformAuditService`, no new table/schema.
 */
describe('ReportingService.exportReport — audit (success/failure)', () => {
  it('writes REPORT_EXPORT_SUCCEEDED only AFTER the renderer has actually produced a result — never before', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([EXPORTABLE_ARTIFACT]))
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
    h.reportRender.isConfigured.mockReturnValue(true)
    const callOrder: string[] = []
    h.reportRender.render.mockImplementationOnce(async () => {
      callOrder.push('rendered')
      return { buffer: Buffer.from('x'), contentType: 'application/pdf', fileName: 'a1.pdf' }
    })
    h.auditService.log.mockImplementationOnce(async () => {
      callOrder.push('audited')
    })

    await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-1')
    expect(callOrder).toEqual(['rendered', 'audited'])
  })

  it('the success audit metadata carries actorId, tenantId, artifactCode, format, result, reasonCode, rendererMode — and no row content', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([EXPORTABLE_ARTIFACT]))
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
    h.reportRender.isConfigured.mockReturnValue(false)

    await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-42')
    expect(h.auditService.log).toHaveBeenCalledWith({
      actorId: 'actor-42',
      actionCode: 'REPORT_EXPORT_SUCCEEDED',
      entityType: 'ReportArtifact',
      entityId: 'A1',
      summary: expect.any(String),
      metadata: {
        tenantId: 'tenant-1',
        artifactCode: 'A1',
        format: 'PDF',
        result: 'SUCCEEDED',
        reasonCode: 'OK',
        rendererMode: 'FALLBACK',
      },
    })
    const entry = (h.auditService.log.mock.calls[0] as unknown[])?.[0] as { metadata: Record<string, unknown> }
    expect(entry.metadata).not.toHaveProperty('rows')
    expect(entry.metadata).not.toHaveProperty('simulation') // never present for a non-fixture export
  })

  it('a Jasper-configured export is audited with rendererMode: JASPER', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([EXPORTABLE_ARTIFACT]))
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
    h.reportRender.isConfigured.mockReturnValue(true)
    h.reportRender.render.mockResolvedValueOnce({ buffer: Buffer.from('x'), contentType: 'application/pdf', fileName: 'a1.pdf' })

    await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-1')
    expect(h.auditService.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ rendererMode: 'JASPER' }) }))
  })

  it('a renderer failure is audited as REPORT_EXPORT_FAILED with a safe reasonCode, and the original error is still re-thrown unchanged — no fake success', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([EXPORTABLE_ARTIFACT]))
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
    h.reportRender.isConfigured.mockReturnValue(true)
    const rendererError = new BadGatewayException('Renderer hata döndürdü: 503 — connection string postgres://user:pw@host/db leaked in a hypothetical bad message')
    h.reportRender.render.mockRejectedValueOnce(rendererError)

    const error = await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-1').catch(e => e)
    expect(error).toBe(rendererError) // unchanged, not swallowed
    expect(h.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionCode: 'REPORT_EXPORT_FAILED',
        metadata: expect.objectContaining({ result: 'FAILED', reasonCode: 'RENDERER_HTTP_ERROR' }),
      }),
    )
    // the raw exception message (which in this test deliberately contains a fake connection
    // string) must never reach the audit metadata — only the classified static reasonCode does.
    const entry = (h.auditService.log.mock.calls[0] as unknown[])?.[0] as { metadata: Record<string, unknown> }
    expect(JSON.stringify(entry.metadata)).not.toMatch(/postgres:\/\//)
  })

  it('the fallback path is also audited on failure (not only the Jasper path)', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([EXPORTABLE_ARTIFACT]))
    h.provider.supports.mockReturnValue(true)
    // a malformed row (null instead of a real ReportDatasetRow) makes the fallback PDF builder's
    // own `row.no`/`row.label` access throw for real — a genuine fallback-path failure, not a
    // mocked/injected one, while still keeping the failure deterministic and localized.
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [null] as never, totalAmount: 0 })
    h.reportRender.isConfigured.mockReturnValue(false)

    const error = await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-1').catch(e => e)
    expect(error).toBeInstanceOf(TypeError)
    expect(h.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ actionCode: 'REPORT_EXPORT_FAILED', metadata: expect.objectContaining({ rendererMode: 'FALLBACK' }) }),
    )
  })

  it('an audit-write failure on the success path never turns the response into a failure — the rendered file is still returned', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([EXPORTABLE_ARTIFACT]))
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
    h.reportRender.isConfigured.mockReturnValue(false)
    h.auditService.log.mockRejectedValueOnce(new Error('audit db down'))

    const result = await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-1')
    expect(result.buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-') // still a real success
  })

  it('an audit-write failure on the failure path never masks the original render error', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([EXPORTABLE_ARTIFACT]))
    h.provider.supports.mockReturnValue(true)
    h.provider.loadDataset.mockResolvedValueOnce({ rows: [SAMPLE_ROW], totalAmount: 10 })
    h.reportRender.isConfigured.mockReturnValue(true)
    const rendererError = new BadGatewayException('Renderer servisine erişilemedi')
    h.reportRender.render.mockRejectedValueOnce(rendererError)
    h.auditService.log.mockRejectedValueOnce(new Error('audit db down too'))

    const error = await h.service.exportReport('tenant-1', 'A1', 'PDF', {}, 'actor-1').catch(e => e)
    expect(error).toBe(rendererError) // the ORIGINAL render error, not the audit-write error
  })

  describe('tenant isolation', () => {
    it('the audit metadata tenantId matches exactly the tenant that made the export call', async () => {
      const h = harness()
      h.db.select.mockReturnValue(chain([EXPORTABLE_ARTIFACT]))
      h.provider.supports.mockReturnValue(true)
      h.provider.loadDataset.mockResolvedValue({ rows: [], totalAmount: 0 })
      h.reportRender.isConfigured.mockReturnValue(false)

      await h.service.exportReport('tenant-a', 'A1', 'PDF', {}, 'actor-1')
      await h.service.exportReport('tenant-b', 'A1', 'PDF', {}, 'actor-1')

      expect(h.auditService.log).toHaveBeenNthCalledWith(1, expect.objectContaining({ metadata: expect.objectContaining({ tenantId: 'tenant-a' }) }))
      expect(h.auditService.log).toHaveBeenNthCalledWith(2, expect.objectContaining({ metadata: expect.objectContaining({ tenantId: 'tenant-b' }) }))
    })
  })

  describe('development fixture — simulation flag', () => {
    const ORIGINAL_ENV = { ...process.env }
    afterEach(() => {
      process.env = { ...ORIGINAL_ENV }
    })

    it('audits simulation: true only for a real dev-fixture export', async () => {
      process.env.NODE_ENV = 'development'
      process.env.REPORTING_DEV_FIXTURES = 'true'
      const h = harness()
      h.provider.supports.mockReturnValue(true)
      h.provider.loadDataset.mockResolvedValueOnce({ rows: [], totalAmount: 0 })
      h.reportRender.isConfigured.mockReturnValue(false)

      await h.service.exportReport('tenant-1', DEV_FIXTURE_ARTIFACT_CODE, 'PDF', {}, 'actor-1')
      expect(h.auditService.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ simulation: true }) }))
    })

    it('never audits simulation: true in production, even for the fixture code (which 404s there anyway)', async () => {
      process.env.NODE_ENV = 'production'
      delete process.env.REPORTING_DEV_FIXTURES
      const h = harness()
      h.db.select.mockReturnValueOnce(chain([]))

      await h.service.exportReport('tenant-1', DEV_FIXTURE_ARTIFACT_CODE, 'PDF', {}, 'actor-1').catch(() => undefined)
      expect(h.auditService.log).not.toHaveBeenCalled() // 404 before any render/audit is reached
    })
  })
})
