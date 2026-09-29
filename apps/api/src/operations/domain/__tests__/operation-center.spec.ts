import { resolveOperationCenterForCaller, resolveOperationCenterOwner, type OperationCenter, type TenantOperationRoleAssignment } from '../operation-center.contract'
import type { TenantIdentity } from '../tenant-identity'

const tenant = (id: string, over: Partial<TenantIdentity> = {}): TenantIdentity => ({ tenantId: id, type: 'STANDARD', status: 'ACTIVE', slug: `slug-${id}`, ...over })
const komurKazani = (over: Partial<OperationCenter> = {}): OperationCenter => ({ operationCenterId: 'oc-komur-1', kind: 'KOMUR_KAZANI', ownerTenantId: 't-mosb-enerji', status: 'ACTIVE', ...over })
const kirimTesisi = (over: Partial<OperationCenter> = {}): OperationCenter => ({ operationCenterId: 'oc-kirim-1', kind: 'KIRIM_TESISI', ownerTenantId: 't-mosbio', status: 'ACTIVE', ...over })
const assignments: TenantOperationRoleAssignment[] = [
  { tenantId: 't-mosb-enerji', role: 'MOSB_ENERJI' },
  { tenantId: 't-mosbio', role: 'MOSBIO' },
]

describe('Kömür Kazanı yalnız MOSB ENERJİ altında çözülür', () => {
  it('resolves when the owner tenant is assigned MOSB_ENERJI', () => {
    const r = resolveOperationCenterOwner(komurKazani(), tenant('t-mosb-enerji'), assignments)
    expect(r).toEqual({ ok: true, center: komurKazani(), ownerRole: 'MOSB_ENERJI' })
  })

  it('is refused if the owner tenant is assigned MOSBIO instead', () => {
    const r = resolveOperationCenterOwner(komurKazani({ ownerTenantId: 't-mosbio' }), tenant('t-mosbio'), assignments)
    expect(r).toEqual({ ok: false, code: 'OWNER_ROLE_MISMATCH' })
  })

  it('is refused if the owner tenant has no role assignment at all', () => {
    const r = resolveOperationCenterOwner(komurKazani({ ownerTenantId: 't-unassigned' }), tenant('t-unassigned'), assignments)
    expect(r).toEqual({ ok: false, code: 'OWNER_ROLE_UNASSIGNED' })
  })
})

describe('Kırım Tesisi yalnız MOSBİO altında çözülür', () => {
  it('resolves when the owner tenant is assigned MOSBIO', () => {
    const r = resolveOperationCenterOwner(kirimTesisi(), tenant('t-mosbio'), assignments)
    expect(r).toEqual({ ok: true, center: kirimTesisi(), ownerRole: 'MOSBIO' })
  })

  it('is refused if the owner tenant is assigned MOSB_ENERJI instead', () => {
    const r = resolveOperationCenterOwner(kirimTesisi({ ownerTenantId: 't-mosb-enerji' }), tenant('t-mosb-enerji'), assignments)
    expect(r).toEqual({ ok: false, code: 'OWNER_ROLE_MISMATCH' })
  })
})

describe('Operasyon merkezi ayrı tenant gibi kabul edilmez', () => {
  it('OperationCenter has no tenant-shaped fields (type/status-as-tenant/slug) — only an opaque id and its owner tenant', () => {
    const center = komurKazani()
    expect(Object.keys(center).sort()).toEqual(['kind', 'operationCenterId', 'ownerTenantId', 'status'].sort())
    expect(center).not.toHaveProperty('slug')
    expect(center).not.toHaveProperty('type')
  })

  it('an operation center never resolves as its own tenant: the owner tenant must be a REAL, separately supplied TenantIdentity', () => {
    // passing the operation center's own id as if it were a tenant id never resolves (no coercion path exists)
    const r = resolveOperationCenterOwner(komurKazani(), tenant(komurKazani().operationCenterId), assignments)
    expect(r.ok).toBe(false)
  })

  it('an inactive operation center never resolves, even with a valid owner and assignment', () => {
    const r = resolveOperationCenterOwner(komurKazani({ status: 'INACTIVE' }), tenant('t-mosb-enerji'), assignments)
    expect(r).toEqual({ ok: false, code: 'OPERATION_CENTER_INACTIVE' })
  })
})

describe('Başka tenant\'ın operasyon merkezi çözülemez', () => {
  it('a caller from a different tenant cannot resolve this operation center, even with correct role assignments', () => {
    const r = resolveOperationCenterForCaller(komurKazani(), tenant('t-mosb-enerji'), assignments, 't-mosbio')
    expect(r).toEqual({ ok: false, code: 'SCOPE_DENIED' })
  })

  it('the caller\'s own tenant succeeds', () => {
    const r = resolveOperationCenterForCaller(komurKazani(), tenant('t-mosb-enerji'), assignments, 't-mosb-enerji')
    expect(r.ok).toBe(true)
  })
})

describe('MOSEDAŞ tenantı otomatik olarak oluşturulmaz / operasyon merkezi sahibi olamaz', () => {
  it('a MOSEDAŞ-slugged tenant can never own an operation center, whatever role it is assigned', () => {
    const mosedas = tenant('t-mosedas', { slug: 'MOSEDAŞ' })
    const withRole: TenantOperationRoleAssignment[] = [...assignments, { tenantId: 't-mosedas', role: 'MOSB_ENERJI' }]
    const r = resolveOperationCenterOwner(komurKazani({ ownerTenantId: 't-mosedas' }), mosedas, withRole)
    expect(r).toEqual({ ok: false, code: 'OWNER_TENANT_NOT_MAPPABLE' })
  })

  it('a PLATFORM_ROOT tenant can never own an operation center', () => {
    const platformRoot = tenant('t-platform', { type: 'PLATFORM_ROOT' })
    const r = resolveOperationCenterOwner(komurKazani({ ownerTenantId: 't-platform' }), platformRoot, [{ tenantId: 't-platform', role: 'MOSB_ENERJI' }])
    expect(r).toEqual({ ok: false, code: 'OWNER_TENANT_NOT_MAPPABLE' })
  })

  it('this module never constructs a Tenant/TenantIdentity for MOSEDAŞ anywhere (no factory function exists)', () => {
    const src = require('node:fs').readFileSync(require.resolve('../operation-center.contract'), 'utf8')
    expect(src).not.toMatch(/function\s+create\w*Tenant|new\s+Tenant\b/)
  })
})

describe('operationCenterId tek başına yetki sağlamaz', () => {
  it('resolving an operation center by owner/role alone says nothing about a specific caller\'s access — that is a separate contract (tenant-operation-scope.contract.ts)', () => {
    const r = resolveOperationCenterOwner(komurKazani(), tenant('t-mosb-enerji'), assignments)
    expect(r.ok && Object.keys(r)).not.toContain('access')
  })
})
