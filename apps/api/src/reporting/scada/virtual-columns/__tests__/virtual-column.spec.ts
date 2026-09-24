import type { TenantRecord } from '../../catalog/tenant-guards'
import { ScadaComparisonService } from '../../comparison/scada-comparison.service'
import { mostCritical, type ScadaDataQualityState } from '../../quality/scada-data-quality.contract'
import { ScadaMultiSeriesService } from '../../series/scada-multi-series.service'
import type { ScadaOutputBucket, ScadaSeriesOutput } from '../../series/scada-series.contract'
import type { VirtualColumnAuditEvent, VirtualColumnDefinition, VirtualColumnLimits, VirtualColumnRequest } from '../virtual-column.contract'
import { VirtualColumnService } from '../virtual-column.service'

/** Synthetic fixtures only. Every limit below is a TEST parameter, not a proposed production value. */
const ROOT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_ROOT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const T_A = '11111111-1111-4111-8111-111111111111'
const CAT = '00000000-0000-4000-8000-00000000000a'
const OTHER_CAT = '00000000-0000-4000-8000-00000000000b'
const LIMITS: VirtualColumnLimits = { maxExpressionLength: 200, maxAstDepth: 10, maxOperatorCount: 20, maxRoundDecimals: 6, maxAbsoluteResult: 1e12 }
const H = 3_600_000
const BASE = '2026-01-15T00:00:00.000Z'
const t = (h: number) => new Date(Date.parse(BASE) + h * H).toISOString()
const tenant = (over: Partial<TenantRecord> = {}) => ({ id: T_A, slug: 'tenant-a', type: 'STANDARD', status: 'ACTIVE', ...over }) as unknown as TenantRecord

let n = 0
type P = [h: number | null, value: number | null, flag?: ScadaDataQualityState]
function bucket([h, value, flag]: P): ScadaOutputBucket {
  n += 1
  const flags: ScadaDataQualityState[] = flag ? [flag] : value === null ? ['MISSING_VALUE'] : ['VALID']
  const classification: ScadaOutputBucket['classification'] = flag === 'INVALID_NUMERIC_VALUE' ? 'INVALID' : flag && flag !== 'VALID' && flag !== 'MISSING_VALUE' ? 'INCOMPLETE' : value === null ? 'MISSING' : 'VALID'
  return { recordId: `r-${n}`, bucketStartUtc: h === null ? null : t(h), localWallTime: h === null ? '2026-01-15T02:30:00.000' : null, value, dataQuality: flags[0]!, qualityFlags: flags, isComplete: classification === 'VALID', classification }
}
function series(seriesKey: string, points: P[], over: Partial<ScadaSeriesOutput> = {}): ScadaSeriesOutput {
  return { seriesKey, label: `Etiket ${seriesKey}`, unit: 'kWh', valueType: 'INDEX', sourceCatalogId: CAT, customerRootTenantId: ROOT, analysisAllowed: true, status: 'OK', codes: [], buckets: points.map(bucket), statistics: {} as never, qualitySummary: {} as never, outOfRangeBuckets: 0, ...over }
}
function def(over: Partial<VirtualColumnDefinition> = {}): VirtualColumnDefinition {
  return { virtualColumnId: 'vc-1', catalogId: CAT, customerRootTenantId: ROOT, seriesKey: 'SANAL_1', label: 'Sanal 1', unit: 'kWh', expression: 'A + B', inputSeriesKeys: ['A', 'B'], valueType: 'INDEX', version: 1, effectiveFrom: null, effectiveTo: null, status: 'ACTIVE', createdBy: 'actor-1', updatedAt: '2026-01-01T00:00:00.000Z', ...over }
}
const A_B = () => [series('A', [[1, 10], [2, 0], [3, 5]]), series('B', [[1, 2], [2, 4], [3, 5]])]
function req(defs: VirtualColumnDefinition[], inputs: ScadaSeriesOutput[] = A_B(), over: Partial<VirtualColumnRequest> = {}): VirtualColumnRequest {
  return { scope: { tenantId: ROOT, customerRootTenantId: ROOT, dataScopeTenantIds: [ROOT, T_A] }, catalogId: CAT, tenant: tenant(), mappingResolved: true, limits: LIMITS, definitions: defs, inputSeries: inputs, ...over }
}
const svc = new VirtualColumnService()
const one = async (expression: string, inputs = A_B(), over: Partial<VirtualColumnDefinition> = {}) => svc.evaluate(req([def({ expression, ...over })], inputs))
const values = async (expression: string, inputs = A_B(), over: Partial<VirtualColumnDefinition> = {}) => (await one(expression, inputs, over)).series[0]?.buckets.map(b => b.value)
const codeOf = async (expression: string, inputs = A_B(), over: Partial<VirtualColumnDefinition> = {}) => {
  const r = await one(expression, inputs, over)
  return r.failures[0]?.code ?? r.code
}

