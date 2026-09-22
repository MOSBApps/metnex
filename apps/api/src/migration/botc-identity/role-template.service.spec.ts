import { RoleTemplateService } from './role-template.service'
import type { BotcSourcePermission, BotcSourceRole, BotcSourceUser, BotcSourceUserPermission } from './types'

describe('RoleTemplateService', () => {
  const service = new RoleTemplateService()

  const users: BotcSourceUser[] = [
    { legacyId: '1', username: 'op1', fullName: 'Op 1', isActive: true, email: 'op1@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: '10', sirket: null },
    { legacyId: '2', username: 'op2', fullName: 'Op 2', isActive: true, email: 'op2@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: '10', sirket: null },
    { legacyId: '3', username: 'viewer', fullName: 'Viewer', isActive: true, email: 'viewer@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: '20', sirket: null },
    { legacyId: '4', username: 'nobody', fullName: 'Nobody', isActive: true, email: 'nobody@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: null, sirket: null },
  ]

  const roles: BotcSourceRole[] = [
    { legacyId: '10', name: 'Operatör' },
    { legacyId: '20', name: 'Görüntüleyici' },
  ]

  const permissions: BotcSourcePermission[] = [
    { legacyId: '100', permissionName: 'CanManageShifts' },
    { legacyId: '101', permissionName: 'CanViewShiftReports' },
    { legacyId: '102', permissionName: 'CanCreateTicket' }, // unmapped
  ]

  const userPermissions: BotcSourceUserPermission[] = [
    { legacyId: '1000', userLegacyId: '1', permissionLegacyId: '100' },
    { legacyId: '1001', userLegacyId: '1', permissionLegacyId: '101' },
    { legacyId: '1002', userLegacyId: '2', permissionLegacyId: '100' },
    { legacyId: '1003', userLegacyId: '2', permissionLegacyId: '101' },
    { legacyId: '1004', userLegacyId: '3', permissionLegacyId: '101' },
    { legacyId: '1005', userLegacyId: '4', permissionLegacyId: '102' }, // unmapped only
  ]

  it('groups users with identical effective (mapped) permission sets into one shared template', () => {
    const permissionsByLegacyId = new Map(permissions.map(p => [p.legacyId, p.permissionName]))
    const effective = service.computeEffectivePermissions(users, userPermissions, permissionsByLegacyId)
    expect(effective.get('1')?.mappedPermissionCodes).toEqual(['SHIFT:REPORT:UPDATE', 'SHIFT:REPORT:VIEW'])
    expect(effective.get('4')?.mappedPermissionCodes).toEqual([])
    expect(effective.get('4')?.unmappedPermissionNames).toEqual(['CanCreateTicket'])

    const rolesByLegacyId = new Map(roles.map(r => [r.legacyId, r]))
    const templates = service.buildTemplates(effective, users, rolesByLegacyId)

    const operatorTemplate = templates.find(t => t.memberUserLegacyIds.includes('1'))
    expect(operatorTemplate?.memberUserLegacyIds.sort()).toEqual(['1', '2'])
    expect(operatorTemplate?.name).toBe('Operatör')

    const viewerTemplate = templates.find(t => t.memberUserLegacyIds.includes('3'))
    expect(viewerTemplate?.permissionCodes).toEqual(['SHIFT:REPORT:VIEW'])

    const emptyTemplate = templates.find(t => t.memberUserLegacyIds.includes('4'))
    expect(emptyTemplate?.name).toBe('NO_ADDITIONAL_PERMISSIONS')
  })

  it('produces the same template ids across repeated calls (deterministic, idempotent)', () => {
    const permissionsByLegacyId = new Map(permissions.map(p => [p.legacyId, p.permissionName]))
    const rolesByLegacyId = new Map(roles.map(r => [r.legacyId, r]))
    const effective1 = service.computeEffectivePermissions(users, userPermissions, permissionsByLegacyId)
    const templates1 = service.buildTemplates(effective1, users, rolesByLegacyId)

    const effective2 = service.computeEffectivePermissions([...users].reverse(), [...userPermissions].reverse(), permissionsByLegacyId)
    const templates2 = service.buildTemplates(effective2, users, rolesByLegacyId)

    expect(templates1.map(t => t.templateId).sort()).toEqual(templates2.map(t => t.templateId).sort())
  })
})

describe('RoleTemplateService — determinism invariants (TASK-027.14 scope item 6)', () => {
  const service = new RoleTemplateService()
  const permissionsByLegacyId = new Map([
    ['100', 'CanManageShifts'],
    ['101', 'CanViewShiftReports'],
    ['102', 'CanCreateTicket'], // unmapped
  ])
  const users: BotcSourceUser[] = [
    { legacyId: '1', username: 'u1', fullName: 'U1', isActive: true, email: 'u1@example.com', createdDate: '2020-01-01T00:00:00.000Z', roleLegacyId: null, sirket: null },
  ]
  const rolesByLegacyId = new Map<string, BotcSourceRole>()

  it('permission order does not change the resulting template signature/id', () => {
    const forward: BotcSourceUserPermission[] = [
      { legacyId: '1', userLegacyId: '1', permissionLegacyId: '100' },
      { legacyId: '2', userLegacyId: '1', permissionLegacyId: '101' },
    ]
    const reversed: BotcSourceUserPermission[] = [...forward].reverse()

    const effectiveForward = service.computeEffectivePermissions(users, forward, permissionsByLegacyId)
    const effectiveReversed = service.computeEffectivePermissions(users, reversed, permissionsByLegacyId)

    const templatesForward = service.buildTemplates(effectiveForward, users, rolesByLegacyId)
    const templatesReversed = service.buildTemplates(effectiveReversed, users, rolesByLegacyId)

    expect(templatesForward[0]?.templateId).toBe(templatesReversed[0]?.templateId)
    expect(templatesForward[0]?.permissionCodes).toEqual(templatesReversed[0]?.permissionCodes)
  })

  it('a duplicate UserPermission grant (same permission granted twice) does not produce a duplicate code in the template', () => {
    const withDuplicate: BotcSourceUserPermission[] = [
      { legacyId: '1', userLegacyId: '1', permissionLegacyId: '100' },
      { legacyId: '2', userLegacyId: '1', permissionLegacyId: '100' }, // duplicate grant, different staging row
    ]
    const effective = service.computeEffectivePermissions(users, withDuplicate, permissionsByLegacyId)
    expect(effective.get('1')?.mappedPermissionCodes).toEqual(['SHIFT:REPORT:UPDATE'])

    const templates = service.buildTemplates(effective, users, rolesByLegacyId)
    expect(templates).toHaveLength(1)
    expect(templates[0]?.permissionCodes).toEqual(['SHIFT:REPORT:UPDATE'])
  })

  it('an unmapped permission grant does not change the template signature for an otherwise-identical user', () => {
    const withoutUnmapped: BotcSourceUserPermission[] = [{ legacyId: '1', userLegacyId: '1', permissionLegacyId: '100' }]
    const withUnmapped: BotcSourceUserPermission[] = [
      { legacyId: '1', userLegacyId: '1', permissionLegacyId: '100' },
      { legacyId: '2', userLegacyId: '1', permissionLegacyId: '102' }, // unmapped, must not affect signature
    ]

    const effectiveA = service.computeEffectivePermissions(users, withoutUnmapped, permissionsByLegacyId)
    const effectiveB = service.computeEffectivePermissions(users, withUnmapped, permissionsByLegacyId)
    const templatesA = service.buildTemplates(effectiveA, users, rolesByLegacyId)
    const templatesB = service.buildTemplates(effectiveB, users, rolesByLegacyId)

    expect(templatesA[0]?.templateId).toBe(templatesB[0]?.templateId)
    expect(effectiveB.get('1')?.unmappedPermissionNames).toEqual(['CanCreateTicket'])
  })
})
