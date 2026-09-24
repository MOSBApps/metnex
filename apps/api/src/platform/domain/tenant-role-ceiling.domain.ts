/**
 * Pure privilege-ceiling and last-admin-floor model for tenant-role delegation (TASK-027.49).
 * Mirrors the shape of domain/privilege-ceiling.domain.ts (TASK-027.46) but for CUSTOM tenant
 * roles (`tenant_roles`/`tenant_role_permissions`/`user_tenant_role_assignments`), not the
 * SYSTEM_ADMIN/TENANT_ADMIN system-role model that file covers.
 *
 * Decision basis (Product Owner, TASK-027.49 kickoff):
 *  - Only a TENANT_ADMIN of the tenant's own customer root, or a system administrator, may assign
 *    or revoke a tenant role there (delegation = TENANT:ROLE:ASSIGN/REVOKE granted implicitly to
 *    TENANT_ADMIN via the existing PermissionGuard tenantAdminAssignment short-circuit — nothing
 *    new to wire for that case).
 *  - A non-TENANT_ADMIN actor who somehow holds TENANT:ROLE:ASSIGN through a custom tenant role
 *    may still only grant a role whose permission set is a subset of their OWN effective tenant
 *    permission set at that root (the ceiling this file computes).
 *  - Self-assignment is allowed; the ceiling check is the only guard (no separate self-service
 *    restriction, unlike credential-class SYSTEM operations).
 *  - Tenant roles are defined and assigned at the customer ROOT tenant only (no per-child-tenant
 *    role management surface in this task).
 *  - A role flagged `isAdminRole` may not have its last ACTIVE assignment in a tenant revoked.
 */

export type TenantRoleCeilingRefusal = 'UNKNOWN_ROLE' | 'ROLE_NOT_IN_TENANT' | 'ROLE_INACTIVE' | 'PRIVILEGE_CEILING_EXCEEDED'
export type TenantRoleCeilingResult = { allowed: true } | { allowed: false; reason: TenantRoleCeilingRefusal }

export interface TenantRoleFacts {
  id: string
  tenantId: string
  isActive: boolean
}

/**
 * `actorUnrestricted` is true when the actor is a system administrator or holds TENANT_ADMIN at
 * this exact root — both already grant "everything non-PLATFORM:*" at this root per
 * PermissionGuard, so the ceiling is trivially satisfied and `actorPermissionCodes` is not
 * consulted. Otherwise the target role's own permission codes must be a subset of the actor's own
 * effective tenant-role permission codes at this root. Unknown role, wrong tenant, or an inactive
 * role fail closed before the ceiling comparison even runs.
 */
export function evaluateTenantRoleGrantCeiling(input: {
  actorUnrestricted: boolean
  actorPermissionCodes: ReadonlySet<string>
  role: TenantRoleFacts | null
  actingRootTenantId: string
  rolePermissionCodes: readonly string[]
}): TenantRoleCeilingResult {
  if (!input.role) return { allowed: false, reason: 'UNKNOWN_ROLE' }
  if (input.role.tenantId !== input.actingRootTenantId) return { allowed: false, reason: 'ROLE_NOT_IN_TENANT' }
  if (!input.role.isActive) return { allowed: false, reason: 'ROLE_INACTIVE' }
  if (input.actorUnrestricted) return { allowed: true }
  for (const code of input.rolePermissionCodes) {
    if (!input.actorPermissionCodes.has(code)) return { allowed: false, reason: 'PRIVILEGE_CEILING_EXCEEDED' }
  }
  return { allowed: true }
}

/**
 * `otherActiveAdminAssignmentsInTenant` counts ACTIVE assignments, in the same tenant, of ANY
 * isAdminRole-flagged role, EXCLUDING the assignment being removed. If the role being revoked is
 * itself isAdminRole and no other admin-flagged assignment remains, the tenant would be left with
 * no administrator — refused.
 */
export function wouldRemoveLastTenantAdmin(input: {
  roleIsAdminRole: boolean
  otherActiveAdminAssignmentsInTenant: number
}): boolean {
  return input.roleIsAdminRole && input.otherActiveAdminAssignmentsInTenant <= 0
}
