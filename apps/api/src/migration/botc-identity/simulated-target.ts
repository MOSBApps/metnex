import type { ApprovedTenantSlug, PasswordStrategy } from './types'

/**
 * In-memory stand-in for the real PostgreSQL target (`users`/`tenantMemberships`/`tenantRoles`/
 * `tenantRolePermissions`/`userTenantRoleAssignments`). This task explicitly forbids a real
 * PostgreSQL apply — `apply()` on MigrationRunService only ever writes here. Wiring a real
 * Drizzle-backed writer behind this same shape is future work that requires its own approval
 * (and, for the staging side, Q-ID01).
 */
export interface SimulatedUserRow {
  id: string
  sourceLegacyId: string
  email: string
  displayName: string
  status: 'ACTIVE' | 'INACTIVE'
  passwordStrategies: PasswordStrategy[]
}

export interface SimulatedTenantMembershipRow {
  userId: string
  tenantSlug: ApprovedTenantSlug
}

export interface SimulatedRoleTemplateRow {
  id: string
  name: string
  permissionCodes: string[]
}

export interface SimulatedRoleAssignmentRow {
  userId: string
  roleTemplateId: string
}

export class SimulatedTargetState {
  readonly usersByLegacyId = new Map<string, SimulatedUserRow>()
  readonly tenantMembershipsByUserId = new Map<string, SimulatedTenantMembershipRow>()
  readonly roleTemplatesById = new Map<string, SimulatedRoleTemplateRow>()
  readonly roleAssignments: SimulatedRoleAssignmentRow[] = []

  clone(): SimulatedTargetState {
    const copy = new SimulatedTargetState()
    for (const [k, v] of this.usersByLegacyId) copy.usersByLegacyId.set(k, { ...v, passwordStrategies: [...v.passwordStrategies] })
    for (const [k, v] of this.tenantMembershipsByUserId) copy.tenantMembershipsByUserId.set(k, { ...v })
    for (const [k, v] of this.roleTemplatesById) copy.roleTemplatesById.set(k, { ...v, permissionCodes: [...v.permissionCodes] })
    copy.roleAssignments.push(...this.roleAssignments.map(a => ({ ...a })))
    return copy
  }

  /** Replaces this instance's contents with another's — used to commit a dry-run-computed clone. */
  restoreFrom(other: SimulatedTargetState): void {
    this.usersByLegacyId.clear()
    this.tenantMembershipsByUserId.clear()
    this.roleTemplatesById.clear()
    this.roleAssignments.length = 0
    for (const [k, v] of other.usersByLegacyId) this.usersByLegacyId.set(k, { ...v, passwordStrategies: [...v.passwordStrategies] })
    for (const [k, v] of other.tenantMembershipsByUserId) this.tenantMembershipsByUserId.set(k, { ...v })
    for (const [k, v] of other.roleTemplatesById) this.roleTemplatesById.set(k, { ...v, permissionCodes: [...v.permissionCodes] })
    this.roleAssignments.push(...other.roleAssignments.map(a => ({ ...a })))
  }
}
