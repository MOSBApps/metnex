/**
 * TASK-027.17 — identity session and email verification boundary. Entirely read-only/pure: these
 * utilities inspect data that other modules already produce. This module never generates a
 * session, cookie, JWT, refresh/access token, verification code, or reset link, and never calls
 * `MigrationRunService`.
 */

/** Matches key names that would indicate a session/token/cookie/verification concept. */
const FORBIDDEN_KEY_PATTERN = /session|token|cookie|jwt|verificationcode|resetlink/i

export interface SessionScanViolation {
  path: string
  key: string
}

/**
 * Recursively scans an arbitrary value (report, audit metadata, staging record, simulated target
 * state, etc.) for any key name that looks like it could hold a session/cookie/token/verification
 * artifact. There is currently no allowlist — unlike `password-boundary.ts`'s credential scanner,
 * no field in this module legitimately needs a session/token-shaped name.
 */
export function scanForSessionOrTokenFields(value: unknown, path = '$'): SessionScanViolation[] {
  const violations: SessionScanViolation[] = []
  if (Array.isArray(value)) {
    value.forEach((item, index) => violations.push(...scanForSessionOrTokenFields(item, `${path}[${index}]`)))
    return violations
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const keyPath = `${path}.${key}`
      if (FORBIDDEN_KEY_PATTERN.test(key)) violations.push({ path: keyPath, key })
      violations.push(...scanForSessionOrTokenFields(nested, keyPath))
    }
  }
  return violations
}

/** Throws with a descriptive message listing every offending path if any violation is found. */
export function assertNoSessionOrTokenFields(value: unknown, context: string): void {
  const violations = scanForSessionOrTokenFields(value)
  if (violations.length > 0) {
    throw new Error(`Session/token-like field(s) found in ${context}: ${violations.map(v => v.path).join(', ')}`)
  }
}
