import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { generateId } from '../id'
import { tenants, users } from './platform'

export const platformAuditLogs = pgTable(
  'platform_audit_logs',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    actorId: text('actorId'),
    actorSnapshot: jsonb('actorSnapshot'),
    actionCode: text('actionCode').notNull(),
    entityType: text('entityType').notNull(),
    entityId: text('entityId'),
    summary: text('summary').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  },
  t => [
    index('platform_audit_logs_actionCode_idx').on(t.actionCode),
    index('platform_audit_logs_actorId_idx').on(t.actorId),
    index('platform_audit_logs_entityType_entityId_idx').on(t.entityType, t.entityId),
    index('platform_audit_logs_createdAt_idx').on(t.createdAt),
  ],
)

export const platformPerformanceSettings = pgTable(
  'platform_performance_settings',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    singletonKey: integer('singletonKey').notNull().default(1),
    slowRequestThresholdMs: integer('slowRequestThresholdMs').notNull().default(1000),
    dbTraceEnabled: boolean('dbTraceEnabled').notNull().default(false),
    updatedByUserId: text('updatedByUserId'),
    updatedAt: timestamp('updatedAt', { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  },
  t => [uniqueIndex('platform_performance_settings_singletonKey_key').on(t.singletonKey)],
)

export const performanceRequestLogs = pgTable(
  'performance_request_logs',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    requestId: text('requestId').notNull(),
    method: varchar('method', { length: 10 }).notNull(),
    route: varchar('route', { length: 500 }).notNull(),
    statusCode: integer('statusCode').notNull(),
    durationMs: integer('durationMs').notNull(),
    userId: text('userId').references(() => users.id, { onDelete: 'set null' }),
    tenantId: text('tenantId').references(() => tenants.id, { onDelete: 'set null' }),
    queryCount: integer('queryCount'),
    dbTotalMs: integer('dbTotalMs'),
    maxQueryMs: integer('maxQueryMs'),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  },
  t => [
    index('performance_request_logs_createdAt_idx').on(t.createdAt),
    index('performance_request_logs_route_createdAt_idx').on(t.route, t.createdAt),
    index('performance_request_logs_tenantId_createdAt_idx').on(t.tenantId, t.createdAt),
  ],
)

export const performanceRequestQueryLogs = pgTable(
  'performance_request_query_logs',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    requestLogId: text('requestLogId')
      .notNull()
      .references(() => performanceRequestLogs.id, { onDelete: 'cascade' }),
    queryHash: varchar('queryHash', { length: 64 }),
    durationMs: integer('durationMs').notNull(),
    model: varchar('model', { length: 100 }),
    operation: varchar('operation', { length: 50 }),
    queryText: varchar('queryText', { length: 1000 }),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  },
  t => [
    index('performance_request_query_logs_requestLogId_idx').on(t.requestLogId),
    index('performance_request_query_logs_durationMs_idx').on(t.durationMs),
  ],
)
