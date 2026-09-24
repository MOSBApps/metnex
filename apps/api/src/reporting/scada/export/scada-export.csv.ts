import { analysisTable, comparisonTable, type Cell } from './scada-export.tables'
import type { ScadaExportModel } from './scada-export.contract'
import { csvField, neutraliseFormula } from './spreadsheet-safe'

/** null → empty (never 0); boolean → Evet / Hayır; a real number → its plain decimal text (never neutralised); text → neutralised. */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır'
  return csvField(neutraliseFormula(value))
}

const TAIL_HEADERS = ['Aralık başlangıç (UTC)', 'Aralık bitiş (UTC)', 'Kovalama', 'Zaman dilimi', 'Kalite filtresi', 'Sonuç durumu', 'Veri etiketi']

/** UTF-8 with BOM (Turkish characters open correctly in Excel), CRLF line ends, RFC 4180 quoting; one self-describing table. */
export function buildScadaCsv(model: ScadaExportModel): Buffer {
  const table = model.analysis ? analysisTable(model) : comparisonTable(model.comparison?.rows ?? [])
  const f = model.filters
  const tail: Cell[] = [f.range.startAt, f.range.endAt, f.interval, f.timezone, f.qualityStates.length > 0 ? f.qualityStates.join(';') : 'Tümü', model.status, model.developmentLabel]
  const lines = [[...table.headers, ...TAIL_HEADERS].map(csvCell).join(',')]
  for (const row of table.rows) lines.push([...row, ...tail].map(csvCell).join(','))
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8')
}
