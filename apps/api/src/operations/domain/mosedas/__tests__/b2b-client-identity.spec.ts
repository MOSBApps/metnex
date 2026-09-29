import { isWellFormedB2bClientIdentity, resolveB2bTargetScope, type B2bClientIdentity, type B2bTargetAllowlistEntry } from '../b2b-client-identity.contract'
import type { TenantIdentity } from '../../tenant-identity'

const identity = (over: Partial<B2bClientIdentity> = {}): B2bClientIdentity => ({
  b2bClientId: 'mosedas-client-1',
  externalSystem: 'MOSEDAS',
  status: 'ACTIVE',
  validity: { effectiveFrom: '2024-01-01T00:00:00.000Z', effectiveTo: null },
  ...over,
})
const tenant = (id: string, over: Partial<TenantIdentity> = {}): TenantIdentity => ({ tenantId: id, type: 'STANDARD', status: 'ACTIVE', slug: `slug-${id}`, ...over })
const entry = (over: Partial<B2bTargetAllowlistEntry> = {}): B2bTargetAllowlistEntry => ({
  b2bClientId: 'mosedas-client-1',
  targetTenantId: 't-mosb-enerji',
  facilityReferenceId: null,
  machineReferenceId: null,
  operationCenterId: null,
  validity: { effectiveFrom: '2024-01-01T00:00:00.000Z', effectiveTo: null },
  ...over,
})
const target = (over: Partial<{ targetTenantId: string; facilityReferenceId: string | null; machineReferenceId: string | null; operationCenterId: string | null }> = {}) => ({
  targetTenantId: 't-mosb-enerji',
  facilityReferenceId: null,
  machineReferenceId: null,
  operationCenterId: null,
  ...over,
})
const AT = '2025-01-01T00:00:00.000Z'

describe('B2B kimliği kullanıcı JWTsi/rolü değildir', () => {
  it('B2bClientIdentity has no user/role-shaped field (no userId, isSystemAdmin, role, permissions)', () => {
    for (const key of Object.keys(identity())) {
      expect(key).not.toMatch(/userId|isSystemAdmin|role|permission|jwt/i)
    }
  })

  it('isWellFormedB2bClientIdentity accepts only a MOSEDAS-scoped, well-shaped identity', () => {
    expect(isWellFormedB2bClientIdentity(identity())).toBe(true)
    expect(isWellFormedB2bClientIdentity(identity({ externalSystem: 'BEAM' as never }))).toBe(false)
    expect(isWellFormedB2bClientIdentity(identity({ b2bClientId: '' }))).toBe(false)
  })
})

describe('İptal edilebilir ve süreli secret/certificate yaşam döngüsü', () => {
  it('a REVOKED identity never resolves, whatever the allowlist says', () => {
    const r = resolveB2bTargetScope(identity({ status: 'REVOKED' }), tenant('t-mosb-enerji'), [entry()], target(), AT)
    expect(r).toEqual({ ok: false, code: 'B2B_IDENTITY_REVOKED' })
  })

  it('an EXPIRED identity (validity window has ended) never resolves', () => {
    const r = resolveB2bTargetScope(identity({ validity: { effectiveFrom: '2020-01-01T00:00:00.000Z', effectiveTo: '2024-01-01T00:00:00.000Z' } }), tenant('t-mosb-enerji'), [entry()], target(), AT)
    expect(r).toEqual({ ok: false, code: 'B2B_IDENTITY_EXPIRED' })
  })

  it('a not-yet-effective identity never resolves', () => {
    const r = resolveB2bTargetScope(identity({ validity: { effectiveFrom: '2030-01-01T00:00:00.000Z', effectiveTo: null } }), tenant('t-mosb-enerji'), [entry()], target(), AT)
    expect(r).toEqual({ ok: false, code: 'B2B_IDENTITY_EXPIRED' })
  })

  it('an active identity within its window resolves against a matching allowlist entry', () => {
    const r = resolveB2bTargetScope(identity(), tenant('t-mosb-enerji'), [entry()], target(), AT)
    expect(r).toEqual({ ok: true, entry: entry() })
  })
})

