import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { assertRow } from '../db/assert-row'
import { DB, type Db } from '../db/db.module'
import { permissions, rolePermissions, systemRoles } from '../db/schema'
import { validateAssignPermission, validateCreateRole, validateId } from './domain/platform-input.domain'
import { canAssignPermissionToRole, canMutateRole, validateRoleCreation } from './domain/system-role.domain'

export interface CreateRoleDto {
  name: string
  description?: string
}

export interface AssignPermissionDto {
  permissionCode: string
}

export interface RoleRow {
  id: string
  name: string
  description: string | null
  isBuiltin: boolean
  permissionCount: number
}

export interface RoleDetail {
  id: string
  name: string
  description: string | null
  isBuiltin: boolean
  permissions: { id: string; code: string; description: string | null }[]
}

export interface PermissionRow {
  id: string
  code: string
  description: string | null
}

const KNOWN_PERMISSIONS: { code: string; description: string }[] = [
  { code: 'PLATFORM:USER:VIEW', description: 'Kullanıcıları listeleme ve detay görme' },
  { code: 'PLATFORM:USER:CREATE', description: 'Yeni kullanıcı oluşturma' },
  { code: 'PLATFORM:USER:UPDATE', description: 'Kullanıcı bilgilerini güncelleme' },
  { code: 'PLATFORM:USER:DEACTIVATE', description: 'Kullanıcı devre dışı bırakma' },
  { code: 'PLATFORM:USER:ASSIGN_ROLE', description: 'Kullanıcıya rol atama' },
  { code: 'PLATFORM:TENANT:VIEW', description: 'Kiracıları listeleme ve detay görme' },
  { code: 'PLATFORM:TENANT:CREATE', description: 'Yeni kiracı oluşturma' },
  { code: 'PLATFORM:TENANT:UPDATE', description: 'Kiracı bilgilerini güncelleme ve üye ekleme' },
  { code: 'PLATFORM:TENANT:SUSPEND', description: 'Kiracı askıya alma' },
  { code: 'PLATFORM:TENANT:ARCHIVE', description: 'Kiracı arşivleme' },
  { code: 'PLATFORM:ROLE:VIEW', description: 'Rolleri listeleme ve detay görme' },
  { code: 'PLATFORM:ROLE:CREATE', description: 'Yeni özel rol oluşturma' },
  { code: 'PLATFORM:PERMISSION:VIEW', description: 'Mevcut izinleri listeleme' },
  { code: 'PLATFORM:PERMISSION:ASSIGN', description: 'Role izin atama' },
  { code: 'PLATFORM:SETTINGS:GENERAL:VIEW', description: 'Platform genel ayarlarını görüntüleme' },
  { code: 'PLATFORM:SETTINGS:GENERAL:MANAGE', description: 'Platform genel ayarlarını yönetme' },
  { code: 'PLATFORM:SETTINGS:SMTP:VIEW', description: 'Platform SMTP ayarlarını görüntüleme' },
  { code: 'PLATFORM:SETTINGS:SMTP:MANAGE', description: 'Platform SMTP ayarlarını yönetme' },
  { code: 'PLATFORM:SETTINGS:AI_PROVIDER:VIEW', description: 'Platform AI ayarlarını görüntüleme' },
  { code: 'PLATFORM:SETTINGS:AI_PROVIDER:MANAGE', description: 'Platform AI ayarlarını yönetme' },
  { code: 'PLATFORM:PACKAGE:VIEW', description: 'Kaynak paketlerini görüntüleme' },
  { code: 'PLATFORM:PACKAGE:MANAGE', description: 'Kaynak paketlerini yönetme' },
  { code: 'PLATFORM:CUSTOMER:VIEW', description: 'Müşteri tenant ağacını görüntüleme' },
  { code: 'PLATFORM:CUSTOMER:PROVISION', description: 'Müşteri root tenant ve tenant admin provision etme' },
]

