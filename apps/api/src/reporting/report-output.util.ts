export type ReportOutputFormat = 'HTML' | 'PDF' | 'XLSX'

export type RenderableReportFormat = Exclude<ReportOutputFormat, 'HTML'>

const DEFAULT_CONTENT_TYPES: Record<RenderableReportFormat, string> = {
  PDF: 'application/pdf',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export function getDefaultReportContentType(format: RenderableReportFormat): string {
  return DEFAULT_CONTENT_TYPES[format]
}

/**
 * Builds a Content-Disposition-safe file name. artifactCode ultimately comes from a DB row —
 * never trust it as already safe for a header value (CRLF injection, path separators, etc).
 */
export function buildReportFileName(artifactCode: string, format: RenderableReportFormat): string {
  const safeCode = artifactCode.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'report'
  return `${safeCode}.${format.toLowerCase()}`
}
