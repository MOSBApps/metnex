import { ASSIGNABLE_CATALOGUE } from '../../platform/permission-catalogue'
import { APPROVED_PERMISSION_CODE_MAP } from './permission-mapping'
import {
  buildUnmappedPermissionReportEntry,
  computePermissionMappingCoverage,
  UNMAPPED_PERMISSION_ERROR_CODE,
} from './permission-coverage'
import type { BotcSourcePermission } from './types'

describe('buildUnmappedPermissionReportEntry', () => {
  it('produces the fixed report shape with all 6 required fields', () => {
    const permission: BotcSourcePermission = { legacyId: '101', permissionName: 'CanCreateTicket' }
    const entry = buildUnmappedPermissionReportEntry(permission, 'run-1')

    expect(entry).toEqual({
      legacyPermissionId: '101',
      legacyPermissionName: 'CanCreateTicket',
      errorCode: UNMAPPED_PERMISSION_ERROR_CODE,
      description: expect.stringContaining('CanCreateTicket'),
      migrationRunId: 'run-1',
      retryable: false,
    })
  })

  it('is deterministic for the same input', () => {
    const permission: BotcSourcePermission = { legacyId: '101', permissionName: 'CanCreateTicket' }
    expect(buildUnmappedPermissionReportEntry(permission, 'run-1')).toEqual(buildUnmappedPermissionReportEntry(permission, 'run-1'))
  })

  it('never invents a target code — the report has no code/mapping field at all', () => {
    const permission: BotcSourcePermission = { legacyId: '101', permissionName: 'CanCreateTicket' }
    const entry = buildUnmappedPermissionReportEntry(permission, 'run-1')
    expect(Object.keys(entry)).not.toContain('targetCode')
    expect(Object.keys(entry)).not.toContain('metnexCode')
  })
})

describe('computePermissionMappingCoverage', () => {
  const fullBotcPermissionSet: BotcSourcePermission[] = [
    { legacyId: '1', permissionName: 'CanCreateTicket' },
    { legacyId: '2', permissionName: 'CanViewAllTickets' },
    { legacyId: '3', permissionName: 'CanViewOwnTickets' },
    { legacyId: '4', permissionName: 'CanViewReports' },
    { legacyId: '5', permissionName: 'CanCreateDof' },
    { legacyId: '6', permissionName: 'CanCloseDof' },
    { legacyId: '7', permissionName: 'CanApproveDof' },
    { legacyId: '8', permissionName: 'CanViewDof' },
    { legacyId: '9', permissionName: 'CanViewAllDof' },
    { legacyId: '10', permissionName: 'CanManageShifts' },
    { legacyId: '11', permissionName: 'CanViewShiftReports' },
    { legacyId: '12', permissionName: 'CanReceiveShiftReportEmail' },
    { legacyId: '13', permissionName: 'CanViewDynamicDashboard' },
    { legacyId: '14', permissionName: 'CanViewHourlyReport' },
    { legacyId: '15', permissionName: 'CanViewPlantReports' },
    { legacyId: '16', permissionName: 'CanAccessSystemTools' },
    { legacyId: '17', permissionName: 'CanManageUsers' },
  ]

  it('reports exactly the 5 approved mappings, verbatim from permission-mapping.ts', () => {
    const report = computePermissionMappingCoverage(fullBotcPermissionSet)
    expect(report.approvedMappings).toHaveLength(5)
    for (const { botcPermissionName, metnexCode } of report.approvedMappings) {
      expect(APPROVED_PERMISSION_CODE_MAP[botcPermissionName]).toBe(metnexCode)
    }
  })

  it('reports the 12 known unmapped BOTC permissions for the full 17-permission set', () => {
    const report = computePermissionMappingCoverage(fullBotcPermissionSet)
    expect(report.unmappedBotcPermissions).toHaveLength(12)
    expect(report.unmappedBotcPermissions).not.toContain('CanManageShifts') // approved, must not appear
  })

  it('classifies the Wave 2 + Wave 3 subset (9 permissions) as deliberately deferred', () => {
    const report = computePermissionMappingCoverage(fullBotcPermissionSet)
    expect(report.deliberatelyDeferredWave2Wave3.sort()).toEqual(
      ['CanCreateTicket', 'CanViewAllTickets', 'CanViewOwnTickets', 'CanViewReports', 'CanCreateDof', 'CanCloseDof', 'CanApproveDof', 'CanViewDof', 'CanViewAllDof'].sort(),
    )
    // Wave1/Wave4-candidate unmapped permissions must NOT be classified as Wave2/3-deferred.
    expect(report.deliberatelyDeferredWave2Wave3).not.toContain('CanAccessSystemTools')
    expect(report.deliberatelyDeferredWave2Wave3).not.toContain('CanReceiveShiftReportEmail')
  })

  it('reports every real Metnex catalogue code as not-from-BOTC (no overlap exists yet)', () => {
    const report = computePermissionMappingCoverage(fullBotcPermissionSet)
    expect(report.metnexCatalogCodesNotFromBotc).toHaveLength(ASSIGNABLE_CATALOGUE.length)
    for (const entry of ASSIGNABLE_CATALOGUE) expect(report.metnexCatalogCodesNotFromBotc).toContain(entry.code)
  })

  it('is deterministic and order-independent', () => {
    const shuffled = [...fullBotcPermissionSet].reverse()
    const a = computePermissionMappingCoverage(fullBotcPermissionSet)
    const b = computePermissionMappingCoverage(shuffled)
    expect(a).toEqual(b)
  })

  it('deduplicates repeated permission names without producing duplicate report entries', () => {
    const duplicated = [...fullBotcPermissionSet, { legacyId: '18', permissionName: 'CanCreateTicket' }]
    const report = computePermissionMappingCoverage(duplicated)
    expect(report.unmappedBotcPermissions.filter(n => n === 'CanCreateTicket')).toHaveLength(1)
  })

  it('handles an empty BOTC permission list without error', () => {
    const report = computePermissionMappingCoverage([])
    expect(report.unmappedBotcPermissions).toEqual([])
    expect(report.deliberatelyDeferredWave2Wave3).toEqual([])
    expect(report.approvedMappings).toHaveLength(5) // approved mappings are a fixed catalogue property, independent of input
  })
})
