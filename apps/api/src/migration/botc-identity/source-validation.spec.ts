import { validateSourceSnapshot } from './source-validation'
import type { BotcIdentitySourceSnapshot } from './types'

function baseSnapshot(): BotcIdentitySourceSnapshot {
  return {
    users: [
      { legacyId: '1', username: 'u1', fullName: 'User One', isActive: true, email: 'u1@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: '10', sirket: null },
    ],
    roles: [{ legacyId: '10', name: 'Operatör' }],
    permissions: [{ legacyId: '100', permissionName: 'CanManageShifts' }],
    userPermissions: [{ legacyId: '1000', userLegacyId: '1', permissionLegacyId: '100' }],
  }
}

describe('validateSourceSnapshot', () => {
  it('is clean (no issues, not fatal) for a well-formed snapshot and mapping table', () => {
    const result = validateSourceSnapshot(baseSnapshot(), [{ userLegacyId: '1', tenantSlug: 'MOSB' }])
    expect(result.issues).toEqual([])
    expect(result.isFatal).toBe(false)
  })

  it('flags an empty legacy id as fatal', () => {
    const snapshot = baseSnapshot()
    snapshot.users.push({ legacyId: '   ', username: 'ghost', fullName: 'Ghost', isActive: true, email: null, createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: null, sirket: null })
    const result = validateSourceSnapshot(snapshot, [])
    expect(result.isFatal).toBe(true)
    expect(result.issues.some(i => i.code === 'FATAL_EMPTY_LEGACY_ID' && i.sourceEntityType === 'USER')).toBe(true)
  })

  it('flags a duplicate legacy id within the same entity type as fatal, deterministically', () => {
    const snapshot = baseSnapshot()
    snapshot.users.push({ legacyId: '1', username: 'u1-dup', fullName: 'User One Dup', isActive: true, email: 'dup@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: null, sirket: null })
    const first = validateSourceSnapshot(snapshot, [])
    const second = validateSourceSnapshot(snapshot, [])
    expect(first.isFatal).toBe(true)
    expect(first.issues.filter(i => i.code === 'FATAL_DUPLICATE_LEGACY_ID')).toHaveLength(1)
    expect(first).toEqual(second)
  })

  it('flags an orphan role reference as recoverable (non-fatal)', () => {
    const snapshot = baseSnapshot()
    snapshot.users[0]!.roleLegacyId = '999'
    const result = validateSourceSnapshot(snapshot, [])
    expect(result.issues.some(i => i.code === 'RECOVERABLE_ORPHAN_ROLE_REFERENCE')).toBe(true)
    expect(result.isFatal).toBe(false)
  })

  it('flags an orphan permission reference on a UserPermission grant', () => {
    const snapshot = baseSnapshot()
    snapshot.userPermissions.push({ legacyId: '1001', userLegacyId: '1', permissionLegacyId: '999' })
    const result = validateSourceSnapshot(snapshot, [])
    expect(result.issues.some(i => i.code === 'RECOVERABLE_ORPHAN_PERMISSION_REFERENCE' && i.sourceLegacyId === '1001')).toBe(true)
  })

  it('flags an orphan user reference on a UserPermission grant', () => {
    const snapshot = baseSnapshot()
    snapshot.userPermissions.push({ legacyId: '1002', userLegacyId: '999', permissionLegacyId: '100' })
    const result = validateSourceSnapshot(snapshot, [])
    expect(result.issues.some(i => i.code === 'RECOVERABLE_ORPHAN_USER_REFERENCE' && i.sourceLegacyId === '1002')).toBe(true)
  })

  it('flags an invalid (unknown) tenant slug in the approved mapping table as fatal', () => {
    const result = validateSourceSnapshot(baseSnapshot(), [{ userLegacyId: '1', tenantSlug: 'NOT_A_TENANT' as never }])
    expect(result.isFatal).toBe(true)
    expect(result.issues.some(i => i.code === 'FATAL_INVALID_TENANT_SLUG')).toBe(true)
  })

  it('flags a conflicting tenant mapping entry as fatal', () => {
    const result = validateSourceSnapshot(baseSnapshot(), [
      { userLegacyId: '1', tenantSlug: 'MOSB' },
      { userLegacyId: '1', tenantSlug: 'MOSBIO' },
    ])
    expect(result.isFatal).toBe(true)
    expect(result.issues.some(i => i.code === 'FATAL_CONFLICTING_TENANT_ASSIGNMENT')).toBe(true)
  })

  it('flags missing required fields (empty Username/Role.Name/PermissionName)', () => {
    const snapshot = baseSnapshot()
    snapshot.users[0]!.username = '   '
    snapshot.roles[0]!.name = ''
    snapshot.permissions[0]!.permissionName = ''
    const result = validateSourceSnapshot(snapshot, [])
    expect(result.isFatal).toBe(true)
    expect(result.issues.filter(i => i.code === 'FATAL_MISSING_REQUIRED_FIELD')).toHaveLength(3)
  })

  it('never reads Sirket for anything — no issue code references it', () => {
    const snapshot = baseSnapshot()
    snapshot.users[0]!.sirket = 'KÖMÜR KAZANI'
    const result = validateSourceSnapshot(snapshot, [])
    expect(result.issues).toEqual([])
  })
})

describe('validateSourceSnapshot — tenant mapping rules (TASK-027.15)', () => {
  it('flags an empty-string tenant slug as fatal, distinct from null (which is valid/unresolved)', () => {
    const emptySlugResult = validateSourceSnapshot(baseSnapshot(), [{ userLegacyId: '1', tenantSlug: '' as never }])
    expect(emptySlugResult.isFatal).toBe(true)
    expect(emptySlugResult.issues.some(i => i.code === 'FATAL_EMPTY_TENANT_SLUG')).toBe(true)

    const nullSlugResult = validateSourceSnapshot(baseSnapshot(), [{ userLegacyId: '1', tenantSlug: null }])
    expect(nullSlugResult.isFatal).toBe(false)
  })

  it('flags a tenant mapping entry for a user absent from the source snapshot as recoverable (orphan mapping)', () => {
    const result = validateSourceSnapshot(baseSnapshot(), [{ userLegacyId: '999', tenantSlug: 'MOSB' }])
    expect(result.issues.some(i => i.code === 'RECOVERABLE_ORPHAN_TENANT_MAPPING_ENTRY' && i.sourceLegacyId === '999')).toBe(true)
    expect(result.isFatal).toBe(false)
  })

  it('flags an exact duplicate tenant mapping row as a warning (not fatal, not silently ignored)', () => {
    const result = validateSourceSnapshot(baseSnapshot(), [
      { userLegacyId: '1', tenantSlug: 'MOSB' },
      { userLegacyId: '1', tenantSlug: 'MOSB' },
    ])
    expect(result.issues.some(i => i.code === 'WARNING_DUPLICATE_TENANT_MAPPING_ROW')).toBe(true)
    expect(result.isFatal).toBe(false)
  })

  it('is deterministic across repeated calls for tenant validation rules', () => {
    const snapshot = baseSnapshot()
    const table = [
      { userLegacyId: '1', tenantSlug: 'MOSB' as const },
      { userLegacyId: '1', tenantSlug: 'MOSB' as const },
      { userLegacyId: '999', tenantSlug: 'MOSB' as const },
    ]
    expect(validateSourceSnapshot(snapshot, table)).toEqual(validateSourceSnapshot(snapshot, table))
  })
})
