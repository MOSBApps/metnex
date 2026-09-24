import type { ScadaQueryAuditEntry } from '../../adapter/scada-readonly.port'
import type { ScadaAnalysisQuery, ScadaMultiSourceResult, ScadaRawRecord } from '../../query/scada-analysis-query.contract'
import { ScadaQueryError } from '../../query/scada-query.errors'
import type { ScadaPreset } from '../../presets/scada-preset.contract'
import type { TenantRecord } from '../../catalog/tenant-guards'
import type { VirtualColumnDefinition } from '../../virtual-columns/virtual-column.contract'
import { ScadaApiError, type ScadaAnalysisQueryPort, type ScadaApiLimits, type ScadaApiSource } from '../scada-api.contract'
import { ScadaAnalysisApiService, type ScadaAnalysisApiDeps, type ScadaApiCall } from '../scada-analysis-api.service'

/** Synthetic fixtures only. Every limit is a TEST parameter, not a proposed production value. */
const ROOT = 'root-1'
const OTHER_ROOT = 'root-2'
const TENANT = 'tenant-1'
const CAT1 = '00000000-0000-4000-8000-000000000001'
const CAT2 = '00000000-0000-4000-8000-000000000002'
const ZONE = 'Europe/Istanbul'
const NOW = Date.parse('2026-03-01T00:00:00.000Z')
const START = '2026-02-01T00:00:00.000Z'
const END = '2026-02-01T04:00:00.000Z'
const HOUR = 3_600_000
const LIMITS: ScadaApiLimits = {
  preset: { maxNameLength: 80, maxDescriptionLength: 200, maxSourceCount: 4, maxSeriesCount: 6, maxVirtualColumnCount: 3, maxPageSize: 50 },
  virtualColumn: { maxExpressionLength: 100, maxAstDepth: 8, maxOperatorCount: 10, maxRoundDecimals: 4, maxAbsoluteResult: 1e12 },
  maxPeriodMs: 40 * 24 * HOUR,
  maxSeriesMappings: 8,
}

const tenant = (over: Partial<TenantRecord> = {}): TenantRecord => ({ id: TENANT, type: 'STANDARD', status: 'ACTIVE', slug: 'tenant-one', ...over })
const scope = { tenantId: TENANT, customerRootTenantId: ROOT, dataScopeTenantIds: [TENANT] }

function source(over: Partial<ScadaApiSource> = {}): ScadaApiSource {
  return {
    catalogId: CAT1,
    customerRootTenantId: ROOT,
    displayName: 'Kaynak Bir',
    active: true,
    mappingResolved: true,
    tenant: tenant(),
    sourceTimeZone: ZONE,
    table: 'phys_table_zz9',
    dateColumn: 'phys_date_zz9',
    timeColumn: 'phys_time_zz9',
    series: [
      { seriesKey: 'A', label: 'Seri A', unit: 'kWh', valueType: 'INDEX' },
      { seriesKey: 'B', label: 'Seri B', unit: 'kWh', valueType: 'INDEX' },
    ],
    ...over,
  }
}

type Q = Omit<ScadaAnalysisQuery, 'tenantScope' | 'signal'>
type Values = Record<string, Array<number | null>>

/** Hourly readings for every requested column from startAt (buffer row = the reading at endAt). */
function readings(q: Q, values: Values = {}, over: Partial<ScadaRawRecord> = {}): ScadaRawRecord[] {
  const out: ScadaRawRecord[] = []
  const first = q.startAt.getTime()
  const count = (q.endAt.getTime() - first) / HOUR + 1
  for (const key of q.columns) {
    for (let i = 0; i < count; i += 1) {
      const ms = first + i * HOUR
      const raw = values[key] ? (values[key]![i] ?? null) : 100 + 5 * i
      out.push({
        occurredAtUtc: new Date(ms).toISOString(),
        localWallTime: new Date(ms + 3 * HOUR).toISOString().replace('Z', ''),
        dstCandidatesUtc: [],
        dstUncertainRangeUtc: null,
        recordId: `${q.catalogId}:${key}:${i}`,
        seriesKey: key,
        rawValue: raw,
        valueType: 'INDEX',
        sourceCatalogId: q.catalogId,
        dataQuality: raw === null ? 'MISSING' : 'VALID',
        dstResolution: 'NORMAL',
        isBufferRow: ms >= q.endAt.getTime(),
        ...over,
      })
    }
  }
  return out
}

function queryPort(build: (q: Q) => ScadaRawRecord[] = q => readings(q)) {
  const calls: Array<{ actor: unknown; scope: unknown; queries: Q[]; options: unknown }> = []
  const port: ScadaAnalysisQueryPort = {
    async runMany(actor, tenantScope, queries, options) {
      calls.push({ actor, scope: tenantScope, queries: queries.map(q => ({ ...q })), options })
      const records = queries.flatMap(q => build(q))
      const result: ScadaMultiSourceResult = {
        mode: options.mode,
        interval: queries[0]!.interval,
        valueType: queries[0]!.valueType,
        complete: true,
        records,
        sources: queries.map(q => ({ catalogId: q.catalogId, status: 'READ' as const, code: null, rowCount: records.filter(r => r.sourceCatalogId === q.catalogId).length })),
      }
      return result
    },
  }
  return { port, calls }
}

