import { assertTimeZone, isCatalogId } from '../catalog/catalog-rules'
import { SCADA_INTERVALS, SCADA_MULTI_SOURCE_MODES, type ScadaInterval, type ScadaMultiSourceMode } from '../query/scada-analysis-query.contract'
import { PRESET_STATISTICS, type PresetStatistic } from '../presets/scada-preset.contract'
import { CONNECTION_FRAGMENT } from '../presets/scada-preset-security'
import type { SeriesMappingEntry } from '../comparison/scada-comparison.contract'
import type { ScadaApiErrorCode, ScadaApiLimits } from './scada-api.contract'
import { SCADA_EXPORT_FORMATS, type ScadaExportFormat } from '../export/scada-export.contract'

/**
 * TASK-027.72 — PURE request validation. It runs BEFORE the first access to anything (scope, catalog, provider, adapter) and
 * turns the raw HTTP body into a small, detached, typed request. The raw body is never forwarded. Every rejection is a static
 * code: no value of the request is echoed. The limits are an argument (environment / source profile) — none is a constant here.
 */

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; code: ScadaApiErrorCode }

export interface CleanPeriod {
  startAt: string
  endAt: string
}

export type CleanAnalysisRequest =
  | { kind: 'PRESET'; presetId: string; presetVersion: number | null; mode: ScadaMultiSourceMode }
  | {
      kind: 'EXPLICIT'
      mode: ScadaMultiSourceMode
      sourceCatalogIds: string[]
      seriesKeys: string[]
      virtualColumnIds: string[]
      statistics: PresetStatistic[] | null
      period: CleanPeriod
      bucketInterval: ScadaInterval
      timezone: string
    }

export type CleanCompareRequest =
  | { kind: 'PRESET'; presetId: string; presetVersion: number | null }
  | {
      kind: 'EXPLICIT'
      mode: 'PERIOD'
      sourceCatalogIds: string[]
      seriesKeys: string[]
      statistics: PresetStatistic[] | null
      baseline: CleanPeriod
      comparison: CleanPeriod
      seriesMapping: SeriesMappingEntry[]
      decimals: number | null
      bucketInterval: ScadaInterval
      timezone: string
    }
  | {
      kind: 'EXPLICIT'
      mode: 'SOURCE'
      leftSourceCatalogId: string
      rightSourceCatalogId: string
      seriesKeys: string[]
      statistics: PresetStatistic[] | null
      period: CleanPeriod
      seriesMapping: SeriesMappingEntry[]
      decimals: number | null
      bucketInterval: ScadaInterval
      timezone: string
    }

const ROUTE_CODE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
const PRESET_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const VC_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const posInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0
const fail = <T>(code: ScadaApiErrorCode): ValidationResult<T> => ({ ok: false, code })
const ok = <T>(value: T): ValidationResult<T> => ({ ok: true, value })
const safeText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128 && !CONTROL.test(v) && !CONNECTION_FRAGMENT.test(v)

const ANALYSIS_KEYS = ['artifactCode', 'sourceCatalogIds', 'seriesKeys', 'startAt', 'endAt', 'bucketInterval', 'timezone', 'presetId', 'presetVersion', 'virtualColumnIds', 'statistics', 'mode']
const COMPARE_KEYS = ['artifactCode', 'mode', 'sourceCatalogIds', 'seriesKeys', 'baseline', 'comparison', 'period', 'leftSourceCatalogId', 'rightSourceCatalogId', 'seriesMapping', 'bucketInterval', 'timezone', 'presetId', 'presetVersion', 'statistics', 'decimals']
/** With a preset reference NOTHING else may steer the analysis (no second, conflicting truth). */
const PRESET_ONLY_KEYS = ['artifactCode', 'presetId', 'presetVersion', 'mode']

export function validateRouteCode(code: unknown): ValidationResult<string> {
  return typeof code === 'string' && ROUTE_CODE.test(code) ? ok(code) : fail('SCADA_ROUTE_CODE_INVALID')
}

