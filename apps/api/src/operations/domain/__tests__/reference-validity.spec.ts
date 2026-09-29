import { isInstantWithinValidity, isValidityPeriodWellFormed, selectEffectiveAt } from '../reference-validity.contract'

describe('isValidityPeriodWellFormed', () => {
  it('accepts an open-ended window', () => {
    expect(isValidityPeriodWellFormed({ effectiveFrom: '2024-01-01T00:00:00.000Z', effectiveTo: null })).toBe(true)
  })

  it('accepts a closed window where effectiveFrom < effectiveTo', () => {
    expect(isValidityPeriodWellFormed({ effectiveFrom: '2024-01-01T00:00:00.000Z', effectiveTo: '2024-02-01T00:00:00.000Z' })).toBe(true)
  })

  it.each([
    ['effectiveTo before effectiveFrom', { effectiveFrom: '2024-02-01T00:00:00.000Z', effectiveTo: '2024-01-01T00:00:00.000Z' }],
    ['effectiveTo equal to effectiveFrom (zero-length window)', { effectiveFrom: '2024-01-01T00:00:00.000Z', effectiveTo: '2024-01-01T00:00:00.000Z' }],
    ['malformed effectiveFrom', { effectiveFrom: 'not-a-date', effectiveTo: null }],
    ['malformed effectiveTo', { effectiveFrom: '2024-01-01T00:00:00.000Z', effectiveTo: 'not-a-date' }],
    ['empty effectiveFrom', { effectiveFrom: '', effectiveTo: null }],
  ])('rejects %s', (_n, period) => {
    expect(isValidityPeriodWellFormed(period)).toBe(false)
  })
})

describe('isInstantWithinValidity', () => {
  const period = { effectiveFrom: '2024-01-01T00:00:00.000Z', effectiveTo: '2024-02-01T00:00:00.000Z' }
  it('true strictly inside the window', () => {
    expect(isInstantWithinValidity(period, '2024-01-15T00:00:00.000Z')).toBe(true)
  })
  it('true exactly at effectiveFrom (inclusive)', () => {
    expect(isInstantWithinValidity(period, '2024-01-01T00:00:00.000Z')).toBe(true)
  })
  it('false exactly at effectiveTo (exclusive)', () => {
    expect(isInstantWithinValidity(period, '2024-02-01T00:00:00.000Z')).toBe(false)
  })
  it('false before effectiveFrom, false after effectiveTo', () => {
    expect(isInstantWithinValidity(period, '2023-12-31T23:59:59.999Z')).toBe(false)
    expect(isInstantWithinValidity(period, '2024-02-02T00:00:00.000Z')).toBe(false)
  })
  it('false for a malformed instant or a malformed period', () => {
    expect(isInstantWithinValidity(period, 'nope')).toBe(false)
    expect(isInstantWithinValidity({ effectiveFrom: 'nope', effectiveTo: null }, '2024-01-15T00:00:00.000Z')).toBe(false)
  })
})

describe('selectEffectiveAt', () => {
  const rows = [
    { id: 'a', validity: { effectiveFrom: '2020-01-01T00:00:00.000Z', effectiveTo: '2022-01-01T00:00:00.000Z' } },
    { id: 'b', validity: { effectiveFrom: '2022-01-01T00:00:00.000Z', effectiveTo: null } },
  ]
  it('picks the row whose window contains the instant', () => {
    expect(selectEffectiveAt(rows, '2021-01-01T00:00:00.000Z')?.id).toBe('a')
    expect(selectEffectiveAt(rows, '2023-01-01T00:00:00.000Z')?.id).toBe('b')
  })
  it('returns null when no row covers the instant', () => {
    expect(selectEffectiveAt(rows, '2015-01-01T00:00:00.000Z')).toBeNull()
  })
  it('a row with a malformed period is never selected, even if its bounds would otherwise match', () => {
    const withBad = [{ id: 'bad', validity: { effectiveFrom: 'nope', effectiveTo: null } }, ...rows]
    expect(selectEffectiveAt(withBad, '2023-01-01T00:00:00.000Z')?.id).toBe('b')
  })
})
