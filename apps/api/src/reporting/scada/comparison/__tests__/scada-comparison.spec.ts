import { mostCritical, type ScadaDataQualityState } from '../../quality/scada-data-quality.contract'
import { ScadaMultiSeriesService } from '../../series/scada-multi-series.service'
import type { ScadaOutputBucket, ScadaSeriesOutput } from '../../series/scada-series.contract'
import { computeDelta, roundTo } from '../comparison-math'
import { ScadaComparisonService, toComparisonChart } from '../scada-comparison.service'
import type { ComparisonPeriod, PeriodComparisonRequest, SourceComparisonRequest } from '../scada-comparison.contract'

/** Synthetic fixtures only: no database, no real data. */
const ROOT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_ROOT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SRC_A = '00000000-0000-4000-8000-00000000000a'
const SRC_B = '00000000-0000-4000-8000-00000000000b'
const SRC_C = '00000000-0000-4000-8000-00000000000c'
const ZONE = 'Europe/Istanbul' // fixed +03:00: wall offsets equal UTC offsets
const H = 3_600_000
const at = (base: string, hours: number) => new Date(Date.parse(base) + hours * H).toISOString()
const JAN = '2026-01-01T00:00:00.000Z'
const FEB = '2026-02-01T00:00:00.000Z'

let n = 0
type P = [iso: string | null, value: number | null, flag?: ScadaDataQualityState, extra?: Partial<ScadaOutputBucket>]
function bucket([iso, value, flag, extra]: P): ScadaOutputBucket {
  n += 1
  const flags: ScadaDataQualityState[] = flag ? [flag] : value === null ? ['MISSING_VALUE'] : ['VALID']
  const classification: ScadaOutputBucket['classification'] = flag === 'INVALID_NUMERIC_VALUE' ? 'INVALID' : flag && flag !== 'VALID' && flag !== 'MISSING_VALUE' ? 'INCOMPLETE' : value === null ? 'MISSING' : 'VALID'
  return { recordId: `r-${String(n).padStart(5, '0')}`, bucketStartUtc: iso, localWallTime: null, value, dataQuality: flags[0]!, qualityFlags: flags, isComplete: classification === 'VALID', classification, ...extra }
}
function out(seriesKey: string, points: P[], over: Partial<ScadaSeriesOutput> = {}): ScadaSeriesOutput {
  return { seriesKey, label: `Etiket ${seriesKey}`, unit: 'kWh', valueType: 'INDEX', sourceCatalogId: SRC_A, customerRootTenantId: ROOT, analysisAllowed: true, status: 'OK', codes: [], buckets: points.map(bucket), statistics: {} as never, qualitySummary: {} as never, outOfRangeBuckets: 0, ...over }
}
const period = (start: string, series: ScadaSeriesOutput[], over: Partial<ComparisonPeriod> = {}): ComparisonPeriod => ({ startAt: start, endAt: at(start, 24), bucketInterval: 'HOURLY', timezone: ZONE, customerRootTenantId: ROOT, series, ...over })
const preq = (b: ScadaSeriesOutput[], c: ScadaSeriesOutput[], over: Partial<PeriodComparisonRequest> = {}): PeriodComparisonRequest => ({ customerRootTenantId: ROOT, baselinePeriod: period(JAN, b), comparisonPeriod: period(FEB, c), ...over })
const sreq = (l: ScadaSeriesOutput[], r: ScadaSeriesOutput[], over: Partial<SourceComparisonRequest> = {}): SourceComparisonRequest => ({
  customerRootTenantId: ROOT,
  period: { startAt: JAN, endAt: at(JAN, 24), bucketInterval: 'HOURLY', timezone: ZONE },
  leftSource: { sourceCatalogId: SRC_A, label: 'Sol kaynak', series: l },
  rightSource: { sourceCatalogId: SRC_B, label: 'Sağ kaynak', series: r },
  sourceMapping: { leftSourceCatalogId: SRC_A, rightSourceCatalogId: SRC_B },
  ...over,
})
const svc = new ScadaComparisonService()
const B = (seriesKey: string, points: P[], over: Partial<ScadaSeriesOutput> = {}) => out(seriesKey, points, { sourceCatalogId: SRC_B, ...over })
const rowsOf = (r: { rows: { status: string }[] }) => r.rows.map(x => x.status)

