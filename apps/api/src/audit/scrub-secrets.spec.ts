import { REDACTED, isSecretKey, scrubSecrets } from './scrub-secrets'

/**
 * TASK-027.58-R1 — real positive/negative tests for the audit metadata scrubber. Every value below is
 * a harmless placeholder; no real credential, host or connection value appears anywhere.
 */
const PLACEHOLDER = 'placeholder-value'

describe('scrubSecrets — positive: secret-like keys are redacted', () => {
  // The eleven key classes named by AI1 in TASK-027.58-R1.
  it.each([
    'connectionString',
    'secret',
    'password',
    'token',
    'cookie',
    'otp',
    'host',
    'username',
    'user',
    'authorization',
    'accessKey',
    'refreshToken',
  ])('redacts %p', key => {
    expect(scrubSecrets({ [key]: PLACEHOLDER, reasonCode: 'X' })).toEqual({ [key]: REDACTED, reasonCode: 'X' })
  })

  it.each(['passwordHash', 'refreshTokenHash', 'apiKey', 'apiKeyCiphertext'])('still redacts the pre-R1 key %p (no regression)', key => {
    expect(scrubSecrets({ [key]: PLACEHOLDER })).toEqual({ [key]: REDACTED })
  })

  it.each([
    ['casing', 'CONNECTIONSTRING'],
    ['snake_case', 'connection_string'],
    ['kebab-case', 'Connection-String'],
    ['spaced', 'Connection String'],
    ['prefixed', 'dbPassword'],
    ['suffixed', 'sessionCookieValue'],
    ['header style', 'X-Api-Key'],
    ['header style', 'Authorization'],
    ['aws style', 'aws_access_key_id'],
    ['synonym', 'passwd'],
    ['synonym', 'privateKey'],
    ['synonym', 'clientCredentials'],
    ['exact synonym', 'hostname'],
    ['exact synonym', 'dbUser'],
    ['exact synonym', 'totp'],
    ['exact spelled differently', 'User_Name'],
  ])('redacts regardless of %s: %p', (_style, key) => {
    expect(scrubSecrets({ [key]: PLACEHOLDER })).toEqual({ [key]: REDACTED })
  })

  it('redacts at every depth, including inside arrays of objects', () => {
    const input = { a: { b: { token: PLACEHOLDER, keep: 1 } }, list: [{ password: PLACEHOLDER, id: 7 }, { nested: [{ cookie: PLACEHOLDER }] }] }
    expect(scrubSecrets(input)).toEqual({
      a: { b: { token: REDACTED, keep: 1 } },
      list: [{ password: REDACTED, id: 7 }, { nested: [{ cookie: REDACTED }] }],
    })
  })

  it('redacts a secret-like key whatever the value type (object, array, number, null)', () => {
    expect(scrubSecrets({ secret: { inner: 1 }, token: [1, 2], password: 12345, cookie: null })).toEqual({
      secret: REDACTED,
      token: REDACTED,
      password: REDACTED,
      cookie: REDACTED,
    })
  })
})

describe('scrubSecrets — negative: legitimate audit metadata is preserved', () => {
  // Keys/values actually written by production audit call sites today (auth, user, MFA, reporting
  // export, permission guard, break-glass, migration dry-run) plus the SCADA test-contract fields.
  const PRODUCTION_STYLE_METADATA = {
    actorId: 'a1',
    tenantId: 't1',
    customerRootId: 'r1',
    targetUserId: 'u2',
    userId: 'u3',
    impersonatorUserId: 'u4',
    actorMfaBypassWarning: 'ACTOR_HAS_NO_MFA_ENABLED',
    sourceKey: 'src-a',
    result: 'DENIED',
    reason: 'IMPERSONATION_SESSION',
    reasonCode: 'PERMISSION_DENIED',
    correlationId: 'c-1',
    method: 'POST',
    route: '/api/v1/x',
    format: 'PDF',
    artifactCode: 'A1',
    rendererMode: 'JASPER',
    simulation: true,
    email: 'someone@example.invalid',
    displayName: 'Some One',
    migrationRunId: 'run-1',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
  }

  it('leaves every production-style metadata key and value untouched (the backward-compat proof for the wider scrubber)', () => {
    expect(scrubSecrets(PRODUCTION_STYLE_METADATA)).toEqual(PRODUCTION_STYLE_METADATA)
  })

  it.each(['userId', 'targetUserId', 'impersonatorUserId', 'actorId', 'usernameHint', 'hostile', 'ghost', 'footprint', 'photo', 'otpAttempts', 'hostCount'])(
    'does not redact the non-secret key %p (short words are matched exactly, not as substrings)',
    key => {
      expect(scrubSecrets({ [key]: 'keep' })).toEqual({ [key]: 'keep' })
    },
  )

  it('preserves non-string values of non-secret keys', () => {
    expect(scrubSecrets({ count: 3, ok: true, none: null, when: undefined, list: [1, 'a'] })).toEqual({ count: 3, ok: true, none: null, when: undefined, list: [1, 'a'] })
  })

  it('passes non-objects through unchanged', () => {
    expect(scrubSecrets('plain')).toBe('plain')
    expect(scrubSecrets(5)).toBe(5)
    expect(scrubSecrets(null)).toBeNull()
    expect(scrubSecrets(undefined)).toBeUndefined()
  })

  it('never mutates its input and is idempotent', () => {
    const input = { token: PLACEHOLDER, nested: { password: PLACEHOLDER, keep: 1 } }
    const snapshot = JSON.parse(JSON.stringify(input))
    const once = scrubSecrets(input)
    expect(input).toEqual(snapshot)
    expect(scrubSecrets(once)).toEqual(once)
  })

  it('isSecretKey agrees with the redaction behaviour', () => {
    expect(isSecretKey('connectionString')).toBe(true)
    expect(isSecretKey('targetUserId')).toBe(false)
  })
})

describe('scrubSecrets — documented limits (decisions, not silent gaps)', () => {
  // KEY-based only, by design of this iteration. These pin the current, honest boundary so a future
  // change to it is a deliberate, reviewed decision (see TASK-027-58-R1 §1 and Q-SR01).
  it('does NOT inspect values: a secret sitting in a benign key is not redacted (value-scanning is an open decision)', () => {
    expect(scrubSecrets({ note: 'Server=placeholder;Password=placeholder' })).toEqual({ note: 'Server=placeholder;Password=placeholder' })
  })

  it('does NOT redact SQL-ish or schema-ish keys (rawSql, schemaName): the SCADA audit builder must simply never include them', () => {
    expect(scrubSecrets({ rawSql: PLACEHOLDER, schemaName: PLACEHOLDER })).toEqual({ rawSql: PLACEHOLDER, schemaName: PLACEHOLDER })
  })
})
