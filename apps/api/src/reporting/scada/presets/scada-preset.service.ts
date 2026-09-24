import { assertMappableTenant } from '../catalog/tenant-guards'
import { resolvePreset } from './scada-preset-resolver'
import { checkAppendOnly } from './scada-preset-versioning'
import { validatePreset } from './scada-preset.validator'
import type { PresetAuditPort, PresetAuthorizationPort, PresetCaller, PresetErrorCode, PresetLimits, PresetResolveRequest, PresetResolveResult, ScadaPreset } from './scada-preset.contract'

/**
 * SCADA preset core (TASK-027.71). PURE: no persistence, no permission catalogue, no logging, deterministic, never mutates
 * its input. `authorization` (who may SHARE) and `audit` are PORTS only: no adapter, no permission code (Q-W517 open) and no
 * audit action / entity name (Q-W519 open) exist here. Audit is best-effort and never changes an outcome.
 */
export class ScadaPresetService {
  constructor(
    private readonly authorization?: PresetAuthorizationPort,
    private readonly audit?: PresetAuditPort,
  ) {}

  validate(input: unknown, limits: PresetLimits) {
    return validatePreset(input, limits)
  }

  /** Append-only check for storing a version (nothing is written here). */
  checkAppendOnly(stored: readonly ScadaPreset[], incoming: ScadaPreset) {
    return checkAppendOnly(stored, incoming)
  }

  async resolve(req: PresetResolveRequest): Promise<PresetResolveResult> {
    const result = resolvePreset(req)
    await this.record(req?.caller, req?.presetVersions?.[0], result.ok ? result.plan.presetVersion : null, result.ok ? 'OK' : result.code)
    return result
  }

  /**
   * May this caller SHARE (create/activate as TENANT_SHARED)? Fail-closed: no port, a port that says no, or a port that fails
   * ⇒ refused. A PRIVATE preset needs no sharing right. The decision itself is the port's — no permission is invented here.
   */
  async authorizeShare(caller: PresetCaller, preset: Pick<ScadaPreset, 'scope' | 'customerRootTenantId'>): Promise<{ ok: true } | { ok: false; code: PresetErrorCode }> {
    if (preset.scope === 'PRIVATE') return { ok: true }
    if (preset.scope !== 'TENANT_SHARED') return { ok: false, code: 'PRESET_SCOPE_INVALID' }
    try {
      if (!caller?.scope || preset.customerRootTenantId !== caller.scope.customerRootTenantId || !caller.tenant || !caller.scope.dataScopeTenantIds.includes(caller.tenant.id) || caller.userActive !== true) return { ok: false, code: 'PRESET_SCOPE_BLOCKED' }
      assertMappableTenant(caller.tenant)
      if (!this.authorization) return { ok: false, code: 'PRESET_SCOPE_BLOCKED' }
      return (await this.authorization.canSharePreset({ userId: caller.userId, customerRootTenantId: caller.scope.customerRootTenantId })) === true ? { ok: true } : { ok: false, code: 'PRESET_SCOPE_BLOCKED' }
    } catch {
      return { ok: false, code: 'PRESET_SCOPE_BLOCKED' }
    }
  }

  private async record(caller: PresetCaller | undefined, head: unknown, version: number | null, reason: PresetErrorCode | 'OK'): Promise<void> {
    if (!this.audit) return
    const h = (head && typeof head === 'object' ? head : {}) as Record<string, unknown>
    try {
      await this.audit.record({
        presetId: typeof h['presetId'] === 'string' ? h['presetId'] : '',
        presetVersion: version,
        customerRootTenantId: typeof caller?.scope?.customerRootTenantId === 'string' ? caller.scope.customerRootTenantId : '',
        actorUserId: typeof caller?.userId === 'string' ? caller.userId : '',
        scope: h['scope'] === 'PRIVATE' || h['scope'] === 'TENANT_SHARED' ? h['scope'] : null,
        result: reason === 'OK' ? 'SUCCEEDED' : reason === 'PRESET_SCOPE_BLOCKED' || reason === 'PRESET_NOT_ACTIVE' ? 'DENIED' : 'FAILED',
        reasonCode: reason,
      })
    } catch {
      // best effort: the outcome never depends on the audit port
    }
  }
}
