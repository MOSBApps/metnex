import { ForbiddenException, HttpException } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { buildMockDb, chain } from '../../../../db/test-helpers/drizzle-mock'
import { REQUIRE_MFA_SETUP_COMPLETE_KEY } from '../../../../platform/decorators/require-mfa-setup-complete.decorator'
import { MfaEnforcementGuard } from '../../../../platform/guards/mfa-enforcement.guard'
import { TenantHeaderFormatGuard } from '../../../../platform/guards/tenant-header-format.guard'
import { JwtAuthGuard } from '../../../../platform/jwt-auth.guard'
import { PERMISSION_KEY, PermissionGuard } from '../../../../platform/permission.guard'
import { TenantMembershipGuard } from '../../../../platform/tenant-membership.guard'
import type { ScadaExportResult } from '../../export/scada-export.contract'
import { ScadaApiError } from '../scada-api.contract'
import type { ScadaAnalysisApiService } from '../scada-analysis-api.service'
import { ScadaAnalysisController } from '../scada-analysis.controller'

const proto = ScadaAnalysisController.prototype as unknown as Record<string, () => unknown>

function res() {
  const r = { headers: {} as Record<string, string>, statusCode: 0, body: undefined as unknown, json: undefined as unknown, sent: false }
  return Object.assign(r, {
    setHeader: (k: string, v: string) => void (r.headers[k] = v),
    status: (c: number) => { r.statusCode = c; return r },
    send: (b: unknown) => { r.body = b; r.sent = true },
    jsonOut: undefined,
  }) as typeof r & { setHeader(k: string, v: string): void; status(c: number): typeof r; send(b: unknown): void; json(b: unknown): void }
}

