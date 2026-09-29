import { classifyInboundErrorCode, INBOUND_FAILURE_CATEGORIES, isRetryable } from '../retry-classification.contract'

describe('Retry yapılabilecek ve yapılamayacak hatalar ayrılmalı', () => {
  it('every inbound error code this domain actually produces classifies into a category', () => {
    const codes = ['ENVELOPE_INVALID', 'ENVELOPE_UNSAFE_VALUE', 'B2B_IDENTITY_INVALID', 'B2B_IDENTITY_REVOKED', 'B2B_IDENTITY_EXPIRED', 'B2B_TARGET_TENANT_NOT_MAPPABLE', 'B2B_SCOPE_NOT_ALLOWLISTED', 'DUPLICATE_MESSAGE', 'STALE_REVISION']
    for (const code of codes) expect(classifyInboundErrorCode(code)).not.toBeNull()
  })

  it('an unknown code classifies to null rather than a guessed category', () => {
    expect(classifyInboundErrorCode('SOMETHING_NEW')).toBeNull()
  })

  it('authentication, scope, schema and business-rule failures are NEVER retryable as-is', () => {
    expect(isRetryable('AUTHENTICATION_FAILED')).toBe(false)
    expect(isRetryable('SCOPE_DENIED')).toBe(false)
    expect(isRetryable('SCHEMA_INVALID')).toBe(false)
    expect(isRetryable('BUSINESS_RULE_INVALID')).toBe(false)
  })

  it('a transient infrastructure error IS retryable', () => {
    expect(isRetryable('TRANSIENT_INFRASTRUCTURE_ERROR')).toBe(true)
  })

  it('a duplicate message and an invalid/stale revision and an unknown target are never retryable as-is', () => {
    expect(isRetryable('DUPLICATE_MESSAGE')).toBe(false)
    expect(isRetryable('INVALID_REVISION')).toBe(false)
    expect(isRetryable('UNKNOWN_TARGET')).toBe(false)
  })

  it('the category and retryability tables cover every declared category exactly once', () => {
    expect(INBOUND_FAILURE_CATEGORIES).toHaveLength(new Set(INBOUND_FAILURE_CATEGORIES).size)
    for (const category of INBOUND_FAILURE_CATEGORIES) expect(typeof isRetryable(category)).toBe('boolean')
  })

  it('this contract invents no numeric retry count, backoff interval or DLQ threshold', () => {
    const src = require('node:fs').readFileSync(require.resolve('../retry-classification.contract'), 'utf8')
    expect(src).not.toMatch(/maxRetries\s*[:=]\s*\d|backoff\w*\s*[:=]\s*\d|retryAfter\w*\s*[:=]\s*\d|dlqAfter\w*\s*[:=]\s*\d/i)
  })
})
