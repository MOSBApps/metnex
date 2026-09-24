import { ambiguousCandidates, buildSourceWindow, localDateString, localDateTimeString, localToUtc, gapUncertainRange, localToUtcWithFold } from './scada-source-time'

describe('source-local query window (Q-W527): loss-free, driver-agnostic, zone from the catalog', () => {
  it('local calendar day of an instant differs from the UTC day near midnight', () => {
    expect(localDateString(new Date('2026-01-14T21:00:00Z'), 'Europe/Istanbul')).toBe('2026-01-15')
    expect(localDateString(new Date('2026-01-14T21:00:00Z'), 'UTC')).toBe('2026-01-14')
    expect(localDateString(new Date('2026-01-15T02:59:59Z'), 'America/New_York')).toBe('2026-01-14')
    expect(localDateString(new Date('2026-12-31T22:00:00Z'), 'Europe/Istanbul', 1)).toBe('2027-01-02')
  })
  it('naive date-time strings carry no zone suffix and are millisecond exact', () => {
    expect(localDateTimeString(new Date('2026-01-15T00:00:00.007Z'), 'Europe/Istanbul')).toBe('2026-01-15T03:00:00.007')
    expect(localDateTimeString(new Date('2026-07-01T12:00:00Z'), 'Europe/Berlin')).toBe('2026-07-01T14:00:00.000')
  })
  it('DATE column: whole local days, upper bound = the day AFTER the last instant\'s local day (a superset, trimmed later)', () => {
    expect(buildSourceWindow(new Date('2026-01-14T21:00:00Z'), new Date('2026-01-14T22:45:00Z'), 'Europe/Istanbul', 'DATE')).toEqual({ kind: 'DATE', from: '2026-01-15', to: '2026-01-16' })
    expect(buildSourceWindow(new Date('2026-03-28T23:30:00Z'), new Date('2026-03-29T01:30:00Z'), 'Europe/Berlin', 'DATE')).toEqual({ kind: 'DATE', from: '2026-03-29', to: '2026-03-30' })
  })
  it('DATETIME column: exact naive local bounds', () => {
    expect(buildSourceWindow(new Date('2026-01-15T00:00:00Z'), new Date('2026-01-15T03:00:00Z'), 'Europe/Istanbul', 'DATETIME')).toEqual({ kind: 'DATETIME2', from: '2026-01-15T03:00:00.000', to: '2026-01-15T06:00:00.000' })
  })
  it('every instant of the UTC window has a local day inside the DATE window (no loss, any zone, DST days included)', () => {
    for (const zone of ['Europe/Istanbul', 'Europe/Berlin', 'America/New_York', 'Asia/Kolkata', 'Pacific/Auckland', 'UTC']) {
      for (const day of ['2026-03-08', '2026-03-29', '2026-10-25', '2026-11-01', '2026-06-15']) {
        const from = new Date(`${day}T00:00:00Z`)
        const to = new Date(from.getTime() + 20 * 3_600_000)
        const w = buildSourceWindow(from, to, zone, 'DATE')
        for (let ms = from.getTime(); ms < to.getTime(); ms += 15 * 60_000) {
          const local = localDateString(new Date(ms), zone)
          expect(local >= w.from && local < w.to).toBe(true)
        }
      }
    }
  })
  it('a rejected zone never produces a window (no UTC fallback)', () => {
    expect(() => buildSourceWindow(new Date(0), new Date(1), '+03:00', 'DATE')).toThrow()
  })
  it('round trip: a local wall time inside the DATETIME window converts back to an instant inside the UTC window', () => {
    const from = new Date('2026-10-24T22:30:00Z')
    const to = new Date('2026-10-25T02:30:00Z')
    const w = buildSourceWindow(from, to, 'Europe/Berlin', 'DATETIME')
    expect([w.from, w.to]).toEqual(['2026-10-25T00:30:00.000', '2026-10-25T03:30:00.000'])
    const back = localToUtc({ year: 2026, month: 10, day: 25, hour: 0, minute: 30, second: 0 }, 'Europe/Berlin').instant
    expect(back.getTime()).toBe(from.getTime())
  })
})

describe('repeated wall times: candidates and source-provided fold (TASK-027.67-R1)', () => {
  const p = { year: 2026, month: 10, day: 25, hour: 2, minute: 30, second: 0 }
  it('a repeated wall time has exactly two candidates, first pass then second pass', () => {
    const c = ambiguousCandidates(p, 'Europe/Berlin')!
    expect(c.map(d => d.toISOString())).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z'])
    const ny = ambiguousCandidates({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 }, 'America/New_York')!
    expect(ny.map(d => d.toISOString())).toEqual(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z'])
  })
  it('a normal, a nonexistent and a fixed-zone wall time have no candidates', () => {
    expect(ambiguousCandidates({ ...p, day: 24 }, 'Europe/Berlin')).toBeNull()
    expect(ambiguousCandidates({ year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 0 }, 'Europe/Berlin')).toBeNull()
    expect(ambiguousCandidates(p, 'Europe/Istanbul')).toBeNull()
  })
  it('only an explicit fold picks a pass; nothing is picked without one', () => {
    expect(localToUtcWithFold(p, 'Europe/Berlin', 0)!.toISOString()).toBe('2026-10-25T00:30:00.000Z')
    expect(localToUtcWithFold(p, 'Europe/Berlin', 1)!.toISOString()).toBe('2026-10-25T01:30:00.000Z')
    expect(localToUtcWithFold({ ...p, day: 24 }, 'Europe/Berlin', 1)).toBeNull()
  })
  it('an invalid zone is rejected', () => {
    expect(() => ambiguousCandidates(p, '+01:00')).toThrow()
  })
})

describe('nonexistent wall times have no instant (Q-W529c)', () => {
  const p = { year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 0 }
  it('the uncertainty range spans the pre-/post-jump readings and is NOT an instant of the reading', () => {
    const r = gapUncertainRange(p, 'Europe/Berlin')!
    expect(r.map(d => d.toISOString())).toEqual(['2026-03-29T00:30:00.000Z', '2026-03-29T01:30:00.000Z'])
    const ny = gapUncertainRange({ year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 }, 'America/New_York')!
    expect(ny.map(d => d.toISOString())).toEqual(['2026-03-08T06:30:00.000Z', '2026-03-08T07:30:00.000Z'])
  })
  it('existing, repeated and fixed-zone wall times have no such range', () => {
    expect(gapUncertainRange({ ...p, hour: 3 }, 'Europe/Berlin')).toBeNull()
    expect(gapUncertainRange({ year: 2026, month: 10, day: 25, hour: 2, minute: 30, second: 0 }, 'Europe/Berlin')).toBeNull()
    expect(gapUncertainRange(p, 'Europe/Istanbul')).toBeNull()
  })
})
