import type { TenantRecord } from '../../catalog/tenant-guards'
import { InMemoryRolloverPolicyProvider } from '../../quality/rollover-policy.port'
import { mostCritical, QUALITY_SEVERITY, type ScadaDataQualityState, type ScadaQualityInputRow } from '../../quality/scada-data-quality.contract'
import { ScadaDataQualityService } from '../../quality/scada-data-quality.service'
import { analysisAllowedForSeries, bucketsFromQualityRows } from '../series-adapters'
import { rollUpToDaily } from '../series-rollup'
import { toChartConsumption, ScadaMultiSeriesService } from '../scada-multi-series.service'
import type { ScadaSeriesBucketInput, ScadaSeriesInput, ScadaSeriesRequest } from '../scada-series.contract'

/** Synthetic fixtures only: no database, no real data. */
const ROOT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_ROOT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const T_A = '11111111-1111-4111-8111-111111111111'
const T_B = '22222222-2222-4222-8222-222222222222'
const T_X = '33333333-3333-4333-8333-333333333333'
const SRC1 = '00000000-0000-4000-8000-000000000001'
const SRC2 = '00000000-0000-4000-8000-000000000002'
const tenant = (id: string, over: Partial<TenantRecord> = {}) => ({ id, slug: `tenant-${id.slice(0, 4)}`, type: 'STANDARD', status: 'ACTIVE', ...over }) as unknown as TenantRecord
const t = (h: number, m = 0) => `2026-01-15T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`
let n = 0
function bucket(iso: string | null, value: number | null, over: Partial<ScadaSeriesBucketInput> = {}): ScadaSeriesBucketInput {
  n += 1
  const flags = over.qualityFlags ?? (value === null ? ['MISSING_VALUE' as const] : ['VALID' as const])
  return { recordId: `r-${String(n).padStart(4, '0')}`, bucketStartUtc: iso, localWallTime: iso ? iso.slice(0, 23) : null, value, dataQuality: flags[0]!, qualityFlags: flags, isComplete: value !== null, ...over }
}
function series(seriesKey: string, buckets: ScadaSeriesBucketInput[], over: Partial<ScadaSeriesInput> = {}): ScadaSeriesInput {
  return { seriesKey, label: `Etiket ${seriesKey}`, unit: 'kWh', valueType: 'INDEX', sourceCatalogId: SRC1, customerRootTenantId: ROOT, tenant: tenant(T_A), mappingResolved: true, analysisAllowed: true, buckets, ...over }
}
const scope = { tenantId: ROOT, customerRootTenantId: ROOT, dataScopeTenantIds: [ROOT, T_A, T_B] }
const range = { startAt: t(0), endAt: t(10) }
const req = (list: ScadaSeriesInput[], over: Partial<ScadaSeriesRequest> = {}): ScadaSeriesRequest => ({ scope, range, interval: 'HOURLY', series: list, ...over })
const svc = new ScadaMultiSeriesService()
const flagged = (iso: string, value: number | null, flag: ScadaDataQualityState, complete = false) => bucket(iso, value, { qualityFlags: [flag], dataQuality: flag, isComplete: complete })

describe('deterministic merge and ordering', () => {
  it('merges two or more series; series order = seriesKey (then source), independent of input order', () => {
    const a = series('B_KOLON', [bucket(t(1), 1)])
    const b = series('A_KOLON', [bucket(t(1), 2)])
    const c = series('A_KOLON', [bucket(t(1), 3)], { sourceCatalogId: SRC2 })
    const r1 = svc.build(req([a, b, c]))
    const r2 = svc.build(req([c, a, b]))
    expect(r1.series.map(s => `${s.seriesKey}@${s.sourceCatalogId.slice(-1)}`)).toEqual(['A_KOLON@1', 'A_KOLON@2', 'B_KOLON@1'])
    expect(r2).toEqual(r1)
    expect(r1.status).toBe('OK')
    expect(r1.code).toBeNull()
  })
  it('buckets are chronological, ties by recordId, readings without an instant come last', () => {
    const s = series('S', [bucket(t(3), 3, { recordId: 'z' }), bucket(t(1), 1), bucket(t(3), 30, { recordId: 'a' }), bucket(null, null, { qualityFlags: ['DST_AMBIGUOUS'], localWallTime: '2026-01-15T02:30:00.000', recordId: 'u' }), bucket(t(2), 2)])
    const r = svc.build(req([s]))
    expect(r.series[0]!.buckets.map(b => [b.bucketStartUtc, b.recordId === 'a' || b.recordId === 'z' ? b.recordId : ''])).toEqual([[t(1), ''], [t(2), ''], [t(3), 'a'], [t(3), 'z'], [null, '']])
    expect(svc.build(req([{ ...s, buckets: [...s.buckets].reverse() }]))).toEqual(r)
  })
  it('the same input gives byte-identical output', () => {
    const list = [series('A', [bucket(t(1), 1.5), bucket(t(2), 2.5)]), series('B', [bucket(t(1), 0), bucket(t(2), null)])]
    expect(JSON.stringify(svc.build(req(list)))).toBe(JSON.stringify(svc.build(req(list))))
  })
})

