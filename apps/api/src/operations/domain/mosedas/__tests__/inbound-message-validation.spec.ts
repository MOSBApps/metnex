import type { TenantIdentity } from '../../tenant-identity'
import type { B2bClientIdentity, B2bTargetAllowlistEntry } from '../b2b-client-identity.contract'
import { validateInboundMosedasMessage } from '../inbound-message-validation.contract'
import type { ProcessedMessageRecord } from '../idempotency.contract'
import type { MosedasMessageEnvelope } from '../message-envelope.contract'

const AT = '2025-01-01T00:00:00.000Z'
const identity = (over: Partial<B2bClientIdentity> = {}): B2bClientIdentity => ({ b2bClientId: 'client-1', externalSystem: 'MOSEDAS', status: 'ACTIVE', validity: { effectiveFrom: '2024-01-01T00:00:00.000Z', effectiveTo: null }, ...over })
const tenant = (id: string, over: Partial<TenantIdentity> = {}): TenantIdentity => ({ tenantId: id, type: 'STANDARD', status: 'ACTIVE', slug: `slug-${id}`, ...over })
const allowlistEntry = (over: Partial<B2bTargetAllowlistEntry> = {}): B2bTargetAllowlistEntry => ({ b2bClientId: 'client-1', targetTenantId: 't-mosb-enerji', facilityReferenceId: null, machineReferenceId: null, operationCenterId: null, validity: { effectiveFrom: '2024-01-01T00:00:00.000Z', effectiveTo: null }, ...over })
const envelope = (over: Partial<MosedasMessageEnvelope> = {}): MosedasMessageEnvelope => ({
  externalMessageId: 'msg-1',
  externalOrderId: 'order-1',
  externalRevision: 1,
  correlationId: 'corr-1',
  occurredAt: '2024-06-01T00:00:00.000Z',
  sentAt: '2024-06-01T00:00:05.000Z',
  schemaVersion: '1.0',
  sourceSystem: 'MOSEDAS',
  targetTenantReference: { targetTenantId: 't-mosb-enerji', facilityReferenceId: null, machineReferenceId: null, operationCenterId: null },
  messageType: 'PRODUCTION_ORDER',
  ...over,
})
const run = (over: { envelope?: MosedasMessageEnvelope; identity?: B2bClientIdentity; tenant?: TenantIdentity | null; allowlist?: B2bTargetAllowlistEntry[]; history?: ProcessedMessageRecord[] } = {}) =>
  validateInboundMosedasMessage(over.envelope ?? envelope(), over.identity ?? identity(), over.tenant === undefined ? tenant('t-mosb-enerji') : over.tenant, over.allowlist ?? [allowlistEntry()], over.history ?? [], AT)

describe('validateInboundMosedasMessage — fixed pipeline order', () => {
  it('a fully valid message resolves ok', () => {
    expect(run()).toEqual({ ok: true })
  })

  it('a malformed envelope is refused BEFORE identity/scope/idempotency are even considered', () => {
    const r = run({ envelope: envelope({ sourceSystem: 'BEAM' as never }), identity: identity({ status: 'REVOKED' }) })
    expect(r).toEqual({ ok: false, code: 'ENVELOPE_INVALID' })
  })

  it('an invalid identity is refused before scope/idempotency, even if the message would otherwise pass', () => {
    const r = run({ identity: identity({ status: 'REVOKED' }), history: [{ externalMessageId: 'msg-1', externalOrderId: 'order-1', externalRevision: 1, processedAt: AT }] })
    expect(r).toEqual({ ok: false, code: 'B2B_IDENTITY_REVOKED' })
  })

  it('an out-of-scope target is refused before idempotency is checked (a duplicate from an unauthorized client is a scope failure, not "duplicate")', () => {
    const r = run({ allowlist: [allowlistEntry({ targetTenantId: 't-other' })], history: [{ externalMessageId: 'msg-1', externalOrderId: 'order-1', externalRevision: 1, processedAt: AT }] })
    expect(r).toEqual({ ok: false, code: 'B2B_SCOPE_NOT_ALLOWLISTED' })
  })

  it('idempotency is the LAST check: a valid, in-scope, correctly-identified duplicate is reported as DUPLICATE_MESSAGE', () => {
    const r = run({ history: [{ externalMessageId: 'msg-1', externalOrderId: 'order-1', externalRevision: 1, processedAt: AT }] })
    expect(r).toEqual({ ok: false, code: 'DUPLICATE_MESSAGE' })
  })

  it('a stale revision is refused', () => {
    const r = run({ envelope: envelope({ externalMessageId: 'msg-2', externalRevision: 1 }), history: [{ externalMessageId: 'msg-1', externalOrderId: 'order-1', externalRevision: 3, processedAt: AT }] })
    expect(r).toEqual({ ok: false, code: 'STALE_REVISION' })
  })

  it('MOSEDAŞ itself as a target tenant is refused', () => {
    const mosedas = tenant('t-mosedas', { slug: 'MOSEDAS' })
    const r = run({ envelope: envelope({ targetTenantReference: { targetTenantId: 't-mosedas', facilityReferenceId: null, machineReferenceId: null, operationCenterId: null } }), tenant: mosedas, allowlist: [allowlistEntry({ targetTenantId: 't-mosedas' })] })
    expect(r).toEqual({ ok: false, code: 'B2B_TARGET_TENANT_NOT_MAPPABLE' })
  })
})
