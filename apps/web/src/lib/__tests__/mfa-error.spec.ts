import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import { getMfaErrorGuidance } from '../mfa-error'

describe('getMfaErrorGuidance', () => {
  it('returns null for non-ApiError', () => {
    expect(getMfaErrorGuidance(new Error('generic'))).toBeNull()
  })

  it('returns null for non-403 ApiError', () => {
    expect(getMfaErrorGuidance(new ApiError('Unauthorized', 401))).toBeNull()
  })

  it('returns MFA_SETUP_REQUIRED guidance for 403 with MFA_SETUP_REQUIRED error code', () => {
    const err = new ApiError('Forbidden', 403, { error: 'MFA_SETUP_REQUIRED' })
    const guidance = getMfaErrorGuidance(err)
    expect(guidance).toEqual({
      code: 'MFA_SETUP_REQUIRED',
      message: 'Bu alanı kullanmak için MFA kurulumu gerekiyor.',
      ctaLabel: 'MFA Kurulumuna Git',
      ctaHref: '/profile',
    })
  })

  it('returns MFA_SESSION_NOT_VERIFIED guidance for 403 with MFA_SESSION_NOT_VERIFIED error code', () => {
    const err = new ApiError('Forbidden', 403, { error: 'MFA_SESSION_NOT_VERIFIED' })
    const guidance = getMfaErrorGuidance(err)
    expect(guidance).toEqual({
      code: 'MFA_SESSION_NOT_VERIFIED',
      message: 'Bu alanı kullanmak için mevcut oturumun MFA ile doğrulanması gerekiyor. Lütfen tekrar giriş yapın.',
      ctaLabel: 'Tekrar Giriş Yap',
      ctaHref: '/login',
    })
  })
})
