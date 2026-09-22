const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(email))
}

export interface UserCreationValidation {
  valid: boolean
  errors: string[]
}

export function validateUserCreation(input: {
  email: string
  displayName: string
}): UserCreationValidation {
  const errors: string[] = []
  const displayName = input.displayName.trim()

  if (!isValidEmail(input.email)) errors.push('Geçersiz e-posta adresi formatı')
  if (displayName.length < 2) errors.push('Görünen ad en az 2 karakter olmalıdır')
  if (displayName.length > 100) errors.push('Görünen ad en fazla 100 karakter olabilir')

  return { valid: errors.length === 0, errors }
}

export interface DeactivationResult {
  allowed: boolean
  reason?: 'SELF_DEACTIVATION' | 'LAST_SYSTEM_ADMIN'
}

export function canDeactivateUser(
  targetUserId: string,
  requestingUserId: string,
  targetIsSystemAdmin: boolean,
  activeSystemAdminCount: number,
): DeactivationResult {
  if (targetUserId === requestingUserId) return { allowed: false, reason: 'SELF_DEACTIVATION' }
  if (targetIsSystemAdmin && activeSystemAdminCount <= 1) {
    return { allowed: false, reason: 'LAST_SYSTEM_ADMIN' }
  }
  return { allowed: true }
}
