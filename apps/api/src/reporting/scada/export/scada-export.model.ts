import type { AnalysisPlan } from '../presets/scada-preset.contract'
import type { ProjectedAnalysis, ProjectedComparison } from '../api/scada-api.projection'
import type { ExportAnalysisRow, ExportComparisonRow, ExportFilters, ExportQualityRow, ExportStatisticRow, ScadaExportModel } from './scada-export.contract'
import { UNIT_UNSPECIFIED_LABEL } from './scada-export.contract'

export interface ExportMeta {
  artifactCode: string
  title: string
  generatedAt: string
  developmentLabel: string | null
  /** catalogId → display name. The opaque catalog id itself is never exported. */
  sourceNames: ReadonlyMap<string, string>
  plan: Pick<AnalysisPlan, 'bucketInterval' | 'timezone' | 'timeRange' | 'statistics' | 'filters' | 'presetId' | 'presetVersion' | 'comparison'>
}

export const displayUnit = (unit: unknown): string => (typeof unit === 'string' && unit.trim() !== '' ? unit : UNIT_UNSPECIFIED_LABEL)

function filtersOf(meta: ExportMeta, sourceIds: readonly string[]): ExportFilters {
  const names = [...new Set(sourceIds.map(id => meta.sourceNames.get(id) ?? '').filter(n => n !== ''))].sort()
  const cmp = meta.plan.comparison
  return {
    interval: meta.plan.bucketInterval,
    timezone: meta.plan.timezone,
    range: { startAt: meta.plan.timeRange.startAt, endAt: meta.plan.timeRange.endAt },
    comparisonRange: cmp.mode === 'PERIOD' ? { startAt: cmp.comparisonRange.startAt, endAt: cmp.comparisonRange.endAt } : null,
    qualityStates: [...meta.plan.filters.qualityStates],
    onlyAnalysisAllowed: meta.plan.filters.onlyAnalysisAllowed,
    statistics: [...meta.plan.statistics],
    preset: meta.plan.presetId === 'adhoc' ? null : { presetId: meta.plan.presetId, presetVersion: meta.plan.presetVersion },
    sourceNames: names,
  }
}

export function buildAnalysisModel(result: ProjectedAnalysis, meta: ExportMeta): ScadaExportModel {
  const nameOf = (id: string) => meta.sourceNames.get(id) ?? ''
  const rows: ExportAnalysisRow[] = []
  const statistics: ExportStatisticRow[] = []
  const quality: ExportQualityRow[] = []
  for (const s of result.series) {
    const virtualColumnId = s.virtual?.virtualColumnId ?? null
    const virtualColumnVersions = s.virtual ? [...s.virtual.versions] : []
    for (const p of s.points) {
      rows.push({
        t: p.t,
        localWallTime: p.localWallTime,
        seriesLabel: s.label,
        sourceName: nameOf(s.sourceCatalogId),
        value: p.value,
        unit: displayUnit(s.unit),
        valueType: s.valueType,
        quality: p.quality,
        qualityFlags: [...p.qualityFlags],
        isComplete: p.isComplete,
        analysisAllowed: s.analysisAllowed,
        virtualColumnId,
        virtualColumnVersions,
      })
    }
    const { status, ...rest } = s.statistics
    statistics.push({
      seriesLabel: s.label,
      sourceName: nameOf(s.sourceCatalogId),
      unit: displayUnit(s.unit),
      valueType: s.valueType,
      status: String(status),
      virtualColumnId,
      virtualColumnVersions,
      values: Object.keys(rest).map(name => ({ name, value: typeof rest[name] === 'number' ? (rest[name] as number) : null })),
    })
    const q = s.qualitySummary
    quality.push({
      seriesLabel: s.label,
      sourceName: nameOf(s.sourceCatalogId),
      status: s.status,
      analysisAllowed: s.analysisAllowed,
      highestSeverity: q.highestSeverity,
      totalBuckets: q.totalBuckets,
      validBuckets: q.validBuckets,
      missingValues: q.missingValues,
      invalidValues: q.invalidValues,
      counterResetUnresolved: q.counterResetUnresolved,
      dstAmbiguous: q.dstAmbiguous,
      dstNonexistent: q.dstNonexistent,
      incompleteBuckets: q.incompleteBuckets,
      codes: [...s.codes],
      virtualColumnId,
      virtualColumnVersions,
    })
  }

  const warnings: string[] = []
  if (result.status === 'PARTIAL') warnings.push('Kısmi sonuç: bazı seriler veya kaynaklar eksik, dışlanmış ya da tamamlanmamış.')
  if (result.excluded.length > 0) warnings.push(`${result.excluded.length} seri sonuç dışında bırakıldı.`)
  if (result.virtualColumnFailures.length > 0) warnings.push(`${result.virtualColumnFailures.length} sanal kolon hesaplanamadı.`)
  if (rows.some(r => r.quality !== 'VALID' || !r.isComplete)) warnings.push('Kalite uyarısı: bazı kovalar eksik, geçersiz veya tamamlanmamış; kalite alanlarına bakın.')
  if (result.series.some(s => !s.analysisAllowed)) warnings.push('Bazı seriler için analiz izni yok.')

  return {
    kind: 'ANALYSIS',
    artifactCode: meta.artifactCode,
    title: meta.title,
    generatedAt: meta.generatedAt,
    developmentLabel: meta.developmentLabel,
    status: result.status,
    code: result.code,
    warnings,
    filters: filtersOf(meta, result.series.map(s => s.sourceCatalogId)),
    analysis: { rows, statistics, quality },
    comparison: null,
  }
}

