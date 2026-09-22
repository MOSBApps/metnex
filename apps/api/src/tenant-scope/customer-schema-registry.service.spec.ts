import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { CustomerSchemaRegistryService } from './customer-schema-registry.service'

function build() {
  const db = buildMockDb()
  const dbService = { pool: { query: jest.fn() } }
  const service = new CustomerSchemaRegistryService(db as never, dbService as never)
  return { service, db, dbService }
}

describe('CustomerSchemaRegistryService', () => {
  it('rejects provisioning for a tenant that does not exist', async () => {
    const { service, db } = build()
    db.select.mockReturnValueOnce(chain([]))
    await expect(service.ensureSchemaProvisioned('missing', 'slug')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rejects provisioning for a non-ROOT tenant (PLATFORM_ROOT or STANDARD)', async () => {
    const { service, db } = build()
    db.select.mockReturnValueOnce(chain([{ id: 'platform-root', type: 'PLATFORM_ROOT' }]))
    await expect(service.ensureSchemaProvisioned('platform-root', 'slug')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('is a no-op when the registry is already ACTIVE (idempotent)', async () => {
    const { service, db, dbService } = build()
    const activeRow = { customerRootTenantId: 'root-1', schemaName: 'cust_acme_aaaaaaaa', status: 'ACTIVE' }
    db.select.mockReturnValueOnce(chain([{ id: 'root-1', type: 'ROOT' }])).mockReturnValueOnce(chain([activeRow]))

    const result = await service.ensureSchemaProvisioned('root-1', 'acme')

    expect(result).toBe(activeRow)
    expect(dbService.pool.query).not.toHaveBeenCalled()
  })

  it('creates the schema and marks the registry ACTIVE on success', async () => {
    const { service, db, dbService } = build()
    db.select.mockReturnValueOnce(chain([{ id: 'root-1', type: 'ROOT' }])).mockReturnValueOnce(chain([]))
    db.insert.mockReturnValue(chain([{ status: 'PROVISIONING' }]))
    dbService.pool.query.mockResolvedValue(undefined)
    db.update.mockReturnValue(chain([{ schemaName: 'cust_acme_aaaaaaaa', status: 'ACTIVE' }]))

    const result = await service.ensureSchemaProvisioned('root-1', 'acme')

    expect(dbService.pool.query).toHaveBeenCalledWith(expect.stringContaining('CREATE SCHEMA IF NOT EXISTS'))
    expect(dbService.pool.query).toHaveBeenCalledWith(expect.stringContaining('"cust_acme_'))
    expect(result.status).toBe('ACTIVE')
  })

  it('re-drives a FAILED registry row on an explicit provisioning call (existing behaviour, no automatic retry)', async () => {
    const { service, db, dbService } = build()
    db.select
      .mockReturnValueOnce(chain([{ id: 'root-1', type: 'ROOT' }]))
      .mockReturnValueOnce(
        chain([{ customerRootTenantId: 'root-1', schemaName: 'cust_acme_aaaaaaaa', status: 'FAILED', lastError: 'previous failure' }]),
      )
    db.insert.mockReturnValue(chain([{ status: 'PROVISIONING' }]))
    dbService.pool.query.mockResolvedValue(undefined)
    db.update.mockReturnValue(chain([{ schemaName: 'cust_acme_aaaaaaaa', status: 'ACTIVE' }]))

    const result = await service.ensureSchemaProvisioned('root-1', 'acme')

    expect(result.status).toBe('ACTIVE')
    expect(dbService.pool.query).toHaveBeenCalled()
  })

  it('marks the registry FAILED with a sanitized lastError when CREATE SCHEMA throws, and rethrows a sanitized error', async () => {
    const { service, db, dbService } = build()
    db.select.mockReturnValueOnce(chain([{ id: 'root-1', type: 'ROOT' }])).mockReturnValueOnce(chain([]))
    const insertChain = chain([{ status: 'PROVISIONING' }])
    db.insert.mockReturnValue(insertChain)
    dbService.pool.query.mockRejectedValue(new Error('permission denied to create schema'))
    const updateChain = chain(undefined)
    db.update.mockReturnValue(updateChain)

    await expect(service.ensureSchemaProvisioned('root-1', 'acme')).rejects.toBeInstanceOf(InternalServerErrorException)

    expect(updateChain.set).toHaveBeenCalledWith({ status: 'FAILED', lastError: 'Error: schema provisioning failed' })
  })
})
