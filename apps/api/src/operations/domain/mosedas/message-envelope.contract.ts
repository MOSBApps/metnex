import { isSafeExternalReferenceValue } from '../external-reference.contract'

/**
 * TASK-029.02 — MOSEDAŞ message types. The Kırım Tesisi (paçal) production order is a SEPARATE,
 * Metnex-SoR bounded context (DEC-0017 D-01) and is deliberately NEVER modelled here — there is no
 * "KIRIM_*" message type in this contract, and there must never be one added without a new,
 * explicit decision (see `static-guarantees.spec.ts`).
 */
export const MOSEDAS_MESSAGE_TYPES = ['PRODUCTION_PLAN', 'PRODUCTION_ORDER', 'PRODUCTION_ORDER_REVISION', 'CANCELLATION', 'STATUS_CHANGE', 'REALIZED_PRODUCTION_FEEDBACK'] as const
export type MosedasMessageType = (typeof MOSEDAS_MESSAGE_TYPES)[number]

export type MosedasMessageDirection = 'INBOUND' | 'OUTBOUND'

/** DEC-0014 k.5/k.6: MOSEDAŞ sends plan/order/revision/cancellation; Metnex sends status + realized-production feedback back. */
export const MOSEDAS_MESSAGE_DIRECTION: Readonly<Record<MosedasMessageType, MosedasMessageDirection>> = {
  PRODUCTION_PLAN: 'INBOUND',
  PRODUCTION_ORDER: 'INBOUND',
  PRODUCTION_ORDER_REVISION: 'INBOUND',
  CANCELLATION: 'INBOUND',
  STATUS_CHANGE: 'OUTBOUND',
  REALIZED_PRODUCTION_FEEDBACK: 'OUTBOUND',
}

export interface MosedasTargetReference {
  targetTenantId: string
  facilityReferenceId: string | null
  machineReferenceId: string | null
  operationCenterId: string | null
}

/** The idempotency/replay field set the task requires, verbatim. */
export interface MosedasMessageEnvelope {
  externalMessageId: string
  /** MOSEDAŞ's own order identity; `null` only for a message type that names no single order yet (e.g. a plan). */
  externalOrderId: string | null
  /** Monotonic per `externalOrderId`; `null` only when `externalOrderId` is also `null`. */
  externalRevision: number | null
  correlationId: string
  occurredAt: string
  sentAt: string
  schemaVersion: string
  sourceSystem: 'MOSEDAS'
  targetTenantReference: MosedasTargetReference
  messageType: MosedasMessageType
}

function isPosInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
}
function isIso(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v))
}

export type EnvelopeErrorCode = 'ENVELOPE_INVALID' | 'ENVELOPE_UNSAFE_VALUE'
export type EnvelopeValidation = { ok: true } | { ok: false; code: EnvelopeErrorCode }

/**
 * Structural + safety validation only — never contacts MOSEDAŞ, never inspects a business rule. A
 * revision without an order, a `sentAt` before `occurredAt`, an unknown message type, or a
 * connection-string/secret-shaped id all fail here, before anything else runs.
 */
export function validateMosedasMessageEnvelope(env: MosedasMessageEnvelope): EnvelopeValidation {
  if (!(MOSEDAS_MESSAGE_TYPES as readonly string[]).includes(env.messageType)) return { ok: false, code: 'ENVELOPE_INVALID' }
  if (env.sourceSystem !== 'MOSEDAS') return { ok: false, code: 'ENVELOPE_INVALID' }
  if (!isIso(env.occurredAt) || !isIso(env.sentAt)) return { ok: false, code: 'ENVELOPE_INVALID' }
  if (Date.parse(env.sentAt) < Date.parse(env.occurredAt)) return { ok: false, code: 'ENVELOPE_INVALID' }
  if (env.externalOrderId === null && env.externalRevision !== null) return { ok: false, code: 'ENVELOPE_INVALID' }
  if (env.externalRevision !== null && !isPosInt(env.externalRevision)) return { ok: false, code: 'ENVELOPE_INVALID' }
  if (!isSafeExternalReferenceValue(env.externalMessageId)) return { ok: false, code: 'ENVELOPE_UNSAFE_VALUE' }
  if (!isSafeExternalReferenceValue(env.correlationId)) return { ok: false, code: 'ENVELOPE_UNSAFE_VALUE' }
  if (!isSafeExternalReferenceValue(env.schemaVersion)) return { ok: false, code: 'ENVELOPE_UNSAFE_VALUE' }
  if (env.externalOrderId !== null && !isSafeExternalReferenceValue(env.externalOrderId)) return { ok: false, code: 'ENVELOPE_UNSAFE_VALUE' }
  return { ok: true }
}
