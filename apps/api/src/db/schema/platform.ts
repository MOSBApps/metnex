import { boolean, foreignKey, index, integer, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { generateId } from '../id'
import { tenantStatusEnum, tenantTypeEnum, userStatusEnum } from './enums'

export const tenants = pgTable(
  'tenants',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    name: text('name').notNull(),
    shortName: text('shortName'),
    slug: text('slug').notNull(),
    type: tenantTypeEnum('type').notNull().default('STANDARD'),
    status: tenantStatusEnum('status').notNull().default('ACTIVE'),
    parentId: text('parentId').references((): AnyPgColumn => tenants.id, { onDelete: 'set null' }),
    customerRootId: text('customerRootId').references((): AnyPgColumn => tenants.id, { onDelete: 'set null' }),
    canEnterData: boolean('canEnterData').notNull().default(true),
    canAggregateChildren: boolean('canAggregateChildren').notNull().default(false),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  t => [
    uniqueIndex('tenants_slug_key').on(t.slug),
    index('tenants_status_idx').on(t.status),
    index('tenants_type_idx').on(t.type),
    index('tenants_parentId_idx').on(t.parentId),
    index('tenants_customerRootId_idx').on(t.customerRootId),
  ],
)

export const tenantClosure = pgTable(
  'tenant_closure',
  {
    ancestorTenantId: text('ancestorTenantId')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    descendantTenantId: text('descendantTenantId')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerRootTenantId: text('customerRootTenantId').references(() => tenants.id, { onDelete: 'cascade' }),
    depth: integer('depth').notNull(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('tenant_closure_pkey').on(t.ancestorTenantId, t.descendantTenantId),
    index('tenant_closure_descendantTenantId_idx').on(t.descendantTenantId),
    index('tenant_closure_customerRootTenantId_idx').on(t.customerRootTenantId),
  ],
)

export const customerSchemaRegistry = pgTable('customer_schema_registry', {
  id: text('id').primaryKey().$defaultFn(generateId),
  customerRootTenantId: text('customerRootTenantId')
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  schemaName: text('schemaName').notNull().unique(),
  migrationVersion: text('migrationVersion').notNull(),
  status: text('status', { enum: ['PROVISIONING', 'ACTIVE', 'FAILED', 'ARCHIVED'] })
    .notNull()
    .default('PROVISIONING'),
  lastError: text('lastError'),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    email: text('email').notNull(),
    passwordHash: text('passwordHash').notNull(),
    displayName: text('displayName').notNull(),
    isSystemAdmin: boolean('isSystemAdmin').notNull().default(false),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  t => [uniqueIndex('users_email_key').on(t.email), index('users_email_status_idx').on(t.email, t.status)],
)

export const tenantMemberships = pgTable(
  'tenant_memberships',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    tenantId: text('tenantId')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    isActive: boolean('isActive').notNull().default(true),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  t => [
    uniqueIndex('tenant_memberships_tenantId_userId_key').on(t.tenantId, t.userId),
    index('tenant_memberships_userId_isActive_idx').on(t.userId, t.isActive),
  ],
)

export const tenantRoles = pgTable(
  'tenant_roles',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    tenantId: text('tenantId')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('isActive').notNull().default(true),
    requiresMfa: boolean('requiresMfa').notNull().default(false),
    // TASK-027.49 (Q-DP-tenant-role-delegation): marks a role as this tenant's "administrator"
    // role for the last-tenant-admin floor invariant — the last ACTIVE assignment of an
    // isAdminRole-flagged role in a tenant cannot be revoked (mirrors the last-system-admin
    // invariant, scoped to tenant roles instead of the SYSTEM_ADMIN system role).
    isAdminRole: boolean('isAdminRole').notNull().default(false),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  t => [
    uniqueIndex('tenant_roles_tenantId_name_key').on(t.tenantId, t.name),
    // Plain UNIQUE CONSTRAINT, not an index: composite FK targets (user_tenant_role_assignments
    // below) require a real unique CONSTRAINT to reference, not just a unique index — and
    // constraints get created before FK ALTER statements in migration ordering.
    unique('tenant_roles_id_tenantId_key').on(t.id, t.tenantId),
    index('tenant_roles_tenantId_idx').on(t.tenantId),
  ],
)

export const tenantRolePermissions = pgTable(
  'tenant_role_permissions',
  {
    roleId: text('roleId')
      .notNull()
      .references(() => tenantRoles.id, { onDelete: 'cascade' }),
    permissionCode: text('permissionCode').notNull(),
  },
  t => [uniqueIndex('tenant_role_permissions_pkey').on(t.roleId, t.permissionCode)],
)

export const userTenantRoleAssignments = pgTable(
  'user_tenant_role_assignments',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('roleId').notNull(),
    tenantId: text('tenantId')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('user_tenant_role_assignments_userId_roleId_key').on(t.userId, t.roleId),
    index('user_tenant_role_assignments_userId_tenantId_idx').on(t.userId, t.tenantId),
    // Composite FK (AIS-SEC-003 / DEC-0009): rejects an assignment whose role belongs to a
    // different tenant than the assignment's own tenantId.
    foreignKey({
      columns: [t.roleId, t.tenantId],
      foreignColumns: [tenantRoles.id, tenantRoles.tenantId],
      name: 'user_tenant_role_assignments_roleId_tenantId_fkey',
    }).onDelete('cascade'),
  ],
)

export const systemRoles = pgTable('system_roles', {
  id: text('id').primaryKey().$defaultFn(generateId),
  name: text('name').notNull().unique(),
  description: text('description'),
  isBuiltin: boolean('isBuiltin').notNull().default(false),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const permissions = pgTable('permissions', {
  id: text('id').primaryKey().$defaultFn(generateId),
  code: text('code').notNull().unique(),
  description: text('description'),
})

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: text('roleId')
      .notNull()
      .references(() => systemRoles.id, { onDelete: 'cascade' }),
    permissionId: text('permissionId')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  t => [uniqueIndex('role_permissions_pkey').on(t.roleId, t.permissionId)],
)

export const userSystemRoleAssignments = pgTable(
  'user_system_role_assignments',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('roleId')
      .notNull()
      .references(() => systemRoles.id, { onDelete: 'cascade' }),
    tenantId: text('tenantId').references(() => tenants.id, { onDelete: 'restrict' }),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('user_system_role_assignments_userId_roleId_tenantId_key').on(t.userId, t.roleId, t.tenantId),
    index('user_system_role_assignments_tenantId_idx').on(t.tenantId),
  ],
)

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refreshTokenHash').notNull(),
    expiresAt: timestamp('expiresAt', { precision: 3 }).notNull(),
    isRevoked: boolean('isRevoked').notNull().default(false),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  t => [
    uniqueIndex('auth_sessions_refreshTokenHash_key').on(t.refreshTokenHash),
    index('auth_sessions_userId_isRevoked_idx').on(t.userId, t.isRevoked),
  ],
)

export const systemBootstrap = pgTable(
  'system_bootstrap',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    singletonKey: integer('singletonKey').notNull().default(1),
    adminUserId: text('adminUserId').notNull(),
    completedAt: timestamp('completedAt', { precision: 3 }).notNull(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  },
  t => [uniqueIndex('system_bootstrap_singletonKey_key').on(t.singletonKey)],
)

/**
 * Global, persisted (cross-process) rate-limit counter for break-glass recovery attempts
 * (TASK-027.47-R1). A single singleton row: every attempt — successful or refused — increments
 * `attemptCount` inside a `SELECT ... FOR UPDATE` transaction, which serializes concurrent CLI
 * invocations. Never stores the token, password or any credential.
 */
export const breakGlassAttempts = pgTable(
  'break_glass_attempts',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    singletonKey: integer('singletonKey').notNull().default(1),
    windowStartAt: timestamp('windowStartAt', { precision: 3 }).notNull().defaultNow(),
    attemptCount: integer('attemptCount').notNull().default(0),
    updatedAt: timestamp('updatedAt', { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  t => [uniqueIndex('break_glass_attempts_singletonKey_key').on(t.singletonKey)],
)

/**
 * Single-use ledger for break-glass recovery (TASK-027.47-R1). `tokenHash` (sha256 of the
 * configured `BREAK_GLASS_RECOVERY_TOKEN`, never the token itself) is UNIQUE: the first
 * successful claim inserts a row and proceeds inside the same transaction; any later attempt
 * with the same configured token — including a concurrent one racing the first — conflicts on
 * insert and is refused as already used. This is the sole source of the "only one of two
 * parallel calls can succeed" guarantee; it never stores the token, password or hash.
 */
export const breakGlassRecoveryEvents = pgTable(
  'break_glass_recovery_events',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    tokenHash: text('tokenHash').notNull(),
    eventId: text('eventId').notNull(),
    targetUserId: text('targetUserId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    consumedAt: timestamp('consumedAt', { precision: 3 }).notNull().defaultNow(),
  },
  t => [uniqueIndex('break_glass_recovery_events_tokenHash_key').on(t.tokenHash)],
)

export const userMfaSettings = pgTable(
  'user_mfa_settings',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    userId: text('userId')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    method: text('method').notNull().default('TOTP'),
    secretEncrypted: text('secretEncrypted'),
    keyVersion: text('keyVersion'),
    isEnabled: boolean('isEnabled').notNull().default(false),
    enabledAt: timestamp('enabledAt', { precision: 3 }),
    lastVerifiedAt: timestamp('lastVerifiedAt', { precision: 3 }),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  t => [uniqueIndex('user_mfa_settings_userId_key').on(t.userId)],
)

export const userMfaRecoveryCodes = pgTable(
  'user_mfa_recovery_codes',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('codeHash').notNull(),
    usedAt: timestamp('usedAt', { precision: 3 }),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  },
  t => [index('user_mfa_recovery_codes_userId_idx').on(t.userId)],
)

export const tenantSecuritySettings = pgTable('tenant_security_settings', {
  tenantId: text('tenantId')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  mfaRequired: boolean('mfaRequired').notNull().default(false),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: text('updatedBy').references(() => users.id),
})

