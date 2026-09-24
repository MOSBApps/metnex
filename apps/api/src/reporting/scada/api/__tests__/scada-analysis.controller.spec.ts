import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { buildMockDb, chain } from '../../../../db/test-helpers/drizzle-mock'
import { REQUIRE_MFA_SETUP_COMPLETE_KEY } from '../../../../platform/decorators/require-mfa-setup-complete.decorator'
import { MfaEnforcementGuard } from '../../../../platform/guards/mfa-enforcement.guard'
import { TenantHeaderFormatGuard } from '../../../../platform/guards/tenant-header-format.guard'
import { JwtAuthGuard } from '../../../../platform/jwt-auth.guard'
import { PERMISSION_KEY, PermissionGuard } from '../../../../platform/permission.guard'
import { TenantMembershipGuard } from '../../../../platform/tenant-membership.guard'
import { ScadaApiError } from '../scada-api.contract'
import { ScadaAnalysisController } from '../scada-analysis.controller'
import type { ScadaAnalysisApiService } from '../scada-analysis-api.service'

const HANDLERS = ['analyse', 'compare', 'catalog', 'listPresets', 'getPreset'] as const
const proto = ScadaAnalysisController.prototype as unknown as Record<string, () => unknown>

function serviceStub() {
  const s = {
    runAnalysis: jest.fn(async () => ({ ok: 'analysis' })),
    runComparison: jest.fn(async () => ({ ok: 'comparison' })),
    listPresets: jest.fn(async () => ({ presets: [] })),
    getPreset: jest.fn(async () => ({ preset: {} })),
    getCatalog: jest.fn(async () => ({ sources: [] })),
  }
  return { s, controller: new ScadaAnalysisController(s as unknown as ScadaAnalysisApiService) }
}

function ctxFor(handler: string, request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => proto[handler],
    getClass: () => ScadaAnalysisController,
  } as never
}

describe('routes and guard chain (TASK-027.72)', () => {
  it('exposes exactly the five additive analysis routes under /reports', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ScadaAnalysisController)).toBe('reports')
    const routes = HANDLERS.map(h => [Reflect.getMetadata(METHOD_METADATA, proto[h]!) as number, Reflect.getMetadata(PATH_METADATA, proto[h]!) as string])
    expect(routes).toEqual([[1, ':code/analysis/query'], [1, ':code/analysis/compare'], [0, ':code/analysis/catalog'], [0, ':code/analysis/presets'], [0, ':code/analysis/presets/:presetId']]) // 1 = POST, 0 = GET
  })

  it('the guard order is JWT → MFA → tenant header → tenant membership → permission, on the class (so every route has all of them)', () => {
    expect(Reflect.getMetadata('__guards__', ScadaAnalysisController)).toEqual([JwtAuthGuard, MfaEnforcementGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard])
    for (const h of HANDLERS) expect(Reflect.getMetadata('__guards__', proto[h]!)).toBeUndefined() // no route can opt out with its own list
  })

  it('MFA enforcement is switched ON for the whole controller (@RequireMfaSetupComplete)', () => {
    expect(Reflect.getMetadata(REQUIRE_MFA_SETUP_COMPLETE_KEY, ScadaAnalysisController)).toBe(true)
  })

  it('every route asks for the EXISTING view permission — no new permission code, and never the export permission', () => {
    for (const h of HANDLERS) expect(Reflect.getMetadata(PERMISSION_KEY, proto[h]!)).toBe('REPORT:ARTIFACT:VIEW')
  })
})

