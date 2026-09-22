import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { CustomerSchemaRegistryService } from '../tenant-scope/customer-schema-registry.service'
import { REGISTRY_ERROR_CODES, RegistryStateError } from '../tenant-scope/registry-state'
import { validatePasswordStrength } from './domain/auth.domain'
import { validateProvisionCustomerInput } from './domain/customer-provision.domain'
import { SaasService } from './saas.service'
import { TenantService } from './tenant.service'

/**
 * Q-DP19 (TASK-027.38): the backend validates the provision-customer input itself, before any query or
 * write, using the canonical password policy. No test opens a database connection.
 */
const PASSWORD = 'Sup3r-secret-pass!'
const VALID = { companyName: 'Acme Lojistik', packageId: 'pkg-1', adminEmail: 'admin@example.test', adminDisplayName: 'Ayşe Yılmaz', adminPassword: PASSWORD }

function buildSaas() {
  const db = buildMockDb()
  const registry = { ensureSchemaProvisioned: jest.fn(async () => ({ status: 'ACTIVE' })) }
  const tenantClosure = { createClosureForNewTenant: jest.fn(async () => undefined) }
  const authService = { hashNewPassword: jest.fn(async () => 'hash-value') }
  const service = new SaasService(db as never, authService as never, {} as never, {} as never, {} as never, tenantClosure as never, registry as never, { log: jest.fn() } as never)
  db.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db))
  return { service, db, registry, authService, tenantClosure }
}

function stubHappyPath(ctx: ReturnType<typeof buildSaas>) {
  ctx.db.select
    .mockReturnValueOnce(chain([{ id: 'pkg-1', isActive: true, name: 'Std', code: 'STD' }]))
    .mockReturnValueOnce(chain([{ id: 'platform-1' }]))
    .mockReturnValueOnce(chain([]))
    .mockReturnValueOnce(chain([]))
    .mockReturnValueOnce(chain([{ id: 'role-1' }]))
  ctx.db.insert
    .mockReturnValueOnce(chain([{ id: 'root-1', name: 'Acme', slug: 'acme-lojistik', type: 'ROOT' }]))
    .mockReturnValueOnce(chain([{ id: 'user-1', email: 'admin@example.test', displayName: 'Ayşe Yılmaz' }]))
    .mockReturnValueOnce(chain(undefined))
    .mockReturnValueOnce(chain(undefined))
    .mockReturnValueOnce(chain([{ id: 'sub-1', status: 'ACTIVE' }]))
  ctx.db.update.mockReturnValue(chain(undefined))
}

const INVALID: Array<[string, Record<string, unknown>]> = [
  ['missing company name', { companyName: undefined }],
  ['whitespace company name', { companyName: '     ' }],
  ['one-character company name', { companyName: 'A' }],
  ['overlong company name', { companyName: 'x'.repeat(101) }],
  ['non-string company name', { companyName: 42 }],
  ['uppercase slug', { companySlug: 'Acme' }],
  ['slug with spaces', { companySlug: 'acme corp' }],
  ['slug with underscore', { companySlug: 'acme_corp' }],
  ['slug with leading dash', { companySlug: '-acme' }],
  ['overlong slug', { companySlug: 'a'.repeat(64) }],
  ['non-string slug', { companySlug: 5 }],
  ['missing package', { packageId: undefined }],
  ['blank package', { packageId: '   ' }],
  ['overlong package id', { packageId: 'p'.repeat(101) }],
  ['non-string package', { packageId: { $ne: null } }],
  ['missing email', { adminEmail: undefined }],
  ['blank email', { adminEmail: '  ' }],
  ['malformed email', { adminEmail: 'not-an-email' }],
  ['overlong email', { adminEmail: `${'a'.repeat(250)}@x.co` }],
  ['missing admin name', { adminDisplayName: undefined }],
  ['whitespace admin name', { adminDisplayName: '   ' }],
  ['overlong admin name', { adminDisplayName: 'x'.repeat(101) }],
  ['missing password', { adminPassword: undefined }],
  ['empty password', { adminPassword: '' }],
  ['non-string password', { adminPassword: 12345678 }],
  ['7-character password', { adminPassword: 'Aa1aaaa' }],
  ['129-character password', { adminPassword: 'A1' + 'a'.repeat(127) }],
  ['password without uppercase', { adminPassword: 'lowercase123' }],
  ['password without lowercase', { adminPassword: 'UPPERCASE123' }],
  ['password without digit', { adminPassword: 'NoDigitsHere' }],
  ['overlong notes', { notes: 'n'.repeat(1001) }],
  ['non-string notes', { notes: ['x'] }],
]

