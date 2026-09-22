import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '../../db/db.module'
import { systemRoles, tenants, userSystemRoleAssignments, users } from '../../db/schema'
import type { PrivilegeSnapshot, PrivilegeSnapshotPort } from './privilege-snapshot.port'

/**
 * SELECT-only Drizzle adapter of the privilege snapshot. It reads identifiers, status and scope columns ONLY:
 * never `passwordHash`, e-mail, display name, tokens or any credential. It contains no insert/update/delete/
 * transaction/execute call and is not exposed through any route, job or CLI in this task.
 */
@Injectable()
export class DrizzlePrivilegeSnapshotPort implements PrivilegeSnapshotPort {
  constructor(@Inject(DB) private readonly db: Db) {}

  async load(): Promise<PrivilegeSnapshot> {
    const userRows = await this.db.select({ id: users.id, status: users.status, isSystemAdmin: users.isSystemAdmin }).from(users)
    const roleRows = await this.db.select({ id: systemRoles.id, name: systemRoles.name }).from(systemRoles)
    const assignmentRows = await this.db
      .select({ id: userSystemRoleAssignments.id, userId: userSystemRoleAssignments.userId, roleId: userSystemRoleAssignments.roleId, tenantId: userSystemRoleAssignments.tenantId })
      .from(userSystemRoleAssignments)
    const tenantRows = await this.db.select({ id: tenants.id, type: tenants.type, status: tenants.status }).from(tenants)
    return { users: userRows, roles: roleRows, assignments: assignmentRows, tenants: tenantRows }
  }
}
