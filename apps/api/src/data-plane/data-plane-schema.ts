import { pgSchema, type PgSchema } from 'drizzle-orm/pg-core'
import { assertCustomerSchemaName, schemaNameMatchesCustomerRoot } from '../tenant-scope/schema-name.util'

/**
 * The only place in the codebase that may call pgSchema(). Data-plane objects are always addressed
 * as `<schema>.<table>` through this handle — never through search_path, and never by splicing a
 * name into SQL text.
 */
export function createDataPlaneSchema(schemaName: string): PgSchema {
  assertCustomerSchemaName(schemaName)
  return pgSchema(schemaName)
}

/**
 * Handle for an already-resolved scope (TenantScopeService.resolve output). Requires a scope object,
 * so no raw name from a request or user can reach it, and cross-checks that the schema really was
 * derived from that customer-root tenant.
 */
export function dataPlaneSchemaFor(scope: { customerRootTenantId: string; schemaName: string }): PgSchema {
  if (!schemaNameMatchesCustomerRoot(scope.schemaName, scope.customerRootTenantId)) {
    throw new Error('Schema does not belong to the customer root')
  }
  return createDataPlaneSchema(scope.schemaName)
}
