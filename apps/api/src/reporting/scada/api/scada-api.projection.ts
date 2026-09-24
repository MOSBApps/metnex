import type { ComparisonChartData } from '../comparison/scada-comparison.contract'
import type { AnalysisPlan, PresetStatistic, ScadaPreset } from '../presets/scada-preset.contract'
import type { ScadaOutputBucket, ScadaSeriesOutput, ScadaStatisticResult } from '../series/scada-series.contract'
import type { VirtualSeriesOutput } from '../virtual-columns/virtual-column.contract'
import type { ScadaSourceReport } from '../query/scada-analysis-query.contract'

/**
 * TASK-027.72 — response projection. EVERYTHING that leaves the API is built field by field here from an explicit
 * whitelist: an internal object is never returned as it is, so a field added to a domain type later (a table name, a
 * credential, an expression, a driver object) cannot reach a response by accident.
 */

const STATISTIC_FIELDS: Readonly<Record<PresetStatistic, Exclude<keyof ScadaStatisticResult, 'status'>>> = {
  SUM: 'sum',
  AVERAGE: 'average',
  MIN: 'min',
  MAX: 'max',
  COUNT: 'count',
  VALID_COUNT: 'validCount',
  MISSING_COUNT: 'missingCount',
  INVALID_COUNT: 'invalidCount',
  INCOMPLETE_COUNT: 'incompleteCount',
}

export interface ProjectedPoint {
  t: string | null
  localWallTime: string | null
  value: number | null
  quality: string
  qualityFlags: string[]
  isComplete: boolean
  classification: string
}

export interface ProjectedSeries {
  seriesKey: string
  sourceCatalogId: string
  label: string
  unit: string
  valueType: string
  analysisAllowed: boolean
  status: string
  codes: string[]
  points: ProjectedPoint[]
  statistics: { status: string; [statistic: string]: string | number | null }
  qualitySummary: ScadaSeriesOutput['qualitySummary']
  /** Present for a virtual series: which column and which VERSION(s) computed it. Never the expression. */
  virtual: { virtualColumnId: string; versions: number[]; sourceSeriesKeys: string[] } | null
}

function projectPoint(b: ScadaOutputBucket): ProjectedPoint {
  return { t: b.bucketStartUtc, localWallTime: b.localWallTime, value: b.value, quality: b.dataQuality, qualityFlags: [...b.qualityFlags], isComplete: b.isComplete, classification: b.classification }
}

function projectStatistics(stats: ScadaStatisticResult, selected: readonly PresetStatistic[] | null): ProjectedSeries['statistics'] {
  const out: ProjectedSeries['statistics'] = { status: stats.status }
  for (const key of selected ?? (Object.keys(STATISTIC_FIELDS) as PresetStatistic[])) out[STATISTIC_FIELDS[key]] = stats[STATISTIC_FIELDS[key]]
  return out
}

export function projectSeries(series: ScadaSeriesOutput | VirtualSeriesOutput, selected: readonly PresetStatistic[] | null, filters: AnalysisPlan['filters']): ProjectedSeries {
  const wanted = filters.qualityStates.length > 0 ? new Set<string>(filters.qualityStates) : null
  const virtual = 'virtual' in series ? { virtualColumnId: series.virtual.virtualColumnId, versions: [...series.virtual.versions], sourceSeriesKeys: [...series.virtual.sourceSeriesKeys] } : null
  return {
    seriesKey: series.seriesKey,
    sourceCatalogId: series.sourceCatalogId,
    label: series.label,
    unit: series.unit,
    valueType: series.valueType,
    analysisAllowed: series.analysisAllowed,
    status: series.status,
    codes: [...series.codes],
    // the quality filter narrows the LISTED points only; the statistics stay computed over the whole range
    points: series.buckets.filter(b => wanted === null || b.qualityFlags.some(f => wanted.has(f))).map(projectPoint),
    statistics: projectStatistics(series.statistics, selected),
    qualitySummary: { ...series.qualitySummary },
    virtual,
  }
}