describe('bucket matching (never by position)', () => {
  it('same period: two sources are matched on the exact UTC bucket start (source mode)', () => {
    const r = svc.compareSources(sreq([out('K', [[at(JAN, 1), 10], [at(JAN, 2), 20]])], [B('K', [[at(JAN, 1), 15], [at(JAN, 2), 10]])]))
    expect(r.status).toBe('OK')
    expect(r.rows.map(x => [x.baselineBucketStartUtc, x.baselineValue, x.comparisonValue, x.absoluteDelta, x.percentageDelta, x.status])).toEqual([
      [at(JAN, 1), 10, 15, 5, 50, 'COMPARABLE'],
      [at(JAN, 2), 20, 10, -10, -50, 'COMPARABLE'],
    ])
  })
  it('two periods: buckets are matched on their offset from their OWN period start (Jan 1 06:00 ↔ Feb 1 06:00)', () => {
    const r = svc.comparePeriods(preq([out('K', [[at(JAN, 6), 100]])], [out('K', [[at(FEB, 6), 130]])]))
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ baselineBucketStartUtc: at(JAN, 6), comparisonBucketStartUtc: at(FEB, 6), relativeOffsetMs: 6 * H, absoluteDelta: 30, percentageDelta: 30, status: 'COMPARABLE', bucketInterval: 'HOURLY' })
  })
  it('not by index or count: a bucket present on one side only is BUCKET_UNMATCHED and the rest still meet their own time', () => {
    const r = svc.compareSources(sreq([out('K', [[at(JAN, 1), 1], [at(JAN, 2), 2], [at(JAN, 3), 3]])], [B('K', [[at(JAN, 2), 20], [at(JAN, 3), 30]])]))
    expect(r.rows.map(x => [x.baselineBucketStartUtc ?? x.comparisonBucketStartUtc, x.status, x.absoluteDelta])).toEqual([
      [at(JAN, 1), 'BUCKET_UNMATCHED', null], // an index-based match would have compared 1 with 20
      [at(JAN, 2), 'COMPARABLE', 18],
      [at(JAN, 3), 'COMPARABLE', 27],
    ])
    expect(r.rows[0]).toMatchObject({ baselineValue: 1, comparisonValue: null, reason: 'BUCKET_ABSENT' })
    expect(r.rows[0]!.comparisonSide).toMatchObject({ present: false, state: 'ABSENT' })
    expect(r.summary.unmatchedBuckets).toBe(1)
  })
  it('a missing bucket is NEVER 0: no delta, no value invented', () => {
    const r = svc.compareSources(sreq([out('K', [[at(JAN, 1), 10]])], [B('K', [])]))
    expect(r.rows[0]).toMatchObject({ status: 'BUCKET_UNMATCHED', comparisonValue: null, absoluteDelta: null, percentageDelta: null })
    expect(r.summary).toMatchObject({ comparableRows: 0, totalAbsoluteDelta: null, comparability: 'NO_COMPARABLE_DATA' })
  })
  it('no hidden tolerance: a difference of 1e-7 stays a difference, an exact match is 0', () => {
    const r = svc.compareSources(sreq([out('K', [[at(JAN, 1), 1], [at(JAN, 2), 5]])], [B('K', [[at(JAN, 1), 1.0000001], [at(JAN, 2), 5]])]))
    expect(r.rows[0]!.absoluteDelta).toBeCloseTo(1e-7, 12)
    expect(r.rows[0]!.absoluteDelta).not.toBe(0)
    expect(r.rows[1]).toMatchObject({ absoluteDelta: 0, percentageDelta: 0, status: 'COMPARABLE' })
  })
  it('local hours stay aligned across a DST change (Berlin: 06:00 local on a 25-hour day meets 06:00 local on a normal day)', () => {
    const a = period('2026-10-17T22:00:00.000Z', [out('K', [['2026-10-18T04:00:00.000Z', 10]])], { timezone: 'Europe/Berlin' }) // 06:00 local, +02:00
    const b = period('2026-10-24T22:00:00.000Z', [out('K', [['2026-10-25T05:00:00.000Z', 14]])], { timezone: 'Europe/Berlin' }) // 06:00 local, +01:00 (after the change)
    const r = svc.comparePeriods({ customerRootTenantId: ROOT, baselinePeriod: a, comparisonPeriod: b })
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ relativeOffsetMs: 6 * H, status: 'COMPARABLE', absoluteDelta: 4 })
  })
  it('two buckets under one key on a side (repeated local hour resolved by a fold) are a DUPLICATE, not a merge', () => {
    const b = period('2026-10-24T22:00:00.000Z', [out('K', [['2026-10-25T00:30:00.000Z', 1], ['2026-10-25T01:30:00.000Z', 2]])], { timezone: 'Europe/Berlin' })
    const a = period('2026-10-17T22:00:00.000Z', [out('K', [['2026-10-18T00:30:00.000Z', 5]])], { timezone: 'Europe/Berlin' })
    const r = svc.comparePeriods({ customerRootTenantId: ROOT, baselinePeriod: a, comparisonPeriod: b })
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ status: 'COMPARISON_INVALID', absoluteDelta: null })
    expect(r.rows[0]!.comparisonSide).toMatchObject({ state: 'INVALID', reason: 'DUPLICATE_BUCKET' })
  })
})

