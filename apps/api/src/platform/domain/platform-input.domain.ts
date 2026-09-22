import { validatePasswordStrength } from './auth.domain'
import { validateRoleCreation } from './system-role.domain'
import { isValidEmail } from './user.domain'

/**
 * Pure, DB-free input validators for the platform module's plain-interface DTOs (Q-DP20). They run
 * before any query, hash, transaction or audit write. Every message is static: no input value —
 * and never a password — is ever echoed. Limits mirror the existing tenant/user/role validators.
 * Unknown extra keys are ignored here (services only read named fields); privileged fields are
 * never read from a body.
 */
export interface InputValidation {
  valid: boolean
  errors: string[]
}

export const NAME_MIN = 2
export const NAME_MAX = 100
export const SLUG_INPUT_MAX = 100
export const EMAIL_MAX = 254
export const ID_MAX = 100
export const PACKAGE_LIMIT_MAX = 2_147_483_647
export const INT4_MAX = 2_147_483_647
export const SEARCH_MAX = 100
export const LOGIN_PASSWORD_MAX = 1024

const ID_PATTERN = /^[A-Za-z0-9_-]+$/
const PERMISSION_CODE_PATTERN = /^[A-Z][A-Z0-9_]*(?::[A-Z][A-Z0-9_]*){1,4}$/

export const TENANT_STATUSES = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const
export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED'] as const

const isString = (value: unknown): value is string => typeof value === 'string'
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const done = (errors: string[]): InputValidation => ({ valid: errors.length === 0, errors })

export function isValidId(value: unknown): value is string {
  return isString(value) && value.length > 0 && value.length <= ID_MAX && ID_PATTERN.test(value)
}

/** Required id (route param or body field). `label` is a fixed literal supplied by the caller. */
export function validateId(value: unknown, label: string): InputValidation {
  return done(isValidId(value) ? [] : [`${label} geçersiz`])
}

function requireId(errors: string[], value: unknown, label: string) {
  if (!isValidId(value)) errors.push(`${label} zorunludur ve geçerli bir kimlik olmalıdır`)
}

function optionalId(errors: string[], value: unknown, label: string) {
  if (value === undefined || value === null) return
  if (!isValidId(value)) errors.push(`${label} geçerli bir kimlik olmalıdır`)
}

function requireName(errors: string[], value: unknown, label: string) {
  if (!isString(value)) {
    errors.push(`${label} zorunludur`)
    return
  }
  const length = value.trim().length
  if (length < NAME_MIN) errors.push(`${label} en az ${NAME_MIN} karakter olmalıdır`)
  else if (length > NAME_MAX) errors.push(`${label} en fazla ${NAME_MAX} karakter olabilir`)
}

/**
 * Tenant slug input is free text that the services normalise (slugify / composeTenantSlug), so only
 * type, length and "normalises to something non-empty" are checked — not a strict pattern.
 */
function optionalSlug(errors: string[], value: unknown) {
  if (value === undefined || value === null) return
  if (!isString(value)) {
    errors.push('Slug metin olmalıdır')
    return
  }
  const slug = value.trim()
  if (slug.length > SLUG_INPUT_MAX) errors.push(`Slug en fazla ${SLUG_INPUT_MAX} karakter olabilir`)
  else if (slug !== '' && !/[A-Za-z0-9ğüşıöçĞÜŞİÖÇ]/.test(slug)) errors.push('Slug en az bir harf veya rakam içermelidir')
}

function optionalBoolean(errors: string[], value: unknown, label: string) {
  if (value !== undefined && typeof value !== 'boolean') errors.push(`${label} true/false olmalıdır`)
}

function requirePassword(errors: string[], value: unknown) {
  if (!isString(value) || value === '') errors.push('Parola zorunludur')
  else errors.push(...validatePasswordStrength(value).errors)
}

function requireEmail(errors: string[], value: unknown) {
  if (!isString(value) || value.trim() === '') errors.push('E-posta adresi zorunludur')
  else if (value.trim().length > EMAIL_MAX || !isValidEmail(value)) errors.push('Geçersiz e-posta adresi formatı')
}

function body(input: unknown): Record<string, unknown> | null {
  return isPlainObject(input) ? input : null
}

const INVALID_BODY = done(['Geçersiz istek gövdesi'])

// ── Packages ────────────────────────────────────────────────────────────────

