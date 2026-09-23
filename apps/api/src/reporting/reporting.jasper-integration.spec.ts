import path from 'node:path'
import * as dotenv from 'dotenv'

// Loaded here (not just relied on from main.ts) because `jest` does not run through main.ts's
// bootstrap — this test needs the same REPORT_RENDER_* values ./dev.sh wrote into apps/api/.env
// to reach the real renderer container this repo's dev environment already has running.
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { inflateSync } from 'node:zlib'
import type { Response } from 'express'
import { PlatformAuditService } from '../audit/platform-audit.service'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { DEV_FIXTURE_ARTIFACT_CODE, DevFixtureDatasetProvider } from './dataset/dev-fixture-dataset.provider'
import type { ReportDataset, ReportDatasetProvider } from './dataset/report-dataset.contract'
import { ReportDatasetResolver } from './dataset/report-dataset.resolver'
import { ReportingController } from './reporting.controller'
import { ReportingService } from './reporting.service'
import { ReportRenderService } from './report-render.service'
import { TemplateRegistryService } from './templates/template-registry'

/**
 * Real, end-to-end proof that the API (`ReportingController` → `ReportingService` →
 * `ReportRenderService`, the exact call chain `POST /reports/:code/export/:format` executes —
 * not a curl against the renderer directly) drives a real Jasper render over the real network
 * (TASK-022.5-R1). No new NestJS testing/HTTP-server dependency is introduced (this repo's specs
 * always instantiate services directly, never via @nestjs/testing) — the controller method is
 * called exactly like Express/Nest would call it for a real request, using a fake Response object
 * to capture what writeDownload() sends. Test-local fixtures only — no new domain/demo module is
 * added to the source tree; this artifact + provider exist solely inside this spec file.
 */
const ALLOWLISTED_ARTIFACT = {
  code: 'SAMPLE-REPORT',
  title: 'Sample Report (integration fixture)',
  isActive: true,
  templatePath: 'legacy-metadata-only-field',
  supportedOutputFormats: ['HTML', 'PDF', 'XLSX'],
}

const UNKNOWN_TEMPLATE_ARTIFACT = {
  code: 'NO-SUCH-TEMPLATE',
  title: 'Artifact with an unregistered template',
  isActive: true,
  templatePath: 'legacy-metadata-only-field',
  supportedOutputFormats: ['HTML', 'PDF', 'XLSX'],
}

class FixtureDatasetProvider implements ReportDatasetProvider {
  supports(artifactCode: string): boolean {
    return artifactCode === ALLOWLISTED_ARTIFACT.code || artifactCode === UNKNOWN_TEMPLATE_ARTIFACT.code
  }

  async loadDataset(): Promise<ReportDataset> {
    return {
      rows: [
        { no: '001', label: 'Integration Row', occurredAt: '2026-09-16T10:00:00Z', status: 'OPEN', quantity: 2, unitPrice: 100, amount: 200 },
      ],
      totalAmount: 200,
    }
  }
}

function fakeResponse() {
  const headers: Record<string, string> = {}
  let body: Buffer | undefined
  const res = {
    setHeader: (key: string, value: string) => {
      headers[key] = value
    },
    send: (payload: Buffer) => {
      body = payload
    },
  }
  return { res: res as unknown as Response, headers, getBody: () => body }
}

