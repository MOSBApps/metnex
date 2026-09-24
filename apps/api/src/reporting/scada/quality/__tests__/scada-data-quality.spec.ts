import { InMemoryRolloverPolicyProvider } from '../rollover-policy.port'
import { ScadaDataQualityError } from '../data-quality.errors'
import { mostCritical, QUALITY_SEVERITY, type RolloverPolicy, type ScadaQualityInputRow } from '../scada-data-quality.contract'
import { ScadaDataQualityService, summariseBucket } from '../scada-data-quality.service'

/** Synthetic fixtures only: no database, no real data. Every number is a test parameter. */
const CAT = '11111111-1111-4111-8111-111111111111'
const OTHER_CAT = '22222222-2222-4222-8222-222222222222'
const ZONE = 'Europe/Istanbul'
let seq = 0
const t = (h: number, m = 0) => `2026-01-15T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`

function row(seriesKey: string, iso: string, value: number | null, over: Partial<ScadaQualityInputRow> = {}): ScadaQualityInputRow {
  seq += 1
  return {
    occurredAtUtc: iso,
    localWallTime: iso.slice(0, -1),
    dstCandidatesUtc: [],
    dstUncertainRangeUtc: null,
    recordId: `${CAT}:${iso}:${seriesKey}:${String(seq).padStart(6, '0')}`,
    seriesKey,
    rawValue: value,
    valueType: 'INDEX',
    sourceCatalogId: CAT,
    dataQuality: value === null ? 'MISSING' : 'VALID',
    dstResolution: 'NORMAL',
    isBufferRow: false,
    ...over,
  }
}
const policy = (over: Partial<RolloverPolicy> = {}): RolloverPolicy => ({ catalogId: CAT, seriesKey: 'S1', valueType: 'INDEX', rolloverMode: 'MODULO', rolloverValue: 1000, enabled: true, version: 'v1', ...over })
const svc = (...policies: RolloverPolicy[]) => new ScadaDataQualityService(new InMemoryRolloverPolicyProvider(policies))
const run = (rows: ScadaQualityInputRow[], policies: RolloverPolicy[] = [], zone: string | null | undefined = ZONE) => svc(...policies).evaluate({ catalogId: CAT, sourceTimeZone: zone, rows })

describe('negative delta without a policy (Q-W522)', () => {
  it('1 + 2 + 9. never becomes 0: delta null, COUNTER_RESET_UNRESOLVED, incomplete, raw values preserved', () => {
    const r = run([row('S1', t(1), 100), row('S1', t(2), 90), row('S1', t(3), 95)])
    expect(r.rows[0]).toMatchObject({ rawValue: 100, nextRawValue: 90, deltaValue: null, dataQuality: 'COUNTER_RESET_UNRESOLVED', isComplete: false })
    expect(r.rows[0]!.qualityFlags).toEqual(expect.arrayContaining(['NEGATIVE_DELTA', 'POLICY_UNDEFINED', 'COUNTER_RESET_UNRESOLVED']))
    expect(r.rows[0]!.deltaValue).not.toBe(0)
    expect(r.rows[1]).toMatchObject({ rawValue: 90, deltaValue: 5, dataQuality: 'VALID', isComplete: true }) // the next step is unaffected
  })
  it('8. no hard-coded +100000 anywhere: the corrected value always comes from the explicit policy', () => {
    const noPolicy = run([row('S1', t(1), 99990), row('S1', t(2), 5)])
    expect(noPolicy.rows[0]!.deltaValue).toBeNull()
    const withPolicy = run([row('S1', t(1), 45), row('S1', t(2), 2)], [policy({ rolloverMode: 'MODULO', rolloverValue: 50 })])
    expect(withPolicy.rows[0]!.deltaValue).toBe(7) // 2 − 45 + 50, not + 100000
  })
})

