import { assertTimeZone, isCatalogId } from '../catalog/catalog-rules'
import { CONNECTION_FRAGMENT } from './scada-preset-security'
import {
  PRESET_CHART_TYPES,
  PRESET_SCOPES,
  PRESET_STATISTICS,
  PRESET_STATUSES,
  PRESET_TABLE_SORT_FIELDS,
  type PresetErrorCode,
  type PresetLimits,
  type ScadaPreset,
} from './scada-preset.contract'
import { SCADA_DATA_QUALITY_STATES } from '../quality/scada-data-quality.contract'

class Reject extends Error {
  constructor(readonly code: PresetErrorCode) {
    super(code)
  }
}
const no = (code: PresetErrorCode): never => {
  throw new Reject(code)
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isIso = (v: unknown): v is string => typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v))
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/
const printable = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !CONTROL.test(v) && !CONNECTION_FRAGMENT.test(v)
const posInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0

const TOP_KEYS = ['presetId', 'customerRootTenantId', 'ownerUserId', 'scope', 'name', 'description', 'version', 'status', 'sourceCatalogIds', 'seriesKeys', 'virtualColumns', 'statistics', 'comparison', 'filters', 'timeRange', 'bucketInterval', 'timezone', 'display', 'createdAt', 'updatedAt', 'effectiveFrom', 'effectiveTo']
const PRESET_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const VC_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

/** Every key must be allowlisted: an unknown field (physical DB/schema, credential, expression, code …) is refused. */
function onlyKeys(o: Record<string, unknown>, allowed: readonly string[], code: PresetErrorCode = 'PRESET_UNKNOWN_FIELD'): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) no(code)
}

export function presetLimitsValid(l: unknown): l is PresetLimits {
  if (!isObj(l)) return false
  return ['maxNameLength', 'maxDescriptionLength', 'maxSourceCount', 'maxSeriesCount', 'maxVirtualColumnCount', 'maxPageSize'].every(k => posInt(l[k]))
}

function range(v: unknown): { startAt: string; endAt: string } {
  if (!isObj(v)) return no('PRESET_INVALID_TIME_RANGE')
  onlyKeys(v, ['startAt', 'endAt'])
  if (!isIso(v['startAt']) || !isIso(v['endAt']) || Date.parse(v['startAt']) >= Date.parse(v['endAt'])) no('PRESET_INVALID_TIME_RANGE')
  return { startAt: v['startAt'] as string, endAt: v['endAt'] as string }
}

function mapping(v: unknown): void {
  if (v === undefined) return
  if (!Array.isArray(v)) no('PRESET_INVALID')
  for (const e of v as unknown[]) {
    if (!isObj(e)) return no('PRESET_INVALID')
    onlyKeys(e, ['baseline', 'comparison'])
    for (const side of ['baseline', 'comparison'] as const) {
      const s = e[side]
      if (!isObj(s)) return no('PRESET_INVALID')
      onlyKeys(s, ['sourceCatalogId', 'seriesKey'])
      if (!isCatalogId(s['sourceCatalogId']) || !printable(s['seriesKey'], 128)) no('PRESET_INVALID')
    }
  }
}

/**
 * Strict, fail-closed validation of ONE preset (any status). Throws nothing: returns `{ ok }`. Unknown fields anywhere are
 * refused; the limits come from the caller (missing ⇒ nothing is accepted). The returned preset is a detached, normalised
 * copy (the input is never touched).
 */