export interface ProjectedAnalysis {
  artifactCode: string
  status: 'OK' | 'PARTIAL' | 'BLOCKED'
  code: string | null
  interval: string
  timezone: string
  range: { startAt: string; endAt: string }
  preset: { presetId: string; presetVersion: number } | null
  series: ProjectedSeries[]
  excluded: Array<{ seriesKey: string | null; sourceCatalogId: string | null; code: string }>
  sources: Array<{ sourceCatalogId: string; status: string; code: string | null; rowCount: number }>
  virtualColumnFailures: Array<{ virtualColumnId: string; code: string }>
  pointFilter: { qualityStates: string[]; onlyAnalysisAllowed: boolean }
}

export function projectSources(reports: readonly ScadaSourceReport[]): ProjectedAnalysis['sources'] {
  return reports.map(r => ({ sourceCatalogId: r.catalogId, status: r.status, code: r.code, rowCount: r.rowCount }))
}

export interface ProjectedComparison {
  artifactCode: string
  status: 'OK' | 'BLOCKED'
  code: string | null
  mode: 'PERIOD' | 'SOURCE'
  bucketInterval: string | null
  timezone: string
  comparability: string
  rows: ComparisonChartData['rows']
  unmatchedSeries: ComparisonChartData['unmatchedSeries']
  summary: ComparisonChartData['summary']
  preset: { presetId: string; presetVersion: number } | null
  sources: ProjectedAnalysis['sources']
}

/** The 027.69 chart contract, copied field by field (rows that cannot be compared stay visible with their status and reason). */
export function projectComparison(chart: ComparisonChartData, meta: { artifactCode: string; timezone: string; preset: ProjectedComparison['preset']; sources: ProjectedAnalysis['sources'] }): ProjectedComparison {
  return {
    artifactCode: meta.artifactCode,
    status: chart.status,
    code: chart.code,
    mode: chart.mode,
    bucketInterval: chart.bucketInterval,
    timezone: meta.timezone,
    comparability: chart.comparability,
    rows: chart.rows.map(r => ({
      t: r.t,
      comparisonT: r.comparisonT,
      seriesLabel: r.seriesLabel,
      comparisonSeriesLabel: r.comparisonSeriesLabel,
      sourceLabel: r.sourceLabel,
      comparisonSourceLabel: r.comparisonSourceLabel,
      baseline: r.baseline,
      comparison: r.comparison,
      absoluteDelta: r.absoluteDelta,
      percentageDelta: r.percentageDelta,
      quality: r.quality,
      status: r.status,
      reasonCode: r.reasonCode,
      baselineReason: r.baselineReason,
      comparisonReason: r.comparisonReason,
    })),
    unmatchedSeries: chart.unmatchedSeries.map(u => ({ side: u.side, seriesKey: u.seriesKey, sourceCatalogId: u.sourceCatalogId, seriesLabel: u.seriesLabel })),
    summary: { ...chart.summary },
    preset: meta.preset,
    sources: meta.sources,
  }
}

export interface ProjectedPresetSummary {
  presetId: string
  version: number
  scope: string
  name: string
  description: string | null
  status: string
  /** Whether the CALLER owns it — another user's id is never returned. */
  isOwner: boolean
  bucketInterval: string
  timezone: string
  sourceCatalogIds: string[]
  seriesKeys: string[]
  /** Only id and version: the expression is never part of a preset and never returned. */
  virtualColumns: Array<{ virtualColumnId: string; version: number | null }>
  statistics: string[]
  comparisonMode: string
  /** The comparison plan in the screen's terms: explicit left → right series pairs, never an expression. */
  comparison: { mode: string; comparisonRange: { startAt: string; endAt: string } | null; leftSourceCatalogId: string | null; rightSourceCatalogId: string | null; seriesMapping: Array<{ leftSeriesKey: string; rightSeriesKey: string }> }
  chartType: string
  timeRange: { startAt: string; endAt: string }
  effectiveFrom: string | null
  effectiveTo: string | null
  updatedAt: string
}

