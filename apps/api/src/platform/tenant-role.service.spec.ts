import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { CustomerAccessService } from './customer-access.service'
import { TenantRoleService } from './tenant-role.service'

/**
 * TASK-027.49 — tenant-role delegation. Every mutation is fail-closed twice: the route's
 * PermissionGuard/TenantMembershipGuard (not exercised here — see endpoint-authorization-
 * inventory.spec.ts) and this service's own independent re-check
 * (CustomerAccessService.assertCustomerAdminScope + the actor re-read from the database). No test
 * opens a real database.
 */
const ROOT = 'root-1'
const OTHER_ROOT = 'root-2'
const ACTOR = 'actor-1'
const TARGET = 'target-1'

function harness() {
  const db = buildMockDb()
  const customerAccess = new CustomerAccessService(db as never)
  const audit = { log: jest.fn(async () => undefined) }
  const service = new TenantRoleService(db as never, customerAccess, audit as never)
  return { db, audit, service }
}
type H = ReturnType<typeof harness>

/** Queues the exact db.select sequence CustomerAccessService.assertCustomerAdminScope makes:
 * (1) actor row is already queued by the caller — this only queues the two/three scope calls. */
function queueScopeSuccess(h: H, opts: { isSystemAdmin: boolean; tenantAdminAssignment?: boolean }) {
  h.db.select
    .mockReturnValueOnce(chain([{ id: ROOT, name: 'Root', slug: 'root', type: 'ROOT', status: 'ACTIVE', parentId: null, customerRootId: null }])) // resolveCustomerRoot: tenant lookup
    .mockReturnValueOnce(chain([{ id: ROOT, name: 'Root', slug: 'root', type: 'ROOT', status: 'ACTIVE' }])) // resolveCustomerRoot: customerRoot lookup
  if (!opts.isSystemAdmin) {
    h.db.select.mockReturnValueOnce(chain(opts.tenantAdminAssignment === false ? [] : [{ id: 'assignment-1' }])) // TENANT_ADMIN assignment check
  }
}

function queueActor(h: H, opts: { isSystemAdmin?: boolean; status?: string } = {}) {
  h.db.select.mockReturnValueOnce(chain([{ id: ACTOR, status: opts.status ?? 'ACTIVE', isSystemAdmin: opts.isSystemAdmin ?? false }]))
}

describe('requireActingRoot (shared by every method): impersonation, actor, scope', () => {
  it('refuses an impersonated session before any database call at all', async () => {
    const h = harness()
    const error = await h.service.listRoles(ACTOR, ROOT, { impersonation: true }).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(h.db.select).not.toHaveBeenCalled()
    expect(h.audit.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ reason: 'IMPERSONATION_SESSION' }) }))
  })

  it('refuses when the impersonatorUserId context field is set even without the impersonation flag', async () => {
    const h = harness()
    const error = await h.service.listRoles(ACTOR, ROOT, { impersonatorUserId: 'imp-1' }).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(h.db.select).not.toHaveBeenCalled()
  })

  it('refuses an inactive actor (re-read from the database, not trusted from the caller)', async () => {
    const h = harness()
    queueActor(h, { status: 'INACTIVE' })
    const error = await h.service.listRoles(ACTOR, ROOT, {}).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
  })

  it('refuses a non-existent actor', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([]))
    const error = await h.service.listRoles(ACTOR, ROOT, {}).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
  })

  it('a system administrator passes scope for any root', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: true })
    queueScopeSuccess(h, { isSystemAdmin: true })
    h.db.select.mockReturnValueOnce(chain([])) // listRoles' own tenantRoles query
    await expect(h.service.listRoles(ACTOR, ROOT, {})).resolves.toEqual([])
  })

  it('a TENANT_ADMIN of that exact root passes scope', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select.mockReturnValueOnce(chain([]))
    await expect(h.service.listRoles(ACTOR, ROOT, {})).resolves.toEqual([])
  })

  it('a non-admin actor without a TENANT_ADMIN assignment at that root is refused (unauthorized actor)', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: false })
    const error = await h.service.listRoles(ACTOR, ROOT, {}).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(h.audit.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ reason: 'SCOPE_DENIED' }) }))
  })

  it("a TENANT_ADMIN of root-1 cannot act on root-2 (another root's tenant) — scope resolution itself refuses it", async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    h.db.select
      .mockReturnValueOnce(chain([{ id: OTHER_ROOT, name: 'Other', slug: 'other', type: 'ROOT', status: 'ACTIVE', parentId: null, customerRootId: null }]))
      .mockReturnValueOnce(chain([{ id: OTHER_ROOT, name: 'Other', slug: 'other', type: 'ROOT', status: 'ACTIVE' }]))
      .mockReturnValueOnce(chain([])) // no TENANT_ADMIN assignment of actor at OTHER_ROOT
    const error = await h.service.listRoles(ACTOR, OTHER_ROOT, {}).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
  })
})

