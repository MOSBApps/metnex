import { assertMappableTenant } from '../catalog/tenant-guards'
import type { PresetCaller, ScadaPreset } from './scada-preset.contract'

const CREDENTIAL_KEY = /(passw|pwd|secret|token|hash|salt|credential|api[_-]?key|private[_-]?key|authorization|cookie|connection|connstr)/i
const PHYSICAL_KEY = /(^|[_-])(schema|database|db|table|sql|query|expression|ast|host|server|catalog(name)?|physical)([_-]|$)|schemaName|databaseName|tableName|physicalName|connectionString|dbName/i

/** Keys that must NEVER exist in a preset or a plan (physical source info, credentials, executable content). */
export function isForbiddenKey(key: string): boolean {
  return CREDENTIAL_KEY.test(key) || PHYSICAL_KEY.test(key)
}

/** Recursive defensive scan of an object (used on the produced plan): returns the first forbidden key path or null. */
export function findForbiddenKey(value: unknown, path = ''): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = findForbiddenKey(value[i], `${path}[${i}]`)
      if (hit) return hit
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isForbiddenKey(k)) return `${path}.${k}`
      const hit = findForbiddenKey(v, `${path}.${k}`)
      if (hit) return hit
    }
  }
  return null
}

/** A connection-string-like fragment in a free text (name / description / series key) is refused. */
export const CONNECTION_FRAGMENT = /(server|data source|initial catalog|user id|uid|pwd|password)\s*=/i

/**
 * Who may USE a preset. Fail-closed:
 *  - the caller's tenant must be resolved, ACTIVE, not PLATFORM_ROOT, not the excluded organisation (shared guard) and inside
 *    the resolved data scope;
 *  - the preset's customer root must equal the caller's root (another root never resolves it);
 *  - PRIVATE: only the active owner; TENANT_SHARED: any active user of the same root.
 * A refusal never says WHY (no probing): the caller only learns PRESET_SCOPE_BLOCKED.
 */
export function canUsePreset(preset: Pick<ScadaPreset, 'customerRootTenantId' | 'scope' | 'ownerUserId'>, caller: PresetCaller): boolean {
  const scope = caller?.scope
  if (!scope || typeof scope.customerRootTenantId !== 'string' || !Array.isArray(scope.dataScopeTenantIds)) return false
  if (preset.customerRootTenantId !== scope.customerRootTenantId) return false
  if (!caller.tenant || !scope.dataScopeTenantIds.includes(caller.tenant.id)) return false
  try {
    assertMappableTenant(caller.tenant)
  } catch {
    return false
  }
  if (caller.userActive !== true || typeof caller.userId !== 'string' || caller.userId === '') return false
  if (preset.scope === 'PRIVATE') return preset.ownerUserId !== null && preset.ownerUserId === caller.userId
  return preset.scope === 'TENANT_SHARED'
}
