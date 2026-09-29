import { checkMessageIdempotency, type ProcessedMessageRecord } from '../idempotency.contract'
import type { MosedasMessageEnvelope } from '../message-envelope.contract'

const envelope = (over: Partial<MosedasMessageEnvelope> = {}): MosedasMessageEnvelope => ({
  externalMessageId: 'msg-2',
  externalOrderId: 'order-1',
  externalRevision: 2,
  correlationId: 'corr-1',
  occurredAt: '2026-01-01T00:00:00.000Z',
  sentAt: '2026-01-01T00:00:05.000Z',
  schemaVersion: '1.0',
  sourceSystem: 'MOSEDAS',
  targetTenantReference: { targetTenantId: 't-mosb-enerji', facilityReferenceId: null, machineReferenceId: null, operationCenterId: null },
  messageType: 'PRODUCTION_ORDER_REVISION',
  ...over,
})
const record = (over: Partial<ProcessedMessageRecord> = {}): ProcessedMessageRecord => ({ externalMessageId: 'msg-1', externalOrderId: 'order-1', externalRevision: 1, processedAt: '2026-01-01T00:00:00.000Z', ...over })

describe('Aynı mesajın tekrar gelmesi çift kayıt oluşturmamalı', () => {
  it('a message with an externalMessageId already in history is a DUPLICATE', () => {
    expect(checkMessageIdempotency(envelope({ externalMessageId: 'msg-1' }), [record()])).toEqual({ ok: false, code: 'DUPLICATE_MESSAGE' })
  })

  it('a message is a duplicate even if its OTHER fields differ from the original delivery', () => {
    const replay = envelope({ externalMessageId: 'msg-1', externalRevision: 99, occurredAt: '2030-01-01T00:00:00.000Z' })
    expect(checkMessageIdempotency(replay, [record()])).toEqual({ ok: false, code: 'DUPLICATE_MESSAGE' })
  })

  it('a genuinely new externalMessageId is not a duplicate', () => {
    expect(checkMessageIdempotency(envelope({ externalMessageId: 'msg-2' }), [record()])).toEqual({ ok: true })
  })
})

describe('Eski revision yeni revisionın üzerine yazmamalı / geçersiz veya geriye dönük revision reddedilmeli', () => {
  it('a revision strictly greater than every prior one for the same order is accepted', () => {
    expect(checkMessageIdempotency(envelope({ externalRevision: 2 }), [record({ externalRevision: 1 })])).toEqual({ ok: true })
  })

  it('a revision equal to the highest prior one is STALE (not a silent no-op, not an overwrite)', () => {
    expect(checkMessageIdempotency(envelope({ externalMessageId: 'msg-3', externalRevision: 1 }), [record({ externalRevision: 1 })])).toEqual({ ok: false, code: 'STALE_REVISION' })
  })

  it('a revision lower than the highest prior one is STALE, even if it arrives after a higher one was already processed', () => {
    const history = [record({ externalMessageId: 'msg-1', externalRevision: 1 }), record({ externalMessageId: 'msg-5', externalRevision: 5 })]
    expect(checkMessageIdempotency(envelope({ externalMessageId: 'msg-2-late', externalRevision: 3 }), history)).toEqual({ ok: false, code: 'STALE_REVISION' })
  })

  it('the highest prior revision is computed only from records of the SAME externalOrderId — a higher revision of a DIFFERENT order never blocks this one', () => {
    const history = [record({ externalMessageId: 'other-order-msg', externalOrderId: 'order-99', externalRevision: 50 })]
    expect(checkMessageIdempotency(envelope({ externalOrderId: 'order-1', externalRevision: 1 }), history)).toEqual({ ok: true })
  })

  it('a revision gap (e.g. 1 then 5) is accepted — this function checks monotonicity, not contiguity', () => {
    expect(checkMessageIdempotency(envelope({ externalRevision: 5 }), [record({ externalRevision: 1 })])).toEqual({ ok: true })
  })

  it('a message with no order/revision (e.g. a plan) is never flagged for staleness', () => {
    expect(checkMessageIdempotency(envelope({ externalMessageId: 'plan-1', externalOrderId: null, externalRevision: null }), [record()])).toEqual({ ok: true })
  })

  it('an empty history never rejects a first, real revision', () => {
    expect(checkMessageIdempotency(envelope({ externalRevision: 1 }), [])).toEqual({ ok: true })
  })
})
