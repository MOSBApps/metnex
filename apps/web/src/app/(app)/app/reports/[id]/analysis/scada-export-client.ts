import { ApiError, tenantApiDownloadPost, tenantApiPost } from '@/lib/api'
import type { ProjectedAnalysis, ProjectedComparison } from './scada-analysis.types'

/**
 * TASK-027.74 — client side of the SCADA analysis export. The screen sends the SAME request it used for the analysis (never rows,
 * never a tenant / actor); the server re-runs it, checks REPORT:ARTIFACT:EXPORT, audits, and answers a file (CSV / XLSX / PDF) or,
 * for PNG, the caption the browser draws above the chart it already shows.
 */
export type ScadaExportFormat = 'CSV' | 'XLSX' | 'PDF' | 'PNG'

/** Exactly one of the two: the body of the last successful query / compare call. */
export type ScadaExportRequest = { analysis: unknown; comparison?: never } | { comparison: unknown; analysis?: never }

export interface ScadaPngCaption {
  format: 'PNG'
  /** Single-use id: the outcome must be reported with it once the PNG bytes exist. */
  exportId: string
  fileName: string
  title: string
  captionLines: string[]
  developmentLabel: string | null
  rowCount: number
}

const exportPath = (artifactId: string, format: ScadaExportFormat) => `/api/v1/reports/${encodeURIComponent(artifactId)}/analysis/export/${format}`

export function downloadScadaFile(artifactId: string, format: Exclude<ScadaExportFormat, 'PNG'>, request: ScadaExportRequest) {
  return tenantApiDownloadPost(exportPath(artifactId, format), request)
}

export async function fetchScadaPngCaption(artifactId: string, request: ScadaExportRequest): Promise<ScadaPngCaption> {
  const caption = await tenantApiPost<ScadaPngCaption>(exportPath(artifactId, 'PNG'), request)
  if (!caption || typeof caption.exportId !== 'string' || !Array.isArray(caption.captionLines) || caption.captionLines.some(l => typeof l !== 'string')) throw new Error('EXPORT_RESPONSE_INVALID')
  return caption
}

/** Step 2 of a PNG export: the browser reports that the PNG bytes exist (SUCCEEDED) or could not be produced (FAILED). The success audit is written only here. */
export function completeScadaPngExport(artifactId: string, exportId: string, outcome: 'SUCCEEDED' | 'FAILED') {
  return tenantApiPost<{ recorded: true }>(`${exportPath(artifactId, 'PNG')}/complete`, { exportId, outcome })
}

/** Whether the shown result has anything to export: an empty chart / table is never downloaded as a success. */
export function hasExportableData(analysis: ProjectedAnalysis | null, comparison: ProjectedComparison | null): boolean {
  if (analysis) return analysis.status !== 'BLOCKED' && analysis.series.some(s => s.points.length > 0)
  if (comparison) return comparison.status !== 'BLOCKED' && comparison.rows.length > 0
  return false
}

/** A static Turkish message per outcome; the server text / code of the failure is never shown. */
export function scadaExportErrorMessage(err: unknown, format: ScadaExportFormat): string {
  if (err instanceof ApiError) {
    const code = String(err.body?.['code'] ?? '')
    if (err.status === 401 || err.status === 403) return 'Bu export işlemi için yetkiniz yok.'
    if (code === 'SCADA_EXPORT_CONTEXT_INVALID') return 'Dışa aktarım oturumu geçersiz veya süresi doldu; lütfen tekrar deneyin.'
    if (code === 'SCADA_EXPORT_EMPTY') return 'Dışa aktarılacak veri yok.'
    if (code === 'SCADA_AUDIT_FAILED') return 'Dışa aktarım kaydı (audit) yazılamadığı için dosya oluşturulmadı.'
    if (code === 'SCADA_EXPORT_RENDER_FAILED' || err.status === 502) return `${format} oluşturucu servisine ulaşılamadı. Lütfen daha sonra tekrar deneyin.`
    if (code === 'SCADA_LIMIT_EXCEEDED') return `${format} için veri çok büyük; aralığı daraltın.`
    if (err.status === 404 || code === 'SCADA_NOT_FOUND') return "Rapor artifact'ı veya kaynak bulunamadı."
    if (err.status >= 500) return `${format} oluşturulurken sunucu tarafında bir sorun oluştu. Lütfen daha sonra tekrar deneyin.`
    return `${format} oluşturulamadı. Lütfen tekrar deneyin.`
  }
  return `${format} oluşturulurken bir sorun oluştu.`
}
