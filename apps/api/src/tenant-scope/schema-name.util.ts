import { createHash } from 'crypto'

const MAX_IDENTIFIER_LENGTH = 63
const PREFIX = 'cust_'
const FINGERPRINT_LENGTH = 8
const FALLBACK_FRAGMENT = 'tenant'
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/

function sanitizeSlugFragment(raw: string): string {
  const collapsed = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return collapsed || FALLBACK_FRAGMENT
}

/**
 * Generates a customer-root data-plane schema name. Never accepts a schema name from user
 * input directly — the tenant id fingerprint guarantees uniqueness even if the slug is renamed
 * or collides, and the slug is only ever used as a cosmetic, heavily sanitized fragment.
 */
function fingerprintOf(customerRootTenantId: string): string {
  return createHash('sha256').update(customerRootTenantId).digest('hex').slice(0, FINGERPRINT_LENGTH)
}

export function generateCustomerSchemaName(customerRootTenantId: string, slug: string): string {
  const fingerprint = fingerprintOf(customerRootTenantId)
  const suffix = `_${fingerprint}`
  const maxSlugLength = MAX_IDENTIFIER_LENGTH - PREFIX.length - suffix.length
  const sanitizedSlug = sanitizeSlugFragment(slug).slice(0, maxSlugLength) || FALLBACK_FRAGMENT
  return `${PREFIX}${sanitizedSlug}${suffix}`
}

/** Defensive check before any raw SQL uses a schema name — never trust a caller-supplied value. */
export function isSafeSchemaIdentifier(identifier: string): boolean {
  return SAFE_IDENTIFIER.test(identifier)
}

/** Quotes + escapes an identifier for use inside raw DDL (`CREATE SCHEMA ...`). */
export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

const CUSTOMER_SCHEMA_NAME = /^cust_[a-z0-9_]+_[0-9a-f]{8}$/

/** True only for a name in the exact shape generateCustomerSchemaName produces. */
export function isCustomerSchemaName(value: unknown): value is string {
  return typeof value === 'string' && isSafeSchemaIdentifier(value) && CUSTOMER_SCHEMA_NAME.test(value)
}

/** Throws a static error (never echoing the value) unless the name has the customer-root schema shape. */
export function assertCustomerSchemaName(value: unknown): asserts value is string {
  if (!isCustomerSchemaName(value)) throw new Error('Invalid customer schema name')
}

/** True when the name's id fingerprint was derived from this customer-root tenant id. */
export function schemaNameMatchesCustomerRoot(schemaName: string, customerRootTenantId: string): boolean {
  return isCustomerSchemaName(schemaName) && schemaName.endsWith(`_${fingerprintOf(customerRootTenantId)}`)
}
