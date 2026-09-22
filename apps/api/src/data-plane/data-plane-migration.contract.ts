import type { PgSchema } from 'drizzle-orm/pg-core'
import type { RegistryDiagnosticStatus, RegistryPhysicalSchemaProbe } from '../tenant-scope/registry-diagnostics'
import type { DataPlaneMigrationDefinition } from './data-plane-version'

/**
 * Contract for migrating ONE customer-root data-plane schema. This is control-plane-independent:
 * it never reads apps/api/drizzle/migrations and is never started by the application, an HTTP
 * request, a tenant scope or a user role. Its only inputs are the explicit request below, an
 * explicit migration chain, and the ports — real port implementations do not exist yet.
 */
export type DataPlaneMigrationMode = 'DRY_RUN' | 'APPLY'

export interface DataPlaneMigrationRequest {
  /** The single customer-root tenant to migrate. No wildcard, list or default exists. */
  customerRootTenantId: string
  /** Explicit; there is no default. DRY_RUN persists nothing. */
  mode: DataPlaneMigrationMode
  runId: string
}

export interface DataPlaneRegistryRecord {
  customerRootTenantId: string
  schemaName: string
  status: string
  migrationVersion: string | null
  updatedAt?: Date
}

export interface DataPlaneMigrationPorts {
  tenants: { getCustomerRoot(customerRootTenantId: string): Promise<{ type: string; status: string } | null> }
  registry: {
    get(customerRootTenantId: string): Promise<DataPlaneRegistryRecord | null>
    /** Advances only the version, and only if it still equals `expected`; the status is never changed. */
    compareAndSetVersion(customerRootTenantId: string, expected: string, next: string): Promise<boolean>
  }
  physical: RegistryPhysicalSchemaProbe
  lock: {
    tryAcquire(key: string): Promise<boolean>
    release(key: string): Promise<void>
  }
  ledger: {
    findApplied(customerRootTenantId: string, version: string): Promise<{ checksum: string } | null>
    /** Unique per (customerRootTenantId, version). */
    recordApplied(entry: { customerRootTenantId: string; version: string; checksum: string; runId: string }): Promise<void>
  }
  executor: {
    /** Runs one migration inside the given schema only; must be transactional per migration. */
    apply(input: { schema: PgSchema; schemaName: string; migration: DataPlaneMigrationDefinition }): Promise<void>
  }
}

export type DataPlaneBlockedReason =
  | Exclude<RegistryDiagnosticStatus, 'HEALTHY'>
  | 'TENANT_NOT_ACTIVE_ROOT'
  | 'SCHEMA_ROOT_MISMATCH'
  | 'INVALID_MIGRATION_CHAIN'
  | 'CHECKSUM_MISMATCH'
  | 'CONCURRENT_RUN'

export type DataPlaneMigrationOutcome =
  | { status: 'REJECTED'; reason: 'INVALID_REQUEST'; invalidFields: string[] }
  | { status: 'BLOCKED'; customerRootTenantId: string; reason: DataPlaneBlockedReason; detail?: string }
  | { status: 'NOOP'; customerRootTenantId: string; version: string }
  | { status: 'DRY_RUN'; customerRootTenantId: string; fromVersion: string; toVersion: string; pending: string[] }
  | { status: 'APPLIED'; customerRootTenantId: string; fromVersion: string; toVersion: string; applied: string[]; skipped: string[] }
  | {
      status: 'FAILED'
      customerRootTenantId: string
      category: 'MIGRATION_EXECUTION_ERROR' | 'VERSION_CONFLICT'
      failedVersion: string
      applied: string[]
    }

/** Advisory-lock key per customer root; a different namespace from the control-plane migration lock. */
export const DATA_PLANE_LOCK_PREFIX = 'metnex:data-plane-migration:'

export function dataPlaneMigrationLockKey(customerRootTenantId: string): string {
  return `${DATA_PLANE_LOCK_PREFIX}${customerRootTenantId}`
}
