import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { AuthController } from './auth.controller'
import { BootstrapController } from './bootstrap.controller'
import * as input from './domain/platform-input.domain'
import { MeController } from './me.controller'
import { RoleService } from './role.service'
import { SaasService } from './saas.service'
import { TenantService } from './tenant.service'
import { UserService } from './user.service'

/**
 * Q-DP20 (TASK-027.39): the platform module's plain-interface DTOs are validated by pure domain
 * validators before any query, hash, transaction or audit write. No test opens a database connection.
 */
const PASSWORD = 'Sup3r-secret-pass!'
const LEAK = 'Zz9-Leaky-Marker'
const LONG = (n: number) => 'x'.repeat(n)

function harness() {
  const db = buildMockDb()
  const authService = { hashNewPassword: jest.fn(async () => 'hash-value'), login: jest.fn() }
  const audit = { log: jest.fn(async () => undefined) }
  const customerAccess = {
    assertCustomerAdminScope: jest.fn(async () => ({ customerRoot: { id: 'root-1', slug: 'acme', type: 'ROOT' } })),
    assertTenantBelongsToCustomerRoot: jest.fn(async (id: string) => ({ id, slug: 'acme-child', type: 'STANDARD' })),
  }
  const closure = { createClosureForNewTenant: jest.fn(async () => undefined) }
  const registry = { ensureSchemaProvisioned: jest.fn() }
  const saas = new SaasService(db as never, authService as never, customerAccess as never, {} as never, {} as never, closure as never, registry as never, audit as never)
  const tenants = new TenantService(db as never, closure as never)
  const users = new UserService(db as never, authService as never, audit as never)
  const roles = new RoleService(db as never)
  const meService = { validateActiveTenant: jest.fn(async () => ({ ok: true })) }
  const me = new MeController(meService as never)
  const bootstrapService = { bootstrapInitialAdmin: jest.fn() }
  const bootstrap = new BootstrapController(bootstrapService as never)
  const auth = new AuthController(authService as never)
  return { db, authService, audit, customerAccess, closure, registry, saas, tenants, users, roles, me, meService, bootstrap, bootstrapService, auth }
}
type H = ReturnType<typeof harness>

/** Nothing may have been touched: no query, write, transaction, hash, audit, scope lookup or provisioning. */
function expectNoIo(h: H) {
  for (const fn of [h.db.select, h.db.insert, h.db.update, h.db.delete, h.db.transaction]) expect(fn).not.toHaveBeenCalled()
  expect(h.authService.hashNewPassword).not.toHaveBeenCalled()
  expect(h.audit.log).not.toHaveBeenCalled()
  expect(h.customerAccess.assertCustomerAdminScope).not.toHaveBeenCalled()
  expect(h.customerAccess.assertTenantBelongsToCustomerRoot).not.toHaveBeenCalled()
  expect(h.closure.createClosureForNewTenant).not.toHaveBeenCalled()
  expect(h.registry.ensureSchemaProvisioned).not.toHaveBeenCalled()
}

async function expectRejectedWithoutIo(h: H, call: () => Promise<unknown>) {
  const error = await call().catch(e => e)
  expect(error).toBeInstanceOf(BadRequestException)
  expectNoIo(h)
  return error as BadRequestException
}

interface Case {
  label: string
  call: (h: H) => Promise<unknown>
}

const NOSQL = { $ne: null }
const uid = 'user-1'

// ── Cases per endpoint ──────────────────────────────────────────────────────

const PKG = { code: 'PRO', name: 'Pro Paket', description: 'x', maxChildTenantCount: 5, maxUserCount: 10, maxStorageMb: 1024, maxDatabaseMb: 512 }
const packageCases = (override: Record<string, unknown>): Case => ({ label: JSON.stringify(override), call: h => h.saas.createPackage({ ...PKG, ...override } as never) })
const PACKAGE_INVALID: Case[] = [
  { code: undefined }, { code: '' }, { code: ' ' }, { code: 'A' }, { code: 7 }, { code: NOSQL }, { code: ['PRO'] },
  { name: undefined }, { name: '   ' }, { name: 'A' }, { name: 42 }, { name: NOSQL },
  { description: 5 }, { description: ['x'] },
  { maxChildTenantCount: undefined }, { maxUserCount: '10' }, { maxStorageMb: -1 }, { maxDatabaseMb: 1.5 }, { maxUserCount: 2_147_483_648 },
  { maxChildTenantCount: NaN }, { maxStorageMb: NOSQL }, { maxDatabaseMb: null },
].map(packageCases)

