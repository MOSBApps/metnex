import { APPROVED_PERMISSION_CODE_MAP, mapPermissionCode } from './permission-mapping'

describe('mapPermissionCode', () => {
  it('maps the 5 approved BOTC Can* permissions to their draft MODULE:RESOURCE:ACTION code', () => {
    expect(mapPermissionCode('CanManageShifts')).toBe('SHIFT:REPORT:UPDATE')
    expect(mapPermissionCode('CanViewShiftReports')).toBe('SHIFT:REPORT:VIEW')
    expect(mapPermissionCode('CanViewDynamicDashboard')).toBe('SCADA:DASHBOARD:VIEW')
    expect(mapPermissionCode('CanViewHourlyReport')).toBe('REPORT:HOURLY_CONSUMPTION:VIEW')
    expect(mapPermissionCode('CanViewPlantReports')).toBe('REPORT:PLANT:VIEW')
  })

  it('returns null for permissions without an approved draft code (never invents one)', () => {
    expect(mapPermissionCode('CanCreateTicket')).toBeNull()
    expect(mapPermissionCode('CanManageUsers')).toBeNull()
    expect(mapPermissionCode('SomethingThatDoesNotExist')).toBeNull()
  })
})

describe('permission mapping invariants (TASK-027.14)', () => {
  it('APPROVED_PERMISSION_CODE_MAP contains exactly the 5 approved entries — no more, no fewer', () => {
    expect(Object.keys(APPROVED_PERMISSION_CODE_MAP).sort()).toEqual(
      ['CanManageShifts', 'CanViewShiftReports', 'CanViewDynamicDashboard', 'CanViewHourlyReport', 'CanViewPlantReports'].sort(),
    )
    expect(Object.values(APPROVED_PERMISSION_CODE_MAP).sort()).toEqual(
      ['SHIFT:REPORT:UPDATE', 'SHIFT:REPORT:VIEW', 'SCADA:DASHBOARD:VIEW', 'REPORT:HOURLY_CONSUMPTION:VIEW', 'REPORT:PLANT:VIEW'].sort(),
    )
  })

  it('is deterministic — the same input always yields the same output, called any number of times', () => {
    for (let i = 0; i < 10; i += 1) {
      expect(mapPermissionCode('CanManageShifts')).toBe('SHIFT:REPORT:UPDATE')
      expect(mapPermissionCode('CanCreateTicket')).toBeNull()
    }
  })

  it('is a pure function — it never mutates the approved map, even under repeated/concurrent-like calls', () => {
    const before = JSON.stringify(APPROVED_PERMISSION_CODE_MAP)
    mapPermissionCode('CanManageShifts')
    mapPermissionCode('SomeUnknownPermission')
    mapPermissionCode('CanManageShifts')
    expect(JSON.stringify(APPROVED_PERMISSION_CODE_MAP)).toBe(before)
  })

  it('never returns a code for an unknown permission, however the name is spelled (no fuzzy/partial matching)', () => {
    expect(mapPermissionCode('canmanageshifts')).toBeNull() // case must match exactly
    expect(mapPermissionCode('CanManageShifts ')).toBeNull() // no implicit trimming
    expect(mapPermissionCode('')).toBeNull()
  })
})
