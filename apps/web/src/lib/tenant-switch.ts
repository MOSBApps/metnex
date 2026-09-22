'use client'

import { apiGet, apiGetWithHeaders, apiPost } from './api'
import { setActiveTenant, type TenantType } from './tenant-context'

export interface AccessibleTenant {
  id: string
  name: string
  slug: string
  status: string
  type: string
}

interface ActiveTenantResponse {
  tenant: AccessibleTenant
}

interface TenantPermissionSnapshot {
  permissions: string[]
  isTenantAdmin: boolean
}

function normalizeTenantType(type: string): TenantType {
  return type === 'PLATFORM_ROOT' || type === 'ROOT' || type === 'STANDARD' ? type : 'STANDARD'
}

function hasCustomerAdminAccess(snapshot: TenantPermissionSnapshot): boolean {
  return (
    snapshot.isTenantAdmin ||
    snapshot.permissions.includes('CUSTOMER:ADMIN:VIEW') ||
    snapshot.permissions.includes('*')
  )
}

export async function loadAccessibleTenants(): Promise<AccessibleTenant[]> {
  const response = await apiGet<{ tenants: AccessibleTenant[] }>('/api/v1/platform/me/tenants')
  return response.tenants
}

export async function switchActiveTenant(tenantId: string): Promise<AccessibleTenant> {
  const response = await apiPost<ActiveTenantResponse>('/api/v1/platform/me/active-tenant', { tenantId })
  const activeTenant = response.tenant
  const permissionSnapshot = await apiGetWithHeaders<TenantPermissionSnapshot>(
    '/api/v1/platform/me/tenant-permissions',
    { 'X-Tenant-Id': activeTenant.id },
  )

  setActiveTenant(
    activeTenant.id,
    activeTenant.name,
    normalizeTenantType(activeTenant.type),
    hasCustomerAdminAccess(permissionSnapshot),
  )

  return activeTenant
}
