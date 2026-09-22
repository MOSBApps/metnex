import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { createHash } from 'crypto'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool, type QueryResult, type QueryResultRow } from 'pg'
import { perfRequestStorage } from '../perf/perf-request-context'
import { requireDatabaseUrl } from './database-url'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema>

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool
  readonly db: Db

  constructor() {
    this.pool = new Pool({ connectionString: requireDatabaseUrl() })
    this.instrumentPoolForPerfCapture()
    this.db = drizzle(this.pool, { schema })
  }

  /**
   * Mirrors the previous PrismaService `$on('query', ...)` hook: captures every raw SQL
   * statement's duration for the active request (see perf-request-context), scrubbed of
   * literal values before it's ever persisted.
   */
  private instrumentPoolForPerfCapture() {
    const originalQuery = this.pool.query.bind(this.pool) as (...args: unknown[]) => Promise<QueryResult<QueryResultRow>>

    this.pool.query = (async (...args: unknown[]) => {
      const start = Date.now()
      const result = await originalQuery(...args)
      const durationMs = Date.now() - start

      const collector = perfRequestStorage.getStore()
      if (collector) {
        const first = args[0]
        const rawText = typeof first === 'string' ? first : (first as { text?: string })?.text
        if (rawText) {
          const scrubbed = rawText
            .replace(/'[^']*'/g, '?')
            .replace(/\$\d+/g, '?')
            .replace(/\d+(\.\d+)?/g, '?')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 1000)
          const queryHash = createHash('sha256').update(scrubbed.slice(0, 500)).digest('hex').slice(0, 16)
          collector.queries.push({ durationMs, model: undefined, operation: undefined, queryText: scrubbed, queryHash })
        }
      }

      return result
    }) as typeof this.pool.query
  }

  async onModuleInit() {
    await this.pool.query('SELECT 1')
  }

  async onModuleDestroy() {
    await this.pool.end()
  }

  /** Executes fn inside a single Drizzle/pg transaction. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction(fn)
  }
}
