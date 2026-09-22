import { diagnoseRegistryState } from '../tenant-scope/registry-diagnostics'
import { isCustomerSchemaName, schemaNameMatchesCustomerRoot } from '../tenant-scope/schema-name.util'
import type {
  DataPlaneBlockedReason,
  DataPlaneMigrationOutcome,
  DataPlaneMigrationPorts,
  DataPlaneMigrationRequest,
  DataPlaneRegistryRecord,
} from './data-plane-migration.contract'
import { dataPlaneMigrationLockKey } from './data-plane-migration.contract'
import { createDataPlaneSchema } from './data-plane-schema'
import { pendingMigrations, validateMigrationChain, type DataPlaneMigrationDefinition } from './data-plane-version'

// Tenant ids are generated UUIDs (generateId); anything else — a name, a wildcard, an ambiguous keyword — is not a scope.
const ROOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RUN_ID = /^[A-Za-z0-9_.:-]{1,128}$/
const REQUEST_KEYS = ['customerRootTenantId', 'mode', 'runId']

type Parsed = { ok: true; value: DataPlaneMigrationRequest } | { ok: false; fields: string[] }

// Strict on purpose: no defaults, no wildcard, no extra keys — so no caller identity or role can be smuggled in.
function parseRequest(raw: unknown): Parsed {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, fields: ['request'] }
  const record = raw as Record<string, unknown>
  const fields = Object.keys(record).filter(key => !REQUEST_KEYS.includes(key))
  if (typeof record.customerRootTenantId !== 'string' || !ROOT_ID.test(record.customerRootTenantId)) fields.push('customerRootTenantId')
  if (record.mode !== 'DRY_RUN' && record.mode !== 'APPLY') fields.push('mode')
  if (typeof record.runId !== 'string' || !RUN_ID.test(record.runId)) fields.push('runId')
  if (fields.length > 0) return { ok: false, fields }
  return { ok: true, value: { customerRootTenantId: record.customerRootTenantId as string, mode: record.mode as 'DRY_RUN' | 'APPLY', runId: record.runId as string } }
}

const blocked = (customerRootTenantId: string, reason: DataPlaneBlockedReason, detail?: string): DataPlaneMigrationOutcome => ({
  status: 'BLOCKED',
  customerRootTenantId,
  reason,
  ...(detail ? { detail } : {}),
})

type Admission =
  | { ok: false; outcome: DataPlaneMigrationOutcome }
  | { ok: true; registry: DataPlaneRegistryRecord & { migrationVersion: string }; fromVersion: string; toVersion: string; pending: DataPlaneMigrationDefinition[] }

// Reads only. Every gate fails closed; nothing here changes state.
async function admit(root: string, chain: readonly DataPlaneMigrationDefinition[], ports: DataPlaneMigrationPorts): Promise<Admission> {
  const tenant = await ports.tenants.getCustomerRoot(root)
  if (!tenant || tenant.type !== 'ROOT' || tenant.status !== 'ACTIVE') return { ok: false, outcome: blocked(root, 'TENANT_NOT_ACTIVE_ROOT') }

  const registry = await ports.registry.get(root)
  if (registry && registry.customerRootTenantId !== root) return { ok: false, outcome: blocked(root, 'REGISTRY_INCONSISTENT', 'SCHEMA_ROOT_MISMATCH') }
  if (registry && !isCustomerSchemaName(registry.schemaName)) return { ok: false, outcome: blocked(root, 'REGISTRY_INCONSISTENT', 'SCHEMA_NAME_INVALID') }

  const physicalSchema = registry ? await ports.physical.observeSchema(registry.schemaName) : 'UNKNOWN'
  const diagnostic = diagnoseRegistryState({ registry, physicalSchema })
  if (diagnostic.status !== 'HEALTHY' || !registry) {
    return { ok: false, outcome: blocked(root, diagnostic.status === 'HEALTHY' ? 'REGISTRY_MISSING' : diagnostic.status, diagnostic.reasonCode) }
  }
  if (!schemaNameMatchesCustomerRoot(registry.schemaName, root)) return { ok: false, outcome: blocked(root, 'SCHEMA_ROOT_MISMATCH') }

  const version = registry.migrationVersion as string
  const plan = pendingMigrations(version, chain)
  if (plan.status !== 'OK') return { ok: false, outcome: blocked(root, 'VERSION_GATE_BLOCKER', 'VERSION_NOT_IN_CHAIN') }
  return { ok: true, registry: { ...registry, migrationVersion: version }, fromVersion: plan.fromVersion, toVersion: plan.toVersion, pending: plan.pending }
}