export function validateCreateResourcePackage(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []

  const code = dto['code']
  if (!isString(code)) errors.push('Paket kodu zorunludur')
  else {
    const normalized = code.trim().toUpperCase()
    // Only what SaasService.createPackage already enforced (trim, min 2). No format or maximum length is
    // imposed: none is proven by the code or the schema (column is unbounded text), and existing package
    // codes are unknown without a database — the format is an open AI1/PO decision (Q-DP21).
    if (normalized.length < 2) errors.push('Paket kodu en az 2 karakter olmalıdır')
  }
  // Name and description: type, trim and the existing min-2 name rule only. No maximum length is imposed —
  // none is proven by the code or the schema (unbounded text); any limit is an open AI1/PO decision (Q-DP21).
  const name = dto['name']
  if (!isString(name)) errors.push('Paket adı zorunludur')
  else if (name.trim().length < NAME_MIN) errors.push(`Paket adı en az ${NAME_MIN} karakter olmalıdır`)

  const description = dto['description']
  if (description !== undefined && description !== null && !isString(description)) errors.push('Açıklama metin olmalıdır')

  for (const [field, label] of [
    ['maxChildTenantCount', 'Alt kiracı limiti'],
    ['maxUserCount', 'Kullanıcı limiti'],
    ['maxStorageMb', 'Depolama limiti'],
    ['maxDatabaseMb', 'Veritabanı limiti'],
  ] as const) {
    const value = dto[field]
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > PACKAGE_LIMIT_MAX) {
      errors.push(`${label} sıfır veya pozitif tam sayı olmalıdır (en fazla ${PACKAGE_LIMIT_MAX})`)
    }
  }
  return done(errors)
}

// ── Customer admin ──────────────────────────────────────────────────────────

export function validateCustomerAdminCreateTenant(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []
  requireName(errors, dto['name'], 'Kiracı adı')
  optionalSlug(errors, dto['slug'])
  optionalId(errors, dto['parentTenantId'], 'Üst kiracı')
  optionalBoolean(errors, dto['canEnterData'], 'canEnterData')
  optionalBoolean(errors, dto['canAggregateChildren'], 'canAggregateChildren')
  return done(errors)
}

export function validateCustomerAdminCreateUser(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []
  requireEmail(errors, dto['email'])
  requireName(errors, dto['displayName'], 'Görünen ad')
  requirePassword(errors, dto['password'])
  optionalId(errors, dto['tenantId'], 'Kiracı')
  return done(errors)
}

export function validateAddMembership(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []
  requireId(errors, dto['tenantId'], 'Kiracı')
  return done(errors)
}

/** PATCH bodies that may carry only an optional displayName (customer-admin and platform user update). */
export function validateUpdateDisplayName(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []
  if (dto['displayName'] !== undefined) requireName(errors, dto['displayName'], 'Görünen ad')
  return done(errors)
}

export function validateSetPassword(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []
  requirePassword(errors, dto['password'])
  return done(errors)
}

/** Self-service password change (TASK-027.47): the current password is only checked for presence here —
 * its correctness is a credential check made against the stored hash, not a shape question. */
export function validateChangeOwnPassword(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []
  if (!isString(dto['currentPassword']) || dto['currentPassword'] === '') errors.push('Mevcut parola zorunludur')
  requirePassword(errors, dto['newPassword'])
  return done(errors)
}

// ── Platform tenants ────────────────────────────────────────────────────────

/** Shape checks for the child-tenant create body; the parentless ROOT refusal is enforced by TenantService first. */
export function validateCreateTenant(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []
  requireName(errors, dto['name'], 'Kiracı adı')
  optionalSlug(errors, dto['slug'])
  requireId(errors, dto['parentId'], 'Üst kiracı')
  optionalBoolean(errors, dto['canEnterData'], 'canEnterData')
  optionalBoolean(errors, dto['canAggregateChildren'], 'canAggregateChildren')
  return done(errors)
}

export function validateUpdateTenant(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []
  if (dto['name'] !== undefined) requireName(errors, dto['name'], 'Kiracı adı')
  optionalId(errors, dto['packageId'], 'Paket')
  return done(errors)
}

export function validateAddMember(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []
  requireId(errors, dto['userId'], 'Kullanıcı')
  return done(errors)
}

