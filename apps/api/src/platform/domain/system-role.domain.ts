export interface BuiltinRoleSeed {
  name: string
  description: string
  permissions: string[]
}

export const BUILTIN_ROLE_NAMES = ['SYSTEM_ADMIN', 'TENANT_ADMIN', 'VIEWER'] as const

export const BUILTIN_PERMISSIONS = [
  'PLATFORM:USER:VIEW',
  'PLATFORM:USER:CREATE',
  'PLATFORM:USER:UPDATE',
  'PLATFORM:USER:DEACTIVATE',
  'PLATFORM:USER:ASSIGN_ROLE',
  'PLATFORM:USER:REVOKE_ROLE',
  'PLATFORM:USER:MANAGE_MEMBERSHIP',
  'PLATFORM:TENANT:VIEW',
  'PLATFORM:TENANT:CREATE',
  'PLATFORM:TENANT:UPDATE',
  'PLATFORM:TENANT:SUSPEND',
  'PLATFORM:TENANT:ARCHIVE',
  'PLATFORM:ROLE:VIEW',
  'PLATFORM:ROLE:CREATE',
  'PLATFORM:PERMISSION:VIEW',
  'PLATFORM:PERMISSION:ASSIGN',
  'PLATFORM:SETTINGS:GENERAL:VIEW',
  'PLATFORM:SETTINGS:GENERAL:MANAGE',
  'PLATFORM:SETTINGS:SMTP:VIEW',
  'PLATFORM:SETTINGS:SMTP:MANAGE',
  'PLATFORM:SETTINGS:AI_PROVIDER:VIEW',
  'PLATFORM:SETTINGS:AI_PROVIDER:MANAGE',
  'PLATFORM:PACKAGE:VIEW',
  'PLATFORM:PACKAGE:MANAGE',
  'PLATFORM:CUSTOMER:VIEW',
  'PLATFORM:CUSTOMER:PROVISION',
  'CUSTOMER:ADMIN:VIEW',
  'CUSTOMER:ADMIN:MANAGE',
  'REPORT:ARTIFACT:VIEW',
  'REPORT:ARTIFACT:EXPORT',
] as const

export const BUILTIN_ROLES: BuiltinRoleSeed[] = [
  {
    name: 'SYSTEM_ADMIN',
    description: 'Platform-wide full authority',
    permissions: [...BUILTIN_PERMISSIONS],
  },
  {
    name: 'TENANT_ADMIN',
    description: 'Customer-root admin across the root tenant and all descendants',
    permissions: [
      'PLATFORM:USER:VIEW',
      'PLATFORM:USER:CREATE',
      'PLATFORM:USER:UPDATE',
      'PLATFORM:ROLE:VIEW',
      'PLATFORM:TENANT:VIEW',
      'PLATFORM:TENANT:CREATE',
      'PLATFORM:TENANT:UPDATE',
      'CUSTOMER:ADMIN:VIEW',
      'CUSTOMER:ADMIN:MANAGE',
      'REPORT:ARTIFACT:VIEW',
      'REPORT:ARTIFACT:EXPORT',
    ],
  },
  {
    name: 'VIEWER',
    description: 'Read-only platform visibility',
    permissions: ['PLATFORM:USER:VIEW', 'PLATFORM:TENANT:VIEW', 'PLATFORM:ROLE:VIEW'],
  },
]

export function validateRoleCreation(input: { name: string; description?: string }) {
  const errors: string[] = []
  const trimmedName = input.name.trim().toUpperCase()
  const builtinNames = new Set<string>(BUILTIN_ROLE_NAMES)

  if (trimmedName.length < 2) errors.push('Rol adı en az 2 karakter olmalıdır')
  if (trimmedName.length > 64) errors.push('Rol adı en fazla 64 karakter olabilir')
  if (!/^[A-Z0-9_]+$/.test(trimmedName)) {
    errors.push('Rol adı yalnızca A-Z, 0-9 ve _ içerebilir')
  }
  if (builtinNames.has(trimmedName)) {
    errors.push('Yerleşik rol adları yeniden kullanılamaz')
  }
  if (input.description && input.description.trim().length > 200) {
    errors.push('Açıklama en fazla 200 karakter olabilir')
  }

  return { valid: errors.length === 0, errors }
}

export function canAssignPermissionToRole(existingCodes: string[], permissionCode: string) {
  if (existingCodes.includes(permissionCode)) {
    return { valid: false, reason: 'Bu izin role zaten atanmış' }
  }
  return { valid: true }
}

export interface RoleMutationResult {
  allowed: boolean
  reason?: 'BUILTIN_ROLE'
}

export function canMutateRole(role: { isBuiltin: boolean }): RoleMutationResult {
  if (role.isBuiltin) {
    return { allowed: false, reason: 'BUILTIN_ROLE' }
  }
  return { allowed: true }
}
