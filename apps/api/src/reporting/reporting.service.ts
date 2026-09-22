import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { Response } from 'express'
import { DB, type Db } from '../db/db.module'
import { reportArtifacts } from '../db/schema'
import { ReportDatasetResolver } from './dataset/report-dataset.resolver'
import { buildReportFileName, getDefaultReportContentType, type ReportOutputFormat } from './report-output.util'
import { ReportRenderService } from './report-render.service'
import { TemplateRegistryService } from './templates/template-registry'
import { buildSimpleXlsx } from './xlsx-writer'

export type { ReportOutputFormat } from './report-output.util'

const RENDERABLE_FORMATS: ReadonlyArray<Exclude<ReportOutputFormat, 'HTML'>> = ['PDF', 'XLSX']

export interface ReportFilters {
  q?: string
  status?: string
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildSimplePdf(title: string, lines: string[]) {
  const bodyText = [title, '', ...lines].join('\\n').replace(/[()\\]/g, '')
  const stream = `BT /F1 12 Tf 50 780 Td (${bodyText}) Tj ET`
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
  ]
  const chunks = ['%PDF-1.4\n']
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(chunks.join('')))
    chunks.push(`${object}\n`)
  }
  const xrefAt = Buffer.byteLength(chunks.join(''))
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`)
  for (let i = 1; i <= objects.length; i += 1) {
    chunks.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  }
  chunks.push(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`)
  return Buffer.from(chunks.join(''), 'utf8')
}

@Injectable()
export class ReportingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly datasetResolver: ReportDatasetResolver,
    private readonly reportRender: ReportRenderService,
    private readonly templateRegistry: TemplateRegistryService,
  ) {}

  async listArtifacts(_tenantId: string) {
    const rows = await this.db
      .select()
      .from(reportArtifacts)
      .where(eq(reportArtifacts.isActive, true))
      .orderBy(reportArtifacts.moduleKey, reportArtifacts.title)

    return { artifacts: rows }
  }

  async getArtifact(_tenantId: string, code: string) {
    const [artifact] = await this.db
      .select()
      .from(reportArtifacts)
      .where(eq(reportArtifacts.code, code))
      .limit(1)
    if (!artifact || !artifact.isActive) throw new NotFoundException('Report artifact bulunamadı')

    return artifact
  }

  async renderHtml(tenantId: string, artifactCode: string, filters: ReportFilters) {
    const artifact = await this.getArtifact(tenantId, artifactCode)
    const provider = this.datasetResolver.resolve(artifact.code)
    const dataset = await provider.loadDataset(tenantId, filters)
    const renderedAt = new Date().toLocaleString('tr-TR')

    const tableRows = dataset.rows
      .map(
        row => `<tr>
          <td>${escapeHtml(row.no)}</td>
          <td>${escapeHtml(row.label)}</td>
          <td>${new Date(row.occurredAt).toLocaleDateString('tr-TR')}</td>
          <td>${escapeHtml(row.status)}</td>
          <td class="num">${row.quantity.toLocaleString('tr-TR')}</td>
          <td class="num">${row.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
          <td class="num">${row.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
        </tr>`,
      )
      .join('')

    const html = `<style>
      .report-root{font-family:Inter,Arial,sans-serif;color:#172033}
      .report-meta{display:flex;gap:16px;color:#64748b;font-size:12px;margin:8px 0 18px}
      .report-table{width:100%;border-collapse:collapse;font-size:12px}
      .report-table th{background:#f8fafc;color:#475569;text-align:left;padding:8px;border-bottom:1px solid #d8dee8}
      .report-table td{padding:8px;border-bottom:1px solid #eef2f7}
      .report-table .num{text-align:right;font-variant-numeric:tabular-nums}
      .report-total{margin-top:14px;text-align:right;font-weight:700}
    </style>
    <div class="report-root">
      <h2>${escapeHtml(artifact.title)}</h2>
      <div class="report-meta">
        <span>Kayıt: ${dataset.rows.length.toLocaleString('tr-TR')}</span>
        <span>Oluşturma: ${renderedAt}</span>
        <span>Preview: HTML</span>
      </div>
      <table class="report-table">
        <thead><tr><th>No</th><th>Definition</th><th>Tarih</th><th>Durum</th><th>Miktar</th><th>Birim</th><th>Toplam</th></tr></thead>
        <tbody>${tableRows || '<tr><td colspan="7">Sonuç bulunamadı.</td></tr>'}</tbody>
      </table>
      <div class="report-total">Genel toplam: ${dataset.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
    </div>`

    return { artifact, html, rowCount: dataset.rows.length, totalAmount: dataset.totalAmount }
  }

  async exportReport(tenantId: string, artifactCode: string, format: Exclude<ReportOutputFormat, 'HTML'>, filters: ReportFilters) {
    // format ultimately comes from a route param — the TS union type is not runtime-enforced by
    // the framework, so an unrecognized value must be rejected explicitly, not passed through.
    if (!RENDERABLE_FORMATS.includes(format)) {
      throw new BadRequestException(`Desteklenmeyen format: ${format}`)
    }

    const artifact = await this.getArtifact(tenantId, artifactCode)
    const provider = this.datasetResolver.resolve(artifact.code)
    if (!artifact.supportedOutputFormats.includes(format)) {
      throw new BadRequestException(`${format} formatı bu artifact için desteklenmiyor`)
    }

    // artifact.templatePath is a legacy free-text DB column — its literal value is never sent
    // anywhere. Its presence only means "this artifact needs a renderer template"; the actual
    // template is looked up by the artifact's own code through the allowlisted registry.
    let templateId: string | null = null
    if (artifact.templatePath) {
      templateId = artifact.code.toLowerCase()
      this.templateRegistry.resolve(templateId)
    }

    const dataset = await provider.loadDataset(tenantId, filters)

    if (this.reportRender.isConfigured()) {
      return this.reportRender.render({
        artifactCode: artifact.code,
        templateId,
        format,
        rows: dataset.rows,
      })
    }

    if (format === 'PDF') {
      const lines = dataset.rows.map(row => `${row.no} ${row.status} ${row.amount}`)
      return {
        buffer: buildSimplePdf(artifact.title, lines),
        contentType: getDefaultReportContentType('PDF'),
        fileName: buildReportFileName(artifact.code, 'PDF'),
      }
    }

    const header = ['No', 'Definition', 'Tarih', 'Durum', 'Miktar', 'Birim', 'Toplam']
    const body = dataset.rows.map(row => [
      row.no,
      row.label,
      new Date(row.occurredAt).toLocaleDateString('tr-TR'),
      row.status,
      row.quantity,
      row.unitPrice,
      row.amount,
    ])
    return {
      buffer: buildSimpleXlsx(header, body),
      contentType: getDefaultReportContentType('XLSX'),
      fileName: buildReportFileName(artifact.code, 'XLSX'),
    }
  }

  writeDownload(res: Response, payload: { buffer: Buffer; contentType: string; fileName: string }) {
    res.setHeader('Content-Type', payload.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${payload.fileName}"`)
    res.send(payload.buffer)
  }
}
