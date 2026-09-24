import { and, eq } from 'drizzle-orm'
import type { Db } from '../../../db/db.module'
import { systemRoles, userSystemRoleAssignments, users } from '../../../db/schema'
import type { PresetAuthorizationPort } from '../presets/scada-preset.contract'

/**
 * TASK-027.72-R1 — who may SHARE / change / delete a TENANT_SHARED preset: an ACTIVE system administrator, or an ACTIVE user
 * who holds the built-in TENANT_ADMIN role of the preset's CUSTOMER ROOT (the same rule `PermissionGuard` and the tenant-role
 * service already use). No permission code is defined or checked here — the existing role / scope model is the only source.
 * Using / viewing a preset needs nothing more than `REPORT:ARTIFACT:VIEW` (enforced by the controller's guards).
 */
export class DbScadaPresetAuthorization implements PresetAuthorizationPort {
  constructor(private readonly db: Db) {}

  async canSharePreset(caller: { userId: string; customerRootTenantId: string }): Promise<boolean> {
    const [user] = await this.db.select({ status: users.status, isSystemAdmin: users.isSystemAdmin }).from(users).where(eq(users.id, caller.userId)).limit(1)
    if (!user || user.status !== 'ACTIVE') return false
    if (user.isSystemAdmin === true) return true
    const [assignment] = await this.db
      .select({ id: userSystemRoleAssignments.id })
      .from(userSystemRoleAssignments)
      .innerJoin(systemRoles, eq(userSystemRoleAssignments.roleId, systemRoles.id))
      .where(and(eq(userSystemRoleAssignments.userId, caller.userId), eq(userSystemRoleAssignments.tenantId, caller.customerRootTenantId), eq(systemRoles.name, 'TENANT_ADMIN')))
      .limit(1)
    return !!assignment
  }
}