describe('tenant and source isolation', () => {
  it('a series of another customer root appears in NO output (not even by name); the rest is unaffected', () => {
    const own = series('EIGEN', [bucket(t(1), 5)])
    const foreign = series('YABANCI_SECRET', [bucket(t(1), 999)], { customerRootTenantId: OTHER_ROOT, tenant: tenant(T_X) })
    const r = svc.build(req([own, foreign]))
    expect(r.series.map(s => s.seriesKey)).toEqual(['EIGEN'])
    expect(JSON.stringify(r)).not.toMatch(/YABANCI_SECRET|999/)
    expect(JSON.stringify(toChartConsumption(r))).not.toMatch(/YABANCI_SECRET|999/)
    expect(r.excluded).toEqual([])
  })
  it('a sibling tenant outside the resolved data scope never enters; if nothing of the caller\'s remains the result is TENANT_SCOPE_BLOCKED', () => {
    const outside = series('X', [bucket(t(1), 1)], { tenant: tenant(T_X) })
    const r = svc.build(req([outside]))
    expect(r).toMatchObject({ status: 'BLOCKED', code: 'TENANT_SCOPE_BLOCKED', series: [] })
    const allForeign = svc.build(req([series('Y', [bucket(t(1), 1)], { customerRootTenantId: OTHER_ROOT })]))
    expect(allForeign).toMatchObject({ status: 'BLOCKED', code: 'TENANT_SCOPE_BLOCKED', series: [] })
  })
  it.each([
    ['unresolved mapping', { mappingResolved: false }],
    ['no mapped tenant', { tenant: null }],
    ['inactive tenant', { tenant: tenant(T_A, { status: 'SUSPENDED' }) }],
    ['platform root', { tenant: tenant(T_A, { type: 'PLATFORM_ROOT' }) }],
    ['the excluded organisation (never a tenant)', { tenant: tenant(T_A, { slug: 'Mosedaş' }) }],
  ])('%s produces NO analysis result: TENANT_SCOPE_BLOCKED, data omitted', (_n, over) => {
    const r = svc.build(req([series('OK', [bucket(t(1), 1)], { tenant: tenant(T_B) }), series('BLOK', [bucket(t(1), 777)], over as Partial<ScadaSeriesInput>)]))
    const blocked = r.series.find(s => s.seriesKey === 'BLOK')!
    expect(blocked).toMatchObject({ status: 'BLOCKED', analysisAllowed: false, codes: ['TENANT_SCOPE_BLOCKED'], buckets: [] })
    expect(blocked.statistics).toMatchObject({ status: 'BLOCKED', sum: null, count: 0 })
    expect(JSON.stringify(r)).not.toContain('777')
    expect(r).toMatchObject({ status: 'PARTIAL', code: 'MULTI_SERIES_PARTIAL_RESULT' })
    expect(r.excluded).toEqual([{ seriesKey: 'BLOK', sourceCatalogId: SRC1, code: 'TENANT_SCOPE_BLOCKED' }])
  })
  it('the same seriesKey from two sources is never mixed (identity = source + key)', () => {
    const r = svc.build(req([series('KOL', [bucket(t(1), 10), bucket(t(2), 20)]), series('KOL', [bucket(t(1), 1000)], { sourceCatalogId: SRC2, tenant: tenant(T_B) })]))
    const by = (src: string) => r.series.find(s => s.sourceCatalogId === src)!
    expect(by(SRC1).statistics).toMatchObject({ sum: 30, count: 2 })
    expect(by(SRC2).statistics).toMatchObject({ sum: 1000, count: 1 })
  })
  it('customerRootTenantId is required and preserved in every series output', () => {
    const r = svc.build(req([series('A', [bucket(t(1), 1)])]))
    expect(r.customerRootTenantId).toBe(ROOT)
    expect(r.series.every(s => s.customerRootTenantId === ROOT)).toBe(true)
    const missing = { ...series('M', [bucket(t(1), 1)]), customerRootTenantId: undefined } as never
    expect(svc.build(req([series('A', [bucket(t(1), 1)]), missing])).series.find(s => s.seriesKey === 'A')!.status).toBe('OK')
    expect(svc.build(req([missing])).code).toBe('INVALID_STATISTICS_INPUT')
  })
  it('the scope comes from the resolver: a malformed scope or request is a static INVALID_STATISTICS_INPUT', () => {
    for (const bad of [null, {}, { ...req([]), scope: null }, { ...req([]), scope: { tenantId: 'x' } }, { ...req([]), range: { startAt: t(5), endAt: t(5) } }, { ...req([]), interval: 'WEEKLY' }, { ...req([]), series: 'x' }]) {
      expect(svc.build(bad as never)).toMatchObject({ status: 'BLOCKED', code: 'INVALID_STATISTICS_INPUT' })
    }
  })
})

