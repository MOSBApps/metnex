import type { CatalogActor, CatalogAuditEntry, CatalogOperation, CatalogSource } from './catalog.types'
import type { TenantRecord } from './tenant-guards'

/**
 * Repository port. `withTransaction` must make the callback atomic: if it throws, NOTHING it saved
 * is kept. A real (control-plane) implementation is a later step and needs explicit approval before
 * any real database is touched.
 */
export interface CatalogRepository {
  withTransaction<T>(work: (tx: CatalogTransaction) => Promise<T>): Promise<T>
  get(id: string): Promise<CatalogSource | null>
  list(): Promise<CatalogSource[]>
  history(id: string): Promise<CatalogSource[]>
}

export interface CatalogTransaction {
  get(id: string): Promise<CatalogSource | null>
  /** `snapshot.version` must equal current version + 1 (or 1 for a new id) — optimistic concurrency. */
  saveVersion(snapshot: CatalogSource): Promise<void>
}

/**
 * Who may change the catalog is Q-W516 (open): NO permission code is invented. The service has no
 * default authoriser — it cannot be constructed without one and fails closed on any doubt.
 */
export interface CatalogWriteAuthorizer {
  authorize(actor: CatalogActor, operation: CatalogOperation): Promise<boolean>
}

/** Audit action/entity names are Q-W519 (open); the adapter maps `entry.operation` later. */
export interface CatalogAuditPort {
  record(entry: CatalogAuditEntry): Promise<void>
}

export interface TenantDirectory {
  find(tenantId: string): Promise<TenantRecord | null>
}

export interface CatalogClock {
  now(): Date
}
