import type { ExportComparisonRow, ExportQualityRow, ExportStatisticRow, ScadaExportModel } from './scada-export.contract'

export type Cell = string | number | boolean | null

export interface Table {
  headers: string[]
  rows: Cell[][]
}

const STATISTIC_LABEL: Readonly<Record<string, string>> = {
  sum: 'Toplam',
  average: 'Ortalama',
  min: 'Min',
  max: 'Maks',
  count: 'Adet',
  validCount: 'Geçerli adet',
  missingCount: 'Eksik adet',
  invalidCount: 'Geçersiz adet',
  incompleteCount: 'Tamamlanmamış adet',
}

const versions = (v: readonly number[]): string | null => (v.length === 0 ? null : v.join(';'))

export function analysisTable(model: ScadaExportModel): Table {
  return {
    headers: ['Zaman (UTC)', 'Yerel zaman', 'Seri', 'Kaynak', 'Değer', 'Birim', 'Değer tipi', 'Kalite', 'Kalite bayrakları', 'Tam', 'Analiz izni', 'Sanal kolon', 'Sanal kolon sürümü'],
    rows: (model.analysis?.rows ?? []).map(r => [r.t, r.localWallTime, r.seriesLabel, r.sourceName, r.value, r.unit, r.valueType, r.quality, r.qualityFlags.join(';'), r.isComplete, r.analysisAllowed, r.virtualColumnId, versions(r.virtualColumnVersions)]),
  }
}

export function statisticsTable(rows: readonly ExportStatisticRow[]): Table {
  const names: string[] = []
  for (const r of rows) for (const v of r.values) if (!names.includes(v.name)) names.push(v.name)
  return {
    headers: ['Seri', 'Kaynak', 'Birim', 'Değer tipi', 'Durum', 'Sanal kolon', 'Sanal kolon sürümü', ...names.map(n => STATISTIC_LABEL[n] ?? n)],
    rows: rows.map(r => [r.seriesLabel, r.sourceName, r.unit, r.valueType, r.status, r.virtualColumnId, versions(r.virtualColumnVersions), ...names.map(n => r.values.find(v => v.name === n)?.value ?? null)]),
  }
}

export function qualityTable(rows: readonly ExportQualityRow[]): Table {
  return {
    headers: ['Seri', 'Kaynak', 'Durum', 'Analiz izni', 'En yüksek önem', 'Toplam kova', 'Geçerli', 'Eksik', 'Geçersiz', 'Sayaç sıfırlama çözülmedi', 'DST belirsiz', 'DST olmayan saat', 'Tamamlanmamış', 'Kodlar', 'Sanal kolon', 'Sanal kolon sürümü'],
    rows: rows.map(r => [r.seriesLabel, r.sourceName, r.status, r.analysisAllowed, r.highestSeverity, r.totalBuckets, r.validBuckets, r.missingValues, r.invalidValues, r.counterResetUnresolved, r.dstAmbiguous, r.dstNonexistent, r.incompleteBuckets, r.codes.join(';'), r.virtualColumnId, versions(r.virtualColumnVersions)]),
  }
}

export function comparisonTable(rows: readonly ExportComparisonRow[]): Table {
  return {
    headers: ['Zaman (UTC)', 'Karşılaştırma zamanı (UTC)', 'Seri', 'Karşılaştırma serisi', 'Kaynak', 'Karşılaştırma kaynağı', 'Temel', 'Karşılaştırma', 'Mutlak fark', 'Yüzde fark', 'Kalite', 'Durum', 'Neden'],
    rows: rows.map(r => [r.t, r.comparisonT, r.seriesLabel, r.comparisonSeriesLabel, r.sourceLabel, r.comparisonSourceLabel, r.baseline, r.comparison, r.absoluteDelta, r.percentageDelta, r.quality, r.status, r.reasonCode]),
  }
}

const yesNo = (v: boolean) => (v ? 'Evet' : 'Hayır')

/** The title / development label / status / warnings / active filters, as label–value pairs (XLSX head block, PDF header, PNG caption). */
export function metaPairs(model: ScadaExportModel): Array<[string, string]> {
  const f = model.filters
  const pairs: Array<[string, string]> = [['Rapor', model.title], ['Kod', model.artifactCode], ['Oluşturma (UTC)', model.generatedAt]]
  if (model.developmentLabel) pairs.push(['Veri etiketi', model.developmentLabel])
  pairs.push(['Sonuç durumu', model.status === 'OK' ? 'Tam' : model.status === 'PARTIAL' ? 'Kısmi sonuç' : 'Engellendi'])
  for (const w of model.warnings) pairs.push(['Uyarı', w])
  pairs.push(['Aralık (UTC)', `${f.range.startAt} – ${f.range.endAt}`])
  if (f.comparisonRange) pairs.push(['Karşılaştırma aralığı (UTC)', `${f.comparisonRange.startAt} – ${f.comparisonRange.endAt}`])
  pairs.push(['Kovalama', f.interval === 'DAILY' ? 'Günlük' : f.interval === 'HOURLY' ? 'Saatlik' : f.interval])
  pairs.push(['Zaman dilimi', f.timezone])
  pairs.push(['Kalite durumu filtresi', f.qualityStates.length > 0 ? f.qualityStates.join(', ') : 'Tümü'])
  pairs.push(['Yalnız analiz izinli', yesNo(f.onlyAnalysisAllowed)])
  if (f.statistics.length > 0) pairs.push(['İstatistikler', f.statistics.join(', ')])
  if (f.sourceNames.length > 0) pairs.push(['Kaynaklar', f.sourceNames.join(', ')])
  if (f.preset) pairs.push(['Preset', `${f.preset.presetId} v${f.preset.presetVersion}`])
  if (model.comparison) pairs.push(['Karşılaştırma', `${model.comparison.mode} · ${model.comparison.comparability}`])
  return pairs
}