describe('series error isolation', () => {
  it('a malformed series is reported and excluded; other series are untouched', () => {
    const ok = series('OK', [bucket(t(1), 4), bucket(t(2), 6)])
    const bad = series('BAD', [{ recordId: 'x', bucketStartUtc: 'nope', value: 'abc' } as never])
    const r = svc.build(req([ok, bad]))
    expect(r.series.find(s => s.seriesKey === 'OK')).toMatchObject({ status: 'OK', statistics: { sum: 10, average: 5 } })
    expect(r.series.find(s => s.seriesKey === 'BAD')).toMatchObject({ status: 'BLOCKED', codes: ['INVALID_STATISTICS_INPUT'] })
    expect(r).toMatchObject({ status: 'PARTIAL', code: 'MULTI_SERIES_PARTIAL_RESULT' })
    expect(r.excluded).toEqual([{ seriesKey: 'BAD', sourceCatalogId: SRC1, code: 'INVALID_STATISTICS_INPUT' }])
  })
  it('free texts are bounded and printable (no unbounded user text reaches an output)', () => {
    for (const over of [{ label: 'x'.repeat(129) }, { unit: 'x'.repeat(33) }, { label: 'a\nb' }, { unit: 'a\nb' }, { seriesKey: 'k\u0000' }]) {
      const r = svc.build(req([series('OK', [bucket(t(1), 1)]), series('T', [bucket(t(1), 1)], over as never)]))
      expect(r.series.find(s => s.seriesKey === 'OK')!.status).toBe('OK')
      expect(r.excluded.some(e => e.code === 'INVALID_STATISTICS_INPUT')).toBe(true)
    }
  })
  it('an EMPTY unit is allowed: it means the unit is not verified (TASK-027.73-R2) — never a rejected series, never a made-up unit', () => {
    const r = svc.build(req([series('U', [bucket(t(1), 1)], { unit: '' } as never)]))
    expect(r.series[0]).toMatchObject({ seriesKey: 'U', unit: '', status: 'OK' })
    expect(r.excluded).toEqual([])
  })
  it('one series\' DST / counter-reset / missing problems never change another series\' quality', () => {
    const bad = series('A', [flagged(t(1), 5, 'DST_AMBIGUOUS'), flagged(t(2), null, 'COUNTER_RESET_UNRESOLVED'), bucket(t(3), null)])
    const good = series('B', [bucket(t(1), 1), bucket(t(2), 2)])
    const r = svc.build(req([bad, good]))
    const b = r.series.find(s => s.seriesKey === 'B')!
    expect(b.qualitySummary).toMatchObject({ dstAmbiguous: 0, counterResetUnresolved: 0, missingValues: 0, validBuckets: 2, highestSeverity: 'VALID' })
    expect(b.codes).toEqual([])
    expect(b.statistics).toMatchObject({ status: 'OK', sum: 3, count: 2, validCount: 2 })
    expect(b.buckets.every(x => x.qualityFlags.join() === 'VALID')).toBe(true)
  })
})

