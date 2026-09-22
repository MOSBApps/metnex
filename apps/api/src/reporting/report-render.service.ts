import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common'
import { buildReportFileName, getDefaultReportContentType, type RenderableReportFormat } from './report-output.util'

export interface ReportRenderInput {
  artifactCode: string
  /** Safe allowlisted slug (see TemplateRegistryService) — never a filesystem path. */
  templateId: string | null
  format: RenderableReportFormat
  rows: unknown[]
}

export interface ReportRenderResult {
  buffer: Buffer
  contentType: string
  fileName: string
}

export interface ReportRendererHealth {
  status: 'CONFIGURED' | 'FALLBACK'
  backendMode: 'jasper-http' | 'in-process-fallback'
  timeoutMs: number
  tokenConfigured: boolean
}

const DEFAULT_TIMEOUT_MS = 15000
const MAX_RENDER_ROWS = 5000
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024

/**
 * Adapter around the external Jasper HTTP renderer. Callers (e.g. ReportingService)
 * must not talk to REPORT_RENDER_ENDPOINT directly — this is the single seam.
 */
@Injectable()
export class ReportRenderService {
  isConfigured(): boolean {
    return !!process.env.REPORT_RENDER_ENDPOINT
  }

  private getTimeoutMs(): number {
    return Number(process.env.REPORT_RENDER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  }

  getHealth(): ReportRendererHealth {
    const configured = this.isConfigured()
    return {
      status: configured ? 'CONFIGURED' : 'FALLBACK',
      backendMode: configured ? 'jasper-http' : 'in-process-fallback',
      timeoutMs: this.getTimeoutMs(),
      tokenConfigured: !!process.env.REPORT_RENDER_INTERNAL_TOKEN,
    }
  }

  async render(input: ReportRenderInput): Promise<ReportRenderResult> {
    const endpoint = process.env.REPORT_RENDER_ENDPOINT
    if (!endpoint) {
      throw new BadGatewayException('Report render endpoint yapılandırılmamış')
    }

    // REPORT_RENDER_INTERNAL_TOKEN is a mandatory deployment secret once an endpoint is
    // configured — an internal renderer must never be called unauthenticated.
    const token = process.env.REPORT_RENDER_INTERNAL_TOKEN
    if (!token) {
      throw new BadGatewayException('REPORT_RENDER_INTERNAL_TOKEN yapılandırılmamış — internal renderer için zorunlu')
    }

    if (input.rows.length > MAX_RENDER_ROWS) {
      throw new BadRequestException(`Render payload çok büyük: satır sayısı ${MAX_RENDER_ROWS} sınırını aşıyor`)
    }

    const body = JSON.stringify({
      artifactCode: input.artifactCode,
      templateId: input.templateId,
      format: input.format,
      rows: input.rows,
    })

    if (Buffer.byteLength(body, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new BadRequestException(`Render payload çok büyük: ${MAX_PAYLOAD_BYTES} byte sınırını aşıyor`)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.getTimeoutMs())

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body,
      })

      if (!response.ok) {
        throw new BadGatewayException(`Renderer hata döndürdü: ${response.status}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      const contentType = response.headers.get('content-type') ?? getDefaultReportContentType(input.format)

      return {
        buffer,
        contentType,
        fileName: buildReportFileName(input.artifactCode, input.format),
      }
    } catch (error) {
      if (error instanceof BadGatewayException) throw error
      throw new BadGatewayException('Renderer servisine erişilemedi')
    } finally {
      clearTimeout(timer)
    }
  }
}
