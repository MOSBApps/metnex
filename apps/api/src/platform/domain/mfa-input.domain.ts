import { isValidId, type InputValidation } from './platform-input.domain'

/**
 * Pure validators for the MFA request bodies. The contract is exactly what the (previously inert)
 * class-validator decorators in dto/mfa.dto.ts declared — no new rule: a code is a string of exactly
 * 6 characters, a recovery code matches RECOVERY_CODE_PATTERN, a challenge token / password is a
 * string, the tenant policy flag is a boolean. Messages are static; no OTP, token, recovery code or
 * password is ever echoed. These run at the controller boundary, before any MFA, DB or audit work.
 */
export const MFA_CODE_LENGTH = 6
export const RECOVERY_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/

export const MFA_CODE_MESSAGE = `Doğrulama kodu ${MFA_CODE_LENGTH} haneli olmalıdır`
export const MFA_RECOVERY_CODE_MESSAGE = 'Kurtarma kodu formatı geçersiz'

const isString = (value: unknown): value is string => typeof value === 'string'
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const done = (errors: string[]): InputValidation => ({ valid: errors.length === 0, errors })
const INVALID_BODY = done(['Geçersiz istek gövdesi'])

const isMfaCode = (value: unknown): value is string => isString(value) && value.length === MFA_CODE_LENGTH

export function validateVerifyTotpSetup(input: unknown): InputValidation {
  if (!isPlainObject(input)) return INVALID_BODY
  return done(isMfaCode(input['code']) ? [] : [MFA_CODE_MESSAGE])
}

export function validateRegenerateRecoveryCodes(input: unknown): InputValidation {
  return validateVerifyTotpSetup(input)
}

export function validateDisableTotp(input: unknown): InputValidation {
  if (!isPlainObject(input)) return INVALID_BODY
  const errors: string[] = []
  if (!isString(input['password']) || input['password'] === '') errors.push('Parola zorunludur')
  if (!isMfaCode(input['code'])) errors.push(MFA_CODE_MESSAGE)
  return done(errors)
}

/** A challenge is answered with a TOTP code or a recovery code; one of them is required. */
export function validateVerifyMfaChallenge(input: unknown): InputValidation {
  if (!isPlainObject(input)) return INVALID_BODY
  const errors: string[] = []
  if (!isString(input['challengeToken']) || input['challengeToken'] === '') errors.push('Doğrulama oturumu zorunludur')

  const { code, recoveryCode } = input
  const hasRecovery = recoveryCode !== undefined && recoveryCode !== null
  const hasCode = code !== undefined && code !== null
  if (hasRecovery) {
    if (!isString(recoveryCode) || !RECOVERY_CODE_PATTERN.test(recoveryCode)) errors.push(MFA_RECOVERY_CODE_MESSAGE)
    if (hasCode && !isString(code)) errors.push(MFA_CODE_MESSAGE)
  } else if (!isMfaCode(code)) {
    errors.push(MFA_CODE_MESSAGE)
  }
  return done(errors)
}

export function validateSetTenantMfaPolicy(input: unknown): InputValidation {
  if (!isPlainObject(input)) return INVALID_BODY
  return done(typeof input['mfaRequired'] === 'boolean' ? [] : ['mfaRequired true/false olmalıdır'])
}

/** `:userId` / `:tenantId` route parameters. */
export function validateMfaPathId(value: unknown, label: string): InputValidation {
  return done(isValidId(value) ? [] : [`${label} geçersiz`])
}
