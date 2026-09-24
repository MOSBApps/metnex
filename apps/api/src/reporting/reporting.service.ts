import { BadGatewayException, BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { Response } from 'express'
import { PlatformAuditService } from '../audit/platform-audit.service'
import { DB, type Db } from '../db/db.module'
import { reportArtifacts } from '../db/schema'
import {
  buildDevFixtureExportLabelRow,
  DEV_FIXTURE_ARTIFACT,
  DEV_FIXTURE_ARTIFACT_CODE,
  isDevFixtureEnabled,
} from './dataset/dev-fixture-dataset.provider'
import type { ReportDatasetRow } from './dataset/report-dataset.contract'
import { ReportDatasetResolver } from './dataset/report-dataset.resolver'
import { ScadaCsvFixtureProvider } from './scada/fixture/scada-csv-fixture.provider'
import { SCADA_FIXTURE_ARTIFACT_CODE, buildScadaFixtureArtifact, scadaFixtureArtifactRow } from './scada/fixture/scada-fixture-artifact'
import { buildReportFileName, getDefaultReportContentType, type ReportOutputFormat } from './report-output.util'
import { ReportRenderService } from './report-render.service'
import { TemplateRegistryService } from './templates/template-registry'
import { buildSimplePdf } from './pdf-fallback'
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

/**
 * TASK-027.57 — a static, safe reason code for `REPORT_EXPORT_FAILED` audit metadata. The raw
 * exception message (which for `ReportRenderService` failures is already static/non-secret, but
 * this must not rely on that staying true forever) never reaches audit metadata — only one of
 * these fixed buckets does. `ReportRenderService.render()` itself already collapses timeout,
 * abort, connection failure and non-2xx renderer responses into `BadGatewayException` variants;
 * this classifies those (and anything else) into a small, stable set.
 */
function classifyExportFailureReason(error: unknown): string {
  if (error instanceof BadGatewayException) {
    const message = error.message
    if (message.includes('yapılandırılmamış')) return 'RENDERER_NOT_CONFIGURED'
    if (message.includes('hata döndürdü')) return 'RENDERER_HTTP_ERROR'
    if (message.includes('erişilemedi')) return 'RENDERER_UNREACHABLE'
    return 'RENDERER_ERROR'
  }
  if (error instanceof BadRequestException) return 'INVALID_REQUEST'
  return 'EXPORT_FAILED'
}

@Injectable()
export class ReportingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly datasetResolver: ReportDatasetResolver,
    private readonly reportRender: ReportRenderService,
    private readonly templateRegistry: TemplateRegistryService,
    private readonly auditService: PlatformAuditService,
  ) {}

  async listArtifacts(_tenantId: string) {
    const rows = await this.db
      .select()
      .from(reportArtifacts)
      .where(eq(reportArtifacts.isActive, true))
      .orderBy(reportArtifacts.moduleKey, reportArtifacts.title)

    // TASK-027.55 — an in-memory-only entry, never written to report_artifacts, appended when both
    // NODE_ENV=development and REPORTING_DEV_FIXTURES=true. isDevFixtureEnabled() is re-evaluated
    // on every call (not cached at boot), so this can never appear outside that exact env state.
    // TASK-027.73-R1 — the development CSV snapshot artifact, in memory only, present ONLY while the same flag is on.
    const scadaFixture = buildScadaFixtureArtifact(process.env, new ScadaCsvFixtureProvider())
    const artifacts = isDevFixtureEnabled() ? [DEV_FIXTURE_ARTIFACT, ...(scadaFixture ? [scadaFixtureArtifactRow(scadaFixture)] : []), ...rows] : rows
    return { artifacts }
  }

  async getArtifact(_tenantId: string, code: string) {
    if (isDevFixtureEnabled() && code === DEV_FIXTURE_ARTIFACT_CODE) return DEV_FIXTURE_ARTIFACT
    if (code === SCADA_FIXTURE_ARTIFACT_CODE) {
      const scadaFixture = buildScadaFixtureArtifact(process.env)
      if (scadaFixture) return scadaFixtureArtifactRow(scadaFixture) as unknown as typeof DEV_FIXTURE_ARTIFACT
    }

    const [artifact] = await this.db
      .select()
      .from(reportArtifacts)
      .where(eq(reportArtifacts.code, code))
      .limit(1)
    if (!artifact || !artifact.isActive) throw new NotFoundException('Report artifact bulunamadı')

    return artifact
  }

  /**
   * TASK-027.54 — structured JSON for the web analysis screen (chart + sortable/paginated table).
   * Shares the exact same artifact/provider/dataset resolution `renderHtml` uses, minus the HTML
   * string it builds — `render`/`export` are untouched, this is a new, read-only, additive
   * endpoint (REPORT:ARTIFACT:VIEW, same as render).
   */
  async loadData(tenantId: string, artifactCode: string, filters: ReportFilters) {
    const artifact = await this.getArtifact(tenantId, artifactCode)
    const provider = this.datasetResolver.resolve(artifact.code)
    const dataset = await provider.loadDataset(tenantId, filters)
    return { artifact, rows: dataset.rows, totalAmount: dataset.totalAmount }
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

  /**
   * TASK-027.57 — `actorId` (from the controller's `@CurrentUser()`, i.e. the JWT-validated,
   * DB-re-read session actor — never trusted from the request body) is purely for the audit trail
   * added here; it changes nothing about authorization (`REPORT:ARTIFACT:EXPORT`, enforced by
   * `PermissionGuard` before this method is ever reached — see that guard's own denial-audit for
   * the reject-before-provider-or-render half of this task).
   */
  async exportReport(tenantId: string, artifactCode: string, format: Exclude<ReportOutputFormat, 'HTML'>, filters: ReportFilters, actorId: string) {
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
    // TASK-027.56 — a visible marker row, dev-fixture-only, applies to both the Jasper path and
    // the fallback path below (both simply iterate `rows`) — see buildDevFixtureExportLabelRow's
    // own doc comment for why this is the only in-scope way to make the label show up in the
    // actual exported bytes without touching the JRXML template or renderer code.
    const isFixture = isDevFixtureEnabled() && artifact.code === DEV_FIXTURE_ARTIFACT_CODE
    const rows = isFixture ? [buildDevFixtureExportLabelRow(), ...dataset.rows] : dataset.rows

    const rendererMode = this.reportRender.isConfigured() ? 'JASPER' : 'FALLBACK'

    try {
      const result = await this.renderExport(artifact, templateId, format, rows)
      // TASK-027.57 — success is audited only after the file bytes actually exist; never before
      // (that would risk logging a "success" the renderer/fallback hadn't actually produced yet).
      await this.writeExportAudit({
        actorId,
        tenantId,
        artifactCode: artifact.code,
        format,
        result: 'SUCCEEDED',
        reasonCode: 'OK',
        rendererMode,
        isFixture,
      })
      return result
    } catch (error) {
      await this.writeExportAudit({
        actorId,
        tenantId,
        artifactCode: artifact.code,
        format,
        result: 'FAILED',
        reasonCode: classifyExportFailureReason(error),
        rendererMode,
        isFixture,
      })
      throw error // never swallowed into a fake success — the original error (e.g. the renderer's
      // own BadGatewayException) reaches the controller/client unchanged.
    }
  }

  private async renderExport(
    artifact: { code: string; title: string },
    templateId: string | null,
    format: Exclude<ReportOutputFormat, 'HTML'>,
    rows: ReportDatasetRow[],
  ) {
    if (this.reportRender.isConfigured()) {
      return this.reportRender.render({
        artifactCode: artifact.code,
        templateId,
        format,
        rows,
      })
    }

    if (format === 'PDF') {
      const lines = rows.map(row => `${row.no} ${row.label} ${row.status} ${row.amount}`)
      return {
        buffer: buildSimplePdf(artifact.title, lines),
        contentType: getDefaultReportContentType('PDF'),
        fileName: buildReportFileName(artifact.code, 'PDF'),
      }
    }

    const header = ['No', 'Definition', 'Tarih', 'Durum', 'Miktar', 'Birim', 'Toplam']
    const body = rows.map(row => [
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

  // Best-effort: an audit-write failure must never turn a real success into a failure, and must
  // never mask a real failure either — see the try/catch in exportReport, which always re-throws
  // the original render/fallback error regardless of whether this write itself succeeds.
  private async writeExportAudit(input: {
    actorId: string
    tenantId: string
    artifactCode: string
    format: Exclude<ReportOutputFormat, 'HTML'>
    result: 'SUCCEEDED' | 'FAILED'
    reasonCode: string
    rendererMode: 'JASPER' | 'FALLBACK'
    isFixture: boolean
  }): Promise<void> {
    try {
      await this.auditService.log({
        actorId: input.actorId,
        actionCode: input.result === 'SUCCEEDED' ? 'REPORT_EXPORT_SUCCEEDED' : 'REPORT_EXPORT_FAILED',
        entityType: 'ReportArtifact',
        entityId: input.artifactCode,
        summary: `Export ${input.result === 'SUCCEEDED' ? 'tamamlandı' : 'başarısız oldu'}: ${input.artifactCode} (${input.format})`,
        metadata: {
          tenantId: input.tenantId,
          artifactCode: input.artifactCode,
          format: input.format,
          result: input.result,
          reasonCode: input.reasonCode,
          rendererMode: input.rendererMode,
          // TASK-027.57 — the key itself only ever appears when true; isDevFixtureEnabled() can
          // never be true in production (TASK-027.55's env gate), so this key structurally cannot
          // reach a production audit row, not just "usually" won't.
          ...(input.isFixture ? { simulation: true } : {}),
        },
      })
    } catch {
      // logged inside PlatformAuditService already; nothing else to do here
    }
  }

  writeDownload(res: Response, payload: { buffer: Buffer; contentType: string; fileName: string }) {
    res.setHeader('Content-Type', payload.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${payload.fileName}"`)
    res.send(payload.buffer)
  }
}
