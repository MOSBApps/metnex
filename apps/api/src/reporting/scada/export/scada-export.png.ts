import type { ScadaExportModel } from './scada-export.contract'
import { metaPairs } from './scada-export.tables'

const MAX_CAPTION_LINES = 24
const MAX_LINE = 140

/** Caption drawn above the chart PNG: title · filters · quality / partial warnings · comparison info · virtual series · development label. */
export function buildPngCaptionLines(model: ScadaExportModel): string[] {
  const lines: string[] = [model.title]
  if (model.developmentLabel) lines.push(model.developmentLabel)
  for (const [label, value] of metaPairs(model)) {
    if (label === 'Rapor' || label === 'Kod' || label === 'Veri etiketi') continue
    lines.push(label === 'Uyarı' ? `Uyarı: ${value}` : `${label}: ${value}`)
  }
  const virtual = new Map<string, number[]>()
  for (const r of model.analysis?.rows ?? []) if (r.virtualColumnId) virtual.set(`${r.seriesLabel}\u0000${r.virtualColumnId}`, r.virtualColumnVersions)
  for (const [key, versions] of virtual) lines.push(`Sanal seri: ${key.split('\u0000')[0]} (v${versions.join(';')})`)
  return lines.slice(0, MAX_CAPTION_LINES).map(l => (l.length > MAX_LINE ? `${l.slice(0, MAX_LINE - 1)}…` : l))
}
