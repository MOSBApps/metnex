/**
 * Mirror of the API's canonical password policy (apps/api/src/platform/domain/auth.domain.ts,
 * validatePasswordStrength). Keep the two identical: password-policy.spec.ts compares them
 * over a matrix of inputs. The backend stays the final authority.
 */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export function passwordPolicyErrors(password: string): string[] {
  const errors: string[] = []
  if (!password || password.length < PASSWORD_MIN_LENGTH) errors.push(`Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalıdır`)
  if (password.length > PASSWORD_MAX_LENGTH) errors.push(`Şifre en fazla ${PASSWORD_MAX_LENGTH} karakter olabilir`)
  if (!/[A-Z]/.test(password)) errors.push('Şifre en az bir büyük harf içermelidir')
  if (!/[a-z]/.test(password)) errors.push('Şifre en az bir küçük harf içermelidir')
  if (!/[0-9]/.test(password)) errors.push('Şifre en az bir rakam içermelidir')
  return errors
}
