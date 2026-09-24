import type { RolloverPolicy } from './scada-data-quality.contract'

/**
 * Where roll-over policies come from (catalog-owned; writing them is Q-W516, out of scope). A provider returns
 * EVERY policy record of one series — the resolver decides validity and effectiveness, never the provider.
 */
export interface RolloverPolicyProvider {
  list(catalogId: string, seriesKey: string, valueType: 'INDEX' | 'REAL_VALUE'): readonly RolloverPolicy[]
}

/** In-memory provider for tests / development. Exact (catalogId, seriesKey, valueType) match — no name patterns. */
export class InMemoryRolloverPolicyProvider implements RolloverPolicyProvider {
  private readonly policies: readonly RolloverPolicy[]

  constructor(policies: readonly RolloverPolicy[] = []) {
    this.policies = structuredClone([...policies])
  }

  list(catalogId: string, seriesKey: string, valueType: 'INDEX' | 'REAL_VALUE'): readonly RolloverPolicy[] {
    return structuredClone(this.policies.filter(p => !!p && p.catalogId === catalogId && p.seriesKey === seriesKey && p.valueType === valueType))
  }
}
