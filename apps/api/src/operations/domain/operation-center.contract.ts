import { isForbiddenMosedasTenant, type TenantIdentity } from './tenant-identity'

/**
 * TASK-029.01 — DEC-0017 D-09: Kömür Kazanı and Kırım Tesisi are OPERATION CENTERS (tesis/ünite
 * referansı) under their owning tenant, NEVER separate tenants. An operation center is also NOT a
 * vardiya (shift) — vardiya is a time/responsibility dimension applied ON TOP of an operation center
 * or a production order, never an entity modelled here (DEC-0017 D-08; out of scope for this task).
 */
export const OPERATION_CENTER_KINDS = ['KOMUR_KAZANI', 'KIRIM_TESISI'] as const
export type OperationCenterKind = (typeof OPERATION_CENTER_KINDS)[number]

/** Which DEC-0014 operation tenant a kind of operation center is fixed to. Never derived from a tenant slug/name — D-04 (tenant-slug wording) is a separate, still-open question this table does not resolve. */
export type OperationCenterOwnerRole = 'MOSB_ENERJI' | 'MOSBIO'

export const OPERATION_CENTER_OWNER_ROLE: Readonly<Record<OperationCenterKind, OperationCenterOwnerRole>> = {
  KOMUR_KAZANI: 'MOSB_ENERJI',
  KIRIM_TESISI: 'MOSBIO',
}

export interface OperationCenter {
  operationCenterId: string
  kind: OperationCenterKind
  /** The tenant that owns this operation center. Structurally distinct from `TenantOperationScope`/vardiya — this field alone never grants access (see `tenant-operation-scope.contract.ts`). */
  ownerTenantId: string
  status: 'ACTIVE' | 'INACTIVE'
}

/**
 * Which tenant plays which DEC-0014 operation-tenant role. This assignment is supplied by the CALLER
 * (a future, explicitly-approved configuration/decision — see D-04) — this module never infers a role
 * from a tenant slug, name or free text, and never creates a tenant.
 */
export interface TenantOperationRoleAssignment {
  tenantId: string
  role: OperationCenterOwnerRole
}

export type OperationCenterResolutionErrorCode =
  | 'OPERATION_CENTER_NOT_FOUND'
  | 'OPERATION_CENTER_INACTIVE'
  | 'OWNER_TENANT_NOT_MAPPABLE'
  | 'OWNER_ROLE_UNASSIGNED'
  | 'OWNER_ROLE_MISMATCH'
  | 'SCOPE_DENIED'

export type OperationCenterResolution =
  | { ok: true; center: OperationCenter; ownerRole: OperationCenterOwnerRole }
  | { ok: false; code: OperationCenterResolutionErrorCode }

/**
 * Resolves an operation center's owning role and validates it against DEC-0017 D-09's fixed
 * kind→role table (Kömür Kazanı ⇒ only under a MOSB_ENERJI-assigned tenant, Kırım Tesisi ⇒ only
 * under a MOSBIO-assigned tenant). Fails closed: an unassigned or wrongly-assigned owner tenant, an
 * inactive center, or a MOSEDAŞ-slugged tenant never resolves.
 */
export function resolveOperationCenterOwner(
  center: OperationCenter,
  ownerTenant: TenantIdentity | null,
  assignments: readonly TenantOperationRoleAssignment[],
): OperationCenterResolution {
  if (center.status !== 'ACTIVE') return { ok: false, code: 'OPERATION_CENTER_INACTIVE' }
  if (!ownerTenant || ownerTenant.tenantId !== center.ownerTenantId) return { ok: false, code: 'OWNER_TENANT_NOT_MAPPABLE' }
  if (ownerTenant.type === 'PLATFORM_ROOT' || ownerTenant.status !== 'ACTIVE') return { ok: false, code: 'OWNER_TENANT_NOT_MAPPABLE' }
  if (isForbiddenMosedasTenant(ownerTenant)) return { ok: false, code: 'OWNER_TENANT_NOT_MAPPABLE' }
  const assignment = assignments.find(a => a.tenantId === ownerTenant.tenantId)
  if (!assignment) return { ok: false, code: 'OWNER_ROLE_UNASSIGNED' }
  const requiredRole = OPERATION_CENTER_OWNER_ROLE[center.kind]
  if (assignment.role !== requiredRole) return { ok: false, code: 'OWNER_ROLE_MISMATCH' }
  return { ok: true, center, ownerRole: assignment.role }
}

/**
 * A caller may only resolve an operation center that belongs to their OWN tenant scope — never
 * another tenant's, and never by `operationCenterId` alone (see `tenant-operation-scope.contract.ts`
 * for the full access-grant rule; this is the identity/ownership half of the check).
 */
export function resolveOperationCenterForCaller(
  center: OperationCenter,
  ownerTenant: TenantIdentity | null,
  assignments: readonly TenantOperationRoleAssignment[],
  callerTenantId: string,
): OperationCenterResolution {
  const resolved = resolveOperationCenterOwner(center, ownerTenant, assignments)
  if (!resolved.ok) return resolved
  if (resolved.center.ownerTenantId !== callerTenantId) return { ok: false, code: 'SCOPE_DENIED' }
  return resolved
}
