import type { VirtualColumnDefinition, VirtualColumnStatus } from '../virtual-columns/virtual-column.contract'
import type { ScadaVirtualColumnManagementPort } from './scada-api.contract'

/**
 * TASK-027.71-R1 — DEVELOPMENT-ONLY in-memory virtual column store.
 *
 * Registered by `scadaApiProviders()` ONLY behind the four development gates (development + fixture + scope bridge + valid zone),
 * so it does not exist in production or in any other environment. It persists NOTHING: no PostgreSQL, no file, no cache — the
 * expression texts live only in this process' memory and disappear with it (an API restart empties the store).
 *
 *  - rows are keyed by customer ROOT: another root's columns are unreachable through every method;
 *  - identity = (root, catalogId, seriesKey): a new definition of the same series is a NEW VERSION of the same virtualColumnId;
 *  - versions are strictly monotonic (1, 2, 3 …): `append` refuses anything else (a version is never rewritten or repeated);
 *  - inputs and outputs are deep copies (a caller can never mutate the stored state);
 *  - a column is never deleted (status only: DRAFT | ACTIVE | DISABLED | BLOCKED).
 */
export class DevVirtualColumnStore implements ScadaVirtualColumnManagementPort {
  private readonly byRoot = new Map<string, VirtualColumnDefinition[]>()
  private sequence = 0

  async listDefinitions(customerRootTenantId: string): Promise<readonly VirtualColumnDefinition[]> {
    return structuredClone(this.byRoot.get(customerRootTenantId) ?? [])
  }

  nextIdentity(customerRootTenantId: string, catalogId: string, seriesKey: string): { virtualColumnId: string; version: number } {
    const rows = this.byRoot.get(customerRootTenantId) ?? []
    const existing = rows.find(r => r.catalogId === catalogId && r.seriesKey === seriesKey)
    if (existing) return { virtualColumnId: existing.virtualColumnId, version: Math.max(...rows.filter(r => r.virtualColumnId === existing.virtualColumnId).map(r => r.version)) + 1 }
    this.sequence += 1
    return { virtualColumnId: `vc-${this.sequence}`, version: 1 }
  }

  append(def: VirtualColumnDefinition): void {
    const rows = this.byRoot.get(def.customerRootTenantId) ?? []
    const same = rows.filter(r => r.virtualColumnId === def.virtualColumnId)
    const expected = same.length === 0 ? 1 : Math.max(...same.map(r => r.version)) + 1
    if (def.version !== expected) throw new Error('VERSION_CONFLICT') // static; a version is monotonic and never repeated
    if (same.some(r => r.catalogId !== def.catalogId || r.seriesKey !== def.seriesKey)) throw new Error('IDENTITY_CONFLICT')
    this.byRoot.set(def.customerRootTenantId, [...rows, structuredClone(def)])
  }

  setStatus(customerRootTenantId: string, virtualColumnId: string, version: number, status: VirtualColumnStatus, updatedAt: string): boolean {
    const row = (this.byRoot.get(customerRootTenantId) ?? []).find(r => r.virtualColumnId === virtualColumnId && r.version === version)
    if (!row) return false
    row.status = status
    row.updatedAt = updatedAt
    return true
  }
}