function preset(over: Record<string, unknown> = {}): ScadaPreset {
  return {
    presetId: 'preset-1', customerRootTenantId: ROOT, ownerUserId: 'u-1', scope: 'PRIVATE', name: 'Haftalık', description: null, version: 1, status: 'ACTIVE',
    sourceCatalogIds: [CAT1], seriesKeys: ['A'], virtualColumns: [], statistics: ['SUM', 'MAX'], comparison: { mode: 'NONE' }, filters: {},
    timeRange: { startAt: START, endAt: END }, bucketInterval: 'HOURLY', timezone: ZONE, display: { chartType: 'LINE' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', effectiveFrom: null, effectiveTo: null, ...over,
  } as ScadaPreset
}

function vcDef(over: Partial<VirtualColumnDefinition> = {}): VirtualColumnDefinition {
  return { virtualColumnId: 'vc-1', catalogId: CAT1, customerRootTenantId: ROOT, seriesKey: 'SANAL', label: 'Sanal', unit: 'kWh', expression: 'A + B + 424242', inputSeriesKeys: ['A', 'B'], valueType: 'INDEX', version: 1, effectiveFrom: null, effectiveTo: null, status: 'ACTIVE', createdBy: 'actor-1', updatedAt: '2026-01-01T00:00:00.000Z', ...over }
}

interface H {
  audits: ScadaQueryAuditEntry[]
  q: ReturnType<typeof queryPort>
  deps: ScadaAnalysisApiDeps
  service: ScadaAnalysisApiService
  touched: string[]
}

function harness(over: Partial<ScadaAnalysisApiDeps> = {}, opts: { presets?: ScadaPreset[]; defs?: VirtualColumnDefinition[]; sources?: ScadaApiSource[]; build?: (q: Q) => ScadaRawRecord[] } = {}): H {
  const audits: ScadaQueryAuditEntry[] = []
  const touched: string[] = []
  const q = queryPort(opts.build)
  let n = 0
  const deps: ScadaAnalysisApiDeps = {
    scopes: { resolve: async () => (touched.push('scope'), scope) },
    callers: { describe: async () => (touched.push('caller'), { tenant: tenant(), userActive: true }) },
    artifacts: { assertExists: async () => void touched.push('artifact') },
    clock: { nowMs: () => NOW, correlationId: () => `srv-corr-${(n += 1)}` },
    audit: { record: async e => void audits.push(e) },
    sources: { listSources: async () => (touched.push('catalog'), opts.sources ?? [source()]) },
    query: { runMany: async (...args) => (touched.push('query'), q.port.runMany(...args)) },
    presets: { listPresetVersions: async () => opts.presets ?? [] },
    virtualColumns: { listDefinitions: async () => opts.defs ?? [] },
    limits: { get: () => LIMITS },
    ...over,
  }
  return { audits, q, deps, service: new ScadaAnalysisApiService(deps), touched }
}

const call = (over: Partial<ScadaApiCall> = {}): ScadaApiCall => ({ actor: { id: 'u-1' }, tenantId: TENANT, routeCode: 'HOURLY_CONSUMPTION', body: undefined, ...over })
const analysisBody = (over: Record<string, unknown> = {}) => ({ sourceCatalogIds: [CAT1], seriesKeys: ['A', 'B'], startAt: START, endAt: END, bucketInterval: 'HOURLY', timezone: ZONE, ...over })
const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p
    return 'OK'
  } catch (e) {
    if (e instanceof ScadaApiError) return e.code
    throw e
  }
}

describe('valid analysis request', () => {
  it('answers with a whitelist projection of the 027.68 series; the query gets catalog-derived physical parts the client never sent', async () => {
    const h = harness()
    const r = await h.service.runAnalysis(call({ body: analysisBody({ statistics: ['SUM', 'COUNT'] }) }))
    expect(r).toMatchObject({ artifactCode: 'HOURLY_CONSUMPTION', status: 'OK', interval: 'HOURLY', timezone: ZONE, range: { startAt: START, endAt: END }, preset: null })
    expect(r.series.map(s => s.seriesKey)).toEqual(['A', 'B'])
    const a = r.series[0]!
    expect(a.points.map(p => p.value)).toEqual([5, 5, 5, 5]) // buffer reading never a point
    expect(a.points[0]).toMatchObject({ t: START, quality: 'VALID', isComplete: true, classification: 'VALID' })
    expect(a.statistics).toEqual({ status: 'OK', sum: 20, count: 4 }) // only the selected statistics
    expect(h.q.calls).toHaveLength(1)
    const sent = h.q.calls[0]!
    expect(sent.queries[0]).toMatchObject({ catalogId: CAT1, table: 'phys_table_zz9', columns: ['A', 'B'], valueType: 'INDEX', dateColumn: 'phys_date_zz9', timeColumn: 'phys_time_zz9', interval: 'HOURLY' })
    expect(sent.scope).toEqual(scope)
    expect(sent.actor).toEqual({ id: 'u-1' })
    expect(sent.options).toEqual({ mode: 'EXPLICIT' })
  })

  it('DAILY rolls the hourly buckets up (INDEX ⇒ sum) in the source zone', async () => {
    const h = harness({}, { build: q => readings({ ...q, startAt: new Date('2026-01-31T21:00:00.000Z'), endAt: new Date('2026-02-01T21:00:00.000Z') }) })
    const r = await h.service.runAnalysis(call({ body: analysisBody({ startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T21:00:00.000Z', bucketInterval: 'DAILY', seriesKeys: ['A'] }) }))
    expect(r.series[0]!.points).toHaveLength(1)
    expect(r.series[0]!.points[0]).toMatchObject({ t: '2026-01-31T21:00:00.000Z', value: 120 })
  })

  it('DAILY for a REAL_VALUE series without a catalog rule is refused (no guessed operation)', async () => {
    const real = source({ series: [{ seriesKey: 'A', label: 'A', unit: 'V', valueType: 'REAL_VALUE' }] })
    const h = harness({}, { sources: [real], build: q => readings({ ...q }, {}, { valueType: 'REAL_VALUE' }) })
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody({ bucketInterval: 'DAILY', seriesKeys: ['A'] }) })))).toBe('SCADA_AGGREGATION_POLICY_REQUIRED')
  })

  it('mixed INDEX / REAL_VALUE series in one request are refused', async () => {
    const mixed = source({ series: [{ seriesKey: 'A', label: 'A', unit: 'kWh', valueType: 'INDEX' }, { seriesKey: 'B', label: 'B', unit: 'V', valueType: 'REAL_VALUE' }] })
    const h = harness({}, { sources: [mixed] })
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody() })))).toBe('SCADA_MIXED_VALUE_TYPES')
    expect(h.q.calls).toHaveLength(0)
  })

  it('is deterministic: the same request gives the same response', async () => {
    const one = await harness().service.runAnalysis(call({ body: analysisBody() }))
    const two = await harness().service.runAnalysis(call({ body: analysisBody() }))
    expect(JSON.stringify(two)).toBe(JSON.stringify(one))
  })

  it('never mutates the body it received', async () => {
    const body = Object.freeze(analysisBody({ sourceCatalogIds: Object.freeze([CAT1]), seriesKeys: Object.freeze(['A']) }))
    await expect(harness().service.runAnalysis(call({ body }))).resolves.toBeDefined()
  })
})

