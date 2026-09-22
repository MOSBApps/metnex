import { DATA_PLANE_SCHEMA_VERSION } from '../tenant-scope/tenant-scope.constants'

/** The version stamped on a freshly provisioned customer-root schema: the schema exists, no domain objects yet. */
export const DATA_PLANE_BASE_VERSION = DATA_PLANE_SCHEMA_VERSION

const VERSION_FORMAT = /^(\d{4})_[a-z][a-z0-9_]{0,48}$/
const CHECKSUM_FORMAT = /^[0-9a-f]{64}$/

/** One data-plane migration, supplied by the caller (there is deliberately no built-in list yet). */
export interface DataPlaneMigrationDefinition {
  /** `NNNN_name`, strictly increasing along the chain. */
  version: string
  /** sha256 (hex) of the migration content; a changed checksum for an applied version is never re-applied. */
  checksum: string
}

export function isDataPlaneVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION_FORMAT.test(value)
}

export function dataPlaneVersionSequence(version: string): number {
  const match = VERSION_FORMAT.exec(version)
  if (!match) throw new Error('Invalid data-plane version')
  return Number(match[1])
}

export function compareDataPlaneVersions(left: string, right: string): number {
  return dataPlaneVersionSequence(left) - dataPlaneVersionSequence(right)
}

/** Returns human-readable problems (never values); an empty list means the chain is valid. */
export function validateMigrationChain(chain: readonly DataPlaneMigrationDefinition[]): string[] {
  const problems: string[] = []
  let previous = dataPlaneVersionSequence(DATA_PLANE_BASE_VERSION)
  chain.forEach((migration, index) => {
    if (!migration || !isDataPlaneVersion(migration.version)) {
      problems.push(`migration[${index}] has an invalid version`)
      return
    }
    if (typeof migration.checksum !== 'string' || !CHECKSUM_FORMAT.test(migration.checksum)) {
      problems.push(`migration[${index}] has an invalid checksum`)
    }
    const sequence = dataPlaneVersionSequence(migration.version)
    if (sequence <= previous) problems.push(`migration[${index}] is not strictly after the previous version`)
    previous = sequence
  })
  return problems
}

export type PendingResult =
  | { status: 'OK'; fromVersion: string; toVersion: string; pending: DataPlaneMigrationDefinition[] }
  | { status: 'VERSION_NOT_IN_CHAIN' }

/** The registry version must be the base version or a version in the chain; everything after it is pending. */
export function pendingMigrations(registryVersion: string, chain: readonly DataPlaneMigrationDefinition[]): PendingResult {
  const head = chain.length > 0 ? (chain[chain.length - 1] as DataPlaneMigrationDefinition).version : DATA_PLANE_BASE_VERSION
  if (registryVersion === DATA_PLANE_BASE_VERSION) {
    return { status: 'OK', fromVersion: registryVersion, toVersion: head, pending: [...chain] }
  }
  const index = chain.findIndex(migration => migration.version === registryVersion)
  if (index === -1) return { status: 'VERSION_NOT_IN_CHAIN' }
  return { status: 'OK', fromVersion: registryVersion, toVersion: head, pending: chain.slice(index + 1) }
}
