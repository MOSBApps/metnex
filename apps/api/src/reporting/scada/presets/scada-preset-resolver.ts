import { assertMappableTenant } from '../catalog/tenant-guards'
import { assertTimeZone } from '../catalog/catalog-rules'
import type { ScadaSeriesScope } from '../series/scada-series.contract'
import type { VirtualColumnDefinition } from '../virtual-columns/virtual-column.contract'
import { definitionShapeValid } from '../virtual-columns/virtual-column-validator'
import { canUsePreset, findForbiddenKey } from './scada-preset-security'
import { checkVersionSet, versionAt } from './scada-preset-versioning'
import { presetLimitsValid, validatePreset } from './scada-preset.validator'
import type { AnalysisPlan, AnalysisPlanVirtualColumn, PresetErrorCode, PresetResolveRequest, PresetResolveResult, PresetSourceInfo, ScadaPreset } from './scada-preset.contract'

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const fail = (code: PresetErrorCode): PresetResolveResult => ({ ok: false, code })

function tenantOk(tenant: PresetSourceInfo['tenant'], scope: ScadaSeriesScope): boolean {
  if (!tenant || !scope.dataScopeTenantIds.includes(tenant.id)) return false
  try {
    assertMappableTenant(tenant)
    return true
  } catch {
    return false
  }
}

const zoneOk = (z: unknown): z is string => {
  try {
    assertTimeZone(z)
    return true
  } catch {
    return false
  }
}

const effectiveAt = (d: Pick<VirtualColumnDefinition, 'effectiveFrom' | 'effectiveTo' | 'status'>, ms: number) =>
  d.status === 'ACTIVE' && (!d.effectiveFrom || ms >= Date.parse(d.effectiveFrom)) && (!d.effectiveTo || ms < Date.parse(d.effectiveTo))

/**
 * preset → executable analysis plan. PURE and deterministic. Order (every step fails closed with a static code, and the
 * whole plan is blocked if ANY required reference cannot be resolved):
 *   scope/access → validate → version set → effective version → sources → series → virtual column references →
 *   statistics → comparison → plan (+ a final defensive scan: no physical / credential / expression key can be in it).
 * The access check comes FIRST so that another root's or another user's preset reveals nothing (only PRESET_SCOPE_BLOCKED).
 */