describe('statistics', () => {
  it('SUM / AVERAGE / MIN / MAX are exact; counts add up', () => {
    const r = svc.build(req([series('S', [bucket(t(1), 1), bucket(t(2), 2), bucket(t(3), 3.5), bucket(t(4), -4)])]))
    expect(r.series[0]!.statistics).toEqual({ status: 'OK', sum: 2.5, average: 0.625, min: -4, max: 3.5, count: 4, validCount: 4, missingCount: 0, invalidCount: 0, incompleteCount: 0 })
  })
  it('a real 0 is a value; null is not 0', () => {
    const zeros = svc.build(req([series('Z', [bucket(t(1), 0), bucket(t(2), 0)])])).series[0]!.statistics
    expect(zeros).toMatchObject({ status: 'OK', sum: 0, average: 0, min: 0, max: 0, validCount: 2, missingCount: 0 })
    const nulls = svc.build(req([series('N', [bucket(t(1), null), bucket(t(2), null)])])).series[0]!.statistics
    expect(nulls).toMatchObject({ status: 'NO_VALID_DATA', sum: null, average: null, min: null, max: null, validCount: 0, missingCount: 2 })
    const mixed = svc.build(req([series('M', [bucket(t(1), 0), bucket(t(2), null), bucket(t(3), 4)])])).series[0]!.statistics
    expect(mixed).toMatchObject({ sum: 4, average: 2, min: 0, max: 4, validCount: 2, missingCount: 1 }) // the null is neither 0 nor part of the average
  })
  it('a series whose values are ALL invalid yields null statistics and an explaining code — never SUM 0', () => {
    const s = series('I', [flagged(t(1), null, 'INVALID_NUMERIC_VALUE'), flagged(t(2), null, 'INVALID_NUMERIC_VALUE'), bucket(t(3), Number.NaN, { qualityFlags: ['VALID'], isComplete: true })])
    const r = svc.build(req([s])).series[0]!
    expect(r.statistics).toMatchObject({ status: 'NO_VALID_DATA', sum: null, average: null, min: null, max: null, invalidCount: 3, validCount: 0 })
    expect(r.codes).toContain('NO_VALID_DATA')
    expect(r.qualitySummary).toMatchObject({ invalidValues: 3, highestSeverity: 'INVALID_NUMERIC_VALUE' })
  })
  it('invalid / unresolved / incomplete values are counted in the quality summary but never aggregated', () => {
    const s = series('S', [
      bucket(t(1), 10),
      flagged(t(2), 1000, 'INVALID_NUMERIC_VALUE', true),
      flagged(t(3), 2000, 'COUNTER_RESET_UNRESOLVED', true), // a value is present, but the reset is unresolved
      flagged(t(4), 3000, 'DST_NONEXISTENT', true),
      flagged(t(5), 4000, 'DST_AMBIGUOUS', true),
      bucket(t(6), 5000, { qualityFlags: ['VALID'], isComplete: false }),
      bucket(t(7), 20),
    ])
    const r = svc.build(req([s])).series[0]!
    expect(r.statistics).toMatchObject({ sum: 30, average: 15, min: 10, max: 20, count: 7, validCount: 2, invalidCount: 1, incompleteCount: 4, missingCount: 0 })
    expect(r.qualitySummary).toMatchObject({ totalBuckets: 7, validBuckets: 2, invalidValues: 1, counterResetUnresolved: 1, dstAmbiguous: 1, dstNonexistent: 1 })
    expect(r.codes).toEqual(expect.arrayContaining(['DST_UNRESOLVED', 'COUNTER_RESET_UNRESOLVED', 'INCOMPLETE_BUCKET']))
    expect(r.buckets.filter(b => b.classification === 'INCOMPLETE').map(b => b.value)).toEqual([2000, 3000, 4000, 5000]) // still visible, flagged
  })
  it('resolved counter resets and explained negative steps are normal valid values', () => {
    const s = series('S', [bucket(t(1), 15, { qualityFlags: ['COUNTER_RESET_RESOLVED', 'NEGATIVE_DELTA'], dataQuality: 'COUNTER_RESET_RESOLVED', isComplete: true }), bucket(t(2), 5)])
    expect(svc.build(req([s])).series[0]!.statistics).toMatchObject({ sum: 20, validCount: 2 })
  })
  it('very large values that overflow give null, not a wrong number', () => {
    const r = svc.build(req([series('S', [bucket(t(1), 1.7e308), bucket(t(2), 1.7e308)])])).series[0]!
    expect(r.statistics).toMatchObject({ sum: null, average: null, min: 1.7e308, max: 1.7e308 })
    expect(r.codes).toContain('INVALID_STATISTICS_INPUT')
  })
  it('empty and single-point series', () => {
    expect(svc.build(req([series('E', [])])).series[0]).toMatchObject({ status: 'NO_VALID_DATA', statistics: { sum: null, count: 0 }, codes: ['NO_VALID_DATA'] })
    expect(svc.build(req([series('P', [bucket(t(1), 7)])])).series[0]!.statistics).toMatchObject({ sum: 7, average: 7, min: 7, max: 7, count: 1 })
  })
})