describe('validateProvisionCustomerInput', () => {
  it('accepts a complete valid input, with and without the optional fields', () => {
    expect(validateProvisionCustomerInput(VALID)).toEqual({ valid: true, errors: [] })
    expect(validateProvisionCustomerInput({ ...VALID, companySlug: 'acme-lojistik', notes: 'deneme' }).valid).toBe(true)
    expect(validateProvisionCustomerInput({ ...VALID, companySlug: '', notes: null }).valid).toBe(true)
  })

  it.each(INVALID)('rejects %s', (_label, override) => {
    expect(validateProvisionCustomerInput({ ...VALID, ...override }).valid).toBe(false)
  })

  it.each([null, undefined, 'text', 7, [], [VALID]])('rejects a non-object body %j', body => {
    expect(validateProvisionCustomerInput(body).valid).toBe(false)
  })

  it('reports every problem of an empty body at once', () => {
    expect(validateProvisionCustomerInput({}).errors.length).toBeGreaterThanOrEqual(5)
  })

  it('accepts the password boundaries exactly like the canonical validator (8 and 128 characters)', () => {
    for (const password of ['Aa1aaaaa', 'A1' + 'a'.repeat(126)]) {
      expect(validateProvisionCustomerInput({ ...VALID, adminPassword: password }).valid).toBe(true)
    }
  })

  it('takes the password rules only from validatePasswordStrength', () => {
    for (const password of ['', 'Aa1', 'Aa1aaaaa', 'aaaaaaaa1', 'AAAAAAAA1', 'Aaaaaaaaa', 'A1' + 'a'.repeat(200), PASSWORD]) {
      const errors = validateProvisionCustomerInput({ ...VALID, adminPassword: password }).errors
      const canonical = validatePasswordStrength(password).errors
      if (password !== '') expect(canonical.every(message => errors.includes(message))).toBe(true)
      expect(errors.length > 0).toBe(password === '' || canonical.length > 0)
    }
  })

  it('messages are static: they never echo any input value, including the password and e-mail', () => {
    const secret = 'Zz9-Leaky-Marker'
    const errors = validateProvisionCustomerInput({
      companyName: 'x'.repeat(101), companySlug: 'BAD SLUG secret-slug', packageId: 'p'.repeat(101),
      adminEmail: 'leak-marker@@bad', adminDisplayName: '', adminPassword: secret.toLowerCase(), notes: 'n'.repeat(1001),
    }).errors.join(' | ')
    expect(errors).not.toMatch(/Leaky|leak-marker|secret-slug|BAD SLUG|xxxx|nnnn/i)
  })
})

describe('SaasService.provisionCustomer rejects invalid input before any write', () => {
  it.each(INVALID)('%s → 400, no DB access, no hashing, no schema provisioning', async (_label, override) => {
    const { service, db, registry, authService, tenantClosure } = buildSaas()
    const error = await service.provisionCustomer({ ...VALID, ...override } as never).catch(e => e)
    expect(error).toBeInstanceOf(BadRequestException)
    expect(db.select).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
    expect(db.delete).not.toHaveBeenCalled()
    expect(db.transaction).not.toHaveBeenCalled()
    expect(authService.hashNewPassword).not.toHaveBeenCalled()
    expect(tenantClosure.createClosureForNewTenant).not.toHaveBeenCalled()
    expect(registry.ensureSchemaProvisioned).not.toHaveBeenCalled()
  })

  it('a company name that cannot yield a slug (and no explicit slug) is refused before any write', async () => {
    const { service, db, registry } = buildSaas()
    const error = await service.provisionCustomer({ ...VALID, companyName: '!!' } as never).catch(e => e)
    expect(error).toBeInstanceOf(BadRequestException)
    expect(db.select).not.toHaveBeenCalled()
    expect(db.transaction).not.toHaveBeenCalled()
    expect(registry.ensureSchemaProvisioned).not.toHaveBeenCalled()
  })

  it('error responses never contain the password, its hash, a schema name or database detail', async () => {
    const { service } = buildSaas()
    for (const adminPassword of ['weakpass', 'ALLUPPER123', 'A1' + 'a'.repeat(200)]) {
      const error = await service.provisionCustomer({ ...VALID, adminPassword } as never).catch(e => e)
      const body = JSON.stringify(error.getResponse())
      expect(body).not.toContain(adminPassword)
      expect(body).not.toMatch(/hash|cust_|postgres|connection|SELECT|INSERT|DATABASE_URL/i)
    }
  })

  it('an unknown package still yields the existing 404 and writes nothing', async () => {
    const { service, db, registry } = buildSaas()
    db.select.mockReturnValueOnce(chain([]))
    await expect(service.provisionCustomer(VALID)).rejects.toBeInstanceOf(NotFoundException)
    expect(db.insert).not.toHaveBeenCalled()
    expect(registry.ensureSchemaProvisioned).not.toHaveBeenCalled()
  })

  it('an inactive package is refused with the same 404', async () => {
    const { service, db } = buildSaas()
    db.select.mockReturnValueOnce(chain([{ id: 'pkg-1', isActive: false }]))
    await expect(service.provisionCustomer(VALID)).rejects.toBeInstanceOf(NotFoundException)
    expect(db.insert).not.toHaveBeenCalled()
  })
})