/** Structure of the limits themselves; a missing/invalid value blocks everything (fail-closed). */
export function apiLimitsValid(l: unknown): l is ScadaApiLimits {
  if (!isObj(l) || !isObj(l['preset']) || !isObj(l['virtualColumn'])) return false
  const p = l['preset']
  const v = l['virtualColumn']
  return (
    ['maxNameLength', 'maxDescriptionLength', 'maxSourceCount', 'maxSeriesCount', 'maxVirtualColumnCount', 'maxPageSize'].every(k => posInt(p[k])) &&
    ['maxExpressionLength', 'maxAstDepth', 'maxOperatorCount', 'maxRoundDecimals', 'maxAbsoluteResult'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]) && (v[k] as number) > 0) &&
    posInt(l['maxPeriodMs']) &&
    posInt(l['maxSeriesMappings'])
  )
}

function checkKeys(body: Record<string, unknown>, allowed: readonly string[]): ScadaApiErrorCode | null {
  for (const key of Object.keys(body)) if (!allowed.includes(key)) return 'SCADA_REQUEST_UNKNOWN_FIELD'
  return null
}

function instant(v: unknown): string | null {
  if (typeof v !== 'string' || !ISO_INSTANT.test(v)) return null
  const ms = Date.parse(v)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

function period(v: unknown, limits: ScadaApiLimits): ValidationResult<CleanPeriod> {
  if (!isObj(v)) return fail('SCADA_TIME_RANGE_INVALID')
  if (Object.keys(v).some(k => k !== 'startAt' && k !== 'endAt')) return fail('SCADA_REQUEST_UNKNOWN_FIELD')
  return periodOf(v['startAt'], v['endAt'], limits)
}

function periodOf(startRaw: unknown, endRaw: unknown, limits: ScadaApiLimits): ValidationResult<CleanPeriod> {
  const startAt = instant(startRaw)
  const endAt = instant(endRaw)
  if (!startAt || !endAt || Date.parse(startAt) >= Date.parse(endAt)) return fail('SCADA_TIME_RANGE_INVALID')
  if (Date.parse(endAt) - Date.parse(startAt) > limits.maxPeriodMs) return fail('SCADA_LIMIT_EXCEEDED')
  return ok({ startAt, endAt })
}

function uniqueStrings(v: unknown, test: (s: unknown) => boolean, max: number, invalid: ScadaApiErrorCode = 'SCADA_REQUEST_INVALID'): ValidationResult<string[]> {
  if (!Array.isArray(v) || v.length === 0 || !v.every(test)) return fail(invalid)
  if (v.length > max) return fail('SCADA_LIMIT_EXCEEDED')
  if (new Set(v as string[]).size !== v.length) return fail(invalid)
  return ok([...(v as string[])])
}

function statistics(v: unknown): ValidationResult<PresetStatistic[] | null> {
  if (v === undefined) return ok(null)
  if (!Array.isArray(v) || v.length === 0 || !v.every(s => PRESET_STATISTICS.includes(s as PresetStatistic)) || new Set(v as string[]).size !== v.length) return fail('SCADA_STATISTIC_INVALID')
  return ok([...(v as PresetStatistic[])])
}

function interval(v: unknown): ValidationResult<ScadaInterval> {
  return typeof v === 'string' && (SCADA_INTERVALS as readonly string[]).includes(v) ? ok(v as ScadaInterval) : fail('SCADA_INTERVAL_INVALID')
}

function timezone(v: unknown): ValidationResult<string> {
  try {
    assertTimeZone(v)
    return ok(v)
  } catch {
    return fail('SCADA_TIMEZONE_INVALID')
  }
}

function mode(v: unknown): ValidationResult<ScadaMultiSourceMode> {
  if (v === undefined) return ok('EXPLICIT')
  return typeof v === 'string' && (SCADA_MULTI_SOURCE_MODES as readonly string[]).includes(v) ? ok(v as ScadaMultiSourceMode) : fail('SCADA_REQUEST_INVALID')
}

function presetRef(body: Record<string, unknown>): ValidationResult<{ presetId: string; presetVersion: number | null }> {
  if (typeof body['presetId'] !== 'string' || !PRESET_ID.test(body['presetId'])) return fail('SCADA_REQUEST_INVALID')
  if (body['presetVersion'] !== undefined && !posInt(body['presetVersion'])) return fail('SCADA_REQUEST_INVALID')
  return ok({ presetId: body['presetId'], presetVersion: (body['presetVersion'] as number | undefined) ?? null })
}

function checkArtifactCode(body: Record<string, unknown>, routeCode: string): ScadaApiErrorCode | null {
  return body['artifactCode'] === undefined || body['artifactCode'] === routeCode ? null : 'SCADA_REQUEST_INVALID'
}

export function validateAnalysisRequest(routeCode: unknown, body: unknown, limits: ScadaApiLimits): ValidationResult<CleanAnalysisRequest> {
  const route = validateRouteCode(routeCode)
  if (!route.ok) return route
  if (!isObj(body)) return fail('SCADA_REQUEST_INVALID')
  const unknownKey = checkKeys(body, ANALYSIS_KEYS)
  if (unknownKey) return fail(unknownKey)
  const artifactMismatch = checkArtifactCode(body, route.value)
  if (artifactMismatch) return fail(artifactMismatch)
  const m = mode(body['mode'])
  if (!m.ok) return m

  if (body['presetId'] !== undefined) {
    if (Object.keys(body).some(k => !PRESET_ONLY_KEYS.includes(k))) return fail('SCADA_REQUEST_INVALID')
    const ref = presetRef(body)
    if (!ref.ok) return ref
    return ok({ kind: 'PRESET', presetId: ref.value.presetId, presetVersion: ref.value.presetVersion, mode: m.value })
  }
  if (body['presetVersion'] !== undefined) return fail('SCADA_REQUEST_INVALID')

  const sources = uniqueStrings(body['sourceCatalogIds'], isCatalogId, limits.preset.maxSourceCount)
  if (!sources.ok) return sources
  const series = uniqueStrings(body['seriesKeys'], safeText, limits.preset.maxSeriesCount)
  if (!series.ok) return series
  const range = periodOf(body['startAt'], body['endAt'], limits)
  if (!range.ok) return range
  const iv = interval(body['bucketInterval'])
  if (!iv.ok) return iv
  const tz = timezone(body['timezone'])
  if (!tz.ok) return tz
  const stats = statistics(body['statistics'])
  if (!stats.ok) return stats
  let virtualColumnIds: string[] = []
  if (body['virtualColumnIds'] !== undefined) {
    const vcs = uniqueStrings(body['virtualColumnIds'], v => typeof v === 'string' && VC_ID.test(v), limits.preset.maxVirtualColumnCount)
    if (!vcs.ok) return vcs
    virtualColumnIds = vcs.value
  }
  return ok({ kind: 'EXPLICIT', mode: m.value, sourceCatalogIds: sources.value, seriesKeys: series.value, virtualColumnIds, statistics: stats.value, period: range.value, bucketInterval: iv.value, timezone: tz.value })
}

function mappingSide(v: unknown): { sourceCatalogId: string; seriesKey: string } | null {
  if (!isObj(v) || Object.keys(v).some(k => k !== 'sourceCatalogId' && k !== 'seriesKey')) return null
  return isCatalogId(v['sourceCatalogId']) && safeText(v['seriesKey']) ? { sourceCatalogId: v['sourceCatalogId'], seriesKey: v['seriesKey'] } : null
}

function seriesMapping(v: unknown, limits: ScadaApiLimits, required: boolean): ValidationResult<SeriesMappingEntry[]> {
  if (v === undefined) return required ? fail('SCADA_MAPPING_REQUIRED') : ok([])
  if (!Array.isArray(v)) return fail('SCADA_REQUEST_INVALID')
  if (v.length === 0) return required ? fail('SCADA_MAPPING_REQUIRED') : ok([])
  if (v.length > limits.maxSeriesMappings) return fail('SCADA_LIMIT_EXCEEDED')
  const out: SeriesMappingEntry[] = []
  for (const e of v) {
    if (!isObj(e) || Object.keys(e).some(k => k !== 'baseline' && k !== 'comparison')) return fail('SCADA_REQUEST_INVALID')
    const baseline = mappingSide(e['baseline'])
    const comparison = mappingSide(e['comparison'])
    if (!baseline || !comparison) return fail('SCADA_REQUEST_INVALID')
    out.push({ baseline, comparison })
  }
  return ok(out)
}

/**
 * SOURCE mapping: either the internal { baseline, comparison } entries or the explicit { leftSeriesKey, rightSeriesKey } pairs of the
 * screen (never mixed). Always required, never empty; a series may appear on each side at most ONCE (the same right series can never be
 * bound to two left series). Series are paired ONLY by this list — never by position or by name similarity.
 */
function sourceSeriesMapping(v: unknown, leftId: string, rightId: string, limits: ScadaApiLimits): ValidationResult<{ entries: SeriesMappingEntry[]; leftRight: boolean }> {
  if (v === undefined || (Array.isArray(v) && v.length === 0)) return fail('SCADA_MAPPING_REQUIRED')
  if (!Array.isArray(v)) return fail('SCADA_REQUEST_INVALID')
  if (v.length > limits.maxSeriesMappings) return fail('SCADA_LIMIT_EXCEEDED')
  const leftRight = isObj(v[0]) && ('leftSeriesKey' in v[0] || 'rightSeriesKey' in v[0])
  let entries: SeriesMappingEntry[]
  if (leftRight) {
    entries = []
    for (const e of v) {
      if (!isObj(e) || Object.keys(e).some(k => k !== 'leftSeriesKey' && k !== 'rightSeriesKey') || !safeText(e['leftSeriesKey']) || !safeText(e['rightSeriesKey'])) return fail('SCADA_REQUEST_INVALID')
      entries.push({ baseline: { sourceCatalogId: leftId, seriesKey: e['leftSeriesKey'] }, comparison: { sourceCatalogId: rightId, seriesKey: e['rightSeriesKey'] } })
    }
  } else {
    const parsed = seriesMapping(v, limits, true)
    if (!parsed.ok) return parsed
    entries = parsed.value
  }
  const lefts = new Set(entries.map(e => e.baseline.sourceCatalogId + '\u0000' + e.baseline.seriesKey))
  const rights = new Set(entries.map(e => e.comparison.sourceCatalogId + '\u0000' + e.comparison.seriesKey))
  if (lefts.size !== entries.length || rights.size !== entries.length) return fail('SCADA_REQUEST_INVALID') // a duplicate left or right series
  return ok({ entries, leftRight })
}

export function validateComparisonRequest(routeCode: unknown, body: unknown, limits: ScadaApiLimits): ValidationResult<CleanCompareRequest> {
  const route = validateRouteCode(routeCode)
  if (!route.ok) return route
  if (!isObj(body)) return fail('SCADA_REQUEST_INVALID')
  const unknownKey = checkKeys(body, COMPARE_KEYS)
  if (unknownKey) return fail(unknownKey)
  const artifactMismatch = checkArtifactCode(body, route.value)
  if (artifactMismatch) return fail(artifactMismatch)

  if (body['presetId'] !== undefined) {
    if (Object.keys(body).some(k => !PRESET_ONLY_KEYS.includes(k))) return fail('SCADA_REQUEST_INVALID')
    const ref = presetRef(body)
    if (!ref.ok) return ref
    return ok({ kind: 'PRESET', presetId: ref.value.presetId, presetVersion: ref.value.presetVersion })
  }
  if (body['presetVersion'] !== undefined) return fail('SCADA_REQUEST_INVALID')
  if (body['mode'] !== 'PERIOD' && body['mode'] !== 'SOURCE') return fail('SCADA_REQUEST_INVALID')

  // a SOURCE comparison with the explicit { leftSeriesKey, rightSeriesKey } mapping derives its series from that mapping (nothing is inferred from a name)
  const derivedSeries = body['mode'] === 'SOURCE' && body['seriesKeys'] === undefined
  const series: ValidationResult<string[]> = derivedSeries ? ok([]) : uniqueStrings(body['seriesKeys'], safeText, limits.preset.maxSeriesCount)
  if (!series.ok) return series
  const iv = interval(body['bucketInterval'])
  if (!iv.ok) return iv
  const tz = timezone(body['timezone'])
  if (!tz.ok) return tz
  const stats = statistics(body['statistics'])
  if (!stats.ok) return stats
  let decimals: number | null = null
  if (body['decimals'] !== undefined) {
    if (typeof body['decimals'] !== 'number' || !Number.isSafeInteger(body['decimals']) || body['decimals'] < 0) return fail('SCADA_REQUEST_INVALID')
    decimals = body['decimals']
  }

  if (body['mode'] === 'PERIOD') {
    if (body['period'] !== undefined || body['leftSourceCatalogId'] !== undefined || body['rightSourceCatalogId'] !== undefined) return fail('SCADA_REQUEST_INVALID')
    const sources = uniqueStrings(body['sourceCatalogIds'], isCatalogId, limits.preset.maxSourceCount)
    if (!sources.ok) return sources
    const baseline = period(body['baseline'], limits)
    if (!baseline.ok) return baseline
    const comparison = period(body['comparison'], limits)
    if (!comparison.ok) return comparison
    const mapping = seriesMapping(body['seriesMapping'], limits, false)
    if (!mapping.ok) return mapping
    return ok({ kind: 'EXPLICIT', mode: 'PERIOD', sourceCatalogIds: sources.value, seriesKeys: series.value, statistics: stats.value, baseline: baseline.value, comparison: comparison.value, seriesMapping: mapping.value, decimals, bucketInterval: iv.value, timezone: tz.value })
  }

  if (body['baseline'] !== undefined || body['comparison'] !== undefined || body['sourceCatalogIds'] !== undefined) return fail('SCADA_REQUEST_INVALID')
  if (body['leftSourceCatalogId'] === undefined || body['rightSourceCatalogId'] === undefined) return fail('SCADA_MAPPING_REQUIRED')
  if (!isCatalogId(body['leftSourceCatalogId']) || !isCatalogId(body['rightSourceCatalogId']) || body['leftSourceCatalogId'] === body['rightSourceCatalogId']) return fail('SCADA_REQUEST_INVALID')
  const shared = period(body['period'], limits)
  if (!shared.ok) return shared
  const mapping = sourceSeriesMapping(body['seriesMapping'], body['leftSourceCatalogId'], body['rightSourceCatalogId'], limits) // a source comparison never pairs series by position or by name
  if (!mapping.ok) return mapping
  let seriesKeys = series.value
  if (derivedSeries) {
    if (!mapping.value.leftRight) return fail('SCADA_REQUEST_INVALID') // seriesKeys may be omitted only with the { leftSeriesKey, rightSeriesKey } mapping
    seriesKeys = [...new Set(mapping.value.entries.flatMap(e => [e.baseline.seriesKey, e.comparison.seriesKey]))]
    if (seriesKeys.length > limits.preset.maxSeriesCount) return fail('SCADA_LIMIT_EXCEEDED')
  }
  return ok({ kind: 'EXPLICIT', mode: 'SOURCE', leftSourceCatalogId: body['leftSourceCatalogId'], rightSourceCatalogId: body['rightSourceCatalogId'], seriesKeys, statistics: stats.value, period: shared.value, seriesMapping: mapping.value.entries, decimals, bucketInterval: iv.value, timezone: tz.value })
}

export function validatePresetIdParam(id: unknown): ValidationResult<string> {
  return typeof id === 'string' && PRESET_ID.test(id) ? ok(id) : fail('SCADA_REQUEST_INVALID')
}

// ---------------------------------------------------------------- development virtual columns (TASK-027.71-R1)

export interface CleanVirtualColumnRequest {
  label: string
  unit: string
  catalogId: string
  seriesKey: string
  expression: string
  inputSeriesKeys: string[]
}

const VC_KEYS = ['label', 'unit', 'catalogId', 'seriesKey', 'expression', 'inputSeriesKeys']
const VC_SERIES_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/

/**
 * ONLY the fields of the TASK-027.70 definition that a user may author. Everything else — tenant / root, role, permissions, SQL,
 * schema, database, table, connection string, version, status, createdBy, AST, value type — is unknown here and refused: those
 * are server-generated or server-derived. `name` is NOT a field of the contract: it is refused (only `label` exists; AI1 decision Q-W541).
 * The expression text is bounded here; its LANGUAGE is judged by the 027.70 parser/validator, and it is never echoed in an error.
 */
export function validateVirtualColumnRequest(body: unknown, limits: ScadaApiLimits): ValidationResult<CleanVirtualColumnRequest> {
  if (!isObj(body)) return fail('SCADA_REQUEST_INVALID')
  const unknownKey = checkKeys(body, VC_KEYS)
  if (unknownKey) return fail(unknownKey)
  const label = body['label']
  if (!safeText(label) || !safeText(body['unit']) || (body['unit'] as string).length > 32) return fail('SCADA_REQUEST_INVALID')
  if (!isCatalogId(body['catalogId'])) return fail('SCADA_REQUEST_INVALID')
  if (typeof body['seriesKey'] !== 'string' || !VC_SERIES_KEY.test(body['seriesKey'])) return fail('SCADA_REQUEST_INVALID')
  const expression = body['expression']
  if (typeof expression !== 'string' || expression.trim() === '' || CONTROL.test(expression.replace(/[\t\n\r]/g, ' '))) return fail('SCADA_REQUEST_INVALID')
  if (expression.length > limits.virtualColumn.maxExpressionLength) return fail('SCADA_LIMIT_EXCEEDED')
  const inputs = uniqueStrings(body['inputSeriesKeys'], safeText, limits.preset.maxSeriesCount)
  if (!inputs.ok) return inputs
  return ok({ label: label as string, unit: body['unit'] as string, catalogId: body['catalogId'], seriesKey: body['seriesKey'], expression, inputSeriesKeys: inputs.value })
}

export function validateVirtualColumnIdParam(id: unknown): ValidationResult<string> {
  return typeof id === 'string' && VC_ID.test(id) ? ok(id) : fail('SCADA_REQUEST_INVALID')
}

// ---------------------------------------------------------------- export (TASK-027.74)

export function validateExportFormat(v: unknown): ValidationResult<ScadaExportFormat> {
  return typeof v === 'string' && (SCADA_EXPORT_FORMATS as readonly string[]).includes(v) ? ok(v as ScadaExportFormat) : fail('SCADA_EXPORT_FORMAT_INVALID')
}

export interface CleanExportRequest {
  kind: 'ANALYSIS' | 'COMPARISON'
  /** The nested request, handed on UNCHANGED to the existing 027.72 validators (analysis or comparison) — nothing else steers an export. */
  body: unknown
}

/** `{ analysis: <query body> }` XOR `{ comparison: <compare body> }`: the export repeats the exact request the screen sent. */
export function validateExportBody(body: unknown): ValidationResult<CleanExportRequest> {
  if (!isObj(body)) return fail('SCADA_REQUEST_INVALID')
  const unknownKey = checkKeys(body, ['analysis', 'comparison'])
  if (unknownKey) return fail(unknownKey)
  const hasAnalysis = body['analysis'] !== undefined
  const hasComparison = body['comparison'] !== undefined
  if (hasAnalysis === hasComparison) return fail('SCADA_REQUEST_INVALID')
  const nested = hasAnalysis ? body['analysis'] : body['comparison']
  if (!isObj(nested)) return fail('SCADA_REQUEST_INVALID')
  return ok({ kind: hasAnalysis ? 'ANALYSIS' : 'COMPARISON', body: nested })
}

export interface CleanPngCompletion {
  exportId: string
  outcome: 'SUCCEEDED' | 'FAILED'
}

/** `{ exportId, outcome }` and nothing else (no tenant, actor, artifact, row or count: those come from the pending export the server registered). */
export function validatePngCompletion(body: unknown): ValidationResult<CleanPngCompletion> {
  if (!isObj(body)) return fail('SCADA_REQUEST_INVALID')
  const unknownKey = checkKeys(body, ['exportId', 'outcome'])
  if (unknownKey) return fail(unknownKey)
  const id = body['exportId']
  const outcome = body['outcome']
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(id)) return fail('SCADA_REQUEST_INVALID')
  if (outcome !== 'SUCCEEDED' && outcome !== 'FAILED') return fail('SCADA_REQUEST_INVALID')
  return ok({ exportId: id, outcome })
}

