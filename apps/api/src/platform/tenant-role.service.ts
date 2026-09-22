import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { and, eq, ne } from 'drizzle-orm'
import { PlatformAuditService } from '../audit/platform-audit.service'
import { DB, type Db } from '../db/db.module'
import { tenantRolePermissions, tenantRoles, userTenantRoleAssignments, users } from '../db/schema'
import { CustomerAccessService } from './customer-access.service'
import { validateId } from './domain/platform-input.domain'
import { PRIVILEGE_DENIAL } from './domain/privilege-ceiling.domain'
import { evaluateTenantRoleGrantCeiling, wouldRemoveLastTenantAdmin } from './domain/tenant-role-ceiling.domain'

export interface TenantRoleActionContext {
  impersonation?: boolean
  impersonatorUserId?: string | null
}

interface AuditEntry {
  actorId: string | null
  action: string
  entityId: string
  summary: string
  result: 'SUCCESS' | 'DENIED' | 'ERROR'
  reason?: string
  targetUserId?: string
  extra?: Record<string, unknown>
  context: TenantRoleActionContext
}

/**
 * Tenant-role delegation (TASK-027.49). Manages assignment/revocation of CUSTOM tenant roles
 * (`tenant_roles`/`tenant_role_permissions`/`user_tenant_role_assignments`) — a separate
 * mechanism from the SYSTEM_ADMIN/TENANT_ADMIN system-role model in user.service.ts. Tenant roles
 * are defined and assigned at a customer ROOT tenant only.
 *
 * Every mutation is fail-closed in the same shape TASK-027.40-R1/027.46 established: impersonation
 * refused first, actor re-read ACTIVE from the database, scope re-verified independently of the
 * route guard (CustomerAccessService.assertCustomerAdminScope — TENANT_ADMIN at this exact root,
 * or a system administrator), then the operation-specific rule.
 */
