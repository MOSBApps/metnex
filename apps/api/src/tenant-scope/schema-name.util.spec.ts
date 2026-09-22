import { generateCustomerSchemaName, isSafeSchemaIdentifier, quoteIdentifier } from './schema-name.util'

describe('generateCustomerSchemaName', () => {
  it('produces a lowercase, prefixed, sanitized name', () => {
    const name = generateCustomerSchemaName('tenant-1', 'Acme Corp')
    expect(name).toMatch(/^cust_acme_corp_[0-9a-f]{8}$/)
  })

  it('is deterministic for the same tenant id and slug', () => {
    const a = generateCustomerSchemaName('tenant-1', 'acme')
    const b = generateCustomerSchemaName('tenant-1', 'acme')
    expect(a).toBe(b)
  })

  it('produces different names for different tenant ids even with an identical slug', () => {
    // Two customers could pick the same display name/slug — the id fingerprint is what
    // actually guarantees schema uniqueness, not the slug.
    const a = generateCustomerSchemaName('tenant-a', 'acme')
    const b = generateCustomerSchemaName('tenant-b', 'acme')
    expect(a).not.toBe(b)
  })

  it('strips SQL-injection-shaped input instead of passing it through', () => {
    const name = generateCustomerSchemaName('tenant-1', `acme"; DROP SCHEMA public; --`)
    expect(name).not.toMatch(/[";]/)
    expect(isSafeSchemaIdentifier(name)).toBe(true)
  })

  it('strips spaces, unicode, and mixed case', () => {
    const name = generateCustomerSchemaName('tenant-1', 'Şirket Ünvanı 日本語')
    expect(isSafeSchemaIdentifier(name)).toBe(true)
  })

  it('falls back to a fixed literal when the slug sanitizes to nothing', () => {
    const name = generateCustomerSchemaName('tenant-1', '!!! ---- ???')
    expect(name).toMatch(/^cust_tenant_[0-9a-f]{8}$/)
  })

  it('never exceeds the 63-byte PostgreSQL identifier limit even for a very long slug', () => {
    const name = generateCustomerSchemaName('tenant-1', 'a'.repeat(200))
    expect(name.length).toBeLessThanOrEqual(63)
    expect(isSafeSchemaIdentifier(name)).toBe(true)
  })
})

describe('isSafeSchemaIdentifier', () => {
  it('accepts a well-formed generated name', () => {
    expect(isSafeSchemaIdentifier(generateCustomerSchemaName('tenant-1', 'acme'))).toBe(true)
  })

  it('rejects identifiers with quotes, semicolons, or spaces', () => {
    expect(isSafeSchemaIdentifier('cust_acme"; DROP TABLE users; --')).toBe(false)
    expect(isSafeSchemaIdentifier('cust acme')).toBe(false)
  })

  it('rejects an identifier starting with a digit', () => {
    expect(isSafeSchemaIdentifier('1cust_acme')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isSafeSchemaIdentifier('')).toBe(false)
  })

  it('rejects uppercase characters', () => {
    expect(isSafeSchemaIdentifier('Cust_Acme')).toBe(false)
  })
})

describe('quoteIdentifier', () => {
  it('wraps the identifier in double quotes', () => {
    expect(quoteIdentifier('cust_acme_a1b2c3d4')).toBe('"cust_acme_a1b2c3d4"')
  })

  it('escapes embedded double quotes', () => {
    expect(quoteIdentifier('cust_"acme"')).toBe('"cust_""acme"""')
  })
})
