import { describe, expect, it } from 'vitest'
import type { ProjectedAnalysis, ProjectedComparison } from './scada-analysis.types'
import {
  formatPercentageDelta,
  formatValue,
  getSeriesColor,
  transformAnalysisToChartData,
  transformComparisonToChartData,
} from './scada-chart-helpers'

describe('scada-chart-helpers', () => {
  describe('getSeriesColor', () => {
    it('returns a deterministic hex color for a given seriesKey', () => {
      const color1 = getSeriesColor('S1')
      const color2 = getSeriesColor('S1')
      expect(color1).toBe(color2)
      expect(color1).toMatch(/^#[0-9a-f]{6}$/i)
    })

    it('returns consistent colors across multiple invocations for different keys', () => {
      const c1 = getSeriesColor('SERIES_A')
      const c2 = getSeriesColor('SERIES_B')
      expect(c1).toBeDefined()
      expect(c2).toBeDefined()
      expect(getSeriesColor('SERIES_A')).toBe(c1)
      expect(getSeriesColor('SERIES_B')).toBe(c2)
    })
  })

  describe('formatValue', () => {
    it('formats numbers with Turkish locale and specified decimals', () => {
      expect(formatValue(1234.56)).toBe('1.234,56')
      expect(formatValue(0)).toBe('0,00')
    })

    it('returns "—" for null or undefined, NEVER 0', () => {
      expect(formatValue(null)).toBe('—')
      expect(formatValue(undefined)).toBe('—')
      expect(formatValue(NaN)).toBe('—')
    })
  })

  describe('formatPercentageDelta', () => {
    it('returns "—" when baseline is 0 or null, NEVER 0 or Infinity', () => {
      expect(formatPercentageDelta(10, 0)).toBe('—')
      expect(formatPercentageDelta(10, null)).toBe('—')
      expect(formatPercentageDelta(null, 100)).toBe('—')
    })

    it('formats valid percentage deltas correctly', () => {
      expect(formatPercentageDelta(15.5, 100)).toBe('+15,5%')
      expect(formatPercentageDelta(-10, 100)).toBe('-10,0%')
    })
  })

  describe('transformAnalysisToChartData', () => {
    it('transforms SCADA analysis response keeping null values as null (not 0)', () => {
      const mockAnalysis: ProjectedAnalysis = {
        artifactCode: 'A1',
        status: 'OK',
        code: null,
        interval: 'HOURLY',
        timezone: 'Europe/Istanbul',
        range: { startAt: '2026-01-01T00:00:00Z', endAt: '2026-01-01T02:00:00Z' },
        preset: null,
        series: [
          {
            seriesKey: 'S1',
            sourceCatalogId: 'CAT-1',
            label: 'Seri 1',
            unit: 'kWh',
            valueType: 'INDEX',
            analysisAllowed: true,
            status: 'OK',
            codes: [],
            points: [
              {
                t: '2026-01-01T00:00:00Z',
                localWallTime: '2026-01-01 03:00',
                value: 100,
                quality: 'VALID',
                qualityFlags: [],
                isComplete: true,
                classification: 'OK',
              },
              {
                t: '2026-01-01T01:00:00Z',
                localWallTime: '2026-01-01 04:00',
                value: null, // NULL must be preserved for Recharts connectNulls={false}
                quality: 'MISSING',
                qualityFlags: ['DST_AMBIGUOUS'],
                isComplete: false,
                classification: 'MISSING',
              },
            ],
            statistics: { status: 'OK', sum: 100, validCount: 1 },
            qualitySummary: { totalBuckets: 2, validBuckets: 1, invalidBuckets: 0, missingBuckets: 1, incompleteBuckets: 1, qualityStates: ['VALID', 'MISSING'] },
            virtual: null,
          },
        ],
        excluded: [],
        sources: [],
        virtualColumnFailures: [],
        pointFilter: { qualityStates: [], onlyAnalysisAllowed: false },
      }

      const { chartRows, seriesKeys, seriesMeta } = transformAnalysisToChartData(mockAnalysis)
      expect(seriesKeys).toEqual(['S1'])
      expect(seriesMeta['S1']?.label).toBe('Seri 1')
      expect(chartRows).toHaveLength(2)
      expect(chartRows[0]!['S1']).toBe(100)
      expect(chartRows[1]!['S1']).toBeNull() // preserved as null
    })
  })

  describe('transformComparisonToChartData', () => {
    it('transforms SCADA comparison response correctly', () => {
      const mockComparison: ProjectedComparison = {
        artifactCode: 'A1',
        status: 'OK',
        code: null,
        mode: 'PERIOD',
        bucketInterval: 'HOURLY',
        timezone: 'Europe/Istanbul',
        comparability: 'OK',
        rows: [
          {
            t: '2026-01-01T00:00:00Z',
            comparisonT: '2026-01-02T00:00:00Z',
            seriesLabel: 'Seri 1',
            comparisonSeriesLabel: 'Seri 1',
            sourceLabel: 'Kaynak 1',
            comparisonSourceLabel: 'Kaynak 1',
            baseline: 100,
            comparison: 120,
            absoluteDelta: 20,
            percentageDelta: 20,
            quality: 'VALID',
            status: 'OK',
            reasonCode: null,
            baselineReason: null,
            comparisonReason: null,
          },
        ],
        unmatchedSeries: [],
        summary: { totalPairs: 1, validPairs: 1, averageAbsoluteDelta: 20, maxAbsoluteDelta: 20 },
        preset: null,
        sources: [],
      }

      const { chartRows, seriesLabels, hasUnmatched } = transformComparisonToChartData(mockComparison)
      expect(seriesLabels).toEqual(['Seri 1'])
      expect(hasUnmatched).toBe(false)
      expect(chartRows).toHaveLength(1)
      expect(chartRows[0]!['baseline_Seri 1']).toBe(100)
      expect(chartRows[0]!['comparison_Seri 1']).toBe(120)
    })
  })
})
