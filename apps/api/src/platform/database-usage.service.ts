import { Inject, Injectable, Logger } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { DB, type Db } from '../db/db.module'

export interface DatabaseUsageResult {
  mbUsed: number | null
  status: 'REAL' | 'APPROXIMATE' | 'UNSUPPORTED'
  message?: string
}

@Injectable()
export class DatabaseUsageService {
  private readonly logger = new Logger(DatabaseUsageService.name)

  constructor(@Inject(DB) private readonly db: Db) {}

  async getCustomerRootUsageMb(customerRootId: string): Promise<DatabaseUsageResult> {
    try {
      void customerRootId

      const result = await this.db.execute<{ total_bytes: string }>(
        sql`SELECT pg_database_size(current_database())::bigint AS total_bytes`,
      )

      const totalBytes = Number(result.rows[0]?.total_bytes ?? 0)
      const mbUsed = Number((totalBytes / (1024 * 1024)).toFixed(2))

      return {
        mbUsed,
        status: 'APPROXIMATE',
        message:
          'Customer-root scoped physical DB measurement is not supported in the current shared-schema architecture. Showing current database size snapshot instead.',
      }
    } catch (error) {
      this.logger.error(`DB usage ölçümü başarısız: ${error instanceof Error ? error.message : error}`)

      return {
        mbUsed: null,
        status: 'UNSUPPORTED',
        message: 'Veritabanı şema boyutu ölçülemedi.',
      }
    }
  }
}