export function projectPresetSummary(p: ScadaPreset, callerUserId: string): ProjectedPresetSummary {
  return {
    presetId: p.presetId,
    version: p.version,
    scope: p.scope,
    name: p.name,
    description: p.description,
    status: p.status,
    isOwner: p.ownerUserId !== null && p.ownerUserId === callerUserId,
    bucketInterval: p.bucketInterval,
    timezone: p.timezone,
    sourceCatalogIds: [...p.sourceCatalogIds],
    seriesKeys: [...p.seriesKeys],
    virtualColumns: p.virtualColumns.map(v => ({ virtualColumnId: v.virtualColumnId, version: v.version ?? null })),
    statistics: [...p.statistics],
    comparisonMode: p.comparison.mode,
    comparison: {
      mode: p.comparison.mode,
      comparisonRange: p.comparison.mode === 'PERIOD' ? { startAt: p.comparison.comparisonRange.startAt, endAt: p.comparison.comparisonRange.endAt } : null,
      leftSourceCatalogId: p.comparison.mode === 'SOURCE' ? p.comparison.leftSourceCatalogId : null,
      rightSourceCatalogId: p.comparison.mode === 'SOURCE' ? p.comparison.rightSourceCatalogId : null,
      seriesMapping: p.comparison.mode === 'NONE' ? [] : (p.comparison.seriesMapping ?? []).map(e => ({ leftSeriesKey: e.baseline.seriesKey, rightSeriesKey: e.comparison.seriesKey })),
    },
    chartType: p.display.chartType,
    timeRange: { startAt: p.timeRange.startAt, endAt: p.timeRange.endAt },
    effectiveFrom: p.effectiveFrom,
    effectiveTo: p.effectiveTo,
    updatedAt: p.updatedAt,
  }
}

export function projectPlan(plan: AnalysisPlan) {
  return {
    presetId: plan.presetId,
    presetVersion: plan.presetVersion,
    resolvedAtUtc: plan.resolvedAtUtc,
    timeRange: { ...plan.timeRange },
    bucketInterval: plan.bucketInterval,
    timezone: plan.timezone,
    sourceCatalogIds: [...plan.sourceCatalogIds],
    series: plan.series.map(s => ({ sourceCatalogId: s.sourceCatalogId, seriesKey: s.seriesKey })),
    virtualColumns: plan.virtualColumns.map(v => ({ virtualColumnId: v.virtualColumnId, version: v.version, sourceCatalogId: v.catalogId, seriesKey: v.seriesKey })),
    statistics: [...plan.statistics],
    comparisonMode: plan.comparison.mode,
    display: { chartType: plan.display.chartType },
  }
}

// ---------------------------------------------------------------- catalog discovery (TASK-027.73-R1)

export type CatalogBlockedReason = 'SOURCE_INACTIVE' | 'MAPPING_UNRESOLVED' | 'TENANT_NOT_MAPPABLE' | 'TIMEZONE_UNVERIFIED' | 'NO_SERIES'

export interface ProjectedCatalogSeries {
  seriesKey: string
  label: string
  unit: string
  valueType: string
  available: boolean
  /** OK | PARTIAL for a verified column; UNVERIFIED for a column the manifest does not verify (never selectable). */
  qualityStatus: string
  verificationStatus: 'VERIFIED' | 'UNVERIFIED'
  sourceCatalogId: string
}

export interface ProjectedCatalogSource {
  catalogId: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  mappingStatus: 'RESOLVED' | 'UNRESOLVED'
  schemaStatus: string
  timezoneStatus: string
  /** IANA zone the readings are interpreted in (needed to turn a wall-clock selection into instants); null while unverified. */
  timezone: string | null
  supportedIntervals: string[]
  rowCount: number | null
  minAt: string | null
  maxAt: string | null
  selectable: boolean
  blockedReason: CatalogBlockedReason | null
  series: ProjectedCatalogSeries[]
}

export interface ProjectedCatalog {
  artifact: {
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
  } | null
  developmentLabel: string | null
  sources: ProjectedCatalogSource[]
}

/**
 * Field-by-field discovery projection. The physical table / column names, file paths, database names and credentials of the
 * internal `ScadaApiSource` are not fields of this shape, so they cannot be returned.
 */