describe('allowlist expression language', () => {
  it('arithmetic, parentheses, unary minus and precedence', async () => {
    expect(await values('A + B')).toEqual([12, 4, 10])
    expect(await values('A - B')).toEqual([8, -4, 0])
    expect(await values('A * B')).toEqual([20, 0, 25])
    expect(await values('A / B')).toEqual([5, 0, 1])
    expect(await values('A + B * 2')).toEqual([14, 8, 15])
    expect(await values('(A + B) * 2')).toEqual([24, 8, 20])
    expect(await values('-A + 100')).toEqual([90, 100, 95])
    expect(await values('2.5 * B')).toEqual([5, 10, 12.5])
    expect(await values('((A))')).toEqual([10, 0, 5])
    expect(await values('"A" + "B"')).toEqual([12, 4, 10]) // a quoted SERIES reference (the language has no strings)
  })
  it('functions: MIN MAX ABS ROUND IF', async () => {
    expect(await values('MIN(A, B)')).toEqual([2, 0, 5])
    expect(await values('MAX(A, B, 3)')).toEqual([10, 4, 5])
    expect(await values('ABS(B - A)')).toEqual([8, 4, 0])
    expect(await values('ROUND(A / 3, 2)')).toEqual([3.33, 0, 1.67])
    expect(await values('ROUND(A / 4, 0)')).toEqual([3, 0, 1])
    expect(await values('ROUND(-2.5, 0) + A - A')).toEqual([-3, -3, -3])
  })
  it('IF with comparisons and logic', async () => {
    expect(await values('IF(A > B, A, B)')).toEqual([10, 4, 5])
    expect(await values('IF(A >= 5, 1, 0)')).toEqual([1, 0, 1])
    expect(await values('IF(A < B, 1, 2)')).toEqual([2, 1, 2])
    expect(await values('IF(A <= 0, 100, A)')).toEqual([10, 100, 5])
    expect(await values('IF(A == 5, 1, 2)')).toEqual([2, 2, 1])
    expect(await values('IF(A != 5, 1, 2)')).toEqual([1, 1, 2])
    expect(await values('IF(A > 1 AND B > 1, 1, 0)')).toEqual([1, 0, 1])
    expect(await values('IF(A > 9 OR B > 4, 1, 0)')).toEqual([1, 0, 1])
    expect(await values('IF(NOT (A > 4), 1, 0)')).toEqual([0, 1, 0])
    expect(await values('IF((A > 1 AND B > 1) OR NOT (A == 0), 1, 0)')).toEqual([1, 0, 1])
  })
  it('IF / AND / OR are lazy: a division by zero in the branch that is NOT taken does not matter', async () => {
    expect(await values('IF(B == 0, 0, A / B)', [series('A', [[1, 6]]), series('B', [[1, 0]])])).toEqual([0])
    expect(await values('IF(B != 0 AND A / B > 1, 1, 2)', [series('A', [[1, 6]]), series('B', [[1, 0]])])).toEqual([2])
  })
  it('an unknown input series is refused (a reference that is not declared / not available)', async () => {
    expect(await codeOf('A + Z')).toBe('VIRTUAL_COLUMN_UNKNOWN_INPUT')
    expect(await codeOf('A + B', A_B(), { inputSeriesKeys: ['A', 'B', 'NOT_THERE'] })).toBe('VIRTUAL_COLUMN_UNKNOWN_INPUT')
    expect(await codeOf('A + B', A_B(), { inputSeriesKeys: ['A'] })).toBe('VIRTUAL_COLUMN_UNKNOWN_INPUT') // B is used but not declared
    expect(await codeOf('"Yok" + A', A_B(), { inputSeriesKeys: ['A', 'Yok'] })).toBe('VIRTUAL_COLUMN_UNKNOWN_INPUT')
  })
  it.each([
    ['A # B'], ['A ; B'], ['A = B'], ['A & B'], ['A && B'], ['A || B'], ['A | B'], ['"unterminated'], ['""'], ['A B'], ['(A + B'], ['A + B)'], ['A < B < 3'],
    ['1e5'], ['A.length'], ['A[0]'], ['{}'], ['[1, 2]'], ["'x'"], ['`x`'], ['A ? B : 1'], ['x => x'], ['() => 1'], ['A ** 2'], ['A % 2'], ['!A'], ['~A'], ['A, B'],
    ['   '], [''], ['A +'], ['* A'], ['A $ B'], ['A\\B'], ['"A\\"'], ['A > 1'], ['A AND B'], ['NOT A'], ['1..2'], ['.5'], ['0x10'],
    // SQL text
    ['(function(){})()'], ['SELECT * FROM t'], ['DROP TABLE x'], ['A; DROP TABLE x'], ['A UNION SELECT 1'], ["A' OR '1'='1"],
    // JavaScript-ish
    ['new Date()'], ['Date.now()'], ['Math.random()'], ['process.env'], ['this'], ['A.constructor'], ['constructor.constructor("x")()'], ['A.toString()'], ['let x = 1'], ['var x'], ['for (;;) {}'.replace('for (;;) {}', 'A ; A')],
  ])('rejects %j (invalid token / structure) without evaluating anything', async expr => {
    const r = await one(expr)
    expect(r.series).toEqual([])
    expect(r.failures[0]!.code === 'VIRTUAL_COLUMN_EXPRESSION_INVALID' || r.failures[0]!.code === 'VIRTUAL_COLUMN_UNKNOWN_INPUT').toBe(true)
  })
  it.each([['eval("1")'], ['Function("return 1")()'], ['require("fs")'], ['fetch("http://x")'], ['while(A)'], ['for(A)'], ['min(A, B)'], ['Min(A, B)'], ['SQRT(A)'], ['POW(A, 2)'], ['RANDOM()'], ['NOW()'], ['setTimeout(A)'], ['MYFUNC(A)'], ['IF2(A > 1, 1, 2)'], ['import("x")'], ['A(B)']])(
    'rejects the function call %j (only MIN MAX ABS ROUND IF exist)',
    async expr => {
      expect(await codeOf(expr)).toBe('VIRTUAL_COLUMN_FUNCTION_NOT_ALLOWED')
    },
  )
  it.each([['MIN(A)'], ['MAX()'], ['ABS(A, B)'], ['ABS()'], ['ROUND(A)'], ['ROUND(A, 1, 2)'], ['ROUND(A, B)'], ['ROUND(A, -1)'], ['ROUND(A, 2.5)'], ['ROUND(A, 99)'], ['IF(A > 1, 1)'], ['IF(A, 1, 2)'], ['IF(A > 1, B > 1, 2)'], ['IF(A > 1, 1, 2, 3)'], ['MIN(A > 1, 2)']])('rejects the wrong argument count / types of %j', async expr => {
    expect(await codeOf(expr)).toBe('VIRTUAL_COLUMN_EXPRESSION_INVALID')
  })
  it('a virtual column cannot reference itself or another virtual column (no recursion, no chaining)', async () => {
    expect(await codeOf('SANAL_1 + A', A_B(), { inputSeriesKeys: ['SANAL_1', 'A'] })).toBe('VIRTUAL_COLUMN_UNKNOWN_INPUT')
    const r = await svc.evaluate(req([def({ virtualColumnId: 'vc-1', seriesKey: 'V1' }), def({ virtualColumnId: 'vc-2', seriesKey: 'V2', expression: 'V1 + A', inputSeriesKeys: ['V1', 'A'] })]))
    expect(r.series.map(s => s.seriesKey)).toEqual(['V1'])
    expect(r.failures).toEqual([{ virtualColumnId: 'vc-2', code: 'VIRTUAL_COLUMN_UNKNOWN_INPUT' }])
  })
})

