import type { CatalogSelection, CatalogSource, Interval, ScadaCatalog } from './scada-catalog.types'
import { resolveWallRange, utcToWall, wallBounds } from './scada-catalog-selection'
import type { PresetDetail } from './scada-analysis.types'

/**
 * TASK-027.59-R1 — pure rules that turn a preset (as the API returns it) into the analysis form, and the form back into a preset request.
 * The form is changed ONLY when the WHOLE preset validates against the discovered catalog (all-or-nothing); nothing here does I/O, keeps an
 * expression (the API never sends one) or infers anything from a series name.
 */
export type HydrationProblem = 'PRESET_INACTIVE' | 'PRESET_NOT_RESOLVED' | 'SOURCE_MISSING' | 'MULTI_SOURCE_UNSUPPORTED' | 'SERIES_MISSING' | 'ZONE_MISMATCH' | 'RANGE_INVALID' | 'COMPARISON_INVALID'

export const HYDRATION_MESSAGE: Record<HydrationProblem, string> = {
  PRESET_INACTIVE: 'Preset aktif değil; uygulanmadı.',
  PRESET_NOT_RESOLVED: 'Preset artık çözümlenemiyor (kaynak, seri veya sanal kolon değişmiş); uygulanmadı.',
  SOURCE_MISSING: 'Preset\'teki kaynak artık mevcut veya seçilebilir değil; uygulanmadı.',
  MULTI_SOURCE_UNSUPPORTED: 'Preset birden fazla kaynak içeriyor; bu ekran tek kaynakla çalışır, uygulanmadı.',
  SERIES_MISSING: 'Preset\'teki bir seri artık kaynakta yok veya doğrulanmamış; uygulanmadı.',
  ZONE_MISMATCH: 'Preset\'in saat dilimi kaynağınkiyle uyuşmuyor; uygulanmadı.',
  RANGE_INVALID: 'Preset\'in tarih aralığı kaynağın veri aralığı dışında; uygulanmadı.',
  COMPARISON_INVALID: 'Preset\'in karşılaştırma ayarı geçersiz; uygulanmadı.',
}

export interface HydratedForm {
  selection: CatalogSelection
  statistics: string[]
  virtualIds: string[]
  comparison: {
    mode: 'NONE' | 'PERIOD' | 'SOURCE'
    comparisonStartWall: string
    comparisonEndWall: string
    rightSourceCatalogId: string
    /** left series key → right series key (explicit pairs only). */
    mapping: Record<string, string>
  }
}

/** The inclusive last wall-clock value of a half-open [start, end) range in `zone`. */
function lastIncludedWall(endAt: string, interval: Interval, zone: string): string | null {
  const ms = Date.parse(endAt)
  if (Number.isNaN(ms)) return null
  if (interval === 'HOURLY') return utcToWall(new Date(ms - 3_600_000).toISOString(), zone)
  const w = utcToWall(new Date(ms - 1).toISOString(), zone)
  return w ? `${w.slice(0, 10)}T00:00` : null
}

function wallRange(range: { startAt: string; endAt: string }, interval: Interval, source: CatalogSource): { startWall: string; endWall: string } | null {
  const zone = source.timezone
  if (!zone) return null
  const startWall = utcToWall(range.startAt, zone)
  const endWall = lastIncludedWall(range.endAt, interval, zone)
  if (!startWall || !endWall) return null
  const back = resolveWallRange(startWall, endWall, interval, zone, wallBounds(source))
  // the round trip must reproduce the preset's own instants exactly, or the preset is not applied
  return back.ok && back.startAt === new Date(Date.parse(range.startAt)).toISOString() && back.endAt === new Date(Date.parse(range.endAt)).toISOString() ? { startWall, endWall } : null
}

const usable = (source: CatalogSource | undefined, keys: readonly string[]): boolean => !!source && source.selectable && keys.every(k => source.series.some(s => s.seriesKey === k && s.available))

