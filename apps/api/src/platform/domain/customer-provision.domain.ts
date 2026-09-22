import { validatePasswordStrength } from './auth.domain'
import { isValidEmail } from './user.domain'

/** Length limits mirror the existing tenant/user validators (name/display name 2..100). */
export const PROVISION_NAME_MIN = 2
export const PROVISION_NAME_MAX = 100
export const PROVISION_SLUG_MAX = 63
export const PROVISION_EMAIL_MAX = 254
export const PROVISION_NOTES_MAX = 1000
export const PROVISION_PACKAGE_ID_MAX = 100

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidProvisionSlug(slug: string): boolean {
  return slug.length <= PROVISION_SLUG_MAX && SLUG_PATTERN.test(slug)
}

export interface ProvisionCustomerValidation {
  valid: boolean
  /** Static, user-safe messages only — never an input value, and never anything about the password beyond the policy text. */
  errors: string[]
}

const isString = (value: unknown): value is string => typeof value === 'string'

function checkName(errors: string[], value: unknown, label: string) {
  if (!isString(value)) {
    errors.push(`${label} zorunludur`)
    return
  }
  const trimmed = value.trim()
  if (trimmed.length < PROVISION_NAME_MIN) errors.push(`${label} en az ${PROVISION_NAME_MIN} karakter olmalıdır`)
  else if (trimmed.length > PROVISION_NAME_MAX) errors.push(`${label} en fazla ${PROVISION_NAME_MAX} karakter olabilir`)
}

/**
 * Pure, DB-free validation of the provision-customer input. It runs before any query or write, so an
 * invalid request can never create a tenant, user, subscription or schema. The password rules come
 * exclusively from validatePasswordStrength (the canonical policy).
 */
export function validateProvisionCustomerInput(input: unknown): ProvisionCustomerValidation {
  const errors: string[] = []
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { valid: false, errors: ['Geçersiz istek gövdesi'] }
  }
  const dto = input as Record<string, unknown>

  checkName(errors, dto['companyName'], 'Müşteri adı')

  const slug = dto['companySlug']
  if (slug !== undefined && slug !== null) {
    if (!isString(slug)) errors.push('Slug metin olmalıdır')
    else if (slug.trim() !== '' && !isValidProvisionSlug(slug.trim())) {
      errors.push(`Slug yalnızca küçük harf, rakam ve tire içermeli ve en fazla ${PROVISION_SLUG_MAX} karakter olmalıdır`)
    }
  }

  const packageId = dto['packageId']
  if (!isString(packageId) || packageId.trim() === '') errors.push('Kaynak paketi seçimi zorunludur')
  else if (packageId.trim().length > PROVISION_PACKAGE_ID_MAX) errors.push('Geçersiz kaynak paketi')

  const email = dto['adminEmail']
  if (!isString(email) || email.trim() === '') errors.push('Yönetici e-posta adresi zorunludur')
  else if (email.trim().length > PROVISION_EMAIL_MAX || !isValidEmail(email)) errors.push('Geçersiz e-posta adresi formatı')

  checkName(errors, dto['adminDisplayName'], 'Yönetici adı')

  const password = dto['adminPassword']
  if (!isString(password) || password === '') errors.push('Yönetici parolası zorunludur')
  else errors.push(...validatePasswordStrength(password).errors)

  const notes = dto['notes']
  if (notes !== undefined && notes !== null) {
    if (!isString(notes)) errors.push('Not metin olmalıdır')
    else if (notes.trim().length > PROVISION_NOTES_MAX) errors.push(`Not en fazla ${PROVISION_NOTES_MAX} karakter olabilir`)
  }

  return { valid: errors.length === 0, errors }
}
