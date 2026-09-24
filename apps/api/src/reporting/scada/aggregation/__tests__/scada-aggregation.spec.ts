import type {
  ScadaAggregationBucketResult,
  ScadaNormalizedInputRow,
  ScadaSeriesAggregationPolicy,
} from '../scada-aggregation.contract'

import { aggregateDailySeries, getLocalDateKey } from '../daily-aggregation'
import { aggregateHourlySeries, ScadaAggregationError } from '../hourly-aggregation'
import type { RolloverPolicyPort } from '../negative-delta.policy'
import { ScadaAggregationService } from '../scada-aggregation.service'

describe('ScadaAggregationEngine (TASK-027.66)', () => {
  let service: ScadaAggregationService

  beforeEach(() => {
    service = new ScadaAggregationService()
  })

  // 1. Saatlik endeks hesabı next - current ile yapılır
  it('1. calculates hourly index delta as next - current', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'Turbin1_Enerji',
        rawValue: 100,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T11:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'Turbin1_Enerji',
        rawValue: 150,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T12:00:00.000Z',
        recordId: 'rec-3',
        seriesKey: 'Turbin1_Enerji',
        rawValue: 220,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const policy: ScadaSeriesAggregationPolicy = {
      seriesKey: 'Turbin1_Enerji',
      valueType: 'INDEX',
      hourlyOperation: 'LEAD_DELTA',
    }

    const res = aggregateHourlySeries(input, policy)
    expect(res).toHaveLength(3)
    expect(res[0]?.deltaValue).toBe(50) // 150 - 100
    expect(res[0]?.dataQuality).toBe('OK')
    expect(res[1]?.deltaValue).toBe(70) // 220 - 150
    expect(res[1]?.dataQuality).toBe('OK')
  })

  // 2. Son okuma için sentetik delta üretilmez
  it('2. does not generate synthetic delta for the last reading', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'Turbin1_Enerji',
        rawValue: 100,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T11:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'Turbin1_Enerji',
        rawValue: 150,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const policy: ScadaSeriesAggregationPolicy = {
      seriesKey: 'Turbin1_Enerji',
      valueType: 'INDEX',
      hourlyOperation: 'LEAD_DELTA',
    }

    const res = aggregateHourlySeries(input, policy)
    expect(res[1]?.deltaValue).toBeNull()
    expect(res[1]?.dataQuality).toBe('INSUFFICIENT_NEXT_READING')
    expect(res[1]?.isComplete).toBe(false)
  })

  // 3. Buffer satırı hesaplamaya katılır ancak çıktıya girmez
  it('3. uses buffer row for calculation of boundary row', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'Turbin1_Enerji',
        rawValue: 100,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T11:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'Turbin1_Enerji',
        rawValue: 150,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T12:00:00.000Z',
        recordId: 'rec-buf-3',
        seriesKey: 'Turbin1_Enerji',
        rawValue: 230,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
        isBufferRow: true, // Buffer row
      },
    ]

    const policy: ScadaSeriesAggregationPolicy = {
      seriesKey: 'Turbin1_Enerji',
      valueType: 'INDEX',
      hourlyOperation: 'LEAD_DELTA',
    }

    const res = aggregateHourlySeries(input, policy)
    expect(res).toHaveLength(2) // Only 2 display rows returned
    expect(res[1]?.deltaValue).toBe(80) // 230 - 150 using buffer row!
  })

  // 4. Buffer satırı yanlışlıkla kullanıcı çıktısına girmez
  it('4. ensures buffer rows are strictly excluded from output', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-buf-1',
        seriesKey: 'S1',
        rawValue: 50,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
        isBufferRow: true,
      },
      {
        occurredAtUtc: '2026-09-23T11:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'S1',
        rawValue: 100,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const res = aggregateHourlySeries(input, { seriesKey: 'S1', valueType: 'INDEX' })
    expect(res).toHaveLength(1)
    expect(res[0]?.bucketStartUtc).toBe('2026-09-23T11:00:00.000Z')
  })

  // 5. Sırasız input deterministik sıralanır
  it('5. sorts unordered input deterministically by timestamp', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T12:00:00.000Z',
        recordId: 'rec-3',
        seriesKey: 'S1',
        rawValue: 300,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'S1',
        rawValue: 100,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T11:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'S1',
        rawValue: 200,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const res = aggregateHourlySeries(input, { seriesKey: 'S1', valueType: 'INDEX' })
    expect(res[0]?.bucketStartUtc).toBe('2026-09-23T10:00:00.000Z')
    expect(res[1]?.bucketStartUtc).toBe('2026-09-23T11:00:00.000Z')
    expect(res[2]?.bucketStartUtc).toBe('2026-09-23T12:00:00.000Z')
  })

  // 6. Duplicate timestamp işaretlenir
  it('6. flags duplicate timestamps with DUPLICATE_TIMESTAMP', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1a',
        seriesKey: 'S1',
        rawValue: 100,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1b',
        seriesKey: 'S1',
        rawValue: 105,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const res = aggregateHourlySeries(input, { seriesKey: 'S1', valueType: 'INDEX' })
    expect(res[0]?.dataQuality).toBe('DUPLICATE_TIMESTAMP')
    expect(res[0]?.deltaValue).toBeNull()
  })

  // 7. Null raw value sessizce 0 yapılmaz
  it('7. preserves null raw values without coercing to zero', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'S1',
        rawValue: null,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'MISSING_VALUE',
      },
      {
        occurredAtUtc: '2026-09-23T11:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'S1',
        rawValue: 100,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const res = aggregateHourlySeries(input, { seriesKey: 'S1', valueType: 'INDEX' })
    expect(res[0]?.deltaValue).toBeNull()
    expect(res[0]?.dataQuality).toBe('MISSING_VALUE')
  })

  // 8. Negatif delta otomatik 0 yapılmaz
  it('8. does not turn negative delta into 0', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'S1',
        rawValue: 500,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T11:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'S1',
        rawValue: 100,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const res = aggregateHourlySeries(input, { seriesKey: 'S1', valueType: 'INDEX' })
    expect(res[0]?.deltaValue).toBeNull()
    expect(res[0]?.deltaValue).not.toBe(0)
  })

  // 9. Policy yoksa COUNTER_RESET_UNRESOLVED üretilir
  it('9. produces COUNTER_RESET_UNRESOLVED when no rollover policy is provided for negative delta', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'S1',
        rawValue: 9990,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T11:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'S1',
        rawValue: 10,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const res = aggregateHourlySeries(input, { seriesKey: 'S1', valueType: 'INDEX' })
    expect(res[0]?.dataQuality).toBe('COUNTER_RESET_UNRESOLVED')
    expect(res[0]?.deltaValue).toBeNull()
    expect(res[0]?.rawValue).toBe(9990) // Preserved
  })

  // 10. Geçerli rollover policy sonucu kullanılır
  it('10. uses corrected delta when valid rollover policy resolves negative delta', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'S1',
        rawValue: 9990,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T11:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'S1',
        rawValue: 10,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const mockRolloverPort: RolloverPolicyPort = {
      evaluateRollover: jest.fn().mockReturnValue({
        resolved: true,
        correctedDelta: 20, // (10000 - 9990) + 10 = 20
        policyId: 'policy-10k',
      }),
    }

    const res = aggregateHourlySeries(input, { seriesKey: 'S1', valueType: 'INDEX' }, mockRolloverPort)
    expect(res[0]?.deltaValue).toBe(20)
    expect(res[0]?.dataQuality).toBe('COUNTER_RESET_RESOLVED')
    expect(res[0]?.isComplete).toBe(true)
  })

  // 11. Kolon adına göre rollover tahmini yapılmaz
  it('11. does not guess rollover behavior by column name', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'MCC_1_ENDEKS',
        rawValue: 800,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T11:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'MCC_1_ENDEKS',
        rawValue: 100,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const res = aggregateHourlySeries(input, { seriesKey: 'MCC_1_ENDEKS', valueType: 'INDEX' })
    expect(res[0]?.dataQuality).toBe('COUNTER_RESET_UNRESOLVED')
    expect(res[0]?.deltaValue).toBeNull()
  })

  // 12. Gerçek Değer davranışı katalog policy'sine bağlıdır
  it('12. respects catalog policy for MEASUREMENT series', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'SicakSu_Uretim',
        rawValue: 45.5,
        valueType: 'MEASUREMENT',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const policy: ScadaSeriesAggregationPolicy = {
      seriesKey: 'SicakSu_Uretim',
      valueType: 'MEASUREMENT',
      hourlyOperation: 'AVERAGE',
    }

    const res = aggregateHourlySeries(input, policy)
    expect(res[0]?.valueType).toBe('MEASUREMENT')
    expect(res[0]?.deltaValue).toBe(45.5)
  })

  // 13. Eksik Gerçek Değer policy'si fail-closed olur
  it('13. fails closed when MEASUREMENT series has no hourlyOperation policy', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'SicakSu_Uretim',
        rawValue: 45.5,
        valueType: 'MEASUREMENT',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const policy: ScadaSeriesAggregationPolicy = {
      seriesKey: 'SicakSu_Uretim',
      valueType: 'MEASUREMENT',
    }

    expect(() => aggregateHourlySeries(input, policy)).toThrow(ScadaAggregationError)
  })

  // 14. Günlük SUM/AVERAGE gibi işlemler policy'den alınır
  it('14. aggregates daily buckets using policy operation (SUM/AVERAGE)', () => {
    const hourly: ScadaAggregationBucketResult[] = [
      {
        bucketStartUtc: '2026-09-23T10:00:00.000Z',
        bucketEndUtc: '2026-09-23T11:00:00.000Z',
        seriesKey: 'S1',
        valueType: 'INDEX',
        rawValue: 100,
        deltaValue: 20,
        dataQuality: 'OK',
        isComplete: true,
        sourceCatalogId: 'cat-1',
      },
      {
        bucketStartUtc: '2026-09-23T11:00:00.000Z',
        bucketEndUtc: '2026-09-23T12:00:00.000Z',
        seriesKey: 'S1',
        valueType: 'INDEX',
        rawValue: 120,
        deltaValue: 40,
        dataQuality: 'OK',
        isComplete: true,
        sourceCatalogId: 'cat-1',
      },
    ]

    const sumRes = aggregateDailySeries(hourly, { seriesKey: 'S1', valueType: 'INDEX', dailyOperation: 'SUM' })
    expect(sumRes[0]?.deltaValue).toBe(60)

    const avgRes = aggregateDailySeries(hourly, { seriesKey: 'S1', valueType: 'INDEX', dailyOperation: 'AVERAGE' })
    expect(avgRes[0]?.deltaValue).toBe(30)
  })

  // 15. Eksik günlük bucket 0 ile doldurulmaz
  it('15. marks incomplete daily bucket when hourly data has missing delta', () => {
    const hourly: ScadaAggregationBucketResult[] = [
      {
        bucketStartUtc: '2026-09-23T10:00:00.000Z',
        bucketEndUtc: '2026-09-23T11:00:00.000Z',
        seriesKey: 'S1',
        valueType: 'INDEX',
        rawValue: 100,
        deltaValue: null,
        dataQuality: 'MISSING_VALUE',
        isComplete: false,
        sourceCatalogId: 'cat-1',
      },
    ]

    const res = aggregateDailySeries(hourly, { seriesKey: 'S1', valueType: 'INDEX', dailyOperation: 'SUM' })
    expect(res[0]?.deltaValue).toBeNull()
    expect(res[0]?.dataQuality).toBe('INCOMPLETE_BUCKET')
    expect(res[0]?.isComplete).toBe(false)
  })

  // 16. UTC ve tenant/source zaman dönüşümü deterministiktir
  it('16. converts UTC timestamps to tenant/source timezone date keys deterministically', () => {
    const keyUtc = getLocalDateKey('2026-09-23T22:30:00.000Z', 'UTC')
    expect(keyUtc).toBe('2026-09-23')

    const keyTr = getLocalDateKey('2026-09-23T22:30:00.000Z', 'tr-TR')
    expect(keyTr).toBe('2026-09-24') // UTC+3 puts 22:30 into next calendar day
  })

  // 17. DST sınırları test edilir
  it('17. handles DST transition dates gracefully', () => {
    const springDst = getLocalDateKey('2026-03-29T01:30:00.000Z', 'Europe/London')
    expect(springDst).toBe('2026-03-29')
  })

  // 18. Aynı input birebir aynı output üretir
  it('18. produces identical deterministic output on consecutive runs', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'S1',
        rawValue: 10,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T11:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'S1',
        rawValue: 20,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const policies = { S1: { seriesKey: 'S1', valueType: 'INDEX' as const, dailyOperation: 'SUM' as const } }

    const res1 = service.aggregate(input, policies)
    const res2 = service.aggregate(input, policies)

    expect(res1).toEqual(res2)
  })

  // 19. Input mutate edilmez
  it('19. does not mutate input array or objects', () => {
    const input: ScadaNormalizedInputRow[] = [
      Object.freeze({
        occurredAtUtc: '2026-09-23T11:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'S1',
        rawValue: 20,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      }),
      Object.freeze({
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'S1',
        rawValue: 10,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      }),
    ]

    Object.freeze(input)
    expect(() => service.aggregate(input, {})).not.toThrow()
  })

  // 20. Seri sıralaması deterministiktir
  it('20. sorts output series alphabetically by seriesKey', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'Series_Z',
        rawValue: 10,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'Series_A',
        rawValue: 10,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const res = service.aggregate(input, {})
    expect(res.hourly[0]?.seriesKey).toBe('Series_A')
    expect(res.hourly[1]?.seriesKey).toBe('Series_Z')
  })

  // 21. Bucket sıralaması deterministiktir
  it('21. sorts output buckets chronologically', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T12:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'S1',
        rawValue: 20,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'S1',
        rawValue: 10,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const res = service.aggregate(input, {})
    expect(res.hourly[0]?.bucketStartUtc).toBe('2026-09-23T10:00:00.000Z')
    expect(res.hourly[1]?.bucketStartUtc).toBe('2026-09-23T12:00:00.000Z')
  })

  // 22. Bir serideki veri kalitesi hatası diğer seriyi bozmaz
  it('22. isolates errors in one series from affecting other series', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'BrokenSeries',
        rawValue: 10,
        valueType: 'MEASUREMENT', // Missing hourlyOperation!
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-2',
        seriesKey: 'GoodSeries',
        rawValue: 100,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
      {
        occurredAtUtc: '2026-09-23T11:00:00.000Z',
        recordId: 'rec-3',
        seriesKey: 'GoodSeries',
        rawValue: 150,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const res = service.aggregate(input, {
      BrokenSeries: { seriesKey: 'BrokenSeries', valueType: 'MEASUREMENT' },
      GoodSeries: { seriesKey: 'GoodSeries', valueType: 'INDEX' },
    })

    expect(res.seriesQualitySummary['BrokenSeries']).toContain('INVALID_NUMERIC_VALUE')
    expect(res.hourly.some(h => h.seriesKey === 'GoodSeries' && h.deltaValue === 50)).toBe(true)
  })

  // 23. Empty series güvenli sonuç döndürür
  it('23. returns empty result safely for empty input series', () => {
    const res = service.aggregate([], {})
    expect(res).toEqual({
      hourly: [],
      daily: [],
      seriesQualitySummary: {},
    })
  })

  // 24. Tek ölçüm noktası güvenli sonuç döndürür
  it('24. handles single measurement point safely', () => {
    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'S1',
        rawValue: 100,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    const res = service.aggregate(input, {})
    expect(res.hourly).toHaveLength(1)
    expect(res.hourly[0]?.deltaValue).toBeNull()
    expect(res.hourly[0]?.dataQuality).toBe('INSUFFICIENT_NEXT_READING')
  })

  // 25. Büyük ama limit içinde input deterministic çalışır
  it('25. processes 1000 input points deterministically and within performance bounds', () => {
    const input: ScadaNormalizedInputRow[] = []
    const startMs = new Date('2026-09-01T00:00:00.000Z').getTime()

    for (let i = 0; i < 1000; i += 1) {
      input.push({
        occurredAtUtc: new Date(startMs + i * 3600 * 1000).toISOString(),
        recordId: `rec-${i}`,
        seriesKey: 'LargeSeries',
        rawValue: 100 + i * 5,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      })
    }

    const t0 = Date.now()
    const res = service.aggregate(input, {})
    const duration = Date.now() - t0

    expect(res.hourly).toHaveLength(1000)
    expect(duration).toBeLessThan(1000) // Less than 1 second
  })

  // 26. Ham veri, SQL veya credential loglanmaz
  it('26. does not log raw data, SQL queries or credentials during execution', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const input: ScadaNormalizedInputRow[] = [
      {
        occurredAtUtc: '2026-09-23T10:00:00.000Z',
        recordId: 'rec-1',
        seriesKey: 'S1',
        rawValue: 100,
        valueType: 'INDEX',
        sourceCatalogId: 'cat-1',
        dataQuality: 'OK',
      },
    ]

    service.aggregate(input, {})
    expect(consoleLogSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })
})