describe('the source provider and the limits are ports: absent ⇒ a safe 503, nothing synthetic', () => {
  it.each([
    ['no catalog provider', { sources: undefined }],
    ['no query provider', { query: undefined }],
  ])('%s ⇒ SCADA_SOURCE_NOT_CONFIGURED before any scope / data access', async (_n, over) => {
    const h = harness(over as never)
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody() })))).toBe('SCADA_SOURCE_NOT_CONFIGURED')
    expect(h.touched).toEqual([])
    expect(h.audits.map(a => [a.actionCode, a.reasonCode])).toEqual([['SCADA_QUERY_FAILED', 'SCADA_SOURCE_NOT_CONFIGURED']])
  })

  it('a preset request also needs the preset store', async () => {
    const h = harness({ presets: undefined })
    expect(await codeOf(h.service.runAnalysis(call({ body: { presetId: 'preset-1' } })))).toBe('SCADA_SOURCE_NOT_CONFIGURED')
    expect(await codeOf(h.service.listPresets(call()))).toBe('SCADA_SOURCE_NOT_CONFIGURED')
    expect(await codeOf(h.service.getPreset(call({ param: 'preset-1' })))).toBe('SCADA_SOURCE_NOT_CONFIGURED')
  })

  it('an empty source returns NO synthetic data: no points, NO_VALID_DATA', async () => {
    const h = harness({}, { build: () => [] })
    const r = await h.service.runAnalysis(call({ body: analysisBody({ seriesKeys: ['A'] }) }))
    expect(r.series).toHaveLength(1)
    expect(r.series[0]!.points).toEqual([])
    expect(r.series[0]!.status).toBe('NO_VALID_DATA')
    expect(r.series[0]!.statistics).toMatchObject({ status: 'NO_VALID_DATA', sum: null, average: null, min: null, max: null, count: 0 })
  })

  it.each([
    ['missing', undefined],
    ['null', null],
    ['a missing field', { preset: LIMITS.preset, virtualColumn: LIMITS.virtualColumn, maxPeriodMs: LIMITS.maxPeriodMs }],
    ['a non-positive value', { ...LIMITS, maxPeriodMs: 0 }],
    ['a NaN value', { ...LIMITS, preset: { ...LIMITS.preset, maxSeriesCount: NaN } }],
    ['a string value', { ...LIMITS, maxSeriesMappings: '8' }],
  ])('limits %s ⇒ SCADA_LIMITS_NOT_CONFIGURED (fail-closed) for every endpoint', async (_n, limits) => {
    const h = harness({ limits: { get: () => limits as never } })
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody() })))).toBe('SCADA_LIMITS_NOT_CONFIGURED')
    expect(await codeOf(h.service.runComparison(call({ body: {} })))).toBe('SCADA_LIMITS_NOT_CONFIGURED')
    expect(await codeOf(h.service.listPresets(call()))).toBe('SCADA_LIMITS_NOT_CONFIGURED')
    expect(await codeOf(h.service.getPreset(call({ param: 'x' })))).toBe('SCADA_LIMITS_NOT_CONFIGURED')
    expect(h.touched).toEqual([])
  })

  it('a throwing limits provider is also a closed door', async () => {
    const h = harness({ limits: { get: () => { throw new Error('profile unreadable') } } })
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody() })))).toBe('SCADA_LIMITS_NOT_CONFIGURED')
  })
})

describe('input validation runs FIRST (before scope, catalog, provider)', () => {
  const rejected = async (body: unknown) => {
    const h = harness()
    const code = await codeOf(h.service.runAnalysis(call({ body })))
    expect(h.touched).toEqual([]) // no scope, no catalog, no artifact lookup, no query
    expect(h.q.calls).toHaveLength(0)
    return { code, audits: h.audits }
  }

  it.each([
    ['not an object', 'x', 'SCADA_REQUEST_INVALID'],
    ['an array', [], 'SCADA_REQUEST_INVALID'],
    ['no time range', analysisBody({ startAt: undefined, endAt: undefined }), 'SCADA_TIME_RANGE_INVALID'],
    ['a naive date-time', analysisBody({ startAt: '2026-02-01T00:00:00' }), 'SCADA_TIME_RANGE_INVALID'],
    ['a garbage date', analysisBody({ endAt: 'yesterday' }), 'SCADA_TIME_RANGE_INVALID'],
    ['start after end', analysisBody({ startAt: END, endAt: START }), 'SCADA_TIME_RANGE_INVALID'],
    ['start equal to end', analysisBody({ endAt: START }), 'SCADA_TIME_RANGE_INVALID'],
    ['a period over the external maximum', analysisBody({ endAt: '2026-04-01T00:00:00.000Z' }), 'SCADA_LIMIT_EXCEEDED'],
    ['an unknown interval', analysisBody({ bucketInterval: 'WEEKLY' }), 'SCADA_INTERVAL_INVALID'],
    ['a missing interval', analysisBody({ bucketInterval: undefined }), 'SCADA_INTERVAL_INVALID'],
    ['an unknown statistic', analysisBody({ statistics: ['SUM', 'MEDIAN'] }), 'SCADA_STATISTIC_INVALID'],
    ['a duplicate statistic', analysisBody({ statistics: ['SUM', 'SUM'] }), 'SCADA_STATISTIC_INVALID'],
    ['an offset time zone', analysisBody({ timezone: '+03:00' }), 'SCADA_TIMEZONE_INVALID'],
    ['no time zone', analysisBody({ timezone: undefined }), 'SCADA_TIMEZONE_INVALID'],
    ['a non-uuid source id', analysisBody({ sourceCatalogIds: ['phys_db'] }), 'SCADA_REQUEST_INVALID'],
    ['a duplicate source id', analysisBody({ sourceCatalogIds: [CAT1, CAT1] }), 'SCADA_REQUEST_INVALID'],
    ['too many sources', analysisBody({ sourceCatalogIds: [1, 2, 3, 4, 5].map(i => `00000000-0000-4000-8000-00000000000${i}`) }), 'SCADA_LIMIT_EXCEEDED'],
    ['too many series', analysisBody({ seriesKeys: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }), 'SCADA_LIMIT_EXCEEDED'],
    ['a duplicate series', analysisBody({ seriesKeys: ['A', 'A'] }), 'SCADA_REQUEST_INVALID'],
    ['a connection-string-like series key', analysisBody({ seriesKeys: ['Server=db;Password=x'] }), 'SCADA_REQUEST_INVALID'],
    ['an empty series list', analysisBody({ seriesKeys: [] }), 'SCADA_REQUEST_INVALID'],
    ['too many virtual columns', analysisBody({ virtualColumnIds: ['a', 'b', 'c', 'd'] }), 'SCADA_LIMIT_EXCEEDED'],
    ['a malformed virtual column id', analysisBody({ virtualColumnIds: ['a b'] }), 'SCADA_REQUEST_INVALID'],
    ['an unknown mode', analysisBody({ mode: 'ALL' }), 'SCADA_REQUEST_INVALID'],
    ['a foreign artifact code', analysisBody({ artifactCode: 'OTHER_REPORT' }), 'SCADA_REQUEST_INVALID'],
    ['a preset version without a preset', analysisBody({ presetVersion: 2 }), 'SCADA_REQUEST_INVALID'],
    ['a preset id together with explicit fields', analysisBody({ presetId: 'preset-1' }), 'SCADA_REQUEST_INVALID'],
    ['a malformed preset id', { presetId: '../x' }, 'SCADA_REQUEST_INVALID'],
    ['a non-integer preset version', { presetId: 'preset-1', presetVersion: 1.5 }, 'SCADA_REQUEST_INVALID'],
  ])('%s ⇒ %s', async (_n, body, expected) => {
    const r = await rejected(body)
    expect(r.code).toBe(expected)
    expect(r.audits).toHaveLength(1)
    expect(r.audits[0]).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED', reasonCode: expected, entityType: 'ScadaAnalysisQuery', customerRootTenantId: null })
  })

  it.each([
    'sql', 'query', 'database', 'schema', 'table', 'tableName', 'connectionString', 'connection', 'host', 'server', 'password', 'token', 'expression',
    'filters', 'filter', 'where', 'correlationId', 'correlation_id', 'requestId', 'tenantId', 'customerRootTenantId', 'isSystemAdmin', 'role', 'roles', 'permissions', 'sourceKey', 'catalogId', 'columns', 'dateColumn', 'timeColumn', 'actorId', 'userId',
  ])('the field %s is never accepted (unknown-field rejection, nothing reaches a service)', async key => {
    const r = await rejected(analysisBody({ [key]: key === 'filters' ? { free: 'DROP TABLE x' } : key === 'isSystemAdmin' ? true : 'x' }))
    expect(r.code).toBe('SCADA_REQUEST_UNKNOWN_FIELD')
  })

  it('a bad route code is refused the same way', async () => {
    const h = harness()
    for (const routeCode of ['', 'a b', '../x', 'x'.repeat(65), undefined, "x'; DROP--"]) expect(await codeOf(h.service.runAnalysis(call({ routeCode, body: analysisBody() })))).toBe('SCADA_ROUTE_CODE_INVALID')
    expect(h.touched).toEqual([])
  })

  it('the error and the audit carry only static codes — never the offending value', async () => {
    const h = harness()
    await h.service.runAnalysis(call({ body: analysisBody({ seriesKeys: ['Server=db-secret-7;Password=hunter2'] }) })).catch((e: Error) => {
      expect(e.message).toBe('SCADA_REQUEST_INVALID')
    })
    expect(JSON.stringify(h.audits)).not.toMatch(/db-secret-7|hunter2|Server=/)
  })
})

