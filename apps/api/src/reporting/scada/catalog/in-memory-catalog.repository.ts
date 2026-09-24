import { CatalogError } from './catalog-rules'
import type { CatalogRepository, CatalogTransaction } from './catalog.ports'
import type { CatalogSource } from './catalog.types'

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  }
  return value
}

const snapshotOf = (source: CatalogSource): CatalogSource => deepFreeze(structuredClone(source))

/**
 * In-memory catalog repository — the mock/in-memory contract implementation for TASK-027.63.
 * NOT a production provider and NOT registered in any Nest module. Stored versions are immutable
 * (frozen copies); transactions are serialised and atomic (rollback on throw).
 */
export class InMemoryCatalogRepository implements CatalogRepository {
  private store = new Map<string, CatalogSource[]>()
  private queue: Promise<unknown> = Promise.resolve()

  async withTransaction<T>(work: (tx: CatalogTransaction) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const backup = new Map([...this.store].map(([id, versions]) => [id, [...versions]]))
      try {
        return await work({
          get: async id => this.latest(id),
          saveVersion: async snapshot => {
            const versions = this.store.get(snapshot.id) ?? []
            const current = versions[versions.length - 1]
            if (snapshot.version !== (current ? current.version + 1 : 1)) throw new CatalogError('VERSION_CONFLICT')
            this.store.set(snapshot.id, [...versions, snapshotOf(snapshot)])
          },
        })
      } catch (error) {
        this.store = backup
        throw error
      }
    }
    const result = this.queue.then(run, run)
    this.queue = result.catch(() => undefined)
    return result
  }

  async get(id: string): Promise<CatalogSource | null> {
    return this.latest(id)
  }

  async list(): Promise<CatalogSource[]> {
    return [...this.store.keys()].map(id => this.latest(id)).filter((s): s is CatalogSource => s !== null)
  }

  async history(id: string): Promise<CatalogSource[]> {
    return [...(this.store.get(id) ?? [])]
  }

  private latest(id: string): CatalogSource | null {
    const versions = this.store.get(id)
    return versions && versions.length > 0 ? versions[versions.length - 1]! : null
  }
}