const CT = { name: 'Alt Birim', slug: 'alt-birim', canEnterData: true, canAggregateChildren: false }
const customerTenantCases = (override: Record<string, unknown>): Case => ({ label: JSON.stringify(override), call: h => h.saas.createCustomerTenant(uid, false, 'root-1', { ...CT, ...override } as never) })
const CUSTOMER_TENANT_INVALID: Case[] = [
  { name: undefined }, { name: '   ' }, { name: 'A' }, { name: LONG(101) }, { name: 5 }, { name: NOSQL },
  { slug: 5 }, { slug: LONG(101) }, { slug: '!!!' }, { slug: ['a'] },
  { parentTenantId: 5 }, { parentTenantId: NOSQL }, { parentTenantId: 'a b' }, { parentTenantId: LONG(101) },
  { canEnterData: 'true' }, { canAggregateChildren: 1 }, { canEnterData: NOSQL },
].map(customerTenantCases)

const CU = { email: 'kisi@example.test', displayName: 'Kişi Adı', password: PASSWORD, tenantId: 'tenant-1' }
const customerUserCases = (override: Record<string, unknown>): Case => ({ label: JSON.stringify(override), call: h => h.saas.createCustomerUser(uid, false, 'root-1', { ...CU, ...override } as never) })
const CUSTOMER_USER_INVALID: Case[] = [
  { email: undefined }, { email: ' ' }, { email: 'no-at' }, { email: `${LONG(250)}@x.co` }, { email: NOSQL }, { email: ['a@b.co'] },
  { displayName: undefined }, { displayName: ' ' }, { displayName: 'A' }, { displayName: LONG(101) }, { displayName: 5 },
  { password: undefined }, { password: '' }, { password: 'Aa1aaaa' }, { password: 'A1' + 'a'.repeat(127) }, { password: 'nouppercase1' }, { password: 'NOLOWERCASE1' }, { password: 'NoDigitsHere' }, { password: 12345678 }, { password: NOSQL },
  { tenantId: 5 }, { tenantId: NOSQL }, { tenantId: 'a b' },
].map(customerUserCases)

const MEMBERSHIP_INVALID: Case[] = [
  { tenantId: undefined }, { tenantId: '' }, { tenantId: 5 }, { tenantId: NOSQL }, { tenantId: ['t'] }, { tenantId: 'a b;--' }, { tenantId: LONG(101) },
].map(override => ({ label: JSON.stringify(override), call: (h: H) => h.saas.addCustomerUserMembership(uid, false, 'root-1', 'target-1', override as never) }))

const BAD_BODIES: unknown[] = [null, undefined, 'text', 5, [], [{}]]

const UPDATE_NAME_INVALID: Case[] = [
  ...[{ displayName: 5 }, { displayName: ' ' }, { displayName: 'A' }, { displayName: LONG(101) }, { displayName: NOSQL }, { displayName: ['x'] }].flatMap(body => [
    { label: `customer ${JSON.stringify(body)}`, call: (h: H) => h.saas.updateCustomerUser(uid, false, 'root-1', 'target-1', body as never) },
    { label: `platform ${JSON.stringify(body)}`, call: (h: H) => h.users.update('target-1', body as never, uid) },
  ]),
  ...BAD_BODIES.flatMap(body => [
    { label: `customer body ${JSON.stringify(body)}`, call: (h: H) => h.saas.updateCustomerUser(uid, false, 'root-1', 'target-1', body as never) },
    { label: `platform body ${JSON.stringify(body)}`, call: (h: H) => h.users.update('target-1', body as never, uid) },
  ]),
  { label: 'customer bad user id', call: (h: H) => h.saas.updateCustomerUser(uid, false, 'root-1', 'a b', { displayName: 'Ali' }) },
  { label: 'platform bad user id', call: (h: H) => h.users.update('x;drop', { displayName: 'Ali' }, uid) },
]

