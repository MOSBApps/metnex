import { BadGatewayException, BadRequestException } from '@nestjs/common'
import { ReportRenderService } from './report-render.service'

const ORIGINAL_ENV = { ...process.env }

function resetEnv() {
  process.env = { ...ORIGINAL_ENV }
  delete process.env.REPORT_RENDER_ENDPOINT
  delete process.env.REPORT_RENDER_INTERNAL_TOKEN
  delete process.env.REPORT_RENDER_TIMEOUT_MS
}

describe('ReportRenderService', () => {
  beforeEach(resetEnv)
  afterEach(() => {
    resetEnv()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  describe('isConfigured / getHealth', () => {
    it('reports FALLBACK when no renderer endpoint is configured', () => {
      const service = new ReportRenderService()

      expect(service.isConfigured()).toBe(false)
      expect(service.getHealth()).toEqual({
        status: 'FALLBACK',
        backendMode: 'in-process-fallback',
        timeoutMs: 15000,
        tokenConfigured: false,
      })
    })

    it('reports CONFIGURED with timeout/token details when an endpoint is set', () => {
      process.env.REPORT_RENDER_ENDPOINT = 'http://renderer.internal/render'
      process.env.REPORT_RENDER_INTERNAL_TOKEN = 'secret-token'
      process.env.REPORT_RENDER_TIMEOUT_MS = '5000'
      const service = new ReportRenderService()

      expect(service.isConfigured()).toBe(true)
      expect(service.getHealth()).toEqual({
        status: 'CONFIGURED',
        backendMode: 'jasper-http',
        timeoutMs: 5000,
        tokenConfigured: true,
      })
    })
  })

  describe('render', () => {
    beforeEach(() => {
      process.env.REPORT_RENDER_ENDPOINT = 'http://renderer.internal/render'
      process.env.REPORT_RENDER_INTERNAL_TOKEN = 'secret-token'
    })

    it('throws BadGatewayException when no renderer endpoint is configured', async () => {
      delete process.env.REPORT_RENDER_ENDPOINT
      const service = new ReportRenderService()

      await expect(
        service.render({ artifactCode: 'SAMPLE_REPORT', templateId: null, format: 'PDF', rows: [] }),
      ).rejects.toBeInstanceOf(BadGatewayException)
    })

    it('fails closed with BadGatewayException when REPORT_RENDER_INTERNAL_TOKEN is not configured (mandatory deployment secret)', async () => {
      delete process.env.REPORT_RENDER_INTERNAL_TOKEN
      const fetchMock = jest.fn()
      ;(global as { fetch: typeof fetch }).fetch = fetchMock as never
      const service = new ReportRenderService()

      await expect(
        service.render({ artifactCode: 'SAMPLE_REPORT', templateId: null, format: 'PDF', rows: [] }),
      ).rejects.toBeInstanceOf(BadGatewayException)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('sends an Authorization Bearer header with the internal token', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/pdf' },
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      })
      ;(global as { fetch: typeof fetch }).fetch = fetchMock as never
      const service = new ReportRenderService()

      await service.render({ artifactCode: 'SAMPLE_REPORT', templateId: null, format: 'PDF', rows: [] })

      expect(fetchMock).toHaveBeenCalledWith(
        'http://renderer.internal/render',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
        }),
      )
    })

    it('sends templateId in the request body, never a filesystem path', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/pdf' },
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      })
      ;(global as { fetch: typeof fetch }).fetch = fetchMock as never
      const service = new ReportRenderService()

      await service.render({ artifactCode: 'SAMPLE_REPORT', templateId: 'sales-report', format: 'PDF', rows: [] })

      const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
      const parsedBody = JSON.parse(init.body) as Record<string, unknown>
      expect(parsedBody).toEqual({ artifactCode: 'SAMPLE_REPORT', templateId: 'sales-report', format: 'PDF', rows: [] })
      expect(parsedBody).not.toHaveProperty('templatePath')
    })

    it('rejects an oversized row payload before ever calling the renderer', async () => {
      const fetchMock = jest.fn()
      ;(global as { fetch: typeof fetch }).fetch = fetchMock as never
      const service = new ReportRenderService()

      const rows = Array.from({ length: 5001 }, (_, i) => ({ i }))

      await expect(
        service.render({ artifactCode: 'SAMPLE_REPORT', templateId: null, format: 'PDF', rows }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects an oversized serialized payload before ever calling the renderer', async () => {
      const fetchMock = jest.fn()
      ;(global as { fetch: typeof fetch }).fetch = fetchMock as never
      const service = new ReportRenderService()

      const hugeValue = 'x'.repeat(11 * 1024 * 1024)
      const rows = [{ hugeValue }]

      await expect(
        service.render({ artifactCode: 'SAMPLE_REPORT', templateId: null, format: 'PDF', rows }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('produces a controlled BadGatewayException on a non-ok HTTP response (4xx/5xx)', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 502 })
      ;(global as { fetch: typeof fetch }).fetch = fetchMock as never
      const service = new ReportRenderService()

      await expect(
        service.render({ artifactCode: 'SAMPLE_REPORT', templateId: null, format: 'PDF', rows: [] }),
      ).rejects.toBeInstanceOf(BadGatewayException)
    })

    it('fails closed (BadGatewayException, no silent fallback) when the renderer connection fails', async () => {
      ;(global as { fetch: typeof fetch }).fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as never
      const service = new ReportRenderService()

      await expect(
        service.render({ artifactCode: 'SAMPLE_REPORT', templateId: null, format: 'PDF', rows: [] }),
      ).rejects.toBeInstanceOf(BadGatewayException)
    })

    it('aborts the request via AbortController once REPORT_RENDER_TIMEOUT_MS elapses', async () => {
      process.env.REPORT_RENDER_TIMEOUT_MS = '100'
      jest.useFakeTimers()

      const fetchMock = jest.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
      })
      ;(global as { fetch: typeof fetch }).fetch = fetchMock as never
      const service = new ReportRenderService()

      const promise = service.render({
        artifactCode: 'SAMPLE_REPORT',
        templateId: null,
        format: 'PDF',
        rows: [],
      })
      const assertion = expect(promise).rejects.toBeInstanceOf(BadGatewayException)

      await jest.advanceTimersByTimeAsync(150)
      await assertion

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('falls back to a centralized default content type/filename when the renderer omits content-type', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
      })
      ;(global as { fetch: typeof fetch }).fetch = fetchMock as never
      const service = new ReportRenderService()

      const result = await service.render({
        artifactCode: 'SAMPLE_REPORT',
        templateId: null,
        format: 'XLSX',
        rows: [],
      })

      expect(result.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      expect(result.fileName).toBe('sample_report.xlsx')
    })

    it('uses the renderer-provided content-type when present', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/custom-pdf' },
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      })
      ;(global as { fetch: typeof fetch }).fetch = fetchMock as never
      const service = new ReportRenderService()

      const result = await service.render({
        artifactCode: 'SAMPLE_REPORT',
        templateId: null,
        format: 'PDF',
        rows: [],
      })

      expect(result.contentType).toBe('application/custom-pdf')
    })
  })
})
