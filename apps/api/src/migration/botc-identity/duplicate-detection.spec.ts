import { detectConflictingTenantAssignments, detectDuplicateRoleNames, detectDuplicateUsers } from './duplicate-detection'
import type { BotcSourceRole, BotcSourceUser } from './types'

describe('detectDuplicateUsers', () => {
  const user = (legacyId: string, username: string, email: string | null): BotcSourceUser => ({
    legacyId,
    username,
    fullName: `User ${legacyId}`,
    isActive: true,
    email,
    createdDate: '2020-01-01T00:00:00.000Z',
    roleLegacyId: null,
    sirket: null,
  })

  it('deterministically keeps the smallest legacyId as the winner for duplicate email', () => {
    const users = [user('3', 'c', 'shared@example.com'), user('1', 'a', 'shared@example.com'), user('2', 'b', 'other@example.com')]
    const { winners, issues } = detectDuplicateUsers(users)
    expect([...winners.keys()].sort()).toEqual(['1', '2'])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.sourceLegacyId).toBe('3')
    expect(issues[0]?.category).toBe('RECOVERABLE')
  })

  it('is deterministic across repeated calls with the same input', () => {
    const users = [user('5', 'x', 'dup@example.com'), user('4', 'x', 'dup@example.com')]
    const first = detectDuplicateUsers(users)
    const second = detectDuplicateUsers(users)
    expect([...first.winners.keys()]).toEqual([...second.winners.keys()])
    expect(first.issues).toEqual(second.issues)
  })

  it('flags duplicate usernames even without a shared email', () => {
    const users = [user('1', 'shared-name', 'a@example.com'), user('2', 'shared-name', 'b@example.com')]
    const { winners, issues } = detectDuplicateUsers(users)
    expect(winners.has('1')).toBe(true)
    expect(winners.has('2')).toBe(false)
    expect(issues).toHaveLength(1)
  })
})

describe('detectDuplicateRoleNames', () => {
  it('reports duplicate role names as warnings, not fatal', () => {
    const roles: BotcSourceRole[] = [
      { legacyId: '1', name: 'Operatör' },
      { legacyId: '2', name: 'operatör' },
    ]
    const issues = detectDuplicateRoleNames(roles)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.category).toBe('WARNING')
    expect(issues[0]?.sourceLegacyId).toBe('2')
  })
})

describe('detectConflictingTenantAssignments', () => {
  it('excludes a conflicted user from `resolved` entirely (no access value, not even the first) and reports it as fatal (TASK-027.15-R1)', () => {
    const { resolved, issues } = detectConflictingTenantAssignments([
      { userLegacyId: '1', tenantSlug: 'MOSB' },
      { userLegacyId: '1', tenantSlug: 'MOSBIO' },
    ])
    expect(resolved.has('1')).toBe(false)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.category).toBe('FATAL')
    expect(issues[0]?.code).toBe('FATAL_CONFLICTING_TENANT_ASSIGNMENT')
  })

  it('a third, later entry for the same conflicted user does not re-add them to `resolved` or produce a duplicate issue', () => {
    const { resolved, issues } = detectConflictingTenantAssignments([
      { userLegacyId: '1', tenantSlug: 'MOSB' },
      { userLegacyId: '1', tenantSlug: 'MOSBIO' },
      { userLegacyId: '1', tenantSlug: 'MOSB' },
    ])
    expect(resolved.has('1')).toBe(false)
    expect(issues).toHaveLength(1)
  })

  it('does not affect other, non-conflicted users in the same table', () => {
    const { resolved, issues } = detectConflictingTenantAssignments([
      { userLegacyId: '1', tenantSlug: 'MOSB' },
      { userLegacyId: '1', tenantSlug: 'MOSBIO' },
      { userLegacyId: '2', tenantSlug: 'MOSEDAS' },
    ])
    expect(resolved.has('1')).toBe(false)
    expect(resolved.get('2')?.tenantSlug).toBe('MOSEDAS')
    expect(issues).toHaveLength(1)
  })

  it('does not flag repeated identical entries', () => {
    const { issues } = detectConflictingTenantAssignments([
      { userLegacyId: '1', tenantSlug: 'MOSB' },
      { userLegacyId: '1', tenantSlug: 'MOSB' },
    ])
    expect(issues).toHaveLength(0)
  })
})