describe('tenant scope, identity and isolation', () => {
  it('a tenant scope that cannot be resolved ⇒ SCADA_SCOPE_DENIED, no source / query access', async () => {
    const h = harness({ scopes: { resolve: async () => { throw new Error('Tenant bulunamadı: internal detail') } } })
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody() })))).toBe('SCADA_SCOPE_DENIED')
    expect(h.touched).toEqual(['artifact'])
    expect(h.q.calls).toHaveLength(0)
    expect(h.audits[0]).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED', reasonCode: 'SCADA_SCOPE_DENIED' })
  })

  it('an unknown artifact is a 404 before any scope work', async () => {
    const h = harness({ artifacts: { assertExists: async () => { throw Object.assign(new Error('x'), { getStatus: () => 404 }) } } })
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody() })))).toBe('SCADA_NOT_FOUND')
    expect(h.touched).toEqual([])
  })

  it('the scope handed to the query is the RESOLVED one; the client cannot widen it (the only tenant input is the guarded header)', async () => {
    const h = harness()
    await h.service.runAnalysis(call({ body: analysisBody() }))
    expect(h.q.calls[0]!.scope).toEqual({ tenantId: TENANT, customerRootTenantId: ROOT, dataScopeTenantIds: [TENANT] })
  })

  it.each([
    ['a platform-root caller tenant (no data-scope widening)', { tenant: tenant({ type: 'PLATFORM_ROOT' }) }],
    ['an inactive caller tenant', { tenant: tenant({ status: 'SUSPENDED' }) }],
    ['the excluded organisation as caller tenant', { tenant: tenant({ slug: 'Mosedaş' }) }],
    ['an unresolved caller tenant', { tenant: null }],
    ['an inactive user', { userActive: false }],
  ])('%s ⇒ SCADA_SCOPE_DENIED', async (_n, caller) => {
    const h = harness({ callers: { describe: async () => ({ tenant: tenant(), userActive: true, ...caller }) } })
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody() })))).toBe('SCADA_SCOPE_DENIED')
    expect(h.q.calls).toHaveLength(0)
  })

  it('a source of ANOTHER customer root is "not found" and never queried', async () => {
    const h = harness({}, { sources: [source({ customerRootTenantId: OTHER_ROOT })] })
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody() })))).toBe('SCADA_NOT_FOUND')
    expect(h.q.calls).toHaveLength(0)
  })

  it.each([
    ['an unknown source id', { sourceCatalogIds: [CAT2] }],
    ['a series the catalog does not approve', { seriesKeys: ['A', 'NOT_APPROVED'] }],
  ])('%s never reaches the query', async (_n, body) => {
    const h = harness()
    const c = await codeOf(h.service.runAnalysis(call({ body: analysisBody(body) })))
    expect(['SCADA_NOT_FOUND', 'SCADA_REQUEST_INVALID']).toContain(c)
    expect(h.q.calls).toHaveLength(0)
  })

  it('a source whose mapping / tenant is not usable is refused without naming why', async () => {
    for (const bad of [source({ mappingResolved: false }), source({ active: false }), source({ tenant: tenant({ slug: 'MOSEDAŞ' }) }), source({ tenant: null }), source({ tenant: tenant({ id: 'tenant-9' }) })]) {
      const h = harness({}, { sources: [bad] })
      expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody() })))).toBe('SCADA_NOT_FOUND')
      expect(h.q.calls).toHaveLength(0)
    }
  })

  it('a source zone different from the request zone is a mismatch — nothing is converted silently', async () => {
    const h = harness()
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody({ timezone: 'Europe/Berlin' }) })))).toBe('SCADA_TIMEZONE_MISMATCH')
    expect(h.q.calls).toHaveLength(0)
  })
})

