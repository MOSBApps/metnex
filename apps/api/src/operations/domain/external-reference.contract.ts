/**
 * TASK-029.01 — external systems this domain may hold an opaque REFERENCE to (never a live
 * connection, never copied data). DEC-0014 §3, §21.1.1; DEC-0017 §27.6/§27.9. `MOSEDAS` here is a
 * system name, not a tenant — see `tenant-identity.ts`.
 */
export const EXTERNAL_SYSTEMS = ['BEAM', 'NETSIS', 'MOSEDAS', 'SCADA_DMS'] as const
export type ExternalSystemName = (typeof EXTERNAL_SYSTEMS)[number]

/** Same shape/intent as `CONNECTION_FRAGMENT` in `scada-preset-security.ts` — an independent copy for this domain (defense in depth). */
const CONNECTION_FRAGMENT = /(server|data source|initial catalog|user id|uid|pwd|password|secret|token|connectionstring)\s*[:=]/i
const JWT_SHAPED = /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{3,}/
const SQL_URI = /\b(mssql|jdbc|postgres(ql)?|mysql):\/\//i
const CONTROL = /[\u0000-\u001f\u007f]/

/**
 * A reference value must be a short, printable, non-secret-shaped opaque string — the external
 * system's own identifier for something, never a physical database/schema/table name, a connection
 * string, a token or a credential. This is the ONLY gate every field of every reference type in this
 * domain goes through before it can be constructed as "safe" by a caller.
 */
export function isSafeExternalReferenceValue(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length === 0 || value.length > 256) return false
  if (CONTROL.test(value)) return false
  if (CONNECTION_FRAGMENT.test(value)) return false
  if (JWT_SHAPED.test(value)) return false
  if (SQL_URI.test(value)) return false
  return true
}

export interface ExternalSystemReference {
  externalSystem: ExternalSystemName
  /** The external system's OWN opaque id for the referenced thing (facility, machine, order, asset). Never a Metnex-invented id. */
  externalId: string
  /** The Metnex scope this reference is read/used within — never a scope-granting field on its own. */
  tenantId: string
  operationCenterId: string | null
}

export type ExternalReferenceErrorCode = 'EXTERNAL_REFERENCE_INVALID' | 'EXTERNAL_REFERENCE_UNSAFE_VALUE'

/**
 * Structural + safety validation only — this function never contacts BEAM/Netsis/MOSEDAŞ/SCADA and
 * never copies their data; it only checks the SHAPE of a reference this domain already received from
 * elsewhere (e.g. a future integration task, out of scope here).
 */
export function validateExternalSystemReference(ref: ExternalSystemReference): { ok: true } | { ok: false; code: ExternalReferenceErrorCode } {
  if (!EXTERNAL_SYSTEMS.includes(ref.externalSystem)) return { ok: false, code: 'EXTERNAL_REFERENCE_INVALID' }
  if (typeof ref.tenantId !== 'string' || ref.tenantId.length === 0) return { ok: false, code: 'EXTERNAL_REFERENCE_INVALID' }
  if (ref.operationCenterId !== null && (typeof ref.operationCenterId !== 'string' || ref.operationCenterId.length === 0)) {
    return { ok: false, code: 'EXTERNAL_REFERENCE_INVALID' }
  }
  if (!isSafeExternalReferenceValue(ref.externalId)) return { ok: false, code: 'EXTERNAL_REFERENCE_UNSAFE_VALUE' }
  return { ok: true }
}
