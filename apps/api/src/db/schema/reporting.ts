import { boolean, index, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { generateId } from '../id'

export const reportArtifacts = pgTable(
  'report_artifacts',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    code: text('code').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    moduleKey: text('moduleKey').notNull(),
    viewMode: varchar('viewMode', { length: 24 }).notNull(),
    defaultPreviewFormat: varchar('defaultPreviewFormat', { length: 12 }).notNull().default('HTML'),
    primaryOutputFormat: varchar('primaryOutputFormat', { length: 12 }),
    supportedOutputFormats: text('supportedOutputFormats').array().notNull().default([]),
    printStrategy: varchar('printStrategy', { length: 32 }).notNull().default('NONE'),
    templatePath: text('templatePath'),
    isActive: boolean('isActive').notNull().default(true),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  t => [
    uniqueIndex('report_artifacts_code_key').on(t.code),
    index('report_artifacts_moduleKey_isActive_idx').on(t.moduleKey, t.isActive),
  ],
)