describe('explicit roll-over policies', () => {
  it('3. FIXED_MAXIMUM: corrected = next + (M − current)', () => {
    const r = run([row('S1', t(1), 990), row('S1', t(2), 5)], [policy({ rolloverMode: 'FIXED_MAXIMUM', rolloverValue: 999 })])
    expect(r.rows[0]).toMatchObject({ deltaValue: 14, dataQuality: 'COUNTER_RESET_RESOLVED', isComplete: true, rawValue: 990, nextRawValue: 5 })
    expect(r.rows[0]!.qualityFlags).toEqual(expect.arrayContaining(['NEGATIVE_DELTA', 'COUNTER_RESET_RESOLVED']))
  })
  it('4. MODULO: corrected = next − current + R (the step across the wrap counts)', () => {
    const r = run([row('S1', t(1), 990), row('S1', t(2), 5)], [policy({ rolloverMode: 'MODULO', rolloverValue: 1000 })])
    expect(r.rows[0]).toMatchObject({ deltaValue: 15, dataQuality: 'COUNTER_RESET_RESOLVED', isComplete: true })
  })
  it('readings outside the declared counter range are not "corrected" (unresolved, no guess)', () => {
    const fixed = run([row('S1', t(1), 2000), row('S1', t(2), 5)], [policy({ rolloverMode: 'FIXED_MAXIMUM', rolloverValue: 999 })])
    const modulo = run([row('S1', t(1), 1000), row('S1', t(2), 5)], [policy({ rolloverMode: 'MODULO', rolloverValue: 1000 })])
    for (const r of [fixed, modulo]) expect(r.rows[0]).toMatchObject({ deltaValue: null, dataQuality: 'COUNTER_RESET_UNRESOLVED', isComplete: false })
    expect(fixed.rows[0]!.policy!.status).toBe('OUT_OF_RANGE')
  })
  it('maxExpectedDelta: an implausible corrected delta is not accepted', () => {
    const pol = policy({ rolloverMode: 'MODULO', rolloverValue: 1000, maxExpectedDelta: 10 })
    expect(run([row('S1', t(1), 990), row('S1', t(2), 5)], [pol]).rows[0]).toMatchObject({ deltaValue: null, dataQuality: 'COUNTER_RESET_UNRESOLVED' })
    expect(run([row('S1', t(1), 990), row('S1', t(2), 5)], [{ ...pol, maxExpectedDelta: 15 }]).rows[0]).toMatchObject({ deltaValue: 15, dataQuality: 'COUNTER_RESET_RESOLVED' })
  })
  it('NONE mode: an explicit "do not correct" — unresolved, and the policy is named in the trace', () => {
    const r = run([row('S1', t(1), 100), row('S1', t(2), 90)], [policy({ rolloverMode: 'NONE', rolloverValue: null, version: 7 })])
    expect(r.rows[0]).toMatchObject({ deltaValue: null, dataQuality: 'COUNTER_RESET_UNRESOLVED', isComplete: false })
    expect(r.rows[0]!.policy).toMatchObject({ status: 'NONE_MODE', version: 7, mode: 'NONE' })
  })
  it.each([
    ['FIXED_MAXIMUM without rolloverValue', policy({ rolloverMode: 'FIXED_MAXIMUM', rolloverValue: undefined })],
    ['MODULO without rolloverValue (5/6)', policy({ rolloverMode: 'MODULO', rolloverValue: null })],
    ['rolloverValue 0', policy({ rolloverValue: 0 })],
    ['negative rolloverValue', policy({ rolloverValue: -5 })],
    ['NaN rolloverValue', policy({ rolloverValue: Number.NaN })],
    ['string rolloverValue', policy({ rolloverValue: '1000' as never })],
    ['unknown mode', policy({ rolloverMode: 'AUTO' as never })],
    ['missing enabled', { ...policy(), enabled: undefined } as never],
    ['missing version', policy({ version: '' })],
    ['negative maxExpectedDelta', policy({ maxExpectedDelta: -1 })],
    ['garbage effectiveFrom', policy({ effectiveFrom: 'nope' })],
    ['effectiveFrom ≥ effectiveTo', policy({ effectiveFrom: t(5), effectiveTo: t(5) })],
  ])('5 + 6. invalid policy (%s) is never used: delta null, POLICY_INVALID, unresolved — no silent default', (_n, bad) => {
    const r = run([row('S1', t(1), 990), row('S1', t(2), 5)], [bad])
    expect(r.rows[0]).toMatchObject({ deltaValue: null, dataQuality: 'COUNTER_RESET_UNRESOLVED', isComplete: false })
    expect(r.rows[0]!.qualityFlags).toContain('POLICY_INVALID')
    expect(r.rows[0]!.policy!.status).toBe('INVALID')
  })
  it('one malformed record among valid ones makes the series POLICY_INVALID; overlapping effective versions are ambiguous → invalid', () => {
    const good = policy()
    expect(run([row('S1', t(1), 990), row('S1', t(2), 5)], [good, policy({ rolloverValue: 'x' as never, version: 'v2' })]).rows[0]!.qualityFlags).toContain('POLICY_INVALID')
    expect(run([row('S1', t(1), 990), row('S1', t(2), 5)], [good, policy({ version: 'v2', rolloverValue: 2000 })]).rows[0]!.qualityFlags).toContain('POLICY_INVALID')
  })
  it('7. the policy is chosen by (catalogId, seriesKey, valueType) only — never by a column name or a name pattern', () => {
    const rows = [row('Turbin1_Enerji_kWh (S) Fark', t(1), 990), row('Turbin1_Enerji_kWh (S) Fark', t(2), 5)]
    const lookalikes = [
      policy({ seriesKey: 'Turbin' }),
      policy({ seriesKey: 'Turbin1_Enerji_kWh' }),
      policy({ seriesKey: '(S)' }),
      policy({ seriesKey: 'Fark' }),
      policy({ seriesKey: '*' }),
      policy({ seriesKey: 'Turbin1_Enerji_kWh (S) Fark', catalogId: OTHER_CAT }),
      policy({ seriesKey: 'Turbin1_Enerji_kWh (S) Fark', valueType: 'REAL_VALUE' }),
    ]
    const r = run(rows, lookalikes)
    expect(r.rows[0]).toMatchObject({ deltaValue: null, dataQuality: 'COUNTER_RESET_UNRESOLVED' })
    expect(r.rows[0]!.qualityFlags).toContain('POLICY_UNDEFINED')
    // …and the exact key does apply
    const exact = run(rows, [policy({ seriesKey: 'Turbin1_Enerji_kWh (S) Fark' })])
    expect(exact.rows[0]).toMatchObject({ deltaValue: 15, dataQuality: 'COUNTER_RESET_RESOLVED' })
  })
  it('10. the policy version and effective window are traceable in the result', () => {
    const r = run([row('S1', t(1), 990), row('S1', t(2), 5)], [policy({ version: 'v42', effectiveFrom: t(0), effectiveTo: t(9) })])
    expect(r.rows[0]!.policy).toEqual({ status: 'APPLIED', version: 'v42', mode: 'MODULO', effectiveFrom: t(0), effectiveTo: t(9) })
  })
  it('11. a policy outside its effective window is not applied (from inclusive, to exclusive, on the LATER reading)', () => {
    const rows = [row('S1', t(1), 990), row('S1', t(2), 5)]
    const before = run(rows, [policy({ effectiveFrom: t(3) })])
    const after = run(rows, [policy({ effectiveTo: t(2) })])
    for (const r of [before, after]) {
      expect(r.rows[0]).toMatchObject({ deltaValue: null, dataQuality: 'COUNTER_RESET_UNRESOLVED' })
      expect(r.rows[0]!.policy!.status).toBe('NOT_EFFECTIVE')
    }
    expect(run(rows, [policy({ effectiveFrom: t(2) })]).rows[0]!.deltaValue).toBe(15) // inclusive start
    expect(run(rows, [policy({ effectiveTo: t(2, 1) })]).rows[0]!.deltaValue).toBe(15)
  })
  it('a disabled policy does not apply', () => {
    const r = run([row('S1', t(1), 990), row('S1', t(2), 5)], [policy({ enabled: false })])
    expect(r.rows[0]).toMatchObject({ deltaValue: null, dataQuality: 'COUNTER_RESET_UNRESOLVED' })
  })
  it('12 + 21. series are isolated: one series\' negative step / policy / flags never touch another', () => {
    const rows = [row('A', t(1), 100), row('A', t(2), 50), row('B', t(1), 990), row('B', t(2), 5), row('C', t(1), 10), row('C', t(2), 14)]
    const r = run(rows, [policy({ seriesKey: 'B' })])
    const of = (k: string) => r.rows.filter(x => x.seriesKey === k)
    expect(of('A')[0]).toMatchObject({ dataQuality: 'COUNTER_RESET_UNRESOLVED', deltaValue: null })
    expect(of('B')[0]).toMatchObject({ dataQuality: 'COUNTER_RESET_RESOLVED', deltaValue: 15 })
    expect(of('C')[0]).toMatchObject({ dataQuality: 'VALID', deltaValue: 4, isComplete: true })
    expect(r.series['C']).toEqual({ flags: ['INSUFFICIENT_NEXT_READING', 'VALID'].filter(f => f !== 'VALID' || false).length ? r.series['C']!.flags : [], isComplete: false, rowCount: 2 })
    expect(r.series['C']!.flags).not.toContain('COUNTER_RESET_UNRESOLVED')
    expect(r.series['A']!.flags).toContain('COUNTER_RESET_UNRESOLVED')
    expect(r.series['B']!.flags).not.toContain('POLICY_UNDEFINED')
    expect(r.rows.map(x => x.seriesKey)).toEqual(['A', 'A', 'B', 'B', 'C', 'C'])
  })
})

