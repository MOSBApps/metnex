import { ASSIGNABLE_CATALOGUE } from '../../platform/permission-catalogue'
import { APPROVED_PERMISSION_CODE_MAP, mapPermissionCode } from './permission-mapping'
import type { BotcSourcePermission } from './types'

/**
 * TASK-027.14 — permission mapping coverage and governance boundary. This module is read-only: it
 * never mutates `permission-mapping.ts` (Q-M03's 5 approved codes stay verbatim, imported not
 * redefined), never touches the real production catalogue
 * (`apps/api/src/platform/permission-catalogue.ts`, imported read-only for comparison only), and
 * never invents a new code. It exists purely to report coverage and to give the unmapped-permission
 * record a stable, testable shape.
 */

export const UNMAPPED_PERMISSION_ERROR_CODE = 'RECOVERABLE_UNMAPPED_PERMISSION'

/** Fixed report shape for a BOTC permission with no approved target code (task scope item 3). */
export interface UnmappedPermissionReportEntry {
  legacyPermissionId: string
  legacyPermissionName: string
  errorCode: string
  description: string
  migrationRunId: string
  /**
   * Always false: an unmapped permission is a data/decision gap (a new PO-approved code is
   * required), not a transient write failure — re-running the same migration with the same
   * approved mapping table will deterministically produce the same UNMAPPED result again. This is
   * distinct from a `FAILED` staging record (design doc §4.2), which IS retried automatically.
   */
  retryable: false
}

export function buildUnmappedPermissionReportEntry(
  permission: BotcSourcePermission,
  migrationRunId: string,
): UnmappedPermissionReportEntry {
  return {
    legacyPermissionId: permission.legacyId,
    legacyPermissionName: permission.permissionName,
    errorCode: UNMAPPED_PERMISSION_ERROR_CODE,
    description: `BOTC izni "${permission.permissionName}" için onaylı MODULE:RESOURCE:ACTION eşlemesi yok (Q-M03 taslağında bu izin için kod tanımlanmamış).`,
    migrationRunId,
    retryable: false,
  }
}

/**
 * BOTC's known `Can*` permission catalogue, classified exactly as
 * docs/migration/BOTC_TO_METNEX_MAPPING.md §2.2 already documents it — reproduced here as a typed
 * constant purely for coverage reporting, not redefined or extended. The 5 approved codes are the
 * single source of truth in `permission-mapping.ts`; this list only adds the Wave classification
 * for the 12 BOTC permissions that are *not* approved, so the coverage report can distinguish
 * "deliberately deferred to Wave 2/3" from "Wave 1-relevant but still awaiting a code decision".
 */
export const KNOWN_BOTC_PERMISSION_WAVE_CLASSIFICATION: Readonly<Record<string, 'WAVE2' | 'WAVE3' | 'WAVE1_UNMAPPED' | 'WAVE4_CANDIDATE_UNMAPPED'>> = {
  CanCreateTicket: 'WAVE2',
  CanViewAllTickets: 'WAVE2',
  CanViewOwnTickets: 'WAVE2',
  CanViewReports: 'WAVE2',
  CanCreateDof: 'WAVE3',
  CanCloseDof: 'WAVE3',
  CanApproveDof: 'WAVE3',
  CanViewDof: 'WAVE3',
  CanViewAllDof: 'WAVE3',
  CanReceiveShiftReportEmail: 'WAVE4_CANDIDATE_UNMAPPED',
  CanAccessSystemTools: 'WAVE1_UNMAPPED',
  CanManageUsers: 'WAVE1_UNMAPPED',
}

export interface PermissionMappingCoverageReport {
  approvedMappings: Array<{ botcPermissionName: string; metnexCode: string }>
  /** BOTC permissions present in the given snapshot with no approved target code. */
  unmappedBotcPermissions: string[]
  /** Of the above, the subset already documented as deliberately deferred to Wave 2/Wave 3. */
  deliberatelyDeferredWave2Wave3: string[]
  /** Real Metnex catalogue codes (`ASSIGNABLE_CATALOGUE`) that have no BOTC-derived source at all. */
  metnexCatalogCodesNotFromBotc: string[]
}

/**
 * Compares a BOTC permission list against the 5 approved codes and the real Metnex catalogue.
 * Read-only — computes a report, does not write anywhere.
 */
export function computePermissionMappingCoverage(
  botcPermissions: readonly BotcSourcePermission[],
): PermissionMappingCoverageReport {
  const approvedMappings = Object.entries(APPROVED_PERMISSION_CODE_MAP).map(([botcPermissionName, metnexCode]) => ({
    botcPermissionName,
    metnexCode,
  }))

  const unmappedBotcPermissions = [...new Set(botcPermissions.filter(p => mapPermissionCode(p.permissionName) === null).map(p => p.permissionName))].sort()

  const deliberatelyDeferredWave2Wave3 = unmappedBotcPermissions.filter(name => {
    const classification = KNOWN_BOTC_PERMISSION_WAVE_CLASSIFICATION[name]
    return classification === 'WAVE2' || classification === 'WAVE3'
  })

  const approvedCodeSet = new Set(Object.values(APPROVED_PERMISSION_CODE_MAP))
  const metnexCatalogCodesNotFromBotc = ASSIGNABLE_CATALOGUE.map(entry => entry.code)
    .filter(code => !approvedCodeSet.has(code))
    .sort()

  return { approvedMappings, unmappedBotcPermissions, deliberatelyDeferredWave2Wave3, metnexCatalogCodesNotFromBotc }
}
