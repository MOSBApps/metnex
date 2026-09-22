import { Inject, Injectable, Logger } from '@nestjs/common'
import { assertRow } from '../db/assert-row'
import { DB, type Db } from '../db/db.module'
import { performanceRequestLogs, performanceRequestQueryLogs } from '../db/schema'
import type { QueryCollector } from './perf-request-context'

export interface PersistSlowRequestArgs {
  requestId: string
  method: string
  route: string
  statusCode: number
  durationMs: number
  userId?: string
  tenantId?: string
  collector: QueryCollector | null
}

@Injectable()
export class PerfRequestLogService {
  private readonly logger = new Logger(PerfRequestLogService.name)

  constructor(@Inject(DB) private readonly db: Db) {}

  async persist(args: PersistSlowRequestArgs): Promise<void> {
    const queries = args.collector?.queries ?? []
    const queryCount = args.collector !== null ? queries.length : null
    const dbTotalMs = queries.length > 0 ? queries.reduce((sum, query) => sum + query.durationMs, 0) : null
    const maxQueryMs = queries.length > 0 ? Math.max(...queries.map(query => query.durationMs)) : null

    try {
      const log = assertRow(
        await this.db
          .insert(performanceRequestLogs)
          .values({
            requestId: args.requestId,
            method: args.method,
            route: args.route,
            statusCode: args.statusCode,
            durationMs: args.durationMs,
            userId: args.userId ?? null,
            tenantId: args.tenantId ?? null,
            queryCount,
            dbTotalMs,
            maxQueryMs,
          })
          .returning(),
      )

      if (queries.length > 0) {
        await this.db.insert(performanceRequestQueryLogs).values(
          queries.map(query => ({
            requestLogId: log.id,
            queryHash: query.queryHash ?? null,
            durationMs: query.durationMs,
            model: query.model ?? null,
            operation: query.operation ?? null,
            queryText: query.queryText ?? null,
          })),
        )
      }
    } catch (error) {
      const detail = error instanceof Error ? error.stack ?? error.message : String(error)
      this.logger.error('Slow request log persistence failed', detail)
    }
  }
}