describe('limits come from the contract (none is invented) and fail closed', () => {
  it('too long / too deep / too many operators ⇒ TOO_COMPLEX', async () => {
    expect(await codeOf('A + ' + 'A + '.repeat(70) + 'B')).toBe('VIRTUAL_COLUMN_EXPRESSION_TOO_COMPLEX') // length 200
    expect(await codeOf('('.repeat(11) + 'A' + ')'.repeat(11))).toBe('VIRTUAL_COLUMN_EXPRESSION_TOO_COMPLEX') // nesting > depth 10
    expect(await codeOf(Array.from({ length: 12 }, () => 'A').join(' + '))).toBe('VIRTUAL_COLUMN_EXPRESSION_TOO_COMPLEX') // a left chain is depth 12
    expect(await codeOf(Array.from({ length: 22 }, () => 'A').join(' + '), A_B(), {})).toBe('VIRTUAL_COLUMN_EXPRESSION_TOO_COMPLEX')
    const generous = { ...LIMITS, maxAstDepth: 100, maxOperatorCount: 5 }
    expect((await svc.evaluate(req([def({ expression: 'A+A+A+A+A+A+A' })], A_B(), { limits: generous }))).failures[0]!.code).toBe('VIRTUAL_COLUMN_EXPRESSION_TOO_COMPLEX') // 6 operators > 5
    expect((await svc.evaluate(req([def({ expression: 'A+A+A+A+A+A' })], A_B(), { limits: generous }))).status).toBe('OK') // exactly 5 operators
  })
  it('a runaway nesting never crashes: it is TOO_COMPLEX', async () => {
    const huge = { ...LIMITS, maxExpressionLength: 1_000_000, maxAstDepth: 1_000_000, maxOperatorCount: 1_000_000 }
    const r = await svc.evaluate(req([def({ expression: '('.repeat(60_000) + 'A' + ')'.repeat(60_000) })], A_B(), { limits: huge }))
    expect(r.failures[0]!.code).toBe('VIRTUAL_COLUMN_EXPRESSION_TOO_COMPLEX')
    const chain = await svc.evaluate(req([def({ expression: Array.from({ length: 30_000 }, () => 'A').join('+') })], A_B(), { limits: huge }))
    expect(['OK', 'BLOCKED']).toContain(chain.status) // never a thrown error
  })
  it.each([
    ['missing maxExpressionLength', { maxExpressionLength: undefined }],
    ['missing maxAstDepth', { maxAstDepth: undefined }],
    ['missing maxOperatorCount', { maxOperatorCount: undefined }],
    ['missing maxRoundDecimals', { maxRoundDecimals: undefined }],
    ['missing maxAbsoluteResult', { maxAbsoluteResult: undefined }],
    ['zero length', { maxExpressionLength: 0 }],
    ['negative depth', { maxAstDepth: -1 }],
    ['fractional operator count', { maxOperatorCount: 1.5 }],
    ['string limit', { maxAstDepth: '10' as never }],
    ['NaN bound', { maxAbsoluteResult: Number.NaN }],
    ['infinite bound', { maxAbsoluteResult: Number.POSITIVE_INFINITY }],
  ])('%s ⇒ nothing is accepted (fail closed)', async (_n, patch) => {
    const r = await svc.evaluate(req([def()], A_B(), { limits: { ...LIMITS, ...patch } as never }))
    expect(r).toMatchObject({ status: 'BLOCKED', code: 'VIRTUAL_COLUMN_EXPRESSION_TOO_COMPLEX', series: [] })
    expect((await svc.evaluate(req([def()], A_B(), { limits: null as never }))).status).toBe('BLOCKED')
  })
})

