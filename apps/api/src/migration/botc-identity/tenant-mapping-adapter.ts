import type { ApprovedTenantAssignmentEntry } from './types'

/**
 * Read-only port for the separately-approved user->tenant mapping table (Q-M06 closure — the
 * table is external and approved by a human process, never derived from `Sirket` or any other
 * BOTC field). Mirrors `BotcIdentitySourceAdapter`'s shape (source-adapter.ts) so both integration
 * boundaries follow the same pattern. Only an in-memory implementation exists in this module — a
 * real adapter (e.g. reading from a reviewed spreadsheet/admin table) is out of scope here.
 */
export interface ApprovedTenantMappingAdapter {
  readMappingTable(): Promise<readonly ApprovedTenantAssignmentEntry[]>
}

export class InMemoryApprovedTenantMappingAdapter implements ApprovedTenantMappingAdapter {
  constructor(private readonly table: readonly ApprovedTenantAssignmentEntry[]) {}

  async readMappingTable(): Promise<readonly ApprovedTenantAssignmentEntry[]> {
    return this.table
  }
}
