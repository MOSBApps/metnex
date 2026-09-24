import type { ScadaPreset } from '../presets/scada-preset.contract'
import type { ScadaPresetManagementPort } from './scada-api.contract'

/**
 * TASK-027.59-R1 — DEVELOPMENT-ONLY in-memory preset store. Registered by `scadaApiProviders()` ONLY behind the four development
 * gates (development + fixture + scope bridge + valid zone); it does not exist anywhere else. It persists NOTHING (no PostgreSQL,
 * no file, no cache): an API restart empties it. Presets hold only safe references (ids, series keys, virtual column id + version) —
 * never an expression. Rows are keyed by customer ROOT (another root's presets are unreachable), versions are server generated,
 * inputs / outputs are deep copies and a preset is never rewritten or deleted.
 */
export class DevPresetStore implements ScadaPresetManagementPort {
  private readonly byRoot = new Map<string, ScadaPreset[]>()
  private sequence = 0

  async listPresetVersions(customerRootTenantId: string): Promise<readonly ScadaPreset[]> {
    return structuredClone(this.byRoot.get(customerRootTenantId) ?? [])
  }

  nextIdentity(): { presetId: string; version: number } {
    this.sequence += 1
    return { presetId: `pr-${this.sequence}`, version: 1 }
  }

  append(preset: ScadaPreset): void {
    const rows = this.byRoot.get(preset.customerRootTenantId) ?? []
    if (rows.some(r => r.presetId === preset.presetId && r.version === preset.version)) throw new Error('IDENTITY_CONFLICT')
    this.byRoot.set(preset.customerRootTenantId, [...rows, structuredClone(preset)])
  }
}