describe('assignRole', () => {
  const roleRow = { id: 'role-1', tenantId: ROOT, isActive: true }

  it('a TENANT_ADMIN can assign a role in their own root', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select
      .mockReturnValueOnce(chain([{ id: TARGET, status: 'ACTIVE' }])) // target user lookup
      .mockReturnValueOnce(chain([roleRow])) // role lookup
      .mockReturnValueOnce(chain([])) // role's own permission codes (none)
    h.db.insert.mockReturnValueOnce(chain([{ id: 'assign-1' }]))
    const result = await h.service.assignRole(ACTOR, ROOT, TARGET, 'role-1', {})
    expect(result).toEqual({ id: 'assign-1', userId: TARGET, roleId: 'role-1', tenantId: ROOT })
    expect(h.audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionCode: 'TENANT_ROLE_ASSIGNED', metadata: expect.objectContaining({ result: 'SUCCESS' }) }))
  })

  it('self-assignment is allowed (no separate self-service restriction — only the ceiling applies)', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select
      .mockReturnValueOnce(chain([{ id: ACTOR, status: 'ACTIVE' }])) // target = actor
      .mockReturnValueOnce(chain([roleRow]))
      .mockReturnValueOnce(chain([]))
    h.db.insert.mockReturnValueOnce(chain([{ id: 'assign-2' }]))
    await expect(h.service.assignRole(ACTOR, ROOT, ACTOR, 'role-1', {})).resolves.toEqual({ id: 'assign-2', userId: ACTOR, roleId: 'role-1', tenantId: ROOT })
  })

  it('an unauthorized actor cannot assign a role — refused before any target/role lookup', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: false })
    const error = await h.service.assignRole(ACTOR, ROOT, TARGET, 'role-1', {}).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(h.db.insert).not.toHaveBeenCalled()
  })

  it("assigning a role that belongs to another root is refused (cross-tenant role leak) even though the actor is a valid TENANT_ADMIN of their own root", async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select
      .mockReturnValueOnce(chain([{ id: TARGET, status: 'ACTIVE' }]))
      .mockReturnValueOnce(chain([{ id: 'role-x', tenantId: OTHER_ROOT, isActive: true }])) // role belongs to a different root
      .mockReturnValueOnce(chain([]))
    const error = await h.service.assignRole(ACTOR, ROOT, TARGET, 'role-x', {}).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(h.db.insert).not.toHaveBeenCalled()
  })

  it('assigning an unknown role fails closed (404-avoidant, static 403 — no role/tenant existence oracle for the actor)', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select
      .mockReturnValueOnce(chain([{ id: TARGET, status: 'ACTIVE' }]))
      .mockReturnValueOnce(chain([])) // role does not exist
    const error = await h.service.assignRole(ACTOR, ROOT, TARGET, 'missing-role', {}).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(h.db.insert).not.toHaveBeenCalled()
  })

  it('assigning to an unknown target user is a 404 and touches no insert', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select.mockReturnValueOnce(chain([])) // target does not exist
    const error = await h.service.assignRole(ACTOR, ROOT, 'missing-user', 'role-1', {}).catch(e => e)
    expect(error).toBeInstanceOf(NotFoundException)
    expect(h.db.insert).not.toHaveBeenCalled()
  })

  it('malformed target/role ids are rejected before any database call', async () => {
    const h = harness()
    expect(await h.service.assignRole(ACTOR, ROOT, 'a b;--', 'role-1', {}).catch(e => e)).toBeInstanceOf(BadRequestException)
    expect(h.db.select).not.toHaveBeenCalled()
  })

  it('a duplicate assignment (unique-constraint race, DB-level ON CONFLICT DO NOTHING) yields a deterministic 409, not a silent success', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select
      .mockReturnValueOnce(chain([{ id: TARGET, status: 'ACTIVE' }]))
      .mockReturnValueOnce(chain([roleRow]))
      .mockReturnValueOnce(chain([]))
    h.db.insert.mockReturnValueOnce(chain([])) // onConflictDoNothing().returning() → empty = the row already existed
    const error = await h.service.assignRole(ACTOR, ROOT, TARGET, 'role-1', {}).catch(e => e)
    expect(error).toBeInstanceOf(ConflictException)
    expect(h.audit.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ reason: 'ALREADY_ASSIGNED' }) }))
  })

  it('the insert always writes the resolved customerRootId, never a value that could come from the request body (no global-assignment path exists)', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'tenant-role.service.ts'), 'utf8')
    expect(source).toContain('.values({ userId: targetUserId, roleId, tenantId: customerRootId })')
    expect(source).not.toMatch(/tenantId:\s*(dto|body|input)\./)
  })

  it('the audit metadata for a successful assignment carries only ids/result — no credential, secret or token field', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select
      .mockReturnValueOnce(chain([{ id: TARGET, status: 'ACTIVE' }]))
      .mockReturnValueOnce(chain([roleRow]))
      .mockReturnValueOnce(chain([]))
    h.db.insert.mockReturnValueOnce(chain([{ id: 'assign-3' }]))
    await h.service.assignRole(ACTOR, ROOT, TARGET, 'role-1', {})
    const entry = (h.audit.log.mock.calls[0] as unknown[])[0]
    expect(JSON.stringify(entry)).not.toMatch(/secret|otp|recovery|token|password|hash/i)
  })
})