describe('missing and unresolved inputs are never 0', () => {
  const one0 = async (aPoint: P, expr = 'A + B') => {
    const r = await svc.evaluate(req([def({ expression: expr })], [series('A', [aPoint]), series('B', [[1, 5]])]))
    return r.series[0]!
  }
  it('a null input ⇒ value null, incomplete, analysisAllowed=false on that bucket, MISSING kept + VIRTUAL_COLUMN_INPUT_UNRESOLVED', async () => {
    const s = await one0([1, null])
    expect(s.buckets[0]).toMatchObject({ value: null, isComplete: false, analysisAllowed: false, classification: 'INCOMPLETE', dataQuality: 'VIRTUAL_COLUMN_INPUT_UNRESOLVED' })
    expect(s.buckets[0]!.qualityFlags).toEqual(expect.arrayContaining(['MISSING_VALUE', 'VIRTUAL_COLUMN_INPUT_UNRESOLVED']))
    expect(s.statistics).toMatchObject({ status: 'NO_VALID_DATA', sum: null, validCount: 0 })
  })
  it('a real 0 input is a normal valid input (0 + 5 = 5, 0 * 5 = 0)', async () => {
    expect((await one0([1, 0])).buckets[0]).toMatchObject({ value: 5, isComplete: true, analysisAllowed: true, dataQuality: 'VALID', classification: 'VALID' })
    expect((await one0([1, 0], 'A * B')).buckets[0]).toMatchObject({ value: 0, isComplete: true, classification: 'VALID' })
  })
  it('an input bucket that does not exist at that instant is MISSING — never filled with 0', async () => {
    const r = await svc.evaluate(req([def()], [series('A', [[1, 1], [2, 2]]), series('B', [[1, 5]])]))
    expect(r.series[0]!.buckets.map(b => [b.bucketStartUtc, b.value, b.classification])).toEqual([[t(1), 6, 'VALID'], [t(2), null, 'INCOMPLETE']])
    expect(r.series[0]!.buckets[1]!.qualityFlags).toEqual(expect.arrayContaining(['MISSING_VALUE', 'VIRTUAL_COLUMN_INPUT_UNRESOLVED']))
  })
  it.each(['DST_AMBIGUOUS', 'DST_NONEXISTENT', 'COUNTER_RESET_UNRESOLVED', 'POLICY_INVALID', 'INVALID_NUMERIC_VALUE', 'INCOMPLETE_BUCKET', 'DUPLICATE_TIMESTAMP'] as const)('an input flagged %s gives no number; the source flag is preserved and outranks the derived one', async flag => {
    const s = await one0([1, 7, flag])
    expect(s.buckets[0]).toMatchObject({ value: null, isComplete: false, analysisAllowed: false })
    expect(s.buckets[0]!.qualityFlags).toEqual(expect.arrayContaining([flag, 'VIRTUAL_COLUMN_INPUT_UNRESOLVED']))
    expect(s.buckets[0]!.dataQuality).toBe(mostCritical([flag, 'VIRTUAL_COLUMN_INPUT_UNRESOLVED']))
    expect(s.statistics.sum).toBeNull()
  })
  it('a reading without a trustworthy instant becomes an UNPLACED unresolved derived bucket (never aligned by guess)', async () => {
    const r = await svc.evaluate(req([def()], [series('A', [[1, 1], [null, 9, 'DST_AMBIGUOUS']]), series('B', [[1, 5]])]))
    expect(r.series[0]!.buckets.map(b => [b.bucketStartUtc, b.value])).toEqual([[t(1), 6], [null, null]])
    expect(r.series[0]!.buckets[1]).toMatchObject({ dataQuality: 'DST_AMBIGUOUS', isComplete: false, analysisAllowed: false })
    expect(r.series[0]!.codes).toEqual(expect.arrayContaining(['DST_UNRESOLVED']))
  })
  it('an input series that is BLOCKED (analysisAllowed=false) blocks the virtual series and yields no number', async () => {
    const r = await svc.evaluate(req([def()], [series('A', [[1, 1]], { analysisAllowed: false, status: 'BLOCKED' }), series('B', [[1, 5]])]))
    expect(r.series[0]).toMatchObject({ status: 'BLOCKED', analysisAllowed: false, codes: expect.arrayContaining(['SERIES_ANALYSIS_BLOCKED']) })
    expect(r.series[0]!.buckets[0]!.value).toBeNull()
    expect(r.series[0]!.statistics).toMatchObject({ status: 'BLOCKED', sum: null })
  })
  it('only the REFERENCED inputs matter: an unresolved series that the expression does not use changes nothing', async () => {
    const r = await svc.evaluate(req([def({ expression: 'A * 2', inputSeriesKeys: ['A'] })], [series('A', [[1, 3]]), series('B', [[1, null]])]))
    expect(r.series[0]!.buckets[0]).toMatchObject({ value: 6, isComplete: true })
  })
})