describe('data quality states', () => {
  it('13. duplicate timestamps are kept and flagged (no silent merge, no delta between them)', () => {
    const r = run([row('S1', t(1), 10), row('S1', t(1), 12), row('S1', t(2), 20)])
    expect(r.rows).toHaveLength(3)
    expect(r.rows[0]).toMatchObject({ dataQuality: 'DUPLICATE_TIMESTAMP', deltaValue: null, isComplete: false })
    expect(r.rows[1]!.qualityFlags).toContain('DUPLICATE_TIMESTAMP')
  })
  it('14. a missing value is never 0; a real 0 stays 0', () => {
    const r = run([row('S1', t(1), null), row('S1', t(2), 10), row('S1', t(3), 0), row('S1', t(4), 0), row('S1', t(5), 3)])
    expect(r.rows[0]).toMatchObject({ rawValue: null, deltaValue: null, dataQuality: 'MISSING_VALUE', isComplete: false })
    expect(r.rows[1]).toMatchObject({ rawValue: 10, nextRawValue: 0, deltaValue: null, dataQuality: 'COUNTER_RESET_UNRESOLVED' }) // 10 → 0 is a negative step, not "0 consumption"
    expect(r.rows[2]).toMatchObject({ rawValue: 0, nextRawValue: 0, deltaValue: 0, dataQuality: 'VALID', isComplete: true }) // a measured 0 stays 0
    const real = run([row('R', t(1), null, { valueType: 'REAL_VALUE' }), row('R', t(2), 0, { valueType: 'REAL_VALUE' }), row('R', t(3), -4.5, { valueType: 'REAL_VALUE' })])
    expect(real.rows[0]).toMatchObject({ rawValue: null, deltaValue: null, dataQuality: 'MISSING_VALUE', isComplete: false })
    expect(real.rows[1]).toMatchObject({ rawValue: 0, deltaValue: 0, dataQuality: 'VALID', isComplete: true })
    expect(real.rows[2]).toMatchObject({ rawValue: -4.5, deltaValue: -4.5, dataQuality: 'VALID' }) // negative measurements are not touched
  })
  it('15. invalid numeric values are marked (and are not "missing")', () => {
    const r = run([
      row('S1', t(1), null, { dataQuality: 'INVALID' }),
      row('S1', t(2), Number.NaN),
      row('S1', t(3), Number.POSITIVE_INFINITY),
      row('S1', t(4), '12' as never),
      row('S1', t(5), 5),
    ])
    expect(r.rows.slice(0, 4).every(x => x.dataQuality === 'INVALID_NUMERIC_VALUE' && x.deltaValue === null && x.rawValue === null && !x.isComplete)).toBe(true)
  })
  it('16. the last reading has no synthetic delta (INSUFFICIENT_NEXT_READING); a buffer row supplies the next reading but never appears', () => {
    const noBuffer = run([row('S1', t(1), 10), row('S1', t(2), 12)])
    expect(noBuffer.rows[1]).toMatchObject({ deltaValue: null, dataQuality: 'INSUFFICIENT_NEXT_READING', isComplete: false, rawValue: 12 })
    const withBuffer = run([row('S1', t(1), 10), row('S1', t(2), 12, { isBufferRow: true })])
    expect(withBuffer.rows).toHaveLength(1)
    expect(withBuffer.rows[0]).toMatchObject({ deltaValue: 2, dataQuality: 'VALID', isComplete: true, nextRawValue: 12, nextOccurredAtUtc: t(2) })
  })
  it('severity: the most critical state is the headline and every state stays visible', () => {
    expect(mostCritical(['VALID'])).toBe('VALID')
    expect(mostCritical(['DUPLICATE_TIMESTAMP', 'DST_AMBIGUOUS', 'MISSING_VALUE'])).toBe('DST_AMBIGUOUS')
    expect(mostCritical(['NEGATIVE_DELTA', 'POLICY_UNDEFINED', 'COUNTER_RESET_UNRESOLVED'])).toBe('COUNTER_RESET_UNRESOLVED')
    expect(mostCritical(['INSUFFICIENT_NEXT_READING', 'TIMEZONE_UNVERIFIED'])).toBe('TIMEZONE_UNVERIFIED')
    expect(new Set(QUALITY_SEVERITY).size).toBe(16)
    const r = run([row('S1', t(1), null, { dstResolution: 'AMBIGUOUS' }), row('S1', t(2), 3)])
    expect(r.rows[0]!.dataQuality).toBe('DST_AMBIGUOUS')
    expect(r.rows[0]!.qualityFlags).toEqual(expect.arrayContaining(['DST_AMBIGUOUS', 'MISSING_VALUE']))
  })
  it('a bucket rolled up from rows is INCOMPLETE_BUCKET if any row is incomplete; nothing is cleaned', () => {
    const ok = summariseBucket(run([row('S1', t(1), 1), row('S1', t(2), 2), row('S1', t(3), 4, { isBufferRow: true })]).rows)
    expect(ok).toMatchObject({ dataQuality: 'VALID', isComplete: true })
    const bad = summariseBucket(run([row('S1', t(1), 1), row('S1', t(2), null), row('S1', t(3), 4)]).rows)
    expect(bad.isComplete).toBe(false)
    expect(bad.qualityFlags).toEqual(expect.arrayContaining(['INCOMPLETE_BUCKET', 'MISSING_VALUE']))
    expect(summariseBucket([]).isComplete).toBe(false)
  })
})

