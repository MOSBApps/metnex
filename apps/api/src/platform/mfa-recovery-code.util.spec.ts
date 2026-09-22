import { generateRecoveryCode, generateRecoveryCodes } from './mfa-recovery-code.util'

describe('mfa-recovery-code.util', () => {
  it('should generate a formatted recovery code matching XXXX-XXXX', () => {
    const code = generateRecoveryCode()
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/)
  })

  it('should generate specified number of recovery codes', () => {
    const codes = generateRecoveryCodes(10)
    expect(codes).toHaveLength(10)
    codes.forEach(c => {
      expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/)
    })
  })
})
