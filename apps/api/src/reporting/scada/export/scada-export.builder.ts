import { buildSimplePdf } from '../../pdf-fallback'
import { SCADA_ANALYSIS_TEMPLATE_ID, type ScadaExportFile, type ScadaExportFormat, type ScadaExportModel, type ScadaExportRendererMode, type ScadaExportRendererPort } from './scada-export.contract'
import { buildScadaCsv } from './scada-export.csv'
import { buildScadaPdfRows, scadaPdfFallbackLines } from './scada-export.pdf'
import { buildScadaXlsx } from './scada-export.xlsx'
import { safeFileSegment } from './spreadsheet-safe'

export const CONTENT_TYPES = {
  CSV: 'text/csv; charset=utf-8',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  PDF: 'application/pdf',
} as const

export function exportFileName(artifactCode: string, format: ScadaExportFormat, generatedAt: string): string {
  return `scada_${safeFileSegment(artifactCode)}_${generatedAt.slice(0, 10)}.${format.toLowerCase()}`
}

export class ScadaExportRenderError extends Error {
  constructor(readonly kind: 'RENDER_FAILED' | 'TOO_LARGE') {
    super(kind) // static: the renderer's own text never travels
    this.name = 'ScadaExportRenderError'
  }
}

/** CSV / XLSX are built in-process; PDF goes through the EXISTING Jasper renderer seam (the built-in fallback only when it is not configured). */
export async function buildExportFile(format: 'CSV' | 'XLSX' | 'PDF', model: ScadaExportModel, renderer: ScadaExportRendererPort | undefined): Promise<{ file: ScadaExportFile; rendererMode: ScadaExportRendererMode; rowCount: number }> {
  const fileName = exportFileName(model.artifactCode, format, model.generatedAt)
  if (format === 'CSV') return { file: { kind: 'FILE', buffer: buildScadaCsv(model), contentType: CONTENT_TYPES.CSV, fileName }, rendererMode: 'NONE', rowCount: 0 }
  if (format === 'XLSX') return { file: { kind: 'FILE', buffer: buildScadaXlsx(model), contentType: CONTENT_TYPES.XLSX, fileName }, rendererMode: 'NONE', rowCount: 0 }
  const rows = buildScadaPdfRows(model)
  if (renderer && renderer.isConfigured()) {
    try {
      const out = await renderer.render({ artifactCode: model.artifactCode, templateId: SCADA_ANALYSIS_TEMPLATE_ID, format: 'PDF', rows })
      return { file: { kind: 'FILE', buffer: out.buffer, contentType: CONTENT_TYPES.PDF, fileName }, rendererMode: 'JASPER', rowCount: rows.length }
    } catch (error) {
      const status = typeof (error as { getStatus?: unknown })?.getStatus === 'function' ? (error as { getStatus: () => number }).getStatus() : 0
      throw new ScadaExportRenderError(status === 400 ? 'TOO_LARGE' : 'RENDER_FAILED')
    }
  }
  return { file: { kind: 'FILE', buffer: buildSimplePdf(model.title, scadaPdfFallbackLines(rows)), contentType: CONTENT_TYPES.PDF, fileName }, rendererMode: 'FALLBACK', rowCount: rows.length }
}
