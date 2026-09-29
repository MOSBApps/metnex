/**
 * TASK-029.02 — which FAILURE CATEGORY an inbound MOSEDAŞ message error belongs to, and whether the
 * sender may retry the SAME message unchanged. No numeric retry count, backoff interval or DLQ
 * threshold is invented here (standing rule: no fabricated performance/limit numbers) — those are
 *029.11's implementation decisions. This file fixes only the CATEGORY and the retryable/not
 * classification, which is a security/correctness boundary, not a tuning parameter.
 */
export const INBOUND_FAILURE_CATEGORIES = [
  'AUTHENTICATION_FAILED',
  'SCOPE_DENIED',
  'SCHEMA_INVALID',
  'BUSINESS_RULE_INVALID',
  'TRANSIENT_INFRASTRUCTURE_ERROR',
  'DUPLICATE_MESSAGE',
  'INVALID_REVISION',
  'UNKNOWN_TARGET',
] as const
export type InboundFailureCategory = (typeof INBOUND_FAILURE_CATEGORIES)[number]

/**
 * `true` = the sender may resend the EXACT SAME message later and it may succeed (nothing about the
 * message itself was wrong). `false` = resending the same message unchanged will fail again (or, for
 * `DUPLICATE_MESSAGE`, would have no effect) — the sender must fix something or treat the earlier
 * outcome as final before trying again.
 */
export const IS_RETRYABLE: Readonly<Record<InboundFailureCategory, boolean>> = {
  AUTHENTICATION_FAILED: false,
  SCOPE_DENIED: false,
  SCHEMA_INVALID: false,
  BUSINESS_RULE_INVALID: false,
  TRANSIENT_INFRASTRUCTURE_ERROR: true,
  DUPLICATE_MESSAGE: false,
  INVALID_REVISION: false,
  UNKNOWN_TARGET: false,
}

/**
 * Maps this contract's own concrete error codes (from `inbound-message-validation.contract.ts`) onto
 * the category vocabulary above, in ONE place, so a code can never be miscategorised inconsistently
 * across callers. `BUSINESS_RULE_INVALID` and `TRANSIENT_INFRASTRUCTURE_ERROR` have no source code
 * here (they belong to a later processing stage — order acceptance, DB availability — out of this
 * task's scope) and are included only so the category vocabulary and the retry table are complete.
 */
export function classifyInboundErrorCode(code: string): InboundFailureCategory | null {
  switch (code) {
    case 'B2B_IDENTITY_INVALID':
    case 'B2B_IDENTITY_REVOKED':
    case 'B2B_IDENTITY_EXPIRED':
      return 'AUTHENTICATION_FAILED'
    case 'B2B_SCOPE_NOT_ALLOWLISTED':
      return 'SCOPE_DENIED'
    case 'ENVELOPE_INVALID':
    case 'ENVELOPE_UNSAFE_VALUE':
      return 'SCHEMA_INVALID'
    case 'B2B_TARGET_TENANT_NOT_MAPPABLE':
      return 'UNKNOWN_TARGET'
    case 'DUPLICATE_MESSAGE':
      return 'DUPLICATE_MESSAGE'
    case 'STALE_REVISION':
      return 'INVALID_REVISION'
    default:
      return null
  }
}

export function isRetryable(category: InboundFailureCategory): boolean {
  return IS_RETRYABLE[category]
}
