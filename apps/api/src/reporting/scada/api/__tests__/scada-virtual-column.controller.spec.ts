import { HttpException } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { REQUIRE_MFA_SETUP_COMPLETE_KEY } from '../../../../platform/decorators/require-mfa-setup-complete.decorator'
import { MfaEnforcementGuard } from '../../../../platform/guards/mfa-enforcement.guard'
import { TenantHeaderFormatGuard } from '../../../../platform/guards/tenant-header-format.guard'
import { JwtAuthGuard } from '../../../../platform/jwt-auth.guard'
import { PERMISSION_KEY, PermissionGuard } from '../../../../platform/permission.guard'
import { TenantMembershipGuard } from '../../../../platform/tenant-membership.guard'
import { ScadaApiError } from '../scada-api.contract'
import { ScadaVirtualColumnController } from '../scada-virtual-column.controller'
import type { ScadaAnalysisApiService } from '../scada-analysis-api.service'

const H = ['list', 'create', 'activate', 'disable'] as const
const proto = ScadaVirtualColumnController.prototype as unknown as Record<string, () => unknown>

describe('ScadaVirtualColumnController (development only)', () => {
  it('four routes under /reports with the SAME guard chain and the EXISTING view permission (no new permission code)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ScadaVirtualColumnController)).toBe('reports')
    expect(H.map(h => [Reflect.getMetadata(METHOD_METADATA, proto[h]!) as number, Reflect.getMetadata(PATH_METADATA, proto[h]!) as string])).toEqual([
      [0, ':code/analysis/virtual-columns'], [1, ':code/analysis/virtual-columns'], [1, ':code/analysis/virtual-columns/:id/activate'], [1, ':code/analysis/virtual-columns/:id/disable'],
    ])
    expect(Reflect.getMetadata('__guards__', ScadaVirtualColumnController)).toEqual([JwtAuthGuard, MfaEnforcementGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard])
    expect(Reflect.getMetadata(REQUIRE_MFA_SETUP_COMPLETE_KEY, ScadaVirtualColumnController)).toBe(true)
    for (const h of H) expect(Reflect.getMetadata(PERMISSION_KEY, proto[h]!)).toBe('REPORT:ARTIFACT:VIEW')
  })

  it('hands the service the session actor, the guarded tenant header and the raw body (validation only); errors are static', async () => {
    const svc = { listVirtualColumns: jest.fn(async () => ({})), createVirtualColumn: jest.fn(async () => ({})), activateVirtualColumn: jest.fn(async () => ({})), disableVirtualColumn: jest.fn(async () => ({})) }
    const c = new ScadaVirtualColumnController(svc as unknown as ScadaAnalysisApiService)
    const body = { actorId: 'evil', tenantId: 'evil' }
    await c.create('t-1', { id: 'u-1' }, 'CODE', body)
    expect(svc.createVirtualColumn).toHaveBeenCalledWith({ actor: { id: 'u-1' }, tenantId: 't-1', routeCode: 'CODE', body })
    await c.activate('t-1', { id: 'u-1' }, 'CODE', 'vc-1')
    expect(svc.activateVirtualColumn).toHaveBeenCalledWith({ actor: { id: 'u-1' }, tenantId: 't-1', routeCode: 'CODE', param: 'vc-1' })
    svc.createVirtualColumn.mockRejectedValue(new ScadaApiError('SCADA_VIRTUAL_COLUMN_INVALID'))
    const e = await c.create('t-1', { id: 'u-1' }, 'CODE', { expression: 'SELECT 1' }).catch(x => x)
    expect(e).toBeInstanceOf(HttpException)
    expect(e.getResponse()).toEqual({ statusCode: 409, code: 'SCADA_VIRTUAL_COLUMN_INVALID', message: 'SCADA_VIRTUAL_COLUMN_INVALID' })
    svc.disableVirtualColumn.mockRejectedValue(new Error('Server=10.0.0.5;Password=hunter2'))
    const raw = await c.disable('t-1', { id: 'u-1' }, 'CODE', 'vc-1').catch(x => x)
    expect(JSON.stringify(raw.getResponse())).not.toMatch(/hunter2|Server=/)
  })
})