describe('buckets, range and buffer rows', () => {
  it('missing hourly buckets are NOT filled with 0 (a gap stays a gap)', () => {
    const r = svc.build(req([series('S', [bucket(t(1), 5), bucket(t(4), 7)])])).series[0]!
    expect(r.buckets.map(b => b.bucketStartUtc)).toEqual([t(1), t(4)])
    expect(r.statistics).toMatchObject({ count: 2, sum: 12, missingCount: 0 })
  })
  it('buffer rows are excluded from outputs, counts and statistics', () => {
    const r = svc.build(req([series('S', [bucket(t(1), 5), bucket(t(2), 5000, { isBufferRow: true }), bucket(t(3), null, { isBufferRow: true })])])).series[0]!
    expect(r.buckets).toHaveLength(1)
    expect(r.statistics).toMatchObject({ sum: 5, count: 1, missingCount: 0 })
    expect(r.qualitySummary.totalBuckets).toBe(1)
  })
  it('the range is [startAt, endAt): start inclusive, end exclusive; out-of-range buckets are left out and counted', () => {
    const r = svc.build(req([series('S', [bucket(t(0), 1), bucket(t(9, 59), 2), bucket(t(10), 4), bucket('2025-12-31T23:59:59.000Z', 8)])])).series[0]!
    expect(r.buckets.map(b => b.bucketStartUtc)).toEqual([t(0), t(9, 59)])
    expect(r.statistics.sum).toBe(3)
    expect(r.outOfRangeBuckets).toBe(2)
  })
  it('a day rolled up from hourly buckets follows the local day across a DST change (Berlin fall-back day has 25 hours)', () => {
    const hourly: ScadaSeriesBucketInput[] = []
    for (let i = 0; i < 25; i += 1) hourly.push(bucket(new Date(Date.parse('2026-10-24T22:00:00Z') + i * 3_600_000).toISOString(), 1)) // 00:00 local .. 24:00 local (25 h)
    hourly.push(bucket('2026-10-25T23:00:00.000Z', 100)) // next local day (00:00 local on the 26th is 2026-10-25T23:00Z)
    const daily = rollUpToDaily(hourly, 'Europe/Berlin', 'SUM', 'S')
    expect(daily.map(d => [d.bucketStartUtc, d.value, d.isComplete])).toEqual([
      ['2026-10-24T22:00:00.000Z', 25, true],
      ['2026-10-25T23:00:00.000Z', 100, true],
    ])
    expect(daily[0]!.recordId).toBe('S:DAY:2026-10-25')
    // the daily bucket uses the same bucketStartUtc contract and goes through the same statistics
    const r = svc.build(req([series('S', daily)], { interval: 'DAILY', range: { startAt: '2026-10-24T00:00:00.000Z', endAt: '2026-10-27T00:00:00.000Z' } }))
    expect(r.series[0]!.statistics).toMatchObject({ sum: 125, count: 2 })
  })
  it('a day with a missing or unresolved hour is INCOMPLETE_BUCKET (value only from the valid hours, nothing zero-filled)', () => {
    const hourly = [bucket('2026-01-14T21:00:00.000Z', 3), bucket('2026-01-14T22:00:00.000Z', null), flagged('2026-01-14T23:00:00.000Z', 9, 'DST_AMBIGUOUS'), bucket('2026-01-15T00:00:00.000Z', 4)]
    const [day] = rollUpToDaily(hourly, 'Europe/Istanbul', 'SUM', 'S')
    expect(day).toMatchObject({ bucketStartUtc: '2026-01-14T21:00:00.000Z', value: 7, isComplete: false })
    expect(day!.qualityFlags).toEqual(expect.arrayContaining(['INCOMPLETE_BUCKET', 'DST_AMBIGUOUS', 'MISSING_VALUE']))
    expect(rollUpToDaily([bucket('2026-01-14T21:00:00.000Z', null)], 'Europe/Istanbul', 'AVERAGE', 'S')[0]!.value).toBeNull()
    expect(rollUpToDaily([bucket('2026-01-14T21:00:00.000Z', 3, { isBufferRow: true })], 'Europe/Istanbul', 'SUM', 'S')).toEqual([])
    expect(rollUpToDaily([bucket('2026-01-14T21:00:00.000Z', 3), bucket('2026-01-14T22:00:00.000Z', 5)], 'Europe/Istanbul', 'MAX', 'S')[0]!.value).toBe(5)
  })
})

