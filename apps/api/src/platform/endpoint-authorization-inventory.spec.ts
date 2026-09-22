import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * TASK-027.41 — static endpoint authorization inventory.
 *
 * Parses every *.controller.ts (no HTTP server, no DB) and pins, for each endpoint, the class-level guards,
 * method-level guards and @RequirePermission. Adding, removing or re-guarding an endpoint changes the
 * snapshot and fails this test, so authorization changes must be deliberate. On top of the snapshot, two
 * structural rules are enforced independently of it:
 *   1. every endpoint is PUBLIC (explicit allowlist), PERMISSION-guarded, or AUTHN-ONLY with a recorded reason;
 *   2. a permission-guarded endpoint's controller uses both JwtAuthGuard and PermissionGuard.
 * The narrative report is docs/migration/METNEX_AUTHORIZATION_ENDPOINT_AUDIT_AND_MFA_POLICY_DECISION.md.
 */
const SRC = join(__dirname, '..')

interface Endpoint {
  key: string
  handler: string
  file: string
  classGuards: string
  methodGuards: string
  permission: string
  line: string
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))
}

function scan(): Endpoint[] {
  const out: Endpoint[] = []
  for (const file of walk(SRC).filter(f => f.endsWith('.controller.ts')).sort()) {
    const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const starts = [...source.matchAll(/@Controller\(([^)]*)\)/g)].map(m => ({ index: m.index ?? 0, prefix: (m[1] ?? '').replace(/['"]/g, '') }))
    starts.forEach((start, i) => {
      const segment = source.slice(start.index, i + 1 < starts.length ? starts[i + 1]?.index : source.length)
      const classAt = segment.indexOf('export class')
      const classGuards = (segment.slice(0, classAt).match(/@UseGuards\(([^)]*)\)/)?.[1] ?? '').replace(/\s+/g, '')
      const body = segment.slice(classAt)
      const re = /((?:\s*@[A-Za-z]+(?:\((?:[^()]|\([^()]*\))*\))?\s*\n)+)\s*(?:async\s+)?(\w+)\(/g
      let match: RegExpExecArray | null
      while ((match = re.exec(body))) {
        const decorators = match[1] ?? ''
        const http = decorators.match(/@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/)
        if (!http) continue
        const methodGuards = (decorators.match(/@UseGuards\(((?:[^()]|\([^()]*\))*)\)/)?.[1] ?? '').replace(/\s+/g, '')
        const permission = decorators.match(/@RequirePermission\('([^']*)'\)/)?.[1] ?? ''
        const path = ('/' + start.prefix + '/' + (http[2] ?? '').replace(/['"]/g, '')).replace(/\/+/g, '/').replace(/\/$/, '')
        const key = `${http[1]?.toUpperCase()} ${path}`
        out.push({
          key, handler: match[2] ?? '', file, classGuards, methodGuards, permission,
          line: `${key} | ${match[2]} | class=${classGuards} | method=${methodGuards} | perm=${permission}`,
        })
      }
    })
  }
  return out
}

const SNAPSHOT = [
    'GET /platform-audit-logs | list | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'GET /health | health | class= | method= | perm=',
    'GET /admin/perf/overview | overview | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'GET /admin/perf/tables | tables | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'GET /admin/perf/indexes | indexes | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'GET /admin/perf/slow-requests | slowRequests | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'GET /admin/perf/slow-requests/:id | slowRequestDetail | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'GET /admin/perf/slow-queries | slowQueries | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'GET /admin/perf/recommendations | recommendations | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'POST /admin/perf/explain | explain | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'GET /admin/perf/settings | getSettings | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'PATCH /admin/perf/settings | updateSettings | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'POST /auth/login | login | class= | method= | perm=',
    'POST /auth/refresh | refresh | class= | method= | perm=',
    'POST /auth/logout | logout | class= | method= | perm=',
    'GET /auth/me | me | class= | method=JwtAuthGuard | perm=',
    'POST /auth/change-password | changePassword | class= | method=JwtAuthGuard,MfaEnforcementGuard | perm=',
    'GET /platform/bootstrap/status | status | class= | method= | perm=',
    'POST /platform/bootstrap | bootstrap | class= | method= | perm=',
    'GET /platform/me/tenants | myTenants | class=JwtAuthGuard | method= | perm=',
    'POST /platform/me/active-tenant | setActiveTenant | class=JwtAuthGuard | method= | perm=',
    'GET /platform/me/tenant-permissions | myTenantPermissions | class=JwtAuthGuard | method= | perm=',
    'GET /auth/mfa/status | getStatus | class= | method=AuthGuard(\'jwt\') | perm=',
    'POST /auth/mfa/totp/setup | setupTotp | class= | method=AuthGuard(\'jwt\') | perm=',
    'POST /auth/mfa/totp/verify-setup | verifySetup | class= | method=AuthGuard(\'jwt\') | perm=',
    'POST /auth/mfa/totp/disable | disableTotp | class= | method=AuthGuard(\'jwt\') | perm=',
    'POST /auth/mfa/challenge/verify | verifyChallenge | class= | method= | perm=',
    'POST /auth/mfa/recovery-codes/regenerate | regenerateRecoveryCodes | class= | method=AuthGuard(\'jwt\') | perm=',
    'POST /auth/mfa/admin/:userId/reset | adminReset | class= | method=AuthGuard(\'jwt\') | perm=',
    'GET /auth/mfa/policy/:tenantId | getPolicy | class= | method=AuthGuard(\'jwt\') | perm=',
    'PATCH /auth/mfa/policy/:tenantId | setPolicy | class= | method=AuthGuard(\'jwt\') | perm=',
    'GET /platform/permissions | list | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:PERMISSION:VIEW',
    'GET /platform/roles | list | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:ROLE:VIEW',
    'POST /platform/roles | create | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:ROLE:CREATE',
    'GET /platform/roles/:id | detail | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:ROLE:VIEW',
    'POST /platform/roles/:id/permissions | assignPermission | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:PERMISSION:ASSIGN',
    'GET /platform/saas/packages | listPackages | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:PACKAGE:VIEW',
    'POST /platform/saas/packages | createPackage | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:PACKAGE:MANAGE',
    'POST /platform/saas/customers/provision | provisionCustomer | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:CUSTOMER:PROVISION',
    'GET /platform/saas/subscriptions | listSubscriptions | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:PACKAGE:VIEW',
    'GET /customer-admin/overview | overview | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=CUSTOMER:ADMIN:VIEW',
    'GET /customer-admin/subscription | subscription | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=CUSTOMER:ADMIN:VIEW',
    'GET /customer-admin/tenants | listTenants | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=CUSTOMER:ADMIN:VIEW',
    'POST /customer-admin/tenants | createTenant | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=CUSTOMER:ADMIN:MANAGE',
    'GET /customer-admin/users | listUsers | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=CUSTOMER:ADMIN:VIEW',
    'POST /customer-admin/users | createUser | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=CUSTOMER:ADMIN:MANAGE',
    'PATCH /customer-admin/users/:id | updateUser | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=CUSTOMER:ADMIN:MANAGE',
    'POST /customer-admin/users/:id/set-password | setUserPassword | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=CUSTOMER:ADMIN:MANAGE',
    'POST /customer-admin/users/:id/memberships | addMembership | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=CUSTOMER:ADMIN:MANAGE',
    'GET /tenant-roles | list | class=JwtAuthGuard,TenantHeaderFormatGuard,TenantMembershipGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=TENANT:ROLE:VIEW',
    'GET /tenant-roles/assignable | assignable | class=JwtAuthGuard,TenantHeaderFormatGuard,TenantMembershipGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=TENANT:ROLE:VIEW',
    'GET /tenant-roles/users/:userId | userAssignments | class=JwtAuthGuard,TenantHeaderFormatGuard,TenantMembershipGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=TENANT:ROLE:VIEW',
    'POST /tenant-roles/users/:userId | assign | class=JwtAuthGuard,TenantHeaderFormatGuard,TenantMembershipGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=TENANT:ROLE:ASSIGN',
    'DELETE /tenant-roles/users/:userId/:assignmentId | revoke | class=JwtAuthGuard,TenantHeaderFormatGuard,TenantMembershipGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=TENANT:ROLE:REVOKE',
    'GET /platform/tenants | list | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:TENANT:VIEW',
    'POST /platform/tenants | create | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:TENANT:CREATE',
    'GET /platform/tenants/:id | detail | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:TENANT:VIEW',
    'PATCH /platform/tenants/:id | update | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:TENANT:UPDATE',
    'POST /platform/tenants/:id/suspend | suspend | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:TENANT:SUSPEND',
    'POST /platform/tenants/:id/archive | archive | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:TENANT:ARCHIVE',
    'GET /platform/tenants/:id/available-users | availableUsers | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:TENANT:VIEW',
    'POST /platform/tenants/:id/members | addMember | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:TENANT:UPDATE',
    'GET /platform/users | list | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:USER:VIEW',
    'POST /platform/users | create | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:USER:CREATE',
    'GET /platform/users/assignable-roles | listAssignableRoles | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:USER:ASSIGN_ROLE',
    'GET /platform/users/assignable-tenants | listAssignableTenants | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:USER:MANAGE_MEMBERSHIP',
    'GET /platform/users/:id | detail | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:USER:VIEW',
    'PATCH /platform/users/:id | update | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:USER:UPDATE',
    'POST /platform/users/:id/set-password | setPassword | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:USER:UPDATE',
    'POST /platform/users/:id/impersonate | impersonate | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:USER:UPDATE',
    'POST /platform/users/:id/deactivate | deactivate | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:USER:DEACTIVATE',
    'POST /platform/users/:id/roles | assignRole | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:USER:ASSIGN_ROLE',
    'DELETE /platform/users/:id/roles/:assignmentId | revokeRole | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:USER:REVOKE_ROLE',
    'GET /platform/users/:id/memberships | listMemberships | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:USER:VIEW',
    'POST /platform/users/:id/memberships | addMembership | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:USER:MANAGE_MEMBERSHIP',
    'DELETE /platform/users/:id/memberships/:membershipId | removeMembership | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=PLATFORM:USER:MANAGE_MEMBERSHIP',
    'GET /reports/artifacts | listArtifacts | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=REPORT:ARTIFACT:VIEW',
    'GET /reports/:code/render | render | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=REPORT:ARTIFACT:VIEW',
    'GET /reports/:code/export/:format | export | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=REPORT:ARTIFACT:EXPORT',
    'GET /reports/renderer/health | health | class=JwtAuthGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=REPORT:ARTIFACT:VIEW',
    'GET /platform/settings/general | getGeneral | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'PUT /platform/settings/general | upsertGeneral | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'GET /platform/settings/smtp | getSmtp | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'PUT /platform/settings/smtp | upsertSmtp | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'POST /platform/settings/smtp/test | testSmtp | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'GET /platform/settings/ai-provider | getAiProvider | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'PUT /platform/settings/ai-provider | upsertAiProvider | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'DELETE /platform/settings/ai-provider/key | removeAiProviderKey | class=JwtAuthGuard,MfaEnforcementGuard | method= | perm=',
    'GET /settings/ai-provider/effective | getEffective | class=JwtAuthGuard,TenantHeaderFormatGuard,TenantMembershipGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=SETTINGS:AI_PROVIDER:VIEW',
    'GET /settings/ai-provider/override | getOverride | class=JwtAuthGuard,TenantHeaderFormatGuard,TenantMembershipGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=SETTINGS:AI_PROVIDER:VIEW',
    'PUT /settings/ai-provider/override | upsertOverride | class=JwtAuthGuard,TenantHeaderFormatGuard,TenantMembershipGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=SETTINGS:AI_PROVIDER:MANAGE',
    'DELETE /settings/ai-provider/override | deleteOverride | class=JwtAuthGuard,TenantHeaderFormatGuard,TenantMembershipGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=SETTINGS:AI_PROVIDER:MANAGE',
    'GET /settings/smtp/effective | getEffective | class=JwtAuthGuard,TenantHeaderFormatGuard,TenantMembershipGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=SETTINGS:SMTP:VIEW',
    'GET /settings/smtp/override | getOverride | class=JwtAuthGuard,TenantHeaderFormatGuard,TenantMembershipGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=SETTINGS:SMTP:VIEW',
    'PUT /settings/smtp/override | upsertOverride | class=JwtAuthGuard,TenantHeaderFormatGuard,TenantMembershipGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=SETTINGS:SMTP:MANAGE',
    'DELETE /settings/smtp/override | deleteOverride | class=JwtAuthGuard,TenantHeaderFormatGuard,TenantMembershipGuard,PermissionGuard,MfaEnforcementGuard | method= | perm=SETTINGS:SMTP:MANAGE',
]

/** Endpoints reachable without a session, on purpose. */
const PUBLIC = new Set([
  'GET /health',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/logout',
  'GET /platform/bootstrap/status',
  'POST /platform/bootstrap',
  'POST /auth/mfa/challenge/verify',
])

type AuthnOnlyKind = 'SELF_ONLY' | 'INLINE_SYSTEM_ADMIN' | 'INLINE_AND_SERVICE_SYSTEM_ADMIN' | 'SELF_SCOPED_IN_SERVICE'

/** Endpoints with a session but no @RequirePermission, with the reason that makes each acceptable (or the finding). */
const AUTHN_ONLY: Record<string, AuthnOnlyKind> = {
  'GET /auth/me': 'SELF_ONLY',
  'POST /auth/change-password': 'SELF_ONLY',
  'GET /platform-audit-logs': 'INLINE_SYSTEM_ADMIN',
  'GET /platform/me/tenants': 'SELF_SCOPED_IN_SERVICE',
  'POST /platform/me/active-tenant': 'SELF_SCOPED_IN_SERVICE',
  'GET /platform/me/tenant-permissions': 'SELF_SCOPED_IN_SERVICE',
  'GET /auth/mfa/status': 'SELF_ONLY',
  'POST /auth/mfa/totp/setup': 'SELF_ONLY',
  'POST /auth/mfa/totp/verify-setup': 'SELF_ONLY',
  'POST /auth/mfa/totp/disable': 'SELF_ONLY',
  'POST /auth/mfa/recovery-codes/regenerate': 'SELF_ONLY',
  'POST /auth/mfa/admin/:userId/reset': 'INLINE_AND_SERVICE_SYSTEM_ADMIN',
  // Q-DP22b Option B (TASK-027.48): the route now carries a :tenantId segment and is authorised
  // inline (controller) + independently re-checked in the service — same shape as admin reset.
  'GET /auth/mfa/policy/:tenantId': 'INLINE_AND_SERVICE_SYSTEM_ADMIN',
  'PATCH /auth/mfa/policy/:tenantId': 'INLINE_AND_SERVICE_SYSTEM_ADMIN',
  ...Object.fromEntries(
    ['GET /admin/perf/overview', 'GET /admin/perf/tables', 'GET /admin/perf/indexes', 'GET /admin/perf/slow-requests', 'GET /admin/perf/slow-requests/:id', 'GET /admin/perf/slow-queries', 'GET /admin/perf/recommendations', 'POST /admin/perf/explain', 'GET /admin/perf/settings', 'PATCH /admin/perf/settings',
      'GET /platform/settings/general', 'PUT /platform/settings/general', 'GET /platform/settings/smtp', 'PUT /platform/settings/smtp', 'POST /platform/settings/smtp/test', 'GET /platform/settings/ai-provider', 'PUT /platform/settings/ai-provider', 'DELETE /platform/settings/ai-provider/key',
    ].map(key => [key, 'INLINE_SYSTEM_ADMIN' as AuthnOnlyKind]),
  ),
}

describe('endpoint authorization inventory', () => {
  const endpoints = scan()

  it('pins the guard structure of every endpoint (snapshot)', () => {
    expect(endpoints.map(e => e.line)).toEqual(SNAPSHOT)
    expect(endpoints).toHaveLength(SNAPSHOT.length)
  })

  it('has no duplicate route keys', () => {
    expect(new Set(endpoints.map(e => e.key)).size).toBe(endpoints.length)
  })

  it('classifies every endpoint as PUBLIC, PERMISSION-guarded or AUTHN-ONLY with a recorded reason', () => {
    const unclassified = endpoints.filter(e => !PUBLIC.has(e.key) && !e.permission && !(e.key in AUTHN_ONLY)).map(e => e.key)
    expect(unclassified).toEqual([])
  })

  it('does not keep stale allowlist entries', () => {
    const keys = new Set(endpoints.map(e => e.key))
    for (const key of [...PUBLIC, ...Object.keys(AUTHN_ONLY)]) expect(keys.has(key)).toBe(true)
  })

  it('PUBLIC endpoints carry no guard at all (no half-protected route)', () => {
    for (const endpoint of endpoints.filter(e => PUBLIC.has(e.key))) {
      expect([endpoint.key, endpoint.classGuards, endpoint.methodGuards]).toEqual([endpoint.key, '', ''])
    }
  })

  it('every permission-guarded endpoint sits behind JwtAuthGuard AND PermissionGuard', () => {
    for (const endpoint of endpoints.filter(e => e.permission)) {
      expect([endpoint.key, endpoint.classGuards.includes('JwtAuthGuard'), endpoint.classGuards.includes('PermissionGuard')]).toEqual([endpoint.key, true, true])
    }
  })

  it('every non-public endpoint requires an authenticated session (JwtAuthGuard or AuthGuard(jwt))', () => {
    for (const endpoint of endpoints.filter(e => !PUBLIC.has(e.key))) {
      const guards = endpoint.classGuards + endpoint.methodGuards
      expect([endpoint.key, /JwtAuthGuard|AuthGuard\('jwt'\)/.test(guards)]).toEqual([endpoint.key, true])
    }
  })

  it('tenant-header settings endpoints keep the full guard chain in order', () => {
    for (const endpoint of endpoints.filter(e => e.key.startsWith('GET /settings/') || e.key.startsWith('PUT /settings/') || e.key.startsWith('DELETE /settings/'))) {
      expect(endpoint.classGuards).toBe('JwtAuthGuard,TenantHeaderFormatGuard,TenantMembershipGuard,PermissionGuard,MfaEnforcementGuard')
    }
  })

  it('inline system-admin endpoints check isSystemAdmin before touching any service', () => {
    for (const rel of ['audit/platform-audit.controller.ts', 'perf/perf-admin.controller.ts', 'settings/platform-settings.controller.ts']) {
      const source = readFileSync(join(SRC, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      for (const method of source.split(/\n  @(?:Get|Post|Put|Patch|Delete)\(/).slice(1)) {
        const guardAt = method.search(/isSystemAdmin|requireSystemAdmin\(|assertSystemAdmin\(/)
        const serviceAt = method.search(/this\.(svc|diagnostics|settings|auditService)\./)
        expect(guardAt).toBeGreaterThan(-1)
        if (serviceAt > -1) expect(guardAt).toBeLessThan(serviceAt)
      }
    }
  })

  it('SELF_ONLY MFA endpoints act only on the caller: the subject id always comes from the session', () => {
    const source = readFileSync(join(SRC, 'platform/mfa.controller.ts'), 'utf8')
    for (const call of ['isEnabledForUser(getUserId(user))', 'setupTotp(getUserId(user)', 'verifySetup(getUserId(user)', 'disableTotp(getUserId(user)', 'regenerateRecoveryCodes(getUserId(user)']) {
      expect(source).toContain(call)
    }
  })

  it('Q-DP22b Option B: no NO_AUTHORIZATION_DEAD_ROUTE endpoint remains — the MFA policy routes are now inline+service authorised', () => {
    expect(Object.values(AUTHN_ONLY)).not.toContain('NO_AUTHORIZATION_DEAD_ROUTE')
    expect(AUTHN_ONLY['GET /auth/mfa/policy/:tenantId']).toBe('INLINE_AND_SERVICE_SYSTEM_ADMIN')
    expect(AUTHN_ONLY['PATCH /auth/mfa/policy/:tenantId']).toBe('INLINE_AND_SERVICE_SYSTEM_ADMIN')
  })

  it('inline+service system-admin MFA policy endpoints check isSystemAdmin before touching the service', () => {
    const source = readFileSync(join(SRC, 'platform/mfa.controller.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const method of ['async getPolicy', 'async setPolicy']) {
      const body = source.slice(source.indexOf(method))
      const guardAt = body.search(/if \(!user\.isSystemAdmin\)/)
      const serviceAt = body.search(/this\.mfaService\./)
      expect(guardAt).toBeGreaterThan(-1)
      expect(guardAt).toBeLessThan(serviceAt)
    }
  })
})
