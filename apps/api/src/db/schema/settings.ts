import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { generateId } from '../id'
import { tenants } from './platform'

export const platformGeneralSettings = pgTable('platform_general_settings', {
  id: text('id').primaryKey().$defaultFn(generateId),
  name: text('name').notNull(),
  shortName: text('shortName'),
  address: text('address'),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const platformSmtpSettings = pgTable('platform_smtp_settings', {
  id: text('id').primaryKey().$defaultFn(generateId),
  notificationsEnabled: boolean('notificationsEnabled').notNull().default(false),
  host: text('host'),
  port: integer('port'),
  secure: boolean('secure').notNull().default(false),
  username: text('username'),
  passwordCiphertext: text('passwordCiphertext'),
  fromName: text('fromName'),
  fromEmail: text('fromEmail'),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const platformAiProviderSettings = pgTable('platform_ai_provider_settings', {
  id: text('id').primaryKey().$defaultFn(generateId),
  providerType: text('providerType').notNull().default('OPENAI'),
  endpoint: text('endpoint'),
  defaultModel: text('defaultModel'),
  apiKeyCiphertext: text('apiKeyCiphertext'),
  isActive: boolean('isActive').notNull().default(false),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const tenantSmtpOverrides = pgTable('tenant_smtp_overrides', {
  tenantId: text('tenantId')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  notificationsEnabled: boolean('notificationsEnabled').notNull().default(false),
  host: text('host'),
  port: integer('port'),
  secure: boolean('secure').notNull().default(false),
  username: text('username'),
  passwordCiphertext: text('passwordCiphertext'),
  fromName: text('fromName'),
  fromEmail: text('fromEmail'),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const tenantAiProviderOverrides = pgTable('tenant_ai_provider_overrides', {
  tenantId: text('tenantId')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  providerType: text('providerType').notNull().default('OPENAI'),
  endpoint: text('endpoint'),
  defaultModel: text('defaultModel'),
  apiKeyCiphertext: text('apiKeyCiphertext'),
  isActive: boolean('isActive').notNull().default(false),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
