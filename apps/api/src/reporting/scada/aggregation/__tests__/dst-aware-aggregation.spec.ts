import { readFileSync } from 'node:fs'
import path from 'node:path'
import { aggregateDstAwareSeries, type ScadaAggregationInputRow } from '../dst-aware-aggregation'

/** Synthetic fixtures only (TASK-027.72-R1). */
const HOUR = 3_600_000
const ZONE = 'Europe/Istanbul'
const DAY_START = Date.parse('2026-01-31T21:00:00.000Z') // local 2026-02-01T00:00 (+03:00)

function row(i: number, over: Partial<ScadaAggregationInputRow> = {}): ScadaAggregationInputRow {
  const ms = DAY_START + i * HOUR
  return {
    recordId: `r${String(i).padStart(3, '0')}`,
    seriesKey: 'A',
    sourceCatalogId: 'cat-1',
    occurredAtUtc: new Date(ms).toISOString(),
    nextOccurredAtUtc: new Date(ms + HOUR).toISOString(),
    localWallTime: new Date(ms + 3 * HOUR).toISOString().replace('Z', ''),
    value: 5,
    dataQuality: 'VALID',
    qualityFlags: ['VALID'],
    isComplete: true,
    dstResolution: 'NORMAL',
    ...over,
  }
}
const day = (n = 24, over: (i: number) => Partial<ScadaAggregationInputRow> = () => ({})) => Array.from({ length: n }, (_, i) => row(i, over(i)))
const policy = { seriesKey: 'A', valueType: 'INDEX' as const, dailyOperation: 'SUM' as const }
const untimed = (over: Partial<ScadaAggregationInputRow> = {}): ScadaAggregationInputRow =>
  row(0, { recordId: 'u1', occurredAtUtc: null, nextOccurredAtUtc: null, value: null, dataQuality: 'DST_AMBIGUOUS', qualityFlags: ['DST_AMBIGUOUS'], isComplete: false, dstResolution: 'AMBIGUOUS', dstCandidatesUtc: [new Date(DAY_START + 5 * HOUR).toISOString(), new Date(DAY_START + 6 * HOUR).toISOString()], localWallTime: '2026-02-01T08:00:00.000', ...over })