describe('determinism', () => {
  it('the same result for any record order and any series order', () => {
    const l = [out('B', [[at(JAN, 3), 3], [at(JAN, 1), 1], [at(JAN, 2), 2]]), out('A', [[at(JAN, 2), 20], [at(JAN, 1), 10]])]
    const r = [B('A', [[at(JAN, 1), 11], [at(JAN, 2), 19]]), B('B', [[at(JAN, 2), 5], [at(JAN, 3), 6], [at(JAN, 1), 4]])]
    const a = svc.compareSources(sreq(l, r))
    const b = svc.compareSources(sreq([...l].reverse().map(s => ({ ...s, buckets: [...s.buckets].reverse() })), [...r].reverse().map(s => ({ ...s, buckets: [...s.buckets].reverse() }))))
    expect(b).toEqual(a)
    expect(JSON.stringify(svc.compareSources(sreq(l, r)))).toBe(JSON.stringify(a))
    expect(a.rows.map(x => `${x.seriesKey}@${x.baselineBucketStartUtc}`)).toEqual([`A@${at(JAN, 1)}`, `A@${at(JAN, 2)}`, `B@${at(JAN, 1)}`, `B@${at(JAN, 2)}`, `B@${at(JAN, 3)}`])
  })
})

describe('series pairing (explicit only)', () => {
  it('the same seriesKey pairs directly; a different key pairs ONLY through the mapping of the call', () => {
    const mapped = svc.compareSources(sreq([out('LEFT_KOL', [[at(JAN, 1), 10]])], [B('RIGHT_KOL', [[at(JAN, 1), 12]])], { seriesMapping: [{ baseline: { sourceCatalogId: SRC_A, seriesKey: 'LEFT_KOL' }, comparison: { sourceCatalogId: SRC_B, seriesKey: 'RIGHT_KOL' } }] }))
    expect(mapped.rows[0]).toMatchObject({ seriesKey: 'LEFT_KOL', comparisonSeriesKey: 'RIGHT_KOL', absoluteDelta: 2, status: 'COMPARABLE' })
  })
  it('without a mapping nothing pairs: SERIES_MAPPING_REQUIRED (no positional pairing, no name similarity)', () => {
    for (const [l, r] of [['Turbin1', 'Turbin_1'], ['Kolon1', 'kolon1'], ['Turbin1_Enerji', 'Turbin1_Enerji_kWh'], ['A', 'B']]) {
      const res = svc.compareSources(sreq([out(l!, [[at(JAN, 1), 1]])], [B(r!, [[at(JAN, 1), 2]])]))
      expect(res).toMatchObject({ status: 'BLOCKED', code: 'SERIES_MAPPING_REQUIRED', rows: [] })
    }
    // two left series, two right series with different names, same order: still not paired by position
    expect(svc.compareSources(sreq([out('X1', [[at(JAN, 1), 1]]), out('X2', [[at(JAN, 1), 2]])], [B('Y1', [[at(JAN, 1), 3]]), B('Y2', [[at(JAN, 1), 4]])])).code).toBe('SERIES_MAPPING_REQUIRED')
  })
  it('a malformed mapping (unknown series, one series paired twice) blocks', () => {
    const l = [out('K', [[at(JAN, 1), 1]])]
    const r = [B('K', [[at(JAN, 1), 2]])]
    const ref = (s: string, src: string) => ({ sourceCatalogId: src, seriesKey: s })
    expect(svc.compareSources(sreq(l, r, { seriesMapping: [{ baseline: ref('NOPE', SRC_A), comparison: ref('K', SRC_B) }] })).code).toBe('SERIES_MAPPING_REQUIRED')
    expect(svc.compareSources(sreq(l, r, { seriesMapping: [{ baseline: ref('K', SRC_A), comparison: ref('K', SRC_B) }, { baseline: ref('K', SRC_A), comparison: ref('K', SRC_B) }] })).code).toBe('SERIES_MAPPING_REQUIRED')
  })
  it('a series without a counterpart is NEVER silently dropped: reported and its buckets stay visible as SERIES_UNMAPPED', () => {
    const r = svc.compareSources(sreq([out('K', [[at(JAN, 1), 1]]), out('ONLY_LEFT', [[at(JAN, 1), 9]])], [B('K', [[at(JAN, 1), 2]]), B('ONLY_RIGHT', [[at(JAN, 1), 8]])]))
    expect(r.unmatchedSeries).toEqual([
      { side: 'BASELINE', seriesKey: 'ONLY_LEFT', sourceCatalogId: SRC_A, seriesLabel: 'Etiket ONLY_LEFT' },
      { side: 'COMPARISON', seriesKey: 'ONLY_RIGHT', sourceCatalogId: SRC_B, seriesLabel: 'Etiket ONLY_RIGHT' },
    ])
    expect(rowsOf(r).filter(s => s === 'SERIES_UNMAPPED')).toHaveLength(2)
    expect(r.rows.find(x => x.seriesKey === 'ONLY_LEFT')).toMatchObject({ baselineValue: null, comparisonValue: null, absoluteDelta: null, status: 'SERIES_UNMAPPED' })
    expect(r.summary).toMatchObject({ unmatchedSeries: 2, comparableRows: 1, comparability: 'PARTIALLY_COMPARABLE' })
  })
  it('period mode pairs the same (source, seriesKey); a different source with the same key is NOT the same series', () => {
    const r = svc.comparePeriods(preq([out('K', [[at(JAN, 1), 1]])], [out('K', [[at(FEB, 1), 2]], { sourceCatalogId: SRC_C })]))
    expect(r).toMatchObject({ status: 'BLOCKED', code: 'SERIES_MAPPING_REQUIRED' })
  })
})