describe('the guards actually deny (real guard instances, no server, no database)', () => {
  it('a request WITHOUT an authenticated user is refused by the tenant and permission guards (deny by default)', async () => {
    const db = buildMockDb()
    const request = { headers: { 'x-tenant-id': 't1' }, params: {}, query: {}, body: {} }
    const reflector = new Reflector()
    expect(await new TenantMembershipGuard(reflector, db as never).canActivate(ctxFor('analyse', request))).toBe(false)
    expect(await new PermissionGuard(reflector, db as never, { log: jest.fn() } as never).canActivate(ctxFor('analyse', request))).toBe(false)
    expect(db.select).not.toHaveBeenCalled()
  })

  it('JwtAuthGuard is the first guard and refuses a request that carries no authenticated user (401, no bypass)', () => {
    expect(() => new JwtAuthGuard().handleRequest(null, false, null, {} as never)).toThrow(UnauthorizedException)
    expect(Reflect.getMetadata('__guards__', ScadaAnalysisController)[0]).toBe(JwtAuthGuard)
  })

  it.each(HANDLERS)('%s: a user whose session is not MFA-verified is refused (MFA required + not verified)', async handler => {
    const db = buildMockDb()
    db.select.mockReturnValue(chain([{ isEnabled: true }]))
    const mfa = { isActorActive: jest.fn(async () => true), isRequired: jest.fn(async () => true) }
    const audit = { log: jest.fn(async () => undefined) }
    const guard = new MfaEnforcementGuard(new Reflector(), db as never, mfa as never, audit as never)
    const error = await guard.canActivate(ctxFor(handler, { user: { id: 'u1', mfaVerified: false }, method: 'POST', originalUrl: '/reports/X/analysis/query' })).catch(e => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(error.getResponse()).toMatchObject({ error: 'MFA_SESSION_NOT_VERIFIED' })
  })

  it('a user who is required to use MFA but has not set it up is refused too', async () => {
    const db = buildMockDb()
    db.select.mockReturnValue(chain([]))
    const mfa = { isActorActive: jest.fn(async () => true), isRequired: jest.fn(async () => true) }
    const guard = new MfaEnforcementGuard(new Reflector(), db as never, mfa as never, { log: jest.fn(async () => undefined) } as never)
    const error = await guard.canActivate(ctxFor('analyse', { user: { id: 'u1' }, method: 'POST' })).catch(e => e)
    expect(error.getResponse()).toMatchObject({ error: 'MFA_SETUP_REQUIRED' })
  })

  it('an MFA-verified session passes the MFA guard', async () => {
    const mfa = { isActorActive: jest.fn(async () => true), isRequired: jest.fn(async () => true) }
    const guard = new MfaEnforcementGuard(new Reflector(), buildMockDb() as never, mfa as never, { log: jest.fn() } as never)
    await expect(guard.canActivate(ctxFor('analyse', { user: { id: 'u1', mfaVerified: true }, method: 'POST' }))).resolves.toBe(true)
  })

  it('a missing / malformed X-Tenant-Id is refused before anything else reads it', () => {
    const guard = new TenantHeaderFormatGuard()
    expect(() => guard.canActivate(ctxFor('analyse', { headers: {} }))).toThrow()
    expect(() => guard.canActivate(ctxFor('analyse', { headers: { 'x-tenant-id': "x' OR 1=1" } }))).toThrow()
  })

  it('a non-member of the tenant is refused (the tenant scope cannot be chosen by header alone)', async () => {
    const db = buildMockDb()
    db.select.mockReturnValue(chain([]))
    const guard = new TenantMembershipGuard(new Reflector(), db as never)
    await expect(guard.canActivate(ctxFor('analyse', { user: { id: 'u1', isSystemAdmin: false }, headers: { 'x-tenant-id': 'other-tenant' }, params: {}, query: {}, body: {} }))).rejects.toBeInstanceOf(ForbiddenException)
  })
})

describe('the controller hands the service the session actor and the raw body ONLY for validation', () => {
  it('the actor is the JWT-validated user, never a body field; the tenant is the (guarded) header', async () => {
    const { s, controller } = serviceStub()
    const body = { actorId: 'evil', userId: 'evil', isSystemAdmin: true, tenantId: 'evil' }
    await controller.analyse('t-1', { id: 'u-1' }, 'REPORT_CODE', body)
    expect(s.runAnalysis).toHaveBeenCalledWith({ actor: { id: 'u-1' }, tenantId: 't-1', routeCode: 'REPORT_CODE', body })
    await controller.compare('t-1', { id: 'u-1' }, 'REPORT_CODE', body)
    expect(s.runComparison).toHaveBeenCalledWith({ actor: { id: 'u-1' }, tenantId: 't-1', routeCode: 'REPORT_CODE', body })
    await controller.listPresets('t-1', { id: 'u-1' }, 'REPORT_CODE')
    await controller.getPreset('t-1', { id: 'u-1' }, 'REPORT_CODE', 'preset-1')
    expect(s.getPreset).toHaveBeenCalledWith({ actor: { id: 'u-1' }, tenantId: 't-1', routeCode: 'REPORT_CODE', param: 'preset-1' })
  })

  it('a missing tenant header is a 400 (not a 500)', async () => {
    const { controller } = serviceStub()
    const error = await controller.analyse(undefined, { id: 'u-1' }, 'X', {}).catch(e => e)
    expect(error).toBeInstanceOf(HttpException)
    expect(error.getStatus()).toBe(400)
  })

  it.each([
    ['SCADA_SOURCE_NOT_CONFIGURED', 503],
    ['SCADA_LIMITS_NOT_CONFIGURED', 503],
    ['SCADA_REQUEST_UNKNOWN_FIELD', 400],
    ['SCADA_NOT_FOUND', 404],
    ['SCADA_SCOPE_DENIED', 403],
    ['SCADA_PRESET_NOT_ACTIVE', 409],
    ['SCADA_AUDIT_FAILED', 503],
  ] as const)('%s is answered %i with a static code-only body', async (code, status) => {
    const { s, controller } = serviceStub()
    s.runAnalysis.mockRejectedValue(new ScadaApiError(code))
    const error = await controller.analyse('t-1', { id: 'u-1' }, 'X', {}).catch(e => e)
    expect(error).toBeInstanceOf(HttpException)
    expect(error.getStatus()).toBe(status)
    expect(error.getResponse()).toEqual({ statusCode: status, code, message: code })
  })

  it('an unexpected exception leaves as a static 500 — its text never reaches the client', async () => {
    const { s, controller } = serviceStub()
    s.runAnalysis.mockRejectedValue(new Error('Server=10.0.0.5;Password=hunter2 SELECT * FROM dbo.x'))
    const error = await controller.analyse('t-1', { id: 'u-1' }, 'X', {}).catch(e => e)
    expect(error.getStatus()).toBe(500)
    expect(JSON.stringify(error.getResponse())).not.toMatch(/hunter2|Server=|SELECT|dbo/)
  })

  it('never logs the request body', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m => jest.spyOn(console, m).mockImplementation(() => undefined))
    try {
      const { controller } = serviceStub()
      await controller.analyse('t-1', { id: 'u-1' }, 'X', { password: 'hunter2', sql: 'SELECT 1' })
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    } finally {
      spies.forEach(spy => spy.mockRestore())
    }
  })
})
