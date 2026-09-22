import { MfaCryptoService } from './mfa-crypto.service'

describe('MfaCryptoService', () => {
  let service: MfaCryptoService

  beforeEach(() => {
    service = new MfaCryptoService()
  })

  it('should encrypt and decrypt plaintext successfully', () => {
    const plaintext = 'JBSWY3DPEHPK3PXP'
    const { encrypted, keyVersion } = service.encrypt(plaintext)

    expect(encrypted).toBeDefined()
    expect(keyVersion).toBe('v1')

    const decrypted = service.decrypt(encrypted, keyVersion)
    expect(decrypted).toBe(plaintext)
  })

  it('should return null if decryption fails with corrupted ciphertext', () => {
    const invalidCiphertext = Buffer.from('invalid-data-that-is-long-enough-for-iv-tag-cipher').toString('base64')
    const decrypted = service.decrypt(invalidCiphertext)
    expect(decrypted).toBeNull()
  })
})
