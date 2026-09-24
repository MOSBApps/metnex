import { describe, expect, it } from 'vitest'
import { type AnalysisRow, buildDailyTotals, buildStatusBreakdown } from './chart-data'

function row(overrides: Partial<AnalysisRow>): AnalysisRow {
  return {
    no: 'DEMO-0001',
    label: 'Test',
    occurredAt: '2026-01-01T10:00:00.000Z',
    status: 'COMPLETED',
    quantity: 1,
    unitPrice: 10,
    amount: 10,
    ...overrides,
  }
}

describe('buildDailyTotals', () => {
  it('sums amounts per calendar day and sorts oldest to newest', () => {
    const rows = [
      row({ occurredAt: '2026-01-02T09:00:00.000Z', amount: 5 }),
      row({ occurredAt: '2026-01-01T23:00:00.000Z', amount: 3 }),
      row({ occurredAt: '2026-01-01T01:00:00.000Z', amount: 2 }),
    ]
    expect(buildDailyTotals(rows)).toEqual([
      { date: '2026-01-01', amount: 5 },
      { date: '2026-01-02', amount: 5 },
    ])
  })

  it('returns an empty array for no rows', () => {
    expect(buildDailyTotals([])).toEqual([])
  })

  it('rounds sums to 2 decimals', () => {
    const rows = [row({ amount: 0.1 }), row({ amount: 0.2 })]
    expect(buildDailyTotals(rows)).toEqual([{ date: '2026-01-01', amount: 0.3 }])
  })
})

describe('buildStatusBreakdown', () => {
  it('counts rows per status in a fixed order regardless of input order', () => {
    const rows = [row({ status: 'FAILED' }), row({ status: 'COMPLETED' }), row({ status: 'COMPLETED' }), row({ status: 'PENDING' })]
    expect(buildStatusBreakdown(rows)).toEqual([
      { status: 'COMPLETED', count: 2 },
      { status: 'PENDING', count: 1 },
      { status: 'FAILED', count: 1 },
    ])
  })

  it('omits statuses with zero rows', () => {
    const rows = [row({ status: 'COMPLETED' })]
    expect(buildStatusBreakdown(rows)).toEqual([{ status: 'COMPLETED', count: 1 }])
  })

  it('returns an empty array for no rows', () => {
    expect(buildStatusBreakdown([])).toEqual([])
  })

  it('appends unknown statuses after the fixed order (forward-compatible, does not throw)', () => {
    const rows = [row({ status: 'COMPLETED' }), row({ status: 'ARCHIVED' })]
    expect(buildStatusBreakdown(rows)).toEqual([
      { status: 'COMPLETED', count: 1 },
      { status: 'ARCHIVED', count: 1 },
    ])
  })
})
