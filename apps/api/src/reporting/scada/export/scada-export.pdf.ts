import { EXPORT_NULL_MARK, type ScadaExportModel, type ScadaPdfRow } from './scada-export.contract'
import { analysisTable, comparisonTable, metaPairs, qualityTable, statisticsTable, type Cell } from './scada-export.tables'

const text = (v: Cell | undefined): string => (v === null || v === undefined ? EXPORT_NULL_MARK : typeof v === 'boolean' ? (v ? 'Evet' : 'Hayır') : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : EXPORT_NULL_MARK) : v)

function row(kind: ScadaPdfRow['kind'], cells: readonly string[]): ScadaPdfRow {
  const c = (i: number) => cells[i] ?? ''
  return { kind, c1: c(0), c2: c(1), c3: c(2), c4: c(3), c5: c(4), c6: c(5), c7: c(6), c8: c(7) }
}

function pick<T>(cells: readonly T[], idx: readonly number[]): T[] {
  return idx.map(i => cells[i] as T)
}

/**
 * Rows for the allowlisted Jasper template `scada-analysis-report` (a plain 8-column text table). Order: title · label / status / warnings /
 * active filters · summary (statistics) · quality · data table. Every value is already a whitelisted export-model value.
 */
export function buildScadaPdfRows(model: ScadaExportModel): ScadaPdfRow[] {
  const out: ScadaPdfRow[] = [row('TITLE', [model.title])]
  for (const [label, value] of metaPairs(model)) out.push(row(label === 'Uyarı' ? 'NOTE' : 'META', [label, value]))

  if (model.analysis) {
    const stats = statisticsTable(model.analysis.statistics)
    out.push(row('SECTION', ['Özet (istatistikler)']))
    out.push(row('HEADER', pick(stats.headers, [0, 1, 2, 4, 7, 8, 9, 10])))
    for (const r of stats.rows) out.push(row('DATA', pick(r, [0, 1, 2, 4, 7, 8, 9, 10]).map(text)))
    const quality = qualityTable(model.analysis.quality)
    out.push(row('SECTION', ['Kalite']))
    out.push(row('HEADER', pick(quality.headers, [0, 2, 3, 4, 5, 6, 7, 8])))
    for (const r of quality.rows) out.push(row('DATA', pick(r, [0, 2, 3, 4, 5, 6, 7, 8]).map(text)))
    const data = analysisTable(model)
    out.push(row('SECTION', ['Veri tablosu']))
    out.push(row('HEADER', ['Zaman', 'Seri', 'Kaynak', 'Değer', 'Birim', 'Kalite', 'Kalite bayrakları', 'Tam / Analiz izni']))
    for (const r of data.rows) {
      const seriesLabel = r[11] ? `${text(r[2])} [sanal ${text(r[11])} v${text(r[12])}]` : text(r[2])
      out.push(row('DATA', [text(r[0] ?? r[1]), seriesLabel, text(r[3]), text(r[4]), text(r[5]), text(r[7]), text(r[8]) === '' ? EXPORT_NULL_MARK : text(r[8]), `${text(r[9])} / ${text(r[10])}`]))
    }
  }
  if (model.comparison) {
    const cmp = comparisonTable(model.comparison.rows)
    out.push(row('SECTION', ['Karşılaştırma özeti']))
    for (const s of model.comparison.summary) out.push(row('META', [s.name, text(s.value)]))
    out.push(row('SECTION', ['Karşılaştırma tablosu']))
    out.push(row('HEADER', ['Zaman', 'Seri', 'Temel', 'Karşılaştırma', 'Mutlak fark', 'Yüzde fark', 'Kalite', 'Durum']))
    for (const r of cmp.rows) out.push(row('DATA', [text(r[0]), text(r[2]), text(r[6]), text(r[7]), text(r[8]), text(r[9]), text(r[10]), text(r[11])]))
  }
  return out
}

export function scadaPdfFallbackLines(rows: readonly ScadaPdfRow[]): string[] {
  return rows.map(r => [r.c1, r.c2, r.c3, r.c4, r.c5, r.c6, r.c7, r.c8].filter(c => c !== '').join(' | '))
}
