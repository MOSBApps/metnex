export interface ScadaPoint {
  t: string | null
  localWallTime: string | null
  value: number | null
  quality: string
  qualityFlags: string[]
  isComplete: boolean
  classification: string
}

export interface ScadaQualitySummary {
  totalBuckets: number
  validBuckets: number
  invalidBuckets: number
  missingBuckets: number
  incompleteBuckets: number
  qualityStates: string[]
}

export interface ScadaSeries {
  seriesKey: string
  sourceCatalogId: string
  label: string
  unit: string
  valueType: string
  analysisAllowed: boolean
  status: string
  codes: string[]
  points: ScadaPoint[]
  statistics: {
    status: string
    sum?: number | null
    average?: number | null
    min?: number | null
    max?: number | null
    count?: number | null
    validCount?: number | null
    missingCount?: number | null
    invalidCount?: number | null
    incompleteCount?: number | null
    [key: string]: string | number | null | undefined
  }
  qualitySummary: ScadaQualitySummary
  virtual: { virtualColumnId: string; versions: number[]; sourceSeriesKeys: string[] } | null
}

export interface ProjectedAnalysis {
  artifactCode: string
  status: 'OK' | 'PARTIAL' | 'BLOCKED'
  code: string | null
  interval: string
  timezone: string
  range: { startAt: string; endAt: string }
  preset: { presetId: string; presetVersion: number } | null
  series: ScadaSeries[]
  excluded: Array<{ seriesKey: string | null; sourceCatalogId: string | null; code: string }>
  sources: Array<{ sourceCatalogId: string; status: string; code: string | null; rowCount: number }>
  virtualColumnFailures: Array<{ virtualColumnId: string; code: string }>
  pointFilter: { qualityStates: string[]; onlyAnalysisAllowed: boolean }
}

export interface ComparisonRow {
  t: string | null
  comparisonT: string | null
  seriesLabel: string
  comparisonSeriesLabel: string
  sourceLabel: string
  comparisonSourceLabel: string
  baseline: number | null
  comparison: number | null
  absoluteDelta: number | null
  percentageDelta: number | null
  quality: string
  status: string
  reasonCode: string | null
  baselineReason: string | null
  comparisonReason: string | null
}

export interface UnmatchedSeries {
  side: string
  seriesKey: string
  sourceCatalogId: string
  seriesLabel: string
}

export interface ComparisonSummary {
  totalPairs: number
  validPairs: number
  averageAbsoluteDelta: number | null
  maxAbsoluteDelta: number | null
}

export interface ProjectedComparison {
  artifactCode: string
  status: 'OK' | 'BLOCKED'
  code: string | null
  mode: 'PERIOD' | 'SOURCE'
  bucketInterval: string | null
  timezone: string
  comparability: string
  rows: ComparisonRow[]
  unmatchedSeries: UnmatchedSeries[]
  summary: ComparisonSummary
  preset: { presetId: string; presetVersion: number } | null
  sources: Array<{ sourceCatalogId: string; status: string; code: string | null; rowCount: number }>
}

export interface PresetSummary {
  presetId: string
  version: number
  scope: string
  name: string
  description: string | null
  status: string
  isOwner: boolean
  bucketInterval: string
  timezone: string
  sourceCatalogIds: string[]
  seriesKeys: string[]
  virtualColumns: Array<{ virtualColumnId: string; version: number | null }>
  statistics: string[]
  comparisonMode: string
  /** The comparison plan: explicit left → right series pairs (never an expression). */
  comparison: {
    mode: string
    comparisonRange: { startAt: string; endAt: string } | null
    leftSourceCatalogId: string | null
    rightSourceCatalogId: string | null
    seriesMapping: Array<{ leftSeriesKey: string; rightSeriesKey: string }>
  }
  chartType: string
  timeRange: { startAt: string; endAt: string }
  effectiveFrom: string | null
  effectiveTo: string | null
  updatedAt: string
}

export interface AnalysisFormState {
  startAt: string
  endAt: string
  bucketInterval: 'HOURLY' | 'DAILY'
  timezone: string
  sourceCatalogIds: string
  seriesKeys: string
  statistics: string[]
  presetId: string
  comparisonMode: 'NONE' | 'PERIOD' | 'SOURCE'
  comparisonStartAt: string
  comparisonEndAt: string
  leftSourceCatalogId: string
  rightSourceCatalogId: string
}

/** `GET …/presets/:presetId`: the preset, its versions and whether it still resolves against the CURRENT catalog / virtual columns. */
export interface PresetDetail {
  preset: PresetSummary
  versions: Array<{ version: number; status: string; effectiveFrom: string | null; effectiveTo: string | null }>
  resolution: { status: 'RESOLVED' | 'NOT_RESOLVED'; code?: string; plan?: unknown }
}

/** `GET …/presets`. developmentStore / canShare are additive: whether the in-memory development store exists and whether the caller may share. */
export interface PresetList {
  presets: PresetSummary[]
  developmentStore?: boolean
  canShare?: boolean
}