@Injectable()
export class RoleService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(): Promise<{ roles: RoleRow[] }> {
    const [roles, counts] = await Promise.all([
      this.db.select().from(systemRoles).orderBy(desc(systemRoles.isBuiltin), asc(systemRoles.name)),
      this.db
        .select({ roleId: rolePermissions.roleId, count: sql<number>`count(*)::int` })
        .from(rolePermissions)
        .groupBy(rolePermissions.roleId),
    ])
    const countByRoleId = new Map(counts.map(row => [row.roleId, row.count]))

    return {
      roles: roles.map(role => ({
        id: role.id,
        name: role.name,
        description: role.description,
        isBuiltin: role.isBuiltin,
        permissionCount: countByRoleId.get(role.id) ?? 0,
      })),
    }
  }

  async create(dto: CreateRoleDto): Promise<RoleRow> {
    const shape = validateCreateRole(dto)
    if (!shape.valid) throw new BadRequestException(shape.errors.join(', '))
    const validation = validateRoleCreation(dto)
    if (!validation.valid) {
      throw new BadRequestException(validation.errors.join(', '))
    }

    const name = dto.name.trim().toUpperCase()

    try {
      const role = assertRow(
        await this.db
          .insert(systemRoles)
          .values({ name, description: dto.description?.trim() ?? null, isBuiltin: false })
          .returning(),
      )

      return {
        id: role.id,
        name: role.name,
        description: role.description,
        isBuiltin: role.isBuiltin,
        permissionCount: 0,
      }
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`"${name}" adında bir rol zaten mevcut`)
      }
      throw error
    }
  }

  async findById(id: string): Promise<RoleDetail> {
    const [role] = await this.db.select().from(systemRoles).where(eq(systemRoles.id, id)).limit(1)
    if (!role) throw new NotFoundException('Rol bulunamadı')

    const rolePerms = await this.listRolePermissions(id)

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isBuiltin: role.isBuiltin,
      permissions: rolePerms,
    }
  }

  async assignPermission(roleId: string, dto: AssignPermissionDto): Promise<RoleDetail> {
    const shape = validateAssignPermission(dto)
    const roleIdCheck = validateId(roleId, 'Rol')
    if (!shape.valid || !roleIdCheck.valid) throw new BadRequestException([...shape.errors, ...roleIdCheck.errors])

    const [role] = await this.db.select().from(systemRoles).where(eq(systemRoles.id, roleId)).limit(1)
    if (!role) throw new NotFoundException('Rol bulunamadı')

    const mutationCheck = canMutateRole(role)
    if (!mutationCheck.allowed) {
      throw new ForbiddenException(
        'Yerleşik roller salt okunurdur — izin ataması yalnızca özel rollere yapılabilir',
      )
    }

    const existingCodes = (await this.listRolePermissions(roleId)).map(item => item.code)
    const check = canAssignPermissionToRole(existingCodes, dto.permissionCode)
    if (!check.valid) throw new ConflictException(check.reason)

    const [permission] = await this.db.select().from(permissions).where(eq(permissions.code, dto.permissionCode)).limit(1)
    if (!permission) throw new NotFoundException(`"${dto.permissionCode}" izni bulunamadı`)

    await this.db.insert(rolePermissions).values({ roleId, permissionId: permission.id })

    return this.findById(roleId)
  }

  async availablePermissions(): Promise<{ permissions: PermissionRow[] }> {
    for (const permission of KNOWN_PERMISSIONS) {
      await this.db
        .insert(permissions)
        .values(permission)
        .onConflictDoUpdate({ target: permissions.code, set: { description: permission.description } })
    }

    const rows = await this.db
      .select({ id: permissions.id, code: permissions.code, description: permissions.description })
      .from(permissions)
      .orderBy(asc(permissions.code))

    return { permissions: rows }
  }

  private async listRolePermissions(roleId: string) {
    return this.db
      .select({ id: permissions.id, code: permissions.code, description: permissions.description })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, roleId))
      .orderBy(asc(permissions.code))
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505'
}
