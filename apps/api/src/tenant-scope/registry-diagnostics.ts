import { isKnownRegistryStatus, type RegistryStatus } from './registry-state'
import { isSafeSchemaIdentifier } from './schema-name.util'

/**
 * Read-only diagnostic contract for registry state versus the physical schema. Nothing here
 * connects to a database, creates a schema, changes a registry row, or decides a timeout: the
 * physical observation and any staleness threshold are supplied by the caller. A diagnostic
 * result never grants access except HEALTHY, and it never triggers a repair.
 */
export type RegistryDiagnosticStatus =
  | 'HEALTHY'
  | 'PROVISIONING'
  | 'FAILED'
  | 'ARCHIVED'
  | 'SCHEMA_MISSING'
  | 'REGISTRY_INCONSISTENT'
  | 'REGISTRY_MISSING'
  | 'VERSION_GATE_BLOCKER'

export type PhysicalSchemaObservation = 'EXISTS' | 'MISSING' | 'UNKNOWN'

/** Interface only. A future read-only implementation reports whether a schema exists. */
export interface RegistryPhysicalSchemaProbe {
  observeSchema(schemaName: string): Promise<PhysicalSchemaObservation>
}

export interface RegistryDiagnosticInput {
  registry: {
    status: string
    schemaName: string
    migrationVersion: string | null
    updatedAt?: Date
  } | null
  physicalSchema: PhysicalSchemaObservation
  /** Version the running application requires; when omitted no version comparison is made. */
  expectedVersion?: string | null
  /** Staleness is only reported when the caller supplies the threshold; there is no default. */
  staleness?: { now: Date; thresholdMs: number }
}

export interface RegistryDiagnostic {
  status: RegistryDiagnosticStatus
  reasonCode: string
  /** True only for HEALTHY. */
  accessible: boolean
  /** Set only for PROVISIONING when a caller-supplied threshold was exceeded. */
  stale?: boolean
}

const result = (status: RegistryDiagnosticStatus, reasonCode: string, extra: Partial<RegistryDiagnostic> = {}): RegistryDiagnostic => ({
  status,
  reasonCode,
  accessible: status === 'HEALTHY',
  ...extra,
})

export function diagnoseRegistryState(input: RegistryDiagnosticInput): RegistryDiagnostic {
  const { registry, physicalSchema } = input
  if (!registry) return result('REGISTRY_MISSING', 'REGISTRY_ROW_ABSENT')
  if (!isKnownRegistryStatus(registry.status)) return result('REGISTRY_INCONSISTENT', 'STATUS_UNKNOWN')
  if (!isSafeSchemaIdentifier(registry.schemaName)) return result('REGISTRY_INCONSISTENT', 'SCHEMA_NAME_INVALID')

  const status: RegistryStatus = registry.status
  switch (status) {
    case 'ARCHIVED':
      return result('ARCHIVED', physicalSchema === 'EXISTS' ? 'ARCHIVED_SCHEMA_PRESENT_NO_REACTIVATION' : 'ARCHIVED')
    case 'FAILED':
      return result('FAILED', physicalSchema === 'EXISTS' ? 'FAILED_SCHEMA_PRESENT_NO_AUTO_ACTIVE' : 'FAILED')
    case 'PROVISIONING': {
      const { staleness } = input
      const stale =
        staleness && registry.updatedAt ? staleness.now.getTime() - registry.updatedAt.getTime() > staleness.thresholdMs : undefined
      return result('PROVISIONING', physicalSchema === 'EXISTS' ? 'PROVISIONING_SCHEMA_PRESENT_STATUS_UNCHANGED' : 'PROVISIONING', {
        ...(stale === undefined ? {} : { stale }),
      })
    }
    case 'ACTIVE': {
      if (physicalSchema === 'MISSING') return result('SCHEMA_MISSING', 'ACTIVE_BUT_PHYSICAL_SCHEMA_ABSENT')
      if (physicalSchema === 'UNKNOWN') return result('REGISTRY_INCONSISTENT', 'PHYSICAL_STATE_UNKNOWN')
      if (!registry.migrationVersion?.trim()) return result('VERSION_GATE_BLOCKER', 'VERSION_UNKNOWN')
      if (input.expectedVersion != null && registry.migrationVersion !== input.expectedVersion) {
        return result('VERSION_GATE_BLOCKER', 'VERSION_MISMATCH')
      }
      return result('HEALTHY', 'OK')
    }
  }
}
