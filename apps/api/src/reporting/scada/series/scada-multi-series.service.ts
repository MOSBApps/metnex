import { assertMappableTenant } from '../catalog/tenant-guards'
import { SCADA_DATA_QUALITY_STATES, type ScadaDataQualityState } from '../quality/scada-data-quality.contract'
import { classifyBucket, summariseQuality, toOutputBucket } from './series-quality'
import { computeStatistics, emptyStatistics } from './series-statistics'
import {
  MAX_SERIES_LABEL_LENGTH,
  MAX_SERIES_UNIT_LENGTH,
  type ScadaChartConsumption,
  type ScadaMultiSeriesResult,
  type ScadaOutputBucket,
  type ScadaSeriesBucketInput,
  type ScadaSeriesCode,
  type ScadaSeriesInput,
  type ScadaSeriesOutput,
  type ScadaSeriesRequest,
} from './scada-series.contract'

const STATES: readonly string[] = SCADA_DATA_QUALITY_STATES
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v))
// eslint-disable-next-line no-control-regex
const HAS_CONTROL = /[\u0000-\u001f\u007f]/

function bucketValid(b: unknown): b is ScadaSeriesBucketInput {
  if (!b || typeof b !== 'object') return false
  const x = b as Record<string, unknown>
  return (
    typeof x['recordId'] === 'string' && x['recordId'] !== '' &&
    (x['bucketStartUtc'] === null || isIso(x['bucketStartUtc'])) &&
    (x['value'] === null || typeof x['value'] === 'number') &&
    STATES.includes(x['dataQuality'] as string) &&
    Array.isArray(x['qualityFlags']) && (x['qualityFlags'] as unknown[]).every(f => STATES.includes(f as string)) &&
    typeof x['isComplete'] === 'boolean' &&
    (x['isBufferRow'] === undefined || typeof x['isBufferRow'] === 'boolean')
  )
}

/** Only bounded, printable text may reach an output (no unbounded user text). */
const safeText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !HAS_CONTROL.test(v)

function seriesShapeValid(s: unknown): s is ScadaSeriesInput {
  if (!s || typeof s !== 'object') return false
  const x = s as Record<string, unknown>
  return (
    safeText(x['seriesKey'], 128) && safeText(x['label'], MAX_SERIES_LABEL_LENGTH) && (x['unit'] === '' || safeText(x['unit'], MAX_SERIES_UNIT_LENGTH)) && // '' = the unit is not verified (TASK-027.73-R2)
    (x['valueType'] === 'INDEX' || x['valueType'] === 'REAL_VALUE') &&
    safeText(x['sourceCatalogId'], 128) && safeText(x['customerRootTenantId'], 128) &&
    typeof x['mappingResolved'] === 'boolean' && typeof x['analysisAllowed'] === 'boolean' &&
    Array.isArray(x['buckets']) && (x['buckets'] as unknown[]).every(bucketValid)
  )
}

const emptySummary = (analysisAllowed: boolean) => summariseQuality([], analysisAllowed)

function blockedOutput(base: { seriesKey: string; label: string; unit: string; valueType: ScadaSeriesOutput['valueType']; sourceCatalogId: string; customerRootTenantId: string }, code: ScadaSeriesCode): ScadaSeriesOutput {
  return {
    ...base,
    analysisAllowed: false,
    status: 'BLOCKED',
    codes: [code],
    buckets: [],
    statistics: emptyStatistics('BLOCKED', { count: 0, validCount: 0, missingCount: 0, invalidCount: 0, incompleteCount: 0 }),
    qualitySummary: emptySummary(false),
    outOfRangeBuckets: 0,
  }
}

/**
 * Multi-series statistics (TASK-027.68). PURE: no I/O, no audit, no logging, deterministic, never mutates its input.
 * Tenant-isolated (a foreign series appears in NO output), series-isolated (one series' problem never reaches another),
 * quality-honest (invalid / unresolved / incomplete buckets are counted, never aggregated, never turned into 0).
 */
