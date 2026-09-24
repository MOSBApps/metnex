import { assertTimeZone } from '../catalog/catalog-rules'
import type { ScadaOutputBucket, ScadaSeriesOutput } from '../series/scada-series.contract'
import { safeLabel } from './comparison-quality'
import { decimalsValid } from './comparison-math'
import type { ComparisonBlockCode, ComparisonOptions, SeriesMappingEntry } from './scada-comparison.contract'

const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v))
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function bucketShapeValid(b: unknown): b is ScadaOutputBucket {
  if (!isObj(b)) return false
  return (
    typeof b['recordId'] === 'string' &&
    (b['bucketStartUtc'] === null || isIso(b['bucketStartUtc'])) &&
    (b['localWallTime'] === null || typeof b['localWallTime'] === 'string') &&
    (b['value'] === null || typeof b['value'] === 'number') &&
    Array.isArray(b['qualityFlags']) &&
    ['VALID', 'MISSING', 'INVALID', 'INCOMPLETE'].includes(b['classification'] as string)
  )
}

export function seriesShapeValid(s: unknown): s is ScadaSeriesOutput {
  if (!isObj(s)) return false
  return (
    typeof s['seriesKey'] === 'string' && s['seriesKey'] !== '' &&
    safeLabel(s['label']) &&
    typeof s['sourceCatalogId'] === 'string' && s['sourceCatalogId'] !== '' &&
    typeof s['customerRootTenantId'] === 'string' &&
    typeof s['analysisAllowed'] === 'boolean' &&
    (s['status'] === 'OK' || s['status'] === 'NO_VALID_DATA' || s['status'] === 'BLOCKED') &&
    Array.isArray(s['codes']) &&
    Array.isArray(s['buckets']) && (s['buckets'] as unknown[]).every(bucketShapeValid)
  )
}

export function mappingShapeValid(m: unknown): m is readonly SeriesMappingEntry[] {
  return m === undefined || (Array.isArray(m) && m.every(e => isObj(e) && isObj(e['baseline']) && isObj(e['comparison']) &&
    typeof (e['baseline'] as Record<string, unknown>)['seriesKey'] === 'string' && typeof (e['baseline'] as Record<string, unknown>)['sourceCatalogId'] === 'string' &&
    typeof (e['comparison'] as Record<string, unknown>)['seriesKey'] === 'string' && typeof (e['comparison'] as Record<string, unknown>)['sourceCatalogId'] === 'string'))
}

export function optionsValid(o: unknown): o is ComparisonOptions | undefined {
  return o === undefined || (isObj(o) && decimalsValid(o['decimals']))
}

export function zoneValid(z: unknown): z is string {
  if (typeof z !== 'string' || z === '') return false
  try {
    assertTimeZone(z)
    return true
  } catch {
    return false
  }
}

/** Tenant gate over the request root and every series: any other root, or a tenant-blocked series, blocks EVERYTHING. */
export function tenantGate(root: string, periodRoots: readonly string[], series: readonly ScadaSeriesOutput[]): ComparisonBlockCode | null {
  if (periodRoots.some(r => r !== root)) return 'TENANT_SCOPE_BLOCKED'
  if (series.some(s => s.customerRootTenantId !== root || s.codes.includes('TENANT_SCOPE_BLOCKED'))) return 'TENANT_SCOPE_BLOCKED'
  return null
}

export { isIso, isObj }
