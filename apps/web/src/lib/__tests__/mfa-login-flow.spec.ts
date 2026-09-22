import { describe, expect, it } from 'vitest'
import { buildMfaChallengePayload, decideLoginStep, sanitizeNumericCode } from '../mfa-login-flow'

describe('mfa-login-flow', () => {
  it('decides mfa-challenge when requiresMfa is true', () => {
    expect(decideLoginStep({ requiresMfa: true, method: 'TOTP', mfaChallengeToken: 'token' })).toBe('mfa-challenge')
  })

  it('decides tenant-select when user has multiple tenants', () => {
    expect(decideLoginStep({ accessToken: 'acc', user: { tenants: [{ slug: 't1' }, { slug: 't2' }] } })).toBe(
      'tenant-select',
    )
  })

  it('decides done when user has 0 or 1 tenant', () => {
    expect(decideLoginStep({ accessToken: 'acc', user: { tenants: [{ slug: 't1' }] } })).toBe('done')
  })

  it('builds payload correctly for code vs recoveryCode', () => {
    expect(buildMfaChallengePayload(false, '123456')).toEqual({ code: '123456' })
    expect(buildMfaChallengePayload(true, 'ABCD-EFGH')).toEqual({ recoveryCode: 'ABCD-EFGH' })
  })

  it('sanitizes numeric code input to max 6 digits', () => {
    expect(sanitizeNumericCode('123-456-789')).toBe('123456')
    expect(sanitizeNumericCode('abc')).toBe('')
  })
})
