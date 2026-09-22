import { computeSourceChecksum } from './checksum.util'

describe('computeSourceChecksum', () => {
  it('is stable for the same record regardless of key order', () => {
    const a = computeSourceChecksum({ legacyId: '1', username: 'a', isActive: true })
    const b = computeSourceChecksum({ isActive: true, legacyId: '1', username: 'a' })
    expect(a).toBe(b)
  })

  it('changes when a value changes', () => {
    const a = computeSourceChecksum({ legacyId: '1', isActive: true })
    const b = computeSourceChecksum({ legacyId: '1', isActive: false })
    expect(a).not.toBe(b)
  })

  it('handles nested objects/arrays deterministically', () => {
    const a = computeSourceChecksum({ x: [{ b: 2, a: 1 }] })
    const b = computeSourceChecksum({ x: [{ a: 1, b: 2 }] })
    expect(a).toBe(b)
  })
})