const PASSWORD_INVALID: Case[] = [undefined, '', 'Aa1aaaa', 'A1' + 'a'.repeat(127), 'nouppercase1', 'NOLOWERCASE1', 'NoDigitsHere', 12345678, NOSQL, ['Sup3r-secret-pass!']].flatMap(password => [
  { label: `customer ${JSON.stringify(password)}`, call: (h: H) => h.saas.setCustomerUserPassword(uid, false, 'root-1', 'target-1', password as never) },
  { label: `platform ${JSON.stringify(password)}`, call: (h: H) => h.users.setPassword('target-1', password as never, uid) },
])

const UC = { email: 'kisi@example.test', displayName: 'Kişi Adı', password: PASSWORD }
const PLATFORM_USER_INVALID: Case[] = [
  { email: undefined }, { email: 'no-at' }, { email: NOSQL }, { email: `${LONG(250)}@x.co` },
  { displayName: undefined }, { displayName: 'A' }, { displayName: LONG(101) }, { displayName: 5 },
  { password: undefined }, { password: 'weak' }, { password: 'A1' + 'a'.repeat(127) }, { password: NOSQL },
].map(override => ({ label: JSON.stringify(override), call: (h: H) => h.users.create({ ...UC, ...override } as never, uid) }))
  .concat(BAD_BODIES.map(body => ({ label: `body ${JSON.stringify(body)}`, call: (h: H) => h.users.create(body as never, uid) })))

const ROLE_INVALID: Case[] = [
  ...[{ roleId: undefined }, { roleId: '' }, { roleId: 5 }, { roleId: NOSQL }, { roleId: 'a b' }, { roleId: 'r1', tenantId: 5 }, { roleId: 'r1', tenantId: NOSQL }, { roleId: 'r1', tenantId: 'a b' }].map(body => ({
    label: `assignRole ${JSON.stringify(body)}`, call: (h: H) => h.users.assignRole('target-1', body as never, uid) })),
  { label: 'assignRole bad user id', call: (h: H) => h.users.assignRole('a b', { roleId: 'r1' }, uid) },
  ...BAD_BODIES.map(body => ({ label: `assignRole body ${JSON.stringify(body)}`, call: (h: H) => h.users.assignRole('target-1', body as never, uid) })),
  ...['', 5, NOSQL, ['t'], 'a b', LONG(101)].map(tenantId => ({ label: `user addMembership ${JSON.stringify(tenantId)}`, call: (h: H) => h.users.addMembership('target-1', tenantId as never, uid) })),
  { label: 'user addMembership bad user id', call: (h: H) => h.users.addMembership('a;b', 'tenant-1', uid) },
]

const TENANT_INVALID: Case[] = [
  ...[{ name: undefined }, { name: ' ' }, { name: 'A' }, { name: LONG(101) }, { name: 5 }, { name: NOSQL },
    { slug: 5 }, { slug: LONG(101) }, { slug: '---' }, { parentId: 5 }, { parentId: NOSQL }, { parentId: ['p'] }, { parentId: 'a b' },
    { canEnterData: 'yes' }, { canAggregateChildren: NOSQL }].map(override => ({
    label: `create ${JSON.stringify(override)}`, call: (h: H) => h.tenants.create({ name: 'Alt', parentId: 'parent-1', ...override } as never) })),
  ...[null, [], 'x', 5].map(body => ({ label: `create body ${JSON.stringify(body)}`, call: (h: H) => h.tenants.create(body as never) })),
  ...[{ name: 5 }, { name: ' ' }, { name: 'A' }, { name: LONG(101) }, { name: NOSQL }, { packageId: 5 }, { packageId: NOSQL }, { packageId: 'a b' }].map(body => ({
    label: `update ${JSON.stringify(body)}`, call: (h: H) => h.tenants.update('tenant-1', body as never) })),
  { label: 'update bad tenant id', call: (h: H) => h.tenants.update('a b', { name: 'Ok Ad' }) },
  ...[{ userId: undefined }, { userId: '' }, { userId: 5 }, { userId: NOSQL }, { userId: 'a b' }].map(body => ({
    label: `addMember ${JSON.stringify(body)}`, call: (h: H) => h.tenants.addMember('tenant-1', body as never) })),
  { label: 'addMember bad tenant id', call: (h: H) => h.tenants.addMember('a b', { userId: 'u1' }) },
  ...[{ q: ['a', 'b'] }, { q: LONG(101) }, { q: NOSQL }, { status: 'DROP' }, { status: ['ACTIVE'] }, { status: NOSQL }].map(query => ({
    label: `list ${JSON.stringify(query)}`, call: (h: H) => h.tenants.list(query as never) })),
  ...[{ q: ['a'] }, { q: LONG(101) }, { status: 'NOPE' }, { status: NOSQL }, { isSystemAdmin: 'maybe' }, { isSystemAdmin: ['true'] }].map(query => ({
    label: `user list ${JSON.stringify(query)}`, call: (h: H) => h.users.list(query as never) })),
]