describe('values, zeros and quality states', () => {
  it('missing values: each side and both, distinct from an absent bucket, never a difference', () => {
    const r = svc.compareSources(sreq([out('K', [[at(JAN, 1), null], [at(JAN, 2), 5], [at(JAN, 3), null]])], [B('K', [[at(JAN, 1), 4], [at(JAN, 2), null], [at(JAN, 3), null]])]))
    expect(rowsOf(r)).toEqual(['BASELINE_MISSING', 'COMPARISON_MISSING', 'BOTH_MISSING'])
    expect(r.rows.every(x => x.absoluteDelta === null && x.percentageDelta === null)).toBe(true)
    expect(r.summary).toMatchObject({ baselineMissingRows: 2, comparisonMissingRows: 2, comparableRows: 0, totalAbsoluteDelta: null, comparability: 'NO_COMPARABLE_DATA' })
  })
  it('real zeros are values: 0→5, 5→0, 0→0; the percentage is null ONLY when the baseline is 0', () => {
    const r = svc.compareSources(sreq([out('K', [[at(JAN, 1), 0], [at(JAN, 2), 5], [at(JAN, 3), 0]])], [B('K', [[at(JAN, 1), 5], [at(JAN, 2), 0], [at(JAN, 3), 0]])]))
    expect(r.rows.map(x => [x.status, x.absoluteDelta, x.percentageDelta])).toEqual([['COMPARABLE', 5, null], ['COMPARABLE', -5, -100], ['COMPARABLE', 0, null]])
    expect(r.rows.every(x => x.baselineValue !== null && x.comparisonValue !== null)).toBe(true)
  })
  it('negative values: the percentage is relative to |baseline|', () => {
    const r = svc.compareSources(sreq([out('K', [[at(JAN, 1), -10], [at(JAN, 2), -5]])], [B('K', [[at(JAN, 1), -5], [at(JAN, 2), -10]])]))
    expect(r.rows.map(x => [x.absoluteDelta, x.percentageDelta])).toEqual([[5, 50], [-5, -100]])
  })
  it('NaN and overflow are fail-closed (no wrong number, the reason is visible)', () => {
    expect(computeDelta(Number.NaN, 1, null)).toEqual({ ok: false })
    expect(computeDelta(1, Number.POSITIVE_INFINITY, null)).toEqual({ ok: false })
    expect(computeDelta(1.7e308, -1.7e308, null)).toEqual({ ok: false })
    expect(computeDelta(1e-320, 1e308, null)).toEqual({ ok: false }) // the percentage overflows
    const r = svc.compareSources(sreq([out('K', [[at(JAN, 1), 1.7e308]])], [B('K', [[at(JAN, 1), -1.7e308]])]))
    expect(r.rows[0]).toMatchObject({ status: 'COMPARISON_INVALID', reason: 'NUMERIC_OVERFLOW', absoluteDelta: null, percentageDelta: null })
    expect(r.summary).toMatchObject({ comparableRows: 0, invalidRows: 1, totalAbsoluteDelta: null })
  })
  it('invalid values, incomplete data and unresolved DST / counter resets never count as comparable; the sides say who and why', () => {
    const r = svc.compareSources(sreq(
      [out('K', [[at(JAN, 1), null, 'INVALID_NUMERIC_VALUE'], [at(JAN, 2), 9, 'DST_AMBIGUOUS'], [at(JAN, 3), 9, 'DST_NONEXISTENT'], [at(JAN, 4), null, 'COUNTER_RESET_UNRESOLVED'], [at(JAN, 5), 1], [at(JAN, 6), 9, 'INCOMPLETE_BUCKET']])],
      [B('K', [[at(JAN, 1), 4], [at(JAN, 2), 5], [at(JAN, 3), 5], [at(JAN, 4), 5], [at(JAN, 5), null, 'INVALID_NUMERIC_VALUE'], [at(JAN, 6), 5]])],
    ))
    expect(rowsOf(r)).toEqual(['BASELINE_INVALID', 'DST_UNRESOLVED', 'DST_UNRESOLVED', 'COUNTER_RESET_UNRESOLVED', 'COMPARISON_INVALID', 'BASELINE_INVALID'])
    expect(r.rows.every(x => x.absoluteDelta === null)).toBe(true)
    expect(r.rows[0]!.baselineSide).toMatchObject({ state: 'INVALID', reason: 'INVALID_NUMERIC_VALUE' })
    expect(r.rows[0]!.comparisonSide).toMatchObject({ state: 'VALID', reason: null })
    expect(r.rows[1]!.baselineSide).toMatchObject({ state: 'INCOMPLETE', reason: 'DST_UNRESOLVED', flags: ['DST_AMBIGUOUS'] })
    expect(r.rows[4]!.comparisonSide.reason).toBe('INVALID_NUMERIC_VALUE')
    // a value that is present but unusable is NOT shown as a comparable number
    expect(r.rows[1]!.baselineValue).toBeNull()
    expect(r.rows[1]!.dataQuality).toBe(mostCritical(['DST_AMBIGUOUS', 'VALID']))
    expect(r.summary).toMatchObject({ comparableRows: 0, invalidRows: 3, unresolvedRows: 3, comparability: 'NO_COMPARABLE_DATA', totalAbsoluteDelta: null, averageAbsoluteDelta: null, maxSignedDelta: null, maxPercentageDelta: null })
  })
  it('a side whose analysis is blocked makes the row not comparable, with the reason', () => {
    const r = svc.compareSources(sreq([out('K', [[at(JAN, 1), 5]], { analysisAllowed: false, status: 'BLOCKED', codes: ['SERIES_ANALYSIS_BLOCKED'] })], [B('K', [[at(JAN, 1), 6]])]))
    expect(r.rows[0]).toMatchObject({ status: 'BASELINE_INVALID', absoluteDelta: null })
    expect(r.rows[0]!.baselineSide).toMatchObject({ state: 'BLOCKED', reason: 'SERIES_ANALYSIS_BLOCKED' })
  })
  it('quality flags of BOTH sides are kept; the headline uses the central ordering', () => {
    const r = svc.compareSources(sreq([out('K', [[at(JAN, 1), 5, 'COUNTER_RESET_RESOLVED']])], [B('K', [[at(JAN, 1), 6, 'NEGATIVE_DELTA']])]))
    expect(r.rows[0]!.qualityFlags).toEqual(expect.arrayContaining(['COUNTER_RESET_RESOLVED', 'NEGATIVE_DELTA']))
    expect(r.rows[0]!.dataQuality).toBe(mostCritical(['COUNTER_RESET_RESOLVED', 'NEGATIVE_DELTA']))
  })
})

