import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUILTIN_PERMISSIONS, BUILTIN_ROLES, BUILTIN_ROLE_NAMES } from './domain/system-role.domain'

/**
 * TASK-027.43 — evidence pins for the Q-DP24 decision package
 * (docs/migration/METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md). Static, read-only: these tests change no
 * behaviour. They fail when a fact the decision rests on changes, so the package cannot silently go stale.
 */
const SRC = join(__dirname, '..')
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const production = walk(SRC).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.includes('/db/schema/') && !f.includes('/migration/'))
const read = (rel: string) => strip(readFileSync(join(SRC, rel), 'utf8'))

describe('E1 — catalogue and built-in roles', () => {
  it('has 30 catalogue permissions and exactly three built-in roles', () => {
    expect(BUILTIN_PERMISSIONS).toHaveLength(30)
    expect([...BUILTIN_ROLE_NAMES]).toEqual(['SYSTEM_ADMIN', 'TENANT_ADMIN', 'VIEWER'])
    expect(BUILTIN_ROLES.map(r => r.name)).toEqual(['SYSTEM_ADMIN', 'TENANT_ADMIN', 'VIEWER'])
  })

  it('SYSTEM_ADMIN holds the whole catalogue; TENANT_ADMIN carries PLATFORM:USER/TENANT write permissions (relevant only when assigned GLOBALLY)', () => {
    const byName = Object.fromEntries(BUILTIN_ROLES.map(r => [r.name, r.permissions]))
    expect(byName['SYSTEM_ADMIN']).toEqual([...BUILTIN_PERMISSIONS])
    expect(byName['TENANT_ADMIN']).toEqual(expect.arrayContaining(['PLATFORM:USER:CREATE', 'PLATFORM:USER:UPDATE', 'PLATFORM:TENANT:CREATE', 'PLATFORM:TENANT:UPDATE', 'CUSTOMER:ADMIN:MANAGE']))
    expect(byName['TENANT_ADMIN']).not.toContain('PLATFORM:USER:ASSIGN_ROLE')
    expect(byName['TENANT_ADMIN']).not.toContain('PLATFORM:USER:REVOKE_ROLE')
  })

  it('the tenant-settings permission codes used by the controllers are NOT in the catalogue (catalogue gap; only the system-admin flag and TENANT_ADMIN reach them)', () => {
    const codes = ['SETTINGS:SMTP:VIEW', 'SETTINGS:SMTP:MANAGE', 'SETTINGS:AI_PROVIDER:VIEW', 'SETTINGS:AI_PROVIDER:MANAGE']
    for (const code of codes) {
      expect(BUILTIN_PERMISSIONS as readonly string[]).not.toContain(code)
      expect(readFileSync(join(SRC, 'settings', 'tenant-settings-smtp.controller.ts'), 'utf8') + readFileSync(join(SRC, 'settings', 'tenant-settings-ai.controller.ts'), 'utf8')).toContain(code)
    }
  })
})

describe('E2 — how PermissionGuard resolves roles', () => {
  const guard = read('platform/permission.guard.ts')

  it('the system-admin flag short-circuits before any role lookup', () => {
    expect(guard.indexOf('if (user.isSystemAdmin) return true')).toBeGreaterThan(-1)
    expect(guard.indexOf('if (user.isSystemAdmin) return true')).toBeLessThan(guard.indexOf('.from(userSystemRoleAssignments)'))
  })

  it('PLATFORM:* permissions come only from GLOBAL (tenantId IS NULL) system-role assignments', () => {
    const platform = guard.slice(guard.indexOf("required.startsWith('PLATFORM:')"), guard.indexOf('} else if (tenantId)'))
    expect(platform).toContain('isNull(userSystemRoleAssignments.tenantId)')
    expect(platform).toContain('rolePermissions')
  })

  it('non-PLATFORM permissions: a TENANT_ADMIN assignment at the customer root grants EVERYTHING (its permission list is not consulted); other system roles assigned at a tenant are inert; tenant roles are read from tenantRolePermissions', () => {
    const tenantBranch = guard.slice(guard.indexOf('} else if (tenantId)'))
    expect(tenantBranch).toContain("eq(systemRoles.name, 'TENANT_ADMIN')")
    expect(tenantBranch).toContain('if (tenantAdminAssignment) return true')
    expect(tenantBranch).toContain('tenantRolePermissions.permissionCode')
    expect(tenantBranch).not.toContain('rolePermissions.roleId') // system-role permission lists are never used at tenant scope
  })
})

