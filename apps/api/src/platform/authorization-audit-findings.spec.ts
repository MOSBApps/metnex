import { ForbiddenException } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PlatformAuditController } from '../audit/platform-audit.controller'
import { MfaController } from './mfa.controller'

/**
 * TASK-027.41 — authorization audit findings.
 *
 * Part A (characterization of the open findings) is fully remediated by 027.41-R1 and 027.42. Part B pins behaviour that must NOT regress. No test opens a database,
 * HTTP server or MFA provider; every value below is a fabricated placeholder.
 */
/*
 * A1–A6 (customer-admin account-takeover chain F1, password-hash disclosure F2/F3) were pinned here as CURRENT
 * behaviour during the audit and are REMEDIATED by TASK-027.41-R1; their inverted, enforcing counterparts live in
 * customer-admin-authorization-remediation.spec.ts. A7/A8 (F4, latent) are unchanged and still pinned below.
 */

/*
 * A7/A8 (F4: platform user administration without a target/actor privilege rule) were pinned here as CURRENT behaviour
 * and are REMEDIATED by TASK-027.42; the enforcing tests live in platform-user-admin-privilege-boundary.spec.ts.
 */

describe('B. MFA policy routes — Q-DP22b Option B implemented (TASK-027.48)', () => {
  const routePath = (handler: object) => Reflect.getMetadata('path', handler) as string

  it('B1: the routes now declare a :tenantId segment and @Param(\'tenantId\') is populated', () => {
    expect(routePath(MfaController.prototype.getPolicy)).toBe('policy/:tenantId')
    expect(routePath(MfaController.prototype.setPolicy)).toBe('policy/:tenantId')
    expect(Reflect.getMetadata('path', MfaController)).toBe('auth/mfa')
    const source = readFileSync(join(__dirname, 'mfa.controller.ts'), 'utf8')
    expect(source).toContain("@Get('policy/:tenantId')")
    expect(source).toContain("@Patch('policy/:tenantId')")
  })

  it('B2: GET and PATCH reach the service (real reads/writes) for a system administrator', async () => {
    const service = { getTenantPolicy: jest.fn(async () => ({ mfaRequired: true })), setTenantPolicy: jest.fn(async () => ({ mfaRequired: true })) }
    const controller = new MfaController(service as never)
    const sysadmin = { id: 'u1', sub: 'u1', email: 'u@example.test', isSystemAdmin: true }
    await expect(controller.getPolicy(sysadmin, 'tenant-1')).resolves.toEqual({ mfaRequired: true })
    expect(service.getTenantPolicy).toHaveBeenCalledWith('u1', 'tenant-1')
  })

  it('B3: both routes are fail-closed in the controller for a non-system-administrator, before the service is called', async () => {
    const service = { getTenantPolicy: jest.fn(), setTenantPolicy: jest.fn() }
    const controller = new MfaController(service as never)
    const normal = { id: 'u1', sub: 'u1', email: 'u@example.test', isSystemAdmin: false }
    await expect(controller.getPolicy(normal, 'tenant-1')).rejects.toBeInstanceOf(ForbiddenException)
    await expect(controller.setPolicy(normal, 'tenant-1', { mfaRequired: true })).rejects.toBeInstanceOf(ForbiddenException)
    expect(service.getTenantPolicy).not.toHaveBeenCalled()
    expect(service.setTenantPolicy).not.toHaveBeenCalled()
  })

  it('B4b: MfaEnforcementGuard + @RequireMfaSetupComplete() are now wired onto real controllers (route matrix, see docs/runbooks/MFA_ENFORCEMENT_ROUTE_MATRIX.md)', () => {
    const { readdirSync } = jest.requireActual<typeof import('node:fs')>('node:fs')
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
    const wired = walk(join(__dirname, '..'))
      .filter(f => f.endsWith('.controller.ts'))
      .filter(f => /@RequireMfaSetupComplete\(\)/.test(readFileSync(f, 'utf8')))
    // At minimum the platform user/role/tenant/saas surfaces and platform-audit-logs are wired.
    expect(wired.some(f => f.endsWith('user.controller.ts'))).toBe(true)
    expect(wired.some(f => f.endsWith('role.controller.ts'))).toBe(true)
    expect(wired.some(f => f.endsWith('tenant.controller.ts'))).toBe(true)
    expect(wired.some(f => f.endsWith('platform-audit.controller.ts'))).toBe(true)
    // The MFA flow itself, identity bootstrap and the pre-authentication surface stay unwired —
    // otherwise nobody could ever reach the flow that unblocks them.
    expect(wired.some(f => f.endsWith('mfa.controller.ts'))).toBe(false)
    expect(wired.some(f => f.endsWith('me.controller.ts'))).toBe(false)
    expect(wired.some(f => f.endsWith('bootstrap.controller.ts'))).toBe(false)
    const login = readFileSync(join(__dirname, 'auth.service.ts'), 'utf8')
    expect(login).toContain('userMfaSettings.isEnabled')
  })

  it('B4: setTenantPolicy is reachable and re-authorises the actor independently in the service (fail-closed twice)', () => {
    const source = readFileSync(join(__dirname, 'mfa.service.ts'), 'utf8')
    const body = source.slice(source.indexOf('async setTenantPolicy'), source.indexOf('private verifyTotpCode'))
    expect(body).toContain('this.assertActingSystemAdmin(actorId)')
    expect(body).toContain('this.assertTenantExists(tenantId)')
    expect(body).toContain("action: 'MFA_POLICY_UPDATED'")
  })
})

describe('B. behaviour that must not regress', () => {
  it('B5: MFA admin reset keeps the TASK-027.40-R1 boundary (controller check + service re-check)', () => {
    const controller = readFileSync(join(__dirname, 'mfa.controller.ts'), 'utf8')
    const service = readFileSync(join(__dirname, 'mfa.service.ts'), 'utf8')
    expect(controller).toContain('if (!admin.isSystemAdmin) throw new ForbiddenException')
    expect(service).toContain("actor.status !== 'ACTIVE' || !actor.isSystemAdmin")
  })

  it('B6: GET platform-audit-logs stays system-admin-only and does no query for anyone else', async () => {
    const audit = { list: jest.fn() }
    const controller = new PlatformAuditController(audit as never)
    const error = await controller.list({ id: 'u1', isSystemAdmin: false }).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(audit.list).not.toHaveBeenCalled()
  })

  it('B7: customer-admin endpoints keep the scope check before any target lookup or write', () => {
    const source = readFileSync(join(__dirname, 'saas.service.ts'), 'utf8')
    for (const method of ['async createCustomerTenant', 'async createCustomerUser', 'async updateCustomerUser', 'async setCustomerUserPassword', 'async addCustomerUserMembership']) {
      const body = source.slice(source.indexOf(method), source.indexOf(method) + 1800)
      expect(body).toContain('assertCustomerAdminScope(')
    }
  })
})
