import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import { PlatformAuditService } from '../audit/platform-audit.service'
import { assertRow } from '../db/assert-row'
import { DB, type Db } from '../db/db.module'
import { authSessions, permissions, rolePermissions, systemRoles, tenantMemberships, tenants, userSystemRoleAssignments, users } from '../db/schema'
import { AuthService } from './auth.service'
import {
  evaluateRoleGrantCeiling,
  PRIVILEGE_DENIAL,
  resolveActorEffective,
  type TenantFacts,
} from './domain/privilege-ceiling.domain'
import { BUILTIN_PERMISSIONS } from './domain/system-role.domain'
import {
  validateAssignRole,
  validateCreateUser,
  validateId,
  validateSetPassword,
  validateUpdateDisplayName,
  validateUserListQuery,
} from './domain/platform-input.domain'
import { validatePasswordStrength } from './domain/auth.domain'
import { toPlatformUserView } from './domain/user-projection.domain'
import { canDeactivateUser, isValidEmail, normalizeEmail } from './domain/user.domain'

export interface UserListQuery {
  q?: string
  status?: string
  isSystemAdmin?: string
}

export interface CreateUserDto {
  email: string
  displayName: string
  password: string
}

export interface UpdateUserDto {
  displayName?: string
}

export interface AssignRoleDto {
  roleId: string
  tenantId?: string | null
}

/** Whitelist projection: the rows passed in are full `users` rows that include the password hash. */
const toUserRow = toPlatformUserView

/** Facts about the caller's session, for audit only — never used to authorise. */
export interface UserAdminContext {
  impersonatorUserId?: string | null
  /** true when the session is an impersonation session (request.user.impersonation) */
  impersonation?: boolean
}

/** Identifies the operation for denial audit; never carries input values. */
interface PrivilegeOp {
  actorId: string | undefined
  action: string
  entityType: string
  entityId: string
  summary: string
  targetUserId: string
  context: UserAdminContext
}

