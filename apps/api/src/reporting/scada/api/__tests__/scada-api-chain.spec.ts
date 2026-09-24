import type { ScadaOrchestratedReadPort, ScadaQueryAuditEntry } from '../../adapter/scada-readonly.port'
import type { CatalogService } from '../../catalog/catalog.service'
import type { TenantRecord } from '../../catalog/tenant-guards'
import type { ScadaPreset } from '../../presets/scada-preset.contract'
import { ScadaAnalysisQueryService } from '../../query/scada-analysis-query.service'
import { ScadaApiError, type ScadaApiLimits, type ScadaApiSource } from '../scada-api.contract'
import { ScadaAnalysisApiService, type ScadaAnalysisApiDeps } from '../scada-analysis-api.service'

/**
 * TASK-027.72-R1 — the API chain over the REAL 027.65 query service (synthetic source rows, no database):
 * Query → Quality/Rollover → Hourly/Daily Aggregation (027.66) → Multi-Series → Comparison → Response.
 * Every number below is a TEST parameter, not a proposed production limit.
 */
const ROOT = 'root-1'
const TENANT = 'tenant-1'
const CAT1 = '00000000-0000-4000-8000-000000000001'
const CAT2 = '00000000-0000-4000-8000-000000000002'
const HOUR = 3_600_000
const NOW = Date.parse('2026-12-01T00:00:00.000Z')
const LIMITS: ScadaApiLimits = {
  preset: { maxNameLength: 80, maxDescriptionLength: 200, maxSourceCount: 4, maxSeriesCount: 6, maxVirtualColumnCount: 3, maxPageSize: 50 },
  virtualColumn: { maxExpressionLength: 100, maxAstDepth: 8, maxOperatorCount: 10, maxRoundDecimals: 4, maxAbsoluteResult: 1e12 },
  maxPeriodMs: 60 * 24 * HOUR,
  maxSeriesMappings: 8,
}
const tenant = (over: Partial<TenantRecord> = {}): TenantRecord => ({ id: TENANT, type: 'STANDARD', status: 'ACTIVE', slug: 'tenant-one', ...over })
const scope = { tenantId: TENANT, customerRootTenantId: ROOT, dataScopeTenantIds: [TENANT] }

type Row = Record<string, unknown>
const localRow = (wall: string, values: Record<string, number | null>): Row => ({ D: wall.slice(0, 10), T: wall.slice(11, 19), ...values })
const pad = (n: number) => String(n).padStart(2, '0')
/** hourly NAIVE local wall rows of one day starting at 00:00 (no DST) */
/** consecutive hourly naive local rows starting at `date` 00:00, rolling over into the next days (no DST) */
const spanRows = (date: string, hours: number, values: (h: number) => Record<string, number | null>): Row[] =>
  Array.from({ length: hours }, (_, h) => {
    const d = new Date(Date.parse(`${date}T00:00:00.000Z`) + h * HOUR)
    return localRow(d.toISOString().slice(0, 19), values(h))
  })
const dayRows = (date: string, hours: number, values: (h: number) => Record<string, number | null>): Row[] => Array.from({ length: hours }, (_, h) => localRow(`${date}T${pad(h)}:00:00`, values(h)))

function apiSource(zone: string, over: Partial<ScadaApiSource> = {}, catalogId = CAT1): ScadaApiSource {
  return {
    catalogId, customerRootTenantId: ROOT, displayName: catalogId === CAT1 ? 'Kaynak Bir' : 'Kaynak İki', active: true, mappingResolved: true, tenant: tenant(), sourceTimeZone: zone,
    table: 'phys_table', dateColumn: 'D', timeColumn: 'T',
    series: [{ seriesKey: 'A', label: 'Seri A', unit: 'kWh', valueType: 'INDEX' }, { seriesKey: 'B', label: 'Seri B', unit: 'kWh', valueType: 'INDEX' }],
    ...over,
  }
}

interface Env {
  audits: ScadaQueryAuditEntry[]
  service: ScadaAnalysisApiService
  reads: () => number
}