export function projectCatalogSource(
  s: import('./scada-api.contract').ScadaApiSource,
  gate: { selectable: boolean; blockedReason: CatalogBlockedReason | null },
): ProjectedCatalogSource {
  const seen = new Set<string>()
  const showSeries = gate.selectable || gate.blockedReason === 'NO_SERIES' // a source with only UNVERIFIED columns still tells the user why
  const byKey = (a: { seriesKey: string }, b: { seriesKey: string }) => (a.seriesKey < b.seriesKey ? -1 : a.seriesKey > b.seriesKey ? 1 : 0)
  const unique = <T extends { seriesKey: string }>(list: T[]): T[] => list.sort(byKey).filter(x => (seen.has(x.seriesKey) ? false : (seen.add(x.seriesKey), true)))
  const verified: ProjectedCatalogSeries[] = showSeries && gate.selectable
    ? unique([...s.series]).map(x => ({ seriesKey: x.seriesKey, label: x.label, unit: x.unit, valueType: x.valueType, available: true, qualityStatus: x.qualityStatus ?? 'OK', verificationStatus: 'VERIFIED' as const, sourceCatalogId: s.catalogId }))
    : []
  for (const v of verified) seen.add(v.seriesKey)
  const unverified: ProjectedCatalogSeries[] = showSeries
    ? unique([...(s.unverifiedSeries ?? [])].filter(u => !seen.has(u.seriesKey))).map(u => ({ seriesKey: u.seriesKey, label: u.label, unit: '', valueType: 'UNVERIFIED', available: false, qualityStatus: 'UNVERIFIED', verificationStatus: 'UNVERIFIED' as const, sourceCatalogId: s.catalogId }))
    : []
  const series = [...verified, ...unverified]
  return {
    catalogId: s.catalogId,
    name: s.displayName,
    status: s.active ? 'ACTIVE' : 'INACTIVE',
    mappingStatus: s.mappingResolved ? 'RESOLVED' : 'UNRESOLVED',
    schemaStatus: s.schemaStatus ?? 'VERIFIED',
    timezoneStatus: s.timezoneStatus ?? (s.sourceTimeZone ? 'VERIFIED' : 'UNVERIFIED'),
    timezone: gate.selectable ? s.sourceTimeZone : null,
    supportedIntervals: ['HOURLY', 'DAILY'],
    rowCount: gate.selectable ? (s.meta?.rowCount ?? null) : null,
    minAt: gate.selectable ? (s.meta?.minAt ?? null) : null,
    maxAt: gate.selectable ? (s.meta?.maxAt ?? null) : null,
    selectable: gate.selectable,
    blockedReason: gate.blockedReason,
    series,
  }
}

// ---------------------------------------------------------------- virtual column management (TASK-027.71-R1)

export interface ProjectedVirtualColumn {
  virtualColumnId: string
  catalogId: string
  seriesKey: string
  label: string
  unit: string
  valueType: string
  inputSeriesKeys: string[]
  /** The LATEST version and its status. */
  version: number
  status: string
  activeVersion: number | null
  versions: Array<{ version: number; status: string }>
}

/** Whitelist: the expression text, the creator and the internal windows are NOT fields of this shape — they cannot be returned. */
export function projectVirtualColumn(versions: readonly import('../virtual-columns/virtual-column.contract').VirtualColumnDefinition[]): ProjectedVirtualColumn {
  const sorted = [...versions].sort((a, b) => a.version - b.version)
  const latest = sorted[sorted.length - 1]!
  const active = [...sorted].reverse().find(v => v.status === 'ACTIVE')
  return {
    virtualColumnId: latest.virtualColumnId,
    catalogId: latest.catalogId,
    seriesKey: latest.seriesKey,
    label: latest.label,
    unit: latest.unit,
    valueType: latest.valueType,
    inputSeriesKeys: [...latest.inputSeriesKeys],
    version: latest.version,
    status: latest.status,
    activeVersion: active ? active.version : null,
    versions: sorted.map(v => ({ version: v.version, status: v.status })),
  }
}
