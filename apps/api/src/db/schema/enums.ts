import { pgEnum } from 'drizzle-orm/pg-core'

export const tenantStatusEnum = pgEnum('TenantStatus', ['ACTIVE', 'SUSPENDED', 'ARCHIVED'])
export const tenantTypeEnum = pgEnum('TenantType', ['PLATFORM_ROOT', 'ROOT', 'STANDARD'])
export const userStatusEnum = pgEnum('UserStatus', ['ACTIVE', 'INACTIVE', 'LOCKED'])
export const subscriptionStatusEnum = pgEnum('SubscriptionStatus', [
  'TRIAL',
  'ACTIVE',
  'SUSPENDED',
  'CANCELLED',
  'EXPIRED',
])
export const customerSchemaStatusEnum = pgEnum('CustomerSchemaStatus', [
  'PROVISIONING',
  'ACTIVE',
  'FAILED',
  'ARCHIVED',
])