export function resolvePreset(req: PresetResolveRequest): PresetResolveResult {
  try {
    if (!isObj(req) || !isObj(req.caller) || !isObj(req.caller.scope) || !Array.isArray(req.presetVersions) || req.presetVersions.length === 0 || !Array.isArray(req.sources) || !Array.isArray(req.virtualColumnDefinitions)) return fail('PRESET_INVALID')
    if (typeof req.at !== 'string' || Number.isNaN(Date.parse(req.at)) || !presetLimitsValid(req.limits)) return fail('PRESET_INVALID')
    const caller = req.caller
    const scope = caller.scope
    const atMs = Date.parse(req.at)

    // 1) access (tenant root, tenant status, PRIVATE owner) — before anything else can be learned
    const head = req.presetVersions[0] as unknown
    if (!isObj(head) || typeof head['customerRootTenantId'] !== 'string' || (head['scope'] !== 'PRIVATE' && head['scope'] !== 'TENANT_SHARED')) return fail('PRESET_INVALID')
    if (!canUsePreset(head as unknown as ScadaPreset, caller)) return fail('PRESET_SCOPE_BLOCKED')

    // 2) every stored version must be valid (a corrupt version is an ambiguity, never skipped)
    const versions: ScadaPreset[] = []
    for (const v of req.presetVersions) {
      const r = validatePreset(v, req.limits)
      if (!r.ok) return fail(r.code)
      versions.push(r.preset)
    }
    // 3) version set, 4) the ACTIVE version effective now
    const set = checkVersionSet(versions)
    if (!set.ok) return fail(set.code)
    const preset = versionAt(set.active, atMs)
    if (!preset) return fail('PRESET_NOT_ACTIVE')
    if (!canUsePreset(preset, caller)) return fail('PRESET_SCOPE_BLOCKED')
    const root = preset.customerRootTenantId

    // 5) sources: same tenant root, active + verified, mapping resolved, mapped tenant active and inside the data scope
    const infos = new Map<string, PresetSourceInfo>()
    for (const raw of req.sources as readonly unknown[]) {
      if (!isObj(raw) || typeof raw['catalogId'] !== 'string') return fail('PRESET_INVALID')
      const s = raw as unknown as PresetSourceInfo
      if (infos.has(s.catalogId)) return fail('PRESET_SCOPE_BLOCKED') // an ambiguous catalog view is never guessed
      infos.set(s.catalogId, s)
    }
    const chosen: PresetSourceInfo[] = []
    for (const id of [...preset.sourceCatalogIds].sort()) {
      const s = infos.get(id)
      if (!s || s.customerRootTenantId !== root || s.active !== true || s.mappingResolved !== true || !tenantOk(s.tenant, scope)) return fail('PRESET_SCOPE_BLOCKED')
      // the analysis zone is the (verified) zone of every source: nothing is converted silently
      if (!zoneOk(s.sourceTimeZone) || s.sourceTimeZone !== preset.timezone) return fail('PRESET_TIMEZONE_UNVERIFIED')
      chosen.push(s)
    }

    // 6) series: each selected key must be catalog-approved on at least one selected source
    const series: Array<{ sourceCatalogId: string; seriesKey: string }> = []
    for (const key of preset.seriesKeys) {
      const owners = chosen.filter(s => s.seriesKeys.includes(key))
      if (owners.length === 0) return fail('PRESET_INVALID')
      for (const o of owners) series.push({ sourceCatalogId: o.catalogId, seriesKey: key })
    }
    series.sort((a, b) => cmp(a.sourceCatalogId, b.sourceCatalogId) || cmp(a.seriesKey, b.seriesKey))

    // 7) virtual column REFERENCES → the resolved version of each (tenant-scoped, catalog-compatible)
    const planned: AnalysisPlanVirtualColumn[] = []
    for (const ref of [...preset.virtualColumns].sort((a, b) => cmp(a.virtualColumnId, b.virtualColumnId))) {
      const defs = req.virtualColumnDefinitions.filter(d => isObj(d) && d.virtualColumnId === ref.virtualColumnId)
      if (defs.length === 0 || !defs.every(d => definitionShapeValid(d))) return fail('PRESET_VIRTUAL_COLUMN_INVALID')
      if (defs.some(d => d.customerRootTenantId !== root)) return fail('PRESET_SCOPE_BLOCKED') // another tenant's column never resolves
      let found: VirtualColumnDefinition | undefined
      if (ref.version !== undefined) {
        found = defs.find(d => d.version === ref.version)
        if (!found || !effectiveAt(found, atMs)) return fail('PRESET_VIRTUAL_COLUMN_INVALID')
      } else {
        const candidates = defs.filter(d => effectiveAt(d, atMs))
        if (candidates.length === 0) return fail('PRESET_VIRTUAL_COLUMN_INVALID')
        if (candidates.length > 1) return fail('PRESET_VIRTUAL_COLUMN_VERSION_AMBIGUOUS') // never a silent choice
        found = candidates[0]
      }
      const pick = found!
      const source = chosen.find(s => s.catalogId === pick.catalogId)
      if (!source || pick.inputSeriesKeys.some(k => !source.seriesKeys.includes(k)) || source.seriesKeys.includes(pick.seriesKey) || preset.seriesKeys.includes(pick.seriesKey)) return fail('PRESET_VIRTUAL_COLUMN_INVALID')
      planned.push({ virtualColumnId: pick.virtualColumnId, version: pick.version, catalogId: pick.catalogId, seriesKey: pick.seriesKey })
    }
    if (new Set(planned.map(p => p.seriesKey)).size !== planned.length) return fail('PRESET_VIRTUAL_COLUMN_INVALID')

    // 8) comparison must agree with the selected sources
    const cmpCfg = preset.comparison
    if (cmpCfg.mode === 'SOURCE' && (!preset.sourceCatalogIds.includes(cmpCfg.leftSourceCatalogId) || !preset.sourceCatalogIds.includes(cmpCfg.rightSourceCatalogId))) return fail('PRESET_INVALID')

    const plan: AnalysisPlan = {
      presetId: preset.presetId,
      presetVersion: preset.version,
      scope: preset.scope,
      tenantScope: { customerRootTenantId: root, tenantId: scope.tenantId, dataScopeTenantIds: [...scope.dataScopeTenantIds].sort() },
      resolvedAtUtc: new Date(atMs).toISOString(),
      timeRange: { startAt: preset.timeRange.startAt, endAt: preset.timeRange.endAt },
      bucketInterval: preset.bucketInterval,
      timezone: preset.timezone,
      sourceCatalogIds: [...preset.sourceCatalogIds].sort(),
      series,
      virtualColumns: planned,
      statistics: [...preset.statistics].sort(),
      comparison: structuredClone(preset.comparison),
      filters: { qualityStates: [...(preset.filters.qualityStates ?? [])].sort(), onlyAnalysisAllowed: preset.filters.onlyAnalysisAllowed ?? false },
      display: structuredClone(preset.display),
    }
    // defensive: the plan can hold no physical source information, credential or expression key
    if (findForbiddenKey(plan) !== null) return fail('PRESET_INVALID')
    return { ok: true, plan }
  } catch {
    return fail('PRESET_INVALID') // never a raw error
  }
}

