import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import type { ReportDataset } from './dataset/report-dataset.contract'
import { ReportRenderService } from './report-render.service'
import { ReportingService } from './reporting.service'
import { TemplateRegistryService } from './templates/template-registry'

const SAMPLE_ARTIFACT = {
  code: 'SAMPLE_REPORT',
  title: 'Sample Report',
  isActive: true,
  templatePath: null,
  supportedOutputFormats: ['HTML', 'PDF', 'XLSX'],
}

const TEMPLATED_ARTIFACT = {
  code: 'TEMPLATED-REPORT',
  title: 'Templated Report',
  isActive: true,
  // Non-null just means "this artifact needs a renderer template" — the literal value is never
  // forwarded anywhere; the real template is looked up by artifact.code in the allowlist.
  templatePath: 'legacy-metadata-only-field',
  supportedOutputFormats: ['HTML', 'PDF', 'XLSX'],
}

// Its code, lower-cased, is exactly the templateId both the API's and the renderer's allowlists
// register (apps/api/.../templates/sample-report.jrxml and
// services/jasper-renderer/.../templates/sample-report.jrxml — same file, TASK-022.5-R1).
const ALLOWLISTED_TEMPLATED_ARTIFACT = {
  code: 'SAMPLE-REPORT',
  title: 'Allowlisted Sample Report',
  isActive: true,
  templatePath: 'legacy-metadata-only-field',
  supportedOutputFormats: ['HTML', 'PDF', 'XLSX'],
}

const OTHER_ARTIFACT = {
  code: 'OTHER_REPORT',
  title: 'Other Report',
  isActive: true,
  templatePath: null,
  supportedOutputFormats: ['HTML', 'PDF', 'XLSX'],
}

function emptyDataset(): ReportDataset {
  return { rows: [], totalAmount: 0 }
}

function build() {
  const db = buildMockDb()
  const provider = { loadDataset: jest.fn().mockResolvedValue(emptyDataset()) }
  const datasetResolver = {
    resolve: jest.fn((code: string) => {
      const known = [SAMPLE_ARTIFACT.code, TEMPLATED_ARTIFACT.code, ALLOWLISTED_TEMPLATED_ARTIFACT.code]
      if (!known.includes(code)) {
        throw new NotFoundException(`Bu artifact için dataset provider bulunamadı: ${code}`)
      }
      return provider
    }),
  }
  const reportRender = new ReportRenderService()
  // Real TemplateRegistryService with its real allowlist (currently just 'sample-report',
  // mirrored on the renderer side) — 'templated-report' (TEMPLATED_ARTIFACT's code, lower-cased)
  // is deliberately NOT in it, which is exactly the "unknown template id" scenario tested below.
  const templateRegistry = new TemplateRegistryService()
  const service = new ReportingService(db as never, datasetResolver as never, reportRender, templateRegistry)
  return { service, db, datasetResolver, provider, reportRender, templateRegistry }
}