describe('the query boundary: audit is written once, errors are static', () => {
  it('a successful analysis writes NO second record: the query service is the audit boundary of the read', async () => {
    const h = harness()
    await h.service.runAnalysis(call({ body: analysisBody() }))
    expect(h.audits).toEqual([])
  })

  it('a query-service rejection is mapped to a static code and NOT audited twice', async () => {
    const h = harness({ query: { runMany: async () => { throw new ScadaQueryError('SOURCE_BLOCKED') } } })
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody() })))).toBe('SCADA_SOURCE_UNAVAILABLE')
    expect(h.audits).toEqual([])
  })

  it('the query service failing to audit ⇒ SCADA_AUDIT_FAILED and NO data (fail-closed)', async () => {
    const h = harness({ query: { runMany: async () => { throw new ScadaQueryError('AUDIT_FAILED') } } })
    const r = await h.service.runAnalysis(call({ body: analysisBody() })).then(
      () => 'DATA',
      (e: ScadaApiError) => e.code,
    )
    expect(r).toBe('SCADA_AUDIT_FAILED')
    expect(h.audits).toHaveLength(1) // the service's own FAILED record (the query service could not write one)
    expect(h.audits[0]).toMatchObject({ actionCode: 'SCADA_QUERY_FAILED', reasonCode: 'SCADA_AUDIT_FAILED' })
  })

  it('a RAW provider error is redacted: the response error and the audit carry only the static code', async () => {
    const secret = 'Login failed for user sa at Server=10.0.0.5;Password=hunter2 SELECT * FROM dbo.phys_table_zz9'
    for (const over of [
      { query: { runMany: async () => { throw new Error(secret) } } },
      { sources: { listSources: async () => { throw new Error(secret) } } },
      { virtualColumns: { listDefinitions: async () => { throw new Error(secret) } } },
    ]) {
      const h = harness(over as never)
      const e = await h.service.runAnalysis(call({ body: analysisBody() })).then(
        () => null,
        (err: ScadaApiError) => err,
      )
      expect(e).toBeInstanceOf(ScadaApiError)
      expect(JSON.stringify({ code: e!.code, message: e!.message, audits: h.audits })).not.toMatch(/Login failed|10\.0\.0\.5|hunter2|SELECT|phys_table_zz9|dbo\./)
    }
  })

  it('an unexpected internal exception becomes SCADA_INTERNAL_ERROR with no detail', async () => {
    const h = harness({ callers: { describe: async () => { throw new TypeError('boom internals') } } })
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody() })))).toBe('SCADA_SCOPE_DENIED')
    const h2 = harness({ clock: { nowMs: () => NOW, correlationId: () => 'c' }, artifacts: { assertExists: async () => { throw new Error('db down') } } })
    expect(await codeOf(h2.service.runAnalysis(call({ body: analysisBody() })))).toBe('SCADA_INTERNAL_ERROR')
    expect(h2.audits[0]).toMatchObject({ actionCode: 'SCADA_QUERY_FAILED', reasonCode: 'SCADA_INTERNAL_ERROR' })
  })

  it('a rejection whose own audit write fails stays a rejection', async () => {
    const h = harness({ audit: { record: async () => { throw new Error('audit down') } } })
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody({ bucketInterval: 'X' }) })))).toBe('SCADA_INTERVAL_INVALID')
  })

  it('the audit entry of a rejection carries only the fixed safe fields; the correlation id is server generated', async () => {
    const h = harness()
    await h.service.runAnalysis(call({ body: { ...analysisBody(), correlationId: 'client-chosen-id' } })).catch(() => undefined)
    const e = h.audits[0]!
    expect(Object.keys(e).sort()).toEqual(['actionCode', 'actorId', 'columnCount', 'correlationId', 'customerRootTenantId', 'durationMs', 'entityId', 'entityType', 'limitReason', 'reasonCode', 'rowCount', 'tenantId'])
    expect(e.correlationId).toBe('srv-corr-1')
    expect(JSON.stringify(e)).not.toMatch(/client-chosen-id|SELECT|schema|expression|Server=|password|token/i)
  })
})

describe('quality is preserved, never cleaned; a real 0 is not a null', () => {
  it('a genuine zero delta is a VALID 0, a missing reading is null / MISSING — never confused', async () => {
    const h = harness({}, { build: q => readings(q, { A: [100, 100, 100, null, 110] }) })
    const r = await h.service.runAnalysis(call({ body: analysisBody({ seriesKeys: ['A'] }) }))
    const points = r.series[0]!.points
    expect(points[0]).toMatchObject({ value: 0, quality: 'VALID', classification: 'VALID' })
    expect(points[1]).toMatchObject({ value: 0, classification: 'VALID' })
    const missing = points.filter(p => p.value === null)
    expect(missing.length).toBeGreaterThan(0)
    expect(missing.every(p => p.classification !== 'VALID')).toBe(true)
    expect(r.series[0]!.statistics).toMatchObject({ min: 0 })
  })

  it('a counter reset without a policy stays COUNTER_RESET_UNRESOLVED (no invented roll-over) with its flags visible', async () => {
    const h = harness({}, { build: q => readings(q, { A: [1000, 1005, 4, 9, 14] }) })
    const r = await h.service.runAnalysis(call({ body: analysisBody({ seriesKeys: ['A'] }) }))
    const bad = r.series[0]!.points.find(p => p.qualityFlags.includes('COUNTER_RESET_UNRESOLVED'))
    expect(bad).toBeDefined()
    expect(bad!.value).toBeNull()
    expect(bad!.isComplete).toBe(false)
    expect(r.series[0]!.qualitySummary.counterResetUnresolved).toBeGreaterThan(0)
  })

  it('an unresolved DST repeated hour keeps no instant and the DST flag; the series is not analysable', async () => {
    const h = harness({}, {
      build: q => {
        const rows = readings(q, { A: [100, 105, 110, 115, 120] })
        rows[1] = { ...rows[1]!, dstResolution: 'AMBIGUOUS', occurredAtUtc: null, dstCandidatesUtc: [rows[1]!.occurredAtUtc as string, new Date(Date.parse(rows[1]!.occurredAtUtc as string) + HOUR).toISOString()] }
        return rows
      },
    })
    const r = await h.service.runAnalysis(call({ body: analysisBody({ seriesKeys: ['A'] }) }))
    const s = r.series[0]!
    expect(s.analysisAllowed).toBe(false)
    expect(s.points.some(p => p.qualityFlags.includes('DST_AMBIGUOUS'))).toBe(true)
    const untimed = s.points.find(p => p.t === null) // the repeated reading itself has NO invented instant
    expect(untimed).toBeDefined()
    expect(untimed!.qualityFlags).toContain('DST_AMBIGUOUS')
    expect(s.statistics).toMatchObject({ status: 'BLOCKED', sum: null })
  })

  it('an unverified source time zone marks the series as not analysable', async () => {
    const h = harness({}, { sources: [source({ sourceTimeZone: null })] })
    // the preset resolver refuses an unverified zone before any read happens
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody() })))).toBe('SCADA_TIMEZONE_MISMATCH')
  })
})

