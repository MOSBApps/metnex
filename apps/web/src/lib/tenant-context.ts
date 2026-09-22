export const TENANT_COOKIE = 'metnex_tenant_id'
export const TENANT_NAME_COOKIE = 'metnex_tenant_name'
export const TENANT_TYPE_COOKIE = 'metnex_tenant_type'
export const IS_CUSTOMER_ADMIN_COOKIE = 'metnex_is_customer_admin'
export const TENANT_CHANGE_EVENT = 'metnex:tenantchange'

export type TenantType = 'PLATFORM_ROOT' | 'ROOT' | 'STANDARD'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match ? decodeURIComponent(match[1] ?? '') : null
}

export function getActiveTenantId(): string | null {
  return readCookie(TENANT_COOKIE)
}

export function getActiveTenantName(): string | null {
  return readCookie(TENANT_NAME_COOKIE)
}

export function getActiveTenantType(): TenantType | null {
  const raw = readCookie(TENANT_TYPE_COOKIE)
  return raw === 'PLATFORM_ROOT' || raw === 'ROOT' || raw === 'STANDARD' ? raw : null
}

export function setActiveTenant(id: string, name: string, type: TenantType, isCustomerAdmin = false): void {
  document.cookie = `${TENANT_COOKIE}=${encodeURIComponent(id)}; path=/; SameSite=Lax`
  document.cookie = `${TENANT_NAME_COOKIE}=${encodeURIComponent(name)}; path=/; SameSite=Lax`
  document.cookie = `${TENANT_TYPE_COOKIE}=${type}; path=/; SameSite=Lax`
  if (isCustomerAdmin) {
    document.cookie = `${IS_CUSTOMER_ADMIN_COOKIE}=true; path=/; SameSite=Lax`
  } else {
    document.cookie = `${IS_CUSTOMER_ADMIN_COOKIE}=; path=/; SameSite=Lax; Max-Age=0`
  }
  window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: { tenantId: id } }))
}

export function clearActiveTenant(): void {
  document.cookie = `${TENANT_COOKIE}=; path=/; SameSite=Lax; Max-Age=0`
  document.cookie = `${TENANT_NAME_COOKIE}=; path=/; SameSite=Lax; Max-Age=0`
  document.cookie = `${TENANT_TYPE_COOKIE}=; path=/; SameSite=Lax; Max-Age=0`
  document.cookie = `${IS_CUSTOMER_ADMIN_COOKIE}=; path=/; SameSite=Lax; Max-Age=0`
}
