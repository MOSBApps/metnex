import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { TenantClosureService } from './tenant-closure.service'

describe('TenantClosureService', () => {
  function build() {
    const db = buildMockDb()
    const service = new TenantClosureService(db as never)
    return { service, db }
  }

  it('writes a self-row (depth 0) for a root with no parent', async () => {
    const { service, db } = build()
    const insertChain = chain(undefined)
    db.insert.mockReturnValue(insertChain)

    await service.createClosureForNewTenant(db as never, {
      tenantId: 'root-1',
      parentId: null,
      customerRootTenantId: 'root-1',
    })

    expect(insertChain.values).toHaveBeenCalledWith({
      ancestorTenantId: 'root-1',
      descendantTenantId: 'root-1',
      customerRootTenantId: 'root-1',
      depth: 0,
    })
    expect(insertChain.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ set: { customerRootTenantId: 'root-1' } }),
    )
    // No parent means no need to look up ancestor rows at all.
    expect(db.select).not.toHaveBeenCalled()
  })

  it('copies the parent ancestor chain forward one depth level for a child tenant', async () => {
    const { service, db } = build()
    const insertChain = chain(undefined)
    db.insert.mockReturnValue(insertChain)
    // region-1's parent is root-1, whose only ancestor row (at this point) is its own self-row.
    db.select.mockReturnValueOnce(
      chain([{ ancestorTenantId: 'root-1', descendantTenantId: 'root-1', customerRootTenantId: 'root-1', depth: 0 }]),
    )

    await service.createClosureForNewTenant(db as never, {
      tenantId: 'region-1',
      parentId: 'root-1',
      customerRootTenantId: 'root-1',
    })

    // First insert call is always the self-row; second is the copied-forward ancestor row.
    expect(insertChain.values).toHaveBeenNthCalledWith(1, {
      ancestorTenantId: 'region-1',
      descendantTenantId: 'region-1',
      customerRootTenantId: 'root-1',
      depth: 0,
    })
    expect(insertChain.values).toHaveBeenNthCalledWith(2, {
      ancestorTenantId: 'root-1',
      descendantTenantId: 'region-1',
      customerRootTenantId: 'root-1',
      depth: 1,
    })
  })

  it('is safe to re-run for an already-existing tenant (upsert, not insert-only)', async () => {
    const { service, db } = build()
    const insertChain = chain(undefined)
    db.insert.mockReturnValue(insertChain)

    const input = { tenantId: 'root-1', parentId: null, customerRootTenantId: 'root-1' }
    await expect(service.createClosureForNewTenant(db as never, input)).resolves.not.toThrow()
    await expect(service.createClosureForNewTenant(db as never, input)).resolves.not.toThrow()
    // Every write goes through onConflictDoUpdate — never a plain insert that would throw on a
    // duplicate primary key.
    expect(insertChain.onConflictDoUpdate).toHaveBeenCalledTimes(2)
  })

  it('resolves descendants (reporting scope) via ancestorTenantId', async () => {
    const { service, db } = build()
    db.select.mockReturnValueOnce(
      chain([{ descendantTenantId: 'root-1' }, { descendantTenantId: 'region-1' }, { descendantTenantId: 'unit-1' }]),
    )

    const descendants = await service.getDescendantTenantIds('root-1')

    expect(descendants).toEqual(['root-1', 'region-1', 'unit-1'])
  })

  it('resolves ancestors nearest-first (settings inheritance) via descendantTenantId ordered by depth', async () => {
    const { service, db } = build()
    db.select.mockReturnValueOnce(
      chain([{ ancestorTenantId: 'unit-1' }, { ancestorTenantId: 'region-1' }, { ancestorTenantId: 'root-1' }]),
    )

    const ancestors = await service.getAncestorTenantIdsOrdered('unit-1')

    expect(ancestors).toEqual(['unit-1', 'region-1', 'root-1'])
  })
})