describe('response projection is a whitelist', () => {
  it('no physical name, credential, SQL, expression or provider object reaches the response even if the provider objects carry them', async () => {
    const dirty = { ...source(), connectionString: 'Server=10.1.1.1;User Id=sa;Password=hunter2', password: 'hunter2', apiToken: 'tok-123', hash: 'h', driver: { pool: 1 } }
    const dirtyOutput = (q: Q) => readings(q).map(r => ({ ...r, sql: 'SELECT * FROM dbo.phys_table_zz9', credential: 'hunter2' }))
    const h = harness({}, { sources: [dirty as never], defs: [vcDef()], build: dirtyOutput })
    const r = await h.service.runAnalysis(call({ body: analysisBody({ virtualColumnIds: ['vc-1'] }) }))
    const text = JSON.stringify(r)
    expect(text).not.toMatch(/phys_table_zz9|phys_date_zz9|phys_time_zz9|Server=|hunter2|tok-123|SELECT|dbo\.|password|connection|expression|424242|A \+ B|"sql"|credential/i)
    expect(r.series.map(s => s.seriesKey)).toEqual(['A', 'B', 'SANAL'])
  })

  it('a virtual series reports its column and RESOLVED version, never its expression', async () => {
    const h = harness({}, { defs: [vcDef()] })
    const r = await h.service.runAnalysis(call({ body: analysisBody({ virtualColumnIds: ['vc-1'] }) }))
    const v = r.series.find(s => s.seriesKey === 'SANAL')!
    expect(v.virtual).toEqual({ virtualColumnId: 'vc-1', versions: [1], sourceSeriesKeys: ['A', 'B'] })
    expect(v.points.map(p => p.value)).toEqual([10 + 424242, 10 + 424242, 10 + 424242, 10 + 424242])
    expect(JSON.stringify(r)).not.toMatch(/424242\b.*expression|"expression"/)
  })

  it('a series that is only a virtual column INPUT (not selected) is read but not returned', async () => {
    const h = harness({}, { defs: [vcDef()] })
    const r = await h.service.runAnalysis(call({ body: analysisBody({ seriesKeys: ['A'], virtualColumnIds: ['vc-1'] }) }))
    expect(h.q.calls[0]!.queries[0]!.columns).toEqual(['A', 'B'])
    expect(r.series.map(s => s.seriesKey)).toEqual(['A', 'SANAL'])
  })

  it('an ambiguous virtual column version (no pin) is refused, never silently chosen', async () => {
    const h = harness({}, { defs: [vcDef({ version: 1 }), vcDef({ version: 2 })] })
    expect(await codeOf(h.service.runAnalysis(call({ body: analysisBody({ virtualColumnIds: ['vc-1'] }) })))).toBe('SCADA_VIRTUAL_COLUMN_VERSION_AMBIGUOUS')
    expect(h.q.calls).toHaveLength(0)
  })

  it('an unknown virtual column and one of another root never resolve', async () => {
    expect(await codeOf(harness({}, { defs: [] }).service.runAnalysis(call({ body: analysisBody({ virtualColumnIds: ['vc-1'] }) })))).toBe('SCADA_VIRTUAL_COLUMN_INVALID')
    expect(await codeOf(harness({}, { defs: [vcDef({ customerRootTenantId: OTHER_ROOT })] }).service.runAnalysis(call({ body: analysisBody({ virtualColumnIds: ['vc-1'] }) })))).toBe('SCADA_NOT_FOUND')
  })
})

describe('presets: analysis by reference, list and resolve', () => {
  const shared = (over: Record<string, unknown> = {}) => preset({ scope: 'TENANT_SHARED', ...over })

  it('a valid preset reference runs the plan the resolver produced (statistics, series, range from the preset)', async () => {
    const h = harness({}, { presets: [preset()] })
    const r = await h.service.runAnalysis(call({ body: { presetId: 'preset-1' } }))
    expect(r).toMatchObject({ preset: { presetId: 'preset-1', presetVersion: 1 }, range: { startAt: START, endAt: END } })
    expect(r.series.map(s => s.seriesKey)).toEqual(['A'])
    expect(r.series[0]!.statistics).toEqual({ status: 'OK', sum: 20, max: 5 })
  })

  it('PRIVATE isolation: another user of the SAME tenant does not see it — 404 identical to an unknown preset', async () => {
    const h = harness({}, { presets: [preset()] })
    const other = call({ actor: { id: 'u-2' }, body: { presetId: 'preset-1' } })
    expect(await codeOf(h.service.runAnalysis(other))).toBe('SCADA_NOT_FOUND')
    expect(await codeOf(h.service.runAnalysis(call({ actor: { id: 'u-2' }, body: { presetId: 'does-not-exist' } })))).toBe('SCADA_NOT_FOUND')
    expect(await codeOf(h.service.getPreset(call({ actor: { id: 'u-2' }, param: 'preset-1' })))).toBe('SCADA_NOT_FOUND')
    expect((await h.service.listPresets(call({ actor: { id: 'u-2' } }))).presets).toEqual([])
    expect(h.q.calls).toHaveLength(0)
  })

  it('TENANT_SHARED isolation: visible to any user of the same root, invisible to another root even if the store returns it', async () => {
    const h = harness({}, { presets: [shared(), shared({ presetId: 'foreign', customerRootTenantId: OTHER_ROOT }), shared({ presetId: 'foreign2', customerRootTenantId: OTHER_ROOT, ownerUserId: 'u-2' })] })
    expect((await h.service.listPresets(call({ actor: { id: 'u-2' } }))).presets.map(p => p.presetId)).toEqual(['preset-1'])
    expect(await codeOf(h.service.getPreset(call({ actor: { id: 'u-2' }, param: 'foreign' })))).toBe('SCADA_NOT_FOUND')
    expect(await codeOf(h.service.runAnalysis(call({ body: { presetId: 'foreign' } })))).toBe('SCADA_NOT_FOUND')
    expect(await codeOf(h.service.runAnalysis(call({ actor: { id: 'u-2' }, body: { presetId: 'preset-1' } })))).toBe('OK')
  })

  it('an inactive preset is never run', async () => {
    for (const status of ['DRAFT', 'DISABLED', 'BLOCKED', 'ARCHIVED']) {
      const h = harness({}, { presets: [preset({ status })] })
      expect(await codeOf(h.service.runAnalysis(call({ body: { presetId: 'preset-1' } })))).toBe('SCADA_PRESET_NOT_ACTIVE')
      expect(h.q.calls).toHaveLength(0)
    }
  })

  it('a pinned preset version must be the resolved (effective) one', async () => {
    const h = harness({}, { presets: [preset({ effectiveTo: '2026-02-15T00:00:00.000Z' }), preset({ version: 2, effectiveFrom: '2026-02-15T00:00:00.000Z', createdAt: '2026-02-01T00:00:00.000Z' })] })
    expect(await codeOf(h.service.runAnalysis(call({ body: { presetId: 'preset-1', presetVersion: 2 } })))).toBe('OK') // NOW (2026-03-01) falls in version 2's window
    expect(await codeOf(h.service.runAnalysis(call({ body: { presetId: 'preset-1', presetVersion: 1 } })))).toBe('SCADA_PRESET_NOT_ACTIVE')
  })

  it('conflicting preset versions and a preset with an ambiguous virtual column are refused', async () => {
    expect(await codeOf(harness({}, { presets: [preset(), preset({ version: 2, createdAt: '2026-02-01T00:00:00.000Z' })] }).service.runAnalysis(call({ body: { presetId: 'preset-1' } })))).toBe('SCADA_PRESET_VERSION_CONFLICT')
    const h = harness({}, { presets: [preset({ virtualColumns: [{ virtualColumnId: 'vc-1' }] })], defs: [vcDef({ version: 1 }), vcDef({ version: 2 })] })
    expect(await codeOf(h.service.runAnalysis(call({ body: { presetId: 'preset-1' } })))).toBe('SCADA_VIRTUAL_COLUMN_VERSION_AMBIGUOUS')
  })

  it('list: a safe summary — the caller\'s ownership flag, never another user\'s id, never an expression or a physical name', async () => {
    const h = harness({}, { presets: [shared({ ownerUserId: 'u-77', virtualColumns: [{ virtualColumnId: 'vc-1', version: 1 }] }), preset({ presetId: 'mine' })], defs: [vcDef()] })
    const r = await h.service.listPresets(call())
    expect(r.presets.map(p => [p.presetId, p.isOwner])).toEqual([['mine', true], ['preset-1', false]])
    const text = JSON.stringify(r)
    expect(text).not.toMatch(/u-77|424242|expression|phys_|Server=|password/i)
    expect(r.presets[1]!.virtualColumns).toEqual([{ virtualColumnId: 'vc-1', version: 1 }])
    expect(h.audits.map(a => [a.actionCode, a.reasonCode, a.rowCount])).toEqual([['SCADA_QUERY_SUCCEEDED', 'OK', 2]])
  })

  it('get: the preset, its versions and the resolved plan (ids and versions only)', async () => {
    const h = harness({}, { presets: [preset({ virtualColumns: [{ virtualColumnId: 'vc-1' }] })], defs: [vcDef()] })
    const r = await h.service.getPreset(call({ param: 'preset-1' }))
    expect(r.preset).toMatchObject({ presetId: 'preset-1', version: 1, isOwner: true })
    expect(r.versions).toEqual([{ version: 1, status: 'ACTIVE', effectiveFrom: null, effectiveTo: null }])
    expect(r.resolution).toMatchObject({ status: 'RESOLVED', plan: { presetVersion: 1, virtualColumns: [{ virtualColumnId: 'vc-1', version: 1, sourceCatalogId: CAT1, seriesKey: 'SANAL' }] } })
    expect(JSON.stringify(r)).not.toMatch(/424242|expression|phys_|table|dateColumn/i)
  })

  it('get: an inactive preset is readable but reports NOT_RESOLVED with a static code (it cannot run)', async () => {
    const h = harness({}, { presets: [preset({ status: 'DISABLED' })] })
    const r = await h.service.getPreset(call({ param: 'preset-1' }))
    expect(r.resolution).toEqual({ status: 'NOT_RESOLVED', code: 'SCADA_PRESET_NOT_ACTIVE' })
  })

  it('preset endpoints audit success AND rejection; an audit failure means NO data', async () => {
    const good = harness({}, { presets: [preset()] })
    await good.service.getPreset(call({ param: 'preset-1' }))
    await good.service.getPreset(call({ param: 'nope' })).catch(() => undefined)
    expect(good.audits.map(a => [a.actionCode, a.reasonCode])).toEqual([['SCADA_QUERY_SUCCEEDED', 'OK'], ['SCADA_QUERY_DENIED', 'SCADA_NOT_FOUND']])
    const broken = harness({ audit: { record: async () => { throw new Error('audit down') } } }, { presets: [preset()] })
    expect(await codeOf(broken.service.listPresets(call()))).toBe('SCADA_AUDIT_FAILED')
    expect(await codeOf(broken.service.getPreset(call({ param: 'preset-1' })))).toBe('SCADA_AUDIT_FAILED')
  })

  it('a corrupt stored preset is skipped from the list and never resolves', async () => {
    const h = harness({}, { presets: [preset(), { ...preset({ presetId: 'bad' }), sql: 'SELECT 1' } as never] })
    expect((await h.service.listPresets(call())).presets.map(p => p.presetId)).toEqual(['preset-1'])
    expect(await codeOf(h.service.getPreset(call({ param: 'bad' })))).toBe('SCADA_NOT_FOUND')
  })
})

