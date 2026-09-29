import { MOSEDAS_MESSAGE_DIRECTION, MOSEDAS_MESSAGE_TYPES, validateMosedasMessageEnvelope, type MosedasMessageEnvelope } from '../message-envelope.contract'

const envelope = (over: Partial<MosedasMessageEnvelope> = {}): MosedasMessageEnvelope => ({
  externalMessageId: 'msg-1',
  externalOrderId: 'order-1',
  externalRevision: 1,
  correlationId: 'corr-1',
  occurredAt: '2026-01-01T00:00:00.000Z',
  sentAt: '2026-01-01T00:00:05.000Z',
  schemaVersion: '1.0',
  sourceSystem: 'MOSEDAS',
  targetTenantReference: { targetTenantId: 't-mosb-enerji', facilityReferenceId: null, machineReferenceId: null, operationCenterId: null },
  messageType: 'PRODUCTION_ORDER',
  ...over,
})

describe('En az altı mesaj türü için taslak', () => {
  it('defines exactly the six required message types', () => {
    expect([...MOSEDAS_MESSAGE_TYPES].sort()).toEqual(['CANCELLATION', 'PRODUCTION_ORDER', 'PRODUCTION_ORDER_REVISION', 'PRODUCTION_PLAN', 'REALIZED_PRODUCTION_FEEDBACK', 'STATUS_CHANGE'].sort())
  })

  it('MOSEDAŞ-originated types are INBOUND, Metnex-originated types are OUTBOUND', () => {
    expect(MOSEDAS_MESSAGE_DIRECTION.PRODUCTION_PLAN).toBe('INBOUND')
    expect(MOSEDAS_MESSAGE_DIRECTION.PRODUCTION_ORDER).toBe('INBOUND')
    expect(MOSEDAS_MESSAGE_DIRECTION.PRODUCTION_ORDER_REVISION).toBe('INBOUND')
    expect(MOSEDAS_MESSAGE_DIRECTION.CANCELLATION).toBe('INBOUND')
    expect(MOSEDAS_MESSAGE_DIRECTION.STATUS_CHANGE).toBe('OUTBOUND')
    expect(MOSEDAS_MESSAGE_DIRECTION.REALIZED_PRODUCTION_FEEDBACK).toBe('OUTBOUND')
  })
})

describe('Üretim emri iki farklı bounded context — Kırım emri bu sözleşmeye girmez', () => {
  it('no message type resembles a Kırım/paçal/internal production order', () => {
    for (const t of MOSEDAS_MESSAGE_TYPES) expect(t).not.toMatch(/KIRIM|PACAL|BLEND/i)
  })
})

describe('validateMosedasMessageEnvelope', () => {
  it('accepts a well-formed envelope for each message type', () => {
    for (const messageType of MOSEDAS_MESSAGE_TYPES) {
      const needsOrder = messageType !== 'PRODUCTION_PLAN'
      expect(validateMosedasMessageEnvelope(envelope({ messageType, externalOrderId: needsOrder ? 'order-1' : null, externalRevision: needsOrder ? 1 : null }))).toEqual({ ok: true })
    }
  })

  it('rejects an unknown message type', () => {
    expect(validateMosedasMessageEnvelope(envelope({ messageType: 'UNKNOWN' as never }))).toEqual({ ok: false, code: 'ENVELOPE_INVALID' })
  })

  it('rejects a sourceSystem other than MOSEDAS', () => {
    expect(validateMosedasMessageEnvelope(envelope({ sourceSystem: 'BEAM' as never }))).toEqual({ ok: false, code: 'ENVELOPE_INVALID' })
  })

  it('rejects sentAt earlier than occurredAt', () => {
    expect(validateMosedasMessageEnvelope(envelope({ occurredAt: '2026-01-01T00:00:10.000Z', sentAt: '2026-01-01T00:00:00.000Z' }))).toEqual({ ok: false, code: 'ENVELOPE_INVALID' })
  })

  it('rejects a revision without an order id', () => {
    expect(validateMosedasMessageEnvelope(envelope({ externalOrderId: null, externalRevision: 1 }))).toEqual({ ok: false, code: 'ENVELOPE_INVALID' })
  })

  it('rejects a negative or non-integer revision', () => {
    expect(validateMosedasMessageEnvelope(envelope({ externalRevision: -1 }))).toEqual({ ok: false, code: 'ENVELOPE_INVALID' })
    expect(validateMosedasMessageEnvelope(envelope({ externalRevision: 1.5 }))).toEqual({ ok: false, code: 'ENVELOPE_INVALID' })
  })

  it('rejects malformed occurredAt/sentAt', () => {
    expect(validateMosedasMessageEnvelope(envelope({ occurredAt: 'nope' }))).toEqual({ ok: false, code: 'ENVELOPE_INVALID' })
    expect(validateMosedasMessageEnvelope(envelope({ sentAt: 'nope' }))).toEqual({ ok: false, code: 'ENVELOPE_INVALID' })
  })

  it.each(['externalMessageId', 'correlationId', 'schemaVersion', 'externalOrderId'] as const)('rejects a connection-string/secret-shaped %s', field => {
    expect(validateMosedasMessageEnvelope(envelope({ [field]: 'Server=10.0.0.5;Password=x' } as never))).toEqual({ ok: false, code: 'ENVELOPE_UNSAFE_VALUE' })
  })
})
