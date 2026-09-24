import { describe, expect, it } from 'vitest'
import type { AnalysisRow } from './chart-data'
import { buildCsv, buildCsvFileName, buildPngFileName, escapeCsvCell, sanitizeFileNameSegment } from './csv-export'

function row(overrides: Partial<AnalysisRow>): AnalysisRow {
  return {
    no: 'ROW-0001',
    label: 'Vardiya Kontrolü',
    occurredAt: '2026-01-05T10:00:00.000Z',
    status: 'COMPLETED',
    quantity: 2,
    unitPrice: 50,
    amount: 100,
    ...overrides,
  }
}

describe('escapeCsvCell', () => {
  it('leaves an ordinary value untouched', () => {
    expect(escapeCsvCell('Vardiya Kontrolü')).toBe('Vardiya Kontrolü')
  })

  it.each([['=SUM(A1:A2)'], ['+1+1'], ['-1+1'], ['@SUM(1)']])(
    'prefixes a CSV-injection-shaped value (%s) with a single quote',
    value => {
      expect(escapeCsvCell(value)).toBe(`'${value}`)
    },
  )

  it('wraps a value containing a comma in double quotes', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
  })

  it('doubles internal double quotes and wraps the value', () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
  })

  it('wraps a value containing a newline', () => {
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('preserves Turkish characters unchanged', () => {
    expect(escapeCsvCell('Şık İşlem Çözümü Öğe Güç')).toBe('Şık İşlem Çözümü Öğe Güç')
  })

  it('stringifies numbers and null/undefined safely', () => {
    expect(escapeCsvCell(42)).toBe('42')
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })
})

describe('buildCsv', () => {
  it('produces a header-only CSV for an empty row list', () => {
    const csv = buildCsv([])
    expect(csv).toBe('No,Tanım,Tarih,Durum,Miktar,Birim Fiyat,Toplam')
  })

  it('includes the header followed by one line per row, in column order', () => {
    const csv = buildCsv([row({})])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('No,Tanım,Tarih,Durum,Miktar,Birim Fiyat,Toplam')
    expect(lines[1]).toContain('ROW-0001')
    expect(lines[1]).toContain('Vardiya Kontrolü')
    expect(lines[1]).toContain('Tamamlandı')
    expect(lines[1]).toContain('2')
    expect(lines[1]).toContain('50')
    expect(lines[1]).toContain('100')
  })

  it('escapes a CSV-injection-shaped label', () => {
    const csv = buildCsv([row({ label: '=cmd|/c calc' })])
    expect(csv.split('\r\n')[1]).toContain("'=cmd|/c calc")
  })

  it('never contains a raw secret/token/password-shaped substring for ordinary fixture rows', () => {
    const csv = buildCsv([row({}), row({ status: 'FAILED', label: 'Kalite Denetimi' })])
    expect(csv).not.toMatch(/secret|token|password|hash|postgres:\/\//i)
  })
})

describe('sanitizeFileNameSegment', () => {
  it('keeps an already-safe segment unchanged', () => {
    expect(sanitizeFileNameSegment('DEMO_OPERATIONS_ANALYSIS')).toBe('DEMO_OPERATIONS_ANALYSIS')
  })

  it('strips path traversal characters', () => {
    expect(sanitizeFileNameSegment('../../etc/passwd')).not.toContain('..')
    expect(sanitizeFileNameSegment('../../etc/passwd')).not.toContain('/')
  })

  it('strips control characters and CR/LF (header-injection-shaped content)', () => {
    const result = sanitizeFileNameSegment('a\r\nContent-Disposition: evil')
    expect(result).not.toMatch(/[\r\n]/)
  })

  it('strips spaces and other unsafe punctuation', () => {
    expect(sanitizeFileNameSegment('Artifact Code!@#$%')).toBe('Artifact_Code')
  })

  it('falls back to "export" when nothing safe remains', () => {
    expect(sanitizeFileNameSegment('///???')).toBe('export')
  })
})

describe('buildCsvFileName / buildPngFileName', () => {
  it('produces a .csv filename containing the sanitized artifact code and a date stamp', () => {
    const name = buildCsvFileName('A1')
    expect(name).toMatch(/^rapor_A1_\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('produces a .png filename containing the sanitized artifact code and a date stamp', () => {
    const name = buildPngFileName('A1')
    expect(name).toMatch(/^rapor_A1_\d{4}-\d{2}-\d{2}\.png$/)
  })

  it('sanitizes a dangerous artifact code before it reaches the filename', () => {
    const name = buildCsvFileName('../../evil\r\nX-Injected: 1')
    expect(name).not.toMatch(/[\r\n]/)
    expect(name).not.toContain('..')
    expect(name).not.toContain('/')
  })
})