describe('comparison', () => {
  const periodBody = (over: Record<string, unknown> = {}) => ({
    mode: 'PERIOD', sourceCatalogIds: [CAT1], seriesKeys: ['A'], bucketInterval: 'HOURLY', timezone: ZONE,
    baseline: { startAt: START, endAt: END }, comparison: { startAt: '2026-02-02T00:00:00.000Z', endAt: '2026-02-02T04:00:00.000Z' }, ...over,
  })
  const sourceBody = (over: Record<string, unknown> = {}) => ({
    mode: 'SOURCE', leftSourceCatalogId: CAT1, rightSourceCatalogId: CAT2, seriesKeys: ['A'], bucketInterval: 'HOURLY', timezone: ZONE, period: { startAt: START, endAt: END },
    seriesMapping: [{ baseline: { sourceCatalogId: CAT1, seriesKey: 'A' }, comparison: { sourceCatalogId: CAT2, seriesKey: 'A' } }], ...over,
  })
  const twoSources = [source(), source({ catalogId: CAT2, displayName: 'Kaynak İki' })]

  it('PERIOD: two audited reads, the 027.69 chart contract, comparable AND non-comparable rows both visible', async () => {
    const h = harness({}, {
      build: q => readings(q, q.startAt.toISOString() === START ? { A: [100, 110, 120, 130, 140] } : { A: [200, null, 230, 250, 270] }),
    })
    const r = await h.service.runComparison(call({ body: periodBody() }))
    expect(h.q.calls).toHaveLength(2)
    expect(r).toMatchObject({ artifactCode: 'HOURLY_CONSUMPTION', status: 'OK', mode: 'PERIOD', bucketInterval: 'HOURLY', timezone: ZONE, preset: null })
    expect(r.rows).toHaveLength(4)
    const statuses = r.rows.map(x => x.status)
    expect(statuses).toContain('COMPARABLE')
    expect(statuses.some(s => s !== 'COMPARABLE')).toBe(true) // the gap stays visible, it is not dropped
    expect(r.rows[0]).toMatchObject({ baseline: 10, comparison: null, absoluteDelta: null, percentageDelta: null })
    expect(r.rows[0]!.status).not.toBe('COMPARABLE')
    expect(r.rows[3]).toMatchObject({ status: 'COMPARABLE', baseline: 10, comparison: 20, absoluteDelta: 10, percentageDelta: 100 })
    expect(r.summary.totalRows).toBe(4)
    expect(r.summary.comparableRows).toBe(2)
    expect(r.comparability).toBe('PARTIALLY_COMPARABLE')
  })

  it('PERIOD across DIFFERENT tenants is impossible: a source of another root is not found', async () => {
    const h = harness({}, { sources: [source({ customerRootTenantId: OTHER_ROOT })] })
    expect(await codeOf(h.service.runComparison(call({ body: periodBody() })))).toBe('SCADA_NOT_FOUND')
    expect(h.q.calls).toHaveLength(0)
  })

  it('SOURCE: the two sources are read once, compared through the explicit mapping', async () => {
    const h = harness({}, { sources: twoSources, build: q => readings(q, { A: q.catalogId === CAT1 ? [0, 10, 20, 30, 40] : [0, 12, 24, 36, 48] }) })
    const r = await h.service.runComparison(call({ body: sourceBody() }))
    expect(h.q.calls).toHaveLength(1)
    expect(h.q.calls[0]!.queries.map(q => q.catalogId)).toEqual([CAT1, CAT2])
    expect(r).toMatchObject({ status: 'OK', mode: 'SOURCE', comparability: 'COMPARABLE' })
    expect(r.rows.map(x => [x.baseline, x.comparison, x.absoluteDelta])).toEqual([[10, 12, 2], [10, 12, 2], [10, 12, 2], [10, 12, 2]])
    expect(r.rows[0]!.percentageDelta).toBe(20)
    expect(r.rows[0]!.sourceLabel).toBe('Kaynak Bir')
  })

  it('SOURCE without a series mapping is a static error (nothing is paired by position or name), before any access', async () => {
    const h = harness({}, { sources: twoSources })
    expect(await codeOf(h.service.runComparison(call({ body: sourceBody({ seriesMapping: undefined }) })))).toBe('SCADA_MAPPING_REQUIRED')
    expect(await codeOf(h.service.runComparison(call({ body: sourceBody({ seriesMapping: [] }) })))).toBe('SCADA_MAPPING_REQUIRED')
    expect(await codeOf(h.service.runComparison(call({ body: sourceBody({ rightSourceCatalogId: undefined }) })))).toBe('SCADA_MAPPING_REQUIRED')
    expect(h.touched).toEqual([])
  })

  it('a mapping to a series that was never selected shows up as an unmatched / unmapped row — not as a hidden tolerance', async () => {
    const h = harness({}, { sources: twoSources })
    const r = await h.service.runComparison(call({ body: sourceBody({ seriesMapping: [{ baseline: { sourceCatalogId: CAT1, seriesKey: 'A' }, comparison: { sourceCatalogId: CAT2, seriesKey: 'B' } }] }) }))
    expect(r.rows.every(x => x.status !== 'COMPARABLE')).toBe(true)
  })

  it.each([
    ['unknown field', periodBody({ tolerance: 0.05 }), 'SCADA_REQUEST_UNKNOWN_FIELD'],
    ['a hidden tolerance inside the mapping', sourceBody({ seriesMapping: [{ baseline: { sourceCatalogId: CAT1, seriesKey: 'A' }, comparison: { sourceCatalogId: CAT2, seriesKey: 'A' }, tolerance: 1 }] }), 'SCADA_REQUEST_INVALID'],
    ['sql', periodBody({ sql: 'SELECT 1' }), 'SCADA_REQUEST_UNKNOWN_FIELD'],
    ['a mode that is neither PERIOD nor SOURCE', periodBody({ mode: 'MERGE' }), 'SCADA_REQUEST_INVALID'],
    ['baseline after its end', periodBody({ baseline: { startAt: END, endAt: START } }), 'SCADA_TIME_RANGE_INVALID'],
    ['comparison period over the maximum', periodBody({ comparison: { startAt: START, endAt: '2027-01-01T00:00:00.000Z' } }), 'SCADA_LIMIT_EXCEEDED'],
    ['a period field in PERIOD mode', periodBody({ period: { startAt: START, endAt: END } }), 'SCADA_REQUEST_INVALID'],
    ['too many mappings', periodBody({ seriesMapping: Array.from({ length: 9 }, () => ({ baseline: { sourceCatalogId: CAT1, seriesKey: 'A' }, comparison: { sourceCatalogId: CAT1, seriesKey: 'A' } })) }), 'SCADA_LIMIT_EXCEEDED'],
    ['left equal to right', sourceBody({ rightSourceCatalogId: CAT1 }), 'SCADA_REQUEST_INVALID'],
    ['a mapping side with an extra physical field', sourceBody({ seriesMapping: [{ baseline: { sourceCatalogId: CAT1, seriesKey: 'A', table: 't' }, comparison: { sourceCatalogId: CAT2, seriesKey: 'A' } }] }), 'SCADA_REQUEST_INVALID'],
  ])('%s ⇒ %s', async (_n, body, expected) => {
    const h = harness({}, { sources: twoSources })
    expect(await codeOf(h.service.runComparison(call({ body })))).toBe(expected)
    expect(h.q.calls).toHaveLength(0)
    expect(h.audits[0]).toMatchObject({ actionCode: 'SCADA_QUERY_DENIED' })
  })

  it('a preset with a comparison configuration drives the comparison; a preset without one is refused', async () => {
    const cmp = { mode: 'SOURCE', leftSourceCatalogId: CAT1, rightSourceCatalogId: CAT2, seriesMapping: [{ baseline: { sourceCatalogId: CAT1, seriesKey: 'A' }, comparison: { sourceCatalogId: CAT2, seriesKey: 'A' } }] }
    const h = harness({}, { sources: twoSources, presets: [preset({ sourceCatalogIds: [CAT1, CAT2], comparison: cmp }), preset({ presetId: 'plain' })] })
    const r = await h.service.runComparison(call({ body: { presetId: 'preset-1' } }))
    expect(r).toMatchObject({ mode: 'SOURCE', preset: { presetId: 'preset-1', presetVersion: 1 } })
    expect(await codeOf(h.service.runComparison(call({ body: { presetId: 'plain' } })))).toBe('SCADA_REQUEST_INVALID')
  })
})

