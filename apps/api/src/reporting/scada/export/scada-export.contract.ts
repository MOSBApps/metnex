/**
 * TASK-027.74 — SCADA analysis export contract. The export MODEL is the only thing the CSV / XLSX / PDF / PNG builders see: it is built
 * field by field from the already whitelisted 027.72 projection (`ProjectedAnalysis` / `ProjectedComparison`), so an expression, a SQL
 * text, a schema / table name, a connection fragment or a raw provider error has no path into any file.
 */

export const SCADA_EXPORT_FORMATS = ['CSV', 'XLSX', 'PDF', 'PNG'] as const
export type ScadaExportFormat = (typeof SCADA_EXPORT_FORMATS)[number]

export const UNIT_UNSPECIFIED_LABEL = 'Birim belirtilmemiş'
export const EXPORT_NULL_MARK = '—'

export interface ExportFilters {
  interval: string
  timezone: string
  range: { startAt: string; endAt: string }
  comparisonRange: { startAt: string; endAt: string } | null
  qualityStates: string[]
  onlyAnalysisAllowed: boolean
  statistics: string[]
  preset: { presetId: string; presetVersion: number } | null
  sourceNames: string[]
}

export interface ExportAnalysisRow {
  t: string | null
  localWallTime: string | null
  seriesLabel: string
  sourceName: string
  value: number | null
  unit: string
  valueType: string
  quality: string
  qualityFlags: string[]
  isComplete: boolean
  analysisAllowed: boolean
  virtualColumnId: string | null
  virtualColumnVersions: number[]
}

export interface ExportStatisticRow {
  seriesLabel: string
  sourceName: string
  unit: string
  valueType: string
  status: string
  virtualColumnId: string | null
  virtualColumnVersions: number[]
  values: Array<{ name: string; value: number | null }>
}

export interface ExportQualityRow {
  seriesLabel: string
  sourceName: string
  status: string
  analysisAllowed: boolean
  highestSeverity: string
  totalBuckets: number
  validBuckets: number
  missingValues: number
  invalidValues: number
  counterResetUnresolved: number
  dstAmbiguous: number
  dstNonexistent: number
  incompleteBuckets: number
  codes: string[]
  virtualColumnId: string | null
  virtualColumnVersions: number[]
}

export interface ExportComparisonRow {
  t: string | null
  comparisonT: string | null
  seriesLabel: string | null
  comparisonSeriesLabel: string | null
  sourceLabel: string | null
  comparisonSourceLabel: string | null
  baseline: number | null
  comparison: number | null
  absoluteDelta: number | null
  percentageDelta: number | null
  quality: string
  status: string
  reasonCode: string | null
}

export interface ScadaExportModel {
  kind: 'ANALYSIS' | 'COMPARISON'
  artifactCode: string
  title: string
  generatedAt: string
  /** Set only while the catalog itself says the data is a development snapshot. */
  developmentLabel: string | null
  status: 'OK' | 'PARTIAL' | 'BLOCKED'
  code: string | null
  warnings: string[]
  filters: ExportFilters
  analysis: { rows: ExportAnalysisRow[]; statistics: ExportStatisticRow[]; quality: ExportQualityRow[] } | null
  comparison: { mode: string; comparability: string; rows: ExportComparisonRow[]; unmatched: number; summary: Array<{ name: string; value: number | string | null }> } | null
}

export interface ScadaExportFile {
  kind: 'FILE'
  buffer: Buffer
  contentType: string
  fileName: string
}

/** PNG is drawn by the browser from the chart already on screen: the server only authorises, audits and supplies the caption. */
export interface ScadaExportPngCaption {
  kind: 'PNG_CAPTION'
  format: 'PNG'
  /** Single-use id of the pending export; the browser must report the outcome with it once the PNG bytes exist. */
  exportId: string
  fileName: string
  title: string
  captionLines: string[]
  developmentLabel: string | null
  rowCount: number
}

export type ScadaExportResult = ScadaExportFile | ScadaExportPngCaption

/** Fixed-width text row the Jasper `scada-analysis-report` template prints (kind: TITLE | META | SECTION | HEADER | DATA | NOTE). */
export interface ScadaPdfRow {
  kind: 'TITLE' | 'META' | 'SECTION' | 'HEADER' | 'DATA' | 'NOTE'
  c1: string
  c2: string
  c3: string
  c4: string
  c5: string
  c6: string
  c7: string
  c8: string
}

export interface ScadaExportRendererPort {
  isConfigured(): boolean
  render(input: { artifactCode: string; templateId: string | null; format: 'PDF'; rows: unknown[] }): Promise<{ buffer: Buffer; contentType: string; fileName: string }>
}

export const SCADA_ANALYSIS_TEMPLATE_ID = 'scada-analysis-report'

export type ScadaExportRendererMode = 'JASPER' | 'FALLBACK' | 'NONE'

export interface ScadaExportAuditEntry {
  actorId: string
  tenantId: string
  artifactCode: string | null
  format: ScadaExportFormat | null
  kind: 'ANALYSIS' | 'COMPARISON' | null
  result: 'SUCCEEDED' | 'FAILED'
  /** A static code only (`OK` or a `ScadaApiErrorCode`) — never a message, a name, SQL or a row. */
  reasonCode: string
  rendererMode: ScadaExportRendererMode
  delivery: 'SERVER_FILE' | 'CLIENT_RENDERED'
  rowCount: number | null
  simulation: boolean
  correlationId: string
}

export interface ScadaExportAuditPort {
  record(entry: ScadaExportAuditEntry): Promise<void>
}

export const SCADA_EXPORT_RENDERER = 'SCADA_EXPORT_RENDERER'
export const SCADA_EXPORT_AUDIT = 'SCADA_EXPORT_AUDIT'
