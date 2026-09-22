import { createHash } from 'crypto'

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }
  return value
}

/** Deterministic fingerprint of a source record, used as the idempotency basis (design doc §5). */
export function computeSourceChecksum(record: unknown): string {
  const normalized = JSON.stringify(sortKeysDeep(record))
  return createHash('sha256').update(normalized).digest('hex')
}