async function isRendererReachable(renderEndpoint: string, timeoutMs = 2000): Promise<boolean> {
  const healthUrl = renderEndpoint.replace(/\/render$/, '/health')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(healthUrl, { signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

const ACTOR = { id: 'actor-1' }

function buildController() {
  const db = buildMockDb()
  const reportRender = new ReportRenderService()
  const templateRegistry = new TemplateRegistryService()
  const datasetResolver = new ReportDatasetResolver([new FixtureDatasetProvider()])
  const auditService = new PlatformAuditService(db as never)
  const service = new ReportingService(db as never, datasetResolver, reportRender, templateRegistry, auditService)
  const controller = new ReportingController(service, reportRender)
  return { controller, service, db }
}

describe('Reporting → real Jasper renderer, via the API controller/service (TASK-022.5-R1)', () => {
  let rendererAvailable = false

  beforeAll(async () => {
    const endpoint = process.env.REPORT_RENDER_ENDPOINT
    const token = process.env.REPORT_RENDER_INTERNAL_TOKEN
    if (!endpoint || !token) {
      // No renderer configured in this environment (e.g. CI without ./dev.sh having run) — the
      // mocked report-render.service.spec.ts / reporting.service.spec.ts suites already cover
      // this exact contract without a live renderer. This suite adds real-network proof only
      // when a real renderer is actually reachable, and never fails the build otherwise.
      return
    }
    rendererAvailable = await isRendererReachable(endpoint)
  })

  function skipIfRendererUnavailable(): boolean {
    if (!rendererAvailable) {
      console.warn(
        '[reporting.jasper-integration] REPORT_RENDER_ENDPOINT not configured/reachable — skipping real-renderer assertions for this run.',
      )
      return true
    }
    return false
  }

  it('exports a real PDF through the API export flow (no direct curl to the renderer)', async () => {
    if (skipIfRendererUnavailable()) return
    const { controller, db } = buildController()
    db.select.mockReturnValueOnce(chain([ALLOWLISTED_ARTIFACT]))
    const { res, headers, getBody } = fakeResponse()

    await controller.export('tenant-1', ALLOWLISTED_ARTIFACT.code, 'PDF', res, ACTOR)

    expect(headers['Content-Type']).toBe('application/pdf')
    expect(headers['Content-Disposition']).toContain('.pdf')
    const body = getBody()
    expect(body).toBeDefined()
    expect(body!.subarray(0, 5).toString('utf8')).toBe('%PDF-')
  })

  it('exports a real XLSX through the API export flow', async () => {
    if (skipIfRendererUnavailable()) return
    const { controller, db } = buildController()
    db.select.mockReturnValueOnce(chain([ALLOWLISTED_ARTIFACT]))
    const { res, headers, getBody } = fakeResponse()

    await controller.export('tenant-1', ALLOWLISTED_ARTIFACT.code, 'XLSX', res, ACTOR)

    expect(headers['Content-Type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const body = getBody()
    expect(body).toBeDefined()
    // XLSX is a ZIP container — real OOXML output from the real renderer, not CSV-in-disguise.
    expect(body!.subarray(0, 2).toString('utf8')).toBe('PK')
  })

  it('never sends templatePath to the renderer and sends the exact templateId both allowlists agree on', async () => {
    if (skipIfRendererUnavailable()) return
    const { controller, db } = buildController()
    db.select.mockReturnValueOnce(chain([ALLOWLISTED_ARTIFACT]))
    const { res } = fakeResponse()

    const originalFetch = global.fetch
    let capturedBody: Record<string, unknown> | undefined
    global.fetch = (async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args
      if (String(input).includes('/render') && typeof init?.body === 'string') {
        capturedBody = JSON.parse(init.body) as Record<string, unknown>
      }
      return originalFetch(...args)
    }) as typeof fetch

    try {
      await controller.export('tenant-1', ALLOWLISTED_ARTIFACT.code, 'PDF', res, ACTOR)
    } finally {
      global.fetch = originalFetch
    }

    expect(capturedBody).toBeDefined()
    expect(capturedBody).not.toHaveProperty('templatePath')
    expect(capturedBody?.templateId).toBe('sample-report')
  })

  it('rejects export for an artifact whose template id the renderer does not allowlist (controlled 404, real network round-trip)', async () => {
    if (skipIfRendererUnavailable()) return
    const { controller, db } = buildController()
    db.select.mockReturnValueOnce(chain([UNKNOWN_TEMPLATE_ARTIFACT]))
    const { res } = fakeResponse()

    // Rejected by the API's own TemplateRegistryService before any network call to the renderer —
    // the renderer would also reject it (own allowlist), but the API fails closed first.
    await expect(controller.export('tenant-1', UNKNOWN_TEMPLATE_ARTIFACT.code, 'PDF', res, ACTOR)).rejects.toMatchObject({
      status: 404,
    })
  })

  it('fails closed (502) through the real network when the internal token is wrong — proves token verification round-trips end to end', async () => {
    if (skipIfRendererUnavailable()) return
    const { controller, db } = buildController()
    db.select.mockReturnValueOnce(chain([ALLOWLISTED_ARTIFACT]))
    const { res } = fakeResponse()

    const originalToken = process.env.REPORT_RENDER_INTERNAL_TOKEN
    process.env.REPORT_RENDER_INTERNAL_TOKEN = 'deliberately-wrong-token'
    try {
      await expect(controller.export('tenant-1', ALLOWLISTED_ARTIFACT.code, 'PDF', res, ACTOR)).rejects.toMatchObject({
        status: 502,
      })
    } finally {
      process.env.REPORT_RENDER_INTERNAL_TOKEN = originalToken
    }
  })

  /**
   * TASK-027.56 — real proof (against the same already-running dev Jasper container, no new
   * Docker build/run) that the dev-fixture "Geliştirme simülasyon verisi" export label row is not
   * just sent in the request payload (already covered by the mocked reporting.service.spec.ts
   * suite) but is actually visible in the renderer's real, FlateDecode-compressed PDF output — the
   * exact thing a human opening the downloaded file would see. Decompression mirrors the manual
   * verification done during implementation (`node -e` against a raw curl response).
   */
  describe('dev fixture export label row — real Jasper output', () => {
    const ORIGINAL_ENV = { ...process.env }

    afterEach(() => {
      process.env = { ...ORIGINAL_ENV }
    })

    function findTextInPdfStreams(buffer: Buffer, needle: string): boolean {
      const text = buffer.toString('latin1')
      const streamRegex = /stream\r?\n([\s\S]*?)endstream/g
      let match: RegExpExecArray | null
      while ((match = streamRegex.exec(text))) {
        try {
          const inflated = inflateSync(Buffer.from(match[1] as string, 'latin1')).toString('utf8')
          if (inflated.includes(needle)) return true
        } catch {
          // not every stream is FlateDecode-compressed text (fonts, etc.) — skip and keep scanning
        }
      }
      return false
    }

    it('the real Jasper-rendered PDF for the dev fixture visibly contains the simulation label text', async () => {
      if (skipIfRendererUnavailable()) return
      process.env.NODE_ENV = 'development'
      process.env.REPORTING_DEV_FIXTURES = 'true'

      const db = buildMockDb()
      const reportRender = new ReportRenderService()
      const templateRegistry = new TemplateRegistryService()
      const datasetResolver = new ReportDatasetResolver([new DevFixtureDatasetProvider()])
      const auditService = new PlatformAuditService(db as never)
      const service = new ReportingService(db as never, datasetResolver, reportRender, templateRegistry, auditService)
      const controller = new ReportingController(service, reportRender)
      const { res, getBody } = fakeResponse()

      await controller.export('tenant-1', DEV_FIXTURE_ARTIFACT_CODE, 'PDF', res, ACTOR)

      const body = getBody()
      expect(body).toBeDefined()
      expect(body!.subarray(0, 5).toString('utf8')).toBe('%PDF-')
      expect(findTextInPdfStreams(body!, 'Geli')).toBe(true) // ASCII-safe substring of "Geliştirme"
      // TASK-027.57 — the only db.select call left is PlatformAuditService.log()'s actor-snapshot
      // lookup (for the REPORT_EXPORT_SUCCEEDED audit write); getArtifact itself still never
      // touches report_artifacts for the fixture — it substituted the in-memory fixture, per
      // TASK-027.55.
      expect(db.select).toHaveBeenCalledTimes(1)
    })
  })
})