@Injectable()
export class TenantRoleService {
  private readonly logger = new Logger(TenantRoleService.name)

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly customerAccess: CustomerAccessService,
    private readonly auditService: PlatformAuditService,
  ) {}

  private isImpersonated(context: TenantRoleActionContext): boolean {
    return context.impersonation === true || !!context.impersonatorUserId
  }

  private async auditOutcome(entry: AuditEntry): Promise<void> {
    try {
      await this.auditService.log({
        actorId: entry.actorId,
        actionCode: entry.action,
        entityType: 'UserTenantRoleAssignment',
        entityId: entry.entityId,
        summary: entry.summary,
        metadata: {
          result: entry.result,
          ...(entry.reason ? { reason: entry.reason } : {}),
          ...(entry.targetUserId ? { targetUserId: entry.targetUserId } : {}),
          ...(entry.context.impersonatorUserId ? { impersonatorUserId: entry.context.impersonatorUserId } : {}),
          ...(entry.extra ?? {}),
        },
      })
    } catch {
      this.logger.warn(`Tenant rol yönetimi audit yazılamadı (${entry.action}/${entry.result})`)
    }
  }

  /** Denials are audited best-effort, then refused with a STATIC code/message. Never target details. */
  private async deny(
    entry: Omit<AuditEntry, 'result'>,
    denial: { code: string; message: string } = PRIVILEGE_DENIAL.DENIED,
  ): Promise<never> {
    await this.auditOutcome({ ...entry, result: 'DENIED' })
    throw new ForbiddenException({ code: denial.code, message: denial.message })
  }

  /**
   * Impersonation refused (TASK-027.49 security rule — matches the credential/privilege class
   * elsewhere), actor re-read ACTIVE from the database (never trust the JWT claim), then scope
   * re-verified: TENANT_ADMIN of `tenantHeaderId`'s customer root, or a system administrator.
   * `tenantHeaderId` may be any tenant in the tree — CustomerAccessService resolves it to its
   * root; every tenant-role operation always operates on that root id.
   */
  private async requireActingRoot(
    actorId: string,
    tenantHeaderId: string,
    context: TenantRoleActionContext,
    auditBase: { action: string; entityId: string; summary: string },
  ) {
    const op = { actorId, ...auditBase, context }
    if (this.isImpersonated(context)) {
      return this.deny({ ...op, reason: 'IMPERSONATION_SESSION' }, PRIVILEGE_DENIAL.IMPERSONATION)
    }
    const [actor] = await this.db.select({ id: users.id, status: users.status, isSystemAdmin: users.isSystemAdmin }).from(users).where(eq(users.id, actorId)).limit(1)
    if (!actor || actor.status !== 'ACTIVE') {
      return this.deny({ ...op, reason: 'ACTOR_NOT_ACTIVE' }, { code: 'ACTOR_NOT_ACTIVE', message: PRIVILEGE_DENIAL.DENIED.message })
    }
    try {
      const scope = await this.customerAccess.assertCustomerAdminScope(actorId, actor.isSystemAdmin, tenantHeaderId)
      return { actor, customerRootId: scope.customerRoot.id }
    } catch (e) {
      await this.auditOutcome({ ...op, result: 'DENIED', reason: 'SCOPE_DENIED' })
      throw e
    }
  }

  async listRoles(actorId: string, tenantHeaderId: string, context: TenantRoleActionContext) {
    const { customerRootId } = await this.requireActingRoot(actorId, tenantHeaderId, context, {
      action: 'TENANT_ROLE_LIST_DENIED', entityId: tenantHeaderId, summary: 'Tenant rol listesi reddedildi',
    })
    return this.db
      .select({ id: tenantRoles.id, tenantId: tenantRoles.tenantId, name: tenantRoles.name, description: tenantRoles.description, isActive: tenantRoles.isActive, requiresMfa: tenantRoles.requiresMfa, isAdminRole: tenantRoles.isAdminRole })
      .from(tenantRoles)
      .where(eq(tenantRoles.tenantId, customerRootId))
  }

  /** Roles the caller could currently grant — today always "all active roles in the root" since only a TENANT_ADMIN/system administrator can reach this surface at all (both are unrestricted at their own root; see domain/tenant-role-ceiling.domain.ts). */
  async listAssignableRoles(actorId: string, tenantHeaderId: string, context: TenantRoleActionContext) {
    const roles = await this.listRoles(actorId, tenantHeaderId, context)
    return roles.filter(r => r.isActive)
  }

  async listUserAssignments(actorId: string, tenantHeaderId: string, targetUserId: string, context: TenantRoleActionContext) {
    const idCheck = validateId(targetUserId, 'Kullanıcı')
    if (!idCheck.valid) throw new BadRequestException(idCheck.errors)
    const { customerRootId } = await this.requireActingRoot(actorId, tenantHeaderId, context, {
      action: 'TENANT_ROLE_LIST_DENIED', entityId: tenantHeaderId, summary: 'Kullanıcı tenant rolleri listesi reddedildi',
    })
    return this.db
      .select({ id: userTenantRoleAssignments.id, roleId: tenantRoles.id, roleName: tenantRoles.name, isAdminRole: tenantRoles.isAdminRole, createdAt: userTenantRoleAssignments.createdAt })
      .from(userTenantRoleAssignments)
      .innerJoin(tenantRoles, eq(userTenantRoleAssignments.roleId, tenantRoles.id))
      .where(and(eq(userTenantRoleAssignments.userId, targetUserId), eq(userTenantRoleAssignments.tenantId, customerRootId)))
  }

  async assignRole(actorId: string, tenantHeaderId: string, targetUserId: string, roleId: string, context: TenantRoleActionContext) {
    const userIdCheck = validateId(targetUserId, 'Kullanıcı')
    if (!userIdCheck.valid) throw new BadRequestException(userIdCheck.errors)
    const roleIdCheck = validateId(roleId, 'Rol')
    if (!roleIdCheck.valid) throw new BadRequestException(roleIdCheck.errors)

    const op = { actorId, action: 'TENANT_ROLE_ASSIGNED', entityId: targetUserId, summary: 'Tenant rolü atama reddedildi', context }
    const { customerRootId } = await this.requireActingRoot(actorId, tenantHeaderId, context, op)

    const [target] = await this.db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, targetUserId)).limit(1)
    if (!target) throw new NotFoundException('Kullanıcı bulunamadı')

    const [role] = await this.db.select({ id: tenantRoles.id, tenantId: tenantRoles.tenantId, isActive: tenantRoles.isActive }).from(tenantRoles).where(eq(tenantRoles.id, roleId)).limit(1)
    const permissionRows = role ? await this.db.select({ code: tenantRolePermissions.permissionCode }).from(tenantRolePermissions).where(eq(tenantRolePermissions.roleId, role.id)) : []

    const ceiling = evaluateTenantRoleGrantCeiling({
      // Only a TENANT_ADMIN of this root or a system administrator can ever reach this point
      // (requireActingRoot already refused everyone else) — both are unrestricted at this root.
      actorUnrestricted: true,
      actorPermissionCodes: new Set(),
      role: role ?? null,
      actingRootTenantId: customerRootId,
      rolePermissionCodes: permissionRows.map(r => r.code),
    })
    if (!ceiling.allowed) return this.deny({ ...op, reason: ceiling.reason }, { code: ceiling.reason, message: PRIVILEGE_DENIAL.DENIED.message })

    const created = await this.db
      .insert(userTenantRoleAssignments)
      .values({ userId: targetUserId, roleId, tenantId: customerRootId })
      .onConflictDoNothing()
      .returning({ id: userTenantRoleAssignments.id })
    if (created.length === 0) {
      await this.auditOutcome({ actorId, action: op.action, entityId: targetUserId, summary: 'Tenant rolü zaten atanmış', result: 'DENIED', reason: 'ALREADY_ASSIGNED', targetUserId, context })
      throw new ConflictException('Bu tenant rolü kullanıcıya zaten atanmış')
    }

    await this.auditOutcome({
      actorId, action: op.action, entityId: targetUserId, summary: `Tenant rolü atandı: ${targetUserId}`,
      result: 'SUCCESS', targetUserId, context, extra: { tenantId: customerRootId, roleId },
    })
    this.logger.log(`Tenant rolü atandı: actor=${actorId} target=${targetUserId} role=${roleId} tenant=${customerRootId}`)
    return { id: created[0]!.id, userId: targetUserId, roleId, tenantId: customerRootId }
  }

  async revokeRole(actorId: string, tenantHeaderId: string, targetUserId: string, assignmentId: string, context: TenantRoleActionContext) {
    const userIdCheck = validateId(targetUserId, 'Kullanıcı')
    if (!userIdCheck.valid) throw new BadRequestException(userIdCheck.errors)
    const assignmentIdCheck = validateId(assignmentId, 'Atama')
    if (!assignmentIdCheck.valid) throw new BadRequestException(assignmentIdCheck.errors)

    const op = { actorId, action: 'TENANT_ROLE_REVOKED', entityId: targetUserId, summary: 'Tenant rolü kaldırma reddedildi', context }
    const { customerRootId } = await this.requireActingRoot(actorId, tenantHeaderId, context, op)

    const [assignment] = await this.db
      .select({ id: userTenantRoleAssignments.id, userId: userTenantRoleAssignments.userId, roleId: tenantRoles.id, isAdminRole: tenantRoles.isAdminRole })
      .from(userTenantRoleAssignments)
      .innerJoin(tenantRoles, eq(userTenantRoleAssignments.roleId, tenantRoles.id))
      .where(and(eq(userTenantRoleAssignments.id, assignmentId), eq(userTenantRoleAssignments.tenantId, customerRootId), eq(userTenantRoleAssignments.userId, targetUserId)))
      .limit(1)
    if (!assignment) throw new NotFoundException('Atama bulunamadı')

    if (assignment.isAdminRole) {
      const otherAdminAssignments = await this.db
        .select({ id: userTenantRoleAssignments.id })
        .from(userTenantRoleAssignments)
        .innerJoin(tenantRoles, eq(userTenantRoleAssignments.roleId, tenantRoles.id))
        .where(and(eq(userTenantRoleAssignments.tenantId, customerRootId), eq(tenantRoles.isAdminRole, true), ne(userTenantRoleAssignments.id, assignmentId)))
      if (wouldRemoveLastTenantAdmin({ roleIsAdminRole: true, otherActiveAdminAssignmentsInTenant: otherAdminAssignments.length })) {
        return this.deny({ ...op, reason: 'LAST_TENANT_ADMIN' }, { code: 'LAST_TENANT_ADMIN', message: 'Bu tenant\'ın son yönetici rolü ataması kaldırılamaz' })
      }
    }

    await this.db.delete(userTenantRoleAssignments).where(eq(userTenantRoleAssignments.id, assignmentId))

    await this.auditOutcome({
      actorId, action: op.action, entityId: targetUserId, summary: `Tenant rolü kaldırıldı: ${targetUserId}`,
      result: 'SUCCESS', targetUserId, context, extra: { tenantId: customerRootId, roleId: assignment.roleId, assignmentId },
    })
    this.logger.log(`Tenant rolü kaldırıldı: actor=${actorId} target=${targetUserId} assignment=${assignmentId} tenant=${customerRootId}`)
    return { success: true }
  }
}