describe('gates (static codes, no silent conversion)', () => {
  const l = [out('K', [[at(JAN, 1), 1]])]
  const r = [out('K', [[at(FEB, 1), 2]])]
  it('tenant: another root, a series of another root or a tenant-blocked series blocks everything and leaks nothing', () => {
    const secret = out('GIZLI_SERI', [[at(FEB, 1), 777]], { customerRootTenantId: OTHER_ROOT, label: 'GIZLI ETIKET' })
    for (const req of [
      preq(l, r, { comparisonPeriod: period(FEB, r, { customerRootTenantId: OTHER_ROOT }) }),
      preq(l, [...r, secret]),
      preq(l, [out('K', [], { codes: ['TENANT_SCOPE_BLOCKED'], status: 'BLOCKED', analysisAllowed: false })]),
      preq(l, r, { customerRootTenantId: OTHER_ROOT }),
    ]) {
      const res = svc.comparePeriods(req)
      expect(res).toMatchObject({ status: 'BLOCKED', code: 'TENANT_SCOPE_BLOCKED', rows: [], unmatchedSeries: [] })
      expect(JSON.stringify(res) + JSON.stringify(toComparisonChart(res))).not.toMatch(/GIZLI|777/)
    }
    expect(svc.compareSources(sreq(l, [B('K', [], { customerRootTenantId: OTHER_ROOT })])).code).toBe('TENANT_SCOPE_BLOCKED')
  })
  it('bucket interval mismatch', () => {
    expect(svc.comparePeriods(preq(l, r, { comparisonPeriod: period(FEB, r, { bucketInterval: 'DAILY' }) })).code).toBe('BUCKET_INTERVAL_MISMATCH')
    expect(svc.comparePeriods(preq(l, r, { baselinePeriod: period(JAN, l, { bucketInterval: 'WEEKLY' as never }), comparisonPeriod: period(FEB, r, { bucketInterval: 'WEEKLY' as never }) })).code).toBe('BUCKET_INTERVAL_MISMATCH')
    expect(svc.compareSources(sreq(l, [B('K', [])], { period: { startAt: JAN, endAt: at(JAN, 24), bucketInterval: 'MONTHLY' as never, timezone: ZONE } })).code).toBe('BUCKET_INTERVAL_MISMATCH')
  })
  it('time zone mismatch (different, invalid, an offset instead of a zone)', () => {
    expect(svc.comparePeriods(preq(l, r, { comparisonPeriod: period(FEB, r, { timezone: 'Europe/Berlin' }) })).code).toBe('TIMEZONE_MISMATCH')
    expect(svc.comparePeriods(preq(l, r, { baselinePeriod: period(JAN, l, { timezone: '+03:00' }), comparisonPeriod: period(FEB, r, { timezone: '+03:00' }) })).code).toBe('TIMEZONE_MISMATCH')
    expect(svc.compareSources(sreq(l, [B('K', [])], { period: { startAt: JAN, endAt: at(JAN, 24), bucketInterval: 'HOURLY', timezone: 'Nope/Zone' } })).code).toBe('TIMEZONE_MISMATCH')
  })
  it('invalid period range', () => {
    expect(svc.comparePeriods(preq(l, r, { baselinePeriod: period(JAN, l, { endAt: JAN }) })).code).toBe('PERIOD_RANGE_INVALID')
    expect(svc.comparePeriods(preq(l, r, { comparisonPeriod: period(FEB, r, { startAt: 'nope' }) })).code).toBe('PERIOD_RANGE_INVALID')
    expect(svc.compareSources(sreq(l, [B('K', [])], { period: { startAt: at(JAN, 5), endAt: at(JAN, 1), bucketInterval: 'HOURLY', timezone: ZONE } })).code).toBe('PERIOD_RANGE_INVALID')
  })
  it('source mapping: missing / mismatching / same source on both sides / a series of an undeclared source ⇒ SOURCE_MAPPING_REQUIRED', () => {
    const rr = [B('K', [[at(JAN, 1), 2]])]
    expect(svc.compareSources(sreq(l, rr, { sourceMapping: null })).code).toBe('SOURCE_MAPPING_REQUIRED')
    expect(svc.compareSources(sreq(l, rr, { sourceMapping: { leftSourceCatalogId: SRC_A, rightSourceCatalogId: SRC_C } })).code).toBe('SOURCE_MAPPING_REQUIRED')
    expect(svc.compareSources(sreq(l, [out('K', [[at(JAN, 1), 2]], { sourceCatalogId: SRC_C })])).code).toBe('SOURCE_MAPPING_REQUIRED')
    expect(svc.compareSources(sreq(l, rr, { rightSource: { sourceCatalogId: SRC_A, label: 'x', series: rr }, sourceMapping: { leftSourceCatalogId: SRC_A, rightSourceCatalogId: SRC_A } })).code).toBe('SOURCE_MAPPING_REQUIRED')
    expect(svc.compareSources(sreq(l, rr)).status).toBe('OK')
  })
  it('malformed input, bad labels and bad options are refused (PERIOD_INCOMPATIBLE), never repaired', () => {
    for (const bad of [null, {}, { ...preq(l, r), baselinePeriod: null }, preq([{ seriesKey: 'K' } as never], r), preq([out('K', [], { label: 'x'.repeat(129) })], r), preq(l, r, { options: { decimals: 13 } }), preq(l, r, { options: { decimals: 1.5 } }), preq(l, r, { sourceLabels: { [SRC_A]: 'a\nb' } })]) {
      expect(svc.comparePeriods(bad as never)).toMatchObject({ status: 'BLOCKED', code: 'PERIOD_INCOMPATIBLE' })
    }
  })
})

