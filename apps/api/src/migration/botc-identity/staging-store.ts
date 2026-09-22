import type { BotcSourceEntityType, StagingRecord } from './types'

/**
 * In-memory simulation of the conceptual `migration_staging_identity` table
 * (docs/migration/METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md §4). No physical Drizzle
 * schema or migration exists for this table — Q-ID01 (schema placement + retention) is open, so
 * this store deliberately never touches PostgreSQL. It lives only for the duration of one process
 * run (or one test) and must be re-supplied by the caller across separate invocations to get
 * idempotent re-run behavior (see MigrationRunService).
 */
export class InMemoryStagingStore {
  private readonly recordsByKey = new Map<string, StagingRecord>()

  private key(sourceEntityType: BotcSourceEntityType, sourceLegacyId: string): string {
    return `${sourceEntityType}:${sourceLegacyId}`
  }

  findByLegacy(sourceEntityType: BotcSourceEntityType, sourceLegacyId: string): StagingRecord | undefined {
    return this.recordsByKey.get(this.key(sourceEntityType, sourceLegacyId))
  }

  upsert(record: StagingRecord): void {
    this.recordsByKey.set(this.key(record.sourceEntityType, record.sourceLegacyId), record)
  }

  all(): StagingRecord[] {
    return [...this.recordsByKey.values()]
  }

  /** Snapshot for cross-run persistence in tests (idempotent re-run simulation). */
  clone(): InMemoryStagingStore {
    const copy = new InMemoryStagingStore()
    for (const record of this.all()) copy.upsert({ ...record })
    return copy
  }

  /** Replaces this store's contents with another's — used to commit a dry-run-computed clone. */
  restoreFrom(other: InMemoryStagingStore): void {
    this.recordsByKey.clear()
    for (const record of other.all()) this.upsert({ ...record })
  }
}
