import { isSafeExternalReferenceValue, type ExternalSystemName } from './external-reference.contract'

/**
 * TASK-029.01 — `FacilityReference` / `MachineReference`: Metnex's own limited, opaque reference to a
 * tesis/makine whose ASSET ana verisi lives in BEAM or ERP (DEC-0014 §3: "Metnex sınırlı tesis/makine
 * referansları ve operasyonel snapshot tutabilir; varlık sahibi veya ana veri yöneticisi değildir").
 * Neither type carries a physical DB/schema/table name, a connection string or a secret — only an
 * opaque external id and the Metnex-side scope it is read within.
 */
export interface FacilityReference {
  facilityReferenceId: string
  /** The operation center this facility is scoped to (never a bare tenant-wide claim for a physical asset). */
  operationCenterId: string
  ownerExternalSystem: ExternalSystemName
  ownerExternalId: string
  displayName: string
  status: 'ACTIVE' | 'INACTIVE'
}

export interface MachineReference {
  machineReferenceId: string
  facilityReferenceId: string
  ownerExternalSystem: ExternalSystemName
  ownerExternalId: string
  displayName: string
  status: 'ACTIVE' | 'INACTIVE'
}

export type FacilityMachineErrorCode = 'REFERENCE_INVALID' | 'REFERENCE_UNSAFE_VALUE'

function safeText(v: unknown, max = 128): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max
}

export function validateFacilityReference(ref: FacilityReference): { ok: true } | { ok: false; code: FacilityMachineErrorCode } {
  if (!safeText(ref.facilityReferenceId) || !safeText(ref.operationCenterId) || !safeText(ref.displayName, 256)) {
    return { ok: false, code: 'REFERENCE_INVALID' }
  }
  if (ref.status !== 'ACTIVE' && ref.status !== 'INACTIVE') return { ok: false, code: 'REFERENCE_INVALID' }
  if (!isSafeExternalReferenceValue(ref.ownerExternalId)) return { ok: false, code: 'REFERENCE_UNSAFE_VALUE' }
  return { ok: true }
}

export function validateMachineReference(ref: MachineReference): { ok: true } | { ok: false; code: FacilityMachineErrorCode } {
  if (!safeText(ref.machineReferenceId) || !safeText(ref.facilityReferenceId) || !safeText(ref.displayName, 256)) {
    return { ok: false, code: 'REFERENCE_INVALID' }
  }
  if (ref.status !== 'ACTIVE' && ref.status !== 'INACTIVE') return { ok: false, code: 'REFERENCE_INVALID' }
  if (!isSafeExternalReferenceValue(ref.ownerExternalId)) return { ok: false, code: 'REFERENCE_UNSAFE_VALUE' }
  return { ok: true }
}
