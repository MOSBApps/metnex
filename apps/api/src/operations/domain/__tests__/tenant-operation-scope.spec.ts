import {
  resolveUserOperationAccess,
  validateUserOperationCenterScope,
  type ActiveTenantMembership,
  type UserOperationCenterScope,
} from '../tenant-operation-scope.contract'
import type { TenantIdentity } from '../tenant-identity'

const tenant = (id: string, over: Partial<TenantIdentity> = {}): TenantIdentity => ({ tenantId: id, type: 'STANDARD', status: 'ACTIVE', slug: `slug-${id}`, ...over })
const caller = (userId = 'u-1', isSystemAdmin = false) => ({ userId, isSystemAdmin })
const membership = (over: Partial<ActiveTenantMembership> = {}): ActiveTenantMembership => ({ userId: 'u-1', tenantId: 't-lab', isActive: true, ...over })
const grant = (over: Partial<UserOperationCenterScope> = {}): UserOperationCenterScope => ({ userId: 'u-1', tenantId: 't-lab', operationCenterId: null, access: ['VIEW'], ...over })

describe('Ortak laboratuvar kullanıcısı yalnız açık üyelik kapsamlarında erişir', () => {
  it('a granted, actively-membered tenant + access kind resolves', () => {
    const r = resolveUserOperationAccess(tenant('t-lab'), membership(), [grant()], caller(), { tenantId: 't-lab', operationCenterId: null }, 'VIEW')
    expect(r).toEqual({ ok: true, scope: { tenantId: 't-lab', operationCenterId: null }, access: ['VIEW'] })
  })

  it('a user with NO membership in the target tenant is refused, even with a matching grant record present', () => {
    const r = resolveUserOperationAccess(tenant('t-other'), null, [grant({ tenantId: 't-other' })], caller(), { tenantId: 't-other', operationCenterId: null }, 'VIEW')
    expect(r).toEqual({ ok: false, code: 'MEMBERSHIP_NOT_ACTIVE' })
  })

  it('an INACTIVE membership is refused', () => {
    const r = resolveUserOperationAccess(tenant('t-lab'), membership({ isActive: false }), [grant()], caller(), { tenantId: 't-lab', operationCenterId: null }, 'VIEW')
    expect(r).toEqual({ ok: false, code: 'MEMBERSHIP_NOT_ACTIVE' })
  })

  it('a membership of a DIFFERENT tenant than the target never grants access to the target (no cross-tenant carry-over)', () => {
    const r = resolveUserOperationAccess(tenant('t-lab'), membership({ tenantId: 't-lab-b' }), [grant()], caller(), { tenantId: 't-lab', operationCenterId: null }, 'VIEW')
    expect(r).toEqual({ ok: false, code: 'MEMBERSHIP_NOT_ACTIVE' })
  })

  it('a user with two separate memberships (MOSB Enerji AND MOSBIO) resolves independently in each — one grant never leaks into the other tenant', () => {
    const grants = [grant({ tenantId: 't-lab-a' }), grant({ tenantId: 't-lab-b', access: ['VIEW', 'DATA_ENTRY'] })]
    const a = resolveUserOperationAccess(tenant('t-lab-a'), membership({ tenantId: 't-lab-a' }), grants, caller(), { tenantId: 't-lab-a', operationCenterId: null }, 'DATA_ENTRY')
    const b = resolveUserOperationAccess(tenant('t-lab-b'), membership({ tenantId: 't-lab-b' }), grants, caller(), { tenantId: 't-lab-b', operationCenterId: null }, 'DATA_ENTRY')
    expect(a).toEqual({ ok: false, code: 'ACCESS_NOT_GRANTED' })
    expect(b.ok).toBe(true)
  })
})

describe('Görüntüleme ve veri girişi kapsamları ayrıdır', () => {
  it('a VIEW-only grant does not imply DATA_ENTRY', () => {
    const r = resolveUserOperationAccess(tenant('t-lab'), membership(), [grant({ access: ['VIEW'] })], caller(), { tenantId: 't-lab', operationCenterId: null }, 'DATA_ENTRY')
    expect(r).toEqual({ ok: false, code: 'ACCESS_NOT_GRANTED' })
  })

  it('a DATA_ENTRY-only grant does not imply VIEW', () => {
    const r = resolveUserOperationAccess(tenant('t-lab'), membership(), [grant({ access: ['DATA_ENTRY'] })], caller(), { tenantId: 't-lab', operationCenterId: null }, 'VIEW')
    expect(r).toEqual({ ok: false, code: 'ACCESS_NOT_GRANTED' })
  })

  it('APPROVAL, CORRECTION and MANAGEMENT are each separate kinds too', () => {
    const g = grant({ access: ['APPROVAL'] })
    expect(resolveUserOperationAccess(tenant('t-lab'), membership(), [g], caller(), { tenantId: 't-lab', operationCenterId: null }, 'CORRECTION')).toEqual({ ok: false, code: 'ACCESS_NOT_GRANTED' })
    expect(resolveUserOperationAccess(tenant('t-lab'), membership(), [g], caller(), { tenantId: 't-lab', operationCenterId: null }, 'MANAGEMENT')).toEqual({ ok: false, code: 'ACCESS_NOT_GRANTED' })
  })
})