export function hydratePreset(detail: PresetDetail, catalog: ScadaCatalog): { ok: true; value: HydratedForm } | { ok: false; problem: HydrationProblem } {
  const p = detail.preset
  if (p.status !== 'ACTIVE') return { ok: false, problem: 'PRESET_INACTIVE' }
  if (!detail.resolution || detail.resolution.status !== 'RESOLVED') return { ok: false, problem: 'PRESET_NOT_RESOLVED' }
  if (p.bucketInterval !== 'HOURLY' && p.bucketInterval !== 'DAILY') return { ok: false, problem: 'RANGE_INVALID' }
  const interval = p.bucketInterval
  const c = p.comparison
  const source = (id: string | null | undefined) => catalog.sources.find(s => s.catalogId === id)
  const empty = { mode: 'NONE' as const, comparisonStartWall: '', comparisonEndWall: '', rightSourceCatalogId: '', mapping: {} as Record<string, string> }

  let leftId: string
  let seriesKeys: string[]
  let comparison: HydratedForm['comparison'] = empty
  if (c.mode === 'SOURCE') {
    if (!c.leftSourceCatalogId || !c.rightSourceCatalogId || c.seriesMapping.length === 0) return { ok: false, problem: 'COMPARISON_INVALID' }
    leftId = c.leftSourceCatalogId
    seriesKeys = c.seriesMapping.map(e => e.leftSeriesKey)
    const mapping: Record<string, string> = {}
    for (const e of c.seriesMapping) mapping[e.leftSeriesKey] = e.rightSeriesKey
    if (Object.keys(mapping).length !== c.seriesMapping.length || new Set(Object.values(mapping)).size !== c.seriesMapping.length) return { ok: false, problem: 'COMPARISON_INVALID' }
    if (!usable(source(c.rightSourceCatalogId), Object.values(mapping))) return { ok: false, problem: 'SERIES_MISSING' }
    comparison = { ...empty, mode: 'SOURCE', rightSourceCatalogId: c.rightSourceCatalogId, mapping }
  } else {
    if (p.sourceCatalogIds.length !== 1) return { ok: false, problem: p.sourceCatalogIds.length === 0 ? 'SOURCE_MISSING' : 'MULTI_SOURCE_UNSUPPORTED' }
    leftId = p.sourceCatalogIds[0]!
    seriesKeys = [...p.seriesKeys]
  }
  const left = source(leftId)
  if (!left || !left.selectable) return { ok: false, problem: 'SOURCE_MISSING' }
  if (seriesKeys.length === 0 || !usable(left, seriesKeys)) return { ok: false, problem: 'SERIES_MISSING' }
  if (p.timezone !== left.timezone) return { ok: false, problem: 'ZONE_MISMATCH' }
  const range = wallRange(p.timeRange, interval, left)
  if (!range) return { ok: false, problem: 'RANGE_INVALID' }
  if (c.mode === 'PERIOD') {
    if (!c.comparisonRange) return { ok: false, problem: 'COMPARISON_INVALID' }
    const cr = wallRange(c.comparisonRange, interval, left)
    if (!cr) return { ok: false, problem: 'RANGE_INVALID' }
    comparison = { ...empty, mode: 'PERIOD', comparisonStartWall: cr.startWall, comparisonEndWall: cr.endWall }
  }
  return {
    ok: true,
    value: {
      selection: { sourceCatalogId: leftId, seriesKeys, startWall: range.startWall, endWall: range.endWall, interval },
      statistics: [...p.statistics],
      virtualIds: c.mode === 'SOURCE' ? [] : p.virtualColumns.map(v => v.virtualColumnId),
      comparison,
    },
  }
}

// ---------------------------------------------------------------- explicit left → right series mapping (SOURCE comparison)

/**
 * Pairs series ONLY when the two sources really have a series of the SAME key (the user may always change or clear it). Different names
 * are never paired, no unit / tenant / source is derived from a name, and an existing valid choice is kept.
 */
export function autoMapSeries(leftKeys: readonly string[], right: CatalogSource | null, current: Readonly<Record<string, string>>): Record<string, string> {
  const rightKeys = new Set((right?.series ?? []).filter(s => s.available).map(s => s.seriesKey))
  const out: Record<string, string> = {}
  const taken = new Set<string>()
  for (const l of leftKeys) {
    const c = current[l]
    if (c && rightKeys.has(c) && !taken.has(c)) {
      out[l] = c
      taken.add(c)
    }
  }
  for (const l of leftKeys) {
    if (out[l] !== undefined) continue
    if (rightKeys.has(l) && !taken.has(l)) {
      out[l] = l
      taken.add(l)
    }
  }
  return out
}

export type MappingProblem = 'NO_RIGHT_SOURCE' | 'MAPPING_INCOMPLETE' | 'MAPPING_DUPLICATE' | 'MAPPING_UNKNOWN_SERIES'

export const MAPPING_MESSAGE: Record<MappingProblem, string> = {
  NO_RIGHT_SOURCE: 'Karşılaştırma için ikinci bir kaynak seçin.',
  MAPPING_INCOMPLETE: 'Seçili her seri için sağ kaynaktan bir seri eşleyin; eşlenmeyen seri karşılaştırılmaz.',
  MAPPING_DUPLICATE: 'Aynı sağ seri iki farklı sol seriye bağlanamaz.',
  MAPPING_UNKNOWN_SERIES: 'Eşleme, sağ kaynakta bulunmayan bir seri içeriyor.',
}

/** The complete, checked list of pairs the API receives — or the reason it cannot be sent (then NO call is made). */
export function buildSeriesMapping(leftKeys: readonly string[], right: CatalogSource | null, mapping: Readonly<Record<string, string>>): { ok: true; pairs: Array<{ leftSeriesKey: string; rightSeriesKey: string }> } | { ok: false; problem: MappingProblem } {
  if (!right || !right.selectable) return { ok: false, problem: 'NO_RIGHT_SOURCE' }
  const pairs: Array<{ leftSeriesKey: string; rightSeriesKey: string }> = []
  for (const l of leftKeys) {
    const r = mapping[l]
    if (!r) return { ok: false, problem: 'MAPPING_INCOMPLETE' }
    if (!right.series.some(s => s.seriesKey === r && s.available)) return { ok: false, problem: 'MAPPING_UNKNOWN_SERIES' }
    pairs.push({ leftSeriesKey: l, rightSeriesKey: r })
  }
  if (pairs.length === 0) return { ok: false, problem: 'MAPPING_INCOMPLETE' }
  if (new Set(pairs.map(x => x.rightSeriesKey)).size !== pairs.length) return { ok: false, problem: 'MAPPING_DUPLICATE' }
  return { ok: true, pairs }
}
