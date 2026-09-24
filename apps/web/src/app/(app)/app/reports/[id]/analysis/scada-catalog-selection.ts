import type { CatalogSelection, CatalogSource, Interval } from './scada-catalog.types'

/**
 * TASK-027.73-R1 — pure selection rules of the SCADA analysis form: source → series → range → interval. No state, no I/O.
 * The range the user sees is INCLUSIVE and in the SOURCE's zone; the API takes an absolute half-open [startAt, endAt).
 */
export const EMPTY_SELECTION: CatalogSelection = { sourceCatalogId: '', seriesKeys: [], startWall: '', endWall: '', interval: 'HOURLY' }

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
const HOUR_MS = 3_600_000
const pad = (n: number) => String(n).padStart(2, '0')

function offsetMs(utcMs: number, zone: string): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p: Record<string, string> = {}
  for (const part of f.formatToParts(new Date(utcMs))) p[part.type] = part.value
  const asUtc = Date.UTC(Number(p['year']), Number(p['month']) - 1, Number(p['day']), Number(p['hour']), Number(p['minute']), Number(p['second']))
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/** `YYYY-MM-DDTHH:mm` wall clock of an instant in `zone`. */
export function utcToWall(iso: string, zone: string): string | null {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  try {
    const w = new Date(ms + offsetMs(ms, zone))
    return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}T${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`
  } catch {
    return null
  }
}

/** The absolute instant of a wall-clock value in `zone`; null for a malformed value or a wall time that does not exist (spring-forward gap). */
export function wallToUtc(wall: string, zone: string): string | null {
  const m = WALL.exec(wall)
  if (!m) return null
  try {
    const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
    let guess = naive - offsetMs(naive, zone)
    guess = naive - offsetMs(guess, zone)
    const iso = new Date(guess).toISOString()
    return utcToWall(iso, zone) === wall.slice(0, 16) ? iso : null
  } catch {
    return null
  }
}

/** Picking another source drops EVERY series and the range (they belong to the previous source). The interval is kept. */
export function selectSource(current: CatalogSelection, source: CatalogSource | null): CatalogSelection {
  if (!source || !source.selectable) return { ...EMPTY_SELECTION, interval: current.interval }
  const bounds = wallBounds(source)
  return { sourceCatalogId: source.catalogId, seriesKeys: [], startWall: bounds?.min ?? '', endWall: bounds?.max ?? '', interval: current.interval }
}

export function toggleSeries(current: CatalogSelection, source: CatalogSource | null, seriesKey: string): CatalogSelection {
  if (!source || source.catalogId !== current.sourceCatalogId || !source.series.some(s => s.seriesKey === seriesKey && s.available)) return current // no source, no series
  const has = current.seriesKeys.includes(seriesKey)
  return { ...current, seriesKeys: has ? current.seriesKeys.filter(k => k !== seriesKey) : [...current.seriesKeys, seriesKey] }
}

/** The CSV's first / last reading as wall-clock bounds in the source zone (input `min` / `max`). */
export function wallBounds(source: CatalogSource): { min: string; max: string } | null {
  if (!source.timezone || !source.minAt || !source.maxAt) return null
  const min = utcToWall(source.minAt, source.timezone)
  const max = utcToWall(source.maxAt, source.timezone)
  return min && max ? { min, max } : null
}

export type SelectionProblem = 'NO_SOURCE' | 'NO_SERIES' | 'SERIES_NOT_IN_SOURCE' | 'NO_RANGE' | 'RANGE_ORDER' | 'RANGE_OUTSIDE_DATA' | 'NO_ZONE' | 'RANGE_INVALID'

export type SelectionResult = { ok: true; startAt: string; endAt: string; timezone: string } | { ok: false; problem: SelectionProblem }

/**
 * Validates the selection against the discovered source and converts the inclusive wall-clock range to the API's half-open
 * instants: DAILY snaps to whole local days, the last chosen hour / day is INCLUDED (endAt = its end). The forward buffer of an
 * INDEX series is the server's business (027.65); nothing is added here.
 */
export function resolveSelection(sel: CatalogSelection, source: CatalogSource | null): SelectionResult {
  if (!source || !sel.sourceCatalogId || source.catalogId !== sel.sourceCatalogId || !source.selectable) return { ok: false, problem: 'NO_SOURCE' }
  if (!source.timezone) return { ok: false, problem: 'NO_ZONE' }
  if (sel.seriesKeys.length === 0) return { ok: false, problem: 'NO_SERIES' }
  const known = new Set(source.series.filter(s => s.available).map(s => s.seriesKey))
  if (sel.seriesKeys.some(k => !known.has(k))) return { ok: false, problem: 'SERIES_NOT_IN_SOURCE' }
  const range = resolveWallRange(sel.startWall, sel.endWall, sel.interval, source.timezone, wallBounds(source))
  return range.ok ? { ok: true, startAt: range.startAt, endAt: range.endAt, timezone: source.timezone } : range
}

/**
 * The inclusive wall-clock range → the API's half-open instants (also used for a comparison period). `bounds` are the data's
 * first / last reading in the same zone: a range outside them is refused (no call is made for it).
 */
export function resolveWallRange(
  startInput: string,
  endInput: string,
  interval: Interval,
  timezone: string,
  bounds: { min: string; max: string } | null,
): { ok: true; startAt: string; endAt: string } | { ok: false; problem: SelectionProblem } {
  if (!WALL.test(startInput) || !WALL.test(endInput)) return { ok: false, problem: 'NO_RANGE' }
  const snap = (wall: string) => (interval === 'DAILY' ? `${wall.slice(0, 10)}T00:00` : wall.slice(0, 16))
  const startWall = snap(startInput)
  const endWall = snap(endInput)
  if (startWall > endWall) return { ok: false, problem: 'RANGE_ORDER' }
  if (bounds && (startInput.slice(0, 16) < bounds.min || endInput.slice(0, 16) > bounds.max)) return { ok: false, problem: 'RANGE_OUTSIDE_DATA' }
  const startAt = wallToUtc(startWall, timezone)
  const lastStart = wallToUtc(endWall, timezone)
  if (!startAt || !lastStart) return { ok: false, problem: 'RANGE_INVALID' }
  if (interval === 'HOURLY') return { ok: true, startAt, endAt: new Date(Date.parse(lastStart) + HOUR_MS).toISOString() }
  // a local day is not always 24 h (DST): the end of the last chosen day is the NEXT local midnight
  const next = new Date(Date.UTC(Number(endWall.slice(0, 4)), Number(endWall.slice(5, 7)) - 1, Number(endWall.slice(8, 10)) + 1))
  const nextUtc = wallToUtc(`${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T00:00`, timezone)
  return nextUtc ? { ok: true, startAt, endAt: nextUtc } : { ok: false, problem: 'RANGE_INVALID' }
}

export const PROBLEM_MESSAGE: Record<SelectionProblem, string> = {
  NO_SOURCE: 'Önce bir kaynak seçin.',
  NO_SERIES: 'En az bir seri seçin.',
  SERIES_NOT_IN_SOURCE: 'Seçili seri bu kaynakta yok. Seçimi yenileyin.',
  NO_RANGE: 'Başlangıç ve bitiş tarihini seçin.',
  RANGE_ORDER: 'Başlangıç tarihi bitiş tarihinden sonra olamaz.',
  RANGE_OUTSIDE_DATA: 'Tarih aralığı kaynağın veri aralığı dışında.',
  NO_ZONE: 'Kaynağın saat dilimi tanımlı değil.',
  RANGE_INVALID: 'Seçilen tarih aralığı geçerli bir zamana çevrilemedi.',
}

/** The ONLY body a plain (non-preset) analysis sends: the selected source and series, the converted range, interval and zone. */
export function buildQueryBody(artifactCode: string, sel: CatalogSelection, range: { startAt: string; endAt: string; timezone: string }, statistics: string[], virtualColumnIds: readonly string[] = []) {
  return {
    artifactCode,
    mode: 'EXPLICIT' as const,
    sourceCatalogIds: [sel.sourceCatalogId],
    seriesKeys: [...sel.seriesKeys],
    startAt: range.startAt,
    endAt: range.endAt,
    bucketInterval: sel.interval,
    timezone: range.timezone,
    ...(statistics.length > 0 ? { statistics } : {}),
    ...(virtualColumnIds.length > 0 ? { virtualColumnIds: [...virtualColumnIds] } : {}),
  }
}
