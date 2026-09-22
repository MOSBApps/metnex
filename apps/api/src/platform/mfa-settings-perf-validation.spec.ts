import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PerfAdminController } from '../perf/perf-admin.controller'
import { PlatformSettingsController } from '../settings/platform-settings.controller'
import { TenantSettingsAiController } from '../settings/tenant-settings-ai.controller'
import { TenantSettingsSmtpController } from '../settings/tenant-settings-smtp.controller'
import { TenantHeaderFormatGuard } from './guards/tenant-header-format.guard'
import { MfaController } from './mfa.controller'
import * as mfaInput from './domain/mfa-input.domain'
import * as settingsInput from '../settings/settings-input.domain'
import * as perfInput from '../perf/perf-input.domain'

/**
 * Q-DP21 (TASK-027.40): MFA, settings and perf inputs are validated by pure domain validators at the
 * controller boundary. The class-validator decorators in dto/mfa.dto.ts never ran (no ValidationPipe is
 * registered), so nothing here relies on them: every test calls the real handler with a plain object,
 * exactly as Nest hands it over. No test opens a database or MFA provider.
 */
const LEAK = 'Zz9-Leaky-Marker'
const NOSQL = { $ne: null }
const uid = { id: 'user-1', sub: 'user-1', email: 'a@b.co', isSystemAdmin: false }
const sysadmin = { id: 'admin-1', sub: 'admin-1', email: 'admin@b.co', isSystemAdmin: true }
const admin = { id: 'admin-1', isSystemAdmin: true }
const nonAdmin = { id: 'user-1', isSystemAdmin: false }

function mfa() {
  const service = {
    verifySetup: jest.fn(async () => ({ recoveryCodes: [] })),
    disableTotp: jest.fn(async () => ({ success: true })),
    verifyChallenge: jest.fn(async () => ({})),
    regenerateRecoveryCodes: jest.fn(async () => ({ recoveryCodes: [] })),
    adminResetMfa: jest.fn(async () => ({ success: true })),
    getTenantPolicy: jest.fn(async () => ({ mfaRequired: false })),
    setTenantPolicy: jest.fn(async () => ({ mfaRequired: true })),
  }
  return { service, controller: new MfaController(service as never) }
}
const noMfaCalls = (service: ReturnType<typeof mfa>['service']) => Object.values(service).forEach(fn => expect(fn).not.toHaveBeenCalled())

function settings() {
  const platform = {
    getGeneral: jest.fn(), getSmtp: jest.fn(), getAiProvider: jest.fn(), removeAiProviderKey: jest.fn(),
    upsertGeneral: jest.fn(async () => ({})), upsertSmtp: jest.fn(async () => ({})), upsertAiProvider: jest.fn(async () => ({})),
  }
  const tenant = {
    upsertSmtpOverride: jest.fn(async () => ({})), upsertAiProviderOverride: jest.fn(async () => ({})),
    resolveEffectiveSmtp: jest.fn(), resolveEffectiveAiProvider: jest.fn(), getSmtpOverride: jest.fn(), getAiProviderOverride: jest.fn(),
    deleteSmtpOverride: jest.fn(), deleteAiProviderOverride: jest.fn(),
  }
  return {
    platform, tenant,
    platformController: new PlatformSettingsController(platform as never),
    smtpController: new TenantSettingsSmtpController(tenant as never),
    aiController: new TenantSettingsAiController(tenant as never),
  }
}
const noCalls = (...mocks: Array<Record<string, jest.Mock>>) => mocks.forEach(m => Object.values(m).forEach(fn => expect(fn).not.toHaveBeenCalled()))

function perf() {
  const diagnostics = {
    overview: jest.fn(), tableStats: jest.fn(), indexStats: jest.fn(), recommendations: jest.fn(),
    slowRequests: jest.fn(async () => ({ rows: [] })), slowRequestDetail: jest.fn(async () => ({ id: 'x' })),
    slowQuerySummary: jest.fn(async () => ({ rows: [] })), explainQuery: jest.fn(async () => ({ plan: [] })),
  }
  const settingsSvc = { getSettings: jest.fn(), updateSettings: jest.fn(async () => ({})) }
  return { diagnostics, settingsSvc, controller: new PerfAdminController(diagnostics as never, settingsSvc as never) }
}

