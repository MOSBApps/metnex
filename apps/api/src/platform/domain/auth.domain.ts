export interface PasswordStrengthResult {
  valid: boolean
  errors: string[]
}

export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const errors: string[] = []

  if (!password || password.length < 8) errors.push('Şifre en az 8 karakter olmalıdır')
  if (password.length > 128) errors.push('Şifre en fazla 128 karakter olabilir')
  if (!/[A-Z]/.test(password)) errors.push('Şifre en az bir büyük harf içermelidir')
  if (!/[a-z]/.test(password)) errors.push('Şifre en az bir küçük harf içermelidir')
  if (!/[0-9]/.test(password)) errors.push('Şifre en az bir rakam içermelidir')

  return { valid: errors.length === 0, errors }
}

export interface SessionAssessment {
  expired: boolean
  revoked: boolean
  usable: boolean
}

export function assessSession(session: { expiresAt: Date; isRevoked: boolean }): SessionAssessment {
  const expired = session.expiresAt < new Date()
  const revoked = session.isRevoked
  return { expired, revoked, usable: !expired && !revoked }
}

export function computeSessionExpiry(ttlDays: number): Date {
  const expiry = new Date()
  expiry.setDate(expiry.getDate() + ttlDays)
  return expiry
}

export interface LoginAttemptValidation {
  valid: boolean
  reason?: 'invalid_email' | 'password_required'
}

export function validateLoginAttempt(
  email: string,
  passwordProvided: boolean,
): LoginAttemptValidation {
  if (!email || !email.includes('@') || email.trim() !== email) {
    return { valid: false, reason: 'invalid_email' }
  }
  if (!passwordProvided) return { valid: false, reason: 'password_required' }
  return { valid: true }
}
