/**
 * Read-only input of the privilege analysis. Deliberately minimal: identifiers, status and scope only — no e-mail,
 * display name, password hash, token or any credential column is ever part of a snapshot.
 */
export interface PrivilegeSnapshotUser {
  id: string
  status: string
  isSystemAdmin: boolean
}

export interface PrivilegeSnapshotRole {
  id: string
  name: string
}

export interface PrivilegeSnapshotAssignment {
  id: string
  userId: string
  roleId: string
  /** null = GLOBAL scope */
  tenantId: string | null
}

export interface PrivilegeSnapshotTenant {
  id: string
  type: string
  status: string
}

export interface PrivilegeSnapshot {
  users: PrivilegeSnapshotUser[]
  roles: PrivilegeSnapshotRole[]
  assignments: PrivilegeSnapshotAssignment[]
  tenants: PrivilegeSnapshotTenant[]
}

/** SELECT-only port. Implementations must not expose or perform any write. */
export interface PrivilegeSnapshotPort {
  load(): Promise<PrivilegeSnapshot>
}

export const PRIVILEGE_SNAPSHOT_PORT = Symbol('PRIVILEGE_SNAPSHOT_PORT')