describe('POST /reports/:code/analysis/export/:format', () => {
  it('sits behind the same guard chain but needs the EXISTING export permission (not the view permission); no new permission code', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ScadaAnalysisController)).toBe('reports')
    expect(Reflect.getMetadata(METHOD_METADATA, proto['exportAnalysis']!)).toBe(1)
    expect(Reflect.getMetadata(PATH_METADATA, proto['exportAnalysis']!)).toBe(':code/analysis/export/:format')
    expect(Reflect.getMetadata('__guards__', ScadaAnalysisController)).toEqual([JwtAuthGuard, MfaEnforcementGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard])
    expect(Reflect.getMetadata(REQUIRE_MFA_SETUP_COMPLETE_KEY, ScadaAnalysisController)).toBe(true)
    expect(Reflect.getMetadata(PERMISSION_KEY, proto['exportAnalysis']!)).toBe('REPORT:ARTIFACT:EXPORT')
    expect(Reflect.getMetadata(METHOD_METADATA, proto['completePngExport']!)).toBe(1)
    expect(Reflect.getMetadata(PATH_METADATA, proto['completePngExport']!)).toBe(':code/analysis/export/PNG/complete')
    expect(Reflect.getMetadata(PERMISSION_KEY, proto['completePngExport']!)).toBe('REPORT:ARTIFACT:EXPORT')
    for (const h of ['analyse', 'compare', 'catalog', 'listPresets', 'getPreset']) expect(Reflect.getMetadata(PERMISSION_KEY, proto[h]!)).toBe('REPORT:ARTIFACT:VIEW')
  })

  function guardCtx(user: { id: string; isSystemAdmin: boolean }, held: string[]) {
    const db = buildMockDb()
    db.select.mockReturnValueOnce(chain([{ id: 'root-1', type: 'ROOT', customerRootId: null }])).mockReturnValueOnce(chain([])).mockReturnValueOnce(chain(held.map(permissionCode => ({ permissionCode }))))
    const audit = { log: jest.fn(async () => undefined) }
    const guard = new PermissionGuard(new Reflector(), db as never, audit as never)
    const request = { user, headers: { 'x-tenant-id': 'root-1' }, params: { code: 'SCADA_HOURLY_ANALYSIS', format: 'CSV' } }
    const context = { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => proto['exportAnalysis'], getClass: () => ScadaAnalysisController } as never
    return { guard, audit, context }
  }

  it('a user who may only VIEW is denied by the real PermissionGuard (REPORT_EXPORT_DENIED audited, before any service call)', async () => {
    const g = guardCtx({ id: 'u1', isSystemAdmin: false }, ['REPORT:ARTIFACT:VIEW'])
    await expect(g.guard.canActivate(g.context)).rejects.toBeInstanceOf(ForbiddenException)
    expect(g.audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionCode: 'REPORT_EXPORT_DENIED', entityId: 'SCADA_HOURLY_ANALYSIS', metadata: expect.objectContaining({ tenantId: 'root-1', result: 'DENIED', reasonCode: 'PERMISSION_DENIED' }) }))
  })

  it('a user holding REPORT:ARTIFACT:EXPORT passes the permission guard; no denial record', async () => {
    const g = guardCtx({ id: 'u1', isSystemAdmin: false }, ['REPORT:ARTIFACT:EXPORT'])
    await expect(g.guard.canActivate(g.context)).resolves.toBe(true)
    expect(g.audit.log).not.toHaveBeenCalled()
  })

  it('hands the service ONLY the session actor, the guarded tenant header, the route code, the format and the raw body (validation only)', async () => {
    const service = { runExport: jest.fn(async (): Promise<ScadaExportResult> => ({ kind: 'FILE', buffer: Buffer.from('x'), contentType: 'text/csv; charset=utf-8', fileName: 'scada_a_2026-06-01.csv' })) }
    const c = new ScadaAnalysisController(service as unknown as ScadaAnalysisApiService)
    const body = { analysis: {}, actorId: 'evil', tenantId: 'evil' }
    const r = res()
    await c.exportAnalysis('t-1', { id: 'u-1' }, 'CODE', 'CSV', body, r as never)
    expect(service.runExport).toHaveBeenCalledWith({ actor: { id: 'u-1' }, tenantId: 't-1', routeCode: 'CODE', param: 'CSV', body })
    expect(r.headers).toMatchObject({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="scada_a_2026-06-01.csv"', 'Cache-Control': 'no-store' })
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual(Buffer.from('x'))
  })

  it('PNG answers a JSON caption (no bytes); errors are static and carry nothing of the request or the provider', async () => {
    const service = { runExport: jest.fn() }
    const c = new ScadaAnalysisController(service as unknown as ScadaAnalysisApiService)
    service.runExport.mockResolvedValue({ kind: 'PNG_CAPTION', format: 'PNG', exportId: 'srv-1', fileName: 'x.png', title: 'T', captionLines: ['a'], developmentLabel: null, rowCount: 3 })
    const r = res()
    let json: unknown
    r.json = (b: unknown) => void (json = b)
    await c.exportAnalysis('t-1', { id: 'u-1' }, 'CODE', 'PNG', {}, r as never)
    expect(json).toEqual({ format: 'PNG', exportId: 'srv-1', fileName: 'x.png', title: 'T', captionLines: ['a'], developmentLabel: null, rowCount: 3 })
    expect(r.sent).toBe(false)

    service.runExport.mockRejectedValue(new ScadaApiError('SCADA_EXPORT_EMPTY'))
    const e = await c.exportAnalysis('t-1', { id: 'u-1' }, 'CODE', 'CSV', {}, res() as never).catch(x => x)
    expect(e).toBeInstanceOf(HttpException)
    expect(e.getResponse()).toEqual({ statusCode: 409, code: 'SCADA_EXPORT_EMPTY', message: 'SCADA_EXPORT_EMPTY' })
    service.runExport.mockRejectedValue(new Error('Server=10.0.0.5;Password=hunter2'))
    const raw = await c.exportAnalysis('t-1', { id: 'u-1' }, 'CODE', 'CSV', {}, res() as never).catch(x => x)
    expect(JSON.stringify(raw.getResponse())).not.toMatch(/hunter2|Server=/)
    expect(raw.getStatus()).toBe(500)
  })
})

describe('POST /reports/:code/analysis/export/PNG/complete', () => {
  it('hands the service ONLY the session actor, the guarded tenant header, the route code and the raw body; errors are static', async () => {
    const service = { completePngExport: jest.fn(async () => ({ recorded: true })) }
    const c = new ScadaAnalysisController(service as unknown as ScadaAnalysisApiService)
    const body = { exportId: 'srv-1', outcome: 'SUCCEEDED', tenantId: 'evil' }
    expect(await c.completePngExport('t-1', { id: 'u-1' }, 'CODE', body)).toEqual({ recorded: true })
    expect(service.completePngExport).toHaveBeenCalledWith({ actor: { id: 'u-1' }, tenantId: 't-1', routeCode: 'CODE', body })
    service.completePngExport.mockRejectedValue(new ScadaApiError('SCADA_EXPORT_CONTEXT_INVALID'))
    const e = await c.completePngExport('t-1', { id: 'u-1' }, 'CODE', {}).catch(x => x)
    expect(e.getResponse()).toEqual({ statusCode: 409, code: 'SCADA_EXPORT_CONTEXT_INVALID', message: 'SCADA_EXPORT_CONTEXT_INVALID' })
  })
})
