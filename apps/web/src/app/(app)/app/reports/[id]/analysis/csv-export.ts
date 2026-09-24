import type { AnalysisRow } from './chart-data'

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Tamamlandı',
  PENDING: 'Beklemede',
  FAILED: 'Başarısız',
}

const CSV_INJECTION_PREFIX = /^[=+\-@]/
const NEEDS_QUOTING = /["\r\n,]/

/**
 * CSV injection mitigation (a leading `'` neutralizes `=`/`+`/`-`/`@` as a formula trigger in
 * Excel/Sheets) applied first, then standard RFC 4180 quoting. Applied uniformly to every cell —
 * including a negative amount like "-12.50" — per this task's explicit instruction; this is a
 * known, accepted trade-off (a negative number renders as `'-12.50` in the CSV), not an oversight.
 */
export function escapeCsvCell(raw: unknown): string {
  let value = String(raw ?? '')
  if (CSV_INJECTION_PREFIX.test(value)) value = `'${value}`
  if (NEEDS_QUOTING.test(value)) value = `"${value.replace(/"/g, '""')}"`
  return value
}

const CSV_HEADER = ['No', 'Tanım', 'Tarih', 'Durum', 'Miktar', 'Birim Fiyat', 'Toplam']

/** Builds a CSV string (header + one row per `rows` entry) — header-only when `rows` is empty. */
export function buildCsv(rows: AnalysisRow[]): string {
  const lines = [CSV_HEADER.map(escapeCsvCell).join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.no,
        row.label,
        new Date(row.occurredAt).toLocaleString('tr-TR'),
        STATUS_LABEL[row.status] ?? row.status,
        row.quantity,
        row.unitPrice,
        row.amount,
      ]
        .map(escapeCsvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}

/** Strips everything but a safe filename alphabet — no path separators, no control characters,
 * no header-injection-shaped content (CR/LF), no user-input passthrough. */
export function sanitizeFileNameSegment(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'export'
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

export function buildCsvFileName(artifactCode: string): string {
  return `rapor_${sanitizeFileNameSegment(artifactCode)}_${todayStamp()}.csv`
}

export function buildPngFileName(artifactCode: string): string {
  return `rapor_${sanitizeFileNameSegment(artifactCode)}_${todayStamp()}.png`
}
