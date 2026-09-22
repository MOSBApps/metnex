import { AsyncLocalStorage } from 'async_hooks'

export interface QueryRecord {
  durationMs: number
  model: string | undefined
  operation: string | undefined
  queryText: string | undefined
  queryHash: string | undefined
}

export interface QueryCollector {
  queries: QueryRecord[]
}

export const perfRequestStorage = new AsyncLocalStorage<QueryCollector>()
