import { aggregateHourlySeries } from '../../aggregation/hourly-aggregation'
import { correctedDelta, isPolicyValid, resolvePolicy, toAggregationRolloverPort } from '../scada-counter-rollover.service'
import { InMemoryRolloverPolicyProvider } from '../rollover-policy.port'
import type { RolloverPolicy } from '../scada-data-quality.contract'

const CAT = '11111111-1111-4111-8111-111111111111'
const pol = (over: Partial<RolloverPolicy> = {}): RolloverPolicy => ({ catalogId: CAT, seriesKey: 'S1', valueType: 'INDEX', rolloverMode: 'MODULO', rolloverValue: 1000, enabled: true, version: 1, ...over })

describe('policy validation and arithmetic', () => {
  it('a complete policy of every mode is valid; an incomplete one is not', () => {
    expect(isPolicyValid(pol())).toBe(true)
    expect(isPolicyValid(pol({ rolloverMode: 'FIXED_MAXIMUM', rolloverValue: 99999 }))).toBe(true)
    expect(isPolicyValid(pol({ rolloverMode: 'NONE', rolloverValue: undefined }))).toBe(true)
    expect(isPolicyValid(pol({ rolloverValue: undefined }))).toBe(false)
    expect(isPolicyValid(pol({ valueType: 'X' as never }))).toBe(false)
    expect(isPolicyValid(pol({ catalogId: '' }))).toBe(false)
  })
  it('the two modes are distinguishable and exact', () => {
    expect(correctedDelta(pol({ rolloverMode: 'FIXED_MAXIMUM', rolloverValue: 99999 }), 99990, 5)).toBe(14)
    expect(correctedDelta(pol({ rolloverMode: 'MODULO', rolloverValue: 100000 }), 99990, 5)).toBe(15)
    expect(correctedDelta(pol({ rolloverMode: 'NONE', rolloverValue: null }), 10, 5)).toBeNull()
  })
  it('resolution is exact-key, effective-window based, fail-closed on ambiguity', () => {
    expect(resolvePolicy([], 0).kind).toBe('UNDEFINED')
    expect(resolvePolicy([pol()], 0).kind).toBe('ACTIVE')
    expect(resolvePolicy([pol({ effectiveTo: '2026-01-01T00:00:00Z' })], Date.parse('2026-06-01T00:00:00Z')).trace.status).toBe('NOT_EFFECTIVE')
    expect(resolvePolicy([pol(), pol({ version: 2 })], 0).kind).toBe('INVALID')
    const sequential = [pol({ effectiveTo: '2026-03-01T00:00:00Z', version: 1 }), pol({ effectiveFrom: '2026-03-01T00:00:00Z', version: 2, rolloverValue: 500 })]
    expect(resolvePolicy(sequential, Date.parse('2026-02-01T00:00:00Z')).trace.version).toBe(1)
    expect(resolvePolicy(sequential, Date.parse('2026-03-01T00:00:00Z')).trace.version).toBe(2)
  })
})

describe('adapter for the TASK-027.66 aggregation engine', () => {
  const rows = [
    { occurredAtUtc: '2026-01-15T01:00:00.000Z', recordId: 'a', seriesKey: 'S1', rawValue: 990, valueType: 'INDEX' as const, sourceCatalogId: CAT, dataQuality: 'OK' as const },
    { occurredAtUtc: '2026-01-15T02:00:00.000Z', recordId: 'b', seriesKey: 'S1', rawValue: 5, valueType: 'INDEX' as const, sourceCatalogId: CAT, dataQuality: 'OK' as const },
  ]
  const asOf = '2026-01-15T02:00:00.000Z'
  it('the engine resolves a roll-over only through an explicit policy', () => {
    const withPolicy = aggregateHourlySeries(rows, { seriesKey: 'S1', valueType: 'INDEX' }, toAggregationRolloverPort(new InMemoryRolloverPolicyProvider([pol()]), asOf))
    expect(withPolicy[0]).toMatchObject({ deltaValue: 15, dataQuality: 'COUNTER_RESET_RESOLVED', isComplete: true, rawValue: 990 })
    const without = aggregateHourlySeries(rows, { seriesKey: 'S1', valueType: 'INDEX' }, toAggregationRolloverPort(new InMemoryRolloverPolicyProvider([]), asOf))
    expect(without[0]).toMatchObject({ deltaValue: null, dataQuality: 'COUNTER_RESET_UNRESOLVED', isComplete: false })
    const invalid = aggregateHourlySeries(rows, { seriesKey: 'S1', valueType: 'INDEX' }, toAggregationRolloverPort(new InMemoryRolloverPolicyProvider([pol({ rolloverValue: null })]), asOf))
    expect(invalid[0]).toMatchObject({ deltaValue: null, dataQuality: 'COUNTER_RESET_UNRESOLVED' })
    const otherSeries = aggregateHourlySeries(rows, { seriesKey: 'S1', valueType: 'INDEX' }, toAggregationRolloverPort(new InMemoryRolloverPolicyProvider([pol({ seriesKey: 'S2' })]), asOf))
    expect(otherSeries[0]!.deltaValue).toBeNull()
  })
})
