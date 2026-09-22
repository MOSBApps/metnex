import { randomInt } from 'crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRecoveryCode(): string {
  let raw = ''
  for (let i = 0; i < 8; i++) {
    raw += ALPHABET[randomInt(0, ALPHABET.length)]
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

export function generateRecoveryCodes(count: number): string[] {
  return Array.from({ length: count }, () => generateRecoveryCode())
}
