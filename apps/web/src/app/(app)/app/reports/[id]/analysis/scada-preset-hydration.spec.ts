import { describe, expect, it } from 'vitest'
import type { PresetDetail, PresetSummary } from './scada-analysis.types'
import type { ScadaCatalog } from './scada-catalog.types'
import { autoMapSeries, buildSeriesMapping, hydratePreset } from './scada-preset-hydration'
import { buildPresetRequest } from './scada-preset-request'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const ser = (id: string, key: string, over: Record<string, unknown> = {}) => ({ seriesKey: key, label: key, unit: '', valueType: 'INDEX', available: true, qualityStatus: 'OK', verificationStatus: 'VERIFIED', sourceCatalogId: id, ...over })
const src = (id: string, keys: string[], over: Record<string, unknown> = {}) => ({ catalogId: id, name: `Kaynak ${id.slice(0, 1)}`, status: 'ACTIVE', mappingStatus: 'RESOLVED', schemaStatus: 'UNVERIFIED', timezoneStatus: 'DEVELOPMENT_OVERRIDE', timezone: 'Europe/Istanbul', supportedIntervals: ['HOURLY', 'DAILY'], rowCount: 48, minAt: '2025-12-31T21:00:00.000Z', maxAt: '2026-01-02T20:00:00.000Z', selectable: true, blockedReason: null, series: keys.map(k => ser(id, k)), ...over })
const catalog = (over: Partial<ScadaCatalog> = {}): ScadaCatalog => ({ artifact: null, developmentLabel: 'DEV', sources: [src(A, ['GT1', 'GT2']), src(B, ['SG1', 'SG2', 'GT1'])], ...over }) as unknown as ScadaCatalog
const preset = (over: Record<string, unknown> = {}): PresetSummary => ({ presetId: 'pr-1', version: 1, scope: 'PRIVATE', name: 'P', description: null, status: 'ACTIVE', isOwner: true, bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul', sourceCatalogIds: [A], seriesKeys: ['GT1'], virtualColumns: [], statistics: ['SUM', 'MAX'], comparisonMode: 'NONE', comparison: { mode: 'NONE', comparisonRange: null, leftSourceCatalogId: null, rightSourceCatalogId: null, seriesMapping: [] }, chartType: 'LINE', timeRange: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T21:00:00.000Z' }, effectiveFrom: null, effectiveTo: null, updatedAt: 'x', ...over }) as PresetSummary
const detail = (p: PresetSummary, resolved = true): PresetDetail => ({ preset: p, versions: [], resolution: { status: resolved ? 'RESOLVED' : 'NOT_RESOLVED' } })

