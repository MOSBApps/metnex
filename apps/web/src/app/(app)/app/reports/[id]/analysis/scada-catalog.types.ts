/** TASK-027.73-R1 — the discovery response of `GET /reports/:code/analysis/catalog` (whitelisted server-side; no path / physical name). */
export const DEV_CSV_LABEL = 'Geliştirme CSV snapshot verisi'

export interface CatalogSeries {
  seriesKey: string
  label: string
  unit: string
  valueType: string
  available: boolean
  /** OK | PARTIAL for a verified column; UNVERIFIED for one the manifest does not verify (never selectable). */
  qualityStatus: string
  verificationStatus: 'VERIFIED' | 'UNVERIFIED'
  sourceCatalogId: string
}

export interface CatalogSource {
  catalogId: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  mappingStatus: 'RESOLVED' | 'UNRESOLVED'
  schemaStatus: string
  timezoneStatus: string
  timezone: string | null
  supportedIntervals: string[]
  rowCount: number | null
  minAt: string | null
  maxAt: string | null
  selectable: boolean
  blockedReason: string | null
  series: CatalogSeries[]
}

export interface CatalogArtifact {
  code: string
  name: string
  description: string
  status: string
  developmentOnly: boolean
  supportedIntervals: string[]
  supportedFormats: string[]
  sourceCatalogIds: string[]
  timezoneStatus: string
  dataOrigin: string
}

export interface ScadaCatalog {
  artifact: CatalogArtifact | null
  developmentLabel: string | null
  sources: CatalogSource[]
}

export type Interval = 'HOURLY' | 'DAILY'

/** What the user picked. `startWall` / `endWall` are wall-clock values (`YYYY-MM-DDTHH:mm`) in the SOURCE's zone; the end is INCLUSIVE. */
export interface CatalogSelection {
  sourceCatalogId: string
  seriesKeys: string[]
  startWall: string
  endWall: string
  interval: Interval
}

/** TASK-027.71-R1 — development virtual column (whitelisted server-side: never an expression, creator or internal window). */
export interface VirtualColumnSummary {
  virtualColumnId: string
  catalogId: string
  seriesKey: string
  label: string
  unit: string
  valueType: string
  inputSeriesKeys: string[]
  version: number
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'BLOCKED'
  activeVersion: number | null
  versions: Array<{ version: number; status: string }>
}
