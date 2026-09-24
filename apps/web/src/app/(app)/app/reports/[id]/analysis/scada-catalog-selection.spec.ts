import { describe, expect, it } from 'vitest'
import type { CatalogSelection, CatalogSource } from './scada-catalog.types'
import { EMPTY_SELECTION, buildQueryBody, resolveSelection, resolveWallRange, selectSource, toggleSeries, utcToWall, wallBounds, wallToUtc } from './scada-catalog-selection'

const CAT_A = '11111111-1111-4111-8111-111111111111'
const CAT_B = '22222222-2222-4222-8222-222222222222'
const src = (over: Partial<CatalogSource> = {}): CatalogSource => ({
  catalogId: CAT_A, name: 'Kaynak A', status: 'ACTIVE', mappingStatus: 'RESOLVED', schemaStatus: 'UNVERIFIED', timezoneStatus: 'DEVELOPMENT_OVERRIDE', timezone: 'Europe/Istanbul',
  supportedIntervals: ['HOURLY', 'DAILY'], rowCount: 48, minAt: '2025-12-31T21:00:00.000Z', maxAt: '2026-01-02T20:00:00.000Z', selectable: true, blockedReason: null,
  series: [
    { seriesKey: 'S1', label: 'Seri 1', unit: 'kWh', valueType: 'INDEX', available: true, qualityStatus: 'OK', verificationStatus: 'VERIFIED', sourceCatalogId: CAT_A },
    { seriesKey: 'S2', label: 'Seri 2', unit: 'kWh', valueType: 'INDEX', available: true, qualityStatus: 'PARTIAL', verificationStatus: 'VERIFIED', sourceCatalogId: CAT_A },
  ],
  ...over,
})
const sel = (over: Partial<CatalogSelection> = {}): CatalogSelection => ({ sourceCatalogId: CAT_A, seriesKeys: ['S1'], startWall: '2026-01-01T00:00', endWall: '2026-01-01T05:00', interval: 'HOURLY', ...over })

describe('wall clock ⇄ instant in the source zone (no browser-zone dependence)', () => {
  it('converts both ways in Europe/Istanbul (+03:00)', () => {
    expect(wallToUtc('2026-01-01T00:00', 'Europe/Istanbul')).toBe('2025-12-31T21:00:00.000Z')
    expect(utcToWall('2025-12-31T21:00:00.000Z', 'Europe/Istanbul')).toBe('2026-01-01T00:00')
  })
  it('honours DST of the SOURCE zone (Europe/Berlin summer +02:00)', () => {
    expect(wallToUtc('2026-07-01T12:00', 'Europe/Berlin')).toBe('2026-07-01T10:00:00.000Z')
    expect(wallToUtc('2026-01-01T12:00', 'Europe/Berlin')).toBe('2026-01-01T11:00:00.000Z')
  })
  it('a wall time that does not exist (spring-forward gap) has no instant; malformed input has none', () => {
    expect(wallToUtc('2026-03-29T02:30', 'Europe/Berlin')).toBeNull()
    expect(wallToUtc('nonsense', 'Europe/Istanbul')).toBeNull()
    expect(wallToUtc('2026-01-01T00:00', 'Not/AZone')).toBeNull()
  })
})

describe('selection rules', () => {
  it('a source must be chosen before a series can be', () => {
    expect(toggleSeries(EMPTY_SELECTION, null, 'S1').seriesKeys).toEqual([])
    expect(toggleSeries(sel({ seriesKeys: [] }), src(), 'S1').seriesKeys).toEqual(['S1'])
    expect(toggleSeries(sel({ seriesKeys: ['S1'] }), src(), 'S1').seriesKeys).toEqual([])
  })

  it('a series the source does not offer (or that is unavailable) cannot be selected', () => {
    expect(toggleSeries(sel({ seriesKeys: [] }), src(), 'NOT_THERE').seriesKeys).toEqual([])
    const off = src({ series: [{ seriesKey: 'S1', label: 'x', unit: '', valueType: 'INDEX', available: false, qualityStatus: 'UNVERIFIED', verificationStatus: 'UNVERIFIED', sourceCatalogId: CAT_A }] })
    expect(toggleSeries(sel({ seriesKeys: [] }), off, 'S1').seriesKeys).toEqual([])
  })

  it('changing the source CLEARS every series and resets the range to the new source\'s bounds; the interval is kept', () => {
    const next = selectSource(sel({ seriesKeys: ['S1', 'S2'], interval: 'DAILY' }), src({ catalogId: CAT_B, minAt: '2026-02-01T00:00:00.000Z', maxAt: '2026-02-03T00:00:00.000Z' }))
    expect(next).toEqual({ sourceCatalogId: CAT_B, seriesKeys: [], startWall: '2026-02-01T03:00', endWall: '2026-02-03T03:00', interval: 'DAILY' })
  })

  it('a source that is not selectable cannot be selected at all', () => {
    expect(selectSource(sel(), src({ selectable: false }))).toEqual({ ...EMPTY_SELECTION, interval: 'HOURLY' })
    expect(selectSource(sel(), null).sourceCatalogId).toBe('')
  })

  it('the data bounds are wall-clock values in the source zone (null while the zone or the range is unknown)', () => {
    expect(wallBounds(src())).toEqual({ min: '2026-01-01T00:00', max: '2026-01-02T23:00' })
    expect(wallBounds(src({ timezone: null }))).toBeNull()
    expect(wallBounds(src({ minAt: null }))).toBeNull()
  })
})