function env(zone: string, rows: Row[] | ((catalogId: string) => Row[]), opt: { sources?: ScadaApiSource[]; deny?: string; failAudit?: boolean; deps?: Partial<ScadaAnalysisApiDeps>; valueKinds?: 'NUMERIC' } = {}): Env {
  const audits: ScadaQueryAuditEntry[] = []
  let reads = 0
  let k = 0
  const audit = { record: async (e: ScadaQueryAuditEntry) => (opt.failAudit ? Promise.reject(new Error('audit down')) : void audits.push(e)) }
  const catalog = {
    evaluateQueryAccess: async (_s: unknown, id: string) =>
      opt.deny
        ? { ok: false as const, reasons: [opt.deny] }
        : { ok: true as const, profile: { catalogId: id, version: 1, sourceTimeZone: zone, limitProfile: { timeoutMs: 1, maxRows: 1e6, maxColumns: 64, maxPayloadBytes: 1e9, maxRangeMs: 90 * 24 * HOUR, poolSize: 1, maxConcurrent: 1 }, table: 'phys_table', dateColumn: 'D', timeColumn: 'T', columnKinds: { D: 'DATE', T: 'TIME', A: 'NUMERIC', B: 'NUMERIC' } } },
  } as unknown as Pick<CatalogService, 'evaluateQueryAccess'>
  const adapter: ScadaOrchestratedReadPort = {
    listSources: async () => [],
    readUnaudited: async (_a, _s, req) => {
      reads += 1
      const served = typeof rows === 'function' ? rows(req.catalogId) : rows
      return { ok: true, rows: served.map(r => ({ ...r })), rowCount: served.length, columnCount: req.columns.length, durationMs: 0 }
    },
  }
  const query = new ScadaAnalysisQueryService({ catalog, adapter, audit, correlationId: () => `q-${(k += 1)}`, nowMs: () => NOW, windowConfig: () => ({ forwardBufferMs: HOUR }) })
  let n = 0
  const deps: ScadaAnalysisApiDeps = {
    scopes: { resolve: async () => scope },
    callers: { describe: async () => ({ tenant: tenant(), userActive: true }) },
    artifacts: { assertExists: async () => undefined },
    clock: { nowMs: () => NOW, correlationId: () => `api-${(n += 1)}` },
    audit,
    sources: { listSources: async () => opt.sources ?? [apiSource(zone)] },
    query,
    presets: { listPresetVersions: async () => [] },
    limits: { get: () => LIMITS },
    ...opt.deps,
  }
  return { audits, service: new ScadaAnalysisApiService(deps), reads: () => reads }
}

const call = (body: unknown) => ({ actor: { id: 'u-1' }, tenantId: TENANT, routeCode: 'HOURLY_CONSUMPTION', body })
const body = (zone: string, over: Record<string, unknown> = {}) => ({ sourceCatalogIds: [CAT1], seriesKeys: ['A'], startAt: '2026-02-01T00:00:00.000Z', endAt: '2026-02-01T04:00:00.000Z', bucketInterval: 'HOURLY', timezone: zone, ...over })
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: ScadaApiError) => e.code)

