import { Inject, Injectable } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'
import { DB, type Db } from '../db/db.module'
import { tenantClosure } from '../db/schema'

export interface NewTenantClosureInput {
  tenantId: string
  parentId: string | null
  customerRootTenantId: string | null
}

@Injectable()
export class TenantClosureService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Writes the self-row plus one ancestor row per existing ancestor of `parentId`, each one
   * depth deeper. Must run inside the same transaction as the tenant's own creation (pass the
   * transaction's Db instance as `tx`). Upserts (ON CONFLICT DO UPDATE), not plain inserts, so
   * re-running seed/bootstrap code paths stays safe — never throws on an already-existing row.
   */
  async createClosureForNewTenant(tx: Db, input: NewTenantClosureInput): Promise<void> {
    const { tenantId, parentId, customerRootTenantId } = input

    await tx
      .insert(tenantClosure)
      .values({ ancestorTenantId: tenantId, descendantTenantId: tenantId, customerRootTenantId, depth: 0 })
      .onConflictDoUpdate({
        target: [tenantClosure.ancestorTenantId, tenantClosure.descendantTenantId],
        set: { customerRootTenantId },
      })

    if (!parentId) return

    const parentAncestorRows = await tx.select().from(tenantClosure).where(eq(tenantClosure.descendantTenantId, parentId))
    for (const row of parentAncestorRows) {
      const depth = row.depth + 1
      await tx
        .insert(tenantClosure)
        .values({ ancestorTenantId: row.ancestorTenantId, descendantTenantId: tenantId, customerRootTenantId, depth })
        .onConflictDoUpdate({
          target: [tenantClosure.ancestorTenantId, tenantClosure.descendantTenantId],
          set: { customerRootTenantId, depth },
        })
    }
  }

  /** All tenant ids in `tenantId`'s own subtree, including itself (the depth-0 self-row). */
  async getDescendantTenantIds(tenantId: string): Promise<string[]> {
    const rows = await this.db
      .select({ descendantTenantId: tenantClosure.descendantTenantId })
      .from(tenantClosure)
      .where(eq(tenantClosure.ancestorTenantId, tenantId))
    return rows.map(row => row.descendantTenantId)
  }

  /** All ancestors of `tenantId`, nearest first, including itself (depth 0) — for settings inheritance. */
  async getAncestorTenantIdsOrdered(tenantId: string): Promise<string[]> {
    const rows = await this.db
      .select({ ancestorTenantId: tenantClosure.ancestorTenantId })
      .from(tenantClosure)
      .where(eq(tenantClosure.descendantTenantId, tenantId))
      .orderBy(asc(tenantClosure.depth))
    return rows.map(row => row.ancestorTenantId)
  }
}
