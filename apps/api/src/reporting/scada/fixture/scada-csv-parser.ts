import path from 'node:path'
import type { DataQuality, ScadaFixtureSourceManifest, ScadaNormalizedRecord } from './scada-fixture.types'

export class ScadaCsvParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScadaCsvParseError'
  }
}

/**
 * Path traversal protection: ensures target path stays strictly within the allowed root directory.
 */
export function validateAndResolvePath(relativePath: string, rootDir: string): string {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new ScadaCsvParseError('Invalid or empty file path argument')
  }

  // Reject explicit path traversal sequences
  if (relativePath.includes('..') || relativePath.includes('\0')) {
    throw new ScadaCsvParseError('Path traversal sequence detected')
  }

  const resolvedRoot = path.resolve(rootDir)
  const resolvedTarget = path.resolve(resolvedRoot, relativePath)

  if (!resolvedTarget.startsWith(resolvedRoot)) {
    throw new ScadaCsvParseError(`Target path escapes root directory: ${relativePath}`)
  }

  return resolvedTarget
}

/**
 * Normalizes date (DD.MM.YYYY or YYYY-MM-DD) and time (HH:mm:ss) string pair into UTC ISO 8601 string.
 */
export function normalizeDateTime(dateStr: string, timeStr: string): string {
  const dTrim = (dateStr || '').trim()
  const tTrim = (timeStr || '').trim()

  if (!dTrim || !tTrim) {
    throw new ScadaCsvParseError('Date or time value is missing')
  }

  let year: number
  let month: number
  let day: number

  if (dTrim.includes('.')) {
    const parts = dTrim.split('.')
    if (parts.length !== 3) {
      throw new ScadaCsvParseError('Invalid date format')
    }
    day = parseInt(parts[0]!, 10)
    month = parseInt(parts[1]!, 10)
    year = parseInt(parts[2]!, 10)
  } else if (dTrim.includes('-')) {
    const parts = dTrim.split('-')
    if (parts.length !== 3) {
      throw new ScadaCsvParseError('Invalid date format')
    }
    year = parseInt(parts[0]!, 10)
    month = parseInt(parts[1]!, 10)
    day = parseInt(parts[2]!, 10)
  } else {
    throw new ScadaCsvParseError('Invalid date separator')
  }

  const timeParts = tTrim.split(':')
  if (timeParts.length < 2 || timeParts.length > 3) {
    throw new ScadaCsvParseError('Invalid time format')
  }

  const hours = parseInt(timeParts[0]!, 10)
  const minutes = parseInt(timeParts[1]!, 10)
  const seconds = timeParts.length === 3 ? parseInt(timeParts[2]!, 10) : 0

  if (
    Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day) ||
    Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds) ||
    month < 1 || month > 12 || day < 1 || day > 31 ||
    hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59
  ) {
    throw new ScadaCsvParseError('Date or time out of range')
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}.000Z`
}

/**
 * Parses SCADA CSV snapshot content using semicolon `;` delimiter and UTF-8 encoding.
 * Fail-closed: throws ScadaCsvParseError on any missing column, delimiter mismatch, or bad row.
 * NEVER logs raw CSV row content.
 */
export function parseScadaCsvContent(
  content: string,
  sourceManifest: ScadaFixtureSourceManifest
): ScadaNormalizedRecord[] {
  if (!content || typeof content !== 'string') {
    throw new ScadaCsvParseError('CSV content is empty or invalid string')
  }

  // Handle CRLF and LF line breaks
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0)
  if (lines.length === 0) {
    throw new ScadaCsvParseError('CSV file has no content lines')
  }

  const headerLine = lines[0]!
  if (!headerLine.includes(';')) {
    throw new ScadaCsvParseError(`Invalid CSV header delimiter: expected semicolon ';' in source '${sourceManifest.sourceKey}'`)
  }

  const headers = headerLine.split(';').map(h => h.trim())
  if (headers.length !== sourceManifest.columnCount) {
    throw new ScadaCsvParseError(
      `Header column count mismatch for '${sourceManifest.sourceKey}': expected ${sourceManifest.columnCount}, got ${headers.length}`
    )
  }

  const idColIndex = headers.indexOf(sourceManifest.idColumn)
  const dateColIndex = headers.indexOf(sourceManifest.dateColumn)
  const timeColIndex = headers.indexOf(sourceManifest.timeColumn)

  if (idColIndex === -1) {
    throw new ScadaCsvParseError(`Missing idColumn '${sourceManifest.idColumn}' in header for '${sourceManifest.sourceKey}'`)
  }
  if (dateColIndex === -1) {
    throw new ScadaCsvParseError(`Missing dateColumn '${sourceManifest.dateColumn}' in header for '${sourceManifest.sourceKey}'`)
  }
  if (timeColIndex === -1) {
    throw new ScadaCsvParseError(`Missing timeColumn '${sourceManifest.timeColumn}' in header for '${sourceManifest.sourceKey}'`)
  }

  const measurementIndices: Array<{ index: number; name: string }> = []
  for (let i = 0; i < headers.length; i += 1) {
    if (i !== idColIndex && i !== dateColIndex && i !== timeColIndex) {
      measurementIndices.push({ index: i, name: headers[i]! })
    }
  }

  const records: ScadaNormalizedRecord[] = []

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx += 1) {
    const rawLine = lines[lineIdx]!
    const fields = rawLine.split(';')

    if (fields.length !== headers.length) {
      throw new ScadaCsvParseError(
        `Inconsistent column count at row ${lineIdx} for source '${sourceManifest.sourceKey}': expected ${headers.length}, got ${fields.length}`
      )
    }

    const idVal = fields[idColIndex]!.trim()
    if (!idVal) {
      throw new ScadaCsvParseError(`Missing ID value at row ${lineIdx} for source '${sourceManifest.sourceKey}'`)
    }

    const dateVal = fields[dateColIndex]!.trim()
    const timeVal = fields[timeColIndex]!.trim()

    let occurredAt: string
    try {
      occurredAt = normalizeDateTime(dateVal, timeVal)
    } catch {
      throw new ScadaCsvParseError(`Invalid date/time at row ${lineIdx} for source '${sourceManifest.sourceKey}'`)
    }

    for (const meas of measurementIndices) {
      const fieldVal = fields[meas.index]!.trim()
      let rawValue: number | null = null
      let dataQuality: DataQuality = 'VALID'

      if (fieldVal === '' || fieldVal === undefined) {
        // Q-W509: missing data is NOT silently turned to 0
        rawValue = null
        dataQuality = 'MISSING'
      } else {
        const normalizedNumberStr = fieldVal.replace(',', '.')
        const parsed = Number(normalizedNumberStr)
        if (Number.isNaN(parsed)) {
          throw new ScadaCsvParseError(`Malformed numeric value at row ${lineIdx}, column '${meas.name}'`)
        }
        rawValue = parsed
        dataQuality = 'VALID'
      }

      records.push({
        recordId: `${sourceManifest.sourceKey}:${idVal}:${meas.name}`,
        occurredAt,
        seriesKey: meas.name,
        rawValue,
        valueType: 'MEASUREMENT',
        sourceCatalogId: sourceManifest.catalogId,
        dataQuality,
        developmentFixture: true,
      })
    }
  }

  return records
}