const ROLES_INVALID: Case[] = [
  ...[{ name: undefined }, { name: 5 }, { name: NOSQL }, { name: ['R'] }, { name: 'A' }, { name: LONG(65) }, { name: 'bad name!' }, { name: 'SYSTEM_ADMIN' },
    { name: 'CUSTOM', description: 5 }, { name: 'CUSTOM', description: LONG(201) }, { name: 'CUSTOM', description: NOSQL }].map(body => ({
    label: `create ${JSON.stringify(body)}`, call: (h: H) => h.roles.create(body as never) })),
  ...BAD_BODIES.map(body => ({ label: `create body ${JSON.stringify(body)}`, call: (h: H) => h.roles.create(body as never) })),
  ...[undefined, '', 5, NOSQL, ['PLATFORM:USER:VIEW'], 'lowercase:code', 'NOCOLON', "PLATFORM:USER:VIEW'; DROP", LONG(101), 'PLATFORM::VIEW'].map(permissionCode => ({
    label: `assignPermission ${JSON.stringify(permissionCode)}`, call: (h: H) => h.roles.assignPermission('role-1', { permissionCode } as never) })),
  { label: 'assignPermission bad role id', call: (h: H) => h.roles.assignPermission('a b', { permissionCode: 'PLATFORM:USER:VIEW' }) },
  ...BAD_BODIES.map(body => ({ label: `assignPermission body ${JSON.stringify(body)}`, call: (h: H) => h.roles.assignPermission('role-1', body as never) })),
]

const ALL: Array<[string, Case[]]> = [
  ['createPackage', PACKAGE_INVALID],
  ['CustomerAdminCreateTenantDto', CUSTOMER_TENANT_INVALID],
  ['CustomerAdminCreateUserDto', CUSTOMER_USER_INVALID],
  ['AddMembershipDto', MEMBERSHIP_INVALID],
  ['display-name updates', UPDATE_NAME_INVALID],
  ['set-password (customer + platform)', PASSWORD_INVALID],
  ['CreateUserDto', PLATFORM_USER_INVALID],
  ['role / membership assignment', ROLE_INVALID],
  ['tenants and list queries', TENANT_INVALID],
  ['roles', ROLES_INVALID],
]

describe.each(ALL)('%s rejects invalid input before any I/O', (_name, cases) => {
  it.each(cases.map(c => [c.label, c] as const))('%s', async (_label, c) => {
    const h = harness()
    await expectRejectedWithoutIo(h, () => c.call(h))
  })
})