describe('blocked series and partial results', () => {
  it('analysisAllowed=false ⇒ explicitly BLOCKED: no statistic values (counts stay), data still visible, code says why', () => {
    const r = svc.build(req([series('S', [bucket(t(1), 5)], { analysisAllowed: false })]))
    expect(r.series[0]).toMatchObject({ status: 'BLOCKED', analysisAllowed: false, codes: ['SERIES_ANALYSIS_BLOCKED'] })
    expect(r.series[0]!.statistics).toMatchObject({ status: 'BLOCKED', sum: null, average: null, min: null, max: null, count: 1 })
    expect(r.series[0]!.qualitySummary.analysisAllowed).toBe(false)
  })
  it('an unverified time zone blocks a series even if the caller says allowed', () => {
    const r = svc.build(req([series('S', [flagged(t(1), null, 'TIMEZONE_UNVERIFIED')])]))
    expect(r.series[0]).toMatchObject({ status: 'BLOCKED', analysisAllowed: false })
  })
  it('one blocked series ⇒ PARTIAL (MULTI_SERIES_PARTIAL_RESULT) and the blocked one is reported; the others produce valid results', () => {
    const r = svc.build(req([series('A', [bucket(t(1), 1)], { analysisAllowed: false }), series('B', [bucket(t(1), 2)])]))
    expect(r).toMatchObject({ status: 'PARTIAL', code: 'MULTI_SERIES_PARTIAL_RESULT', excluded: [{ seriesKey: 'A', sourceCatalogId: SRC1, code: 'SERIES_ANALYSIS_BLOCKED' }] })
    expect(r.series.find(s => s.seriesKey === 'B')!.statistics.sum).toBe(2)
  })
  it('all series blocked ⇒ the whole result is SERIES_ANALYSIS_BLOCKED (never a success)', () => {
    const r = svc.build(req([series('A', [bucket(t(1), 1)], { analysisAllowed: false }), series('B', [bucket(t(1), 2)], { analysisAllowed: false })]))
    expect(r).toMatchObject({ status: 'BLOCKED', code: 'SERIES_ANALYSIS_BLOCKED' })
    expect(r.excluded).toHaveLength(2)
  })
  it('a series without valid data is NOT blocked (it reports NO_VALID_DATA) and does not turn the result partial', () => {
    const r = svc.build(req([series('A', [bucket(t(1), null)]), series('B', [bucket(t(1), 2)])]))
    expect(r).toMatchObject({ status: 'OK', code: null })
  })
})