async function rejects(call: () => Promise<unknown>) {
  const error = await call().catch(e => e)
  expect(error).toBeInstanceOf(BadRequestException)
  return error as BadRequestException
}

// ── MFA ─────────────────────────────────────────────────────────────────────

const CODE = '123456'
const RECOVERY = 'ABCD-EF23'
const BAD_BODIES: unknown[] = [null, undefined, 'text', 5, [], [{ code: CODE }]]

describe('MFA bodies are validated at the controller before any MFA/DB/audit work', () => {
  const badCodes = [undefined, null, '', ' ', '12345', '1234567', 123456, NOSQL, [CODE], true]

  it.each(badCodes)('verify-setup rejects code %j', async code => {
    const { controller, service } = mfa()
    await rejects(() => controller.verifySetup(uid, { code } as never))
    noMfaCalls(service)
  })
  it.each(badCodes)('recovery-codes/regenerate rejects code %j', async code => {
    const { controller, service } = mfa()
    await rejects(() => controller.regenerateRecoveryCodes(uid, { code } as never))
    noMfaCalls(service)
  })
  it.each([
    { password: undefined, code: CODE }, { password: '', code: CODE }, { password: 5, code: CODE }, { password: NOSQL, code: CODE }, { password: ['p'], code: CODE },
    { password: 'pw', code: '12' }, { password: 'pw', code: NOSQL }, { password: 'pw', code: undefined }, { password: 'pw', code: 123456 },
  ])('totp/disable rejects %j', async body => {
    const { controller, service } = mfa()
    await rejects(() => controller.disableTotp(uid, body as never))
    noMfaCalls(service)
  })
  it.each([
    { challengeToken: undefined, code: CODE }, { challengeToken: '', code: CODE }, { challengeToken: 5, code: CODE }, { challengeToken: NOSQL, code: CODE }, { challengeToken: ['t'], code: CODE },
    { challengeToken: 't' }, { challengeToken: 't', code: '12' }, { challengeToken: 't', code: NOSQL }, { challengeToken: 't', code: 123456 },
    { challengeToken: 't', recoveryCode: 'abcd-ef23' }, { challengeToken: 't', recoveryCode: 'ABCD-EF2' }, { challengeToken: 't', recoveryCode: 'ABCD-EF01' }, { challengeToken: 't', recoveryCode: 5 },
    { challengeToken: 't', recoveryCode: NOSQL }, { challengeToken: 't', recoveryCode: ['ABCD-EF23'] }, { challengeToken: 't', recoveryCode: RECOVERY, code: NOSQL },
  ])('challenge/verify rejects %j', async body => {
    const { controller, service } = mfa()
    await rejects(() => controller.verifyChallenge(body as never))
    noMfaCalls(service)
  })
  it.each([undefined, null, 'true', 1, 0, NOSQL, ['true']])('policy rejects mfaRequired %j', async mfaRequired => {
    const { controller, service } = mfa()
    await rejects(() => controller.setPolicy(uid, undefined as never, { mfaRequired } as never))
    noMfaCalls(service)
  })
  it.each(BAD_BODIES)('every MFA body endpoint rejects the non-object body %j', async body => {
    const { controller, service } = mfa()
    await rejects(() => controller.verifySetup(uid, body as never))
    await rejects(() => controller.disableTotp(uid, body as never))
    await rejects(() => controller.verifyChallenge(body as never))
    await rejects(() => controller.regenerateRecoveryCodes(uid, body as never))
    await rejects(() => controller.setPolicy(uid, undefined as never, body as never))
    noMfaCalls(service)
  })
  it.each(['', 'a b', "x';--", 'u'.repeat(101), '../etc'])('admin reset rejects path id %j', async userId => {
    const { controller, service } = mfa()
    await rejects(() => controller.adminReset(userId, sysadmin))
    noMfaCalls(service)
  })
  it.each(['a b', "x';--", 'u'.repeat(101)])('policy rejects tenant id %j', async tenantId => {
    const { controller, service } = mfa()
    await rejects(() => controller.getPolicy(tenantId))
    await rejects(() => controller.setPolicy(uid, tenantId, { mfaRequired: true }))
    noMfaCalls(service)
  })

  it('valid payloads reach the service unchanged (existing behaviour)', async () => {
    const { controller, service } = mfa()
    await controller.verifySetup(uid, { code: CODE })
    expect(service.verifySetup).toHaveBeenCalledWith('user-1', null, CODE)
    await controller.disableTotp(uid, { password: 'pw', code: CODE })
    expect(service.disableTotp).toHaveBeenCalledWith('user-1', null, 'pw', CODE)
    await controller.verifyChallenge({ challengeToken: 'tok', code: CODE })
    expect(service.verifyChallenge).toHaveBeenCalledWith('tok', { code: CODE, recoveryCode: undefined })
    await controller.verifyChallenge({ challengeToken: 'tok', recoveryCode: RECOVERY })
    expect(service.verifyChallenge).toHaveBeenLastCalledWith('tok', { code: undefined, recoveryCode: RECOVERY })
    await controller.regenerateRecoveryCodes(uid, { code: CODE })
    expect(service.regenerateRecoveryCodes).toHaveBeenCalledWith('user-1', null, CODE)
    await controller.adminReset('target-1', sysadmin)
    expect(service.adminResetMfa).toHaveBeenCalledWith('admin-1', null, 'target-1', { impersonation: false, impersonatorUserId: null })
    await expect(controller.setPolicy(uid, undefined as never, { mfaRequired: true })).resolves.toEqual({ mfaRequired: false })
    expect(service.setTenantPolicy).not.toHaveBeenCalled() // pre-existing: no :tenantId in the route (see report)
  })

  it('errors never contain the OTP, recovery code, token or password that was sent', async () => {
    const { controller } = mfa()
    const errors = [
      await rejects(() => controller.verifySetup(uid, { code: `${LEAK}` } as never)),
      await rejects(() => controller.disableTotp(uid, { password: NOSQL, code: LEAK } as never)),
      await rejects(() => controller.verifyChallenge({ challengeToken: NOSQL, code: LEAK, recoveryCode: `${LEAK}-x` } as never)),
    ]
    for (const error of errors) expect(JSON.stringify(error.getResponse())).not.toMatch(/Leaky|Marker/)
  })

  it('the recovery-code pattern is single-sourced with the DTO (no drift)', () => {
    const dto = readFileSync(join(__dirname, 'dto', 'mfa.dto.ts'), 'utf8')
    expect(dto).toContain("from '../domain/mfa-input.domain'")
    expect(dto).not.toMatch(/const RECOVERY_CODE_PATTERN/)
    expect(mfaInput.RECOVERY_CODE_PATTERN.test('ABCD-EF23')).toBe(true)
    expect(mfaInput.MFA_CODE_LENGTH).toBe(6)
  })
})