describe('controller-level entry points', () => {
  it.each([undefined, '', 5, NOSQL, ['t'], 'a b', LONG(101)])('setActiveTenant rejects tenantId %j without calling the service', async tenantId => {
    const h = harness()
    await expect(h.me.setActiveTenant({ tenantId } as never, { id: uid, email: 'a@b.co', isSystemAdmin: false })).rejects.toBeInstanceOf(BadRequestException)
    expect(h.meService.validateActiveTenant).not.toHaveBeenCalled()
  })

  it('setActiveTenant accepts a valid id and delegates unchanged', async () => {
    const h = harness()
    await h.me.setActiveTenant({ tenantId: 'tenant-1' }, { id: uid, email: 'a@b.co', isSystemAdmin: false })
    expect(h.meService.validateActiveTenant).toHaveBeenCalledWith(uid, 'tenant-1', false)
  })

  const req = { ip: '127.0.0.1', get: () => 'ua' } as never
  const res = { cookie: jest.fn() } as never
  it.each([
    { email: NOSQL, password: 'x' }, { email: ['a@b.co'], password: 'x' }, { email: 'a@b.co', password: NOSQL }, { email: 'a@b.co', password: LONG(1025) },
    { email: LONG(255), password: 'x' }, { email: 5, password: 'x' },
  ])('login rejects a non-string / oversized credential body %j before touching AuthService', async body => {
    const h = harness()
    await expect(h.auth.login(body as never, req, res)).rejects.toBeInstanceOf(BadRequestException)
    expect(h.authService.login).not.toHaveBeenCalled()
  })

  it('login keeps its existing static failure reasons for missing credentials', async () => {
    const h = harness()
    const error = await h.auth.login({ email: 'a@b.co' }, req, res).catch(e => e)
    expect(error).toBeInstanceOf(BadRequestException)
    expect(h.authService.login).not.toHaveBeenCalled()
  })

  it.each([
    { tenantName: NOSQL, email: 'a@b.co', password: PASSWORD, displayName: 'Ad' },
    { tenantName: 'T', email: ['a@b.co'], password: PASSWORD, displayName: 'Ad' },
    { tenantName: 'T', email: 'a@b.co', password: NOSQL, displayName: 'Ad' },
    { tenantName: 'T', email: 'a@b.co', password: PASSWORD, displayName: 5 },
    { tenantName: 'T', tenantSlug: 5, email: 'a@b.co', password: PASSWORD, displayName: 'Ad' },
    { tenantName: LONG(101), email: 'a@b.co', password: PASSWORD, displayName: 'Ad' },
  ])('bootstrap rejects wrongly typed / oversized bodies %j without calling the service', async body => {
    const h = harness()
    await expect(h.bootstrap.bootstrap(body as never)).rejects.toBeInstanceOf(BadRequestException)
    expect(h.bootstrapService.bootstrapInitialAdmin).not.toHaveBeenCalled()
  })
})

describe('error messages are static and never echo input', () => {
  it('no validator error contains any supplied value, password or hash', async () => {
    const h = harness()
    const bad = { email: `${LEAK}@@x`, displayName: LEAK.repeat(20), password: LEAK.toLowerCase(), tenantId: `${LEAK} bad id`, name: LEAK.repeat(20), code: `${LEAK} ??`, slug: LEAK, permissionCode: `${LEAK}'`, roleId: `${LEAK} `, packageId: `${LEAK} `, userId: `${LEAK} ` }
    const validators = Object.entries(input).filter(([name]) => name.startsWith('validate') && name !== 'validateId')
    for (const [, validator] of validators) {
      const result = (validator as (value: unknown) => input.InputValidation)(bad)
      expect(JSON.stringify(result.errors)).not.toMatch(/Leaky|Marker|hash|cust_|postgres|connection|SELECT|INSERT/i)
    }
    const error = await h.saas.createCustomerUser(uid, false, 'root-1', bad as never).catch(e => e)
    expect(JSON.stringify(error.getResponse())).not.toMatch(/Leaky|Marker|hash-value/i)
    expectNoIo(h)
  })

  it('password errors come only from the canonical policy text and never contain the password', async () => {
    const h = harness()
    const error = await h.saas.setCustomerUserPassword(uid, false, 'root-1', 'target-1', 'lowercase123').catch(e => e)
    const body = JSON.stringify(error.getResponse())
    expect(body).toContain('büyük harf')
    expect(body).not.toContain('lowercase123')
  })
})