describe('quality summary', () => {
  it('reports totals, valid/missing/invalid, unresolved counter resets, DST states, incomplete buckets, analysis state and the highest severity from the CENTRAL constant', () => {
    const s = series('S', [bucket(t(1), 1), bucket(t(2), null), flagged(t(3), null, 'INVALID_NUMERIC_VALUE'), flagged(t(4), null, 'COUNTER_RESET_UNRESOLVED'), flagged(t(5), null, 'DST_AMBIGUOUS'), flagged(t(6), null, 'DST_NONEXISTENT'), flagged(t(7), 1, 'INCOMPLETE_BUCKET')])
    const q = svc.build(req([s])).series[0]!.qualitySummary
    expect(q).toEqual({ totalBuckets: 7, validBuckets: 1, missingValues: 1, invalidValues: 1, counterResetUnresolved: 1, dstAmbiguous: 1, dstNonexistent: 1, incompleteBuckets: 1, analysisAllowed: true, highestSeverity: mostCritical(['DST_NONEXISTENT', 'INVALID_NUMERIC_VALUE', 'COUNTER_RESET_UNRESOLVED', 'DST_AMBIGUOUS', 'MISSING_VALUE', 'INCOMPLETE_BUCKET']) })
    expect(q.highestSeverity).toBe(QUALITY_SEVERITY.find(x => ['DST_NONEXISTENT', 'INVALID_NUMERIC_VALUE', 'COUNTER_RESET_UNRESOLVED', 'DST_AMBIGUOUS', 'MISSING_VALUE', 'INCOMPLETE_BUCKET'].includes(x)))
  })
})

describe('chart consumption contract (TASK-027.73)', () => {
  const build = () => svc.build(req([series('A', [bucket(t(1), 5), bucket(t(2), null), flagged(t(3), 9, 'DST_AMBIGUOUS'), bucket(null, null, { qualityFlags: ['DST_AMBIGUOUS'], localWallTime: '2026-01-15T02:30:00.000' })], { label: 'Türbin 1', unit: 'kWh' }), series('B', [bucket(t(1), 1)], { analysisAllowed: false, unit: 'm3' })]))
  it('is stable: fixed keys, title + unit, timed points with value/quality/missing/suspect, statistics, summary, range, codes', () => {
    const c = toChartConsumption(build())
    expect(Object.keys(c).sort()).toEqual(['code', 'excluded', 'interval', 'range', 'series', 'status'])
    expect(Object.keys(c.series[0]!).sort()).toEqual(['analysisAllowed', 'codes', 'points', 'qualitySummary', 'seriesKey', 'sourceCatalogId', 'statistics', 'status', 'title', 'unit', 'valueType'])
    expect(Object.keys(c.series[0]!.points[0]!).sort()).toEqual(['missing', 'quality', 'suspect', 't', 'value'])
    expect(c.range).toEqual(range)
    expect(c.series[0]).toMatchObject({ title: 'Türbin 1', unit: 'kWh', status: 'OK' })
    expect(c.series[0]!.points.map(p => [p.t, p.value, p.missing, p.suspect])).toEqual([
      [t(1), 5, false, false],
      [t(2), null, true, true],
      [t(3), 9, false, true], // present but excluded from the statistics: suspect
      [null, null, false, true],
    ])
    expect(c.series[1]).toMatchObject({ analysisAllowed: false, status: 'BLOCKED', codes: ['SERIES_ANALYSIS_BLOCKED'] })
    expect(c).toMatchObject({ status: 'PARTIAL', code: 'MULTI_SERIES_PARTIAL_RESULT' })
    expect(toChartConsumption(build())).toEqual(c)
  })
  it('carries no SQL, table/schema/database name, connection information, credential or driver detail', () => {
    const text = JSON.stringify(toChartConsumption(build())) + JSON.stringify(build())
    expect(text).not.toMatch(/SELECT|INSERT|FROM\s|Server=|Password|BotToken|connection|schema|"table"|database|driver|dbo\.|INFORMATION_SCHEMA/i)
  })
})