// ── Settings ────────────────────────────────────────────────────────────────

const SMTP_OK = { notificationsEnabled: true, host: 'smtp.example.test', port: 587, username: 'u', password: 'p', fromEmail: 'a@b.co', fromName: 'N', secure: false }
const AI_OK = { providerType: 'OPENAI', apiKey: 'k', endpoint: 'https://x.example', defaultModel: 'm', isActive: true }
const SMTP_BAD: Array<Record<string, unknown>> = [
  { notificationsEnabled: 'true' }, { notificationsEnabled: 1 }, { secure: 'no' }, { secure: NOSQL },
  { host: 5 }, { host: NOSQL }, { host: ['h'] }, { username: 5 }, { password: 5 }, { password: NOSQL }, { password: ['p'] }, { fromName: 5 }, { fromEmail: NOSQL },
  { port: '587' }, { port: 1.5 }, { port: NaN }, { port: Infinity }, { port: 2_147_483_648 }, { port: NOSQL }, { port: [587] }, { port: true },
]
const AI_BAD: Array<Record<string, unknown>> = [
  { providerType: 5 }, { providerType: NOSQL }, { apiKey: 5 }, { apiKey: NOSQL }, { apiKey: ['k'] }, { endpoint: 5 }, { endpoint: NOSQL }, { defaultModel: 5 }, { defaultModel: ['m'] },
  { isActive: 'true' }, { isActive: 1 }, { isActive: NOSQL },
]
const GENERAL_BAD: Array<Record<string, unknown>> = [{ name: 5 }, { name: NOSQL }, { name: ['n'] }, { shortName: 5 }, { shortName: null }, { shortName: NOSQL }, { address: 5 }, { address: null }, { address: ['a'] }]

