import type { LocalDateTimeParts } from '../time/scada-source-time'

export { ambiguousCandidates, gapUncertainRange, localToUtc, localToUtcWithFold, zoneOffsetMs, type DstResolution, type LocalDateTimeParts } from '../time/scada-source-time'

export interface QueryWindow {
  startAt: Date
  endAt: Date
  bufferEndAt: Date
}

/** Half-open windows: [startAt, endAt) is the user range, [endAt, bufferEndAt) the forward-read buffer. */
export function buildWindow(startAt: Date, endAt: Date, forwardBufferMs: number): QueryWindow {
  return { startAt: new Date(startAt.getTime()), endAt: new Date(endAt.getTime()), bufferEndAt: new Date(endAt.getTime() + forwardBufferMs) }
}

export function isValidBuffer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

const isIntString = (v: string) => /^\d+$/.test(v)

/** Parses the date part of a source value (`Date` UTC fields, `YYYY-MM-DD`, or `D.M.YYYY`). */
export function parseSourceDate(value: unknown): { year: number; month: number; day: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() }
  if (typeof value !== 'string') return null
  const text = value.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (m) return validDate(+m[1]!, +m[2]!, +m[3]!)
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text)
  if (m && isIntString(m[1]!)) return validDate(+m[3]!, +m[2]!, +m[1]!)
  return null
}

/** Parses the time part (`Date` UTC fields or `HH:mm[:ss[.fff]]`). */
export function parseSourceTime(value: unknown): { hour: number; minute: number; second: number; millisecond: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { hour: value.getUTCHours(), minute: value.getUTCMinutes(), second: value.getUTCSeconds(), millisecond: value.getUTCMilliseconds() }
  if (typeof value !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value.trim())
  if (!m) return null
  const [hour, minute, second] = [+m[1]!, +m[2]!, m[3] ? +m[3] : 0]
  if (hour > 23 || minute > 59 || second > 59) return null
  return { hour, minute, second, millisecond: m[4] ? Number(m[4].padEnd(3, '0')) : 0 }
}

/** A single DATETIME column: `Date` UTC fields or `YYYY-MM-DD[ T]HH:mm[:ss[.fff]]` (no zone suffix — naive by definition). */
export function parseSourceDateTime(value: unknown): (LocalDateTimeParts & { millisecond: number }) | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate(), hour: value.getUTCHours(), minute: value.getUTCMinutes(), second: value.getUTCSeconds(), millisecond: value.getUTCMilliseconds() }
  }
  if (typeof value !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})[ T](.+)$/.exec(value.trim())
  if (!m) return null
  const d = parseSourceDate(m[1])
  const t = parseSourceTime(m[2])
  return d && t ? { ...d, ...t } : null
}

function validDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const probe = new Date(Date.UTC(year, month - 1, day))
  return probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day ? { year, month, day } : null
}
