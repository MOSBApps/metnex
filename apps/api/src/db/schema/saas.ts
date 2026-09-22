import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { generateId } from '../id'
import { subscriptionStatusEnum } from './enums'
import { tenants } from './platform'

export const resourcePackages = pgTable(
  'resource_packages',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    maxChildTenantCount: integer('maxChildTenantCount').notNull(),
    maxUserCount: integer('maxUserCount').notNull(),
    maxStorageMb: integer('maxStorageMb').notNull(),
    maxDatabaseMb: integer('maxDatabaseMb').notNull(),
    isActive: boolean('isActive').notNull().default(true),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  t => [uniqueIndex('resource_packages_code_key').on(t.code)],
)

export const customerSubscriptions = pgTable(
  'customer_subscriptions',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    customerRootTenantId: text('customerRootTenantId')
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    resourcePackageId: text('resourcePackageId')
      .notNull()
      .references(() => resourcePackages.id, { onDelete: 'restrict' }),
    status: subscriptionStatusEnum('status').notNull().default('ACTIVE'),
    startsAt: timestamp('startsAt', { precision: 3 }).notNull().defaultNow(),
    endsAt: timestamp('endsAt', { precision: 3 }),
    purchasedAt: timestamp('purchasedAt', { precision: 3 }).notNull().defaultNow(),
    externalReference: text('externalReference'),
    notes: text('notes'),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  t => [index('customer_subscriptions_resourcePackageId_status_idx').on(t.resourcePackageId, t.status)],
)
