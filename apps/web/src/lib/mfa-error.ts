import { ApiError } from './api'

export type MfaErrorCode = 'MFA_SETUP_REQUIRED' | 'MFA_SESSION_NOT_VERIFIED'

export interface MfaErrorGuidance {
  code: MfaErrorCode
  message: string
  ctaLabel: string
  ctaHref: string
}

export function getMfaErrorGuidance(error: unknown): MfaErrorGuidance | null {
  if (!(error instanceof ApiError)) return null
  if (error.status !== 403) return null
  const code = error.body?.['error']
  if (code === 'MFA_SETUP_REQUIRED') {
    return {
      code,
      message: 'Bu alanı kullanmak için MFA kurulumu gerekiyor.',
      ctaLabel: 'MFA Kurulumuna Git',
      ctaHref: '/app/settings/security',
    }
  }
  if (code === 'MFA_SESSION_NOT_VERIFIED') {
    return {
      code,
      message: 'Bu alanı kullanmak için mevcut oturumun MFA ile doğrulanması gerekiyor. Lütfen tekrar giriş yapın.',
      ctaLabel: 'Tekrar Giriş Yap',
      ctaHref: '/login',
    }
  }
  return null
}