describe('raw provider errors of every port are redacted (each port is really reached)', () => {
  const secret = 'Login failed for user sa at Server=10.0.0.5;Password=hunter2 SELECT * FROM dbo.phys_table_zz9'
  it.each([
    ['the catalog', { sources: { listSources: async () => { throw new Error(secret) } } }, analysisBody()],
    ['the query provider', { query: { runMany: async () => { throw new Error(secret) } } }, analysisBody()],
    ['the virtual column store', { virtualColumns: { listDefinitions: async () => { throw new Error(secret) } } }, analysisBody({ virtualColumnIds: ['vc-1'] })],
  ])('%s throwing raw text ⇒ a static error; the text is nowhere', async (_n, over, body) => {
    const h = harness(over as never)
    const e = await h.service.runAnalysis(call({ body })).then(
      () => null,
      (err: ScadaApiError) => err,
    )
    expect(e).toBeInstanceOf(ScadaApiError)
    expect(e!.code).toBe('SCADA_SOURCE_UNAVAILABLE')
    expect(e!.message).toBe('SCADA_SOURCE_UNAVAILABLE')
    expect(JSON.stringify({ e: e!.message, audits: h.audits })).not.toMatch(/Login failed|10\.0\.0\.5|hunter2|SELECT|phys_table_zz9|dbo\./)
    expect(h.audits.map(a => a.actionCode)).toEqual(['SCADA_QUERY_FAILED'])
  })
})
