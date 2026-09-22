import { assertNoCredentialFields, scanForCredentialFields, validatePasswordStrategyInvariant } from './password-boundary'

describe('validatePasswordStrategyInvariant', () => {
  it('is true when RESET_REQUIRED is present alone', () => {
    expect(validatePasswordStrategyInvariant(['RESET_REQUIRED'])).toBe(true)
  })

  it('is true when RESET_REQUIRED is present alongside ADMIN_ASSIGNED', () => {
    expect(validatePasswordStrategyInvariant(['RESET_REQUIRED', 'ADMIN_ASSIGNED'])).toBe(true)
  })

  it('is false when RESET_REQUIRED is missing (ADMIN_ASSIGNED must never stand alone)', () => {
    expect(validatePasswordStrategyInvariant(['ADMIN_ASSIGNED'])).toBe(false)
    expect(validatePasswordStrategyInvariant([])).toBe(false)
  })
})

describe('scanForCredentialFields', () => {
  it('finds nothing in a clean object', () => {
    expect(scanForCredentialFields({ email: 'a@example.com', displayName: 'A', status: 'ACTIVE' })).toEqual([])
  })

  it('does not flag the allowed password-state label fields', () => {
    const violations = scanForCredentialFields({
      passwordStrategy: 'RESET_REQUIRED',
      passwordStrategies: ['RESET_REQUIRED', 'ADMIN_ASSIGNED'],
      passwordStrategySummary: { RESET_REQUIRED: 3, ADMIN_ASSIGNED: 1 },
      adminAssignedPasswordLegacyIds: ['1', '2'],
    })
    expect(violations).toEqual([])
  })

  it('flags a literal passwordHash-like field', () => {
    const violations = scanForCredentialFields({ passwordHash: 'salt:hash', email: 'a@example.com' })
    expect(violations).toEqual([{ path: '$.passwordHash', key: 'passwordHash' }])
  })

  it('flags salt/token/secret/credential-like keys wherever they appear, including nested', () => {
    const violations = scanForCredentialFields({
      metadata: { report: { errorsAndWarnings: [{ description: 'ok', salt: 'x' }] } },
      refreshToken: 'abc',
      clientSecret: 'abc',
      userCredential: 'abc',
    })
    const keys = violations.map(v => v.key).sort()
    expect(keys).toEqual(['clientSecret', 'refreshToken', 'salt', 'userCredential'].sort())
  })

  it('scans arrays recursively', () => {
    const violations = scanForCredentialFields([{ ok: true }, { passwordHash: 'x' }])
    expect(violations).toEqual([{ path: '$[1].passwordHash', key: 'passwordHash' }])
  })

  it('is deterministic for the same input', () => {
    const value = { passwordHash: 'x', nested: { salt: 'y' } }
    expect(scanForCredentialFields(value)).toEqual(scanForCredentialFields(value))
  })
})

describe('assertNoCredentialFields', () => {
  it('does not throw for a clean value', () => {
    expect(() => assertNoCredentialFields({ email: 'a@example.com' }, 'test context')).not.toThrow()
  })

  it('throws with a descriptive message listing every offending path', () => {
    expect(() => assertNoCredentialFields({ passwordHash: 'x', salt: 'y' }, 'test context')).toThrow(/test context/)
  })
})