describe('purity', () => {
  it('never mutates its input (frozen request, series, buckets)', () => {
    const list = [series('A', [bucket(t(2), 2), bucket(t(1), 1)]), series('B', [bucket(t(1), 3)])]
    for (const s of list) {
      s.buckets.forEach(b => Object.freeze(b.qualityFlags))
      s.buckets.forEach(b => Object.freeze(b))
      Object.freeze(s.buckets)
      Object.freeze(s)
    }
    const request = Object.freeze({ ...req(list), scope: Object.freeze({ ...scope, dataScopeTenantIds: Object.freeze([...scope.dataScopeTenantIds]) }), range: Object.freeze({ ...range }), series: Object.freeze(list) })
    const before = JSON.stringify(request)
    const r = svc.build(request as never)
    expect(JSON.stringify(request)).toBe(before)
    r.series[0]!.buckets[0]!.value = -1
    expect(JSON.stringify(request)).toBe(before)
  })
  it('nothing is logged', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m => jest.spyOn(console, m).mockImplementation(() => undefined))
    try {
      svc.build(req([series('A', [bucket(t(1), 1)])]))
      svc.build(null as never)
      for (const s of spies) expect(s).not.toHaveBeenCalled()
    } finally {
      spies.forEach(s => s.mockRestore())
    }
  })
})

describe('chain with the 027.67 quality service', () => {
  const CAT = SRC1
  const qrow = (seriesKey: string, iso: string, value: number, over: Partial<ScadaQualityInputRow> = {}): ScadaQualityInputRow => ({
    occurredAtUtc: iso, localWallTime: iso.slice(0, -1), dstCandidatesUtc: [], dstUncertainRangeUtc: null, recordId: `${seriesKey}:${iso}:${Math.random().toString(36).slice(2, 6)}`, seriesKey, rawValue: value, valueType: 'INDEX', sourceCatalogId: CAT, dataQuality: 'VALID', dstResolution: 'NORMAL', isBufferRow: false, ...over,
  })
  it('consumes real quality output; another series\' unresolved DST does not block this series', () => {
    const rows = [
      qrow('A', t(1), 10), qrow('A', t(2, 30), 11, { dstResolution: 'AMBIGUOUS', occurredAtUtc: null, dstCandidatesUtc: [t(2, 30), t(3, 30)], dataQuality: 'UNVERIFIED' }), qrow('A', t(5), 20),
      qrow('B', t(1), 100), qrow('B', t(2), 105), qrow('B', t(3), 110),
    ]
    const result = new ScadaDataQualityService(new InMemoryRolloverPolicyProvider([])).evaluate({ catalogId: CAT, sourceTimeZone: 'Europe/Istanbul', rows })
    expect(result.analysisAllowed).toBe(false) // the source-level flag: some series has an unresolved reading
    const of = (k: string) => result.rows.filter(r => r.seriesKey === k)
    expect(analysisAllowedForSeries(result, of('A'))).toBe(false)
    expect(analysisAllowedForSeries(result, of('B'))).toBe(true) // isolation
    const out = svc.build(req(['A', 'B'].map(k => series(k, bucketsFromQualityRows(of(k)), { analysisAllowed: analysisAllowedForSeries(result, of(k)) }))))
    expect(out).toMatchObject({ status: 'PARTIAL' })
    expect(out.series.find(s => s.seriesKey === 'B')!.statistics).toMatchObject({ status: 'OK', sum: 10, validCount: 2 }) // the last row has no next reading → incomplete, not aggregated
    expect(out.series.find(s => s.seriesKey === 'A')).toMatchObject({ status: 'BLOCKED', codes: expect.arrayContaining(['SERIES_ANALYSIS_BLOCKED', 'DST_UNRESOLVED']) })
  })
  it('an unverified time zone blocks every series of the source', () => {
    const rows = [qrow('A', t(1), 10), qrow('A', t(2), 12)]
    const result = new ScadaDataQualityService(new InMemoryRolloverPolicyProvider([])).evaluate({ catalogId: CAT, sourceTimeZone: null, rows })
    const out = svc.build(req([series('A', bucketsFromQualityRows(result.rows), { analysisAllowed: analysisAllowedForSeries(result, result.rows) })]))
    expect(out).toMatchObject({ status: 'BLOCKED', code: 'SERIES_ANALYSIS_BLOCKED' })
  })
})
