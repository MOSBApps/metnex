import { ConflictException } from '@nestjs/common'
import { customerSchemaRegistry } from '../db/schema'

export type RegistryStatus = (typeof customerSchemaRegistry.status.enumValues)[number]

export const REGISTRY_STATUSES: readonly RegistryStatus[] = customerSchemaRegistry.status.enumValues

export const REGISTRY_ERROR_CODES = {
  SCHEMA_ARCHIVED: 'SCHEMA_ARCHIVED',
  REGISTRY_STATUS_UNKNOWN: 'REGISTRY_STATUS_UNKNOWN',
  REGISTRY_STATE_CONFLICT: 'REGISTRY_STATE_CONFLICT',
} as const

export type RegistryErrorCode = (typeof REGISTRY_ERROR_CODES)[keyof typeof REGISTRY_ERROR_CODES]

/** Static, non-sensitive messages only: never a schema name, tenant detail, or database text. */
export class RegistryStateError extends ConflictException {
  constructor(readonly code: RegistryErrorCode, message: string) {
    super({ code, message })
  }
}

export function isKnownRegistryStatus(value: unknown): value is RegistryStatus {
  return typeof value === 'string' && (REGISTRY_STATUSES as readonly string[]).includes(value)
}

export function assertKnownRegistryStatus(value: unknown): asserts value is RegistryStatus {
  if (!isKnownRegistryStatus(value)) {
    throw new RegistryStateError(REGISTRY_ERROR_CODES.REGISTRY_STATUS_UNKNOWN, 'Registry status is not recognised')
  }
}

// Only the transitions provisioning itself performs. ACTIVE and ARCHIVED have no outgoing edge
// here: nothing in this service may promote, demote, or reactivate them.
const ALLOWED_TRANSITIONS: Readonly<Record<'NONE' | RegistryStatus, readonly RegistryStatus[]>> = {
  NONE: ['PROVISIONING'],
  PROVISIONING: ['PROVISIONING', 'ACTIVE', 'FAILED'],
  FAILED: ['PROVISIONING'],
  ACTIVE: [],
  ARCHIVED: [],
}

export function assertRegistryTransition(from: RegistryStatus | null, to: RegistryStatus): void {
  if (from !== null) assertKnownRegistryStatus(from)
  assertKnownRegistryStatus(to)
  if (!ALLOWED_TRANSITIONS[from ?? 'NONE'].includes(to)) {
    throw new RegistryStateError(REGISTRY_ERROR_CODES.REGISTRY_STATE_CONFLICT, 'Registry status transition is not allowed')
  }
}