describe('operationCenterId tek başına yetki sağlamaz', () => {
  it('a grant scoped to operationCenterId alone, without an active tenant membership, is refused', () => {
    const r = resolveUserOperationAccess(tenant('t-lab'), null, [grant({ operationCenterId: 'oc-1' })], caller(), { tenantId: 't-lab', operationCenterId: 'oc-1' }, 'VIEW')
    expect(r).toEqual({ ok: false, code: 'MEMBERSHIP_NOT_ACTIVE' })
  })

  it('a grant for a DIFFERENT operation center does not grant this one (unless the grant itself is tenant-wide, operationCenterId: null)', () => {
    const r = resolveUserOperationAccess(tenant('t-lab'), membership(), [grant({ operationCenterId: 'oc-other' })], caller(), { tenantId: 't-lab', operationCenterId: 'oc-1' }, 'VIEW')
    expect(r).toEqual({ ok: false, code: 'SCOPE_NOT_GRANTED' })
  })

  it('a tenant-wide grant (operationCenterId: null) DOES cover a specific operation center of that tenant', () => {
    const r = resolveUserOperationAccess(tenant('t-lab'), membership(), [grant({ operationCenterId: null })], caller(), { tenantId: 't-lab', operationCenterId: 'oc-1' }, 'VIEW')
    expect(r.ok).toBe(true)
  })
})

describe('İstemciden gelen tenantId, sahiplik veya sistem rolü güven kaynağı olmamalı', () => {
  it('isSystemAdmin does not bypass the membership or grant check inside this domain function', () => {
    const r = resolveUserOperationAccess(tenant('t-lab'), null, [], caller('u-admin', true), { tenantId: 't-lab', operationCenterId: null }, 'VIEW')
    expect(r).toEqual({ ok: false, code: 'MEMBERSHIP_NOT_ACTIVE' })
  })

  it('a mismatched tenant (target says t-lab, real tenant record is a different id) is refused', () => {
    const r = resolveUserOperationAccess(tenant('t-real'), membership({ tenantId: 't-lab' }), [grant()], caller(), { tenantId: 't-lab', operationCenterId: null }, 'VIEW')
    expect(r).toEqual({ ok: false, code: 'TENANT_NOT_MAPPABLE' })
  })

  it('PLATFORM_ROOT and a MOSEDAŞ-slugged tenant are never mappable targets', () => {
    expect(resolveUserOperationAccess(tenant('t-lab', { type: 'PLATFORM_ROOT' }), membership(), [grant()], caller(), { tenantId: 't-lab', operationCenterId: null }, 'VIEW')).toEqual({ ok: false, code: 'TENANT_NOT_MAPPABLE' })
    expect(resolveUserOperationAccess(tenant('t-lab', { slug: 'MOSEDAŞ' }), membership(), [grant()], caller(), { tenantId: 't-lab', operationCenterId: null }, 'VIEW')).toEqual({ ok: false, code: 'TENANT_NOT_MAPPABLE' })
  })
})

describe('Ortak laboratuvar ayrı tenant olmayacak / otomatik tüm tenant erişimi oluşturulmayacak', () => {
  it('validateUserOperationCenterScope refuses an empty access list (a grant that grants nothing is invalid, not "tenant-wide by default")', () => {
    expect(validateUserOperationCenterScope(grant({ access: [] }), tenant('t-lab'))).toBe(false)
  })

  it('validateUserOperationCenterScope refuses a grant whose tenant does not match the supplied tenant record', () => {
    expect(validateUserOperationCenterScope(grant({ tenantId: 't-lab' }), tenant('t-other'))).toBe(false)
  })

  it('validateUserOperationCenterScope refuses a MOSEDAŞ-slugged tenant grant', () => {
    expect(validateUserOperationCenterScope(grant({ tenantId: 't-mosedas' }), tenant('t-mosedas', { slug: 'MOSEDAS' }))).toBe(false)
  })

  it('no function in this module accepts a bare list of "all tenants" or a wildcard tenant id', () => {
    const src = require('node:fs').readFileSync(require.resolve('../tenant-operation-scope.contract'), 'utf8')
    expect(src).not.toMatch(/tenantId\s*===?\s*['"]\*['"]|ALL_TENANTS|allTenants/i)
  })
})
