import { isForbiddenMosedasTenant, isMappableTenant, type TenantIdentity } from './tenant-identity'

/**
 * TASK-029.01 — the access-kind vocabulary this domain's authorization sözleşmesi uses. These are
 * NOT permission codes (no catalogue entry is created by this task) — they are the scope KINDS a
 * later permission model (029.01+ implementation, 029.07/029.09) will be built from.
 */
export const OPERATION_ACCESS_KINDS = ['VIEW', 'DATA_ENTRY', 'APPROVAL', 'CORRECTION', 'MANAGEMENT'] as const
export type OperationAccessKind = (typeof OPERATION_ACCESS_KINDS)[number]

/**
 * `tenantId` + `operationCenterId` together are the scope key (per the task's explicit instruction).
 * `operationCenterId: null` means "the whole tenant", never "any tenant" — it is always read alongside
 * a real `tenantId`.
 */
export interface TenantOperationScope {
  tenantId: string
  operationCenterId: string | null
}

/**
 * A caller's actual, granted membership in one tenant. This must come from the platform's own
 * membership store (mirrors `tenantMemberships` — never invented or trusted from client input); it is
 * the ONLY thing that can turn a `UserOperationCenterScope` grant into real access.
 */
export interface ActiveTenantMembership {
  userId: string
  tenantId: string
  isActive: boolean
}

/**
 * One explicit grant of a user's access kinds within a tenant, optionally narrowed to one operation
 * center. Viewing and data-entry (and every other kind) are separate grants — one never implies the
 * other (BRIF2 §2: "görüntüleme ve veri girişi yetkileri ayrı tanımlanır").
 */
export interface UserOperationCenterScope {
  userId: string
  tenantId: string
  operationCenterId: string | null
  access: readonly OperationAccessKind[]
}

/**
 * The authenticated caller's own standing, as already established by the platform (JWT + DB re-read)
 * — never a client-supplied flag. `isSystemAdmin` is passed through for completeness of the
 * sözleşmesi ("sistem yöneticisi sınırı"); this domain does NOT grant a universal bypass on its own —
 * a system administrator still resolves against a real, existing tenant and operation center here,
 * exactly like every other caller (see `resolveUserOperationAccess`).
 */
export interface OperationCallerContext {
  userId: string
  isSystemAdmin: boolean
}

export type OperationScopeErrorCode = 'TENANT_NOT_MAPPABLE' | 'MEMBERSHIP_NOT_ACTIVE' | 'SCOPE_NOT_GRANTED' | 'ACCESS_NOT_GRANTED'

export type OperationScopeResolution = { ok: true; scope: TenantOperationScope; access: readonly OperationAccessKind[] } | { ok: false; code: OperationScopeErrorCode }

/**
 * Resolves whether `caller` may exercise `required` access within `{ tenantId, operationCenterId }`.
 * Fail-closed at every step, in order:
 *   1. the tenant itself must be mappable (active, not PLATFORM_ROOT, not MOSEDAŞ-slugged);
 *   2. the caller must hold an ACTIVE membership of that EXACT tenant (never inferred, never another
 *      tenant's membership, never `operationCenterId` alone);
 *   3. an explicit `UserOperationCenterScope` grant must exist for that tenant AND (operationCenterId
 *      match OR a tenant-wide grant, i.e. the grant's `operationCenterId` is `null`);
 *   4. the required access kind must be included in that grant.
 * `isSystemAdmin` does not skip any of these steps in this domain's own resolution function — a
 * caller-side system-admin bypass, if any, is decided at the guard/permission layer that calls this
 * (out of scope here), never inside the domain contract itself.
 */
export function resolveUserOperationAccess(
  tenant: TenantIdentity | null,
  membership: ActiveTenantMembership | null,
  grants: readonly UserOperationCenterScope[],
  caller: OperationCallerContext,
  target: TenantOperationScope,
  required: OperationAccessKind,
): OperationScopeResolution {
  if (!isMappableTenant(tenant) || tenant.tenantId !== target.tenantId) return { ok: false, code: 'TENANT_NOT_MAPPABLE' }
  if (!membership || membership.userId !== caller.userId || membership.tenantId !== target.tenantId || membership.isActive !== true) {
    return { ok: false, code: 'MEMBERSHIP_NOT_ACTIVE' }
  }
  const grant = grants.find(
    g =>
      g.userId === caller.userId &&
      g.tenantId === target.tenantId &&
      (g.operationCenterId === null || g.operationCenterId === target.operationCenterId),
  )
  if (!grant) return { ok: false, code: 'SCOPE_NOT_GRANTED' }
  if (!grant.access.includes(required)) return { ok: false, code: 'ACCESS_NOT_GRANTED' }
  return { ok: true, scope: target, access: grant.access }
}

/** A grant may never be authored for the forbidden MOSEDAŞ slug — defence in depth alongside `isMappableTenant`. */
export function validateUserOperationCenterScope(grant: UserOperationCenterScope, tenant: TenantIdentity | null): boolean {
  if (!tenant || tenant.tenantId !== grant.tenantId) return false
  if (isForbiddenMosedasTenant(tenant)) return false
  if (grant.access.length === 0) return false
  return grant.access.every(a => OPERATION_ACCESS_KINDS.includes(a))
}