/**
 * Port-driven core of the data-plane migration contract. It is not wired to anything: no module,
 * provider, controller, startup hook, CLI or pipeline calls it, and no real port exists. It changes
 * a registry status never; DRY_RUN performs no write at all.
 */
export async function runDataPlaneMigration(
  rawRequest: unknown,
  chain: readonly DataPlaneMigrationDefinition[],
  ports: DataPlaneMigrationPorts,
): Promise<DataPlaneMigrationOutcome> {
  const parsed = parseRequest(rawRequest)
  if (!parsed.ok) return { status: 'REJECTED', reason: 'INVALID_REQUEST', invalidFields: parsed.fields }
  const { customerRootTenantId: root, mode, runId } = parsed.value

  if (validateMigrationChain(chain).length > 0) return blocked(root, 'INVALID_MIGRATION_CHAIN')

  const first = await admit(root, chain, ports)
  if (!first.ok) return first.outcome
  if (first.pending.length === 0) return { status: 'NOOP', customerRootTenantId: root, version: first.fromVersion }
  if (mode === 'DRY_RUN') {
    return { status: 'DRY_RUN', customerRootTenantId: root, fromVersion: first.fromVersion, toVersion: first.toVersion, pending: first.pending.map(m => m.version) }
  }

  const lockKey = dataPlaneMigrationLockKey(root)
  if (!(await ports.lock.tryAcquire(lockKey))) return blocked(root, 'CONCURRENT_RUN')
  try {
    // State may have changed between the first read and the lock: decide again from fresh reads.
    const admission = await admit(root, chain, ports)
    if (!admission.ok) return admission.outcome
    if (admission.pending.length === 0) return { status: 'NOOP', customerRootTenantId: root, version: admission.fromVersion }

    for (const migration of admission.pending) {
      const recorded = await ports.ledger.findApplied(root, migration.version)
      if (recorded && recorded.checksum !== migration.checksum) return blocked(root, 'CHECKSUM_MISMATCH', migration.version)
    }

    const applied: string[] = []
    const skipped: string[] = []
    let current = admission.fromVersion
    for (const migration of admission.pending) {
      const recorded = await ports.ledger.findApplied(root, migration.version)
      if (recorded) {
        skipped.push(migration.version)
      } else {
        try {
          await ports.executor.apply({ schema: createDataPlaneSchema(admission.registry.schemaName), schemaName: admission.registry.schemaName, migration })
        } catch {
          return { status: 'FAILED', customerRootTenantId: root, category: 'MIGRATION_EXECUTION_ERROR', failedVersion: migration.version, applied }
        }
        await ports.ledger.recordApplied({ customerRootTenantId: root, version: migration.version, checksum: migration.checksum, runId })
        applied.push(migration.version)
      }
      if (!(await ports.registry.compareAndSetVersion(root, current, migration.version))) {
        return { status: 'FAILED', customerRootTenantId: root, category: 'VERSION_CONFLICT', failedVersion: migration.version, applied }
      }
      current = migration.version
    }
    return { status: 'APPLIED', customerRootTenantId: root, fromVersion: admission.fromVersion, toVersion: current, applied, skipped }
  } finally {
    await ports.lock.release(lockKey)
  }
}
