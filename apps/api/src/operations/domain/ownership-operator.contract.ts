import { isSafeExternalReferenceValue, type ExternalSystemName } from './external-reference.contract'
import { isValidityPeriodWellFormed, selectEffectiveAt, type ReferenceValidityPeriod } from './reference-validity.contract'

/**
 * TASK-029.01 — asset OWNERSHIP (BRIF1 §3.1/BRIF2: "varlık/hammadde/ürün sahipliği MOSB'dedir") is
 * modelled SEPARATELY from who OPERATES the asset ("MOSB ENERJİ ... işletmecilik hizmet faturası
 * keser"). Neither type has a field that could let a caller accidentally treat one as the other —
 * that equation only ever happens by explicitly reading BOTH and choosing to compare them, which
 * this module does not do on the caller's behalf.
 */
export interface AssetOwnershipReference {
  assetReferenceId: string
  ownerExternalSystem: ExternalSystemName
  /** BEAM/ERP's own id for the asset owner (a company/legal entity) — never a Metnex tenant id. */
  ownerExternalId: string
  validity: ReferenceValidityPeriod
}

export interface OperatorReference {
  assetReferenceId: string
  /** The Metnex tenant operating the asset on the owner's behalf — may differ from any tenant tied to the owner. */
  operatorTenantId: string
  operationCenterId: string | null
  validity: ReferenceValidityPeriod
}

export type OwnershipOperatorErrorCode = 'REFERENCE_INVALID' | 'REFERENCE_UNSAFE_VALUE' | 'VALIDITY_INVALID'

function safeText(v: unknown, max = 128): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max
}

export function validateAssetOwnershipReference(ref: AssetOwnershipReference): { ok: true } | { ok: false; code: OwnershipOperatorErrorCode } {
  if (!safeText(ref.assetReferenceId)) return { ok: false, code: 'REFERENCE_INVALID' }
  if (!isValidityPeriodWellFormed(ref.validity)) return { ok: false, code: 'VALIDITY_INVALID' }
  if (!isSafeExternalReferenceValue(ref.ownerExternalId)) return { ok: false, code: 'REFERENCE_UNSAFE_VALUE' }
  return { ok: true }
}

export function validateOperatorReference(ref: OperatorReference): { ok: true } | { ok: false; code: OwnershipOperatorErrorCode } {
  if (!safeText(ref.assetReferenceId) || !safeText(ref.operatorTenantId)) return { ok: false, code: 'REFERENCE_INVALID' }
  if (ref.operationCenterId !== null && !safeText(ref.operationCenterId)) return { ok: false, code: 'REFERENCE_INVALID' }
  if (!isValidityPeriodWellFormed(ref.validity)) return { ok: false, code: 'VALIDITY_INVALID' }
  return { ok: true }
}

export interface EffectiveOwnershipAndOperator {
  owner: AssetOwnershipReference | null
  operator: OperatorReference | null
}

/**
 * Reads the owner and the operator effective AT ONE INSTANT independently — a change in one never
 * implies or overwrites the other, and a gap in either history is reported as `null`, never guessed.
 * This is the one function in this domain that lets a caller see both facts side by side; it still
 * never asserts they are equal.
 */
export function resolveEffectiveOwnershipAndOperator(
  ownershipHistory: readonly AssetOwnershipReference[],
  operatorHistory: readonly OperatorReference[],
  at: string,
): EffectiveOwnershipAndOperator {
  return {
    owner: selectEffectiveAt(ownershipHistory, at),
    operator: selectEffectiveAt(operatorHistory, at),
  }
}