describe('E3 — tenant roles have no management surface', () => {
  it('tenant_roles / tenant_role_permissions / user_tenant_role_assignments are only READ by production code (no insert/update/delete anywhere)', () => {
    const writers = production.filter(file => {
      const source = strip(readFileSync(file, 'utf8'))
      return /\.(insert|update|delete)\(\s*(tenantRoles|tenantRolePermissions|userTenantRoleAssignments)\b/.test(source)
    })
    expect(writers.map(f => f.replace(SRC + '/', ''))).toEqual([])
  })

  it('customer-admin exposes no role or permission endpoint, so a customer admin cannot promote anyone', () => {
    const controller = readFileSync(join(SRC, 'platform', 'saas.controller.ts'), 'utf8')
    const customerAdmin = controller.slice(controller.indexOf("@Controller('customer-admin')"))
    expect(customerAdmin).not.toMatch(/assignRole|revokeRole|@(Get|Post|Patch|Delete|Put)\('[^']*(role|permission)[^']*'\)/i)
  })
})

describe('E4 — role assignment surface (platform/users)', () => {
  const service = read('platform/user.service.ts')

  it('the assignable catalogue is every system role, SYSTEM_ADMIN included', () => {
    const body = service.slice(service.indexOf('async listAssignableRoles'), service.indexOf('async listAssignableTenants'))
    expect(body).toContain('.from(systemRoles)')
    expect(body).not.toMatch(/where\(/)
  })

  it('assignRole validates neither the tenant type nor that a tenant-scoped role is meaningful there (a TENANT_ADMIN assignment is accepted for any tenant id)', () => {
    const body = service.slice(service.indexOf('async assignRole'), service.indexOf('async revokeRole'))
    expect(body).not.toMatch(/tenant\.type|type ===|PLATFORM_ROOT|'ROOT'/)
  })

  it('the SYSTEM_ADMIN role and the users.isSystemAdmin flag are two representations kept in sync only by assignRole/revokeRole and bootstrap', () => {
    expect(service).toContain("set({ isSystemAdmin: true })")
    expect(service).toContain("set({ isSystemAdmin: false })")
    const bootstrap = read('platform/bootstrap.service.ts')
    expect(bootstrap).toContain('isSystemAdmin: true')
    expect(bootstrap).toContain("userSystemRoleAssignments).values({ userId: user.id, roleId: systemAdminRole.id, tenantId: null })")
  })

  it('the two last-administrator guards count different things (revoke: SYSTEM_ADMIN assignments; deactivate: ACTIVE users with the flag)', () => {
    const revoke = service.slice(service.indexOf('async revokeRole'), service.indexOf('async listMemberships'))
    expect(revoke).toContain("eq(systemRoles.name, 'SYSTEM_ADMIN')")
    const deactivate = service.slice(service.indexOf('async deactivate'), service.indexOf('async listAssignableRoles'))
    expect(deactivate).toContain('eq(users.isSystemAdmin, true)')
  })

  it('the privilege boundary of TASK-027.42/.46 is in place: DB-read actor and target rules on the seven administered operations', () => {
    expect(service).toContain('private async requirePrivilegeActor')
    expect(service).toContain('private async assertTargetRules')
    expect((service.match(/this\.requirePrivilegeActor\(/g) ?? []).length).toBe(7)
    expect((service.match(/this\.assertTargetRules\(/g) ?? []).length).toBe(7)
  })
})

describe('E5 — role and permission authoring (platform/roles)', () => {
  const role = read('platform/role.service.ts')

  it('a custom role may be given ANY permission code that exists in the permissions table (no ceiling by the actor’s own permissions)', () => {
    const body = role.slice(role.indexOf('async assignPermission'), role.indexOf('async findById') > role.indexOf('async assignPermission') ? role.indexOf('async findById') : undefined)
    expect(body).not.toMatch(/actor|requestingUser|isSystemAdmin/)
    expect(body).toContain('canMutateRole(role)') // built-in roles are read-only
  })

  it('the only holders of PLATFORM:ROLE:CREATE / PLATFORM:PERMISSION:ASSIGN / ASSIGN_ROLE / REVOKE_ROLE among built-in roles are SYSTEM_ADMIN', () => {
    for (const code of ['PLATFORM:ROLE:CREATE', 'PLATFORM:PERMISSION:ASSIGN', 'PLATFORM:USER:ASSIGN_ROLE', 'PLATFORM:USER:REVOKE_ROLE', 'PLATFORM:USER:MANAGE_MEMBERSHIP', 'PLATFORM:USER:DEACTIVATE']) {
      expect(BUILTIN_ROLES.filter(r => r.permissions.includes(code)).map(r => r.name)).toEqual(['SYSTEM_ADMIN'])
    }
  })
})

describe('E6 — tenant scope is independent of roles', () => {
  it('TenantScopeService resolves data scope from the tenant row (canAggregateChildren) and never reads a role table', () => {
    const scope = read('tenant-scope/tenant-scope.service.ts')
    expect(scope).toContain('canAggregateChildren')
    expect(scope).not.toMatch(/systemRoles|tenantRoles|userSystemRoleAssignments|userTenantRoleAssignments|isSystemAdmin/)
    expect(scope).toContain("tenant.type === 'PLATFORM_ROOT'")
  })
})

describe('E7 — impersonation session model', () => {
  const auth = read('platform/auth.service.ts')

  it('only an ACTIVE system administrator can start it; the token carries the TARGET’s isSystemAdmin, mfaVerified:true and the impersonator id', () => {
    const body = auth.slice(auth.indexOf('async issueImpersonationAccessToken'), auth.indexOf('await this.auditService.log', auth.indexOf('async issueImpersonationAccessToken')))
    expect(body).toContain("actor.status !== 'ACTIVE' || !actor.isSystemAdmin")
    expect(body).toContain('isSystemAdmin: target.isSystemAdmin')
    expect(body).toContain('mfaVerified: true')
    expect(body).toContain('impersonatorUserId: actor.id')
  })

  it('the request user is re-read from the database per request; there is no rule that blocks privileged actions during an impersonated session (Q-DP22c)', () => {
    expect(auth.slice(auth.indexOf('async validateJwtPayload'), auth.indexOf('async hashNewPassword'))).toContain('impersonation: payload.impersonation ?? false')
    const user = read('platform/user.service.ts')
    expect(user.slice(user.indexOf('private async assertTargetRules'), user.indexOf('private async assertWithinPrivilegeCeiling'))).not.toMatch(/impersonat/i)
  })
})