describe('B2B kimliği tek başına tüm tenantlara erişim vermemeli', () => {
  it('a client with an allowlist entry for tenant A cannot act on tenant B', () => {
    const r = resolveB2bTargetScope(identity(), tenant('t-mosbio'), [entry({ targetTenantId: 't-mosb-enerji' })], target({ targetTenantId: 't-mosbio' }), AT)
    expect(r).toEqual({ ok: false, code: 'B2B_SCOPE_NOT_ALLOWLISTED' })
  })

  it('a client with NO allowlist entries at all is refused for every tenant', () => {
    const r = resolveB2bTargetScope(identity(), tenant('t-mosb-enerji'), [], target(), AT)
    expect(r).toEqual({ ok: false, code: 'B2B_SCOPE_NOT_ALLOWLISTED' })
  })

  it('an allowlist entry scoped to a SPECIFIC facility does not grant access to a different facility of the same tenant', () => {
    const scoped = entry({ facilityReferenceId: 'fac-1' })
    const r = resolveB2bTargetScope(identity(), tenant('t-mosb-enerji'), [scoped], target({ facilityReferenceId: 'fac-2' }), AT)
    expect(r).toEqual({ ok: false, code: 'B2B_SCOPE_NOT_ALLOWLISTED' })
  })

  it('an allowlist entry scoped to a SPECIFIC operation center does not grant access to a different one', () => {
    const scoped = entry({ operationCenterId: 'oc-komur-1' })
    const r = resolveB2bTargetScope(identity(), tenant('t-mosb-enerji'), [scoped], target({ operationCenterId: 'oc-other' }), AT)
    expect(r).toEqual({ ok: false, code: 'B2B_SCOPE_NOT_ALLOWLISTED' })
  })

  it('a tenant-wide allowlist entry (all scope fields null) DOES cover any facility/machine/operation center of that tenant', () => {
    const r = resolveB2bTargetScope(identity(), tenant('t-mosb-enerji'), [entry()], target({ facilityReferenceId: 'fac-1', machineReferenceId: 'mac-1', operationCenterId: 'oc-1' }), AT)
    expect(r.ok).toBe(true)
  })

  it('an expired allowlist entry no longer grants access even though the identity itself is still active', () => {
    const expired = entry({ validity: { effectiveFrom: '2020-01-01T00:00:00.000Z', effectiveTo: '2024-01-01T00:00:00.000Z' } })
    const r = resolveB2bTargetScope(identity(), tenant('t-mosb-enerji'), [expired], target(), AT)
    expect(r).toEqual({ ok: false, code: 'B2B_SCOPE_NOT_ALLOWLISTED' })
  })
})

describe('MOSEDAŞ Metnex tenantı olarak modellenmez (hedef tenant da olamaz)', () => {
  it('a MOSEDAŞ-slugged target tenant is never mappable, even with a seemingly matching allowlist entry', () => {
    const mosedas = tenant('t-mosedas', { slug: 'MOSEDAŞ' })
    const r = resolveB2bTargetScope(identity(), mosedas, [entry({ targetTenantId: 't-mosedas' })], target({ targetTenantId: 't-mosedas' }), AT)
    expect(r).toEqual({ ok: false, code: 'B2B_TARGET_TENANT_NOT_MAPPABLE' })
  })

  it('a PLATFORM_ROOT target tenant is never mappable', () => {
    const root = tenant('t-platform', { type: 'PLATFORM_ROOT' })
    const r = resolveB2bTargetScope(identity(), root, [entry({ targetTenantId: 't-platform' })], target({ targetTenantId: 't-platform' }), AT)
    expect(r).toEqual({ ok: false, code: 'B2B_TARGET_TENANT_NOT_MAPPABLE' })
  })

  it('a mismatched or missing tenant record (client-supplied tenantId with no matching real tenant) is refused', () => {
    expect(resolveB2bTargetScope(identity(), null, [entry()], target(), AT)).toEqual({ ok: false, code: 'B2B_TARGET_TENANT_NOT_MAPPABLE' })
    expect(resolveB2bTargetScope(identity(), tenant('t-different'), [entry()], target(), AT)).toEqual({ ok: false, code: 'B2B_TARGET_TENANT_NOT_MAPPABLE' })
  })
})
