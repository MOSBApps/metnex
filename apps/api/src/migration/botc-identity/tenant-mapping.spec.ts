import { buildTenantAssignmentIndex, resolveTenantAssignment } from './tenant-mapping'

describe('tenant-mapping', () => {
  it('resolves ASSIGNED only when the approved table has a non-null tenant slug', () => {
    const index = buildTenantAssignmentIndex([
      { userLegacyId: '1', tenantSlug: 'MOSB' },
      { userLegacyId: '2', tenantSlug: null },
    ])
    expect(resolveTenantAssignment('1', index)).toEqual({ tenantSlug: 'MOSB', status: 'ASSIGNED' })
    expect(resolveTenantAssignment('2', index)).toEqual({ tenantSlug: null, status: 'UNRESOLVED' })
  })

  it('is UNRESOLVED for a user absent from the approved table entirely (e.g. Sirket is never consulted)', () => {
    const index = buildTenantAssignmentIndex([{ userLegacyId: '1', tenantSlug: 'MOSB' }])
    expect(resolveTenantAssignment('999', index)).toEqual({ tenantSlug: null, status: 'UNRESOLVED' })
  })

  it('rejects an unknown tenant slug in the approved table', () => {
    expect(() =>
      buildTenantAssignmentIndex([{ userLegacyId: '1', tenantSlug: 'NOT_A_REAL_TENANT' as never }]),
    ).toThrow()
  })
})