// ---------------------------------------------------------------- development presets (TASK-027.59-R1)

export interface CleanPresetRequest {
  name: string
  description: string | null
  scope: 'PRIVATE' | 'TENANT_SHARED'
  sourceCatalogIds: string[]
  seriesKeys: string[]
  virtualColumns: Array<{ virtualColumnId: string; version?: number }>
  statistics: PresetStatistic[]
  comparison:
    | { mode: 'NONE' }
    | { mode: 'PERIOD'; comparisonRange: CleanPeriod }
    | { mode: 'SOURCE'; leftSourceCatalogId: string; rightSourceCatalogId: string; seriesMapping: SeriesMappingEntry[] }
  timeRange: CleanPeriod
  bucketInterval: ScadaInterval
  timezone: string
  chartType: 'LINE' | 'BAR' | 'AREA' | 'TABLE'
}

const PRESET_KEYS = ['name', 'description', 'scope', 'sourceCatalogIds', 'seriesKeys', 'virtualColumns', 'statistics', 'comparison', 'timeRange', 'bucketInterval', 'timezone', 'chartType']

/**
 * The ONLY fields a client may author for a preset. tenant / root / role / permissions / status / version / owner / createdBy / id / validity
 * dates and any expression are NOT accepted (an unknown field is refused): the server generates them. For a SOURCE comparison the sources
 * and series come ONLY from the explicit mapping (sourceCatalogIds / seriesKeys must be absent).
 */