describe('Query → Quality/Rollover → Aggregation → Multi-Series (real query service)', () => {
  const ZONE = 'Europe/Istanbul' // fixed +03:00
  const rows = dayRows('2026-02-01', 8, h => ({ A: 1000 + 5 * h, B: 2000 + 10 * h })) // local 00:00.. = 2026-01-31T21:00Z..

  it('hourly deltas come out of the chain with their quality, statistics and audit (one record per source)', async () => {
    const e = env(ZONE, rows)
    const r = await e.service.runAnalysis(call(body(ZONE, { startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T01:00:00.000Z', seriesKeys: ['A', 'B'], statistics: ['SUM', 'COUNT'] })))
    expect(r).toMatchObject({ status: 'OK', interval: 'HOURLY', code: null })
    expect(r.series.map(s => [s.seriesKey, s.points.map(p => p.value)])).toEqual([['A', [5, 5, 5, 5]], ['B', [10, 10, 10, 10]]])
    expect(r.series[0]!.statistics).toEqual({ status: 'OK', sum: 20, count: 4 })
    expect(e.audits.map(a => [a.actionCode, a.reasonCode, a.entityId])).toEqual([['SCADA_QUERY_SUCCEEDED', 'OK', CAT1]]) // exactly ONE record, written by the query service
    expect(e.reads()).toBe(1)
  })

  it('DAILY INDEX = SUM through 027.66: one local day of 24 × 5 kWh = 120, labelled at the LOCAL midnight instant', async () => {
    const e = env(ZONE, dayRows('2026-02-01', 24, h => ({ A: 1000 + 5 * h })).concat(dayRows('2026-02-02', 2, h => ({ A: 1000 + 5 * (24 + h) }))))
    const r = await e.service.runAnalysis(call(body(ZONE, { startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T21:00:00.000Z', bucketInterval: 'DAILY' })))
    expect(r.interval).toBe('DAILY')
    expect(r.series[0]!.points).toHaveLength(1)
    expect(r.series[0]!.points[0]).toMatchObject({ t: '2026-01-31T21:00:00.000Z', value: 120, quality: 'VALID', isComplete: true })
    expect(r.series[0]!.statistics).toMatchObject({ sum: 120, count: 1, validCount: 1 })
  })

  it('DAILY with a missing hour has NO total (not a partial sum) and says why', async () => {
    const data = spanRows('2026-02-01', 26, h => ({ A: h === 9 ? null : 1000 + 5 * h }))
    const e = env(ZONE, data)
    const r = await e.service.runAnalysis(call(body(ZONE, { startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T21:00:00.000Z', bucketInterval: 'DAILY' })))
    expect(r.series[0]!.points[0]).toMatchObject({ value: null, isComplete: false })
    expect(r.status).toBe('BLOCKED')
    expect(r.series[0]!.statistics).toMatchObject({ sum: null })
  })

  it('DAILY REAL_VALUE without an explicit catalog policy is refused BEFORE anything is read, with ONE audit record', async () => {
    const real = apiSource(ZONE, { series: [{ seriesKey: 'A', label: 'A', unit: 'V', valueType: 'REAL_VALUE' }] })
    const e = env(ZONE, rows, { sources: [real] })
    expect(await codeOf(e.service.runAnalysis(call(body(ZONE, { startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T21:00:00.000Z', bucketInterval: 'DAILY' }))))).toBe('SCADA_AGGREGATION_POLICY_REQUIRED')
    expect(e.reads()).toBe(0)
    expect(e.audits).toHaveLength(1)
    expect(e.audits[0]).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED', reasonCode: 'SCADA_AGGREGATION_POLICY_REQUIRED' })
  })

  it('DAILY REAL_VALUE WITH an explicit catalog policy aggregates by that policy', async () => {
    const real = apiSource(ZONE, { series: [{ seriesKey: 'A', label: 'A', unit: 'V', valueType: 'REAL_VALUE', dailyOperation: 'AVERAGE' }] })
    const data = spanRows('2026-02-01', 26, h => ({ A: 100 + h }))
    const e = env(ZONE, data, { sources: [real] })
    const r = await e.service.runAnalysis(call(body(ZONE, { startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T21:00:00.000Z', bucketInterval: 'DAILY' })))
    expect(r.series[0]!.points[0]!.value).toBeCloseTo(111.5, 6)
  })

  it('a genuine 0 delta is VALID 0; a missing reading is null — the two never merge', async () => {
    const e = env(ZONE, dayRows('2026-02-01', 8, h => ({ A: h === 3 ? null : 1000 })))
    const r = await e.service.runAnalysis(call(body(ZONE, { startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T01:00:00.000Z' })))
    expect(r.series[0]!.points[0]).toMatchObject({ value: 0, classification: 'VALID' })
    expect(r.series[0]!.statistics).toMatchObject({ sum: 0, min: 0 })
  })

  it('an EMPTY source result is not a success: status BLOCKED with NO_VALID_DATA, no points, no numbers', async () => {
    const e = env(ZONE, [])
    const r = await e.service.runAnalysis(call(body(ZONE)))
    expect(r.status).toBe('BLOCKED')
    expect(r.code).toBe('NO_VALID_DATA')
    expect(r.series[0]).toMatchObject({ points: [], status: 'NO_VALID_DATA' })
    expect(r.series[0]!.statistics).toMatchObject({ sum: null, average: null, min: null, max: null })
  })

  it('a counter reset with no roll-over policy stays COUNTER_RESET_UNRESOLVED through the aggregation', async () => {
    const e = env(ZONE, dayRows('2026-02-01', 8, h => ({ A: h < 3 ? 1000 + 5 * h : 4 + 5 * h })))
    const r = await e.service.runAnalysis(call(body(ZONE, { startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T04:00:00.000Z' })))
    const bad = r.series[0]!.points.find(p => p.qualityFlags.includes('COUNTER_RESET_UNRESOLVED'))
    expect(bad).toMatchObject({ value: null, isComplete: false })
    expect(r.series[0]!.qualitySummary.counterResetUnresolved).toBeGreaterThan(0)
  })
})

describe('DST through the whole chain (Europe/Berlin, real query-service normalisation)', () => {
  const ZONE = 'Europe/Berlin'

  it('an AMBIGUOUS wall time (fall-back) is kept as untimed DST_AMBIGUOUS points; no substitute UTC; neighbours blocked; series not analysable', async () => {
    // local 2026-10-25: 02:00-02:59 happens twice; the source gives NO fold — two rows carry the SAME wall time
    const data = [
      localRow('2026-10-25T00:00:00', { A: 100 }), localRow('2026-10-25T01:00:00', { A: 105 }),
      localRow('2026-10-25T02:00:00', { A: 110 }), localRow('2026-10-25T02:00:00', { A: 115 }),
      localRow('2026-10-25T03:00:00', { A: 120 }), localRow('2026-10-25T04:00:00', { A: 125 }), localRow('2026-10-25T05:00:00', { A: 130 }), localRow('2026-10-25T06:00:00', { A: 135 }),
    ]
    const e = env(ZONE, data)
    const r = await e.service.runAnalysis(call(body(ZONE, { startAt: '2026-10-24T22:00:00.000Z', endAt: '2026-10-25T04:00:00.000Z' })))
    const s = r.series[0]!
    expect(s.analysisAllowed).toBe(false)
    const untimed = s.points.filter(p => p.t === null)
    expect(untimed.length).toBeGreaterThanOrEqual(2) // NOT deleted
    expect(untimed.every(p => p.qualityFlags.includes('DST_AMBIGUOUS') && p.value === null && !p.isComplete)).toBe(true)
    expect(untimed.map(p => p.localWallTime)).toEqual(untimed.map(() => '2026-10-25T02:00:00.000'))
    const timedBlocked = s.points.filter(p => p.t !== null && p.qualityFlags.includes('DST_AMBIGUOUS'))
    expect(timedBlocked.length).toBeGreaterThan(0) // the neighbouring deltas
    expect(timedBlocked.every(p => p.value === null)).toBe(true)
    expect(s.statistics).toMatchObject({ status: 'BLOCKED', sum: null })
    expect(r.status).toBe('BLOCKED')
  })

  it('a NONEXISTENT wall time (spring-forward) gets no UTC at all and is flagged DST_NONEXISTENT', async () => {
    const data = [
      localRow('2026-03-29T00:00:00', { A: 100 }), localRow('2026-03-29T01:00:00', { A: 105 }),
      localRow('2026-03-29T02:00:00', { A: 999 }), // does not exist in Europe/Berlin
      localRow('2026-03-29T03:00:00', { A: 110 }), localRow('2026-03-29T04:00:00', { A: 115 }), localRow('2026-03-29T05:00:00', { A: 120 }), localRow('2026-03-29T06:00:00', { A: 125 }),
    ]
    const e = env(ZONE, data)
    const r = await e.service.runAnalysis(call(body(ZONE, { startAt: '2026-03-28T23:00:00.000Z', endAt: '2026-03-29T03:00:00.000Z' })))
    const s = r.series[0]!
    const gap = s.points.filter(p => p.t === null)
    expect(gap.length).toBeGreaterThan(0)
    expect(gap.every(p => p.qualityFlags.includes('DST_NONEXISTENT') && p.value === null)).toBe(true)
    // the 02:00 local reading was NOT stamped with either offset: no point of that wall time carries an instant
    expect(s.points.filter(p => p.localWallTime === '2026-03-29T02:00:00.000').every(p => p.t === null)).toBe(true)
    expect(s.points.some(p => p.t !== null && p.qualityFlags.includes('DST_NONEXISTENT') && p.value === null)).toBe(true)
  })

  it('DAILY: the day with an unresolved hour has no total', async () => {
    const data = [
      ...Array.from({ length: 2 }, (_, h) => localRow(`2026-10-25T${pad(h)}:00:00`, { A: 100 + 5 * h })),
      localRow('2026-10-25T02:00:00', { A: 110 }), localRow('2026-10-25T02:00:00', { A: 115 }),
      ...Array.from({ length: 21 }, (_, i) => localRow(`2026-10-25T${pad(i + 3)}:00:00`, { A: 120 + 5 * i })),
      localRow('2026-10-26T00:00:00', { A: 300 }), localRow('2026-10-26T01:00:00', { A: 305 }),
    ]
    const e = env(ZONE, data)
    const r = await e.service.runAnalysis(call(body(ZONE, { startAt: '2026-10-24T22:00:00.000Z', endAt: '2026-10-25T23:00:00.000Z', bucketInterval: 'DAILY' })))
    expect(r.series[0]!.points.length).toBeGreaterThan(0)
    expect(r.series[0]!.points.every(p => p.value === null)).toBe(true)
    expect(r.series[0]!.points[0]!.qualityFlags).toContain('DST_AMBIGUOUS')
  })

  it('comparison keeps the unresolved baseline rows VISIBLE (invalid / blocked, with their reason) and compares nothing it cannot trust', async () => {
    const dst = [
      localRow('2026-10-25T00:00:00', { A: 100 }), localRow('2026-10-25T01:00:00', { A: 105 }), localRow('2026-10-25T02:00:00', { A: 110 }), localRow('2026-10-25T02:00:00', { A: 115 }),
      localRow('2026-10-25T03:00:00', { A: 120 }), localRow('2026-10-25T04:00:00', { A: 125 }), localRow('2026-10-25T05:00:00', { A: 130 }), localRow('2026-10-25T06:00:00', { A: 135 }),
    ]
    const clean = Array.from({ length: 8 }, (_, h) => localRow(`2026-10-26T${pad(h)}:00:00`, { A: 200 + 10 * h }))
    const e = env(ZONE, [...dst, ...clean])
    const r = await e.service.runComparison(call({
      mode: 'PERIOD', sourceCatalogIds: [CAT1], seriesKeys: ['A'], bucketInterval: 'HOURLY', timezone: ZONE,
      baseline: { startAt: '2026-10-24T22:00:00.000Z', endAt: '2026-10-25T04:00:00.000Z' }, comparison: { startAt: '2026-10-25T23:00:00.000Z', endAt: '2026-10-26T04:00:00.000Z' },
    }))
    expect(r.mode).toBe('PERIOD')
    expect(r.rows.length).toBeGreaterThan(0)
    expect(r.rows.every(x => x.status === 'BASELINE_INVALID' && x.baseline === null && x.absoluteDelta === null)).toBe(true)
    expect(r.rows.some(x => x.baselineReason === 'DUPLICATE_BUCKET' || x.baselineReason === 'SERIES_ANALYSIS_BLOCKED')).toBe(true)
    expect(r.rows.some(x => x.comparison === 10)).toBe(true) // the healthy side is still shown
    expect(r.comparability).toBe('NO_COMPARABLE_DATA')
  })
})

describe('Comparison chain (Query → Quality → Aggregation → Multi-Series → Comparison)', () => {
  const ZONE = 'Europe/Istanbul'
  it('SOURCE mode over two sources of the real query service: both audited once, values compared through the explicit mapping', async () => {
    const e = env(ZONE, cat => dayRows('2026-02-01', 8, h => ({ A: (cat === CAT1 ? 1000 : 500) + (cat === CAT1 ? 5 : 6) * h })), { sources: [apiSource(ZONE), apiSource(ZONE, {}, CAT2)] })
    const r = await e.service.runComparison(call({
      mode: 'SOURCE', leftSourceCatalogId: CAT1, rightSourceCatalogId: CAT2, seriesKeys: ['A'], bucketInterval: 'HOURLY', timezone: ZONE, period: { startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T00:00:00.000Z' },
      seriesMapping: [{ baseline: { sourceCatalogId: CAT1, seriesKey: 'A' }, comparison: { sourceCatalogId: CAT2, seriesKey: 'A' } }],
    }))
    expect(r).toMatchObject({ status: 'OK', mode: 'SOURCE', comparability: 'COMPARABLE' })
    expect(r.rows.map(x => [x.baseline, x.comparison, x.absoluteDelta])).toEqual([[5, 6, 1], [5, 6, 1], [5, 6, 1]])
    expect(e.audits.map(a => [a.actionCode, a.entityId])).toEqual([['SCADA_QUERY_SUCCEEDED', CAT1], ['SCADA_QUERY_SUCCEEDED', CAT2]])
  })
})

describe('provider states are told apart — none of them is a success', () => {
  const ZONE = 'Europe/Istanbul'
  const rows = dayRows('2026-02-01', 8, h => ({ A: 1000 + 5 * h }))
  const req = () => call(body(ZONE, { startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T01:00:00.000Z' }))

  it.each([
    ['provider not registered (catalog)', { sources: undefined }, 'SCADA_SOURCE_NOT_CONFIGURED'],
    ['provider not registered (query)', { query: undefined }, 'SCADA_SOURCE_NOT_CONFIGURED'],
    ['limits missing', { limits: undefined }, 'SCADA_LIMITS_NOT_CONFIGURED'],
    ['limits invalid', { limits: { get: () => ({ ...LIMITS, maxPeriodMs: -1 }) as never } }, 'SCADA_LIMITS_NOT_CONFIGURED'],
  ])('%s ⇒ %s (no read, one audit record)', async (_n, deps, expected) => {
    const e = env(ZONE, rows, { deps: deps as never })
    expect(await codeOf(e.service.runAnalysis(req()))).toBe(expected)
    expect(e.reads()).toBe(0)
    expect(e.audits).toHaveLength(1)
  })

  it.each([
    ['source unresolved (mapping)', [apiSource(ZONE, { mappingResolved: false })]],
    ['source inactive', [apiSource(ZONE, { active: false })]],
    ['source tenant unresolved', [apiSource(ZONE, { tenant: null })]],
  ])('registered provider but %s ⇒ SCADA_NOT_FOUND, nothing read', async (_n, sources) => {
    const e = env(ZONE, rows, { sources })
    expect(await codeOf(e.service.runAnalysis(req()))).toBe('SCADA_NOT_FOUND')
    expect(e.reads()).toBe(0)
  })

  it('registered provider, catalog says the source is blocked (query service rejects) ⇒ static 503, exactly ONE record (the query service\'s DENIED)', async () => {
    const e = env(ZONE, rows, { deny: 'BLOCKED' })
    expect(await codeOf(e.service.runAnalysis(req()))).toBe('SCADA_SOURCE_UNAVAILABLE')
    expect(e.audits.map(a => [a.actionCode, a.reasonCode])).toEqual([['SCADA_QUERY_DENIED', 'SOURCE_BLOCKED']])
    expect(e.reads()).toBe(0)
  })

  it('registered provider, audit down ⇒ NO data (SCADA_AUDIT_FAILED), the raw source rows are not returned', async () => {
    const e = env(ZONE, rows, { failAudit: true })
    expect(await codeOf(e.service.runAnalysis(req()))).toBe('SCADA_AUDIT_FAILED')
  })

  it('a successful analysis writes each record ONCE: no double audit from the API on top of the query service', async () => {
    const e = env(ZONE, rows)
    await e.service.runAnalysis(req())
    expect(e.audits).toHaveLength(1)
    const both = env(ZONE, () => rows, { sources: [apiSource(ZONE), apiSource(ZONE, {}, CAT2)] })
    await both.service.runAnalysis(call(body(ZONE, { sourceCatalogIds: [CAT1, CAT2], startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T01:00:00.000Z' })))
    expect(both.audits.map(a => a.entityId).sort()).toEqual([CAT1, CAT2])
  })

  it('a validation rejection is audited exactly once, by the API, and reads nothing', async () => {
    const e = env(ZONE, rows)
    await e.service.runAnalysis(call(body(ZONE, { sql: 'SELECT 1' }))).catch(() => undefined)
    expect(e.audits).toHaveLength(1)
    expect(e.audits[0]).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED', reasonCode: 'SCADA_REQUEST_UNKNOWN_FIELD' })
    expect(e.reads()).toBe(0)
  })

  it('the same request twice gives the same response (deterministic)', async () => {
    const a = await env(ZONE, rows).service.runAnalysis(req())
    const b = await env(ZONE, rows).service.runAnalysis(req())
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })

  it('a raw source error text never reaches the response or the audit', async () => {
    const secret = 'Login failed for user sa; Server=10.0.0.9;Password=hunter2'
    const e = env(ZONE, rows, { deps: { query: { runMany: async () => { throw new Error(secret) } } } })
    const err = (await e.service.runAnalysis(req()).catch((x: ScadaApiError) => x)) as ScadaApiError
    expect(JSON.stringify({ m: err.message, a: e.audits })).not.toMatch(/Login failed|10\.0\.0\.9|hunter2/)
  })
})

describe('preset authorization port (composition boundary, no new permission)', () => {
  const shared = { scope: 'TENANT_SHARED', customerRootTenantId: ROOT } as Pick<ScadaPreset, 'scope' | 'customerRootTenantId'>
  const c = { actor: { id: 'u-1' }, tenantId: TENANT, routeCode: 'X' }

  it('the composed port decides who may share; without a port nobody may', async () => {
    const seen: unknown[] = []
    const yes = env('Europe/Istanbul', [], { deps: { presetAuthorization: { canSharePreset: a => (seen.push(a), true) } } })
    expect(await yes.service.authorizeShare(c, shared)).toBe(true)
    expect(seen).toEqual([{ userId: 'u-1', customerRootTenantId: ROOT }]) // ids only
    expect(await env('Europe/Istanbul', []).service.authorizeShare(c, shared)).toBe(false)
    const no = env('Europe/Istanbul', [], { deps: { presetAuthorization: { canSharePreset: () => false } } })
    expect(await no.service.authorizeShare(c, shared)).toBe(false)
  })

  it.each([
    ['another customer root', { ...shared, customerRootTenantId: 'root-2' }, {}],
    ['an unresolved tenant', shared, { callers: { describe: async () => ({ tenant: null, userActive: true }) } }],
    ['an inactive tenant', shared, { callers: { describe: async () => ({ tenant: tenant({ status: 'SUSPENDED' }), userActive: true }) } }],
    ['a platform-root tenant', shared, { callers: { describe: async () => ({ tenant: tenant({ type: 'PLATFORM_ROOT' }), userActive: true }) } }],
    ['an inactive user', shared, { callers: { describe: async () => ({ tenant: tenant(), userActive: false }) } }],
    ['a scope that cannot be resolved', shared, { scopes: { resolve: async () => { throw new Error('x') } } }],
  ])('%s is refused even when the port would say yes', async (_n, preset, deps) => {
    const e = env('Europe/Istanbul', [], { deps: { presetAuthorization: { canSharePreset: () => true }, ...deps } as never })
    expect(await e.service.authorizeShare(c, preset)).toBe(false)
  })
})