describe('ReportingService', () => {
  afterEach(() => {
    delete process.env.REPORT_RENDER_ENDPOINT
    delete process.env.REPORT_RENDER_INTERNAL_TOKEN
  })

  it('listArtifacts returns active report artifacts', async () => {
    const { service, db } = build()
    db.select.mockReturnValueOnce(chain([SAMPLE_ARTIFACT, OTHER_ARTIFACT]))

    const { artifacts } = await service.listArtifacts('tenant-1')

    expect(artifacts.map(a => a.code)).toEqual(['SAMPLE_REPORT', 'OTHER_REPORT'])
  })

  it('getArtifact returns requested report artifact when found', async () => {
    const { service, db } = build()
    db.select.mockReturnValueOnce(chain([SAMPLE_ARTIFACT]))

    await expect(service.getArtifact('tenant-1', 'SAMPLE_REPORT')).resolves.toEqual(SAMPLE_ARTIFACT)
  })

  it('resolves the dataset provider by artifact code', async () => {
    const { service, db, datasetResolver } = build()
    db.select.mockReturnValueOnce(chain([SAMPLE_ARTIFACT]))

    await service.renderHtml('tenant-1', 'SAMPLE_REPORT', {})

    expect(datasetResolver.resolve).toHaveBeenCalledWith('SAMPLE_REPORT')
  })

  it('passes tenantId through to the resolved provider', async () => {
    const { service, db, provider } = build()
    db.select.mockReturnValueOnce(chain([SAMPLE_ARTIFACT]))

    await service.renderHtml('tenant-42', 'SAMPLE_REPORT', { status: 'OPEN' })

    expect(provider.loadDataset).toHaveBeenCalledWith('tenant-42', { status: 'OPEN' })
  })

  it('render rejects artifacts with no dataset provider (controlled NotFoundException)', async () => {
    const { service, db } = build()
    db.select.mockReturnValueOnce(chain([OTHER_ARTIFACT]))

    await expect(service.renderHtml('tenant-1', 'OTHER_REPORT', {})).rejects.toBeInstanceOf(NotFoundException)
  })

  it('export rejects artifacts with no dataset provider (controlled NotFoundException)', async () => {
    const { service, db } = build()
    db.select.mockReturnValueOnce(chain([OTHER_ARTIFACT]))

    await expect(service.exportReport('tenant-1', 'OTHER_REPORT', 'PDF', {})).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rejects an unrecognized format at runtime (route params are not type-enforced)', async () => {
    const { service, db } = build()
    db.select.mockReturnValueOnce(chain([SAMPLE_ARTIFACT]))

    await expect(
      service.exportReport('tenant-1', 'SAMPLE_REPORT', 'CSV' as never, {}),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects export for an artifact whose template id is not in the allowlist (controlled error, not a silent bypass)', async () => {
    const { service, db } = build()
    db.select.mockReturnValueOnce(chain([TEMPLATED_ARTIFACT]))

    await expect(
      service.exportReport('tenant-1', 'TEMPLATED-REPORT', 'PDF', {}),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('export produces a genuinely valid XLSX (ZIP-signed) buffer, not CSV mislabeled as XLSX', async () => {
    const { service, db, provider } = build()
    db.select.mockReturnValueOnce(chain([SAMPLE_ARTIFACT]))
    provider.loadDataset.mockResolvedValue({
      rows: [{ no: 'TRX-0001', label: 'Row 1', occurredAt: new Date(), status: 'OPEN', quantity: 2, unitPrice: 125, amount: 250 }],
      totalAmount: 250,
    })

    const result = await service.exportReport('tenant-1', 'SAMPLE_REPORT', 'XLSX', {})

    expect(result.buffer.subarray(0, 2).toString('utf8')).toBe('PK')
    expect(result.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })

  it('HTML preview and export use the same dataset provider flow', async () => {
    const { service, db, provider } = build()
    db.select.mockReturnValueOnce(chain([SAMPLE_ARTIFACT]))
    db.select.mockReturnValueOnce(chain([SAMPLE_ARTIFACT]))
    provider.loadDataset.mockResolvedValue({
      rows: [{ no: 'TRX-0001', label: 'Row 1', occurredAt: new Date(), status: 'OPEN', quantity: 2, unitPrice: 125, amount: 250 }],
      totalAmount: 250,
    })

    await service.renderHtml('tenant-1', 'SAMPLE_REPORT', {})
    await service.exportReport('tenant-1', 'SAMPLE_REPORT', 'XLSX', {})

    expect(provider.loadDataset).toHaveBeenCalledTimes(2)
  })

  it('export calls the configured Jasper renderer (with templateId, not templatePath) instead of silently using the fallback', async () => {
    process.env.REPORT_RENDER_ENDPOINT = 'http://renderer.internal/render'
    process.env.REPORT_RENDER_INTERNAL_TOKEN = 'secret-token'
    const { service, db } = build()
    db.select.mockReturnValueOnce(chain([SAMPLE_ARTIFACT]))

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/pdf' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })
    ;(global as { fetch: typeof fetch }).fetch = fetchMock as never

    const result = await service.exportReport('tenant-1', 'SAMPLE_REPORT', 'PDF', {})

    expect(fetchMock).toHaveBeenCalledWith('http://renderer.internal/render', expect.any(Object))
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    const parsedBody = JSON.parse(init.body) as Record<string, unknown>
    expect(parsedBody).not.toHaveProperty('templatePath')
    expect(parsedBody.templateId).toBeNull()
    expect(result.buffer).toEqual(Buffer.from([1, 2, 3]))
  })

  it('fails closed (does not fall back silently) when the configured Jasper renderer is unreachable', async () => {
    process.env.REPORT_RENDER_ENDPOINT = 'http://renderer.internal/render'
    process.env.REPORT_RENDER_INTERNAL_TOKEN = 'secret-token'
    const { service, db } = build()
    db.select.mockReturnValueOnce(chain([SAMPLE_ARTIFACT]))
    ;(global as { fetch: typeof fetch }).fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as never

    await expect(service.exportReport('tenant-1', 'SAMPLE_REPORT', 'PDF', {})).rejects.toBeInstanceOf(
      BadGatewayException,
    )
  })

  it('resolves an allowlisted template and sends templateId (never templatePath) to the configured Jasper renderer (TASK-022.5-R1)', async () => {
    process.env.REPORT_RENDER_ENDPOINT = 'http://renderer.internal/render'
    process.env.REPORT_RENDER_INTERNAL_TOKEN = 'secret-token'
    const { service, db } = build()
    db.select.mockReturnValueOnce(chain([ALLOWLISTED_TEMPLATED_ARTIFACT]))

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/pdf' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })
    ;(global as { fetch: typeof fetch }).fetch = fetchMock as never

    const result = await service.exportReport('tenant-1', 'SAMPLE-REPORT', 'PDF', {})

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    const parsedBody = JSON.parse(init.body) as Record<string, unknown>
    expect(parsedBody).not.toHaveProperty('templatePath')
    // Same templateId the renderer's own allowlist (TemplateRegistry.java) registers — proves the
    // two allowlists agree, not just that the API stopped forwarding a raw path.
    expect(parsedBody.templateId).toBe('sample-report')
    expect(result.buffer).toEqual(Buffer.from([1, 2, 3]))
  })

  it('fails closed when the renderer endpoint is configured but the internal token is missing', async () => {
    process.env.REPORT_RENDER_ENDPOINT = 'http://renderer.internal/render'
    const { service, db } = build()
    db.select.mockReturnValueOnce(chain([SAMPLE_ARTIFACT]))
    const fetchMock = jest.fn()
    ;(global as { fetch: typeof fetch }).fetch = fetchMock as never

    await expect(service.exportReport('tenant-1', 'SAMPLE_REPORT', 'PDF', {})).rejects.toBeInstanceOf(
      BadGatewayException,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
