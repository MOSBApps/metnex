import type { MosedasMessageEnvelope } from './message-envelope.contract'

/**
 * TASK-029.02 — the minimal history record this domain needs to make an idempotency/revision
 * decision. A real store's actual schema (029.11) will have more; this is the read contract.
 */
export interface ProcessedMessageRecord {
  externalMessageId: string
  externalOrderId: string | null
  externalRevision: number | null
  processedAt: string
}

export type IdempotencyErrorCode = 'DUPLICATE_MESSAGE' | 'STALE_REVISION'
export type IdempotencyResolution = { ok: true } | { ok: false; code: IdempotencyErrorCode }

/**
 * Fail-closed idempotency/replay check:
 *   - the SAME `externalMessageId` seen before is a DUPLICATE, whatever its content — it is never
 *     processed a second time (the caller's own ack/response for the original delivery is
 *     authoritative; this function only decides whether NEW processing should happen);
 *   - for a revision-bearing message, a revision that is NOT strictly greater than every prior
 *     revision already recorded for the SAME `externalOrderId` is STALE — an older revision can
 *     never overwrite a newer one, even if the network delivers it out of order or late.
 * A message with no `externalOrderId`/`externalRevision` (e.g. a plan) has nothing to compare and
 * is never flagged stale.
 */
export function checkMessageIdempotency(envelope: MosedasMessageEnvelope, history: readonly ProcessedMessageRecord[]): IdempotencyResolution {
  if (history.some(h => h.externalMessageId === envelope.externalMessageId)) return { ok: false, code: 'DUPLICATE_MESSAGE' }
  if (envelope.externalOrderId !== null && envelope.externalRevision !== null) {
    const priorRevisions = history.filter(h => h.externalOrderId === envelope.externalOrderId && h.externalRevision !== null).map(h => h.externalRevision as number)
    const highest = priorRevisions.length > 0 ? Math.max(...priorRevisions) : null
    if (highest !== null && envelope.externalRevision <= highest) return { ok: false, code: 'STALE_REVISION' }
  }
  return { ok: true }
}
