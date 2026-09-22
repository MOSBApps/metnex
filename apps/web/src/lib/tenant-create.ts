import { ApiError } from './api'

export const ROOT_PROVISIONING_REQUIRED_MESSAGE =
  'Yeni müşteri (kök tenant) bu formdan oluşturulamaz. Müşteri kaydı; paket, yönetici ve abonelik bilgileriyle müşteri provizyon akışından yapılır. Bu form yalnızca mevcut bir tenantın altına alt tenant ekler.'
export const TENANT_CREATE_FALLBACK_MESSAGE = 'Tenant oluşturulamadı. Lütfen bilgileri kontrol edip tekrar deneyin.'
export const TENANT_CREATE_FORBIDDEN_MESSAGE = 'Bu işlem için yetkiniz bulunmuyor.'
export const PARENT_REQUIRED_MESSAGE = 'Lütfen alt tenantın bağlanacağı üst tenantı seçin.'
export const NAME_REQUIRED_MESSAGE = 'Tenant adı zorunludur.'

const MAX_BACKEND_MESSAGE_LENGTH = 200

export interface ParentCandidate {
  id: string
  name: string
  slug: string
  type: string
  status: string
}

export interface ChildTenantForm {
  parentId: string
  name: string
  slug: string
}

/** The only body this UI ever sends to POST platform/tenants: a child of an existing tenant. */
export interface ChildTenantPayload {
  parentId: string
  name: string
  slug?: string
}

/** Active customer roots and STANDARD tenants; the platform root can never be a parent from this form. */
export function eligibleParentTenants<T extends ParentCandidate>(tenants: readonly T[]): T[] {
  return tenants
    .filter(tenant => tenant.status === 'ACTIVE' && (tenant.type === 'ROOT' || tenant.type === 'STANDARD'))
    .sort((left, right) => left.name.localeCompare(right.name, 'tr'))
}

export function buildChildTenantPayload(
  form: ChildTenantForm,
  parents: readonly ParentCandidate[],
): { ok: true; payload: ChildTenantPayload } | { ok: false; error: string } {
  const parentId = form.parentId.trim()
  if (!parentId || !parents.some(parent => parent.id === parentId)) return { ok: false, error: PARENT_REQUIRED_MESSAGE }
  const name = form.name.trim()
  if (!name) return { ok: false, error: NAME_REQUIRED_MESSAGE }
  const slug = form.slug.trim()
  return { ok: true, payload: slug ? { parentId, name, slug } : { parentId, name } }
}

export function describeTenantCreateError(error: unknown): string {
  if (!(error instanceof ApiError)) return TENANT_CREATE_FALLBACK_MESSAGE
  if (error.body?.['code'] === 'ROOT_PROVISIONING_REQUIRED') return ROOT_PROVISIONING_REQUIRED_MESSAGE
  if (error.status === 401 || error.status === 403) return TENANT_CREATE_FORBIDDEN_MESSAGE
  const isBackendUserError = error.status === 400 || error.status === 404 || error.status === 409
  const message = error.message.trim()
  if (isBackendUserError && message && message.length <= MAX_BACKEND_MESSAGE_LENGTH) return message
  return TENANT_CREATE_FALLBACK_MESSAGE
}
