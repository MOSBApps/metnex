/**
 * Column semantics a manifest may DECLARE. Nothing is inferred from a column name: a column that is not declared here (or is
 * declared with `verified: false`) has NO known value type and NO known unit, is shown as UNVERIFIED and cannot be selected.
 */
export interface ScadaFixtureColumnDeclaration {
  /** The physical CSV column (must exist in the file's header; the id / date / time columns can never be declared). */
  sourceColumn: string
  /** Visible label ONLY; it carries no semantics. */
  label?: string
  verified: boolean
  /** Required (INDEX | REAL_VALUE) for a verified column; null for one nobody could prove. */
  valueType?: 'INDEX' | 'REAL_VALUE' | null
  /** Shown only when written here AND backed by evidence; null / absent ⇒ the UI says "Birim belirtilmemiş". */
  unit?: string | null
  /** Explicit HOURLY → DAILY rule for a REAL_VALUE column (an INDEX column is summed). */
  dailyOperation?: 'SUM' | 'AVERAGE' | 'MIN' | 'MAX'
  /** Evidence references (BOTC file:line, CSV statistics, decisions). A column WITHOUT any reference is never verified. */
  evidenceRefs?: string[]
}

export interface ScadaFixtureSourceManifest {
  catalogId: string
  sourceKey: string
  logicalSourceName: string
  file: string
  table: string
  idColumn: string
  dateColumn: string
  timeColumn: string
  timezone: string | null
  status: string
  mappingStatus: string
  sha256: string
  rowCount: number
  columnCount: number
  developmentOnly: boolean
  /** Optional, additive: the manifest's verified column declarations. */
  columns?: ScadaFixtureColumnDeclaration[]
}

export interface ScadaFixturesManifest {
  version: string
  generatedAt: string
  description: string
  developmentOnly: boolean
  sources: ScadaFixtureSourceManifest[]
}

export type DataQuality = 'VALID' | 'MISSING' | 'INVALID' | 'UNVERIFIED'

export interface ScadaNormalizedRecord {
  recordId: string
  occurredAt: string
  seriesKey: string
  rawValue: number | null
  valueType: string
  sourceCatalogId: string
  dataQuality: DataQuality
  developmentFixture: true
}
