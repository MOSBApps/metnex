import { isInstantWithinValidity, type ReferenceValidityPeriod } from '../reference-validity.contract'
import { isForbiddenMosedasTenant, type TenantIdentity } from '../tenant-identity'

/**
 * TASK-029.02 — DEC-0014 karar 7/8: the MOSEDAŞ B2B identity is NEVER a user JWT, `isSystemAdmin`,
 * `TENANT_ADMIN` or any user role. It is a separate, opaque, time-bounded, revocable client identity
 * scoped to specific tenant/facility/machine/operation-center targets. This file holds only the
 * SHAPE of that identity and its allowlist — the real mTLS certificate / OAuth2 client secret is
 * never a field here (only an opaque `b2bClientId` the transport layer already authenticated by
 * the time this domain sees it).
 */
export interface B2bClientIdentity {
  b2bClientId: string
  externalSystem: 'MOSEDAS'
  status: 'ACTIVE' | 'REVOKED'
  validity: ReferenceValidityPeriod
}

/**
 * One allowlist grant: this client may act on THIS target only. `null` on a scope field means "any
 * value of that field for this client" — it never means "any tenant" (the `targetTenantId` field
 * itself is always a concrete tenant, never `null`, never a wildcard).
 */
export interface B2bTargetAllowlistEntry {
  b2bClientId: string
  targetTenantId: string
  facilityReferenceId: string | null
  machineReferenceId: string | null
  operationCenterId: string | null
  validity: ReferenceValidityPeriod
}

export interface B2bTargetReference {
  targetTenantId: string
  facilityReferenceId: string | null
  machineReferenceId: string | null
  operationCenterId: string | null
}

export type B2bIdentityErrorCode =
  | 'B2B_IDENTITY_REVOKED'
  | 'B2B_IDENTITY_EXPIRED'
  | 'B2B_TARGET_TENANT_NOT_MAPPABLE'
  | 'B2B_SCOPE_NOT_ALLOWLISTED'

export type B2bScopeResolution = { ok: true; entry: B2bTargetAllowlistEntry } | { ok: false; code: B2bIdentityErrorCode }

function safeId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 128
}

/** Pure structural check — no revocation/validity logic here, only shape. */
export function isWellFormedB2bClientIdentity(identity: B2bClientIdentity): boolean {
  return identity.externalSystem === 'MOSEDAS' && safeId(identity.b2bClientId) && (identity.status === 'ACTIVE' || identity.status === 'REVOKED')
}

/**
 * Resolves whether `identity` (already authenticated by the transport layer — mTLS/OAuth2, out of
 * this domain's scope) may act on `target` at instant `at`. Fail-closed at every step: `REVOKED` or
 * expired identity never resolves; an unmappable, inactive, `PLATFORM_ROOT` or MOSEDAŞ-slugged
 * target tenant never resolves (DEC-0014 — MOSEDAŞ can never be a target tenant either); and with NO
 * matching allowlist entry the identity has NO access to that target, however broad its own scope
 * might look — a client is never implicitly "all tenants" just because it exists.
 */
export function resolveB2bTargetScope(
  identity: B2bClientIdentity,
  targetTenant: TenantIdentity | null,
  allowlist: readonly B2bTargetAllowlistEntry[],
  target: B2bTargetReference,
  at: string,
): B2bScopeResolution {
  if (identity.status !== 'ACTIVE') return { ok: false, code: 'B2B_IDENTITY_REVOKED' }
  if (!isInstantWithinValidity(identity.validity, at)) return { ok: false, code: 'B2B_IDENTITY_EXPIRED' }
  if (
    !targetTenant ||
    targetTenant.tenantId !== target.targetTenantId ||
    targetTenant.type === 'PLATFORM_ROOT' ||
    targetTenant.status !== 'ACTIVE' ||
    isForbiddenMosedasTenant(targetTenant)
  ) {
    return { ok: false, code: 'B2B_TARGET_TENANT_NOT_MAPPABLE' }
  }
  const entry = allowlist.find(
    e =>
      e.b2bClientId === identity.b2bClientId &&
      e.targetTenantId === target.targetTenantId &&
      (e.facilityReferenceId === null || e.facilityReferenceId === target.facilityReferenceId) &&
      (e.machineReferenceId === null || e.machineReferenceId === target.machineReferenceId) &&
      (e.operationCenterId === null || e.operationCenterId === target.operationCenterId) &&
      isInstantWithinValidity(e.validity, at),
  )
  if (!entry) return { ok: false, code: 'B2B_SCOPE_NOT_ALLOWLISTED' }
  return { ok: true, entry }
}