describe('summary and rounding', () => {
  const l = [out('K', [[at(JAN, 1), 10], [at(JAN, 2), 20], [at(JAN, 3), 40], [at(JAN, 4), null]])]
  const rr = [B('K', [[at(JAN, 1), 15], [at(JAN, 2), 10], [at(JAN, 3), 41], [at(JAN, 4), 3]])]
  it('reports counts and numbers over the comparable rows only', () => {
    const s = svc.compareSources(sreq(l, rr)).summary
    expect(s).toMatchObject({ totalRows: 4, comparableRows: 3, baselineMissingRows: 1, comparisonMissingRows: 0, invalidRows: 0, unmatchedBuckets: 0, unmatchedSeries: 0, totalAbsoluteDelta: -4, maxSignedDelta: 5, largestMagnitudeDelta: -10, maxPercentageDelta: 50, comparability: 'PARTIALLY_COMPARABLE' })
    expect(s.averageAbsoluteDelta).toBeCloseTo(-4 / 3, 12)
  })
  it('a fully comparable result is COMPARABLE', () => {
    expect(svc.compareSources(sreq([out('K', [[at(JAN, 1), 1]])], [B('K', [[at(JAN, 1), 2]])])).summary.comparability).toBe('COMPARABLE')
  })
  it('rounding is ONE configuration point (same for every series, no rounding by default)', () => {
    const a = [out('X', [[at(JAN, 1), 3]]), out('Y', [[at(JAN, 1), 3000]])]
    const b = [B('X', [[at(JAN, 1), 4]]), B('Y', [[at(JAN, 1), 4001]])]
    const plain = svc.compareSources(sreq(a, b))
    expect(plain.rows.map(x => x.percentageDelta)).toEqual([33.33333333333333, 33.36666666666667])
    const rounded = svc.compareSources(sreq(a, b, { options: { decimals: 1 } }))
    expect(rounded.rows.map(x => x.percentageDelta)).toEqual([33.3, 33.4])
    expect(roundTo(-2.5, 0)).toBe(-3)
    expect(roundTo(2.5, 0)).toBe(3)
    expect(roundTo(1.005, null)).toBe(1.005)
  })
})

