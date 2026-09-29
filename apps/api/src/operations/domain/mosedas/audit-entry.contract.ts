import { isSafeExternalReferenceValue } from '../external-reference.contract'
import type { MosedasMessageType } from './message-envelope.contract'

/**
 * TASK-029.02 — the ONLY fields a MOSEDAŞ B2B audit record may carry. `b2bClientId` replaces the
 * usual `actorId`: the acting identity here is the B2B client, never a human user id. No raw
 * payload, secret, token, private key, connection string or unnecessary personal data has a field
 * to go in — `validateMosedasAuditEntry` also rejects any of those appearing under any key name.
 */
export interface MosedasAuditEntry {
  b2bClientId: string
  externalMessageId: string
  correlationId: string
  targetTenantId: string
  facilityReferenceId: string | null
  machineReferenceId: string | null
  operationCenterId: string | null
  messageType: MosedasMessageType
  externalRevision: number | null
  result: 'ACCEPTED' | 'REJECTED'
  /** A static code only (e.g. an `InboundMessageErrorCode` on rejection, `'OK'` on acceptance) — never a message, a name or an echo. */
  reasonCode: string
}

const FORBIDDEN_AUDIT_KEYS = ['secret', 'token', 'privateKey', 'private_key', 'connectionString', 'connection_string', 'rawPayload', 'raw_payload', 'password', 'certificate']

const REQUIRED_KEYS: readonly (keyof MosedasAuditEntry)[] = ['b2bClientId', 'externalMessageId', 'correlationId', 'targetTenantId', 'messageType', 'result', 'reasonCode']

/**
 * Structural + redaction validation for a MOSEDAŞ audit record BEFORE it is written anywhere. Any
 * forbidden key (whatever its value) fails the whole record — this is a hard, unconditional gate,
 * not a best-effort scrub.
 */
export function validateMosedasAuditEntry(entry: Record<string, unknown>): boolean {
  if (FORBIDDEN_AUDIT_KEYS.some(key => key in entry)) return false
  for (const key of REQUIRED_KEYS) {
    if (!(key in entry) || entry[key] === undefined || entry[key] === null || entry[key] === '') return false
  }
  if (typeof entry['b2bClientId'] !== 'string' || !isSafeExternalReferenceValue(entry['b2bClientId'])) return false
  if (typeof entry['externalMessageId'] !== 'string' || !isSafeExternalReferenceValue(entry['externalMessageId'])) return false
  if (typeof entry['correlationId'] !== 'string' || !isSafeExternalReferenceValue(entry['correlationId'])) return false
  if (entry['result'] !== 'ACCEPTED' && entry['result'] !== 'REJECTED') return false
  if (typeof entry['reasonCode'] !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(entry['reasonCode'])) return false
  return true
}
