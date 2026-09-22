import { BadRequestException, ForbiddenException, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { CustomerSchemaRegistryService } from '../tenant-scope/customer-schema-registry.service'
import { REGISTRY_ERROR_CODES, RegistryStateError } from '../tenant-scope/registry-state'
import { TenantScopeService } from '../tenant-scope/tenant-scope.service'
import { SaasService } from './saas.service'
import { TenantService } from './tenant.service'

/**
 * Q-DP15 (TASK-027.35): a customer ROOT tenant may only come from the official provisioning flow
 * (SaasService.provisionCustomer), which ends in schema/registry provisioning. The generic tenant
 * API must never create a ROOT — silently, or at all. No test opens a database connection.
 */
const SRC = join(__dirname, '..')
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
const productionFiles = files(SRC).filter(file => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
const code = (file: string) => strip(readFileSync(file, 'utf8'))

const SCHEMA = 'cust_acme_aaaaaaaa'
const TENANT_ROW = (extra: Record<string, unknown> = {}) => ({
  id: 'child-1', name: 'Child', shortName: null, slug: 'acme-child', type: 'STANDARD', status: 'ACTIVE',
  parentId: 'root-1', customerRootId: 'root-1', canEnterData: true, canAggregateChildren: false,
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...extra,
})

function buildTenantService() {
  const db = buildMockDb()
  const closure = { createClosureForNewTenant: jest.fn(async () => undefined) }
  const service = new TenantService(db as never, closure as never)
  return { service, db, closure }
}

describe('generic tenant creation never produces a ROOT', () => {
  it.each<[string, Record<string, unknown>]>([
    ['no parent', { name: 'Acme' }],
    ['no parent, explicit slug', { name: 'Acme', slug: 'acme' }],
    ['a null parent', { name: 'Acme', parentId: null }],
    ['an empty parent', { name: 'Acme', parentId: '' }],
    ['a smuggled type field', { name: 'Acme', type: 'ROOT' }],
    ['smuggled capability flags', { name: 'Acme', canEnterData: true, canAggregateChildren: true }],
  ])('rejects %s with ROOT_PROVISIONING_REQUIRED before touching anything', async (_label, dto) => {
    const { service, db, closure } = buildTenantService()
    const error = await service.create(dto as never).catch(e => e)
    expect(error).toBeInstanceOf(BadRequestException)
    expect((error.getResponse() as { code: string }).code).toBe('ROOT_PROVISIONING_REQUIRED')
    expect(db.select).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
    expect(db.transaction).not.toHaveBeenCalled()
    expect(closure.createClosureForNewTenant).not.toHaveBeenCalled()
  })

  it('the refusal is static: no schema name, connection string, or database detail', async () => {
    const { service } = buildTenantService()
    const error = await service.create({ name: 'Acme' } as never).catch(e => e)
    const body = JSON.stringify(error.getResponse())
    expect(body).not.toMatch(/cust_|postgres|password|schema_name|SELECT|INSERT/i)
    expect(body).toContain('ROOT_PROVISIONING_REQUIRED')
  })

  it('there is no way to request ROOT through a parent either: a PLATFORM_ROOT parent is refused', async () => {
    const { service, db } = buildTenantService()
    db.select.mockReturnValueOnce(chain([{ id: 'platform-1', slug: 'platform', type: 'PLATFORM_ROOT', customerRootId: null }]))
    await expect(service.create({ name: 'Acme', parentId: 'platform-1' } as never)).rejects.toBeInstanceOf(BadRequestException)
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('an unknown parent is a 404, not a fallback to ROOT', async () => {
    const { service, db } = buildTenantService()
    db.select.mockReturnValueOnce(chain([]))
    await expect(service.create({ name: 'Acme', parentId: 'missing' } as never)).rejects.toBeInstanceOf(NotFoundException)
    expect(db.insert).not.toHaveBeenCalled()
  })
})

describe('STANDARD and child tenant creation keeps working', () => {
  function stubCreate(parent: Record<string, unknown>) {
    const ctx = buildTenantService()
    const created = TENANT_ROW()
    const insertChain = chain([created])
    ctx.db.select
      .mockReturnValueOnce(chain([parent]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([{ tenant: created, parentName: 'Parent', parentSlug: 'acme', customerRootName: 'Acme', customerRootSlug: 'acme', memberCount: 0 }]))
    ctx.db.insert.mockReturnValue(insertChain)
    return { ...ctx, insertChain, created }
  }

  it('creates a STANDARD child under a ROOT, in the same customer-root tree', async () => {
    const { service, closure, insertChain } = stubCreate({ id: 'root-1', slug: 'acme', type: 'ROOT', customerRootId: 'root-1' })
    const result = await service.create({ name: 'Child', parentId: 'root-1' } as never)
    expect(result).toMatchObject({ id: 'child-1', type: 'STANDARD', parentId: 'root-1', customerRootId: 'root-1' })
    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({ type: 'STANDARD', parentId: 'root-1', customerRootId: 'root-1', slug: 'acme-child' }))
    expect(closure.createClosureForNewTenant).toHaveBeenCalledWith(expect.anything(), { tenantId: 'child-1', parentId: 'root-1', customerRootTenantId: 'root-1' })
  })

  it('creates a grandchild under a STANDARD parent, inheriting that parent’s customer root', async () => {
    const { service, closure, insertChain } = stubCreate({ id: 'mid-1', slug: 'acme-mid', type: 'STANDARD', customerRootId: 'root-1' })
    await service.create({ name: 'Child', parentId: 'mid-1' } as never)
    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({ type: 'STANDARD', parentId: 'mid-1', customerRootId: 'root-1' }))
    expect(closure.createClosureForNewTenant).toHaveBeenCalledWith(expect.anything(), { tenantId: 'child-1', parentId: 'mid-1', customerRootTenantId: 'root-1' })
  })

  it('honours the capability flags for children and never inserts a ROOT type', async () => {
    const { service, insertChain } = stubCreate({ id: 'root-1', slug: 'acme', type: 'ROOT', customerRootId: 'root-1' })
    await service.create({ name: 'Child', parentId: 'root-1', canEnterData: false, canAggregateChildren: true } as never)
    const values = insertChain.values.mock.calls[0]?.[0] as Record<string, unknown>
    expect(values).toMatchObject({ canEnterData: false, canAggregateChildren: true, type: 'STANDARD' })
    expect(values.type).not.toBe('ROOT')
  })

  it('still rejects a duplicate slug', async () => {
    const { service, db } = buildTenantService()
    db.select.mockReturnValueOnce(chain([{ id: 'root-1', slug: 'acme', type: 'ROOT', customerRootId: 'root-1' }])).mockReturnValueOnce(chain([{ id: 'other' }]))
    await expect(service.create({ name: 'Child', parentId: 'root-1' } as never)).rejects.toThrow('slug')
    expect(db.insert).not.toHaveBeenCalled()
  })
})

describe('the official provisioning flow (SaasService.provisionCustomer)', () => {
  function buildSaas() {
    const db = buildMockDb()
    const order: string[] = []
    const registry = { ensureSchemaProvisioned: jest.fn(async () => { order.push('ensureSchemaProvisioned'); return { status: 'ACTIVE' } }) }
    const tenantClosure = { createClosureForNewTenant: jest.fn(async () => undefined) }
    const authService = { hashNewPassword: jest.fn(async () => 'hash') }
    const service = new SaasService(db as never, authService as never, {} as never, {} as never, {} as never, tenantClosure as never, registry as never, { log: jest.fn() } as never)
    db.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const result = await fn(db)
      order.push('transactionCommitted')
      return result
    })
    db.select
      .mockReturnValueOnce(chain([{ id: 'pkg-1', isActive: true, name: 'Std', code: 'STD' }]))
      .mockReturnValueOnce(chain([{ id: 'platform-1' }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([{ id: 'role-1' }]))
    db.insert
      .mockReturnValueOnce(chain([{ id: 'root-1', name: 'Acme', slug: 'acme', type: 'ROOT' }]))
      .mockReturnValueOnce(chain([{ id: 'user-1', email: 'admin@example.test', displayName: 'Admin' }]))
      .mockReturnValueOnce(chain(undefined))
      .mockReturnValueOnce(chain(undefined))
      .mockReturnValueOnce(chain([{ id: 'sub-1', status: 'ACTIVE' }]))
    db.update.mockReturnValue(chain(undefined))
    return { service, db, registry, order }
  }
  const dto = { companyName: 'Acme', packageId: 'pkg-1', adminEmail: 'admin@example.test', adminDisplayName: 'Admin', adminPassword: 'Sup3r-secret-pass!' }

  it('provisions the schema/registry for the new ROOT after the tenant transaction and returns only after it succeeded', async () => {
    const { service, registry, order } = buildSaas()
    const result = await service.provisionCustomer(dto)
    expect(registry.ensureSchemaProvisioned).toHaveBeenCalledTimes(1)
    expect(registry.ensureSchemaProvisioned).toHaveBeenCalledWith('root-1', 'acme')
    expect(order).toEqual(['transactionCommitted', 'ensureSchemaProvisioned'])
    expect(result.customerRootTenant).toMatchObject({ id: 'root-1', type: 'ROOT' })
  })

  it('never returns a ROOT result when provisioning fails, and surfaces only the static error', async () => {
    const { service, registry } = buildSaas()
    registry.ensureSchemaProvisioned.mockRejectedValueOnce(new InternalServerErrorException({ code: 'SCHEMA_PROVISIONING_FAILED', message: 'Customer schema provisioning failed' }))
    const error = await service.provisionCustomer(dto).catch(e => e)
    expect(error).toBeInstanceOf(InternalServerErrorException)
    expect(JSON.stringify(error.getResponse())).not.toMatch(/cust_|postgres|password|host/i)
    expect(registry.ensureSchemaProvisioned).toHaveBeenCalledTimes(1)
  })

  it('does not retry, reactivate or swallow an ARCHIVED registry: the refusal propagates after exactly one attempt', async () => {
    const { service, registry } = buildSaas()
    registry.ensureSchemaProvisioned.mockRejectedValueOnce(new RegistryStateError(REGISTRY_ERROR_CODES.SCHEMA_ARCHIVED, 'Schema is archived and cannot be provisioned'))
    const error = await service.provisionCustomer(dto).catch(e => e)
    expect(error).toBeInstanceOf(RegistryStateError)
    expect(error.code).toBe('SCHEMA_ARCHIVED')
    expect(registry.ensureSchemaProvisioned).toHaveBeenCalledTimes(1)
  })
})

describe('no partial access after a ROOT is created without a usable registry', () => {
  function scopeFor(registryRow: Record<string, unknown> | null) {
    const db = buildMockDb()
    const registry = new CustomerSchemaRegistryService(db as never, { pool: { query: jest.fn() } } as never)
    const closure = { getDescendantTenantIds: jest.fn(async () => ['root-1', 'child-1']) }
    const scope = new TenantScopeService(db as never, closure as never, registry)
    const root = { id: 'root-1', type: 'ROOT', status: 'ACTIVE', customerRootId: 'root-1', canEnterData: true, canAggregateChildren: true }
    const child = { id: 'child-1', type: 'STANDARD', status: 'ACTIVE', customerRootId: 'root-1', canEnterData: true, canAggregateChildren: false }
    const resolveAs = (tenant: Record<string, unknown>) => {
      db.select.mockReturnValueOnce(chain([tenant])).mockReturnValueOnce(chain(registryRow ? [registryRow] : []))
      return scope.resolve(tenant.id as string)
    }
    return { db, resolveAs, root, child }
  }
  const row = (status: string) => ({ customerRootTenantId: 'root-1', schemaName: SCHEMA, status, migrationVersion: '0000_empty' })

  it.each([['no registry row', null], ['PROVISIONING', row('PROVISIONING')], ['FAILED', row('FAILED')], ['ARCHIVED', row('ARCHIVED')]])(
    'root and child both fail closed with %s',
    async (_label, registryRow) => {
      const { resolveAs, root, child, db } = scopeFor(registryRow)
      await expect(resolveAs(root)).rejects.toBeInstanceOf(ForbiddenException)
      await expect(resolveAs(child)).rejects.toBeInstanceOf(ForbiddenException)
      expect(db.update).not.toHaveBeenCalled()
      expect(db.insert).not.toHaveBeenCalled()
    },
  )

  it('root and child resolve only once the registry is ACTIVE', async () => {
    const { resolveAs, root, child } = scopeFor(row('ACTIVE'))
    await expect(resolveAs(root)).resolves.toMatchObject({ schemaName: SCHEMA })
    await expect(resolveAs(child)).resolves.toMatchObject({ schemaName: SCHEMA })
  })
})

describe('the single provisioning boundary (static)', () => {
  it('only SaasService.provisionCustomer assigns a ROOT type in production code', () => {
    const offenders = productionFiles
      .filter(file => /\btype\s*[:=]\s*'ROOT'/.test(code(file)))
      .map(file => relative(SRC, file))
    expect(offenders).toEqual(['platform/saas.service.ts'])
  })

  it('the ROOT insert in saas.service.ts is followed by ensureSchemaProvisioned, and nothing else calls it', () => {
    const saas = code(join(SRC, 'platform', 'saas.service.ts'))
    const provision = saas.slice(saas.indexOf('async provisionCustomer'))
    expect(provision.indexOf("type: 'ROOT'")).toBeGreaterThan(-1)
    expect(provision.indexOf('this.db.transaction(')).toBeLessThan(provision.indexOf('ensureSchemaProvisioned('))
    const callers = productionFiles
      .filter(file => /\.ensureSchemaProvisioned\(/.test(code(file)))
      .map(file => relative(SRC, file))
    expect(callers).toEqual(['platform/saas.service.ts'])
  })

  it('TenantService cannot create a ROOT: no ROOT assignment, no platform-root fallback, no role logic', () => {
    const tenant = code(join(SRC, 'platform', 'tenant.service.ts'))
    expect(tenant).not.toMatch(/\btype\s*[:=]\s*'ROOT'/)
    expect(tenant).not.toMatch(/type\s*=\s*'ROOT'/)
    expect(tenant).not.toMatch(/isSystemAdmin|TENANT_ADMIN/)
    expect(tenant).toContain('ROOT_PROVISIONING_REQUIRED')
  })

  it('the routes keep their existing permissions; no new bypass was introduced', () => {
    const tenantController = readFileSync(join(SRC, 'platform', 'tenant.controller.ts'), 'utf8')
    const saasController = readFileSync(join(SRC, 'platform', 'saas.controller.ts'), 'utf8')
    expect(tenantController).toMatch(/@Post\(\)\s+@RequirePermission\('PLATFORM:TENANT:CREATE'\)/)
    expect(saasController).toMatch(/@Post\('customers\/provision'\)\s+@RequirePermission\('PLATFORM:CUSTOMER:PROVISION'\)/)
    for (const controller of [tenantController, saasController]) {
      expect(strip(controller)).not.toMatch(/isSystemAdmin\s*\?|bypass|TENANT_ADMIN/i)
    }
  })

  it('the child-tenant path of SaasService also never creates a ROOT', () => {
    const saas = code(join(SRC, 'platform', 'saas.service.ts'))
    const rootAssignments = saas.match(/type:\s*'ROOT'/g) ?? []
    expect(rootAssignments).toHaveLength(1)
  })
})
