import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { TenantScopeService } from './tenant-scope.service'

function build() {
  const db = buildMockDb()
  const closure = { getDescendantTenantIds: jest.fn() }
  const registry = { getActiveRegistry: jest.fn() }
  const service = new TenantScopeService(db as never, closure as never, registry as never)
  return { service, db, closure, registry }
}

const ACTIVE_REGISTRY = { schemaName: 'cust_acme_aaaaaaaa', status: 'ACTIVE' }

describe('TenantScopeService', () => {
  it('rejects an unknown tenant', async () => {
    const { service, db } = build()
    db.select.mockReturnValueOnce(chain([]))
    await expect(service.resolve('missing')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rejects PLATFORM_ROOT — it never resolves a data-plane scope', async () => {
    const { service, db } = build()
    db.select.mockReturnValueOnce(
      chain([{ id: 'platform-root', type: 'PLATFORM_ROOT', status: 'ACTIVE', customerRootId: null, canEnterData: false, canAggregateChildren: false }]),
    )
    await expect(service.resolve('platform-root')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects an inactive tenant', async () => {
    const { service, db } = build()
    db.select.mockReturnValueOnce(
      chain([{ id: 'root-1', type: 'ROOT', status: 'SUSPENDED', customerRootId: 'root-1', canEnterData: true, canAggregateChildren: true }]),
    )
    await expect(service.resolve('root-1')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects a tenant with no customer root', async () => {
    const { service, db } = build()
    db.select.mockReturnValueOnce(
      chain([{ id: 'orphan-1', type: 'STANDARD', status: 'ACTIVE', customerRootId: null, canEnterData: true, canAggregateChildren: false }]),
    )
    await expect(service.resolve('orphan-1')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects when the customer root has no ACTIVE schema registry row', async () => {
    const { service, db, registry } = build()
    db.select.mockReturnValueOnce(
      chain([{ id: 'root-1', type: 'ROOT', status: 'ACTIVE', customerRootId: 'root-1', canEnterData: true, canAggregateChildren: true }]),
    )
    registry.getActiveRegistry.mockResolvedValue(null)
    await expect(service.resolve('root-1')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('ROOT resolves every descendant in its tree', async () => {
    const { service, db, closure, registry } = build()
    db.select.mockReturnValueOnce(
      chain([{ id: 'root-1', type: 'ROOT', status: 'ACTIVE', customerRootId: 'root-1', canEnterData: true, canAggregateChildren: true }]),
    )
    registry.getActiveRegistry.mockResolvedValue(ACTIVE_REGISTRY)
    closure.getDescendantTenantIds.mockResolvedValue(['root-1', 'region-1', 'unit-1'])

    const result = await service.resolve('root-1')

    expect(result.dataScopeTenantIds).toEqual(['root-1', 'region-1', 'unit-1'])
    expect(result.schemaName).toBe('cust_acme_aaaaaaaa')
    expect(closure.getDescendantTenantIds).toHaveBeenCalledWith('root-1')
  })

  it('a reporting node resolves itself plus its own descendants only', async () => {
    const { service, db, closure, registry } = build()
    db.select.mockReturnValueOnce(
      chain([{ id: 'region-1', type: 'STANDARD', status: 'ACTIVE', customerRootId: 'root-1', canEnterData: false, canAggregateChildren: true }]),
    )
    registry.getActiveRegistry.mockResolvedValue(ACTIVE_REGISTRY)
    closure.getDescendantTenantIds.mockResolvedValue(['region-1', 'unit-1'])

    const result = await service.resolve('region-1')

    expect(result.dataScopeTenantIds).toEqual(['region-1', 'unit-1'])
    expect(result.canEnterData).toBe(false)
    expect(result.canAggregateChildren).toBe(true)
  })

  it('an operating node resolves only itself, without querying the closure table', async () => {
    const { service, db, closure, registry } = build()
    db.select.mockReturnValueOnce(
      chain([{ id: 'unit-1', type: 'STANDARD', status: 'ACTIVE', customerRootId: 'root-1', canEnterData: true, canAggregateChildren: false }]),
    )
    registry.getActiveRegistry.mockResolvedValue(ACTIVE_REGISTRY)

    const result = await service.resolve('unit-1')

    expect(result.dataScopeTenantIds).toEqual(['unit-1'])
    expect(closure.getDescendantTenantIds).not.toHaveBeenCalled()
  })
})
