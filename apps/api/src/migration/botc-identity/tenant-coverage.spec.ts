import { buildTenantMappingReportEntry, computeTenantMappingCoverage, KNOWN_PENDING_LOCATION_CATEGORIES } from './tenant-coverage'
import type { ApprovedTenantAssignmentEntry, BotcSourceUser } from './types'

function user(legacyId: string, sirket: string | null = null): BotcSourceUser {
  return { legacyId, username: `u${legacyId}`, fullName: `User ${legacyId}`, isActive: true, email: `u${legacyId}@example.com`, createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: null, sirket }
}

describe('buildTenantMappingReportEntry', () => {
  it('produces the fixed ASSIGNED shape with all 7 required fields', () => {
    const entry = buildTenantMappingReportEntry('1', { tenantSlug: 'MOSB', status: 'ASSIGNED' }, 'run-1')
    expect(entry).toEqual({
      sourceLegacyUserId: '1',
      tenantSlug: 'MOSB',
      status: 'ASSIGNED',
      errorCode: null,
      description: expect.stringContaining('MOSB'),
      migrationRunId: 'run-1',
      retryable: false,
    })
  })

  it('produces the fixed UNRESOLVED shape', () => {
    const entry = buildTenantMappingReportEntry('2', { tenantSlug: null, status: 'UNRESOLVED' }, 'run-1')
    expect(entry).toEqual({
      sourceLegacyUserId: '2',
      tenantSlug: null,
      status: 'UNRESOLVED',
      errorCode: 'UNRESOLVED_TENANT_MAPPING',
      description: expect.any(String),
      migrationRunId: 'run-1',
      retryable: false,
    })
  })

  it('is deterministic for the same input', () => {
    const a = buildTenantMappingReportEntry('1', { tenantSlug: 'MOSB', status: 'ASSIGNED' }, 'run-1')
    const b = buildTenantMappingReportEntry('1', { tenantSlug: 'MOSB', status: 'ASSIGNED' }, 'run-1')
    expect(a).toEqual(b)
  })

  it('never mentions Sirket anywhere in the produced description', () => {
    const assigned = buildTenantMappingReportEntry('1', { tenantSlug: 'MOSB', status: 'ASSIGNED' }, 'run-1')
    const unresolved = buildTenantMappingReportEntry('2', { tenantSlug: null, status: 'UNRESOLVED' }, 'run-1')
    expect(assigned.description.toLowerCase()).not.toContain('sirket')
    expect(unresolved.description.toLowerCase()).not.toContain('sirket')
  })
})

describe('computeTenantMappingCoverage', () => {
  const users: BotcSourceUser[] = [user('1'), user('2'), user('3'), user('4', 'KÖMÜR KAZANI')]
  const table: ApprovedTenantAssignmentEntry[] = [
    { userLegacyId: '1', tenantSlug: 'MOSB' },
    { userLegacyId: '2', tenantSlug: 'MOSBIO' },
    // '3' and '4' intentionally absent -> UNRESOLVED
  ]

  it('reports total/assigned/unresolved counts correctly', () => {
    const report = computeTenantMappingCoverage(users, table)
    expect(report.totalSourceUsers).toBe(4)
    expect(report.usersInMappingTable).toBe(2)
    expect(report.assignedUsers).toBe(2)
    expect(report.unresolvedUsers).toBe(2)
    expect(report.conflictRecords).toBe(0)
    expect(report.orphanMappingRecords).toBe(0)
  })

  it('breaks down assigned users by tenant', () => {
    const report = computeTenantMappingCoverage(users, table)
    expect(report.usersByTenant).toEqual({ MOSB: 1, MOSEDAS: 0, MOSBIO: 1 })
  })

  it('reports conflicting mapping entries without granting access (TASK-027.15-R1)', () => {
    const conflicting: ApprovedTenantAssignmentEntry[] = [
      { userLegacyId: '1', tenantSlug: 'MOSB' },
      { userLegacyId: '1', tenantSlug: 'MOSEDAS' },
    ]
    const report = computeTenantMappingCoverage(users, conflicting)
    expect(report.conflictRecords).toBe(1)
    // security fix: a conflict must NEVER resolve to any value (not even the "first" one) — the
    // conflicted user counts as unresolved, not assigned.
    expect(report.assignedUsers).toBe(0)
    expect(report.unresolvedUsers).toBe(users.length)
  })

  it('reports orphan mapping entries (mapping for a user absent from the source snapshot)', () => {
    const withOrphan: ApprovedTenantAssignmentEntry[] = [...table, { userLegacyId: '999', tenantSlug: 'MOSB' }]
    const report = computeTenantMappingCoverage(users, withOrphan)
    expect(report.orphanMappingRecords).toBe(1)
  })

  it('exposes the known pending location categories as a static, Sirket-independent reference list', () => {
    const report = computeTenantMappingCoverage(users, table)
    expect(report.knownPendingLocationCategories).toEqual(KNOWN_PENDING_LOCATION_CATEGORIES)
    expect(report.knownPendingLocationCategories).toContain('KÖMÜR KAZANI')
  })

  it('is deterministic and unaffected by user array order', () => {
    const a = computeTenantMappingCoverage(users, table)
    const b = computeTenantMappingCoverage([...users].reverse(), table)
    expect(a).toEqual(b)
  })

  it('never reads Sirket — a user with a Sirket value but no table entry is still just UNRESOLVED, not attributed to a specific reason', () => {
    const report = computeTenantMappingCoverage(users, table)
    // user '4' has sirket = 'KÖMÜR KAZANI' but is counted purely as UNRESOLVED, with no per-user
    // "reason" derived from that field anywhere in the coverage report shape.
    expect(report.unresolvedUsers).toBe(2)
    expect(Object.keys(report)).not.toContain('unresolvedReasonsByUser')
  })

  it('handles an empty mapping table without error (all users UNRESOLVED)', () => {
    const report = computeTenantMappingCoverage(users, [])
    expect(report.assignedUsers).toBe(0)
    expect(report.unresolvedUsers).toBe(4)
  })
})
