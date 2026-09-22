/**
 * Pure privilege-ceiling model (TASK-027.46, Q-DP24 decision 4). "Effective permissions" are computed with the
 * semantics of the REAL `PermissionGuard` (permission.guard.ts) — nothing is invented:
 *  - `users.isSystemAdmin` (flag) → every permission;
 *  - `PLATFORM:*` permissions come ONLY from the union of `rolePermissions` of GLOBAL (tenantId null) assignments
 *    (exact-code match, see checkPermission);
 *  - any other permission at a tenant context is granted by a `TENANT_ADMIN` assignment at that tenant's customer root
 *    ("everything except PLATFORM:*" — the role's permission list is NOT consulted there); tenant roles are the only other
 *    source and have no management surface;
 *  - a system role other than TENANT_ADMIN assigned at a tenant scope grants nothing (inert).
 * An assignment at tenant X is effective only if X is its own root (type ROOT, or PLATFORM_ROOT whose header context has
 * no customer root); at a STANDARD tenant it is inert. The parity spec runs the real PermissionGuard against this model.
 * The ceiling: a grant is allowed only when targetEffective ⊆ actorEffective. Unknown permissions or scopes fail closed.
 */
export const PRIVILEGE_DENIAL = {
  DENIED: { code: 'PRIVILEGE_CHANGE_DENIED', message: 'Bu işlem için yetkiniz bulunmuyor' },
  IMPERSONATION: {
    code: 'IMPERSONATION_PRIVILEGE_CHANGE_FORBIDDEN',
    message: 'Impersonation oturumunda yetki ve hesap yönetimi işlemleri yapılamaz',
  },
  GLOBAL_TENANT_ADMIN: {
    code: 'GLOBAL_TENANT_ADMIN_FORBIDDEN',
    message: 'TENANT_ADMIN rolü global olarak atanamaz; yalnızca bir müşteri kök tenantı için atanabilir',
  },
  /** TASK-027.47 (Q-DP24 closure, decision 2 / Model B): peer system administrators may no longer change each
   * other's password, role or MFA settings. Deactivation (containment) is deliberately NOT covered by this code —
   * it stays available between peers, unchanged from TASK-027.42. */
  PEER_SYSTEM_ADMIN_CREDENTIAL: {
    code: 'PEER_SYSTEM_ADMIN_CREDENTIAL_RESTRICTED',
    message: 'Sistem yöneticileri birbirlerinin parolasını, rolünü veya MFA ayarlarını bu yüzeyden değiştiremez',
  },
} as const

export interface EffectivePermissions {
  readonly all: boolean
  /** PLATFORM:* codes, from global assignments only */
  readonly platform: ReadonlySet<string>
  /** ids of root tenants where the holder is TENANT_ADMIN (everything except PLATFORM:* there) */
  readonly tenantAdminRoots: ReadonlySet<string>
}

export interface TenantFacts {
  id: string
  type: string
  customerRootId: string | null
}

export interface ActorAssignmentFacts {
  roleId: string
  roleName: string
  /** null = GLOBAL */
  tenantId: string | null
}

const KNOWN_TENANT_TYPES = ['ROOT', 'PLATFORM_ROOT', 'STANDARD']
const isPlatformCode = (code: string) => code.startsWith('PLATFORM:')

/** A tenant is its own effective root only when it is ROOT or PLATFORM_ROOT (see PermissionGuard `customerRootId ?? tenantId`). */
export function effectiveRootOf(tenant: TenantFacts): string | null {
  return tenant.type === 'ROOT' || tenant.type === 'PLATFORM_ROOT' ? tenant.id : null
}

export function resolveActorEffective(input: {
  isSystemAdmin: boolean
  assignments: readonly ActorAssignmentFacts[]
  rolePermissionCodes: ReadonlyMap<string, readonly string[]>
  tenantsById: ReadonlyMap<string, TenantFacts>
}): EffectivePermissions {
  const platform = new Set<string>()
  const roots = new Set<string>()
  for (const assignment of input.assignments) {
    if (assignment.tenantId === null) {
      for (const code of input.rolePermissionCodes.get(assignment.roleId) ?? []) if (isPlatformCode(code)) platform.add(code)
    } else if (assignment.roleName === 'TENANT_ADMIN') {
      const tenant = input.tenantsById.get(assignment.tenantId)
      const root = tenant ? effectiveRootOf(tenant) : null
      if (root) roots.add(root)
    }
  }
  return { all: input.isSystemAdmin, platform, tenantAdminRoots: roots }
}

export type CeilingRefusal = 'UNKNOWN_PERMISSION' | 'UNKNOWN_SCOPE' | 'PRIVILEGE_CEILING_EXCEEDED'

export type CeilingResult = { allowed: true } | { allowed: false; reason: CeilingRefusal }

/** Effective permissions a role grants when assigned at `scope` (`tenant` null = global). null result = refuse (fail-closed). */
export function resolveGrantEffective(input: {
  roleName: string
  roleCodes: readonly string[]
  knownPermissionCodes: readonly string[]
  tenant: TenantFacts | null
  global: boolean
}): { effective: EffectivePermissions } | { refusal: CeilingRefusal } {
  if (input.roleCodes.some(code => !input.knownPermissionCodes.includes(code))) return { refusal: 'UNKNOWN_PERMISSION' }
  if (input.global) {
    if (input.roleName === 'SYSTEM_ADMIN') return { effective: { all: true, platform: new Set(), tenantAdminRoots: new Set() } }
    return { effective: { all: false, platform: new Set(input.roleCodes.filter(isPlatformCode)), tenantAdminRoots: new Set() } }
  }
  if (!input.tenant || !KNOWN_TENANT_TYPES.includes(input.tenant.type)) return { refusal: 'UNKNOWN_SCOPE' }
  if (input.roleName === 'TENANT_ADMIN') {
    const root = effectiveRootOf(input.tenant)
    return { effective: { all: false, platform: new Set(), tenantAdminRoots: new Set(root ? [root] : []) } }
  }
  return { effective: { all: false, platform: new Set(), tenantAdminRoots: new Set() } } // inert at tenant scope
}

/** targetEffective ⊆ actorEffective */
export function isWithinCeiling(target: EffectivePermissions, actor: EffectivePermissions): boolean {
  if (actor.all) return true
  if (target.all) return false
  for (const code of target.platform) if (!actor.platform.has(code)) return false
  for (const root of target.tenantAdminRoots) if (!actor.tenantAdminRoots.has(root)) return false
  return true
}

export function evaluateRoleGrantCeiling(input: {
  actor: EffectivePermissions
  roleName: string
  roleCodes: readonly string[]
  knownPermissionCodes: readonly string[]
  tenant: TenantFacts | null
  global: boolean
}): CeilingResult {
  const grant = resolveGrantEffective(input)
  if ('refusal' in grant) return { allowed: false, reason: grant.refusal }
  return isWithinCeiling(grant.effective, input.actor) ? { allowed: true } : { allowed: false, reason: 'PRIVILEGE_CEILING_EXCEEDED' }
}

/**
 * Mirror of PermissionGuard for a single permission. `context` is the header tenant (null = none). Used by the parity spec
 * and by nothing at runtime: authorisation itself stays in PermissionGuard.
 */
export function permits(effective: EffectivePermissions, permission: string, context: TenantFacts | null): boolean {
  if (effective.all) return true
  if (isPlatformCode(permission)) return effective.platform.has(permission)
  if (!context) return false
  const contextRoot = context.type === 'ROOT' ? context.id : context.customerRootId ?? context.id
  return effective.tenantAdminRoots.has(contextRoot)
}