describe('purity and output safety', () => {
  it('never mutates its input and is reproducible', () => {
    const l = [out('K', [[at(JAN, 2), 2], [at(JAN, 1), 1]])]
    const r = [B('K', [[at(JAN, 1), 3]])]
    const req = sreq(l, r)
    const frozen = JSON.stringify(req)
    const deep = (o: unknown): void => { if (o && typeof o === 'object') { Object.values(o).forEach(deep); Object.freeze(o) } }
    deep(req)
    const a = svc.compareSources(req)
    expect(JSON.stringify(req)).toBe(frozen)
    a.rows[0]!.baselineValue = -1
    expect(JSON.stringify(req)).toBe(frozen)
    expect(JSON.stringify(svc.compareSources(req))).toBe(JSON.stringify(svc.compareSources(req)))
  })
  it('carries no SQL, schema/table/database name, connection information, credential or driver error', () => {
    const res = svc.compareSources(sreq([out('K', [[at(JAN, 1), 1]])], [B('K', [[at(JAN, 1), 2]])]))
    const text = JSON.stringify(res) + JSON.stringify(toComparisonChart(res))
    expect(text).not.toMatch(/SELECT|INSERT|FROM\s|Server=|Password|token|hash|connection|schema|"table"|database|driver|dbo\.|INFORMATION_SCHEMA/i)
    for (const bad of [null, {}, { customerRootTenantId: ROOT }]) {
      expect(JSON.stringify(svc.compareSources(bad as never))).not.toMatch(/Error|stack|at Object/)
    }
  })
  it('nothing is logged', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m => jest.spyOn(console, m).mockImplementation(() => undefined))
    try {
      svc.compareSources(sreq([out('K', [[at(JAN, 1), 1]])], [B('K', [[at(JAN, 1), 2]])]))
      svc.comparePeriods(null as never)
      for (const s of spies) expect(s).not.toHaveBeenCalled()
    } finally {
      spies.forEach(s => s.mockRestore())
    }
  })
})

