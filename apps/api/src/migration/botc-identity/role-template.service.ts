import { createHash } from 'crypto'
import { mapPermissionCode } from './permission-mapping'
import type { BotcSourceRole, BotcSourceUser, BotcSourceUserPermission } from './types'

export interface UserEffectivePermissions {
  userLegacyId: string
  mappedPermissionCodes: string[]
  unmappedPermissionNames: string[]
}

export interface TenantRoleTemplate {
  templateId: string
  name: string
  permissionCodes: string[]
  memberUserLegacyIds: string[]
}

/**
 * Q-M04 closure (TASK-027.12-R1): no per-user role — users are clustered by their effective,
 * already-mapped permission set into shared tenant role templates. BOTC's own `Role` table carries
 * no permissions (only a name/description, see BOTC_SOURCE_SCHEMA_INVENTORY.md §2.2) — the actual
 * permission grants come from `UserPermission`. This clustering algorithm and the template naming
 * heuristic (majority BOTC role name, else a deterministic hash-based name) are an implementation
 * detail explicitly left open by the design doc (METNEX_IDENTITY_TARGET_AND_MIGRATION_STAGING_SCHEMA.md
 * §12) — not a new PO-level architecture decision.
 */
export class RoleTemplateService {
  computeEffectivePermissions(
    users: readonly BotcSourceUser[],
    userPermissions: readonly BotcSourceUserPermission[],
    permissionsByLegacyId: ReadonlyMap<string, string>,
  ): Map<string, UserEffectivePermissions> {
    const byUser = new Map<string, UserEffectivePermissions>()
    for (const user of users) {
      byUser.set(user.legacyId, { userLegacyId: user.legacyId, mappedPermissionCodes: [], unmappedPermissionNames: [] })
    }
    for (const grant of userPermissions) {
      const entry = byUser.get(grant.userLegacyId)
      if (!entry) continue // orphaned grant, unresolvable user — reported separately by the caller
      const permissionName = permissionsByLegacyId.get(grant.permissionLegacyId)
      if (!permissionName) continue // orphaned grant, unresolvable permission — reported separately
      const code = mapPermissionCode(permissionName)
      if (code) entry.mappedPermissionCodes.push(code)
      else entry.unmappedPermissionNames.push(permissionName)
    }
    for (const entry of byUser.values()) {
      entry.mappedPermissionCodes = [...new Set(entry.mappedPermissionCodes)].sort()
      entry.unmappedPermissionNames = [...new Set(entry.unmappedPermissionNames)].sort()
    }
    return byUser
  }

  buildTemplates(
    effectivePermissionsByUser: ReadonlyMap<string, UserEffectivePermissions>,
    users: readonly BotcSourceUser[],
    rolesByLegacyId: ReadonlyMap<string, BotcSourceRole>,
  ): TenantRoleTemplate[] {
    const usersByLegacyId = new Map(users.map(u => [u.legacyId, u]))
    const templatesBySignature = new Map<string, TenantRoleTemplate>()

    // Sorted for deterministic, idempotent output regardless of source array ordering.
    const sortedUserIds = [...effectivePermissionsByUser.keys()].sort()
    for (const userLegacyId of sortedUserIds) {
      const effective = effectivePermissionsByUser.get(userLegacyId)
      if (!effective) continue
      const signature = effective.mappedPermissionCodes.join('|')
      let template = templatesBySignature.get(signature)
      if (!template) {
        template = {
          templateId: this.deterministicTemplateId(signature),
          name: this.deriveTemplateName(signature, effectivePermissionsByUser, usersByLegacyId, rolesByLegacyId),
          permissionCodes: effective.mappedPermissionCodes,
          memberUserLegacyIds: [],
        }
        templatesBySignature.set(signature, template)
      }
      template.memberUserLegacyIds.push(userLegacyId)
    }
    return [...templatesBySignature.values()]
  }

  private deterministicTemplateId(signature: string): string {
    return `role_template_${createHash('sha256').update(signature).digest('hex').slice(0, 16)}`
  }

  private deriveTemplateName(
    signature: string,
    effectivePermissionsByUser: ReadonlyMap<string, UserEffectivePermissions>,
    usersByLegacyId: ReadonlyMap<string, BotcSourceUser>,
    rolesByLegacyId: ReadonlyMap<string, BotcSourceRole>,
  ): string {
    const memberIds = [...effectivePermissionsByUser.values()]
      .filter(e => e.mappedPermissionCodes.join('|') === signature)
      .map(e => e.userLegacyId)
      .sort()

    const roleNameCounts = new Map<string, number>()
    for (const userLegacyId of memberIds) {
      const user = usersByLegacyId.get(userLegacyId)
      const role = user?.roleLegacyId ? rolesByLegacyId.get(user.roleLegacyId) : undefined
      if (!role) continue
      roleNameCounts.set(role.name, (roleNameCounts.get(role.name) ?? 0) + 1)
    }

    let majorityName: string | null = null
    let majorityCount = 0
    for (const [name, count] of [...roleNameCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (count > majorityCount) {
        majorityName = name
        majorityCount = count
      }
    }

    if (majorityName && majorityCount === memberIds.length) return majorityName
    return signature.length === 0
      ? 'NO_ADDITIONAL_PERMISSIONS'
      : `ROLE_TEMPLATE_${createHash('sha256').update(signature).digest('hex').slice(0, 8).toUpperCase()}`
  }
}