describe('mathematical safety', () => {
  it('division by 0 ⇒ null + VIRTUAL_COLUMN_DIVISION_INVALID, incomplete — never 0, Infinity or the previous value', async () => {
    const r = await svc.evaluate(req([def({ expression: 'A / B' })], [series('A', [[1, 6], [2, 6], [3, 0]]), series('B', [[1, 2], [2, 0], [3, 0]])]))
    expect(r.series[0]!.buckets.map(b => [b.value, b.dataQuality, b.isComplete])).toEqual([[3, 'VALID', true], [null, 'VIRTUAL_COLUMN_DIVISION_INVALID', false], [null, 'VIRTUAL_COLUMN_DIVISION_INVALID', false]])
    expect(r.series[0]!.buckets[1]!.qualityFlags).toContain('VIRTUAL_COLUMN_DIVISION_INVALID')
    expect(r.series[0]!.buckets[1]!.classification).toBe('INCOMPLETE')
    expect((await values('A / (B - B)'))).toEqual([null, null, null])
    expect((await values('1 / 0'))?.every(v => v === null)).toBe(true)
  })
  it('NaN / Infinity / overflow / out-of-bound results are invalid (null + INVALID_NUMERIC_VALUE)', async () => {
    const big = [series('A', [[1, 1e200]]), series('B', [[1, 1e200]])]
    const r = await svc.evaluate(req([def({ expression: 'A * B' })], big))
    expect(r.series[0]!.buckets[0]).toMatchObject({ value: null, dataQuality: 'INVALID_NUMERIC_VALUE', isComplete: false, classification: 'INVALID' })
    expect(await values('A * 2', [series('A', [[1, 6e11]])], { inputSeriesKeys: ['A'] })).toEqual([null]) // 1.2e12 > the allowed bound 1e12
    expect(await values('A * 2', [series('A', [[1, 4e11]])], { inputSeriesKeys: ['A'] })).toEqual([8e11])
    expect(await values('A + 1', [series('A', [[1, 1e12]])], { inputSeriesKeys: ['A'] })).toEqual([null])
    expect(await values('A - B', [series('A', [[1, Number.NaN]]), series('B', [[1, 1]])])).toEqual([null])
    expect(await values('A + B', [series('A', [[1, Number.POSITIVE_INFINITY]]), series('B', [[1, 1]])])).toEqual([null])
    expect(await values('1e5')).toBeUndefined()
    expect(await values('99999999999999999999999999 + A', A_B(), { inputSeriesKeys: ['A'] })).toEqual([null, null, null]) // a huge literal is out of bound
  })
  it('ROUND precision must be a literal within the external bound; results are rounded half away from zero', async () => {
    expect(await values('ROUND(A / 8, 3)', [series('A', [[1, 1]])], { inputSeriesKeys: ['A'] })).toEqual([0.125])
    expect(await values('ROUND(A / 8, 1)', [series('A', [[1, 1]])], { inputSeriesKeys: ['A'] })).toEqual([0.1])
    expect(await codeOf('ROUND(A, 7)')).toBe('VIRTUAL_COLUMN_EXPRESSION_INVALID')
  })
  it('comparison is exact (no hidden tolerance)', async () => {
    expect(await values('IF(A == B, 1, 0)', [series('A', [[1, 0.1 + 0.2]]), series('B', [[1, 0.3]])])).toEqual([0])
  })
})

describe('versions and the effective window [effectiveFrom, effectiveTo)', () => {
  const v1 = (over: Partial<VirtualColumnDefinition> = {}) => def({ version: 1, expression: 'A + B', effectiveTo: t(2), ...over })
  const v2 = (over: Partial<VirtualColumnDefinition> = {}) => def({ version: 2, expression: 'A - B', effectiveFrom: t(2), ...over })
  it('each bucket is computed by the version effective at its instant (from inclusive, to exclusive); the version travels with the point', async () => {
    const r = await svc.evaluate(req([v1(), v2()]))
    expect(r.series[0]!.buckets.map(b => [b.bucketStartUtc, b.value, b.version])).toEqual([[t(1), 12, 1], [t(2), -4, 2], [t(3), 0, 2]])
    expect(r.series[0]!.virtual.versions).toEqual([1, 2])
  })
  it('buckets outside every window are not computed and not listed (counted)', async () => {
    const r = await svc.evaluate(req([def({ effectiveFrom: t(2), effectiveTo: t(3) })]))
    expect(r.series[0]!.buckets.map(b => b.bucketStartUtc)).toEqual([t(2)])
    expect(r.series[0]!.virtual.notEffectiveBuckets).toBe(2)
  })
  it('an inactive definition (DRAFT / DISABLED / BLOCKED) takes no part in the calculation', async () => {
    for (const status of ['DRAFT', 'DISABLED', 'BLOCKED'] as const) {
      const r = await svc.evaluate(req([def({ status })]))
      expect(r).toMatchObject({ status: 'BLOCKED', code: 'VIRTUAL_COLUMN_NOT_ACTIVE', series: [], failures: [{ virtualColumnId: 'vc-1', code: 'VIRTUAL_COLUMN_NOT_ACTIVE' }] })
    }
    const r = await svc.evaluate(req([def({ version: 1, status: 'DISABLED', expression: 'A * 1000', inputSeriesKeys: ['A'] }), def({ version: 2 })]))
    expect(r.series[0]!.buckets[0]!.value).toBe(12)
    expect(r.series[0]!.virtual.versions).toEqual([2])
  })
  it('two ACTIVE versions with overlapping windows ⇒ VERSION_CONFLICT and NO calculation', async () => {
    for (const pair of [
      [def({ version: 1 }), def({ version: 2 })], // both open
      [def({ version: 1, effectiveTo: t(3) }), def({ version: 2, effectiveFrom: t(2) })],
      [def({ version: 1, effectiveFrom: t(1), effectiveTo: t(5) }), def({ version: 2, effectiveFrom: t(2), effectiveTo: t(3) })],
    ]) {
      const r = await svc.evaluate(req(pair))
      expect(r).toMatchObject({ status: 'BLOCKED', code: 'VIRTUAL_COLUMN_VERSION_CONFLICT', series: [] })
    }
    // touching windows ([a,b) and [b,c)) do NOT overlap
    expect((await svc.evaluate(req([v1(), v2()]))).status).toBe('OK')
  })
  it('the same version twice, or versions that disagree on the series identity ⇒ VERSION_CONFLICT', async () => {
    expect((await svc.evaluate(req([def({ version: 1 }), def({ version: 1, effectiveFrom: t(5) })]))).code).toBe('VIRTUAL_COLUMN_VERSION_CONFLICT')
    // the same version number twice even when the windows do NOT overlap: still one identity, still ambiguous
    expect((await svc.evaluate(req([def({ version: 1, effectiveTo: t(2) }), def({ version: 1, effectiveFrom: t(3) })]))).code).toBe('VIRTUAL_COLUMN_VERSION_CONFLICT')
    expect((await svc.evaluate(req([v1(), v2({ seriesKey: 'BASKA' })]))).code).toBe('VIRTUAL_COLUMN_VERSION_CONFLICT')
    expect((await svc.evaluate(req([v1(), v2({ valueType: 'REAL_VALUE' })]))).code).toBe('VIRTUAL_COLUMN_VERSION_CONFLICT')
  })
  it('a malformed definition (bad window / version / status / text) is refused', async () => {
    for (const bad of [{ effectiveFrom: 'nope' }, { effectiveFrom: t(3), effectiveTo: t(1) }, { version: 0 }, { version: 1.5 }, { status: 'LIVE' as never }, { label: 'x'.repeat(129) }, { unit: '' }, { createdBy: 'a\nb' }, { inputSeriesKeys: [] }, { inputSeriesKeys: ['A', 'A'] }, { updatedAt: 'x' }]) {
      const r = await svc.evaluate(req([def(bad as never)]))
      expect(r.status).toBe('BLOCKED')
      expect(r.failures[0]!.code).toBe('VIRTUAL_COLUMN_EXPRESSION_INVALID')
    }
  })
})