export class ScadaMultiSeriesService {
  build(request: ScadaSeriesRequest): ScadaMultiSeriesResult {
    const scope = request?.scope
    const range = request?.range
    const invalidResult = (root: string): ScadaMultiSeriesResult => ({ status: 'BLOCKED', code: 'INVALID_STATISTICS_INPUT', customerRootTenantId: root, interval: request?.interval === 'DAILY' ? 'DAILY' : 'HOURLY', range: { startAt: '', endAt: '' }, series: [], excluded: [] })
    if (
      !scope || typeof scope.customerRootTenantId !== 'string' || scope.customerRootTenantId === '' || typeof scope.tenantId !== 'string' || !Array.isArray(scope.dataScopeTenantIds) ||
      !range || !isIso(range.startAt) || !isIso(range.endAt) || Date.parse(range.startAt) >= Date.parse(range.endAt) ||
      (request.interval !== 'HOURLY' && request.interval !== 'DAILY') || !Array.isArray(request.series)
    ) {
      return invalidResult(typeof scope?.customerRootTenantId === 'string' ? scope.customerRootTenantId : '')
    }
    const startMs = Date.parse(range.startAt)
    const endMs = Date.parse(range.endAt)
    const root = scope.customerRootTenantId

    const outputs: ScadaSeriesOutput[] = []
    const excluded: ScadaMultiSeriesResult['excluded'] = []
    let foreign = 0

    for (const raw of request.series) {
      const rawRoot = raw && typeof raw === 'object' ? (raw as { customerRootTenantId?: unknown }).customerRootTenantId : undefined
      // ---- TENANT FILTER first: a series of another root appears in NO output (not even by name)
      if (typeof rawRoot === 'string' && rawRoot !== root) {
        foreign += 1
        continue
      }
      if (!seriesShapeValid(raw)) {
        // isolated: only static, safe identifiers of the series are reported (when they are safe text)
        const r = raw as Partial<Record<'seriesKey' | 'sourceCatalogId', unknown>> | null
        const key = r && safeText(r.seriesKey, 128) ? r.seriesKey : null
        const src = r && safeText(r.sourceCatalogId, 128) ? r.sourceCatalogId : null
        excluded.push({ seriesKey: key, sourceCatalogId: src, code: 'INVALID_STATISTICS_INPUT' })
        if (key && src && typeof rawRoot === 'string') {
          outputs.push(blockedOutput({ seriesKey: key, label: '', unit: '', valueType: 'INDEX', sourceCatalogId: src, customerRootTenantId: root }, 'INVALID_STATISTICS_INPUT'))
        }
        continue
      }
      // the mapped tenant must be inside the resolved data scope; another tenant's series never enters
      if (raw.tenant && !scope.dataScopeTenantIds.includes(raw.tenant.id)) {
        foreign += 1
        continue
      }
      const base = { seriesKey: raw.seriesKey, label: raw.label, unit: raw.unit, valueType: raw.valueType, sourceCatalogId: raw.sourceCatalogId, customerRootTenantId: root }
      // unresolved / inactive mapping, platform root, the excluded organisation: no analysis result at all, data omitted
      let mappable = raw.mappingResolved && raw.tenant !== null
      if (mappable) {
        try {
          assertMappableTenant(raw.tenant)
        } catch {
          mappable = false
        }
      }
      if (!mappable) {
        outputs.push(blockedOutput(base, 'TENANT_SCOPE_BLOCKED'))
        excluded.push({ seriesKey: raw.seriesKey, sourceCatalogId: raw.sourceCatalogId, code: 'TENANT_SCOPE_BLOCKED' })
        continue
      }
      outputs.push(this.analyse(base, raw, startMs, endMs, excluded))
    }

    outputs.sort((a, b) => cmp(a.seriesKey, b.seriesKey) || cmp(a.sourceCatalogId, b.sourceCatalogId))
    excluded.sort((a, b) => cmp(a.seriesKey ?? '', b.seriesKey ?? '') || cmp(a.sourceCatalogId ?? '', b.sourceCatalogId ?? '') || cmp(a.code, b.code))

    const blocked = outputs.filter(s => s.status === 'BLOCKED').length
    let status: ScadaMultiSeriesResult['status'] = 'OK'
    let code: ScadaSeriesCode | null = null
    if (outputs.length === 0) {
      status = 'BLOCKED'
      code = foreign > 0 ? 'TENANT_SCOPE_BLOCKED' : 'INVALID_STATISTICS_INPUT'
    } else if (blocked === outputs.length) {
      status = 'BLOCKED'
      code = 'SERIES_ANALYSIS_BLOCKED'
    } else if (blocked > 0) {
      status = 'PARTIAL'
      code = 'MULTI_SERIES_PARTIAL_RESULT'
    }
    return { status, code, customerRootTenantId: root, interval: request.interval, range: { startAt: range.startAt, endAt: range.endAt }, series: outputs, excluded }
  }