export function validatePresetCreateRequest(body: unknown, limits: ScadaApiLimits): ValidationResult<CleanPresetRequest> {
  if (!isObj(body)) return fail('SCADA_REQUEST_INVALID')
  const unknownKey = checkKeys(body, PRESET_KEYS)
  if (unknownKey) return fail(unknownKey)
  if (!safeText(body['name']) || body['name'].length > limits.preset.maxNameLength) return fail('SCADA_REQUEST_INVALID')
  let description: string | null = null
  if (body['description'] !== undefined && body['description'] !== null) {
    if (!safeText(body['description']) || body['description'].length > limits.preset.maxDescriptionLength) return fail('SCADA_REQUEST_INVALID')
    description = body['description']
  }
  if (body['scope'] !== 'PRIVATE' && body['scope'] !== 'TENANT_SHARED') return fail('SCADA_REQUEST_INVALID')
  const range = period(body['timeRange'], limits)
  if (!range.ok) return range
  const iv = interval(body['bucketInterval'])
  if (!iv.ok) return iv
  const tz = timezone(body['timezone'])
  if (!tz.ok) return tz
  const stats = statistics(body['statistics'])
  if (!stats.ok) return stats
  if (stats.value === null) return fail('SCADA_STATISTIC_INVALID')
  const chartType = body['chartType'] === undefined ? 'LINE' : body['chartType']
  if (chartType !== 'LINE' && chartType !== 'BAR' && chartType !== 'AREA' && chartType !== 'TABLE') return fail('SCADA_REQUEST_INVALID')
  const virtualColumns: CleanPresetRequest['virtualColumns'] = []
  if (body['virtualColumns'] !== undefined) {
    const raw = body['virtualColumns']
    if (!Array.isArray(raw)) return fail('SCADA_REQUEST_INVALID')
    if (raw.length > limits.preset.maxVirtualColumnCount) return fail('SCADA_LIMIT_EXCEEDED')
    for (const e of raw) {
      if (!isObj(e) || Object.keys(e).some(k => k !== 'virtualColumnId' && k !== 'version') || typeof e['virtualColumnId'] !== 'string' || !VC_ID.test(e['virtualColumnId']) || (e['version'] !== undefined && !posInt(e['version']))) return fail('SCADA_REQUEST_INVALID')
      virtualColumns.push({ virtualColumnId: e['virtualColumnId'], ...(e['version'] !== undefined ? { version: e['version'] as number } : {}) })
    }
    if (new Set(virtualColumns.map(v => v.virtualColumnId)).size !== virtualColumns.length) return fail('SCADA_REQUEST_INVALID')
  }
  const cmp = body['comparison']
  if (!isObj(cmp)) return fail('SCADA_REQUEST_INVALID')
  const base = { name: body['name'], description, scope: body['scope'] as 'PRIVATE' | 'TENANT_SHARED', virtualColumns, statistics: stats.value, timeRange: range.value, bucketInterval: iv.value, timezone: tz.value, chartType: chartType as CleanPresetRequest['chartType'] }
  if (cmp['mode'] === 'SOURCE') {
    if (checkKeys(cmp, ['mode', 'leftSourceCatalogId', 'rightSourceCatalogId', 'seriesMapping'])) return fail('SCADA_REQUEST_UNKNOWN_FIELD')
    if (body['sourceCatalogIds'] !== undefined || body['seriesKeys'] !== undefined) return fail('SCADA_REQUEST_INVALID')
    if (!isCatalogId(cmp['leftSourceCatalogId']) || !isCatalogId(cmp['rightSourceCatalogId']) || cmp['leftSourceCatalogId'] === cmp['rightSourceCatalogId']) return fail('SCADA_REQUEST_INVALID')
    const mapping = sourceSeriesMapping(cmp['seriesMapping'], cmp['leftSourceCatalogId'], cmp['rightSourceCatalogId'], limits)
    if (!mapping.ok) return mapping
    if (!mapping.value.leftRight) return fail('SCADA_REQUEST_INVALID')
    const seriesKeys = [...new Set(mapping.value.entries.flatMap(e => [e.baseline.seriesKey, e.comparison.seriesKey]))]
    if (seriesKeys.length > limits.preset.maxSeriesCount) return fail('SCADA_LIMIT_EXCEEDED')
    return ok({ ...base, sourceCatalogIds: [cmp['leftSourceCatalogId'], cmp['rightSourceCatalogId']], seriesKeys, comparison: { mode: 'SOURCE', leftSourceCatalogId: cmp['leftSourceCatalogId'], rightSourceCatalogId: cmp['rightSourceCatalogId'], seriesMapping: mapping.value.entries } })
  }
  const sources = uniqueStrings(body['sourceCatalogIds'], isCatalogId, limits.preset.maxSourceCount)
  if (!sources.ok) return sources
  const series = uniqueStrings(body['seriesKeys'], safeText, limits.preset.maxSeriesCount)
  if (!series.ok) return series
  if (cmp['mode'] === 'NONE') {
    if (checkKeys(cmp, ['mode'])) return fail('SCADA_REQUEST_UNKNOWN_FIELD')
    return ok({ ...base, sourceCatalogIds: sources.value, seriesKeys: series.value, comparison: { mode: 'NONE' } })
  }
  if (cmp['mode'] === 'PERIOD') {
    if (checkKeys(cmp, ['mode', 'comparisonRange'])) return fail('SCADA_REQUEST_UNKNOWN_FIELD')
    const cr = period(cmp['comparisonRange'], limits)
    if (!cr.ok) return cr
    return ok({ ...base, sourceCatalogIds: sources.value, seriesKeys: series.value, comparison: { mode: 'PERIOD', comparisonRange: cr.value } })
  }
  return fail('SCADA_REQUEST_INVALID')
}