// ---------------------------------------------------------------- hand-off to TASK-027.68 / .69 / .70 (pure adapters)

/** The 027.68 request parts a plan fixes (the series inputs themselves come from the query/aggregation chain). */
export function planToSeriesRequestBase(plan: AnalysisPlan): { scope: ScadaSeriesScope; range: { startAt: string; endAt: string }; interval: AnalysisPlan['bucketInterval'] } {
  return { scope: { tenantId: plan.tenantScope.tenantId, customerRootTenantId: plan.tenantScope.customerRootTenantId, dataScopeTenantIds: [...plan.tenantScope.dataScopeTenantIds] }, range: { ...plan.timeRange }, interval: plan.bucketInterval }
}

/** The 027.69 comparison header a plan fixes (periods share interval, zone and root; source mode shares the period). */
export function planToComparisonInputs(plan: AnalysisPlan) {
  const root = plan.tenantScope.customerRootTenantId
  const header = { bucketInterval: plan.bucketInterval, timezone: plan.timezone, customerRootTenantId: root }
  const c = plan.comparison
  if (c.mode === 'PERIOD') return { mode: 'PERIOD' as const, baselinePeriod: { ...header, ...plan.timeRange }, comparisonPeriod: { ...header, ...c.comparisonRange }, seriesMapping: c.seriesMapping ?? [], decimals: c.decimals ?? null }
  if (c.mode === 'SOURCE') return { mode: 'SOURCE' as const, period: { ...plan.timeRange, bucketInterval: plan.bucketInterval, timezone: plan.timezone }, leftSourceCatalogId: c.leftSourceCatalogId, rightSourceCatalogId: c.rightSourceCatalogId, seriesMapping: c.seriesMapping ?? [], decimals: c.decimals ?? null }
  return { mode: 'NONE' as const }
}

/** The exact virtual column versions (from the tenant-scoped store) that 027.70 must evaluate for this plan. */
export function selectPlannedDefinitions(plan: AnalysisPlan, store: readonly VirtualColumnDefinition[]): VirtualColumnDefinition[] {
  const wanted = new Set(plan.virtualColumns.map(v => `${v.virtualColumnId}\u0000${v.version}`))
  return store.filter(d => wanted.has(`${d.virtualColumnId}\u0000${d.version}`) && d.customerRootTenantId === plan.tenantScope.customerRootTenantId)
}