describe('tenant, source and scope isolation', () => {
  it('a definition of another tenant or another source is never evaluated (SCOPE_BLOCKED)', async () => {
    expect((await svc.evaluate(req([def({ customerRootTenantId: OTHER_ROOT })]))).failures[0]!.code).toBe('VIRTUAL_COLUMN_SCOPE_BLOCKED')
    expect((await svc.evaluate(req([def({ catalogId: OTHER_CAT })]))).failures[0]!.code).toBe('VIRTUAL_COLUMN_SCOPE_BLOCKED')
    const r = await svc.evaluate(req([def(), def({ virtualColumnId: 'vc-x', seriesKey: 'X', customerRootTenantId: OTHER_ROOT })]))
    expect(r).toMatchObject({ status: 'PARTIAL', failures: [{ virtualColumnId: 'vc-x', code: 'VIRTUAL_COLUMN_SCOPE_BLOCKED' }] })
    expect(r.series.map(s => s.seriesKey)).toEqual(['SANAL_1'])
  })
  it('another tenant\'s or another source\'s series are INVISIBLE to an expression; their label / values never appear', async () => {
    const foreign = series('GIZLI', [[1, 777]], { customerRootTenantId: OTHER_ROOT, label: 'GIZLI ETIKET' })
    const otherSource = series('BASKA_KAYNAK', [[1, 555]], { sourceCatalogId: OTHER_CAT, label: 'BASKA ETIKET' })
    const r = await svc.evaluate(req([def({ expression: 'A + GIZLI', inputSeriesKeys: ['A', 'GIZLI'] })], [...A_B(), foreign, otherSource]))
    expect(r.failures[0]!.code).toBe('VIRTUAL_COLUMN_UNKNOWN_INPUT')
    const r2 = await svc.evaluate(req([def({ expression: 'A + BASKA_KAYNAK', inputSeriesKeys: ['A', 'BASKA_KAYNAK'] })], [...A_B(), foreign, otherSource]))
    expect(r2.failures[0]!.code).toBe('VIRTUAL_COLUMN_UNKNOWN_INPUT')
    const ok = await svc.evaluate(req([def()], [...A_B(), foreign, otherSource]))
    expect(JSON.stringify(ok)).not.toMatch(/GIZLI|BASKA|777|555/)
  })
  it('a tenant-blocked input series is not available', async () => {
    const blocked = series('A', [[1, 1]], { codes: ['TENANT_SCOPE_BLOCKED'], status: 'BLOCKED', analysisAllowed: false })
    expect((await svc.evaluate(req([def()], [blocked, series('B', [[1, 2]])]))).failures[0]!.code).toBe('VIRTUAL_COLUMN_UNKNOWN_INPUT')
  })
  it.each([
    ['unresolved mapping', { mappingResolved: false }],
    ['no mapped tenant', { tenant: null }],
    ['inactive tenant', { tenant: tenant({ status: 'SUSPENDED' }) }],
    ['platform root', { tenant: tenant({ type: 'PLATFORM_ROOT' }) }],
    ['the excluded organisation (never a tenant)', { tenant: tenant({ slug: 'Mosedaş' }) }],
    ['a tenant outside the resolved data scope', { tenant: tenant({ id: '99999999-9999-4999-8999-999999999999' }) }],
  ])('%s ⇒ the whole request is SCOPE_BLOCKED and nothing is computed', async (_n, over) => {
    const r = await svc.evaluate(req([def()], A_B(), over as never))
    expect(r).toMatchObject({ status: 'BLOCKED', code: 'VIRTUAL_COLUMN_SCOPE_BLOCKED', series: [] })
  })
  it('a virtual column can never shadow a real series or another column (seriesKey unique in the tenant)', async () => {
    expect((await svc.evaluate(req([def({ seriesKey: 'A' })]))).failures[0]!.code).toBe('VIRTUAL_COLUMN_SCOPE_BLOCKED')
    const r = await svc.evaluate(req([def({ virtualColumnId: 'vc-1', seriesKey: 'DUP' }), def({ virtualColumnId: 'vc-2', seriesKey: 'DUP' })]))
    expect(r.series).toEqual([])
    expect(r.failures.map(f => f.code)).toEqual(['VIRTUAL_COLUMN_SCOPE_BLOCKED', 'VIRTUAL_COLUMN_SCOPE_BLOCKED'])
  })
  it('the expression cannot name a table, schema or database: identifiers that are not series are unknown inputs', async () => {
    for (const expr of ['dbo + A', 'MOSB_ENERJI_DB + A', '"dbo.T" + A']) {
      const r = await svc.evaluate(req([def({ expression: expr, inputSeriesKeys: ['A'] })]))
      expect(r.series).toEqual([])
    }
  })
  it('a malformed request is refused with a static code', async () => {
    for (const bad of [null, {}, { ...req([def()]), scope: null }, { ...req([def()]), definitions: 'x' }, { ...req([def()]), catalogId: '' }]) {
      expect((await svc.evaluate(bad as never)).status).toBe('BLOCKED')
    }
  })
})

