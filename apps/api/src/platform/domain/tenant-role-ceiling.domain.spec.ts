import { evaluateTenantRoleGrantCeiling, wouldRemoveLastTenantAdmin } from './tenant-role-ceiling.domain'

describe('evaluateTenantRoleGrantCeiling', () => {
  const root = 'root-1'

  it('refuses an unknown role', () => {
    expect(evaluateTenantRoleGrantCeiling({
      actorUnrestricted: true, actorPermissionCodes: new Set(), role: null, actingRootTenantId: root, rolePermissionCodes: [],
    })).toEqual({ allowed: false, reason: 'UNKNOWN_ROLE' })
  })

  it('refuses a role that belongs to a different tenant than the acting root (cross-root leak)', () => {
    expect(evaluateTenantRoleGrantCeiling({
      actorUnrestricted: true, actorPermissionCodes: new Set(), role: { id: 'r1', tenantId: 'other-root', isActive: true }, actingRootTenantId: root, rolePermissionCodes: [],
    })).toEqual({ allowed: false, reason: 'ROLE_NOT_IN_TENANT' })
  })

  it('refuses an inactive role', () => {
    expect(evaluateTenantRoleGrantCeiling({
      actorUnrestricted: true, actorPermissionCodes: new Set(), role: { id: 'r1', tenantId: root, isActive: false }, actingRootTenantId: root, rolePermissionCodes: [],
    })).toEqual({ allowed: false, reason: 'ROLE_INACTIVE' })
  })

  it('an unrestricted actor (TENANT_ADMIN/system administrator) is never blocked by the ceiling, regardless of the role permission codes', () => {
    expect(evaluateTenantRoleGrantCeiling({
      actorUnrestricted: true, actorPermissionCodes: new Set(), role: { id: 'r1', tenantId: root, isActive: true }, actingRootTenantId: root, rolePermissionCodes: ['ANY:CODE', 'ANOTHER:ONE'],
    })).toEqual({ allowed: true })
  })

  it('a restricted actor may grant a role whose codes are a subset of their own effective codes', () => {
    expect(evaluateTenantRoleGrantCeiling({
      actorUnrestricted: false, actorPermissionCodes: new Set(['A:B', 'C:D']), role: { id: 'r1', tenantId: root, isActive: true }, actingRootTenantId: root, rolePermissionCodes: ['A:B'],
    })).toEqual({ allowed: true })
  })

  it('a restricted actor may not grant a role that carries even one code they do not themselves hold', () => {
    expect(evaluateTenantRoleGrantCeiling({
      actorUnrestricted: false, actorPermissionCodes: new Set(['A:B']), role: { id: 'r1', tenantId: root, isActive: true }, actingRootTenantId: root, rolePermissionCodes: ['A:B', 'C:D'],
    })).toEqual({ allowed: false, reason: 'PRIVILEGE_CEILING_EXCEEDED' })
  })

  it('a restricted actor with zero permission codes cannot grant a role with any permission code', () => {
    expect(evaluateTenantRoleGrantCeiling({
      actorUnrestricted: false, actorPermissionCodes: new Set(), role: { id: 'r1', tenantId: root, isActive: true }, actingRootTenantId: root, rolePermissionCodes: ['A:B'],
    })).toEqual({ allowed: false, reason: 'PRIVILEGE_CEILING_EXCEEDED' })
  })

  it('a role with zero permission codes is always grantable, even by a restricted actor with none of their own', () => {
    expect(evaluateTenantRoleGrantCeiling({
      actorUnrestricted: false, actorPermissionCodes: new Set(), role: { id: 'r1', tenantId: root, isActive: true }, actingRootTenantId: root, rolePermissionCodes: [],
    })).toEqual({ allowed: true })
  })

  it('checks role scope/activity before the ceiling comparison, in that order', () => {
    // A role in the wrong tenant AND with codes the actor lacks: the tenant mismatch must win.
    expect(evaluateTenantRoleGrantCeiling({
      actorUnrestricted: false, actorPermissionCodes: new Set(), role: { id: 'r1', tenantId: 'other-root', isActive: true }, actingRootTenantId: root, rolePermissionCodes: ['X:Y'],
    })).toEqual({ allowed: false, reason: 'ROLE_NOT_IN_TENANT' })
  })
})

describe('wouldRemoveLastTenantAdmin', () => {
  it('refuses removing the last admin-flagged assignment in the tenant', () => {
    expect(wouldRemoveLastTenantAdmin({ roleIsAdminRole: true, otherActiveAdminAssignmentsInTenant: 0 })).toBe(true)
  })

  it('allows removing an admin-flagged assignment when another admin-flagged assignment remains', () => {
    expect(wouldRemoveLastTenantAdmin({ roleIsAdminRole: true, otherActiveAdminAssignmentsInTenant: 1 })).toBe(false)
  })

  it('never blocks removing a non-admin-flagged role assignment, regardless of count', () => {
    expect(wouldRemoveLastTenantAdmin({ roleIsAdminRole: false, otherActiveAdminAssignmentsInTenant: 0 })).toBe(false)
  })

  it('treats a negative count the same as zero (defensive — should never happen, but must still fail closed)', () => {
    expect(wouldRemoveLastTenantAdmin({ roleIsAdminRole: true, otherActiveAdminAssignmentsInTenant: -1 })).toBe(true)
  })
})