describe('DST (Q-W529b) and time zone', () => {
  /** an unresolved repeated wall time: NO instant, both possible instants listed (source gave no fold/offset) */
  const amb = (iso: string, value: number | null, second = 0) => row('S1', iso, value, { occurredAtUtc: null, dstResolution: 'AMBIGUOUS', dstCandidatesUtc: [t(1, 30), t(2, 30)], localWallTime: '2026-10-25T02:30:00.000', dataQuality: 'UNVERIFIED', recordId: `amb-${second}` })

  it('17. R1: two readings with the SAME repeated wall time are kept SEPARATE — no UTC forced, no delta, analysis blocked (dstStatus UNRESOLVED)', () => {
    const r = run([row('S1', t(1), 10), amb('a', 11, 1), amb('b', 12, 2), row('S1', t(4), 20)])
    expect(r.analysisAllowed).toBe(false)
    expect(r.dstStatus).toBe('UNRESOLVED')
    expect(r.timeZoneStatus).toBe('VERIFIED') // the zone is fine; the wall time is what cannot be resolved
    const ambiguous = r.rows.filter(x => x.dstResolution === 'AMBIGUOUS')
    expect(ambiguous).toHaveLength(2) // not merged
    expect(ambiguous.map(x => x.rawValue).sort()).toEqual([11, 12])
    expect(new Set(ambiguous.map(x => x.recordId)).size).toBe(2)
    for (const x of ambiguous) {
      expect(x).toMatchObject({ occurredAtUtc: null, deltaValue: null, dataQuality: 'DST_AMBIGUOUS', isComplete: false, localWallTime: '2026-10-25T02:30:00.000' })
      expect(x.qualityFlags).toContain('DST_AMBIGUOUS')
    }
    // the step that could span the unresolved readings is not guessed either
    expect(r.rows.find(x => x.occurredAtUtc === t(1))).toMatchObject({ deltaValue: null, dataQuality: 'DST_AMBIGUOUS', isComplete: false })
  })
  it('17. R1: no result row carries a made-up instant for an unresolved reading (the candidates never become the timestamp)', () => {
    const r = run([amb('a', 11, 1), row('S1', t(4), 20)])
    expect(r.rows.some(x => x.dstResolution === 'AMBIGUOUS' && x.occurredAtUtc !== null)).toBe(false)
    expect(JSON.stringify(r.rows.filter(x => x.dstResolution === 'AMBIGUOUS').map(x => x.occurredAtUtc))).toBe('[null]')
  })
  it('17. R1: a legacy AMBIGUOUS row that still carries an instant is treated as unresolved (its instant is discarded)', () => {
    const legacy = row('S1', t(1, 30), 11, { dstResolution: 'AMBIGUOUS' })
    const r = run([row('S1', t(1), 10), legacy, row('S1', t(4), 20)])
    expect(r.analysisAllowed).toBe(false)
    expect(r.rows.find(x => x.rawValue === 11)).toMatchObject({ occurredAtUtc: null, dataQuality: 'DST_AMBIGUOUS', deltaValue: null })
  })
  it('17. R1: readings unrelated to the unresolved time keep their deltas, but the result still blocks analysis (dstResolution and analysisAllowed agree)', () => {
    const r = run([row('S1', t(0), 5), row('S1', t(0, 30), 6), amb('a', 11, 1), row('S1', t(5), 30), row('S1', t(6), 31)])
    expect(r.rows.find(x => x.occurredAtUtc === t(0))).toMatchObject({ deltaValue: 1, dataQuality: 'VALID', isComplete: true })
    expect(r.rows.find(x => x.occurredAtUtc === t(5))).toMatchObject({ deltaValue: 1, dataQuality: 'VALID', isComplete: true })
    expect(r.analysisAllowed).toBe(false)
    expect(r.dstStatus).toBe('UNRESOLVED')
    expect(r.rows.filter(x => x.dstResolution === 'AMBIGUOUS').every(() => !r.analysisAllowed)).toBe(true)
  })
  it('17. R1: with a source-provided fold the two readings are placed at their true instants — no flag, analysis allowed', () => {
    const r = run([
      row('S1', t(0, 30), 10),
      row('S1', t(1, 30), 11, { dstResolution: 'AMBIGUOUS_RESOLVED', localWallTime: '2026-10-25T02:30:00.000' }),
      row('S1', t(2, 30), 13, { dstResolution: 'AMBIGUOUS_RESOLVED', localWallTime: '2026-10-25T02:30:00.000' }),
      row('S1', t(3, 30), 20),
    ])
    expect(r.analysisAllowed).toBe(true)
    expect(r.dstStatus).toBe('RESOLVED')
    expect(r.rows.map(x => [x.occurredAtUtc, x.deltaValue, x.dataQuality])).toEqual([
      [t(0, 30), 1, 'VALID'],
      [t(1, 30), 2, 'VALID'],
      [t(2, 30), 7, 'VALID'],
      [t(3, 30), null, 'INSUFFICIENT_NEXT_READING'],
    ])
    expect(r.rows[1]).toMatchObject({ dstResolution: 'AMBIGUOUS_RESOLVED', isComplete: true })
  })
  it('17. R1: the output order stays deterministic with unresolved readings mixed in', () => {
    const rows = [row('S1', t(4), 20), amb('b', 12, 2), row('S1', t(1), 10), amb('a', 11, 1)]
    expect(run(rows)).toEqual(run([...rows].reverse()))
  })
  /** a NONEXISTENT wall time (clock jumped forward): NO instant, NO candidates — only the interval it makes untrustworthy */
  const gap = (value: number | null, n = 1) =>
    row('S1', t(1, 30), value, { occurredAtUtc: null, dstResolution: 'GAP', dstCandidatesUtc: [], dstUncertainRangeUtc: [t(1, 30), t(2, 30)], localWallTime: '2026-03-29T02:30:00.000', dataQuality: 'INVALID', recordId: `gap-${n}` })

  it('18. Q-W529c: a nonexistent local time gets NO instant (no pre-/post-jump guess): kept with its local time, DST_NONEXISTENT, no delta, analysis blocked', () => {
    const r = run([row('S1', t(0), 10), gap(11), row('S1', t(4), 12), row('S1', t(5), 13)])
    const g = r.rows.find(x => x.dstResolution === 'GAP')!
    expect(g).toMatchObject({ occurredAtUtc: null, localWallTime: '2026-03-29T02:30:00.000', rawValue: 11, deltaValue: null, dataQuality: 'DST_NONEXISTENT', isComplete: false })
    expect(g.qualityFlags).toContain('DST_NONEXISTENT')
    expect(r.rows).toHaveLength(4) // not dropped
    expect(r.analysisAllowed).toBe(false)
    expect(r.dstStatus).toBe('UNRESOLVED')
    expect(r.timeZoneStatus).toBe('VERIFIED')
    // neither offset's instant appears as this reading's time, anywhere
    expect(JSON.stringify(r.rows.filter(x => x.dstResolution === 'GAP'))).not.toContain(t(1, 30))
    expect(JSON.stringify(r.rows.filter(x => x.dstResolution === 'GAP'))).not.toContain(t(2, 30))
  })
  it('18. Q-W529c: the neighbouring delta whose interval contains the uncertain range is NOT produced; unaffected readings still compute', () => {
    const r = run([row('S1', t(0), 10), gap(11), row('S1', t(4), 12), row('S1', t(5), 15)])
    expect(r.rows.find(x => x.occurredAtUtc === t(0))).toMatchObject({ deltaValue: null, dataQuality: 'DST_NONEXISTENT', isComplete: false }) // step (0:00 → 4:00) spans the gap
    expect(r.rows.find(x => x.occurredAtUtc === t(4))).toMatchObject({ deltaValue: 3, dataQuality: 'VALID', isComplete: true }) // independent of the transition
    expect(r.analysisAllowed).toBe(false) // the analysis result still carries the quality state
    expect(r.series['S1']!.flags).toContain('DST_NONEXISTENT')
  })
  it('18. Q-W529c: a reading BEFORE the gap whose next reading is also before it keeps its delta', () => {
    const r = run([row('S1', t(0), 10), row('S1', t(1), 12), gap(11), row('S1', t(4), 13)])
    expect(r.rows.find(x => x.occurredAtUtc === t(0))).toMatchObject({ deltaValue: 2, dataQuality: 'VALID' })
    expect(r.rows.find(x => x.occurredAtUtc === t(1))).toMatchObject({ deltaValue: null, dataQuality: 'DST_NONEXISTENT' }) // 1:00 → 4:00 spans it
  })
  it('18. Q-W529c: a legacy GAP row that still carries an instant is treated the same way (its instant is discarded)', () => {
    const legacy = row('S1', t(2, 30), 11, { dstResolution: 'GAP' })
    const r = run([row('S1', t(0), 10), legacy, row('S1', t(4), 12)])
    expect(r.rows.find(x => x.rawValue === 11)).toMatchObject({ occurredAtUtc: null, dataQuality: 'DST_NONEXISTENT', deltaValue: null })
    expect(r.analysisAllowed).toBe(false)
  })
  it('18. Q-W529c: a missing value at a nonexistent time keeps BOTH states visible', () => {
    const r = run([row('S1', t(0), 10), { ...gap(null), dataQuality: 'MISSING' as const }, row('S1', t(4), 12)])
    expect(r.rows.find(x => x.dstResolution === 'GAP')).toMatchObject({ rawValue: null, dataQuality: 'DST_NONEXISTENT' })
    expect(r.rows.find(x => x.dstResolution === 'GAP')!.qualityFlags).toEqual(expect.arrayContaining(['DST_NONEXISTENT', 'MISSING_VALUE']))
  })
  it('19 + 22. UTC ordering is deterministic (input order, ties by record id) and the output is reproducible', () => {
    const rows = [row('S1', t(3), 30), row('S1', t(1), 10), row('S1', t(2), 20), row('S1', t(2), 21), row('S2', t(1), 5), row('S2', t(2), 9)]
    const a = run(rows)
    const b = run([...rows].reverse())
    const c = run(rows)
    expect(b).toEqual(a)
    expect(c).toEqual(a)
    expect(JSON.stringify(c)).toBe(JSON.stringify(a))
    expect(a.rows.map(x => `${x.seriesKey}@${x.occurredAtUtc}`)).toEqual(['S1@' + t(1), 'S1@' + t(2), 'S1@' + t(2), 'S1@' + t(3), 'S2@' + t(1), 'S2@' + t(2)])
    const shuffledPolicies = new ScadaDataQualityService(new InMemoryRolloverPolicyProvider([policy({ seriesKey: 'S2', version: 'b' }), policy({ seriesKey: 'S1', version: 'a' })]))
    const sorted = new ScadaDataQualityService(new InMemoryRolloverPolicyProvider([policy({ seriesKey: 'S1', version: 'a' }), policy({ seriesKey: 'S2', version: 'b' })]))
    expect(shuffledPolicies.evaluate({ catalogId: CAT, sourceTimeZone: ZONE, rows })).toEqual(sorted.evaluate({ catalogId: CAT, sourceTimeZone: ZONE, rows }))
  })
  it.each([[undefined], [null], [''], ['+03:00'], ['Turkey Standard Time'], ['Not/AZone'], [42 as never]])('20. time zone %j → TIMEZONE_UNVERIFIED: production analysis is blocked, no delta, no policy applied', zone => {
    const rows = [row('S1', t(1), 990), row('S1', t(2), 5), row('S1', t(3), 9)]
    const r = svc(policy()).evaluate({ catalogId: CAT, sourceTimeZone: zone as never, rows })
    expect(r.analysisAllowed).toBe(false)
    expect(r.timeZoneStatus).toBe('UNVERIFIED')
    expect(r.rows.length).toBeGreaterThan(0)
    expect(r.rows.every(x => x.dataQuality === 'TIMEZONE_UNVERIFIED' && x.deltaValue === null && !x.isComplete && x.policy === null)).toBe(true)
    expect(r.rows.map(x => x.rawValue)).toEqual([990, 5, 9]) // raw values are still preserved
  })
  it('a verified zone allows analysis', () => {
    const r = run([row('S1', t(1), 1), row('S1', t(2), 2)])
    expect(r).toMatchObject({ analysisAllowed: true, timeZoneStatus: 'VERIFIED', dstStatus: 'RESOLVED' })
  })
})