describe('settings upsert bodies', () => {
  it.each(GENERAL_BAD)('platform general rejects %j', async override => {
    const s = settings()
    await rejects(() => s.platformController.upsertGeneral(admin, override as never))
    noCalls(s.platform)
  })
  it.each(SMTP_BAD)('platform SMTP rejects %j', async override => {
    const s = settings()
    await rejects(() => s.platformController.upsertSmtp(admin, { ...SMTP_OK, ...override } as never))
    noCalls(s.platform)
  })
  it.each(AI_BAD)('platform AI provider rejects %j', async override => {
    const s = settings()
    await rejects(() => s.platformController.upsertAiProvider(admin, { ...AI_OK, ...override } as never))
    noCalls(s.platform)
  })
  it.each(SMTP_BAD)('tenant SMTP override rejects %j', async override => {
    const s = settings()
    await rejects(() => s.smtpController.upsertOverride('tenant-1', { ...SMTP_OK, ...override } as never))
    noCalls(s.tenant)
  })
  it.each(AI_BAD)('tenant AI override rejects %j', async override => {
    const s = settings()
    await rejects(() => s.aiController.upsertOverride('tenant-1', { ...AI_OK, ...override } as never))
    noCalls(s.tenant)
  })
  it.each(BAD_BODIES)('all settings endpoints reject the non-object body %j', async body => {
    const s = settings()
    await rejects(() => s.platformController.upsertGeneral(admin, body as never))
    await rejects(() => s.platformController.upsertSmtp(admin, body as never))
    await rejects(() => s.platformController.upsertAiProvider(admin, body as never))
    await rejects(() => s.smtpController.upsertOverride('tenant-1', body as never))
    await rejects(() => s.aiController.upsertOverride('tenant-1', body as never))
    noCalls(s.platform, s.tenant)
  })

  it('a non-admin still gets the existing 403 first — validation never runs before the permission check', async () => {
    const s = settings()
    const calls = [
      () => s.platformController.upsertGeneral(nonAdmin, { name: 5 } as never),
      () => s.platformController.upsertSmtp(nonAdmin, { port: 'x' } as never),
      () => s.platformController.upsertAiProvider(nonAdmin, { isActive: 'x' } as never),
    ]
    for (const call of calls) expect(await call().catch(e => e)).toBeInstanceOf(ForbiddenException)
    noCalls(s.platform)
  })

  it('valid UI payloads (SMTP, general, AI, clearing with null) still reach the service unchanged', async () => {
    const s = settings()
    await s.smtpController.upsertOverride('tenant-1', { host: 'h', port: 587, username: 'u', password: 'p', fromEmail: 'a@b.co', fromName: 'N', notificationsEnabled: true })
    expect(s.tenant.upsertSmtpOverride).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ port: 587, host: 'h' }))
    await s.platformController.upsertGeneral(admin, { name: 'Metnex', shortName: '', address: '' })
    expect(s.platform.upsertGeneral).toHaveBeenCalledTimes(1)
    await s.platformController.upsertSmtp(admin, { ...SMTP_OK, host: null, port: null, password: null } as never)
    await s.platformController.upsertAiProvider(admin, { ...AI_OK, endpoint: null } as never)
    await s.aiController.upsertOverride('tenant-1', AI_OK)
    expect(s.platform.upsertSmtp).toHaveBeenCalledTimes(1)
    expect(s.platform.upsertAiProvider).toHaveBeenCalledTimes(1)
    expect(s.tenant.upsertAiProviderOverride).toHaveBeenCalledTimes(1)
  })

  it('no unproven rule is imposed: long values, any provider string, any port integer and non-URL endpoints are accepted', () => {
    expect(settingsInput.validateSmtpSettings({ host: 'h'.repeat(5000), port: 0, fromEmail: 'not-an-email' }).valid).toBe(true)
    expect(settingsInput.validateAiSettings({ providerType: 'anything', endpoint: 'not a url', defaultModel: 'm'.repeat(5000) }).valid).toBe(true)
    expect(settingsInput.validateSmtpSettings({ port: 70000 }).valid).toBe(true)
  })

  it('errors never echo host, username, password or API key values', async () => {
    const s = settings()
    const smtp = await rejects(() => s.platformController.upsertSmtp(admin, { host: NOSQL, password: `${LEAK}`, username: LEAK, port: LEAK } as never))
    const ai = await rejects(() => s.aiController.upsertOverride('tenant-1', { apiKey: NOSQL, endpoint: LEAK, isActive: LEAK } as never))
    for (const error of [smtp, ai]) expect(JSON.stringify(error.getResponse())).not.toMatch(/Leaky|Marker/)
  })
})

