/**
 * Explicit, whitelist-based projections of a `users` row for every response that leaves the API
 * (TASK-027.41-R1). A raw `users` row carries `passwordHash`; spreading or returning one leaks it.
 * These functions copy ONLY the named fields, so a column added to `users` later can never leak by
 * accident. No credential, MFA, token or hash field is ever part of a view.
 */
export interface UserRowLike {
  id: string
  email: string
  displayName: string
  status: string
  createdAt?: Date
  updatedAt?: Date
  isSystemAdmin?: boolean
}

export interface CustomerUserView {
  id: string
  email: string
  displayName: string
  status: string
  createdAt: Date | undefined
  updatedAt: Date | undefined
}

export interface PlatformUserView extends CustomerUserView {
  isSystemAdmin: boolean
}

/** Customer-admin surface: system-administrator status is intentionally not part of the view. */
export function toCustomerUserView(row: UserRowLike): CustomerUserView {
  return { id: row.id, email: row.email, displayName: row.displayName, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt }
}

export function toPlatformUserView(row: UserRowLike): PlatformUserView {
  return { ...toCustomerUserView(row), isSystemAdmin: row.isSystemAdmin === true }
}

export interface SessionUserLike extends UserRowLike {
  mfaVerified?: boolean
  impersonation?: boolean
  impersonatorUserId?: string | null
  impersonatorEmail?: string | null
}

export interface SessionUserView {
  id: string
  email: string
  displayName: string
  status: string
  isSystemAdmin: boolean
  mfaVerified: boolean
  impersonation: boolean
  impersonatorUserId: string | null
  impersonatorEmail: string | null
}

/** `GET /auth/me`: who the session is, never how the account is secured. */
export function toSessionUserView(user: SessionUserLike): SessionUserView {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    isSystemAdmin: user.isSystemAdmin === true,
    mfaVerified: user.mfaVerified === true,
    impersonation: user.impersonation === true,
    impersonatorUserId: user.impersonatorUserId ?? null,
    impersonatorEmail: user.impersonatorEmail ?? null,
  }
}