describe('valid input keeps the existing behaviour', () => {
  it('createPackage: trims/uppercases the code and inserts once', async () => {
    const h = harness()
    const insert = chain([{ id: 'pkg-1' }])
    h.db.insert.mockReturnValueOnce(insert)
    await h.saas.createPackage({ ...PKG, code: ' pro-1 ' })
    expect(insert.values).toHaveBeenCalledWith(expect.objectContaining({ code: 'PRO-1', name: 'Pro Paket', isActive: true }))
  })

  it.each(['PRO PLUS', 'pro.plus', 'Başlangıç-1', 'a_b/c', 'x'.repeat(120), '  ab  '])(
    'createPackage does not narrow the accepted code format: %j is still accepted (only type, trim and min length 2 are enforced)',
    async code => {
      const h = harness()
      const insert = chain([{ id: 'pkg-1' }])
      h.db.insert.mockReturnValueOnce(insert)
      await expect(h.saas.createPackage({ ...PKG, code })).resolves.toBeDefined()
      expect(insert.values).toHaveBeenCalledWith(expect.objectContaining({ code: code.trim().toUpperCase() }))
    },
  )

  it.each([
    ['a 300-character name', { name: 'N'.repeat(300) }],
    ['a 5000-character description', { description: 'd'.repeat(5000) }],
    ['a padded 2-character name', { name: '  Ab  ' }],
  ])('createPackage imposes no maximum on name/description: %s is accepted', async (_label, override) => {
    const h = harness()
    h.db.insert.mockReturnValueOnce(chain([{ id: 'pkg-1' }]))
    await expect(h.saas.createPackage({ ...PKG, ...override })).resolves.toBeDefined()
  })

  it('createPackage still rejects a blank or 1-character name and non-string name/description', () => {
    for (const override of [{ name: '   ' }, { name: 'A' }, { name: undefined }, { name: 5 }, { description: 5 }, { description: NOSQL }]) {
      expect(input.validateCreateResourcePackage({ ...PKG, ...override }).valid).toBe(false)
    }
  })

  it('createPackage accepts zero limits and a missing description', async () => {
    const h = harness()
    h.db.insert.mockReturnValueOnce(chain([{ id: 'pkg-1' }]))
    await expect(h.saas.createPackage({ ...PKG, description: undefined, maxChildTenantCount: 0 })).resolves.toBeDefined()
  })

  it('customer-admin tenant/user creation still runs the scope check first-class (valid input reaches it)', async () => {
    const h = harness()
    h.customerAccess.assertCustomerAdminScope.mockRejectedValueOnce(new ForbiddenException('scope'))
    await expect(h.saas.createCustomerTenant(uid, false, 'other-root', CT as never)).rejects.toBeInstanceOf(ForbiddenException)
    h.customerAccess.assertCustomerAdminScope.mockRejectedValueOnce(new ForbiddenException('scope'))
    await expect(h.saas.createCustomerUser(uid, false, 'other-root', CU as never)).rejects.toBeInstanceOf(ForbiddenException)
    expect(h.db.insert).not.toHaveBeenCalled()
    expect(h.db.transaction).not.toHaveBeenCalled()
    expect(h.authService.hashNewPassword).not.toHaveBeenCalled()
  })

  it('a parent tenant outside the caller’s customer root is still refused after validation, with no write', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ resourcePackage: { maxChildTenantCount: 5, maxUserCount: 5 }, subscription: { status: 'ACTIVE' } }]))
    h.customerAccess.assertTenantBelongsToCustomerRoot.mockRejectedValueOnce(new NotFoundException('yok'))
    const error = await h.saas.addCustomerUserMembership(uid, false, 'root-1', 'target-1', { tenantId: 'foreign-tenant' }).catch(e => e)
    expect(error).toBeInstanceOf(NotFoundException)
    expect(h.db.insert).not.toHaveBeenCalled()
  })

  it('a valid membership body reaches the scope check exactly once', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ user: { id: 'target-1', isSystemAdmin: false } }])).mockReturnValueOnce(chain([]))
    h.db.insert.mockReturnValueOnce(chain([{ id: 'm-1' }]))
    await h.saas.addCustomerUserMembership(uid, false, 'root-1', 'target-1', { tenantId: 'tenant-1' })
    expect(h.customerAccess.assertTenantBelongsToCustomerRoot).toHaveBeenCalledTimes(1)
  })

  it('platform user creation still hashes once, inserts and audits without the password', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([]))
    h.db.insert.mockReturnValueOnce(chain([{ id: 'u-1', email: 'kisi@example.test', displayName: 'Kişi Adı', isSystemAdmin: false, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() }]))
    await h.users.create({ ...UC }, uid)
    expect(h.authService.hashNewPassword).toHaveBeenCalledTimes(1)
    expect(h.audit.log).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(h.audit.log.mock.calls)).not.toContain(PASSWORD)
  })

  it('role creation and permission assignment keep their existing rules for valid bodies', async () => {
    const h = harness()
    h.db.insert.mockReturnValueOnce(chain([{ id: 'r-1', name: 'CUSTOM_ROLE', description: null, isBuiltin: false }]))
    await expect(h.roles.create({ name: 'custom_role' })).resolves.toMatchObject({ name: 'CUSTOM_ROLE' })
    h.db.select.mockReturnValueOnce(chain([]))
    await expect(h.roles.assignPermission('role-1', { permissionCode: 'PLATFORM:USER:VIEW' })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('tenant list keeps accepting the values the web sends (q, ACTIVE/SUSPENDED/ARCHIVED, empty status)', () => {
    for (const query of [{}, { q: 'acme' }, { status: 'ACTIVE' }, { status: '' }, { q: 'a', status: 'ARCHIVED' }]) {
      expect(input.validateTenantListQuery(query).valid).toBe(true)
    }
    for (const query of [{}, { status: 'LOCKED' }, { isSystemAdmin: 'true' }, { q: 'x' }]) {
      expect(input.validateUserListQuery(query).valid).toBe(true)
    }
  })

  it('platform child-tenant free-text slugs (normalised by the service) are still accepted', () => {
    for (const slug of ['Global Lojistik', 'alt-birim', undefined, '', 'Çay Evi']) {
      expect(input.validateCreateTenant({ name: 'Alt', parentId: 'p1', slug }).valid).toBe(true)
      expect(input.validateCustomerAdminCreateTenant({ name: 'Alt', slug }).valid).toBe(true)
    }
  })

  it('the generic tenant API stays fail-closed for a parentless request (no validation shortcut)', async () => {
    const h = harness()
    for (const body of [{ name: 'Acme' }, { name: 'Acme', parentId: null }, { name: 'Acme', parentId: '' }, { name: 'Acme', type: 'ROOT' }]) {
      const error = await h.tenants.create(body as never).catch(e => e)
      expect((error.getResponse() as { code: string }).code).toBe('ROOT_PROVISIONING_REQUIRED')
    }
    expectNoIo(h)
  })

  it('privileged fields in a body are never read: isSystemAdmin / type / status cannot be smuggled into a user or tenant create', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([]))
    const insert = chain([{ id: 'u-1', email: 'kisi@example.test', displayName: 'Kişi Adı', isSystemAdmin: false, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() }])
    h.db.insert.mockReturnValueOnce(insert)
    await h.users.create({ ...UC, isSystemAdmin: true, status: 'LOCKED' } as never, uid)
    expect(insert.values).toHaveBeenCalledWith(expect.objectContaining({ isSystemAdmin: false, status: 'ACTIVE' }))
  })
})

