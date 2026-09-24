import { buildWorkbookXlsx, type WorkbookCell, type WorkbookSheet } from '../../xlsx-writer'
import { EXPORT_NULL_MARK, type ScadaExportModel } from './scada-export.contract'
import { analysisTable, comparisonTable, metaPairs, qualityTable, statisticsTable, type Cell, type Table } from './scada-export.tables'
import { neutraliseFormula } from './spreadsheet-safe'

/** Text is formula-neutralised; a real number stays a numeric cell; a null is the visible "—" (never 0, never a fake value). */
export function xlsxCell(value: Cell): WorkbookCell {
  if (value === null || value === undefined) return EXPORT_NULL_MARK
  if (typeof value === 'number') return Number.isFinite(value) ? value : EXPORT_NULL_MARK
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır'
  return neutraliseFormula(value)
}

function sheetOf(name: string, model: ScadaExportModel, table: Table): WorkbookSheet {
  const head: WorkbookCell[][] = metaPairs(model).map(([label, value]) => [xlsxCell(label), xlsxCell(value)])
  return { name, rows: [...head, [], table.headers.map(xlsxCell), ...table.rows.map(r => r.map(xlsxCell))] }
}

/** Sheets: Analysis · Statistics · Quality (analysis result) — Comparison (comparison result). Every sheet starts with the same active-filter / label block. */
export function buildScadaXlsx(model: ScadaExportModel): Buffer {
  const sheets: WorkbookSheet[] = []
  if (model.analysis) {
    sheets.push(sheetOf('Analysis', model, analysisTable(model)))
    sheets.push(sheetOf('Statistics', model, statisticsTable(model.analysis.statistics)))
    sheets.push(sheetOf('Quality', model, qualityTable(model.analysis.quality)))
  }
  if (model.comparison) sheets.push(sheetOf('Comparison', model, comparisonTable(model.comparison.rows)))
  return buildWorkbookXlsx(sheets)
}
