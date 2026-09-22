import { describe, expect, it } from 'vitest'
// The API's canonical validator (pure file, no framework imports) — the web mirror must match it exactly.
import { validatePasswordStrength } from '../../../api/src/platform/domain/auth.domain'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyErrors } from './password-policy'
import { MIN_ADMIN_PASSWORD_LENGTH, validateProvisionForm, EMPTY_PROVISION_FORM } from './customer-provision'

const MATRIX = [
  '',
  'Aa1',
  'Aa1aaaa',
  'Aa1aaaaa',
  'aaaaaaaa1',
  'AAAAAAAA1',
  'Aaaaaaaaa',
  '12345678',
  'Sup3r-secret-pass!',
  'A1' + 'a'.repeat(126),
  'A1' + 'a'.repeat(127),
  'A1' + 'a'.repeat(300),
  'Şifre123Türkçe',
  '        ',
]

describe('web password policy mirrors the canonical API policy', () => {
  it('uses the same limits', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
    expect(PASSWORD_MAX_LENGTH).toBe(128)
    expect(MIN_ADMIN_PASSWORD_LENGTH).toBe(PASSWORD_MIN_LENGTH)
  })

  it.each(MATRIX)('gives the same verdict and messages as validatePasswordStrength for %j', password => {
    expect(passwordPolicyErrors(password)).toEqual(validatePasswordStrength(password).errors)
  })

  it('the provisioning form applies that policy (not a stricter or looser one)', () => {
    const base = { ...EMPTY_PROVISION_FORM, companyName: 'Acme', packageId: 'p', adminDisplayName: 'Ad', adminEmail: 'a@b.co' }
    const packages = [{ id: 'p', name: 'P', isActive: true }]
    for (const password of MATRIX) {
      const errors = validateProvisionForm({ ...base, adminPassword: password, adminPasswordConfirm: password }, packages)
      expect(Boolean(errors.adminPassword)).toBe(!validatePasswordStrength(password).valid)
    }
  })
})