describe('range → API instants ([startAt, endAt), inclusive UI end)', () => {
  it('HOURLY: the last chosen hour is INCLUDED (endAt = its end); no forward buffer is added here', () => {
    expect(resolveSelection(sel(), src())).toEqual({ ok: true, startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T03:00:00.000Z', timezone: 'Europe/Istanbul' })
  })

  it('DAILY: whole local days; the last chosen day is included up to the NEXT local midnight', () => {
    const r = resolveSelection(sel({ interval: 'DAILY', startWall: '2026-01-01T13:00', endWall: '2026-01-02T05:00' }), src({ maxAt: '2026-01-02T22:00:00.000Z' }))
    expect(r).toEqual({ ok: true, startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-02T21:00:00.000Z', timezone: 'Europe/Istanbul' })
  })

  it('a DAILY end across a DST change ends at the next LOCAL midnight (not +24 h)', () => {
    const r = resolveWallRange('2026-03-28T00:00', '2026-03-28T00:00', 'DAILY', 'Europe/Berlin', null)
    expect(r).toEqual({ ok: true, startAt: '2026-03-27T23:00:00.000Z', endAt: '2026-03-28T23:00:00.000Z' })
    const dst = resolveWallRange('2026-03-29T00:00', '2026-03-29T00:00', 'DAILY', 'Europe/Berlin', null)
    expect(dst).toEqual({ ok: true, startAt: '2026-03-28T23:00:00.000Z', endAt: '2026-03-29T22:00:00.000Z' }) // a 23 h day
  })

  it.each([
    ['before the first reading', { startWall: '2025-12-31T23:00' }, 'RANGE_OUTSIDE_DATA'],
    ['after the last reading', { endWall: '2026-01-03T00:00' }, 'RANGE_OUTSIDE_DATA'],
    ['start after end', { startWall: '2026-01-01T09:00', endWall: '2026-01-01T05:00' }, 'RANGE_ORDER'],
    ['no start', { startWall: '' }, 'NO_RANGE'],
    ['no end', { endWall: '' }, 'NO_RANGE'],
    ['no series', { seriesKeys: [] }, 'NO_SERIES'],
    ['a series the source does not have', { seriesKeys: ['S9'] }, 'SERIES_NOT_IN_SOURCE'],
    ['another source than the discovered one', { sourceCatalogId: CAT_B }, 'NO_SOURCE'],
    ['no source', { sourceCatalogId: '' }, 'NO_SOURCE'],
  ])('%s ⇒ %s (no call is made)', (_n, over, problem) => {
    expect(resolveSelection(sel(over as Partial<CatalogSelection>), src())).toEqual({ ok: false, problem })
  })

  it('a source without a zone or that is not selectable never resolves', () => {
    expect(resolveSelection(sel(), src({ timezone: null }))).toEqual({ ok: false, problem: 'NO_ZONE' })
    expect(resolveSelection(sel(), src({ selectable: false }))).toEqual({ ok: false, problem: 'NO_SOURCE' })
    expect(resolveSelection(sel(), null)).toEqual({ ok: false, problem: 'NO_SOURCE' })
  })
})

describe('the request body', () => {
  it('carries ONLY the selected source and series, the converted range, interval and zone — no path, file or physical name', () => {
    const body = buildQueryBody('SCADA_HOURLY_ANALYSIS', sel({ seriesKeys: ['S2', 'S1'] }), { startAt: 'a', endAt: 'b', timezone: 'Europe/Istanbul' }, ['SUM'])
    expect(body).toEqual({ artifactCode: 'SCADA_HOURLY_ANALYSIS', mode: 'EXPLICIT', sourceCatalogIds: [CAT_A], seriesKeys: ['S2', 'S1'], startAt: 'a', endAt: 'b', bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul', statistics: ['SUM'] })
    expect(Object.keys(body).sort()).toEqual(['artifactCode', 'bucketInterval', 'endAt', 'mode', 'seriesKeys', 'sourceCatalogIds', 'startAt', 'statistics', 'timezone'])
  })
  it('sends no `statistics` key when none is chosen (the server default applies)', () => {
    expect('statistics' in buildQueryBody('X', sel(), { startAt: 'a', endAt: 'b', timezone: 'Z' }, [])).toBe(false)
  })
})
