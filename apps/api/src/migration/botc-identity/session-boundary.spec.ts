import { assertNoSessionOrTokenFields, scanForSessionOrTokenFields } from './session-boundary'

describe('scanForSessionOrTokenFields', () => {
  it('finds nothing in a clean object', () => {
    expect(scanForSessionOrTokenFields({ email: 'a@example.com', displayName: 'A', status: 'ACTIVE' })).toEqual([])
  })

  it('does not false-positive on legitimate fields like email/migrationRunId', () => {
    const violations = scanForSessionOrTokenFields({
      email: 'a@example.com',
      migrationRunId: 'run-1',
      sourceLegacyId: '1',
      tenantMembershipStatus: 'ASSIGNED',
    })
    expect(violations).toEqual([])
  })

  it('flags authSessions/refreshToken/accessToken/cookie/jwt-like keys', () => {
    const violations = scanForSessionOrTokenFields({
      authSessions: [],
      refreshToken: 'x',
      accessToken: 'x',
      cookie: 'x',
      jwt: 'x',
      sessionId: 'x',
    })
    const keys = violations.map(v => v.key).sort()
    expect(keys).toEqual(['accessToken', 'authSessions', 'cookie', 'jwt', 'refreshToken', 'sessionId'].sort())
  })

  it('flags verification/reset-link-like keys, nested anywhere', () => {
    const violations = scanForSessionOrTokenFields({
      user: { verificationCode: 'x', profile: { resetLink: 'x' } },
    })
    expect(violations.map(v => v.key).sort()).toEqual(['resetLink', 'verificationCode'].sort())
  })

  it('scans arrays recursively', () => {
    const violations = scanForSessionOrTokenFields([{ ok: true }, { sessionToken: 'x' }])
    expect(violations).toEqual([{ path: '$[1].sessionToken', key: 'sessionToken' }])
  })

  it('is deterministic for the same input', () => {
    const value = { authSessions: [], nested: { cookie: 'x' } }
    expect(scanForSessionOrTokenFields(value)).toEqual(scanForSessionOrTokenFields(value))
  })
})

describe('assertNoSessionOrTokenFields', () => {
  it('does not throw for a clean value', () => {
    expect(() => assertNoSessionOrTokenFields({ email: 'a@example.com' }, 'test context')).not.toThrow()
  })

  it('throws with a descriptive message listing every offending path', () => {
    expect(() => assertNoSessionOrTokenFields({ authSessions: [], cookie: 'x' }, 'test context')).toThrow(/test context/)
  })
})