describe('027.66 DST-aware adapter (TASK-027.72-R1)', () => {
  it('timed rows pass through the unchanged engine: hourly buckets, buffer row excluded, real 0 kept, null stays null', () => {
    const rows = [row(0, { value: 0 }), row(1, { value: null, dataQuality: 'MISSING_VALUE', qualityFlags: ['MISSING_VALUE'], isComplete: false }), row(2), row(3, { isBufferRow: true })]
    const r = aggregateDstAwareSeries(rows, policy, ZONE)
    expect(r.hourly.map(b => b.value)).toEqual([0, null, 5])
    expect(r.hourly[0]).toMatchObject({ dataQuality: 'VALID', isComplete: true, analysisAllowed: true })
    expect(r.hourly[1]).toMatchObject({ dataQuality: 'MISSING_VALUE', isComplete: false, analysisAllowed: false })
    expect(r.untimed).toEqual([])
  })

  it('DAILY INDEX = SUM over the LOCAL day (24 × 5 = 120), labelled by its local date', () => {
    const r = aggregateDstAwareSeries(day(), policy, ZONE)
    expect(r.daily).toHaveLength(1)
    expect(r.daily[0]).toMatchObject({ granularity: 'DAILY', localDate: '2026-02-01', value: 120, dataQuality: 'VALID', isComplete: true, bucketStartUtc: '2026-01-31T21:00:00.000Z' })
  })

  it('a daily total is never a partial sum: one missing hour makes the day null and incomplete', () => {
    const r = aggregateDstAwareSeries(day(24, i => (i === 7 ? { value: null, dataQuality: 'MISSING_VALUE', qualityFlags: ['MISSING_VALUE'], isComplete: false } : {})), policy, ZONE)
    expect(r.daily[0]).toMatchObject({ value: null, isComplete: false, analysisAllowed: false })
    expect(r.daily[0]!.qualityFlags).toContain('MISSING_VALUE')
  })

  it('without a dailyOperation there is no daily result (fail-closed, like 027.66)', () => {
    expect(aggregateDstAwareSeries(day(), { seriesKey: 'A', valueType: 'INDEX' }, ZONE).daily).toEqual([])
  })

  describe('an unresolved repeated hour (occurredAtUtc = null)', () => {
    const rows = [...day(24), untimed()]

    it('is NOT deleted: it comes out as a blocked, DST_AMBIGUOUS, untimed bucket after the timed ones', () => {
      const r = aggregateDstAwareSeries(rows, policy, ZONE)
      expect(r.untimed).toHaveLength(1)
      expect(r.untimed[0]).toMatchObject({ recordId: 'u1', bucketStartUtc: null, value: null, dataQuality: 'DST_AMBIGUOUS', isComplete: false, analysisAllowed: false, localWallTime: '2026-02-01T08:00:00.000' })
      expect(r.hourly[r.hourly.length - 1]!.recordId).toBe('u1')
    })

    it('gets NO substitute time: no output bucket for it carries any instant, and the timed count is unchanged', () => {
      const r = aggregateDstAwareSeries(rows, policy, ZONE)
      expect(r.hourly.filter(b => b.bucketStartUtc !== null)).toHaveLength(24)
      expect(r.hourly.filter(b => b.recordId === 'u1').every(b => b.bucketStartUtc === null)).toBe(true)
    })

    it('is never counted as valid data: not in the valid statistics input, value null, not analysable', () => {
      const r = aggregateDstAwareSeries(rows, policy, ZONE)
      const valid = r.hourly.filter(b => b.value !== null && b.analysisAllowed)
      expect(valid.map(b => b.recordId)).not.toContain('u1')
    })

    it('BLOCKS the neighbouring delta whose interval can contain it (even if the input claimed VALID) and only that one', () => {
      const r = aggregateDstAwareSeries(rows, policy, ZONE)
      const blocked = r.hourly.filter(b => b.bucketStartUtc !== null && b.qualityFlags.includes('DST_AMBIGUOUS'))
      // candidates are at DAY_START+5h and +6h: the intervals [4h,5h], [5h,6h] and [6h,7h] touch them
      expect(blocked.map(b => b.bucketStartUtc)).toEqual([4, 5, 6].map(h => new Date(DAY_START + h * HOUR).toISOString()))
      expect(blocked.every(b => b.value === null && !b.isComplete && !b.analysisAllowed)).toBe(true)
      const untouched = r.hourly.find(b => b.bucketStartUtc === new Date(DAY_START + 10 * HOUR).toISOString())!
      expect(untouched).toMatchObject({ value: 5, dataQuality: 'VALID' })
    })

    it('makes the day unknown: the daily total is null (not 105), incomplete, flagged', () => {
      const r = aggregateDstAwareSeries(rows, policy, ZONE)
      expect(r.daily[0]).toMatchObject({ value: null, isComplete: false, analysisAllowed: false, dataQuality: 'DST_AMBIGUOUS' })
    })

    it('a day that ONLY has an untimed reading still exists as a blocked day (nothing disappears)', () => {
      const r = aggregateDstAwareSeries([untimed({ localWallTime: '2026-03-05T08:00:00.000', dstCandidatesUtc: [] })], policy, ZONE)
      expect(r.daily).toHaveLength(1)
      expect(r.daily[0]).toMatchObject({ localDate: '2026-03-05', value: null, analysisAllowed: false })
    })
  })

  describe('a nonexistent wall time (GAP)', () => {
    const gap = untimed({ recordId: 'g1', dataQuality: 'DST_NONEXISTENT', qualityFlags: ['DST_NONEXISTENT'], dstResolution: 'GAP', dstCandidatesUtc: [], dstUncertainRangeUtc: [new Date(DAY_START + 8 * HOUR).toISOString(), new Date(DAY_START + 9 * HOUR).toISOString()] })

    it('is kept as DST_NONEXISTENT with neither the pre- nor the post-jump offset applied (no instant, no candidates)', () => {
      const r = aggregateDstAwareSeries([...day(24), gap], policy, ZONE)
      expect(r.untimed[0]).toMatchObject({ recordId: 'g1', bucketStartUtc: null, dataQuality: 'DST_NONEXISTENT', value: null })
    })

    it('blocks the deltas that touch its uncertain range (DST_NONEXISTENT), not the rest', () => {
      const r = aggregateDstAwareSeries([...day(24), gap], policy, ZONE)
      const blocked = r.hourly.filter(b => b.bucketStartUtc !== null && b.qualityFlags.includes('DST_NONEXISTENT'))
      expect(blocked.map(b => b.bucketStartUtc)).toEqual([7, 8, 9].map(h => new Date(DAY_START + h * HOUR).toISOString()))
      expect(blocked.every(b => b.value === null)).toBe(true)
    })
  })

  it('a wall time that is itself a GAP row without candidates and range is still kept and blocked', () => {
    const r = aggregateDstAwareSeries([untimed({ dstCandidatesUtc: [], dstUncertainRangeUtc: null, dstResolution: 'GAP', qualityFlags: [], dataQuality: 'VALID' })], policy, ZONE)
    expect(r.untimed[0]).toMatchObject({ dataQuality: 'DST_NONEXISTENT', value: null, analysisAllowed: false })
  })

  it('is pure and deterministic: the input is not mutated, a shuffled input gives the same output', () => {
    const rows = [...day(6), untimed()]
    const frozen = structuredClone(rows)
    rows.forEach(r => Object.freeze(r))
    const a = aggregateDstAwareSeries(rows, policy, ZONE)
    const b = aggregateDstAwareSeries([...rows].reverse(), policy, ZONE)
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    expect(rows).toEqual(frozen)
  })

  it('the additive file adds no I/O, driver, clock or randomness and leaves the 027.66 sources untouched', () => {
    const dir = path.resolve(__dirname, '..')
    const c = readFileSync(path.join(dir, 'dst-aware-aggregation.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(c).not.toMatch(/from\s+['"](mssql|tedious|pg|drizzle-orm|fs|node:fs)['"]|Date\.now|new Date\(\)|Math\.random|console\.|\.query\(|\.execute\(/)
    // the engine still takes only timed rows
    expect(readFileSync(path.join(dir, 'scada-aggregation.contract.ts'), 'utf8')).toMatch(/occurredAtUtc: string\n/)
  })
})
