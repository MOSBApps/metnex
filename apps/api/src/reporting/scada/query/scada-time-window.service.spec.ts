import { buildWindow, isValidBuffer, localToUtc, parseSourceDate, parseSourceDateTime, parseSourceTime, zoneOffsetMs } from './scada-time-window.service'

const H = 3_600_000
const at = (y: number, mo: number, d: number, h: number, mi = 0, s = 0) => ({ year: y, month: mo, day: d, hour: h, minute: mi, second: s })

describe('zone offsets and local → UTC (Q-W512, deterministic DST)', () => {
  it('a fixed-offset zone (no DST) is a plain shift', () => {
    expect(localToUtc(at(2026, 7, 1, 12), 'Europe/Istanbul')).toEqual({ instant: new Date('2026-07-01T09:00:00Z'), dst: 'NORMAL' })
    expect(localToUtc(at(2026, 1, 1, 0), 'UTC')).toEqual({ instant: new Date('2026-01-01T00:00:00Z'), dst: 'NORMAL' })
  })
  it('summer / winter offsets of a DST zone (Europe/Berlin)', () => {
    expect(zoneOffsetMs(Date.parse('2026-07-01T00:00:00Z'), 'Europe/Berlin')).toBe(2 * H)
    expect(zoneOffsetMs(Date.parse('2026-01-01T00:00:00Z'), 'Europe/Berlin')).toBe(1 * H)
    expect(localToUtc(at(2026, 7, 1, 12), 'Europe/Berlin').instant.toISOString()).toBe('2026-07-01T10:00:00.000Z')
    expect(localToUtc(at(2026, 1, 1, 12), 'Europe/Berlin').instant.toISOString()).toBe('2026-01-01T11:00:00.000Z')
  })
  it('spring-forward gap (Berlin 2026-03-29 02:30 does not exist): flagged GAP, shifted with the pre-jump offset', () => {
    const r = localToUtc(at(2026, 3, 29, 2, 30), 'Europe/Berlin')
    expect(r.dst).toBe('GAP')
    expect(r.instant.toISOString()).toBe('2026-03-29T01:30:00.000Z') // 02:30 at +01:00
  })
  it('the hours around the gap are normal and strictly increasing', () => {
    const a = localToUtc(at(2026, 3, 29, 1, 59, 59), 'Europe/Berlin')
    const b = localToUtc(at(2026, 3, 29, 3, 0, 0), 'Europe/Berlin')
    expect([a.dst, b.dst]).toEqual(['NORMAL', 'NORMAL'])
    expect(a.instant.toISOString()).toBe('2026-03-29T00:59:59.000Z')
    expect(b.instant.toISOString()).toBe('2026-03-29T01:00:00.000Z')
  })
  it('fall-back overlap (Berlin 2026-10-25 02:30 occurs twice): flagged AMBIGUOUS, FIRST occurrence chosen', () => {
    const r = localToUtc(at(2026, 10, 25, 2, 30), 'Europe/Berlin')
    expect(r.dst).toBe('AMBIGUOUS')
    expect(r.instant.toISOString()).toBe('2026-10-25T00:30:00.000Z') // 02:30 at +02:00 (the earlier one)
  })
  it('America/New_York transitions behave the same way', () => {
    expect(localToUtc(at(2026, 3, 8, 2, 30), 'America/New_York')).toMatchObject({ dst: 'GAP' })
    expect(localToUtc(at(2026, 11, 1, 1, 30), 'America/New_York')).toEqual({ instant: new Date('2026-11-01T05:30:00Z'), dst: 'AMBIGUOUS' })
    expect(localToUtc(at(2026, 6, 1, 12), 'America/New_York').instant.toISOString()).toBe('2026-06-01T16:00:00.000Z')
  })
  it('is deterministic: the same input always gives the same instant', () => {
    const results = Array.from({ length: 5 }, () => localToUtc(at(2026, 10, 25, 2, 30), 'Europe/Berlin').instant.getTime())
    expect(new Set(results).size).toBe(1)
  })
  it.each(['+03:00', 'Not/AZone', '', 'Turkey Standard Time'])('an invalid zone %j is rejected (never assumed UTC)', zone => {
    expect(() => localToUtc(at(2026, 1, 1, 0), zone)).toThrow()
  })
})

describe('source value parsing (naive values are never assumed to carry a zone)', () => {
  it('dates: ISO, dotted (D.M.YYYY), Date UTC fields; impossible dates rejected', () => {
    expect(parseSourceDate('2026-01-15')).toEqual({ year: 2026, month: 1, day: 15 })
    expect(parseSourceDate('5.11.2025')).toEqual({ year: 2025, month: 11, day: 5 })
    expect(parseSourceDate(new Date('2026-01-15T00:00:00Z'))).toEqual({ year: 2026, month: 1, day: 15 })
    for (const bad of ['2026-02-30', '31.04.2026', 'x', '', 5, null, undefined, new Date('nope')]) expect(parseSourceDate(bad)).toBeNull()
  })
  it('times: HH:mm[:ss[.fff]] and Date UTC fields; out-of-range rejected', () => {
    expect(parseSourceTime('06:30')).toEqual({ hour: 6, minute: 30, second: 0, millisecond: 0 })
    expect(parseSourceTime('23:59:59.5')).toEqual({ hour: 23, minute: 59, second: 59, millisecond: 500 })
    expect(parseSourceTime(new Date('1970-01-01T07:08:09Z'))).toMatchObject({ hour: 7, minute: 8, second: 9 })
    for (const bad of ['24:00', '12:60', '12:00:60', 'x', 12, null]) expect(parseSourceTime(bad)).toBeNull()
  })
  it('date-times: naive strings and Date UTC fields; a zone suffix is not accepted as naive', () => {
    expect(parseSourceDateTime('2026-01-15 06:30:00')).toMatchObject({ year: 2026, month: 1, day: 15, hour: 6, minute: 30 })
    expect(parseSourceDateTime('2026-01-15T06:30:00')).toMatchObject({ hour: 6 })
    expect(parseSourceDateTime('2026-01-15T06:30:00Z')).toBeNull()
    expect(parseSourceDateTime('nope')).toBeNull()
  })
})

describe('query window and buffer configuration (Q-W521 has no default)', () => {
  it('window is [start, end) + [end, end + buffer)', () => {
    const w = buildWindow(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T03:00:00Z'), H)
    expect(w.bufferEndAt.toISOString()).toBe('2026-01-01T04:00:00.000Z')
  })
  it('never mutates its inputs', () => {
    const s = new Date('2026-01-01T00:00:00Z')
    const e = new Date('2026-01-01T03:00:00Z')
    const w = buildWindow(s, e, H)
    w.startAt.setFullYear(1999)
    expect(s.getFullYear()).toBe(2026)
  })
  it.each([undefined, null, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '3600000', {}])('buffer %p is not a valid configuration', v => expect(isValidBuffer(v)).toBe(false))
  it.each([0, 1, H])('buffer %p is a valid configuration', v => expect(isValidBuffer(v)).toBe(true))
})