interface AdminAuditEntry {
  actorId: string | undefined
  action: string
  entityType: string
  entityId: string
  summary: string
  targetUserId: string
  result: 'DENIED' | 'FAILED'
  reason: string
  context: UserAdminContext
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name)

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly authService: AuthService,
    private readonly auditService: PlatformAuditService,
  ) {}

  /** Success metadata: static result code, target id and (for impersonated sessions) the impersonator — never credentials. */
  private successMeta(context: UserAdminContext, targetUserId: string, extra: Record<string, unknown> = {}) {
    return { ...extra, result: 'SUCCESS', targetUserId, ...(context.impersonatorUserId ? { impersonatorUserId: context.impersonatorUserId } : {}) }
  }

  /** Denials and failures are audited best-effort: an audit outage can never turn a refusal or a failure into a success. */
  private async auditAdminOutcome(entry: AdminAuditEntry) {
    try {
      await this.auditService.log({
        actorId: entry.actorId ?? null,
        actionCode: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        summary: entry.summary,
        metadata: {
          result: entry.result,
          reason: entry.reason,
          targetUserId: entry.targetUserId,
          ...(entry.context.impersonatorUserId ? { impersonatorUserId: entry.context.impersonatorUserId } : {}),
        },
      })
    } catch {
      this.logger.warn(`Kullanıcı yönetimi audit yazılamadı (${entry.action}/${entry.result})`)
    }
  }

  private isImpersonated(context: UserAdminContext) {
    return context.impersonation === true || !!context.impersonatorUserId
  }

  /** Audits the refusal best-effort, then refuses with a STATIC code and message (never target details). */
  private async denyPrivilege(
    op: PrivilegeOp,
    reason: string,
    denial: { code: string; message: string } = PRIVILEGE_DENIAL.DENIED,
  ): Promise<never> {
    await this.auditAdminOutcome({
      actorId: op.actorId, action: op.action, entityType: op.entityType, entityId: op.entityId,
      summary: op.summary, targetUserId: op.targetUserId, result: 'DENIED', reason, context: op.context,
    })
    throw new ForbiddenException({ code: denial.code, message: denial.message })
  }

  /**
   * Steps 3–5 of the privilege check order (TASK-027.46): (3) impersonation, (4) re-read the actor from the database,
   * (5) actor must be ACTIVE. Pure input/ID validation has already happened; the route permission guard ran before that.
   * Impersonation adds nothing: only the database row of the session subject counts, and privilege and credential
   * operations are refused outright in an impersonation session. Refusals never reveal anything about the target.
   */
  private async requirePrivilegeActor(op: PrivilegeOp, blockImpersonation: boolean) {
    if (blockImpersonation && this.isImpersonated(op.context)) {
      return this.denyPrivilege(op, 'IMPERSONATION_SESSION', PRIVILEGE_DENIAL.IMPERSONATION)
    }
    const [actor] = op.actorId
      ? await this.db.select({ id: users.id, status: users.status, isSystemAdmin: users.isSystemAdmin }).from(users).where(eq(users.id, op.actorId)).limit(1)
      : []
    if (!actor || actor.status !== 'ACTIVE') return this.denyPrivilege(op, 'ACTOR_NOT_ACTIVE')
    return actor
  }

  /**
   * Step 6–7 target rules (TASK-027.42, extended by TASK-027.47 / Q-DP24 closure decision 2, Model B):
   *  - a CREDENTIAL-class operation (password, role, MFA) against a system-administrator target is refused for
   *    EVERY actor, including another system administrator — peers may no longer manage each other's credentials
   *    or roles. Self-service password change lives at `POST auth/change-password`, not through this surface.
   *  - for every other operation, a system-administrator TARGET may still only be administered by a system
   *    administrator (unchanged since TASK-027.42) — this keeps deactivation/containment available between peers.
   *  - GLOBAL role grants/revocations (tenantId null) may only be made by a system administrator (unchanged).
   */
  private async assertTargetRules(
    actor: { isSystemAdmin: boolean },
    op: PrivilegeOp,
    target: { isSystemAdmin: boolean },
    opts: { globalRoleChange?: boolean; credentialClass?: boolean } = {},
  ) {
    if (opts.credentialClass && target.isSystemAdmin) {
      return this.denyPrivilege(op, 'PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED', PRIVILEGE_DENIAL.PEER_SYSTEM_ADMIN_CREDENTIAL)
    }
    if (target.isSystemAdmin && !actor.isSystemAdmin) return this.denyPrivilege(op, 'TARGET_IS_SYSTEM_ADMIN')
    if (opts.globalRoleChange && !actor.isSystemAdmin) return this.denyPrivilege(op, 'GLOBAL_ROLE_CHANGE_REQUIRES_SYSTEM_ADMIN')
  }

  /**
   * Privilege ceiling: targetEffectivePermissions ⊆ actorEffectivePermissions, both computed with the semantics of the real
   * PermissionGuard (domain/privilege-ceiling.domain.ts). Only non-administrator actors need the computation (the flag is
   * "everything"). Unknown permission codes and unknown/invalid scopes fail closed. Reads only; no write.
   */
  private async assertWithinPrivilegeCeiling(
    actor: { id: string; isSystemAdmin: boolean },
    op: PrivilegeOp,
    role: { id: string; name: string },
    tenant: TenantFacts | null,
    global: boolean,
  ) {
    if (actor.isSystemAdmin) return
    const actorAssignments = await this.db
      .select({ roleId: systemRoles.id, roleName: systemRoles.name, tenantId: userSystemRoleAssignments.tenantId })
      .from(userSystemRoleAssignments)
      .innerJoin(systemRoles, eq(userSystemRoleAssignments.roleId, systemRoles.id))
      .where(eq(userSystemRoleAssignments.userId, actor.id))
    const roleIds = [...new Set([role.id, ...actorAssignments.filter(a => a.tenantId === null).map(a => a.roleId)])]
    const permissionRows = await this.db
      .select({ roleId: rolePermissions.roleId, code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(rolePermissions.roleId, roleIds))
    const codesByRole = new Map<string, string[]>()
    for (const row of permissionRows) codesByRole.set(row.roleId, [...(codesByRole.get(row.roleId) ?? []), row.code])
    const actorTenantIds = [...new Set(actorAssignments.filter(a => a.tenantId !== null && a.roleName === 'TENANT_ADMIN').map(a => a.tenantId as string))]
    const actorTenants: TenantFacts[] = actorTenantIds.length
      ? await this.db.select({ id: tenants.id, type: tenants.type, customerRootId: tenants.customerRootId }).from(tenants).where(inArray(tenants.id, actorTenantIds))
      : []
    const actorEffective = resolveActorEffective({
      isSystemAdmin: false,
      assignments: actorAssignments,
      rolePermissionCodes: codesByRole,
      tenantsById: new Map(actorTenants.map(t => [t.id, t])),
    })
    const result = evaluateRoleGrantCeiling({
      actor: actorEffective, roleName: role.name, roleCodes: codesByRole.get(role.id) ?? [],
      knownPermissionCodes: BUILTIN_PERMISSIONS, tenant, global,
    })
    if (!result.allowed) await this.denyPrivilege(op, result.reason)
  }

  async list(query: UserListQuery) {
    const validation = validateUserListQuery(query)
    if (!validation.valid) throw new BadRequestException(validation.errors)

    const conditions = []
    if (query.status) conditions.push(eq(users.status, query.status as 'ACTIVE' | 'INACTIVE' | 'LOCKED'))
    if (query.isSystemAdmin !== undefined) conditions.push(eq(users.isSystemAdmin, query.isSystemAdmin === 'true'))
    if (query.q) {
      const pattern = `%${query.q.trim()}%`
      conditions.push(or(ilike(users.email, pattern), ilike(users.displayName, pattern)))
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, countRows] = await Promise.all([
      this.db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(200),
      this.db.select({ count: sql<number>`count(*)::int` }).from(users).where(where),
    ])
    const { count } = assertRow(countRows)

    return { users: rows.map(toUserRow), total: count }
  }

  async create(dto: CreateUserDto, actorUserId?: string) {
    const validation = validateCreateUser(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)

    const email = normalizeEmail(dto.email)
    if (!isValidEmail(email)) throw new BadRequestException('Geçersiz e-posta adresi formatı')
    if (!dto.displayName || dto.displayName.trim().length < 2) {
      throw new BadRequestException('Görünen ad en az 2 karakter olmalıdır')
    }

    const pwCheck = validatePasswordStrength(dto.password)
    if (!pwCheck.valid) throw new BadRequestException(pwCheck.errors)

    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (existing) throw new ConflictException('Bu e-posta adresi zaten kullanımda')

    const passwordHash = await this.authService.hashNewPassword(dto.password)
    const user = assertRow(
      await this.db
        .insert(users)
        .values({ email, displayName: dto.displayName.trim(), passwordHash, isSystemAdmin: false, status: 'ACTIVE' })
        .returning(),
    )

    await this.auditService.log({
      actorId: actorUserId ?? null,
      actionCode: 'USER_CREATED',
      entityType: 'User',
      entityId: user.id,
      summary: `${user.email} kullanıcısı oluşturuldu`,
      metadata: { email: user.email, displayName: user.displayName },
    })

    return toUserRow(user)
  }

  async findById(id: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı')

    const roleAssignments = await this.db
      .select({
        id: userSystemRoleAssignments.id,
        roleId: userSystemRoleAssignments.roleId,
        roleName: systemRoles.name,
        tenantId: userSystemRoleAssignments.tenantId,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        createdAt: userSystemRoleAssignments.createdAt,
      })
      .from(userSystemRoleAssignments)
      .innerJoin(systemRoles, eq(userSystemRoleAssignments.roleId, systemRoles.id))
      .leftJoin(tenants, eq(userSystemRoleAssignments.tenantId, tenants.id))
      .where(eq(userSystemRoleAssignments.userId, id))

    return {
      ...toUserRow(user),
      roleAssignments: roleAssignments.map(assignment => ({
        id: assignment.id,
        roleId: assignment.roleId,
        roleName: assignment.roleName,
        tenantId: assignment.tenantId,
        tenantName: assignment.tenantName ?? null,
        tenantSlug: assignment.tenantSlug ?? null,
        createdAt: assignment.createdAt,
      })),
    }
  }

  async update(id: string, dto: UpdateUserDto, actorUserId?: string, context: UserAdminContext = {}) {
    const validation = validateUpdateDisplayName(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    const idCheck = validateId(id, 'Kullanıcı')
    if (!idCheck.valid) throw new BadRequestException(idCheck.errors)

    const op: PrivilegeOp = { actorId: actorUserId, action: 'USER_UPDATED', entityType: 'User', entityId: id, summary: 'Kullanıcı güncelleme reddedildi', targetUserId: id, context }
    const actor = await this.requirePrivilegeActor(op, false)
    const [existing] = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!existing) throw new NotFoundException('Kullanıcı bulunamadı')
    await this.assertTargetRules(actor, op, existing)

    if (dto.displayName === undefined) return toUserRow(existing)
    const displayName = dto.displayName.trim()
    if (displayName.length < 2) {
      throw new BadRequestException('Görünen ad en az 2 karakter olmalıdır')
    }

    const updated = assertRow(await this.db.update(users).set({ displayName }).where(eq(users.id, id)).returning())

    await this.auditService.log({
      actorId: actorUserId ?? null,
      actionCode: 'USER_UPDATED',
      entityType: 'User',
      entityId: updated.id,
      summary: `${updated.email} kullanıcısının görünen adı güncellendi`,
      metadata: this.successMeta(context, updated.id, { beforeDisplayName: existing.displayName, afterDisplayName: updated.displayName }),
    })

    return toUserRow(updated)
  }

  async setPassword(id: string, password: string, requestingUserId: string, context: UserAdminContext = {}) {
    const validation = validateSetPassword({ password })
    if (!validation.valid) throw new BadRequestException(validation.errors)
    const idCheck = validateId(id, 'Kullanıcı')
    if (!idCheck.valid) throw new BadRequestException(idCheck.errors)

    const op: PrivilegeOp = { actorId: requestingUserId, action: 'USER_PASSWORD_RESET', entityType: 'User', entityId: id, summary: 'Yönetici parola yenileme reddedildi', targetUserId: id, context }
    const actor = await this.requirePrivilegeActor(op, true)
    const [existing] = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!existing) throw new NotFoundException('Kullanıcı bulunamadı')
    if (existing.id === requestingUserId) {
      await this.auditAdminOutcome({
        actorId: requestingUserId, action: 'USER_PASSWORD_RESET', entityType: 'User', entityId: existing.id,
        summary: 'Yönetici parola yenileme reddedildi', targetUserId: existing.id, result: 'DENIED', reason: 'SELF_CHANGE', context,
      })
      throw new ForbiddenException('Kendi parolanızı bu yüzeyden değiştiremezsiniz — POST auth/change-password kullanın')
    }
    // Credential-class: a system-administrator target is refused for EVERY actor, including a peer system
    // administrator (TASK-027.47, Model B). A non-admin target keeps the existing sysadmin-only rule.
    await this.assertTargetRules(actor, op, existing, { credentialClass: true })

    const pwCheck = validatePasswordStrength(password)
    if (!pwCheck.valid) throw new BadRequestException(pwCheck.errors)

    try {
      const passwordHash = await this.authService.hashNewPassword(password)
      await this.db.update(users).set({ passwordHash }).where(eq(users.id, existing.id))
      // Force re-authentication everywhere: an admin-initiated reset is itself a credential-rotation event.
      await this.db.update(authSessions).set({ isRevoked: true }).where(and(eq(authSessions.userId, existing.id), eq(authSessions.isRevoked, false)))
    } catch (error) {
      await this.auditAdminOutcome({
        actorId: requestingUserId, action: 'USER_PASSWORD_RESET', entityType: 'User', entityId: existing.id,
        summary: 'Yönetici parola yenileme başarısız oldu', targetUserId: existing.id, result: 'FAILED', reason: 'ERROR', context,
      })
      throw error
    }

    await this.auditService.log({
      actorId: requestingUserId,
      actionCode: 'USER_PASSWORD_RESET',
      entityType: 'User',
      entityId: existing.id,
      summary: `${existing.email} kullanıcısının parolası yönetici tarafından yenilendi`,
      metadata: this.successMeta(context, existing.id),
    })

    return { success: true }
  }

  async impersonate(targetUserId: string, requestingUserId: string) {
    if (targetUserId === requestingUserId) {
      throw new BadRequestException('Kendi hesabınıza impersonation uygulanmaz')
    }

    return this.authService.issueImpersonationAccessToken(requestingUserId, targetUserId)
  }

  async deactivate(id: string, requestingUserId: string, context: UserAdminContext = {}) {
    const idCheck = validateId(id, 'Kullanıcı')
    if (!idCheck.valid) throw new BadRequestException(idCheck.errors)

    const op: PrivilegeOp = { actorId: requestingUserId, action: 'USER_DEACTIVATED', entityType: 'User', entityId: id, summary: 'Kullanıcı deaktivasyonu reddedildi', targetUserId: id, context }
    const actor = await this.requirePrivilegeActor(op, true)
    const [target] = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!target) throw new NotFoundException('Kullanıcı bulunamadı')
    await this.assertTargetRules(actor, op, target)
    if (target.status === 'INACTIVE') throw new ConflictException('Kullanıcı zaten pasif')

    const activeAdminCount = target.isSystemAdmin
      ? assertRow(
          await this.db
            .select({ count: sql<number>`count(*)::int` })
            .from(users)
            .where(and(eq(users.isSystemAdmin, true), eq(users.status, 'ACTIVE'))),
        ).count
      : 0

    const check = canDeactivateUser(id, requestingUserId, target.isSystemAdmin, activeAdminCount)
    if (!check.allowed) {
      if (check.reason === 'SELF_DEACTIVATION') {
        throw new ForbiddenException('Kendi hesabınızı deaktive edemezsiniz')
      }
      if (check.reason === 'LAST_SYSTEM_ADMIN') {
        throw new ForbiddenException('Son sistem yöneticisi deaktive edilemez')
      }
    }

    const updated = assertRow(await this.db.update(users).set({ status: 'INACTIVE' }).where(eq(users.id, id)).returning())

    await this.auditService.log({
      actorId: requestingUserId,
      actionCode: 'USER_DEACTIVATED',
      entityType: 'User',
      entityId: updated.id,
      summary: `${updated.email} kullanıcısı pasife alındı`,
      metadata: this.successMeta(context, updated.id),
    })

    return toUserRow(updated)
  }

  async listAssignableRoles() {
    const roles = await this.db.select().from(systemRoles).orderBy(asc(systemRoles.name))
    return { roles }
  }

  async listAssignableTenants() {
    const rows = await this.db
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.status, 'ACTIVE'))
      .orderBy(asc(tenants.name))
    return { tenants: rows }
  }

  async assignRole(userId: string, dto: AssignRoleDto, actorUserId?: string, context: UserAdminContext = {}) {
    const validation = validateAssignRole(dto)
    if (!validation.valid) throw new BadRequestException(validation.errors)
    const idCheck = validateId(userId, 'Kullanıcı')
    if (!idCheck.valid) throw new BadRequestException(idCheck.errors)

    const op: PrivilegeOp = { actorId: actorUserId, action: 'SYSTEM_ROLE_GRANTED', entityType: 'UserSystemRoleAssignment', entityId: userId, summary: 'Rol atama reddedildi', targetUserId: userId, context }
    const actor = await this.requirePrivilegeActor(op, true)

    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı')

    const [role] = await this.db.select().from(systemRoles).where(eq(systemRoles.id, dto.roleId)).limit(1)
    if (!role) throw new NotFoundException('Rol bulunamadı')

    // Unknown scope fails closed BEFORE any write (previously a missing tenant only surfaced as a foreign-key error).
    let tenantRow: (TenantFacts & { name: string; slug: string }) | null = null
    if (dto.tenantId) {
      const [found] = await this.db.select({ id: tenants.id, type: tenants.type, customerRootId: tenants.customerRootId, name: tenants.name, slug: tenants.slug }).from(tenants).where(eq(tenants.id, dto.tenantId)).limit(1)
      if (!found) throw new NotFoundException('Kiracı bulunamadı')
      tenantRow = found
    }

    // A TENANT_ADMIN is only ever meaningful for a customer root (Q-DP24): a NEW global assignment is refused for every actor.
    if (role.name === 'TENANT_ADMIN' && !dto.tenantId) {
      return this.denyPrivilege(op, 'GLOBAL_TENANT_ADMIN_FORBIDDEN', PRIVILEGE_DENIAL.GLOBAL_TENANT_ADMIN)
    }
    // Credential-class: a system-administrator target is refused for EVERY actor (TASK-027.47, Model B).
    await this.assertTargetRules(actor, op, user, { credentialClass: true, globalRoleChange: !dto.tenantId })

    if (role.name === 'SYSTEM_ADMIN' && dto.tenantId) {
      throw new BadRequestException('SYSTEM_ADMIN rolü sadece global olarak atanabilir')
    }
    await this.assertWithinPrivilegeCeiling(actor, op, role, tenantRow, !dto.tenantId)

    const tenantCondition = dto.tenantId
      ? eq(userSystemRoleAssignments.tenantId, dto.tenantId)
      : isNull(userSystemRoleAssignments.tenantId)
    const [existing] = await this.db
      .select({ id: userSystemRoleAssignments.id })
      .from(userSystemRoleAssignments)
      .where(and(eq(userSystemRoleAssignments.userId, userId), eq(userSystemRoleAssignments.roleId, dto.roleId), tenantCondition))
      .limit(1)
    if (existing) throw new ConflictException('Bu rol zaten atanmış')

    const assignmentId = await this.db.transaction(async tx => {
      const created = assertRow(
        await tx
          .insert(userSystemRoleAssignments)
          .values({ userId, roleId: dto.roleId, tenantId: dto.tenantId ?? null })
          .returning(),
      )

      if (role.name === 'SYSTEM_ADMIN' && !dto.tenantId) {
        await tx.update(users).set({ isSystemAdmin: true }).where(eq(users.id, userId))
      }

      return created.id
    })

    const tenant = tenantRow

    await this.auditService.log({
      actorId: actorUserId ?? null,
      actionCode: 'SYSTEM_ROLE_GRANTED',
      entityType: 'UserSystemRoleAssignment',
      entityId: assignmentId,
      summary: `${user.email} kullanıcısına ${role.name} rolü atandı`,
      metadata: this.successMeta(context, user.id, { roleName: role.name, tenantId: dto.tenantId ?? null, tenantName: tenant?.name ?? null }),
    })

    return {
      id: assignmentId,
      roleId: dto.roleId,
      roleName: role.name,
      tenantId: dto.tenantId ?? null,
      tenantName: tenant?.name ?? null,
      tenantSlug: tenant?.slug ?? null,
      createdAt: new Date(),
    }
  }

  async revokeRole(userId: string, assignmentId: string, requestingUserId: string, context: UserAdminContext = {}) {
    const idChecks = [validateId(userId, 'Kullanıcı'), validateId(assignmentId, 'Rol ataması')].flatMap(check => check.errors)
    if (idChecks.length > 0) throw new BadRequestException(idChecks)

    const op: PrivilegeOp = { actorId: requestingUserId, action: 'SYSTEM_ROLE_REVOKED', entityType: 'UserSystemRoleAssignment', entityId: assignmentId, summary: 'Rol geri alma reddedildi', targetUserId: userId, context }
    const actor = await this.requirePrivilegeActor(op, true)

    const [row] = await this.db
      .select({ assignment: userSystemRoleAssignments, roleName: systemRoles.name, userEmail: users.email, userIsSystemAdmin: users.isSystemAdmin })
      .from(userSystemRoleAssignments)
      .innerJoin(systemRoles, eq(userSystemRoleAssignments.roleId, systemRoles.id))
      .innerJoin(users, eq(userSystemRoleAssignments.userId, users.id))
      .where(eq(userSystemRoleAssignments.id, assignmentId))
      .limit(1)

    if (!row || row.assignment.userId !== userId) {
      throw new NotFoundException('Rol ataması bulunamadı')
    }
    // Credential-class: a system-administrator target is refused for EVERY actor (TASK-027.47, Model B).
    await this.assertTargetRules(actor, op, { isSystemAdmin: row.userIsSystemAdmin }, { credentialClass: true, globalRoleChange: row.assignment.tenantId === null })

    if (row.roleName === 'SYSTEM_ADMIN' && row.assignment.tenantId === null) {
      const adminAssignments = await this.db
        .select({ id: userSystemRoleAssignments.id })
        .from(userSystemRoleAssignments)
        .innerJoin(systemRoles, eq(userSystemRoleAssignments.roleId, systemRoles.id))
        .where(and(eq(systemRoles.name, 'SYSTEM_ADMIN'), isNull(userSystemRoleAssignments.tenantId)))

      if (adminAssignments.length <= 1) {
        throw new ForbiddenException('Sistemdeki son SYSTEM_ADMIN rol ataması geri alınamaz')
      }
    }

    await this.db.transaction(async tx => {
      await tx.delete(userSystemRoleAssignments).where(eq(userSystemRoleAssignments.id, assignmentId))

      if (row.roleName === 'SYSTEM_ADMIN' && row.assignment.tenantId === null) {
        await tx.update(users).set({ isSystemAdmin: false }).where(eq(users.id, userId))
      }
    })

    await this.auditService.log({
      actorId: requestingUserId,
      actionCode: 'SYSTEM_ROLE_REVOKED',
      entityType: 'UserSystemRoleAssignment',
      entityId: row.assignment.id,
      summary: `${row.userEmail} kullanıcısından ${row.roleName} rolü geri alındı`,
      metadata: this.successMeta(context, userId, { roleName: row.roleName, tenantId: row.assignment.tenantId }),
    })

    return { success: true }
  }

  async listMemberships(userId: string) {
    const memberships = await this.db
      .select({
        id: tenantMemberships.id,
        tenantId: tenantMemberships.tenantId,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        tenantType: tenants.type,
        tenantStatus: tenants.status,
        isActive: tenantMemberships.isActive,
        createdAt: tenantMemberships.createdAt,
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
      .where(eq(tenantMemberships.userId, userId))
      .orderBy(desc(tenantMemberships.createdAt))

    return { memberships }
  }

  async addMembership(userId: string, tenantId: string, actorUserId?: string, context: UserAdminContext = {}) {
    const idCheck = [validateId(userId, 'Kullanıcı'), validateId(tenantId, 'Kiracı')].flatMap(check => check.errors)
    if (idCheck.length > 0) throw new BadRequestException(idCheck)

    const op: PrivilegeOp = { actorId: actorUserId, action: 'TENANT_MEMBERSHIP_ADDED', entityType: 'TenantMembership', entityId: userId, summary: 'Üyelik ekleme reddedildi', targetUserId: userId, context }
    const actor = await this.requirePrivilegeActor(op, true)
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı')
    await this.assertTargetRules(actor, op, user)

    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)
    if (!tenant) throw new NotFoundException('Kiracı bulunamadı')
    if (tenant.status !== 'ACTIVE') throw new BadRequestException('Sadece aktif kiracılara üyelik eklenebilir')

    const [existing] = await this.db
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, userId)))
      .limit(1)
    if (existing) throw new ConflictException('Kullanıcı zaten bu kiracıya üye')

    const membership = assertRow(await this.db.insert(tenantMemberships).values({ userId, tenantId, isActive: true }).returning())

    await this.auditService.log({
      actorId: actorUserId ?? null,
      actionCode: 'TENANT_MEMBERSHIP_ADDED',
      entityType: 'TenantMembership',
      entityId: membership.id,
      summary: `${user.email} kullanıcısına ${tenant.name} üyeliği eklendi`,
      metadata: this.successMeta(context, user.id, { tenantId: membership.tenantId, tenantName: tenant.name }),
    })

    return {
      id: membership.id,
      tenantId: membership.tenantId,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      tenantType: tenant.type,
      tenantStatus: tenant.status,
      isActive: membership.isActive,
      createdAt: membership.createdAt,
    }
  }

  async removeMembership(userId: string, membershipId: string, actorUserId?: string, context: UserAdminContext = {}) {
    const idChecks = [validateId(userId, 'Kullanıcı'), validateId(membershipId, 'Üyelik')].flatMap(check => check.errors)
    if (idChecks.length > 0) throw new BadRequestException(idChecks)

    const op: PrivilegeOp = { actorId: actorUserId, action: 'TENANT_MEMBERSHIP_REMOVED', entityType: 'TenantMembership', entityId: membershipId, summary: 'Üyelik kaldırma reddedildi', targetUserId: userId, context }
    const actor = await this.requirePrivilegeActor(op, true)

    const [row] = await this.db
      .select({ membership: tenantMemberships, userEmail: users.email, userIsSystemAdmin: users.isSystemAdmin, tenantName: tenants.name })
      .from(tenantMemberships)
      .innerJoin(users, eq(tenantMemberships.userId, users.id))
      .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
      .where(eq(tenantMemberships.id, membershipId))
      .limit(1)

    if (!row || row.membership.userId !== userId) {
      throw new NotFoundException('Üyelik kaydı bulunamadı')
    }
    await this.assertTargetRules(actor, op, { isSystemAdmin: row.userIsSystemAdmin })

    await this.db.delete(tenantMemberships).where(eq(tenantMemberships.id, membershipId))

    await this.auditService.log({
      actorId: actorUserId ?? null,
      actionCode: 'TENANT_MEMBERSHIP_REMOVED',
      entityType: 'TenantMembership',
      entityId: membershipId,
      summary: `${row.userEmail} kullanıcısının ${row.tenantName} üyeliği kaldırıldı`,
      metadata: this.successMeta(context, userId, { tenantId: row.membership.tenantId, tenantName: row.tenantName }),
    })

    return { success: true }
  }
}
