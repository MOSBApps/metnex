import { Global, Module } from '@nestjs/common'
import { DbService } from './db.service'
import type { Db } from './db.service'

export type { Db }

/** Injection token for the raw Drizzle instance (`Db`) — use when a service only needs query
 * access. Inject `DbService` directly when `.transaction()` or the raw pool is needed too. */
export const DB = Symbol('DB')

@Global()
@Module({
  providers: [DbService, { provide: DB, useFactory: (dbService: DbService) => dbService.db, inject: [DbService] }],
  exports: [DbService, DB],
})
export class DbModule {}
