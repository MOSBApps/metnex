/**
 * Privilege canonical-source contract (Q-DP24, TASK-027.45). READ-ONLY foundation: nothing here grants, revokes or
 * changes access. Decisions applied (AI1 karar seti, docs/migration/METNEX_PLATFORM_PRIVILEGE_MODEL_DECISION_PACKAGE.md §14):
 *  1. A user is a system administrator iff they hold a GLOBAL (tenantId null) `SYSTEM_ADMIN` role assignment — the canonical source.
 *  2. `users.isSystemAdmin` is a derived cache of (1); disagreement is DRIFT that is only reported.
 *  3. Only status ACTIVE counts: INACTIVE and LOCKED users are never active system administrators.
 *  4. "Last administrator" is computed from canonical role assignments of ACTIVE users.
 *  5. Global and tenant-scoped role assignments are reported separately.
 * Runtime authorisation (PermissionGuard, AuthService, inline system-admin checks) is UNCHANGED and still reads the flag.
 */
export const CANONICAL_PRIVILEGE_SOURCE = {
  canonical: 'GLOBAL_SYSTEM_ADMIN_ROLE_ASSIGNMENT',
  derivedCache: 'users.isSystemAdmin',
  activeUserStatus: 'ACTIVE',
  systemAdminRoleName: 'SYSTEM_ADMIN',
  tenantAdminRoleName: 'TENANT_ADMIN',
  minimumActiveSystemAdmins: 1,
} as const

export const DRIFT_CATEGORIES = [
  'FLAG_ROLE_MATCH',
  'FLAG_WITHOUT_SYSTEM_ROLE',
  'SYSTEM_ROLE_WITHOUT_FLAG',
  'INACTIVE_SYSTEM_ADMIN',
  'LOCKED_SYSTEM_ADMIN',
  'GLOBAL_TENANT_ADMIN',
  'MULTIPLE_ADMIN_COUNT_MISMATCH',
  'UNKNOWN_ROLE_SCOPE',
  'INVALID_TARGET_REFERENCE',
] as const
export type DriftCategory = (typeof DRIFT_CATEGORIES)[number]

/** Static, non-sensitive reason codes — the only free-form-looking text a record may carry. */
export const DRIFT_REASONS = {
  FLAG_AND_ROLE_AGREE: 'FLAG_AND_ROLE_AGREE',
  FLAG_SET_NO_GLOBAL_SYSTEM_ADMIN_ROLE: 'FLAG_SET_NO_GLOBAL_SYSTEM_ADMIN_ROLE',
  GLOBAL_SYSTEM_ADMIN_ROLE_FLAG_UNSET: 'GLOBAL_SYSTEM_ADMIN_ROLE_FLAG_UNSET',
  ADMIN_USER_INACTIVE: 'ADMIN_USER_INACTIVE',
  ADMIN_USER_LOCKED: 'ADMIN_USER_LOCKED',
  TENANT_ADMIN_ASSIGNED_GLOBALLY: 'TENANT_ADMIN_ASSIGNED_GLOBALLY',
  GUARD_COUNTS_DIFFER: 'GUARD_COUNTS_DIFFER',
  TENANT_REFERENCE_MISSING: 'TENANT_REFERENCE_MISSING',
  SYSTEM_ADMIN_TENANT_SCOPED: 'SYSTEM_ADMIN_TENANT_SCOPED',
  USER_REFERENCE_MISSING: 'USER_REFERENCE_MISSING',
  ROLE_REFERENCE_MISSING: 'ROLE_REFERENCE_MISSING',
} as const
export type DriftReason = (typeof DRIFT_REASONS)[keyof typeof DRIFT_REASONS]