// ── Platform users ──────────────────────────────────────────────────────────

export function validateCreateUser(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []
  requireEmail(errors, dto['email'])
  requireName(errors, dto['displayName'], 'Görünen ad')
  requirePassword(errors, dto['password'])
  return done(errors)
}

export function validateAssignRole(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []
  requireId(errors, dto['roleId'], 'Rol')
  optionalId(errors, dto['tenantId'], 'Kiracı')
  return done(errors)
}

// ── Roles ───────────────────────────────────────────────────────────────────

export function validateCreateRole(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []
  if (!isString(dto['name'])) errors.push('Rol adı zorunludur')
  const description = dto['description']
  if (description !== undefined && description !== null && !isString(description)) errors.push('Açıklama metin olmalıdır')
  if (errors.length > 0) return done(errors)
  // Name/description rules stay in the existing role validator.
  return done(
    validateRoleCreation({ name: dto['name'] as string, description: isString(description) ? description : undefined }).errors,
  )
}

export function validateAssignPermission(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const code = dto['permissionCode']
  if (!isString(code) || code.length > 100 || !PERMISSION_CODE_PATTERN.test(code)) return done(['İzin kodu geçersiz'])
  return done([])
}

// ── Session / auth entry points ─────────────────────────────────────────────

export function validateSetActiveTenant(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  return done(isValidId(dto['tenantId']) ? [] : ['tenantId zorunludur ve geçerli bir kimlik olmalıdır'])
}

/** Type guard only; credential checks stay in AuthService so failures remain uniform and audited. */
export function validateLoginBody(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []
  if (dto['email'] !== undefined && (!isString(dto['email']) || dto['email'].length > EMAIL_MAX)) errors.push('Geçersiz e-posta')
  if (dto['password'] !== undefined && (!isString(dto['password']) || dto['password'].length > LOGIN_PASSWORD_MAX)) {
    errors.push('Geçersiz parola')
  }
  return done(errors)
}

export function validateBootstrapBody(input: unknown): InputValidation {
  const dto = body(input)
  if (!dto) return INVALID_BODY
  const errors: string[] = []
  for (const field of ['tenantName', 'email', 'password', 'displayName'] as const) {
    if (!isString(dto[field])) errors.push('Zorunlu alanlar metin olmalıdır')
  }
  for (const field of ['tenantSlug', 'tenantShortName'] as const) {
    if (dto[field] !== undefined && dto[field] !== null && !isString(dto[field])) errors.push('İsteğe bağlı alanlar metin olmalıdır')
  }
  if (isString(dto['tenantName']) && dto['tenantName'].length > NAME_MAX) errors.push(`tenantName en fazla ${NAME_MAX} karakter olabilir`)
  if (isString(dto['email']) && dto['email'].length > EMAIL_MAX) errors.push('Geçersiz e-posta adresi formatı')
  if (isString(dto['displayName']) && dto['displayName'].length > NAME_MAX) errors.push(`displayName en fazla ${NAME_MAX} karakter olabilir`)
  return done([...new Set(errors)])
}

// ── List / filter queries ───────────────────────────────────────────────────

function optionalSearch(errors: string[], value: unknown) {
  if (value === undefined) return
  if (!isString(value) || value.length > SEARCH_MAX) errors.push(`Arama ifadesi metin olmalı ve en fazla ${SEARCH_MAX} karakter olabilir`)
}

function optionalEnum(errors: string[], value: unknown, allowed: readonly string[], label: string) {
  if (value === undefined || value === '') return
  if (!isString(value) || !allowed.includes(value)) errors.push(`${label} geçersiz`)
}

export function validateTenantListQuery(input: unknown): InputValidation {
  const query = body(input)
  if (!query) return INVALID_BODY
  const errors: string[] = []
  optionalSearch(errors, query['q'])
  optionalEnum(errors, query['status'], TENANT_STATUSES, 'Durum filtresi')
  return done(errors)
}

export function validateUserListQuery(input: unknown): InputValidation {
  const query = body(input)
  if (!query) return INVALID_BODY
  const errors: string[] = []
  optionalSearch(errors, query['q'])
  optionalEnum(errors, query['status'], USER_STATUSES, 'Durum filtresi')
  optionalEnum(errors, query['isSystemAdmin'], ['true', 'false'], 'Sistem yöneticisi filtresi')
  return done(errors)
}
