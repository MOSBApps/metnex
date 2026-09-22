import {
  CANONICAL_PRIVILEGE_SOURCE as C,
  DRIFT_CATEGORIES,
  DRIFT_REASONS as R,
  type DriftCategory,
  type DriftReason,
} from './privilege-canonical.contract'
import type { PrivilegeSnapshot } from './privilege-snapshot.port'

/**
 * Pure, deterministic, DB-free analysis of a privilege snapshot (TASK-027.45). It only REPORTS: the report is a
 * value, carries no permission, changes no access and never asks anything to be revoked, updated or deleted.
 * Records hold identifiers, scope, status and a static reason code — no credential, token, OTP or secret.
 */
export type AssignmentScope = 'GLOBAL' | 'TENANT'
export type SubjectType = 'USER' | 'ASSIGNMENT' | 'PLATFORM'

export interface DriftRecord {
  category: DriftCategory
  reason: DriftReason
  subjectType: SubjectType
  /** user id, assignment id, or the literal `PLATFORM` for platform-wide records */
  subjectId: string
  userId?: string
  assignmentId?: string
  scope?: AssignmentScope
  tenantId?: string | null
  userStatus?: string
  flag?: boolean
  hasGlobalSystemAdminRole?: boolean
  counts?: { assignmentCount: number; activeFlagCount: number; activeRoleCount: number }
}

export interface AssignmentRecord {
  assignmentId: string
  userId: string
  roleName: string | null
  scope: AssignmentScope
  tenantId: string | null
  tenantType: string | null
  userStatus: string | null
}

export interface PrivilegeReport {
  schemaVersion: 1
  /** The only mode: nothing is ever written. */
  mode: 'DRY_RUN'
  /** Static statement of the report's effect. */
  effect: 'REPORT_ONLY'
  canonicalSource: typeof C.canonical
  derivedCache: typeof C.derivedCache
  invariant: {
    activeSystemAdminCount: number
    minimumRequired: number
    satisfied: boolean
    violation: 'ZERO_ACTIVE_SYSTEM_ADMIN' | null
    /** Informational only: the "at least two administrators" policy is not decided (Q-DP24). */
    singleActiveSystemAdmin: boolean
    lastAdministratorUserIds: string[]
  }
  counts: {
    users: number
    assignments: number
    globalAssignments: number
    tenantAssignments: number
    /** count used by the current revoke guard: all global SYSTEM_ADMIN assignments, whatever the user status */
    systemAdminAssignments: number
    /** count used by the current deactivate guard: ACTIVE users with the flag */
    activeFlagCount: number
    /** canonical: ACTIVE users holding a global SYSTEM_ADMIN assignment */
    activeRoleCount: number
  }
  driftByCategory: Record<DriftCategory, number>
  drift: DriftRecord[]
  assignments: { global: AssignmentRecord[]; tenant: AssignmentRecord[] }
  roleSummary: { global: Array<{ roleName: string; count: number }>; tenant: Array<{ roleName: string; count: number }> }
}