describe('chart consumption contract (TASK-027.73)', () => {
  const build = () => svc.compareSources(sreq([out('K', [[at(JAN, 1), 10], [at(JAN, 2), null], [at(JAN, 3), 5, 'DST_AMBIGUOUS']], { label: 'Türbin 1' })], [B('K', [[at(JAN, 1), 15], [at(JAN, 2), 4], [at(JAN, 3), 6]], { label: 'Türbin 1 (sağ)' })]))
  it('is stable: fixed keys, labels, both values, deltas, time, quality and static reason codes', () => {
    const c = toComparisonChart(build())
    expect(Object.keys(c).sort()).toEqual(['bucketInterval', 'code', 'comparability', 'mode', 'rows', 'status', 'summary', 'unmatchedSeries'])
    expect(Object.keys(c.rows[0]!).sort()).toEqual(['absoluteDelta', 'baseline', 'baselineReason', 'comparison', 'comparisonReason', 'comparisonSeriesLabel', 'comparisonSourceLabel', 'comparisonT', 'percentageDelta', 'quality', 'reasonCode', 'seriesLabel', 'sourceLabel', 'status', 't'])
    expect(c.rows[0]).toMatchObject({ t: at(JAN, 1), baseline: 10, comparison: 15, absoluteDelta: 5, percentageDelta: 50, status: 'COMPARABLE', reasonCode: null, seriesLabel: 'Türbin 1', comparisonSeriesLabel: 'Türbin 1 (sağ)', sourceLabel: 'Sol kaynak', comparisonSourceLabel: 'Sağ kaynak' })
    expect(c.rows[1]).toMatchObject({ status: 'BASELINE_MISSING', absoluteDelta: null, reasonCode: 'MISSING_VALUE', baselineReason: 'MISSING_VALUE', comparisonReason: null })
    expect(c.rows[2]).toMatchObject({ status: 'DST_UNRESOLVED', reasonCode: 'DST_UNRESOLVED', baseline: null })
    expect(toComparisonChart(build())).toEqual(c)
  })
  it('a blocked comparison carries only the static code', () => {
    const c = toComparisonChart(svc.compareSources(sreq([], [], { sourceMapping: null })))
    expect(c).toMatchObject({ status: 'BLOCKED', code: 'SOURCE_MAPPING_REQUIRED', rows: [], comparability: 'NO_COMPARABLE_DATA' })
  })
})

describe('chain with the 027.68 multi-series service', () => {
  it('compares real 027.68 outputs of two periods', () => {
    const multi = new ScadaMultiSeriesService()
    const tenant = { id: '11111111-1111-4111-8111-111111111111', slug: 't', type: 'STANDARD', status: 'ACTIVE' } as never
    const mk = (start: string, values: Array<number | null>) => {
      const res = multi.build({
        scope: { tenantId: ROOT, customerRootTenantId: ROOT, dataScopeTenantIds: [ROOT, '11111111-1111-4111-8111-111111111111'] },
        range: { startAt: start, endAt: at(start, 24) },
        interval: 'HOURLY',
        series: [{ seriesKey: 'K', label: 'Kolon', unit: 'kWh', valueType: 'INDEX', sourceCatalogId: SRC_A, customerRootTenantId: ROOT, tenant, mappingResolved: true, analysisAllowed: true, buckets: values.map((v, i) => ({ recordId: `${start}-${i}`, bucketStartUtc: at(start, i), value: v, dataQuality: v === null ? 'MISSING_VALUE' : 'VALID', qualityFlags: [v === null ? 'MISSING_VALUE' : 'VALID'], isComplete: v !== null })) }],
      })
      return res.series
    }
    const r = svc.comparePeriods({ customerRootTenantId: ROOT, baselinePeriod: period(JAN, mk(JAN, [10, 20, null, 0])), comparisonPeriod: period(FEB, mk(FEB, [12, 18, 5, 0])) })
    expect(r.rows.map(x => [x.status, x.absoluteDelta, x.percentageDelta])).toEqual([['COMPARABLE', 2, 20], ['COMPARABLE', -2, -10], ['BASELINE_MISSING', null, null], ['COMPARABLE', 0, null]])
    expect(r.summary.comparability).toBe('PARTIALLY_COMPARABLE')
  })
})
