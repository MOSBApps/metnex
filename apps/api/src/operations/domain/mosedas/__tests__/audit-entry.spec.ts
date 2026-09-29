import { validateMosedasAuditEntry, type MosedasAuditEntry } from '../audit-entry.contract'

const entry = (over: Partial<MosedasAuditEntry> = {}): MosedasAuditEntry => ({
  b2bClientId: 'client-1',
  externalMessageId: 'msg-1',
  correlationId: 'corr-1',
  targetTenantId: 't-mosb-enerji',
  facilityReferenceId: null,
  machineReferenceId: null,
  operationCenterId: null,
  messageType: 'PRODUCTION_ORDER',
  externalRevision: 1,
  result: 'ACCEPTED',
  reasonCode: 'OK',
  ...over,
})

describe('Audit kaydı zorunlu alanları taşımalı', () => {
  it('accepts a well-formed entry', () => {
    expect(validateMosedasAuditEntry(entry() as unknown as Record<string, unknown>)).toBe(true)
  })

  it.each(['b2bClientId', 'externalMessageId', 'correlationId', 'targetTenantId', 'messageType', 'result', 'reasonCode'] as const)('rejects a missing required field %s', field => {
    const rest: Record<string, unknown> = { ...entry() }
    delete rest[field]
    expect(validateMosedasAuditEntry(rest)).toBe(false)
  })

  it('accepts a REJECTED result with a static reason code', () => {
    expect(validateMosedasAuditEntry(entry({ result: 'REJECTED', reasonCode: 'B2B_SCOPE_NOT_ALLOWLISTED' }) as unknown as Record<string, unknown>)).toBe(true)
  })

  it('rejects a non-ALLCAPS reasonCode (never a free-text message)', () => {
    expect(validateMosedasAuditEntry(entry({ reasonCode: 'the request was denied because...' }) as unknown as Record<string, unknown>)).toBe(false)
  })
})

describe('Şunlar audit veya loglara yazılmamalı: secret, token, private key, connection string, ham credential, ham payload', () => {
  it.each(['secret', 'token', 'privateKey', 'private_key', 'connectionString', 'connection_string', 'rawPayload', 'raw_payload', 'password', 'certificate'])('rejects the whole entry if key "%s" is present, whatever its value', key => {
    expect(validateMosedasAuditEntry({ ...entry(), [key]: 'anything' } as never)).toBe(false)
  })

  it('rejects a connection-string/secret-shaped b2bClientId/externalMessageId/correlationId', () => {
    expect(validateMosedasAuditEntry(entry({ b2bClientId: 'Server=10.0.0.5;Password=x' }) as unknown as Record<string, unknown>)).toBe(false)
    expect(validateMosedasAuditEntry(entry({ externalMessageId: 'jdbc:postgresql://internal/db' }) as unknown as Record<string, unknown>)).toBe(false)
    expect(validateMosedasAuditEntry(entry({ correlationId: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc' }) as unknown as Record<string, unknown>)).toBe(false)
  })

  it('MosedasAuditEntry has no field named after a credential/payload/personal-data concept', () => {
    for (const key of Object.keys(entry())) expect(key).not.toMatch(/secret|token|password|certificate|payload|personal|employee|name$/i)
  })
})