describe('hydratePreset', () => {
  it('a plain preset becomes source, series, wall range (inclusive end), interval, statistics and virtual columns', () => {
    const r = hydratePreset(detail(preset({ virtualColumns: [{ virtualColumnId: 'vc-1', version: null }] })), catalog())
    expect(r).toEqual({ ok: true, value: { selection: { sourceCatalogId: A, seriesKeys: ['GT1'], startWall: '2026-01-01T00:00', endWall: '2026-01-01T23:00', interval: 'HOURLY' }, statistics: ['SUM', 'MAX'], virtualIds: ['vc-1'], comparison: { mode: 'NONE', comparisonStartWall: '', comparisonEndWall: '', rightSourceCatalogId: '', mapping: {} } } })
  })

  it('a DAILY preset ends on the last included local day', () => {
    const r = hydratePreset(detail(preset({ bucketInterval: 'DAILY', timeRange: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-02T21:00:00.000Z' } })), catalog())
    expect(r.ok && r.value.selection).toMatchObject({ startWall: '2026-01-01T00:00', endWall: '2026-01-02T00:00', interval: 'DAILY' })
  })

  it('a PERIOD preset carries the comparison period as wall values', () => {
    const r = hydratePreset(detail(preset({ comparisonMode: 'PERIOD', comparison: { mode: 'PERIOD', comparisonRange: { startAt: '2026-01-01T21:00:00.000Z', endAt: '2026-01-02T21:00:00.000Z' }, leftSourceCatalogId: null, rightSourceCatalogId: null, seriesMapping: [] } })), catalog())
    expect(r.ok && r.value.comparison).toMatchObject({ mode: 'PERIOD', comparisonStartWall: '2026-01-02T00:00', comparisonEndWall: '2026-01-02T23:00' })
  })

  it('a SOURCE preset carries the two sources and the EXPLICIT pairs (different names)', () => {
    const p = preset({ sourceCatalogIds: [A, B], seriesKeys: ['GT1', 'SG1'], comparisonMode: 'SOURCE', comparison: { mode: 'SOURCE', comparisonRange: null, leftSourceCatalogId: A, rightSourceCatalogId: B, seriesMapping: [{ leftSeriesKey: 'GT1', rightSeriesKey: 'SG1' }, { leftSeriesKey: 'GT2', rightSeriesKey: 'SG2' }] } })
    const r = hydratePreset(detail(p), catalog())
    expect(r.ok && r.value).toMatchObject({ selection: { sourceCatalogId: A, seriesKeys: ['GT1', 'GT2'] }, comparison: { mode: 'SOURCE', rightSourceCatalogId: B, mapping: { GT1: 'SG1', GT2: 'SG2' } }, virtualIds: [] })
  })

  it.each([
    ['an inactive preset', detail(preset({ status: 'DISABLED' })), 'PRESET_INACTIVE'],
    ['a preset that no longer resolves', detail(preset(), false), 'PRESET_NOT_RESOLVED'],
    ['a source that is gone', detail(preset({ sourceCatalogIds: ['33333333-3333-4333-8333-333333333333'] })), 'SOURCE_MISSING'],
    ['a series that is gone', detail(preset({ seriesKeys: ['GT1', 'NOPE'] })), 'SERIES_MISSING'],
    ['two sources in a plain preset', detail(preset({ sourceCatalogIds: [A, B] })), 'MULTI_SOURCE_UNSUPPORTED'],
    ['another zone', detail(preset({ timezone: 'Europe/Berlin' })), 'ZONE_MISMATCH'],
    ['a range outside the data', detail(preset({ timeRange: { startAt: '2030-01-01T00:00:00.000Z', endAt: '2030-01-02T00:00:00.000Z' } })), 'RANGE_INVALID'],
    ['a SOURCE preset without a mapping', detail(preset({ comparison: { mode: 'SOURCE', comparisonRange: null, leftSourceCatalogId: A, rightSourceCatalogId: B, seriesMapping: [] } })), 'COMPARISON_INVALID'],
    ['a SOURCE preset with a duplicate right series', detail(preset({ comparison: { mode: 'SOURCE', comparisonRange: null, leftSourceCatalogId: A, rightSourceCatalogId: B, seriesMapping: [{ leftSeriesKey: 'GT1', rightSeriesKey: 'SG1' }, { leftSeriesKey: 'GT2', rightSeriesKey: 'SG1' }] } })), 'COMPARISON_INVALID'],
    ['a SOURCE preset whose right series is gone', detail(preset({ comparison: { mode: 'SOURCE', comparisonRange: null, leftSourceCatalogId: A, rightSourceCatalogId: B, seriesMapping: [{ leftSeriesKey: 'GT1', rightSeriesKey: 'GONE' }] } })), 'SERIES_MISSING'],
    ['a PERIOD preset without a range', detail(preset({ comparison: { mode: 'PERIOD', comparisonRange: null, leftSourceCatalogId: null, rightSourceCatalogId: null, seriesMapping: [] } })), 'COMPARISON_INVALID'],
  ])('%s is refused as a whole (%s)', (_n, d, problem) => {
    expect(hydratePreset(d, catalog())).toEqual({ ok: false, problem })
  })

  it('an unverified / unavailable series or a not selectable source is not applied', () => {
    const c = catalog({ sources: [src(A, ['GT1'], { series: [ser(A, 'GT1', { available: false })] }), src(B, ['SG1'], { selectable: false })] as unknown as ScadaCatalog['sources'] })
    expect(hydratePreset(detail(preset()), c)).toEqual({ ok: false, problem: 'SERIES_MISSING' })
    expect(hydratePreset(detail(preset({ sourceCatalogIds: [B], seriesKeys: ['SG1'] })), c)).toEqual({ ok: false, problem: 'SOURCE_MISSING' })
  })
})

describe('the explicit series mapping', () => {
  const left = ['GT1', 'GT2']
  const right = catalog().sources[1]!
  it('auto-maps ONLY identical keys; different names stay unmapped; a valid earlier choice is kept', () => {
    expect(autoMapSeries(left, right, {})).toEqual({ GT1: 'GT1' })
    expect(autoMapSeries(left, right, { GT2: 'SG2' })).toEqual({ GT1: 'GT1', GT2: 'SG2' })
    expect(autoMapSeries(left, right, { GT1: 'SG1' })).toEqual({ GT1: 'SG1' }) // GT1 chosen SG1, so GT1 (right) is free but GT2 has no same-named partner
    expect(autoMapSeries(['X'], right, { X: 'GONE' })).toEqual({})
    expect(autoMapSeries(left, null, { GT1: 'GT1' })).toEqual({})
  })

  it('never binds one right series twice, whatever the input', () => {
    const out = autoMapSeries(['GT1', 'GT2'], right, { GT1: 'SG1', GT2: 'SG1' })
    expect(new Set(Object.values(out)).size).toBe(Object.values(out).length)
  })

  it('builds only complete, unique, existing pairs — otherwise the reason (no call)', () => {
    expect(buildSeriesMapping(left, right, { GT1: 'SG1', GT2: 'SG2' })).toEqual({ ok: true, pairs: [{ leftSeriesKey: 'GT1', rightSeriesKey: 'SG1' }, { leftSeriesKey: 'GT2', rightSeriesKey: 'SG2' }] })
    expect(buildSeriesMapping(left, right, { GT1: 'SG1' })).toEqual({ ok: false, problem: 'MAPPING_INCOMPLETE' })
    expect(buildSeriesMapping(left, right, { GT1: 'SG1', GT2: 'SG1' })).toEqual({ ok: false, problem: 'MAPPING_DUPLICATE' })
    expect(buildSeriesMapping(left, right, { GT1: 'SG1', GT2: 'NOPE' })).toEqual({ ok: false, problem: 'MAPPING_UNKNOWN_SERIES' })
    expect(buildSeriesMapping(left, null, {})).toEqual({ ok: false, problem: 'NO_RIGHT_SOURCE' })
    expect(buildSeriesMapping([], right, {})).toEqual({ ok: false, problem: 'MAPPING_INCOMPLETE' })
  })
})

describe('buildPresetRequest', () => {
  const form = (over: Record<string, unknown> = {}) => ({ selection: { sourceCatalogId: A, seriesKeys: ['GT1'], startWall: '2026-01-01T00:00', endWall: '2026-01-01T23:00', interval: 'HOURLY' as const }, catalog: catalog(), statistics: ['SUM'], virtualIds: [] as string[], comparison: { mode: 'NONE' as const, comparisonStartWall: '', comparisonEndWall: '', rightSourceCatalogId: '', mapping: {} }, ...over })
  const draft = { name: ' Vardiya ', description: '', scope: 'PRIVATE' as const }

  it('sends only the plan: no tenant / role / permission / status / version / owner / creator', () => {
    const r = buildPresetRequest(draft, form({ virtualIds: ['vc-1'] }))
    expect(r).toEqual({ ok: true, body: { name: 'Vardiya', scope: 'PRIVATE', statistics: ['SUM'], timeRange: { startAt: '2025-12-31T21:00:00.000Z', endAt: '2026-01-01T21:00:00.000Z' }, bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul', sourceCatalogIds: [A], seriesKeys: ['GT1'], virtualColumns: [{ virtualColumnId: 'vc-1' }], comparison: { mode: 'NONE' } } })
    expect(JSON.stringify(r)).not.toMatch(/tenantId|role|permission|createdBy|"status"|"version"|owner|expression/)
  })

  it('PERIOD keeps the comparison range; SOURCE sends the explicit pairs and NO sources / series of its own', () => {
    const period = buildPresetRequest(draft, form({ comparison: { mode: 'PERIOD', comparisonStartWall: '2026-01-02T00:00', comparisonEndWall: '2026-01-02T23:00', rightSourceCatalogId: '', mapping: {} } }))
    expect(period.ok && period.body['comparison']).toEqual({ mode: 'PERIOD', comparisonRange: { startAt: '2026-01-01T21:00:00.000Z', endAt: '2026-01-02T21:00:00.000Z' } })
    const source = buildPresetRequest(draft, form({ comparison: { mode: 'SOURCE', comparisonStartWall: '', comparisonEndWall: '', rightSourceCatalogId: B, mapping: { GT1: 'SG1' } } }))
    expect(source.ok && source.body['comparison']).toEqual({ mode: 'SOURCE', leftSourceCatalogId: A, rightSourceCatalogId: B, seriesMapping: [{ leftSeriesKey: 'GT1', rightSeriesKey: 'SG1' }] })
    expect(source.ok && 'sourceCatalogIds' in source.body).toBe(false)
    expect(source.ok && 'seriesKeys' in source.body).toBe(false)
  })

  it.each([
    ['an empty name', { ...draft, name: '  ' }, {}],
    ['no series', draft, { selection: { sourceCatalogId: A, seriesKeys: [], startWall: '2026-01-01T00:00', endWall: '2026-01-01T23:00', interval: 'HOURLY' } }],
    ['no source', draft, { selection: { sourceCatalogId: '', seriesKeys: [], startWall: '', endWall: '', interval: 'HOURLY' } }],
    ['a range outside the data', draft, { selection: { sourceCatalogId: A, seriesKeys: ['GT1'], startWall: '2030-01-01T00:00', endWall: '2030-01-02T00:00', interval: 'HOURLY' } }],
    ['no statistics', draft, { statistics: [] }],
    ['a SOURCE comparison without a complete mapping', draft, { comparison: { mode: 'SOURCE', comparisonStartWall: '', comparisonEndWall: '', rightSourceCatalogId: B, mapping: {} } }],
    ['a PERIOD comparison without a range', draft, { comparison: { mode: 'PERIOD', comparisonStartWall: '', comparisonEndWall: '', rightSourceCatalogId: '', mapping: {} } }],
  ])('%s is never built (nothing would be sent)', (_n, d, over) => {
    expect(buildPresetRequest(d, form(over)).ok).toBe(false)
  })
})
