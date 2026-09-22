import { Injectable, Logger } from '@nestjs/common'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

// 64-character default key for fallback when ENCRYPTION_KEY is not explicitly set in env
const DEFAULT_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

@Injectable()
export class MfaCryptoService {
  private readonly logger = new Logger(MfaCryptoService.name)
  private readonly currentKeyVersion: string

  constructor() {
    this.currentKeyVersion = process.env['ENCRYPTION_KEY_VERSION'] ?? 'v1'
    const encKey = process.env['ENCRYPTION_KEY'] ?? ''
    if (encKey.length !== 64 && encKey.length !== 0) {
      this.logger.warn('ENCRYPTION_KEY 64-char hex formatında olmalı. Varsayılan geçici anahtar kullanılacak.')
    }
  }

  encrypt(plaintext: string): { encrypted: string; keyVersion: string } {
    const key = this.getCurrentKey()
    const iv = randomBytes(12)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return {
      encrypted: Buffer.concat([iv, tag, encrypted]).toString('base64'),
      keyVersion: this.currentKeyVersion,
    }
  }

  decrypt(encoded: string, keyVersion?: string): string | null {
    if (keyVersion === this.currentKeyVersion || !keyVersion) {
      const result = this.tryDecrypt(encoded, this.getCurrentKey())
      if (result !== null) return result
    }

    const prevKey = this.getPreviousKey()
    if (prevKey) {
      const result = this.tryDecrypt(encoded, prevKey)
      if (result !== null) return result
    }

    if (keyVersion && keyVersion !== this.currentKeyVersion) {
      const result = this.tryDecrypt(encoded, this.getCurrentKey())
      if (result !== null) return result
    }

    this.logger.error('MFA secret şifresi çözülemedi — ENCRYPTION_KEY değişmiş ya da bozuk olabilir')
    return null
  }

  private tryDecrypt(encoded: string, key: Buffer): string | null {
    try {
      const buf = Buffer.from(encoded, 'base64')
      const iv = buf.subarray(0, 12)
      const tag = buf.subarray(12, 28)
      const ciphertext = buf.subarray(28)
      const decipher = createDecipheriv(ALGORITHM, key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    } catch {
      return null
    }
  }

  private getCurrentKey(): Buffer {
    const raw = process.env['ENCRYPTION_KEY'] ?? ''
    const hex = raw.length === 64 ? raw : DEFAULT_KEY_HEX
    return Buffer.from(hex, 'hex')
  }

  private getPreviousKey(): Buffer | null {
    const hex = process.env['ENCRYPTION_KEY_PREVIOUS'] ?? ''
    if (hex.length !== 64) return null
    return Buffer.from(hex, 'hex')
  }
}
