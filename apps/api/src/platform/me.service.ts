import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, exists, inArray, or } from 'drizzle-orm'
import { DB, type Db } from '../db/db.module'
import {
  systemRoles,
  tenantMemberships,
  tenantRolePermissions,
  tenantRoles,
  tenants,
  userSystemRoleAssignments,
  userTenantRoleAssignments,
} from '../db/schema'

const TENANT_SUMMARY_SELECT = {
  id: tenants.id,
  name: tenants.name,
  slug: tenants.slug,
  status: tenants.status,
  type: tenants.type,
} as const

@Injectable()
export class MeService {
  constructor(
    @Inject(DB) private readonly db: Db,
  ) {}

  async getMyTenants(userId: string, isSystemAdmin: boolean) {
    const tenantAdminRoots = isSystemAdmin
      ? []
      : await this.db
          .select({ tenantId: userSystemRoleAssignments.tenantId })
          .from(userSystemRoleAssignments)
          .innerJoin(systemRoles, eq(userSystemRoleAssignments.roleId, systemRoles.id))
          .innerJoin(tenants, eq(userSystemRoleAssignments.tenantId, tenants.id))
          .where(
            and(
              eq(userSystemRoleAssignments.userId, userId),
              eq(systemRoles.name, 'TENANT_ADMIN'),
              eq(tenants.type, 'ROOT'),
              eq(tenants.status, 'ACTIVE'),
            ),
          )

    const customerRootIds = tenantAdminRoots
      .map(assignment => assignment.tenantId)
      .filter((value): value is string => !!value)

    const tenantRows = isSystemAdmin
      ? await this.db
          .select(TENANT_SUMMARY_SELECT)
          .from(tenants)
          .where(eq(tenants.status, 'ACTIVE'))
          .orderBy(asc(tenants.type), asc(tenants.name))
      : await this.db
          .select(TENANT_SUMMARY_SELECT)
          .from(tenants)
          .where(
            and(
              eq(tenants.status, 'ACTIVE'),
              or(
                exists(
                  this.db
                    .select({ id: tenantMemberships.id })
                    .from(tenantMemberships)
                    .where(
                      and(
                        eq(tenantMemberships.tenantId, tenants.id),
                        eq(tenantMemberships.userId, userId),
                        eq(tenantMemberships.isActive, true),
                      ),
                    ),
                ),
                customerRootIds.length > 0 ? inArray(tenants.customerRootId, customerRootIds) : undefined,
                customerRootIds.length > 0 ? inArray(tenants.id, customerRootIds) : undefined,
              ),
            ),
          )
          .orderBy(asc(tenants.type), asc(tenants.name))

    return { tenants: tenantRows }
  }

  async validateActiveTenant(userId: string, tenantId: string, isSystemAdmin: boolean) {
    const [tenant] = await this.db
      .select({ ...TENANT_SUMMARY_SELECT, customerRootId: tenants.customerRootId })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    if (!tenant || tenant.status !== 'ACTIVE') {
      throw new BadRequestException('Geçerli bir aktif kiracı seçin')
    }

    if (!isSystemAdmin) {
      const customerRootId = tenant.type === 'ROOT' ? tenant.id : tenant.customerRootId
      const [[membership], [tenantAdminAssignment]] = await Promise.all([
        this.db
          .select()
          .from(tenantMemberships)
          .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, userId)))
          .limit(1),
        customerRootId
          ? this.db
              .select({ id: userSystemRoleAssignments.id })
              .from(userSystemRoleAssignments)
              .innerJoin(systemRoles, eq(userSystemRoleAssignments.roleId, systemRoles.id))
              .where(
                and(
                  eq(userSystemRoleAssignments.userId, userId),
                  eq(userSystemRoleAssignments.tenantId, customerRootId),
                  eq(systemRoles.name, 'TENANT_ADMIN'),
                ),
              )
              .limit(1)
          : Promise.resolve([]),
      ])

      if ((!membership || !membership.isActive) && !tenantAdminAssignment) {
        throw new ForbiddenException('Bu kiracıyı seçemezsiniz')
      }
    }

    return { tenant }
  }

  async getMyTenantPermissions(userId: string, tenantId: string, isSystemAdmin: boolean) {
    if (isSystemAdmin) {
      return { permissions: ['*'], isTenantAdmin: true }
    }

    const [[membership], [tenant]] = await Promise.all([
      this.db
        .select()
        .from(tenantMemberships)
        .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, userId)))
        .limit(1),
      this.db
        .select({ id: tenants.id, type: tenants.type, customerRootId: tenants.customerRootId })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1),
    ])
    if (!tenant) throw new ForbiddenException('Bu kiracıya erişim yetkiniz yok')

    const customerRootId = tenant.type === 'ROOT' ? tenant.id : tenant.customerRootId
    const [tenantAdminAssignment] = await this.db
      .select({ id: userSystemRoleAssignments.id })
      .from(userSystemRoleAssignments)
      .innerJoin(systemRoles, eq(userSystemRoleAssignments.roleId, systemRoles.id))
      .where(
        and(
          eq(userSystemRoleAssignments.userId, userId),
          eq(userSystemRoleAssignments.tenantId, customerRootId ?? tenantId),
          eq(systemRoles.name, 'TENANT_ADMIN'),
        ),
      )
      .limit(1)

    if (tenantAdminAssignment) {
      return { permissions: ['*'], isTenantAdmin: true }
    }

    if (!membership || !membership.isActive) {
      throw new ForbiddenException('Bu kiracıya erişim yetkiniz yok')
    }

    const assignments = await this.db
      .select({ permissionCode: tenantRolePermissions.permissionCode, isActive: tenantRoles.isActive })
      .from(userTenantRoleAssignments)
      .innerJoin(tenantRoles, eq(userTenantRoleAssignments.roleId, tenantRoles.id))
      .innerJoin(tenantRolePermissions, eq(tenantRolePermissions.roleId, tenantRoles.id))
      .where(and(eq(userTenantRoleAssignments.userId, userId), eq(userTenantRoleAssignments.tenantId, tenantId)))

    const permissionsSet = new Set(
      assignments.filter(assignment => assignment.isActive).map(assignment => assignment.permissionCode),
    )

    if (customerRootId && customerRootId !== tenantId) {
      const rootAssignments = await this.db
        .select({ permissionCode: tenantRolePermissions.permissionCode, isActive: tenantRoles.isActive })
        .from(userTenantRoleAssignments)
        .innerJoin(tenantRoles, eq(userTenantRoleAssignments.roleId, tenantRoles.id))
        .innerJoin(tenantRolePermissions, eq(tenantRolePermissions.roleId, tenantRoles.id))
        .where(and(eq(userTenantRoleAssignments.userId, userId), eq(userTenantRoleAssignments.tenantId, customerRootId)))

      rootAssignments.forEach(assignment => {
        if (assignment.isActive && assignment.permissionCode.startsWith('CUSTOMER:ADMIN:')) {
          permissionsSet.add(assignment.permissionCode)
        }
      })
    }

    const permissions = Array.from(permissionsSet).sort()

    return { permissions, isTenantAdmin: false }
  }
}
