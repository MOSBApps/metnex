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

describe('B. MFA policy routes — current no-op behaviour is pinned (Q-DP22b)', () => {
  const routePath = (handler: object) => Reflect.getMetadata('path', handler) as string

  it('B1: the routes declare no :tenantId segment, so @Param(\'tenantId\') can never be populated', () => {
    expect(routePath(MfaController.prototype.getPolicy)).toBe('policy')
    expect(routePath(MfaController.prototype.setPolicy)).toBe('policy')
    expect(Reflect.getMetadata('path', MfaController)).toBe('auth/mfa')
    const source = readFileSync(join(__dirname, 'mfa.controller.ts'), 'utf8')
    expect(source).toContain("@Get('policy')")
    expect(source).toContain("@Patch('policy')")
    expect(source).toMatch(/getPolicy\(@Param\('tenantId'\)/)
  })

  it('B2: GET and PATCH answer { mfaRequired: false } with 200 and never reach the service (dead endpoints)', async () => {
    const service = { getTenantPolicy: jest.fn(), setTenantPolicy: jest.fn() }
    const controller = new MfaController(service as never)
    const user = { id: 'u1', sub: 'u1', email: 'u@example.test', isSystemAdmin: false }
    await expect(controller.getPolicy(undefined as never)).resolves.toEqual({ mfaRequired: false })
    await expect(controller.setPolicy(user, undefined as never, { mfaRequired: true })).resolves.toEqual({ mfaRequired: false })
    expect(service.getTenantPolicy).not.toHaveBeenCalled()
    expect(service.setTenantPolicy).not.toHaveBeenCalled()
  })

  it('B3: no permission decorator guards them — making them reachable without authorization would reopen Q-DP22', () => {
    const source = readFileSync(join(__dirname, 'mfa.controller.ts'), 'utf8')
    const policy = source.slice(source.indexOf("@Get('policy')"))
    expect(policy).not.toContain('RequirePermission')
    expect(policy).not.toContain('isSystemAdmin')
  })

  it('B4b: tenant MFA policy / role requiresMfa have no enforcement effect today: MfaEnforcementGuard is provided but applied to no endpoint, and login looks only at the user’s own MFA', () => {
    const { readdirSync } = jest.requireActual<typeof import('node:fs')>('node:fs')
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
    const users = walk(join(__dirname, '..'))
      .filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .filter(f => /@RequireMfaSetupComplete\(|MfaEnforcementGuard\)/.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')))
    expect(users).toEqual([]) // neither the decorator nor the guard is used as an endpoint guard anywhere
    const login = readFileSync(join(__dirname, 'auth.service.ts'), 'utf8')
    expect(login).toContain('userMfaSettings.isEnabled')
    expect(login).not.toContain('mfaRequirement')
    expect(login).not.toContain('tenantSecuritySettings')
  })

  it('B4: this task made no route reachable: the only MfaService writers of tenant policy are unreachable from the controller today', () => {
    const source = readFileSync(join(__dirname, 'mfa.controller.ts'), 'utf8')
    const reachable = [...source.matchAll(/this\.mfaService\.setTenantPolicy\(/g)].length
    expect(reachable).toBe(1) // present in setPolicy only, behind the `if (!tenantId) return` early exit
    expect(source).toMatch(/if \(!tenantId\) return \{ mfaRequired: false \}/)
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
