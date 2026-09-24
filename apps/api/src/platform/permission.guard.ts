import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { and, eq, isNull } from 'drizzle-orm'
import { PlatformAuditService } from '../audit/platform-audit.service'
import { DB, type Db } from '../db/db.module'
import { permissions, rolePermissions, systemRoles, tenantRolePermissions, tenantRoles, tenants, userSystemRoleAssignments, userTenantRoleAssignments } from '../db/schema'
import { checkPermission } from './domain/permission.domain'

export const PERMISSION_KEY = 'permission'
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission)

/**
 * TASK-027.57 — reporting export ("REPORT:ARTIFACT:EXPORT") is the one permission code this guard
 * audits a denial for. This is deliberately narrow: `PermissionGuard` is shared by nearly every
 * protected endpoint in the platform, and this task only asked for export's permission/audit
 * contract — auditing every denial platform-wide would be a much bigger, unrequested behavior
 * change. The actual authorization decision below is completely unchanged for every permission
 * code, including this one; only a best-effort audit write is added on the deny path.
 */
const AUDITED_DENIAL_PERMISSIONS = new Set(['REPORT:ARTIFACT:EXPORT'])

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Db,
    private readonly auditService: PlatformAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required) return true

    const request = context.switchToHttp().getRequest<{
      user?: { id: string; isSystemAdmin: boolean }
      headers?: Record<string, string | undefined>
      params?: Record<string, string | undefined>
    }>()
    const tenantId = request.headers?.['x-tenant-id']
    const user = request.user
    if (!user) return false
    if (user.isSystemAdmin) return true

    let codes: string[] = []
    if (required.startsWith('PLATFORM:')) {
      const rows = await this.db
        .select({ code: permissions.code })
        .from(userSystemRoleAssignments)
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, userSystemRoleAssignments.roleId))
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(and(eq(userSystemRoleAssignments.userId, user.id), isNull(userSystemRoleAssignments.tenantId)))

      codes = rows.map(row => row.code)
    } else if (tenantId) {
      const [tenant] = await this.db
        .select({ id: tenants.id, type: tenants.type, customerRootId: tenants.customerRootId })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)
      const customerRootId = tenant ? (tenant.type === 'ROOT' ? tenant.id : tenant.customerRootId) : null

      const isCustomerAdminContext = required.startsWith('CUSTOMER:ADMIN:')
      const evaluationTenantId = isCustomerAdminContext ? (customerRootId ?? tenantId) : tenantId

      const [tenantAdminAssignment] = await this.db
        .select({ id: userSystemRoleAssignments.id })
        .from(userSystemRoleAssignments)
        .innerJoin(systemRoles, eq(userSystemRoleAssignments.roleId, systemRoles.id))
        .where(
          and(
            eq(userSystemRoleAssignments.userId, user.id),
            eq(userSystemRoleAssignments.tenantId, customerRootId ?? tenantId),
            eq(systemRoles.name, 'TENANT_ADMIN'),
          ),
        )
        .limit(1)
      if (tenantAdminAssignment) return true

      const rows = await this.db
        .select({ permissionCode: tenantRolePermissions.permissionCode })
        .from(userTenantRoleAssignments)
        .innerJoin(tenantRoles, eq(userTenantRoleAssignments.roleId, tenantRoles.id))
        .innerJoin(tenantRolePermissions, eq(tenantRolePermissions.roleId, tenantRoles.id))
        .where(
          and(
            eq(userTenantRoleAssignments.userId, user.id),
            eq(userTenantRoleAssignments.tenantId, evaluationTenantId),
            eq(tenantRoles.isActive, true),
          ),
        )
      codes = rows.map(row => row.permissionCode)
    }

    const result = checkPermission(codes, required)
    if (!result.granted) {
      if (AUDITED_DENIAL_PERMISSIONS.has(required)) {
        await this.writeExportDenialAudit(user.id, tenantId, request.params)
      }
      throw new ForbiddenException(`Permission required: ${required}`)
    }
    return true
  }

  // Best-effort: an audit-write failure must never itself change the (already-decided) deny
  // outcome. entityId falls back to 'unknown' rather than throwing if the route has no :code
  // param — this guard is generic and must not assume every audited route shares reporting's
  // exact param names.
  private async writeExportDenialAudit(userId: string, tenantId: string | undefined, params: Record<string, string | undefined> | undefined): Promise<void> {
    try {
      await this.auditService.log({
        actorId: userId,
        actionCode: 'REPORT_EXPORT_DENIED',
        entityType: 'ReportArtifact',
        entityId: params?.['code'] ?? 'unknown',
        summary: 'Export reddedildi: REPORT:ARTIFACT:EXPORT izni yok',
        metadata: {
          tenantId: tenantId ?? null,
          format: params?.['format'] ?? null,
          result: 'DENIED',
          reasonCode: 'PERMISSION_DENIED',
        },
      })
    } catch {
      // logged inside PlatformAuditService already; nothing else to do here
    }
  }
}
