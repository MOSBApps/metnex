import { assertTimeZone } from '../catalog/catalog-rules'

/**
 * Source time model (Q-W512): the source stores NAIVE wall-clock date/time in the catalog's IANA time zone.
 * Shared by the read-only adapter (to build a loss-free source-local query window) and the analysis query
 * service (to normalise returned rows to UTC). Deterministic, driver-agnostic.
 *
 * DST behaviour (provisional markers; final data-quality policy is TASK-027.67):
 *  - a wall time that occurs TWICE (clock goes back) resolves to the FIRST occurrence and is flagged AMBIGUOUS;
 *  - a wall time that does NOT exist (clock jumps forward) is shifted with the offset in force BEFORE the jump
 *    and flagged GAP.
 */
export type DstResolution = 'NORMAL' | 'AMBIGUOUS' | 'GAP'

export interface LocalDateTimeParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  millisecond?: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatterFor(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    formatters.set(zone, f)
  }
  return f
}

/** Offset (local − UTC) of `zone` at the instant `utcMs`, in ms. */
export function zoneOffsetMs(utcMs: number, zone: string): number {
  const parts: Record<string, number> = {}
  for (const part of formatterFor(zone).formatToParts(new Date(utcMs))) if (part.type !== 'literal') parts[part.type] = Number(part.value)
  const asUtc = Date.UTC(parts['year']!, parts['month']! - 1, parts['day']!, parts['hour']!, parts['minute']!, parts['second']!)
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

const DAY_MS = 86_400_000

export function localToUtc(parts: LocalDateTimeParts, zone: string): { instant: Date; dst: DstResolution } {
  assertTimeZone(zone)
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond ?? 0)
  const before = zoneOffsetMs(naive - DAY_MS, zone)
  const after = zoneOffsetMs(naive + DAY_MS, zone)
  const valid = [...new Set([before, after])].filter(offset => zoneOffsetMs(naive - offset, zone) === offset)
  if (valid.length === 0) return { instant: new Date(naive - before), dst: 'GAP' }
  if (valid.length === 1) return { instant: new Date(naive - valid[0]!), dst: 'NORMAL' }
  return { instant: new Date(naive - Math.max(...valid)), dst: 'AMBIGUOUS' }
}

/** The two UTC instants a repeated (AMBIGUOUS) wall time can mean — [first occurrence, second occurrence] — or null if it is not ambiguous. */
export function ambiguousCandidates(parts: LocalDateTimeParts, zone: string): [Date, Date] | null {
  assertTimeZone(zone)
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond ?? 0)
  const offsets = [...new Set([zoneOffsetMs(naive - DAY_MS, zone), zoneOffsetMs(naive + DAY_MS, zone)])].filter(offset => zoneOffsetMs(naive - offset, zone) === offset)
  if (offsets.length !== 2) return null
  const [first, second] = offsets.sort((a, b) => b - a) // larger offset = earlier instant = first pass
  return [new Date(naive - first!), new Date(naive - second!)]
}

/**
 * The UNCERTAINTY RANGE of a NONEXISTENT wall time (clock jumped forward): the span between its two possible readings
 * (pre-jump and post-jump offset). It is NOT an instant and NOT a candidate — the reading has no true instant; the range
 * only tells the analysis which time interval can no longer be trusted. Null if the wall time exists.
 */
export function gapUncertainRange(parts: LocalDateTimeParts, zone: string): [Date, Date] | null {
  assertTimeZone(zone)
  if (localToUtc(parts, zone).dst !== 'GAP') return null
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond ?? 0)
  const a = naive - zoneOffsetMs(naive - DAY_MS, zone)
  const b = naive - zoneOffsetMs(naive + DAY_MS, zone)
  return [new Date(Math.min(a, b)), new Date(Math.max(a, b))]
}

/** Resolves a repeated wall time with SOURCE-PROVIDED fold information (0 = first pass, 1 = second pass). Never guesses. */
export function localToUtcWithFold(parts: LocalDateTimeParts, zone: string, fold: 0 | 1): Date | null {
  const candidates = ambiguousCandidates(parts, zone)
  return candidates ? candidates[fold] : null
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** The naive wall-clock reading of an absolute instant in `zone`, as a `Date` whose UTC fields carry the wall time. */
function wallClock(instant: Date, zone: string): Date {
  assertTimeZone(zone)
  return new Date(instant.getTime() + zoneOffsetMs(instant.getTime(), zone))
}

/** `YYYY-MM-DD` of the local calendar day containing `instant`, optionally shifted by whole days. */
export function localDateString(instant: Date, zone: string, addDays = 0): string {
  const w = new Date(wallClock(instant, zone).getTime() + addDays * DAY_MS)
  return `${pad(w.getUTCFullYear(), 4)}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`
}

/** `YYYY-MM-DDTHH:mm:ss.fff` (naive, no zone suffix) wall-clock reading of `instant` in `zone`. */
export function localDateTimeString(instant: Date, zone: string): string {
  const w = wallClock(instant, zone)
  return `${localDateString(instant, zone)}T${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}:${pad(w.getUTCSeconds())}.${pad(w.getUTCMilliseconds(), 3)}`
}

/**
 * The loss-free source-local query window for the UTC window [from, to):
 *  - DATE column: whole local days — `from` day inclusive .. day after `to`'s day exclusive (a superset; the caller
 *    trims to the exact instants afterwards, so a day-boundary record can never be lost to a UTC/local mismatch);
 *  - DATETIME column: the exact naive wall-clock bounds.
 * No driver-specific behaviour is assumed: values are plain naive strings, the driver wrapper binds their types.
 */
export type SourceWindowKind = 'DATE' | 'DATETIME2'
export interface SourceWindow {
  kind: SourceWindowKind
  from: string
  to: string
}

export function buildSourceWindow(from: Date, to: Date, zone: string, dateColumnKind: 'DATE' | 'DATETIME'): SourceWindow {
  if (dateColumnKind === 'DATE') return { kind: 'DATE', from: localDateString(from, zone), to: localDateString(to, zone, 1) }
  return { kind: 'DATETIME2', from: localDateTimeString(from, zone), to: localDateTimeString(to, zone) }
}
