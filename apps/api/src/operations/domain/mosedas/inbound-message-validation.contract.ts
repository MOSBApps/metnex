import type { TenantIdentity } from '../tenant-identity'
import { isWellFormedB2bClientIdentity, resolveB2bTargetScope, type B2bClientIdentity, type B2bIdentityErrorCode, type B2bTargetAllowlistEntry } from './b2b-client-identity.contract'
import { checkMessageIdempotency, type IdempotencyErrorCode, type ProcessedMessageRecord } from './idempotency.contract'
import { validateMosedasMessageEnvelope, type EnvelopeErrorCode, type MosedasMessageEnvelope } from './message-envelope.contract'

export type InboundMessageErrorCode = EnvelopeErrorCode | 'B2B_IDENTITY_INVALID' | B2bIdentityErrorCode | IdempotencyErrorCode

export type InboundMessageResolution = { ok: true } | { ok: false; code: InboundMessageErrorCode }

/**
 * TASK-029.02 — the single fail-closed pipeline every inbound MOSEDAŞ message goes through, in
 * this fixed order:
 *   1. envelope shape + safety (`validateMosedasMessageEnvelope`) — a malformed message never
 *      reaches identity/scope/idempotency checks (nothing about it can be trusted yet);
 *   2. B2B client identity standing (never a user JWT/role — `b2b-client-identity.contract.ts`);
 *   3. tenant/facility/machine/operation-center allowlist scope;
 *   4. idempotency/revision.
 * An earlier step failing means later steps are NEVER evaluated — e.g. a revoked identity never
 * gets an idempotency check run against real order history, and a duplicate message from an
 * unauthorized client is reported as a scope failure, not "duplicate" (nothing about a message from
 * an unauthorized sender is trusted enough to compare against history).
 */
export function validateInboundMosedasMessage(
  envelope: MosedasMessageEnvelope,
  identity: B2bClientIdentity,
  targetTenant: TenantIdentity | null,
  allowlist: readonly B2bTargetAllowlistEntry[],
  history: readonly ProcessedMessageRecord[],
  at: string,
): InboundMessageResolution {
  const envelopeCheck = validateMosedasMessageEnvelope(envelope)
  if (!envelopeCheck.ok) return envelopeCheck
  if (!isWellFormedB2bClientIdentity(identity)) return { ok: false, code: 'B2B_IDENTITY_INVALID' }
  const scope = resolveB2bTargetScope(identity, targetTenant, allowlist, envelope.targetTenantReference, at)
  if (!scope.ok) return scope
  const idempotent = checkMessageIdempotency(envelope, history)
  if (!idempotent.ok) return idempotent
  return { ok: true }
}