export function validatePreset(input: unknown, limits: unknown): { ok: true; preset: ScadaPreset } | { ok: false; code: PresetErrorCode } {
  try {
    if (!presetLimitsValid(limits)) return no('PRESET_INVALID')
    const l = limits
    if (!isObj(input)) return no('PRESET_INVALID')
    onlyKeys(input, TOP_KEYS)
    // scope / tenant / owner
    if (typeof input['customerRootTenantId'] !== 'string' || input['customerRootTenantId'].trim() === '' || input['customerRootTenantId'].length > 128 || CONTROL.test(input['customerRootTenantId'])) no('PRESET_TENANT_REQUIRED')
    if (!(PRESET_SCOPES as readonly string[]).includes(input['scope'] as string)) no('PRESET_SCOPE_INVALID')
    const owner = input['ownerUserId']
    if (input['scope'] === 'PRIVATE' && !(typeof owner === 'string' && owner.trim() !== '' && owner.length <= 128 && !CONTROL.test(owner))) no('PRESET_OWNER_REQUIRED')
    if (owner !== null && owner !== undefined && !(typeof owner === 'string' && owner.length <= 128 && !CONTROL.test(owner))) no('PRESET_INVALID')
    if (typeof input['presetId'] !== 'string' || !PRESET_ID.test(input['presetId'])) no('PRESET_INVALID')
    if (!printable(input['name'], l.maxNameLength)) no('PRESET_INVALID')
    if (input['description'] !== null && input['description'] !== undefined && !printable(input['description'], l.maxDescriptionLength)) no('PRESET_INVALID')
    if (!posInt(input['version']) || !(PRESET_STATUSES as readonly string[]).includes(input['status'] as string)) no('PRESET_INVALID')
    for (const k of ['createdAt', 'updatedAt'] as const) if (!isIso(input[k])) no('PRESET_INVALID')
    for (const k of ['effectiveFrom', 'effectiveTo'] as const) if (input[k] !== null && input[k] !== undefined && !isIso(input[k])) no('PRESET_INVALID')
    if (input['effectiveFrom'] && input['effectiveTo'] && Date.parse(input['effectiveFrom'] as string) >= Date.parse(input['effectiveTo'] as string)) no('PRESET_INVALID')

    // sources / series (duplicates are refused, never merged)
    const sources = input['sourceCatalogIds']
    if (!Array.isArray(sources) || sources.length === 0 || sources.length > l.maxSourceCount || !sources.every(s => isCatalogId(s))) no('PRESET_INVALID')
    if (new Set(sources as string[]).size !== (sources as string[]).length) no('PRESET_DUPLICATE_SOURCE')
    const keys = input['seriesKeys']
    if (!Array.isArray(keys) || keys.length > l.maxSeriesCount || !keys.every(k => printable(k, 128))) no('PRESET_INVALID')
    if (new Set(keys as string[]).size !== (keys as string[]).length) no('PRESET_DUPLICATE_SERIES')

    // virtual column REFERENCES only
    const vcs = input['virtualColumns']
    if (!Array.isArray(vcs) || vcs.length > l.maxVirtualColumnCount) no('PRESET_VIRTUAL_COLUMN_INVALID')
    const vcIds = new Set<string>()
    for (const v of vcs as unknown[]) {
      if (!isObj(v)) return no('PRESET_VIRTUAL_COLUMN_INVALID')
      onlyKeys(v, ['virtualColumnId', 'version'], 'PRESET_VIRTUAL_COLUMN_INVALID') // an expression / AST / SQL field can never be stored
      if (typeof v['virtualColumnId'] !== 'string' || !VC_ID.test(v['virtualColumnId']) || (v['version'] !== undefined && !posInt(v['version']))) no('PRESET_VIRTUAL_COLUMN_INVALID')
      if (vcIds.has(v['virtualColumnId'] as string)) no('PRESET_VIRTUAL_COLUMN_INVALID') // duplicate reference
      vcIds.add(v['virtualColumnId'] as string)
    }
    if ((keys as unknown[]).length + (vcs as unknown[]).length === 0) no('PRESET_INVALID')

    // statistics allowlist
    const stats = input['statistics']
    if (!Array.isArray(stats) || !stats.every(s => (PRESET_STATISTICS as readonly string[]).includes(s as string)) || new Set(stats as string[]).size !== (stats as string[]).length) no('PRESET_INVALID')

    // comparison
    const cmp = input['comparison']
    if (!isObj(cmp)) return no('PRESET_INVALID')
    if (cmp['mode'] === 'NONE') onlyKeys(cmp, ['mode'])
    else if (cmp['mode'] === 'PERIOD') {
      onlyKeys(cmp, ['mode', 'comparisonRange', 'seriesMapping', 'decimals'])
      range(cmp['comparisonRange'])
      mapping(cmp['seriesMapping'])
    } else if (cmp['mode'] === 'SOURCE') {
      onlyKeys(cmp, ['mode', 'leftSourceCatalogId', 'rightSourceCatalogId', 'seriesMapping', 'decimals'])
      if (!isCatalogId(cmp['leftSourceCatalogId']) || !isCatalogId(cmp['rightSourceCatalogId']) || cmp['leftSourceCatalogId'] === cmp['rightSourceCatalogId']) no('PRESET_INVALID')
      mapping(cmp['seriesMapping'])
    } else no('PRESET_INVALID')
    if (cmp['decimals'] !== undefined && cmp['decimals'] !== null && !(typeof cmp['decimals'] === 'number' && Number.isInteger(cmp['decimals']) && cmp['decimals'] >= 0 && cmp['decimals'] <= 12)) no('PRESET_INVALID')

    // filters: only the allowed fields
    const filters = input['filters']
    if (!isObj(filters)) return no('PRESET_INVALID')
    onlyKeys(filters, ['qualityStates', 'onlyAnalysisAllowed'])
    if (filters['qualityStates'] !== undefined && (!Array.isArray(filters['qualityStates']) || !filters['qualityStates'].every(s => (SCADA_DATA_QUALITY_STATES as readonly string[]).includes(s as string)) || new Set(filters['qualityStates'] as string[]).size !== filters['qualityStates'].length)) no('PRESET_INVALID')
    if (filters['onlyAnalysisAllowed'] !== undefined && typeof filters['onlyAnalysisAllowed'] !== 'boolean') no('PRESET_INVALID')

    // time, interval, zone
    range(input['timeRange'])
    if (input['bucketInterval'] !== 'HOURLY' && input['bucketInterval'] !== 'DAILY') no('PRESET_INVALID_INTERVAL')
    try {
      assertTimeZone(input['timezone'])
    } catch {
      no('PRESET_TIMEZONE_UNVERIFIED')
    }

    // display: allowlist symbols and numbers only
    const display = input['display']
    if (!isObj(display)) return no('PRESET_INVALID')
    onlyKeys(display, ['chartType', 'tableOptions'])
    if (!(PRESET_CHART_TYPES as readonly string[]).includes(display['chartType'] as string)) no('PRESET_INVALID')
    const table = display['tableOptions']
    if (table !== undefined) {
      if (!isObj(table)) return no('PRESET_INVALID')
      onlyKeys(table, ['sortBy', 'sortDirection', 'pageSize', 'page'])
      if (table['sortBy'] !== undefined && !(PRESET_TABLE_SORT_FIELDS as readonly string[]).includes(table['sortBy'] as string)) no('PRESET_INVALID')
      if (table['sortDirection'] !== undefined && table['sortDirection'] !== 'ASC' && table['sortDirection'] !== 'DESC') no('PRESET_INVALID')
      if (table['pageSize'] !== undefined && (!posInt(table['pageSize']) || table['pageSize'] > l.maxPageSize)) no('PRESET_INVALID')
      if (table['page'] !== undefined && !posInt(table['page'])) no('PRESET_INVALID')
    }
    return { ok: true, preset: structuredClone({ ...input, description: input['description'] ?? null, ownerUserId: owner ?? null, effectiveFrom: input['effectiveFrom'] ?? null, effectiveTo: input['effectiveTo'] ?? null }) as unknown as ScadaPreset }
  } catch (e) {
    return { ok: false, code: e instanceof Reject ? e.code : 'PRESET_INVALID' } // never a raw error
  }
}