describe('several virtual columns, partial results', () => {
  it('one failing column does not affect the others', async () => {
    const r = await svc.evaluate(req([def({ virtualColumnId: 'ok', seriesKey: 'OK' }), def({ virtualColumnId: 'bad', seriesKey: 'BAD', expression: 'A +' }), def({ virtualColumnId: 'off', seriesKey: 'OFF', status: 'DISABLED' })]))
    expect(r.status).toBe('PARTIAL')
    expect(r.series.map(s => s.seriesKey)).toEqual(['OK'])
    expect(r.failures.map(f => [f.virtualColumnId, f.code])).toEqual([['bad', 'VIRTUAL_COLUMN_EXPRESSION_INVALID'], ['off', 'VIRTUAL_COLUMN_NOT_ACTIVE']])
  })
  it('output order is by seriesKey, independent of the input order', async () => {
    const defs = [def({ virtualColumnId: 'z', seriesKey: 'Z_SERI' }), def({ virtualColumnId: 'a', seriesKey: 'A_SERI', expression: 'A - B' })]
    const a = await svc.evaluate(req(defs))
    const b = await svc.evaluate(req([...defs].reverse(), [...A_B()].reverse().map(s => ({ ...s, buckets: [...s.buckets].reverse() }))))
    expect(a.series.map(s => s.seriesKey)).toEqual(['A_SERI', 'Z_SERI'])
    expect(b).toEqual(a)
  })
})

