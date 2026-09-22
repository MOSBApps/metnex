import { BadRequestException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'
import { DB, type Db } from '../db/db.module'
import { DbService } from '../db/db.service'
import { customerSchemaRegistry, tenants } from '../db/schema'
import {
  assertKnownRegistryStatus,
  assertRegistryTransition,
  REGISTRY_ERROR_CODES,
  RegistryStateError,
} from './registry-state'
import { generateCustomerSchemaName, isSafeSchemaIdentifier, quoteIdentifier } from './schema-name.util'
import { DATA_PLANE_SCHEMA_VERSION } from './tenant-scope.constants'

export type CustomerSchemaRegistryRow = typeof customerSchemaRegistry.$inferSelect

// Database error text can carry identifiers and connection detail; keep only the class and SQLSTATE.
function describeProvisioningFailure(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error: schema provisioning failed'
  const code = (error as { code?: unknown }).code
  return `${error.name}${typeof code === 'string' ? ` [${code}]` : ''}: schema provisioning failed`
}

@Injectable()
export class CustomerSchemaRegistryService {
  private readonly logger = new Logger(CustomerSchemaRegistryService.name)

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly dbService: DbService,
  ) {}

  /**
   * Explicit provisioning call for a customer ROOT (never PLATFORM_ROOT or STANDARD): a missing row
   * is created, an ACTIVE row is a no-op, and a PROVISIONING or FAILED row is driven again
   * idempotently. An ARCHIVED row is refused (SCHEMA_ARCHIVED) with no DDL and no write — nothing
   * here can reactivate it. Every status change is guarded by the status it expects, so a row that
   * changed underneath this call is never overwritten with ACTIVE.
   */
  async ensureSchemaProvisioned(customerRootTenantId: string, slug: string): Promise<CustomerSchemaRegistryRow> {
    const [tenant] = await this.db
      .select({ id: tenants.id, type: tenants.type })
      .from(tenants)
      .where(eq(tenants.id, customerRootTenantId))
      .limit(1)
    if (!tenant) throw new NotFoundException('Customer root tenant bulunamadı')
    if (tenant.type !== 'ROOT') {
      throw new BadRequestException('Schema yalnızca customer ROOT tenant için provision edilebilir')
    }

    const [existing] = await this.db
      .select()
      .from(customerSchemaRegistry)
      .where(eq(customerSchemaRegistry.customerRootTenantId, customerRootTenantId))
      .limit(1)
    if (existing) {
      assertKnownRegistryStatus(existing.status)
      if (existing.status === 'ACTIVE') return existing
      if (existing.status === 'ARCHIVED') {
        throw new RegistryStateError(REGISTRY_ERROR_CODES.SCHEMA_ARCHIVED, 'Schema is archived and cannot be provisioned')
      }
    }
    assertRegistryTransition(existing?.status ?? null, 'PROVISIONING')

    const schemaName = existing?.schemaName ?? generateCustomerSchemaName(customerRootTenantId, slug)
    if (!isSafeSchemaIdentifier(schemaName)) {
      // Unreachable in practice; fail before any name reaches raw DDL, without echoing it.
      throw new Error('Generated schema name failed safety validation')
    }

    // Claim the row for provisioning only if it is absent, PROVISIONING or FAILED. If it was
    // archived or activated concurrently, nothing is returned and no DDL runs.
    const [claimed] = await this.db
      .insert(customerSchemaRegistry)
      .values({
        customerRootTenantId,
        schemaName,
        migrationVersion: DATA_PLANE_SCHEMA_VERSION,
        status: 'PROVISIONING',
      })
      .onConflictDoUpdate({
        target: customerSchemaRegistry.customerRootTenantId,
        set: { status: 'PROVISIONING', lastError: null },
        setWhere: inArray(customerSchemaRegistry.status, ['PROVISIONING', 'FAILED']),
      })
      .returning()
    if (!claimed) {
      throw new RegistryStateError(REGISTRY_ERROR_CODES.REGISTRY_STATE_CONFLICT, 'Registry status changed during provisioning')
    }

    try {
      await this.dbService.pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)}`)
      assertRegistryTransition('PROVISIONING', 'ACTIVE')
      const [updated] = await this.db
        .update(customerSchemaRegistry)
        .set({ status: 'ACTIVE', lastError: null, migrationVersion: DATA_PLANE_SCHEMA_VERSION })
        .where(and(eq(customerSchemaRegistry.customerRootTenantId, customerRootTenantId), eq(customerSchemaRegistry.status, 'PROVISIONING')))
        .returning()
      if (!updated) {
        throw new RegistryStateError(REGISTRY_ERROR_CODES.REGISTRY_STATE_CONFLICT, 'Registry status changed during provisioning')
      }
      return updated
    } catch (error) {
      if (error instanceof RegistryStateError) throw error
      const failure = describeProvisioningFailure(error)
      assertRegistryTransition('PROVISIONING', 'FAILED')
      await this.db
        .update(customerSchemaRegistry)
        .set({ status: 'FAILED', lastError: failure })
        .where(and(eq(customerSchemaRegistry.customerRootTenantId, customerRootTenantId), eq(customerSchemaRegistry.status, 'PROVISIONING')))
      this.logger.error(`Customer schema provisioning failed for tenant ${customerRootTenantId}: ${failure}`)
      throw new InternalServerErrorException({ code: 'SCHEMA_PROVISIONING_FAILED', message: 'Customer schema provisioning failed' })
    }
  }

  /** Returns the registry row only when its status is exactly ACTIVE; every other status, including unknown values, is not accessible. */
  async getActiveRegistry(customerRootTenantId: string): Promise<CustomerSchemaRegistryRow | null> {
    const [registry] = await this.db
      .select()
      .from(customerSchemaRegistry)
      .where(eq(customerSchemaRegistry.customerRootTenantId, customerRootTenantId))
      .limit(1)
    return registry?.status === 'ACTIVE' ? registry : null
  }
}