describe('revokeRole', () => {
  it('a TENANT_ADMIN can revoke a non-admin-flagged role assignment', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select.mockReturnValueOnce(chain([{ id: 'assign-1', userId: TARGET, roleId: 'role-1', isAdminRole: false }]))
    h.db.delete.mockReturnValueOnce(chain(undefined))
    await expect(h.service.revokeRole(ACTOR, ROOT, TARGET, 'assign-1', {})).resolves.toEqual({ success: true })
    expect(h.db.delete).toHaveBeenCalledTimes(1)
  })

  it('revoking an unknown/foreign assignment is a 404 and deletes nothing', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select.mockReturnValueOnce(chain([])) // no matching assignment in this root for this user
    const error = await h.service.revokeRole(ACTOR, ROOT, TARGET, 'missing-assignment', {}).catch(e => e)
    expect(error).toBeInstanceOf(NotFoundException)
    expect(h.db.delete).not.toHaveBeenCalled()
  })

  it("Tenant A's role assignment is invisible from Tenant B — the WHERE clause scopes by tenantId as well as assignment id", async () => {
    const h = harness()
    // queryActingRoot resolves ROOT (root-1); an assignment that exists but under a different
    // tenantId in the DB will not match the (id, tenantId, userId) triple, so the mock returning
    // [] here simulates exactly that — the query itself is what enforces the isolation.
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select.mockReturnValueOnce(chain([]))
    const error = await h.service.revokeRole(ACTOR, ROOT, TARGET, 'assign-from-root-2', {}).catch(e => e)
    expect(error).toBeInstanceOf(NotFoundException)
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'tenant-role.service.ts'), 'utf8')
    const revokeBody = source.slice(source.indexOf('async revokeRole'))
    expect(revokeBody).toContain('eq(userTenantRoleAssignments.tenantId, customerRootId)')
  })

  it('removing the last admin-flagged role assignment in the tenant is refused (last-tenant-admin floor) — locks the admin set, finds no other ACTIVE admin', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select
      .mockReturnValueOnce(chain([{ id: 'assign-1', userId: TARGET, roleId: 'admin-role', isAdminRole: true }])) // assignment lookup
      .mockReturnValueOnce(chain([{ id: 'admin-role' }])) // tx: admin-flagged roles in this tenant
      .mockReturnValueOnce(chain([{ id: 'assign-1', userId: TARGET }])) // tx: locked admin-role assignments FOR UPDATE — only this one
    const error = await h.service.revokeRole(ACTOR, ROOT, TARGET, 'assign-1', {}).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(h.db.delete).not.toHaveBeenCalled()
    expect(h.audit.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ reason: 'LAST_TENANT_ADMIN' }) }))
  })

  it('an admin-flagged assignment held by an INACTIVE user does not count as a surviving admin (AI1 review fix)', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select
      .mockReturnValueOnce(chain([{ id: 'assign-1', userId: TARGET, roleId: 'admin-role', isAdminRole: true }])) // assignment lookup
      .mockReturnValueOnce(chain([{ id: 'admin-role' }])) // tx: admin-flagged roles
      .mockReturnValueOnce(chain([{ id: 'assign-1', userId: TARGET }, { id: 'assign-2', userId: 'inactive-user' }])) // tx: locked assignments — a second one exists, but its user is inactive
      .mockReturnValueOnce(chain([])) // tx: ACTIVE users among {inactive-user} — none
    const error = await h.service.revokeRole(ACTOR, ROOT, TARGET, 'assign-1', {}).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(h.db.delete).not.toHaveBeenCalled()
  })

  it('removing an admin-flagged assignment succeeds when another ACTIVE admin-flagged assignment remains in the tenant', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select
      .mockReturnValueOnce(chain([{ id: 'assign-1', userId: TARGET, roleId: 'admin-role', isAdminRole: true }])) // assignment lookup
      .mockReturnValueOnce(chain([{ id: 'admin-role' }])) // tx: admin-flagged roles
      .mockReturnValueOnce(chain([{ id: 'assign-1', userId: TARGET }, { id: 'assign-2', userId: 'other-admin' }])) // tx: locked assignments
      .mockReturnValueOnce(chain([{ id: 'other-admin' }])) // tx: ACTIVE users among {other-admin}
    h.db.delete.mockReturnValueOnce(chain(undefined))
    await expect(h.service.revokeRole(ACTOR, ROOT, TARGET, 'assign-1', {})).resolves.toEqual({ success: true })
  })

  it('malformed ids are rejected before any database call', async () => {
    const h = harness()
    expect(await h.service.revokeRole(ACTOR, ROOT, 'a b', 'assign-1', {}).catch(e => e)).toBeInstanceOf(BadRequestException)
    expect(h.db.select).not.toHaveBeenCalled()
  })

  it("the last-admin count query filters by users.status = 'ACTIVE' (AI1 review: a mock can't prove this behaviourally — it returns whatever is configured regardless of the real WHERE clause — so this is a static check of the source)", () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'tenant-role.service.ts'), 'utf8')
    const revokeBody = source.slice(source.indexOf('async revokeRole'))
    const activeUsersQuery = revokeBody.slice(revokeBody.indexOf('const activeUserIds ='), revokeBody.indexOf('const otherActiveAdminAssignmentsInTenant ='))
    expect(activeUsersQuery).toContain("eq(users.status, 'ACTIVE')")
  })

  it('the last-admin check and the delete run inside the SAME transaction, with the admin-role assignments locked FOR UPDATE (AI1 review: atomicity against a concurrent revoke)', async () => {
    const h = harness()
    queueActor(h, { isSystemAdmin: false })
    queueScopeSuccess(h, { isSystemAdmin: false, tenantAdminAssignment: true })
    h.db.select
      .mockReturnValueOnce(chain([{ id: 'assign-1', userId: TARGET, roleId: 'admin-role', isAdminRole: true }]))
      .mockReturnValueOnce(chain([{ id: 'admin-role' }]))
    const lockedChain = chain([{ id: 'assign-1', userId: TARGET }])
    h.db.select.mockReturnValueOnce(lockedChain)
    h.db.delete.mockReturnValueOnce(chain(undefined))
    await h.service.revokeRole(ACTOR, ROOT, TARGET, 'assign-1', {}).catch(() => undefined)
    expect(h.db.transaction).toHaveBeenCalledTimes(1)
    expect(lockedChain.for).toHaveBeenCalledWith('update')
    // Non-admin-flagged revokes need no locking/transaction at all — only the admin-floor path does.
    const h2 = harness()
    queueActor(h2, { isSystemAdmin: false })
    queueScopeSuccess(h2, { isSystemAdmin: false, tenantAdminAssignment: true })
    h2.db.select.mockReturnValueOnce(chain([{ id: 'assign-2', userId: TARGET, roleId: 'role-x', isAdminRole: false }]))
    h2.db.delete.mockReturnValueOnce(chain(undefined))
    await h2.service.revokeRole(ACTOR, ROOT, TARGET, 'assign-2', {})
    expect(h2.db.transaction).not.toHaveBeenCalled()
  })
})

describe('structural: no path to a global or SYSTEM_ADMIN/TENANT_ADMIN system-role grant exists on this surface', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'tenant-role.service.ts'), 'utf8')
  const controller = require('node:fs').readFileSync(require('node:path').join(__dirname, 'tenant-role.controller.ts'), 'utf8')

  it('the service never imports or references systemRoles / userSystemRoleAssignments / users.isSystemAdmin write paths', () => {
    expect(source).not.toMatch(/systemRoles|userSystemRoleAssignments/)
    expect(source).not.toContain('set({ isSystemAdmin')
  })

  it('the assign body accepts only roleId — no tenantId field is ever read from the request body', () => {
    expect(controller).toContain('interface AssignTenantRoleBody {\n  roleId: string\n}')
  })

  it('this surface does not read canAggregateChildren or the tenant closure (root aggregation permission is not touched or widened)', () => {
    expect(source).not.toMatch(/canAggregateChildren|TenantClosureService|getDescendantTenantIds/)
  })
})
