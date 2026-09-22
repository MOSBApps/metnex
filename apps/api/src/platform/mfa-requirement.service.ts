import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { DB, type Db } from '../db/db.module'
import { tenantRoles, tenantSecuritySettings, userTenantRoleAssignments, users } from '../db/schema'

@Injectable()
export class MfaRequirementService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async isActorActive(userId: string): Promise<boolean> {
    const [user] = await this.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!user) return false
    return user.status === 'ACTIVE'
  }

  async isRequired(userId: string, tenantId?: string | null): Promise<boolean> {
    if (tenantId) {
      const [policyRow] = await this.db
        .select({ mfaRequired: tenantSecuritySettings.mfaRequired })
        .from(tenantSecuritySettings)
        .where(eq(tenantSecuritySettings.tenantId, tenantId))
        .limit(1)
      if (policyRow?.mfaRequired) return true

      const [assignedRole] = await this.db
        .select({ id: userTenantRoleAssignments.id })
        .from(userTenantRoleAssignments)
        .innerJoin(tenantRoles, eq(userTenantRoleAssignments.roleId, tenantRoles.id))
        .where(
          and(
            eq(userTenantRoleAssignments.userId, userId),
            eq(userTenantRoleAssignments.tenantId, tenantId),
            eq(tenantRoles.requiresMfa, true),
          ),
        )
        .limit(1)
      if (assignedRole) return true
    }

    // Tenant harici genel rol kontrolü
    const [anyMfaRole] = await this.db
      .select({ id: userTenantRoleAssignments.id })
      .from(userTenantRoleAssignments)
      .innerJoin(tenantRoles, eq(userTenantRoleAssignments.roleId, tenantRoles.id))
      .where(
        and(
          eq(userTenantRoleAssignments.userId, userId),
          eq(tenantRoles.requiresMfa, true),
        ),
      )
      .limit(1)

    return !!anyMfaRole
  }
}
