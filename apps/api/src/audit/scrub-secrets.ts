export const REDACTED = '[REDACTED]'

/**
 * Keys are compared in a NORMALISED form (lower-case, letters and digits only), so `connectionString`,
 * `connection_string` and `Connection-String` are the same key.
 *
 * Fragment class: the normalised key CONTAINS one of these. Used only for names that are secret-like
 * wherever they appear (`refreshTokenHash`, `x-api-key`, `dbPasswordEncrypted`, ...). It is a strict
 * superset of the pre-R1 list (password, passwordHash, refreshToken, refreshTokenHash, token, apiKey,
 * apiKeyCiphertext).
 */
const SECRET_KEY_FRAGMENTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'accesskey',
  'privatekey',
  'credential',
  'cookie',
  'authorization',
  'connectionstring',
]

/**
 * Exact class: the normalised key must EQUAL one of these. Short/ambiguous words are matched exactly
 * on purpose — a substring rule for `user` would redact `userId`/`targetUserId`/`impersonatorUserId`,
 * which are legitimate audit identifiers, and `otp`/`host` would hit words like `footprint`/`ghost`.
 */
const SECRET_KEY_EXACT = new Set(['otp', 'totp', 'user', 'username', 'dbuser', 'dbusername', 'host', 'hostname', 'dbhost'])

export function isSecretKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  return SECRET_KEY_EXACT.has(normalised) || SECRET_KEY_FRAGMENTS.some(fragment => normalised.includes(fragment))
}

/** Recursively replaces the VALUE of every secret-like key. Keys only — values are never inspected. */
export function scrubSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSecrets)
  if (!value || typeof value !== 'object') return value

  const result: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSecretKey(key) ? REDACTED : scrubSecrets(nested)
  }
  return result
}