describe('valid input keeps the existing provisioning flow', () => {
  it('provisions as before: hashes once, one transaction, schema provisioning after it', async () => {
    const ctx = buildSaas()
    stubHappyPath(ctx)
    const result = await ctx.service.provisionCustomer({ ...VALID, companySlug: '  acme-lojistik ', notes: ' not ' })
    expect(ctx.authService.hashNewPassword).toHaveBeenCalledWith(PASSWORD)
    expect(ctx.db.transaction).toHaveBeenCalledTimes(1)
    expect(ctx.registry.ensureSchemaProvisioned).toHaveBeenCalledWith('root-1', 'acme-lojistik')
    expect(result.customerRootTenant).toMatchObject({ id: 'root-1', type: 'ROOT' })
  })

  it('derives the slug from the company name when none is given (existing behaviour)', async () => {
    const ctx = buildSaas()
    stubHappyPath(ctx)
    await ctx.service.provisionCustomer(VALID)
    const tenantInsert = ctx.db.insert.mock.results[0]?.value as { values: jest.Mock }
    expect(tenantInsert.values).toHaveBeenCalledWith(expect.objectContaining({ slug: 'acme-lojistik', type: 'ROOT', name: 'Acme Lojistik' }))
  })

  it('the successful response carries no credential field', async () => {
    const ctx = buildSaas()
    stubHappyPath(ctx)
    const result = await ctx.service.provisionCustomer(VALID)
    const body = JSON.stringify(result)
    expect(body).not.toContain(PASSWORD)
    expect(body).not.toMatch(/password|passwordHash|hash-value/i)
    expect(Object.keys(result).sort()).toEqual(['customerRootTenant', 'subscription', 'tenantAdmin'])
  })
})

describe('Q-DP17, ARCHIVED and generic-ROOT behaviour is unchanged', () => {
  it('a provisioning failure after a valid request still surfaces only the static error, once', async () => {
    const ctx = buildSaas()
    stubHappyPath(ctx)
    ctx.registry.ensureSchemaProvisioned.mockRejectedValueOnce(new InternalServerErrorException({ code: 'SCHEMA_PROVISIONING_FAILED', message: 'Customer schema provisioning failed' }))
    const error = await ctx.service.provisionCustomer(VALID).catch(e => e)
    expect(error).toBeInstanceOf(InternalServerErrorException)
    expect((error.getResponse() as { code: string }).code).toBe('SCHEMA_PROVISIONING_FAILED')
    expect(ctx.registry.ensureSchemaProvisioned).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(error.getResponse())).not.toContain(PASSWORD)
  })

  it('an ARCHIVED registry is still propagated after exactly one attempt', async () => {
    const ctx = buildSaas()
    stubHappyPath(ctx)
    ctx.registry.ensureSchemaProvisioned.mockRejectedValueOnce(new RegistryStateError(REGISTRY_ERROR_CODES.SCHEMA_ARCHIVED, 'Schema is archived and cannot be provisioned'))
    const error = await ctx.service.provisionCustomer(VALID).catch(e => e)
    expect(error).toBeInstanceOf(RegistryStateError)
    expect(ctx.registry.ensureSchemaProvisioned).toHaveBeenCalledTimes(1)
  })

  it('the generic tenant API is still fail-closed for a parentless (ROOT) request', async () => {
    const db = buildMockDb()
    const service = new TenantService(db as never, { createClosureForNewTenant: jest.fn() } as never)
    const error = await service.create({ name: 'Acme', slug: 'acme' } as never).catch(e => e)
    expect((error.getResponse() as { code: string }).code).toBe('ROOT_PROVISIONING_REQUIRED')
    expect(db.insert).not.toHaveBeenCalled()
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('validation adds no permission or scope changes: the route keeps its single permission and the service no retry path', () => {
    const controller = readFileSync(join(__dirname, 'saas.controller.ts'), 'utf8')
    expect(controller).toMatch(/@Post\('customers\/provision'\)\s*@RequirePermission\('PLATFORM:CUSTOMER:PROVISION'\)/)
    const provision = readFileSync(join(__dirname, 'saas.service.ts'), 'utf8')
    expect(provision.match(/ensureSchemaProvisioned\(/g)).toHaveLength(1)
  })

  it('the validator is a pure domain module: no database, logging or audit access', () => {
    const source = readFileSync(join(__dirname, 'domain', 'customer-provision.domain.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(source).not.toMatch(/Logger|console\.|audit|drizzle|\bdb\b|process\.env/i)
  })
})

describe('the schema registry is not touched by validation', () => {
  it('constructing/validating never calls the registry service', () => {
    expect(CustomerSchemaRegistryService).toBeDefined()
    const { registry } = buildSaas()
    validateProvisionCustomerInput({})
    expect(registry.ensureSchemaProvisioned).not.toHaveBeenCalled()
  })
})