export function buildComparisonModel(result: ProjectedComparison, meta: ExportMeta, sourceIds: readonly string[]): ScadaExportModel {
  const rows: ExportComparisonRow[] = result.rows.map(r => ({
    t: r.t,
    comparisonT: r.comparisonT,
    seriesLabel: r.seriesLabel,
    comparisonSeriesLabel: r.comparisonSeriesLabel,
    sourceLabel: r.sourceLabel,
    comparisonSourceLabel: r.comparisonSourceLabel,
    baseline: r.baseline,
    comparison: r.comparison,
    absoluteDelta: r.absoluteDelta,
    percentageDelta: r.percentageDelta,
    quality: String(r.quality),
    status: String(r.status),
    reasonCode: r.reasonCode === undefined || r.reasonCode === null ? null : String(r.reasonCode),
  }))
  const warnings: string[] = []
  if (result.comparability !== 'COMPARABLE') warnings.push(`Karşılaştırılabilirlik: ${result.comparability}.`)
  if (rows.some(r => r.status !== 'COMPARABLE')) warnings.push('Bazı karşılaştırma satırları hesaplanamadı; durum ve neden alanlarına bakın.')
  if (result.unmatchedSeries.length > 0) warnings.push(`${result.unmatchedSeries.length} seri eşleştirilemedi.`)
  if (rows.some(r => r.quality !== 'VALID')) warnings.push('Kalite uyarısı: bazı karşılaştırma satırlarında veri kalitesi eksik veya geçersiz.')

  return {
    kind: 'COMPARISON',
    artifactCode: meta.artifactCode,
    title: meta.title,
    generatedAt: meta.generatedAt,
    developmentLabel: meta.developmentLabel,
    status: result.status,
    code: result.code,
    warnings,
    filters: filtersOf(meta, sourceIds),
    analysis: null,
    comparison: {
      mode: result.mode,
      comparability: result.comparability,
      rows,
      unmatched: result.unmatchedSeries.length,
      summary: Object.entries(result.summary as unknown as Record<string, unknown>)
        .filter(([, v]) => v === null || typeof v === 'number' || typeof v === 'string')
        .map(([name, value]) => ({ name, value: value as number | string | null })),
    },
  }
}

/** A result with nothing to export (no rows, or nothing usable) must never be downloaded as a success. */
export function isEmptyModel(model: ScadaExportModel): boolean {
  if (model.status === 'BLOCKED') return true
  const count = model.analysis ? model.analysis.rows.length : model.comparison ? model.comparison.rows.length : 0
  return count === 0
}

export function modelRowCount(model: ScadaExportModel): number {
  return model.analysis ? model.analysis.rows.length : model.comparison ? model.comparison.rows.length : 0
}