describe('X-Tenant-Id header on tenant settings', () => {
  const guard = new TenantHeaderFormatGuard()
  const ctx = (header: unknown) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: header === undefined ? {} : { 'x-tenant-id': header } }) }) }) as never

  it.each([undefined, '', 'a b', "t';--", 't'.repeat(101), ['t1', 't2'], NOSQL, 5, '../x'])('the format guard rejects %j with a static 400', header => {
    expect(() => guard.canActivate(ctx(header))).toThrow(BadRequestException)
    try { guard.canActivate(ctx(header)) } catch (e) { expect(JSON.stringify((e as BadRequestException).getResponse())).not.toMatch(/Leaky|Marker|t';--/) }
  })

  it('a well-formed id passes (authorisation stays with the membership/permission guards)', () => {
    expect(guard.canActivate(ctx('0b6f1c9e-1c2d-4f3a-9d1e-2a3b4c5d6e7f'))).toBe(true)
  })

  it('the guard runs after authentication and before every database-backed guard on both tenant settings controllers', () => {
    for (const file of ['tenant-settings-smtp.controller.ts', 'tenant-settings-ai.controller.ts']) {
      const source = readFileSync(join(__dirname, '..', 'settings', file), 'utf8')
      expect(source).toContain('@UseGuards(JwtAuthGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard)')
    }
  })

  it('the guard grants nothing: no bypass, no database, no admin shortcut', () => {
    const source = readFileSync(join(__dirname, 'guards', 'tenant-header-format.guard.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(source).not.toMatch(/isSystemAdmin|PLATFORM_ROOT|TENANT_ADMIN|@Inject\(|drizzle|\bdb\b/)
  })

  it('tenant-scoped controller endpoints keep their permission decorators', () => {
    for (const [file, perms] of [['tenant-settings-smtp.controller.ts', ['SETTINGS:SMTP:VIEW', 'SETTINGS:SMTP:MANAGE']], ['tenant-settings-ai.controller.ts', ['SETTINGS:AI_PROVIDER:VIEW', 'SETTINGS:AI_PROVIDER:MANAGE']]] as const) {
      const source = readFileSync(join(__dirname, '..', 'settings', file), 'utf8')
      for (const permission of perms) expect(source).toContain(`@RequirePermission('${permission}')`)
    }
  })
})

// ── Perf ────────────────────────────────────────────────────────────────────

const noPerf = (p: ReturnType<typeof perf>) => { noCalls(p.diagnostics); noCalls(p.settingsSvc) }
const SLOW_BAD: Array<Record<string, unknown>> = [
  { limit: '-1' }, { limit: 'abc' }, { limit: '5x' }, { limit: '1.5' }, { limit: ['1', '2'] }, { limit: NOSQL }, { limit: '99999999999' }, { limit: '2147483648' },
  { offset: '-1' }, { offset: 'x' }, { offset: ['0'] }, { offset: NOSQL },
  { tenantId: 'a b' }, { tenantId: ['t'] }, { tenantId: NOSQL }, { tenantId: "t';--" }, { tenantId: 't'.repeat(101) },
  { route: ['a'] }, { route: NOSQL },
  { statusCode: 'abc' }, { statusCode: '-500' }, { statusCode: ['500'] }, { statusCode: NOSQL },
  { from: 'not-a-date' }, { from: ['2026-01-01'] }, { from: NOSQL }, { to: 'yesterday-ish' }, { to: NOSQL },
]

describe('performance admin inputs', () => {
  const slow = (c: PerfAdminController, o: Record<string, unknown> = {}, u = admin) =>
    c.slowRequests(u, o['limit'] as never, o['offset'] as never, o['tenantId'] as never, o['route'] as never, o['statusCode'] as never, o['from'] as never, o['to'] as never)

  it.each(SLOW_BAD)('slow-requests rejects %j before the diagnostics service', async override => {
    const p = perf()
    await rejects(() => slow(p.controller, override))
    noPerf(p)
  })
  it.each([{ limit: '-1' }, { limit: 'x' }, { limit: ['1'] }, { offset: '-1' }, { tenantId: 'a b' }, { tenantId: NOSQL }])('slow-queries rejects %j', async override => {
    const p = perf()
    await rejects(() => p.controller.slowQueries(admin, override['limit' as never] as never, override['offset' as never] as never, override['tenantId' as never] as never))
    noPerf(p)
  })
  it.each(['', 'a b', "x';--", 'i'.repeat(101)])('slow-request detail rejects id %j', async id => {
    const p = perf()
    await rejects(() => p.controller.slowRequestDetail(admin, id))
    noPerf(p)
  })
  it.each([undefined, '', 'zzzz', 'ABCDEF0123456789', '0123456789abcde', '0123456789abcdef0', 5, NOSQL, ['0123456789abcdef'], "0123456789abcde';"])('explain rejects queryHash %j', async queryHash => {
    const p = perf()
    await rejects(() => p.controller.explain(admin, { queryHash } as never))
    noPerf(p)
  })
  it.each([
    { slowRequestThresholdMs: '1000' }, { slowRequestThresholdMs: 1.5 }, { slowRequestThresholdMs: NaN }, { slowRequestThresholdMs: 2_147_483_648 }, { slowRequestThresholdMs: NOSQL }, { slowRequestThresholdMs: [1000] }, { slowRequestThresholdMs: null },
    { dbTraceEnabled: 'true' }, { dbTraceEnabled: 1 }, { dbTraceEnabled: NOSQL }, { dbTraceEnabled: null },
  ])('perf settings PATCH rejects %j', async body => {
    const p = perf()
    await rejects(() => p.controller.updateSettings(admin, body as never))
    noPerf(p)
  })
  it.each(BAD_BODIES)('explain and settings PATCH reject the non-object body %j', async body => {
    const p = perf()
    await rejects(() => p.controller.explain(admin, body as never))
    await rejects(() => p.controller.updateSettings(admin, body as never))
    noPerf(p)
  })

  it('non-admins still get the existing 403 before validation runs', async () => {
    const p = perf()
    expect(await slow(p.controller, { limit: '-1' }, nonAdmin as never).catch(e => e)).toBeInstanceOf(ForbiddenException)
    expect(await p.controller.explain(nonAdmin as never, { queryHash: 'x' } as never).catch(e => e)).toBeInstanceOf(ForbiddenException)
    expect(await p.controller.updateSettings(nonAdmin as never, { slowRequestThresholdMs: 'x' } as never).catch(e => e)).toBeInstanceOf(ForbiddenException)
    expect(await p.controller.slowRequestDetail(nonAdmin as never, 'a b').catch(e => e)).toBeInstanceOf(ForbiddenException)
    noPerf(p)
  })

  it('valid existing requests keep their behaviour, including clamping and defaults', async () => {
    const p = perf()
    await slow(p.controller, { limit: '50' })
    expect(p.diagnostics.slowRequests).toHaveBeenLastCalledWith(50, 0, expect.objectContaining({ statusCode: undefined }))
    await slow(p.controller, { limit: '9999', offset: '10', tenantId: 'tenant-1', route: '/api', statusCode: '500', from: '2026-01-01', to: '2026-02-01' })
    expect(p.diagnostics.slowRequests).toHaveBeenLastCalledWith(200, 10, expect.objectContaining({ tenantId: 'tenant-1', route: '/api', statusCode: 500, from: new Date('2026-01-01'), to: new Date('2026-02-01') }))
    await slow(p.controller, { limit: '', statusCode: '', from: '', tenantId: '' })
    expect(p.diagnostics.slowRequests).toHaveBeenLastCalledWith(50, 0, expect.objectContaining({ statusCode: undefined, from: undefined }))
    await p.controller.slowQueries(admin, '30')
    expect(p.diagnostics.slowQuerySummary).toHaveBeenLastCalledWith(30, 0, undefined)
    await p.controller.slowRequestDetail(admin, '0b6f1c9e-1c2d-4f3a-9d1e-2a3b4c5d6e7f')
    await p.controller.explain(admin, { queryHash: '0123456789abcdef' })
    expect(p.diagnostics.explainQuery).toHaveBeenCalledWith('0123456789abcdef')
    await p.controller.updateSettings(admin, { slowRequestThresholdMs: 1000, dbTraceEnabled: false })
    expect(p.settingsSvc.updateSettings).toHaveBeenCalledWith({ slowRequestThresholdMs: 1000, dbTraceEnabled: false }, 'admin-1')
    await p.controller.updateSettings(admin, {})
    expect(p.settingsSvc.updateSettings).toHaveBeenCalledTimes(2)
  })

  it('no unproven rule is imposed: from>to, any route text, any status-code integer and any threshold integer are accepted', () => {
    expect(perfInput.validateSlowRequestsQuery({ from: '2026-02-01', to: '2026-01-01', route: 'x'.repeat(5000), statusCode: '999' }).valid).toBe(true)
    expect(perfInput.validatePerfSettingsBody({ slowRequestThresholdMs: 1 }).valid).toBe(true)
    expect(perfInput.validatePerfSettingsBody({ slowRequestThresholdMs: 0 }).valid).toBe(true)
  })

  it('errors never echo a supplied value', async () => {
    const p = perf()
    const errors = [
      await rejects(() => slow(p.controller, { limit: LEAK, tenantId: `${LEAK} x`, from: LEAK })),
      await rejects(() => p.controller.explain(admin, { queryHash: LEAK } as never)),
      await rejects(() => p.controller.slowRequestDetail(admin, `${LEAK} x`)),
    ]
    for (const error of errors) expect(JSON.stringify(error.getResponse())).not.toMatch(/Leaky|Marker/)
  })
})

// ── Static guarantees ───────────────────────────────────────────────────────

describe('static guarantees', () => {
  const SRC = join(__dirname, '..')
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const read = (rel: string) => strip(readFileSync(join(SRC, rel), 'utf8'))
  const VALIDATORS = ['platform/domain/mfa-input.domain.ts', 'settings/settings-input.domain.ts', 'perf/perf-input.domain.ts']

  it('registers no global ValidationPipe: the DTO decorators are inert, which is why validation lives in the boundary', () => {
    for (const rel of ['main.ts', 'app.module.ts']) expect(read(rel)).not.toMatch(/ValidationPipe|useGlobalPipes|APP_PIPE/)
  })

  it('adds no validation framework: validators import only sibling pure modules', () => {
    for (const rel of VALIDATORS) {
      const imports = read(rel).match(/^import .*$/gm) ?? []
      for (const line of imports) expect(line).toMatch(/from '(\.\/|\.\.\/)[^']*(platform-input\.domain)'/)
      expect(read(rel)).not.toMatch(/class-validator|class-transformer|zod|joi|ajv|@nestjs|drizzle|process\.env|console\.|Logger/i)
    }
    const deps = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    for (const banned of ['zod', 'joi', 'ajv', 'yup', 'valibot']) expect(deps.dependencies[banned]).toBeUndefined()
  })

  it('every MFA/settings/perf handler validates before its first service call', () => {
    const expectations: Array<[string, string, string, string]> = [
      ['platform/mfa.controller.ts', 'async verifySetup', 'validateVerifyTotpSetup', 'this.mfaService'],
      ['platform/mfa.controller.ts', 'async disableTotp', 'validateDisableTotp', 'this.mfaService'],
      ['platform/mfa.controller.ts', 'async verifyChallenge', 'validateVerifyMfaChallenge', 'this.mfaService'],
      ['platform/mfa.controller.ts', 'async regenerateRecoveryCodes', 'validateRegenerateRecoveryCodes', 'this.mfaService'],
      ['platform/mfa.controller.ts', 'async adminReset', 'validateMfaPathId', 'this.mfaService'],
      ['platform/mfa.controller.ts', 'async setPolicy', 'validateSetTenantMfaPolicy', 'this.mfaService'],
      ['settings/platform-settings.controller.ts', 'async upsertGeneral', 'validatePlatformGeneral', 'this.svc'],
      ['settings/platform-settings.controller.ts', 'async upsertSmtp', 'validateSmtpSettings', 'this.svc'],
      ['settings/platform-settings.controller.ts', 'async upsertAiProvider', 'validateAiSettings', 'this.svc'],
      ['settings/tenant-settings-smtp.controller.ts', 'async upsertOverride', 'validateSmtpSettings', 'this.svc'],
      ['settings/tenant-settings-ai.controller.ts', 'async upsertOverride', 'validateAiSettings', 'this.svc'],
      ['perf/perf-admin.controller.ts', 'async slowRequests', 'validateSlowRequestsQuery', 'this.diagnostics'],
      ['perf/perf-admin.controller.ts', 'async slowRequestDetail', 'validatePerfId', 'this.diagnostics'],
      ['perf/perf-admin.controller.ts', 'async slowQueries', 'validateSlowQueriesQuery', 'this.diagnostics'],
      ['perf/perf-admin.controller.ts', 'async explain', 'validateExplainBody', 'this.diagnostics'],
      ['perf/perf-admin.controller.ts', 'async updateSettings', 'validatePerfSettingsBody', 'this.settings'],
    ]
    for (const [file, method, validator, service] of expectations) {
      const source = read(file)
      const body = source.slice(source.indexOf(method))
      const validatorAt = body.indexOf(`${validator}(`)
      const serviceAt = body.indexOf(service)
      expect(validatorAt).toBeGreaterThan(-1)
      expect(validatorAt).toBeLessThan(serviceAt)
    }
  })

  it('platform settings and perf controllers keep their system-admin check ahead of validation', () => {
    for (const [file, guardCall] of [['settings/platform-settings.controller.ts', 'this.requireSystemAdmin(user)'], ['perf/perf-admin.controller.ts', 'assertSystemAdmin(user)']] as const) {
      const source = read(file)
      for (const method of source.split('async ').slice(1)) {
        if (!/validate\w+\(/.test(method)) continue
        expect(method.indexOf(guardCall)).toBeGreaterThan(-1)
        expect(method.indexOf(guardCall)).toBeLessThan(method.search(/validate\w+\(/))
      }
    }
  })

  it('no credential is logged by the touched controllers and validators', () => {
    for (const rel of ['platform/mfa.controller.ts', 'settings/platform-settings.controller.ts', 'settings/tenant-settings-smtp.controller.ts', 'settings/tenant-settings-ai.controller.ts', 'perf/perf-admin.controller.ts', ...VALIDATORS]) {
      expect(read(rel)).not.toMatch(/console\.|logger\.\w+\(|Logger/i)
    }
  })

  it('adds no isSystemAdmin/TENANT_ADMIN/PLATFORM_ROOT bypass in the validators', () => {
    for (const rel of VALIDATORS) expect(read(rel)).not.toMatch(/isSystemAdmin|TENANT_ADMIN|PLATFORM_ROOT|bypass/i)
  })
})