  private analyse(base: Pick<ScadaSeriesOutput, 'seriesKey' | 'label' | 'unit' | 'valueType' | 'sourceCatalogId' | 'customerRootTenantId'>, raw: ScadaSeriesInput, startMs: number, endMs: number, excluded: ScadaMultiSeriesResult['excluded']): ScadaSeriesOutput {
    // buffer rows never count; buckets outside [startAt, endAt) are left out (counted separately); unplaced readings stay in
    let outOfRange = 0
    const kept: ScadaSeriesBucketInput[] = []
    for (const b of raw.buckets) {
      if (b.isBufferRow) continue
      if (b.bucketStartUtc !== null) {
        const ms = Date.parse(b.bucketStartUtc)
        if (ms < startMs || ms >= endMs) {
          outOfRange += 1
          continue
        }
      }
      kept.push(b)
    }
    // deterministic order: chronological, ties by recordId; readings without an instant come last (by local time, record id)
    kept.sort((a, b) => {
      if (a.bucketStartUtc !== null && b.bucketStartUtc !== null) return Date.parse(a.bucketStartUtc) - Date.parse(b.bucketStartUtc) || cmp(a.recordId, b.recordId)
      if (a.bucketStartUtc === null && b.bucketStartUtc === null) return cmp(a.localWallTime ?? '', b.localWallTime ?? '') || cmp(a.recordId, b.recordId)
      return a.bucketStartUtc === null ? 1 : -1
    })
    const buckets: ScadaOutputBucket[] = kept.map(toOutputBucket)

    // an unverified time zone can never be analysed, whatever the caller says
    const allowed = raw.analysisAllowed && !buckets.some(b => b.qualityFlags.includes('TIMEZONE_UNVERIFIED'))
    const summary = summariseQuality(buckets, allowed)
    const statistics = computeStatistics(buckets, !allowed)
    const codes: ScadaSeriesCode[] = []
    if (!allowed) codes.push('SERIES_ANALYSIS_BLOCKED')
    if (summary.dstAmbiguous + summary.dstNonexistent > 0) codes.push('DST_UNRESOLVED')
    if (summary.counterResetUnresolved > 0) codes.push('COUNTER_RESET_UNRESOLVED')
    if (summary.incompleteBuckets > 0 || buckets.some(b => !b.isComplete && b.classification !== 'MISSING')) codes.push('INCOMPLETE_BUCKET')
    let status: ScadaSeriesOutput['status'] = statistics.status
    if (allowed && statistics.validCount > 0 && (statistics.sum === null || statistics.average === null)) codes.push('INVALID_STATISTICS_INPUT') // numeric overflow: null, never a wrong number
    if (status === 'NO_VALID_DATA') codes.push('NO_VALID_DATA')
    if (!allowed) {
      status = 'BLOCKED'
      excluded.push({ seriesKey: base.seriesKey, sourceCatalogId: base.sourceCatalogId, code: 'SERIES_ANALYSIS_BLOCKED' })
    }
    return { ...base, analysisAllowed: allowed, status, codes: [...new Set(codes)], buckets, statistics, qualitySummary: summary, outOfRangeBuckets: outOfRange }
  }
}

/**
 * The pure output the chart screen (TASK-027.73) consumes directly: per series title/unit, points with value + quality +
 * missing/suspect markers, statistics, quality summary, the filtered range and static block codes. Gaps stay gaps.
 */
export function toChartConsumption(result: ScadaMultiSeriesResult): ScadaChartConsumption {
  return {
    status: result.status,
    code: result.code,
    interval: result.interval,
    range: { ...result.range },
    excluded: result.excluded.map(e => ({ ...e })),
    series: result.series.map(s => ({
      seriesKey: s.seriesKey,
      sourceCatalogId: s.sourceCatalogId,
      title: s.label,
      unit: s.unit,
      valueType: s.valueType,
      analysisAllowed: s.analysisAllowed,
      status: s.status,
      codes: [...s.codes],
      points: s.buckets.map(b => ({
        t: b.bucketStartUtc,
        value: b.value,
        quality: b.dataQuality,
        missing: b.classification === 'MISSING',
        suspect: b.classification !== 'VALID',
      })),
      statistics: { ...s.statistics },
      qualitySummary: { ...s.qualitySummary },
    })),
  }
}

export type { ScadaDataQualityState }
export { classifyBucket }
