import { Injectable } from '@nestjs/common'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

@Injectable()
export class CredentialCryptoService {
  private getKey(): Buffer {
    const raw = process.env['SETTINGS_CREDENTIAL_KEY'] ?? process.env['DATASOURCE_CREDENTIAL_KEY'] ?? process.env['JWT_SECRET'] ?? 'metnex-dev-key'
    return createHash('sha256').update(raw).digest()
  }

  encrypt(value: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.getKey(), iv)
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
  }

  decrypt(payload: string): string {
    const [, ivHex, tagHex, cipherHex] = payload.split(':')
    if (!ivHex || !tagHex || !cipherHex) {
      throw new Error('Invalid encrypted payload format')
    }
    const decipher = createDecipheriv('aes-256-gcm', this.getKey(), Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherHex, 'hex')),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  }
}