describe('static guarantees', () => {
  const SRC = join(__dirname, '..')
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]))
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const domain = strip(readFileSync(join(__dirname, 'domain', 'platform-input.domain.ts'), 'utf8'))
  const read = (name: string) => strip(readFileSync(join(__dirname, name), 'utf8'))

  it('adds no global validation framework and no new dependency', () => {
    expect(files(SRC).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts')).some(f => /ValidationPipe|useGlobalPipes|APP_PIPE/.test(readFileSync(f, 'utf8')))).toBe(false)
    expect(domain).not.toMatch(/class-validator|class-transformer|zod|joi|from 'nestjs/i)
    const deps = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    expect(Object.keys(deps.dependencies)).not.toEqual(expect.arrayContaining(['zod', 'joi', 'ajv']))
  })

  it('validators are pure: no database, logging, audit, environment or I/O access', () => {
    expect(domain).not.toMatch(/Logger|console\.|audit|drizzle|\bdb\b|process\.env|readFile|fetch\(|@nestjs/i)
    expect(domain.match(/^import .*$/gm)?.sort()).toEqual(
      [
        "import { validatePasswordStrength } from './auth.domain'",
        "import { validateRoleCreation } from './system-role.domain'",
        "import { isValidEmail } from './user.domain'",
      ].sort(),
    )
  })

  it('every service entry point calls its validator before its first database access', () => {
    const expectations: Array<[string, string, string]> = [
      ['saas.service.ts', 'async createPackage', 'validateCreateResourcePackage'],
      ['saas.service.ts', 'async createCustomerTenant', 'validateCustomerAdminCreateTenant'],
      ['saas.service.ts', 'async createCustomerUser', 'validateCustomerAdminCreateUser'],
      ['saas.service.ts', 'async updateCustomerUser', 'validateUpdateDisplayName'],
      ['saas.service.ts', 'async setCustomerUserPassword', 'validateSetPassword'],
      ['saas.service.ts', 'async addCustomerUserMembership', 'validateAddMembership'],
      ['tenant.service.ts', 'async create(', 'validateCreateTenant'],
      ['tenant.service.ts', 'async update(', 'validateUpdateTenant'],
      ['tenant.service.ts', 'async addMember(', 'validateAddMember'],
      ['tenant.service.ts', 'async list(', 'validateTenantListQuery'],
      ['user.service.ts', 'async create(', 'validateCreateUser'],
      ['user.service.ts', 'async update(', 'validateUpdateDisplayName'],
      ['user.service.ts', 'async setPassword(', 'validateSetPassword'],
      ['user.service.ts', 'async assignRole(', 'validateAssignRole'],
      ['user.service.ts', 'async list(', 'validateUserListQuery'],
      ['role.service.ts', 'async create(', 'validateCreateRole'],
      ['role.service.ts', 'async assignPermission(', 'validateAssignPermission'],
    ]
    for (const [file, method, validator] of expectations) {
      const source = read(file)
      const body = source.slice(source.indexOf(method))
      const validatorAt = body.indexOf(`${validator}(`)
      const firstIo = body.search(/this\.(db|customerAccessService|authService|auditService)\b|await this\./)
      expect(validatorAt).toBeGreaterThan(-1)
      expect(validatorAt).toBeLessThan(firstIo)
    }
  })

  it('controllers still carry their permission decorators (no permission bypass added)', () => {
    for (const [file, expected] of [
      ['saas.controller.ts', ['PLATFORM:PACKAGE:MANAGE', 'PLATFORM:CUSTOMER:PROVISION', 'CUSTOMER:ADMIN:MANAGE']],
      ['tenant.controller.ts', ['PLATFORM:TENANT:CREATE', 'PLATFORM:TENANT:UPDATE']],
      ['user.controller.ts', ['PLATFORM:USER:CREATE', 'PLATFORM:USER:UPDATE', 'PLATFORM:USER:ASSIGN_ROLE']],
      ['role.controller.ts', ['PLATFORM:ROLE:CREATE', 'PLATFORM:PERMISSION:ASSIGN']],
    ] as const) {
      const source = readFileSync(join(__dirname, file), 'utf8')
      for (const permission of expected) expect(source).toContain(`@RequirePermission('${permission}')`)
      expect(source).toContain('@UseGuards(JwtAuthGuard, PermissionGuard, MfaEnforcementGuard)')
    }
  })

  it('services do not log credentials and validators are not bypassed by an isSystemAdmin/PLATFORM_ROOT shortcut', () => {
    for (const file of ['saas.service.ts', 'tenant.service.ts', 'user.service.ts', 'role.service.ts']) {
      const source = read(file)
      expect(source).not.toMatch(/console\.|logger\.\w+\([^)]*(password|hash)/i)
    }
    expect(domain).not.toMatch(/PLATFORM_ROOT|TENANT_ADMIN|bypass/i)
    // isSystemAdmin appears only as the user-list filter key, never as a way to skip validation.
    expect(domain.match(/isSystemAdmin/g)).toHaveLength(1)
  })
})
