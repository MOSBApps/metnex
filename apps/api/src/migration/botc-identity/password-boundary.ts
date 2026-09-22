import type { PasswordStrategy } from './types'

/**
 * TASK-027.16 — password reset import and admin assignment boundary. Entirely read-only/pure:
 * these utilities inspect data that other modules already produce, they never generate, store, or
 * transform a real password/hash/salt/token, and they never call `MigrationRunService`.
 */

/** Q-A03/Q-PW01 invariant: RESET_REQUIRED is the mandatory baseline — ADMIN_ASSIGNED is additive. */
export function validatePasswordStrategyInvariant(strategies: readonly PasswordStrategy[]): boolean {
  return strategies.includes('RESET_REQUIRED')
}

/**
 * Field names that legitimately describe password *state* (never a credential value) and must
 * not be flagged by the credential scanner below.
 */
const ALLOWED_PASSWORD_RELATED_KEYS = new Set([
  'passwordStrategy',
  'passwordStrategies',
  'passwordStrategySummary',
  // A caller-supplied list of legacy user ids (never a credential value itself) — used by
  // MigrationRunInput/DryRunCliInput to flag which users already had an admin-assigned temporary
  // password (TASK-027.16/027.18).
  'adminAssignedPasswordLegacyIds',
])

/** Matches key names that would indicate an actual credential value, not a state label. */
const FORBIDDEN_KEY_PATTERN = /password|passwd|pwd|hash|salt|secret|token|credential/i

export interface CredentialScanViolation {
  path: string
  key: string
}

/**
 * Recursively scans an arbitrary value (report, audit metadata, staging record, etc.) for any key
 * name that looks like it could hold a real credential. Used to prove — not merely assert in
 * prose — that migration output and audit metadata never carry a password/hash/salt/token.
 */
export function scanForCredentialFields(value: unknown, path = '$'): CredentialScanViolation[] {
  const violations: CredentialScanViolation[] = []
  if (Array.isArray(value)) {
    value.forEach((item, index) => violations.push(...scanForCredentialFields(item, `${path}[${index}]`)))
    return violations
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const keyPath = `${path}.${key}`
      if (FORBIDDEN_KEY_PATTERN.test(key) && !ALLOWED_PASSWORD_RELATED_KEYS.has(key)) {
        violations.push({ path: keyPath, key })
      }
      violations.push(...scanForCredentialFields(nested, keyPath))
    }
  }
  return violations
}

/** Throws with a descriptive message listing every offending path if any violation is found. */
export function assertNoCredentialFields(value: unknown, context: string): void {
  const violations = scanForCredentialFields(value)
  if (violations.length > 0) {
    throw new Error(`Credential-like field(s) found in ${context}: ${violations.map(v => v.path).join(', ')}`)
  }
}