describe('the 027.68 / 027.69 contracts', () => {
  const build = async () => (await svc.evaluate(req([def()], [series('A', [[1, 10], [2, null], [3, 5]]), series('B', [[1, 2], [2, 4], [3, 5]])]))).series[0]!
  it('the derived series has the ScadaSeriesOutput shape and traceability on every point', async () => {
    const s = await build()
    expect(s).toMatchObject({ seriesKey: 'SANAL_1', label: 'Sanal 1', unit: 'kWh', valueType: 'INDEX', sourceCatalogId: CAT, customerRootTenantId: ROOT, analysisAllowed: true, status: 'OK' })
    expect(s.virtual).toEqual({ virtualColumnId: 'vc-1', versions: [1], sourceSeriesKeys: ['A', 'B'], notEffectiveBuckets: 0 })
    for (const b of s.buckets) {
      expect(Object.keys(b).sort()).toEqual(['analysisAllowed', 'bucketStartUtc', 'classification', 'dataQuality', 'isComplete', 'localWallTime', 'qualityFlags', 'recordId', 'sourceSeriesKeys', 'value', 'version', 'virtualColumnId'])
      expect(b).toMatchObject({ sourceSeriesKeys: ['A', 'B'], virtualColumnId: 'vc-1', version: 1 })
    }
    expect(s.buckets.map(b => [b.value, b.classification])).toEqual([[12, 'VALID'], [null, 'INCOMPLETE'], [10, 'VALID']])
    expect(s.statistics).toMatchObject({ status: 'OK', sum: 22, average: 11, min: 10, max: 12, validCount: 2, incompleteCount: 1 })
  })
  it('027.68: the derived series goes through the multi-series service unchanged and gives the same statistics', async () => {
    const s = await build()
    const multi = new ScadaMultiSeriesService().build({
      scope: { tenantId: ROOT, customerRootTenantId: ROOT, dataScopeTenantIds: [ROOT, T_A] },
      range: { startAt: t(0), endAt: t(24) },
      interval: 'HOURLY',
      series: [{ seriesKey: s.seriesKey, label: s.label, unit: s.unit, valueType: s.valueType, sourceCatalogId: s.sourceCatalogId, customerRootTenantId: ROOT, tenant: tenant(), mappingResolved: true, analysisAllowed: s.analysisAllowed, buckets: s.buckets.map(b => ({ recordId: b.recordId, bucketStartUtc: b.bucketStartUtc, localWallTime: b.localWallTime, value: b.value, dataQuality: b.dataQuality, qualityFlags: b.qualityFlags, isComplete: b.isComplete })) }],
    })
    expect(multi.status).toBe('OK')
    expect(multi.series[0]!.statistics).toEqual(s.statistics)
    expect(multi.series[0]!.buckets.map(b => b.classification)).toEqual(s.buckets.map(b => b.classification))
  })
  it('027.69: the derived series takes part in a comparison directly; an unresolved derived bucket is never a 0 comparison', async () => {
    const s = await build()
    const real = series('SANAL_1', [[1, 12], [2, 3], [3, 11]], { sourceCatalogId: OTHER_CAT, customerRootTenantId: ROOT })
    const cmp = new ScadaComparisonService().compareSources({
      customerRootTenantId: ROOT,
      period: { startAt: t(0), endAt: t(24), bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul' },
      leftSource: { sourceCatalogId: CAT, label: 'Sanal', series: [s] },
      rightSource: { sourceCatalogId: OTHER_CAT, label: 'Gerçek', series: [real] },
      sourceMapping: { leftSourceCatalogId: CAT, rightSourceCatalogId: OTHER_CAT },
    })
    expect(cmp.status).toBe('OK')
    expect(cmp.rows.map(r => [r.status, r.absoluteDelta])).toEqual([['COMPARABLE', 0], ['BASELINE_INVALID', null], ['COMPARABLE', 1]])
    expect(cmp.rows[1]!.baselineValue).toBeNull()
  })
})

describe('determinism, purity and output safety', () => {
  it('the same input gives the same output; the input is never mutated', async () => {
    const inputs = A_B()
    const request = req([def(), def({ virtualColumnId: 'v2', seriesKey: 'V2', expression: 'MAX(A, B)' })], inputs)
    const deep = (o: unknown): void => { if (o && typeof o === 'object') { Object.values(o).forEach(deep); Object.freeze(o) } }
    const before = JSON.stringify(request)
    deep(request)
    const a = await svc.evaluate(request)
    expect(JSON.stringify(request)).toBe(before)
    expect(JSON.stringify(await svc.evaluate(request))).toBe(JSON.stringify(a))
    a.series[0]!.buckets[0]!.value = -1
    expect(JSON.stringify(request)).toBe(before)
  })
  it('never lets a raw error out; nothing is logged', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m => jest.spyOn(console, m).mockImplementation(() => undefined))
    try {
      for (const e of ['A +', 'eval("x")', '(', '1/0', 'A # B', "A' OR 1=1"]) {
        const r = await one(e)
        expect(JSON.stringify(r)).not.toMatch(/Error|stack|at Object|SyntaxError|RangeError|undefined is not/)
      }
      for (const s of spies) expect(s).not.toHaveBeenCalled()
    } finally {
      spies.forEach(s => s.mockRestore())
    }
  })
  it('the result carries no expression text, SQL, schema/table/database name, connection information or credential', async () => {
    const secret = 'SECRETMARK'
    const r = await svc.evaluate(req([def({ expression: `A + B + 0 * 0 + 0` }), def({ virtualColumnId: 'bad', seriesKey: 'BAD', expression: `A + ${secret}` })]))
    const text = JSON.stringify(r)
    expect(text).not.toMatch(/SECRETMARK|A \+ B|SELECT|INSERT|Server=|Password|schema|"table"|database|driver|dbo\.|connection/i)
    expect(Object.keys(r).sort()).toEqual(['code', 'customerRootTenantId', 'failures', 'series', 'status'])
  })
})

describe('audit port (metadata only; action names are Q-W519 and NOT fixed here)', () => {
  it('receives ids / version / result / static reason — never the expression, SQL, names or values', async () => {
    const events: VirtualColumnAuditEvent[] = []
    const audited = new VirtualColumnService({ record: e => void events.push(e) })
    await audited.evaluate(req([def({ expression: 'A + B + 12345' }), def({ virtualColumnId: 'bad', seriesKey: 'BAD', expression: 'SELECT secret_col FROM dbo.t' }), def({ virtualColumnId: 'off', seriesKey: 'OFF', status: 'DISABLED' })]))
    expect(events.map(e => [e.virtualColumnId, e.result, e.reasonCode, e.version])).toEqual([['bad', 'FAILED', 'VIRTUAL_COLUMN_EXPRESSION_INVALID', null], ['off', 'DENIED', 'VIRTUAL_COLUMN_NOT_ACTIVE', null], ['vc-1', 'SUCCEEDED', 'OK', 1]])
    for (const e of events) {
      expect(Object.keys(e).sort()).toEqual(['catalogId', 'customerRootTenantId', 'reasonCode', 'result', 'version', 'virtualColumnId'])
      expect(e.customerRootTenantId).toBe(ROOT)
      expect(e.catalogId).toBe(CAT)
    }
    expect(JSON.stringify(events)).not.toMatch(/12345|SELECT|secret_col|dbo|A \+ B/)
  })
  it('a failing audit port never changes the outcome', async () => {
    const audited = new VirtualColumnService({ record: () => Promise.reject(new Error('audit down')) })
    expect((await audited.evaluate(req([def()]))).status).toBe('OK')
  })
})