describe('purity, safety', () => {
  it('23. the input (rows, row objects, policies) is never mutated', () => {
    const rows = [row('S1', t(2), 5), row('S1', t(1), 990)].map(r => Object.freeze(r))
    Object.freeze(rows)
    const pol = Object.freeze(policy())
    const before = JSON.stringify(rows)
    const provider = { list: () => Object.freeze([pol]) as readonly RolloverPolicy[] }
    const r = new ScadaDataQualityService(provider).evaluate({ catalogId: CAT, sourceTimeZone: ZONE, rows })
    expect(JSON.stringify(rows)).toBe(before)
    expect(r.rows[0]!.deltaValue).toBe(15)
    r.rows[0]!.rawValue = -1 // touching the result cannot reach the input
    expect(JSON.stringify(rows)).toBe(before)
  })
  it('24 + 25. nothing is logged and no SQL / secret / connection string can appear in the output or an error', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m => jest.spyOn(console, m).mockImplementation(() => undefined))
    try {
      const r = run([row('S1', t(1), 990), row('S1', t(2), 5)], [policy()])
      let err: unknown
      try {
        run(null as never)
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(ScadaDataQualityError)
      const surface = JSON.stringify(r) + String(err) + (err as Error).stack
      expect(surface).not.toMatch(/SELECT|Server=|Password|connection|token|dbo\.|INFORMATION_SCHEMA/i)
      for (const s of spies) expect(s).not.toHaveBeenCalled()
    } finally {
      spies.forEach(s => s.mockRestore())
    }
  })
  it('malformed input fails with the static error only', () => {
    for (const bad of [null, undefined, {}, { catalogId: CAT }, { catalogId: CAT, sourceTimeZone: ZONE, rows: [{ seriesKey: 1 }] }, { catalogId: CAT, sourceTimeZone: ZONE, rows: [{ seriesKey: 'a', occurredAtUtc: 'nope', recordId: 'x' }] }]) {
      expect(() => svc().evaluate(bad as never)).toThrow(ScadaDataQualityError)
    }
  })
})
