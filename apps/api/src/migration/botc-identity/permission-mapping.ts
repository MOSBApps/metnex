/**
 * Q-M03 closure (TASK-027.12-R1): "the existing MODULE:RESOURCE:ACTION draft mapping will be
 * used." This is that draft, taken verbatim from docs/migration/BOTC_TO_METNEX_MAPPING.md §2.2 —
 * only the 5 BOTC `Can*` permissions that already have a concrete target code there are mapped.
 * The remaining 11 (Wave 2 Ticket, Wave 3 DÖF, and the two admin-area permissions described only
 * in prose without a fixed code) are intentionally left unmapped rather than inventing a new code
 * — that would be a new architecture decision outside this task's approved scope. Unmapped
 * permissions are reported as recoverable/warning issues by the migration run, never silently
 * dropped or guessed.
 */
export const APPROVED_PERMISSION_CODE_MAP: Readonly<Record<string, string>> = {
  CanManageShifts: 'SHIFT:REPORT:UPDATE',
  CanViewShiftReports: 'SHIFT:REPORT:VIEW',
  CanViewDynamicDashboard: 'SCADA:DASHBOARD:VIEW',
  CanViewHourlyReport: 'REPORT:HOURLY_CONSUMPTION:VIEW',
  CanViewPlantReports: 'REPORT:PLANT:VIEW',
}

export function mapPermissionCode(botcPermissionName: string): string | null {
  return APPROVED_PERMISSION_CODE_MAP[botcPermissionName] ?? null
}
