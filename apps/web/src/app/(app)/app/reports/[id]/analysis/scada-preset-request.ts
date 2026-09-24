import type { CatalogSelection, CatalogSource, ScadaCatalog } from './scada-catalog.types'
import { PROBLEM_MESSAGE, resolveWallRange, resolveSelection, wallBounds } from './scada-catalog-selection'
import { buildSeriesMapping, MAPPING_MESSAGE } from './scada-preset-hydration'

/**
 * TASK-027.59-R1 — the body of `POST …/analysis/presets`, built from the analysis form's CURRENT state. Only the plan is sent: no tenant,
 * role, permission, status, version, owner or creator (the server generates them) and no expression. An empty or invalid plan is never sent.
 */
export interface PresetDraft {
  name: string
  description: string
  scope: 'PRIVATE' | 'TENANT_SHARED'
}

export interface PresetFormState {
  selection: CatalogSelection
  catalog: ScadaCatalog
  statistics: string[]
  virtualIds: readonly string[]
  comparison: { mode: 'NONE' | 'PERIOD' | 'SOURCE'; comparisonStartWall: string; comparisonEndWall: string; rightSourceCatalogId: string; mapping: Readonly<Record<string, string>> }
}

export const PRESET_PROBLEM_MESSAGE = { NAME: 'Preset için bir ad girin.', STATISTICS: 'En az bir istatistik seçin.' } as const

export function buildPresetRequest(draft: PresetDraft, form: PresetFormState): { ok: true; body: Record<string, unknown> } | { ok: false; message: string } {
  const name = draft.name.trim()
  if (name === '') return { ok: false, message: PRESET_PROBLEM_MESSAGE.NAME }
  const left: CatalogSource | null = form.catalog.sources.find(s => s.catalogId === form.selection.sourceCatalogId) ?? null
  const resolved = resolveSelection(form.selection, left)
  if (!resolved.ok) return { ok: false, message: PROBLEM_MESSAGE[resolved.problem] }
  if (form.statistics.length === 0) return { ok: false, message: PRESET_PROBLEM_MESSAGE.STATISTICS }
  const base = {
    name,
    ...(draft.description.trim() !== '' ? { description: draft.description.trim() } : {}),
    scope: draft.scope,
    statistics: [...form.statistics],
    timeRange: { startAt: resolved.startAt, endAt: resolved.endAt },
    bucketInterval: form.selection.interval,
    timezone: resolved.timezone,
  }
  const c = form.comparison
  if (c.mode === 'SOURCE') {
    const right = form.catalog.sources.find(s => s.catalogId === c.rightSourceCatalogId) ?? null
    const mapping = buildSeriesMapping(form.selection.seriesKeys, right, c.mapping)
    if (!mapping.ok) return { ok: false, message: MAPPING_MESSAGE[mapping.problem] }
    return { ok: true, body: { ...base, comparison: { mode: 'SOURCE', leftSourceCatalogId: form.selection.sourceCatalogId, rightSourceCatalogId: c.rightSourceCatalogId, seriesMapping: mapping.pairs } } }
  }
  const plan = { ...base, sourceCatalogIds: [form.selection.sourceCatalogId], seriesKeys: [...form.selection.seriesKeys], ...(form.virtualIds.length > 0 ? { virtualColumns: form.virtualIds.map(virtualColumnId => ({ virtualColumnId })) } : {}) }
  if (c.mode === 'PERIOD') {
    const range = resolveWallRange(c.comparisonStartWall, c.comparisonEndWall, form.selection.interval, resolved.timezone, left ? wallBounds(left) : null)
    if (!range.ok) return { ok: false, message: PROBLEM_MESSAGE[range.problem] }
    return { ok: true, body: { ...plan, comparison: { mode: 'PERIOD', comparisonRange: { startAt: range.startAt, endAt: range.endAt } } } }
  }
  return { ok: true, body: { ...plan, comparison: { mode: 'NONE' } } }
}