const categoryRank = new Map(DRIFT_CATEGORIES.map((category, index) => [category, index]))
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function analyzePrivilegeSnapshot(snapshot: PrivilegeSnapshot): PrivilegeReport {
  const usersById = new Map(snapshot.users.map(user => [user.id, user]))
  const rolesById = new Map(snapshot.roles.map(role => [role.id, role]))
  const tenantsById = new Map(snapshot.tenants.map(tenant => [tenant.id, tenant]))

  const drift: DriftRecord[] = []
  const assignments: AssignmentRecord[] = []
  const globalSystemAdminUserIds = new Set<string>()
  let systemAdminAssignmentCount = 0

  for (const assignment of snapshot.assignments) {
    const user = usersById.get(assignment.userId)
    const role = rolesById.get(assignment.roleId)
    const scope: AssignmentScope = assignment.tenantId === null ? 'GLOBAL' : 'TENANT'
    const tenant = assignment.tenantId === null ? undefined : tenantsById.get(assignment.tenantId)
    const roleName = role?.name ?? null

    assignments.push({
      assignmentId: assignment.id,
      userId: assignment.userId,
      roleName,
      scope,
      tenantId: assignment.tenantId,
      tenantType: tenant?.type ?? null,
      userStatus: user?.status ?? null,
    })

    const base = { subjectType: 'ASSIGNMENT' as const, subjectId: assignment.id, assignmentId: assignment.id, userId: assignment.userId, scope, tenantId: assignment.tenantId }
    if (!user) drift.push({ category: 'INVALID_TARGET_REFERENCE', reason: R.USER_REFERENCE_MISSING, ...base })
    if (!role) drift.push({ category: 'INVALID_TARGET_REFERENCE', reason: R.ROLE_REFERENCE_MISSING, ...base, ...(user ? { userStatus: user.status } : {}) })

    if (scope === 'TENANT' && !tenant) {
      drift.push({ category: 'UNKNOWN_ROLE_SCOPE', reason: R.TENANT_REFERENCE_MISSING, ...base, ...(user ? { userStatus: user.status } : {}) })
    }
    if (roleName === C.systemAdminRoleName && scope === 'TENANT') {
      drift.push({ category: 'UNKNOWN_ROLE_SCOPE', reason: R.SYSTEM_ADMIN_TENANT_SCOPED, ...base, ...(user ? { userStatus: user.status } : {}) })
    }
    if (roleName === C.tenantAdminRoleName && scope === 'GLOBAL') {
      drift.push({ category: 'GLOBAL_TENANT_ADMIN', reason: R.TENANT_ADMIN_ASSIGNED_GLOBALLY, ...base, ...(user ? { userStatus: user.status } : {}) })
    }
    if (roleName === C.systemAdminRoleName && scope === 'GLOBAL') {
      systemAdminAssignmentCount += 1
      globalSystemAdminUserIds.add(assignment.userId)
    }
  }

  let activeFlagCount = 0
  let activeRoleCount = 0
  const lastAdministrators: string[] = []
  for (const user of snapshot.users) {
    const hasRole = globalSystemAdminUserIds.has(user.id)
    const active = user.status === C.activeUserStatus
    if (user.isSystemAdmin && active) activeFlagCount += 1
    if (hasRole && active) {
      activeRoleCount += 1
      lastAdministrators.push(user.id)
    }
    if (!user.isSystemAdmin && !hasRole) continue

    const record = { subjectType: 'USER' as const, subjectId: user.id, userId: user.id, userStatus: user.status, flag: user.isSystemAdmin, hasGlobalSystemAdminRole: hasRole }
    if (user.isSystemAdmin && hasRole) drift.push({ category: 'FLAG_ROLE_MATCH', reason: R.FLAG_AND_ROLE_AGREE, ...record })
    else if (user.isSystemAdmin) drift.push({ category: 'FLAG_WITHOUT_SYSTEM_ROLE', reason: R.FLAG_SET_NO_GLOBAL_SYSTEM_ADMIN_ROLE, ...record })
    else drift.push({ category: 'SYSTEM_ROLE_WITHOUT_FLAG', reason: R.GLOBAL_SYSTEM_ADMIN_ROLE_FLAG_UNSET, ...record })

    if (user.status === 'INACTIVE') drift.push({ category: 'INACTIVE_SYSTEM_ADMIN', reason: R.ADMIN_USER_INACTIVE, ...record })
    if (user.status === 'LOCKED') drift.push({ category: 'LOCKED_SYSTEM_ADMIN', reason: R.ADMIN_USER_LOCKED, ...record })
  }

  if (systemAdminAssignmentCount !== activeFlagCount || activeFlagCount !== activeRoleCount || systemAdminAssignmentCount !== activeRoleCount) {
    drift.push({
      category: 'MULTIPLE_ADMIN_COUNT_MISMATCH', reason: R.GUARD_COUNTS_DIFFER, subjectType: 'PLATFORM', subjectId: 'PLATFORM',
      counts: { assignmentCount: systemAdminAssignmentCount, activeFlagCount, activeRoleCount },
    })
  }

  drift.sort((a, b) => (categoryRank.get(a.category) ?? 0) - (categoryRank.get(b.category) ?? 0) || compare(a.subjectId, b.subjectId) || compare(a.reason, b.reason))
  assignments.sort((a, b) => compare(a.assignmentId, b.assignmentId))

  const global = assignments.filter(a => a.scope === 'GLOBAL')
  const tenant = assignments.filter(a => a.scope === 'TENANT')
  const summarize = (list: AssignmentRecord[]) => {
    const counts = new Map<string, number>()
    for (const item of list) counts.set(item.roleName ?? 'UNKNOWN_ROLE', (counts.get(item.roleName ?? 'UNKNOWN_ROLE') ?? 0) + 1)
    return [...counts.entries()].map(([roleName, count]) => ({ roleName, count })).sort((a, b) => compare(a.roleName, b.roleName))
  }

  const driftByCategory = Object.fromEntries(DRIFT_CATEGORIES.map(category => [category, 0])) as Record<DriftCategory, number>
  for (const record of drift) driftByCategory[record.category] += 1

  return {
    schemaVersion: 1,
    mode: 'DRY_RUN',
    effect: 'REPORT_ONLY',
    canonicalSource: C.canonical,
    derivedCache: C.derivedCache,
    invariant: {
      activeSystemAdminCount: activeRoleCount,
      minimumRequired: C.minimumActiveSystemAdmins,
      satisfied: activeRoleCount >= C.minimumActiveSystemAdmins,
      violation: activeRoleCount >= C.minimumActiveSystemAdmins ? null : 'ZERO_ACTIVE_SYSTEM_ADMIN',
      singleActiveSystemAdmin: activeRoleCount === 1,
      lastAdministratorUserIds: activeRoleCount === 1 ? lastAdministrators.sort(compare) : [],
    },
    counts: {
      users: snapshot.users.length,
      assignments: assignments.length,
      globalAssignments: global.length,
      tenantAssignments: tenant.length,
      systemAdminAssignments: systemAdminAssignmentCount,
      activeFlagCount,
      activeRoleCount,
    },
    driftByCategory,
    drift,
    assignments: { global, tenant },
    roleSummary: { global: summarize(global), tenant: summarize(tenant) },
  }
}
