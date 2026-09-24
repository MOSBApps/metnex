import { HttpException } from '@nestjs/common'
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { REQUIRE_MFA_SETUP_COMPLETE_KEY } from '../../../../platform/decorators/require-mfa-setup-complete.decorator'
import { MfaEnforcementGuard } from '../../../../platform/guards/mfa-enforcement.guard'
import { TenantHeaderFormatGuard } from '../../../../platform/guards/tenant-header-format.guard'
import { JwtAuthGuard } from '../../../../platform/jwt-auth.guard'
import { PERMISSION_KEY, PermissionGuard } from '../../../../platform/permission.guard'
import { TenantMembershipGuard } from '../../../../platform/tenant-membership.guard'
import { ScadaApiError } from '../scada-api.contract'
import type { ScadaAnalysisApiService } from '../scada-analysis-api.service'
import { ScadaPresetController } from '../scada-preset.controller'

const create = ScadaPresetController.prototype.create as unknown as () => unknown

describe('ScadaPresetController (development only)', () => {
  it('one POST route under /reports with the SAME guard chain and the EXISTING view permission (no new permission code)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ScadaPresetController)).toBe('reports')
    expect(Reflect.getMetadata(METHOD_METADATA, create)).toBe(1)
    expect(Reflect.getMetadata(PATH_METADATA, create)).toBe(':code/analysis/presets')
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, create)).toBe(201)
    expect(Reflect.getMetadata('__guards__', ScadaPresetController)).toEqual([JwtAuthGuard, MfaEnforcementGuard, TenantHeaderFormatGuard, TenantMembershipGuard, PermissionGuard])
    expect(Reflect.getMetadata(REQUIRE_MFA_SETUP_COMPLETE_KEY, ScadaPresetController)).toBe(true)
    expect(Reflect.getMetadata(PERMISSION_KEY, create)).toBe('REPORT:ARTIFACT:VIEW')
  })

  it('hands the service ONLY the session actor, the guarded tenant header, the route code and the raw body (validation only); errors are static', async () => {
    const svc = { createPreset: jest.fn(async () => ({})) }
    const c = new ScadaPresetController(svc as unknown as ScadaAnalysisApiService)
    const body = { tenantId: 'evil', role: 'ADMIN' }
    await c.create('t-1', { id: 'u-1' }, 'CODE', body)
    expect(svc.createPreset).toHaveBeenCalledWith({ actor: { id: 'u-1' }, tenantId: 't-1', routeCode: 'CODE', body })
    svc.createPreset.mockRejectedValue(new ScadaApiError('SCADA_SCOPE_DENIED'))
    const e = await c.create('t-1', { id: 'u-1' }, 'CODE', {}).catch(x => x)
    expect(e).toBeInstanceOf(HttpException)
    expect(e.getResponse()).toEqual({ statusCode: 403, code: 'SCADA_SCOPE_DENIED', message: 'SCADA_SCOPE_DENIED' })
    svc.createPreset.mockRejectedValue(new Error('Server=10.0.0.5;Password=hunter2 SELECT 1'))
    const raw = await c.create('t-1', { id: 'u-1' }, 'CODE', {}).catch(x => x)
    expect(JSON.stringify(raw.getResponse())).not.toMatch(/hunter2|Server=|SELECT/)
  })
})
