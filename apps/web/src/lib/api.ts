import { logout } from './auth'
import { getApiBase } from './api-base'
import { endImpersonation, isImpersonating } from './impersonation'
import { getMfaErrorGuidance } from './mfa-error'
import { coordinatedRefresh } from './refresh'
import { getActiveTenantId } from './tenant-context'

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly body?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
  }
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('metnex_access_token')
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function tenantHeaders(): Record<string, string> {
  const tenantId = getActiveTenantId()
  return tenantId ? { 'X-Tenant-Id': tenantId } : {}
}

function errorMessage(data: Record<string, unknown>, status: number): string {
  const message = data['message']
  return Array.isArray(message) ? String(message[0] ?? status) : String(message ?? `API error ${status}`)
}

function handleUnauthorized(): never {
  void logout()
  throw new Error('UNAUTHORIZED')
}

async function request<T>(
  path: string,
  init: RequestInit,
  useTenant = false,
  retried = false,
): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      ...((init.headers as Record<string, string> | undefined) ?? {}),
      ...authHeaders(),
      ...(useTenant ? tenantHeaders() : {}),
    },
  })

  if (res.status === 401) {
    if (isImpersonating()) {
      endImpersonation()
      window.location.href = '/system/users'
      throw new Error('IMPERSONATION_EXPIRED')
    }
    if (retried) return handleUnauthorized()
    const token = await coordinatedRefresh(getApiBase())
    if (!token) return handleUnauthorized()
    return request<T>(path, init, useTenant, true)
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const error = new ApiError(errorMessage(data, res.status), res.status, data)
    const mfaGuidance = getMfaErrorGuidance(error)
    if (mfaGuidance && typeof window !== 'undefined' && window.location.pathname !== mfaGuidance.ctaHref) {
      window.location.href = mfaGuidance.ctaHref
    }
    throw error
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function apiGet<T>(path: string) {
  return request<T>(path, { method: 'GET' })
}

export function apiGetWithHeaders<T>(path: string, headers: Record<string, string>) {
  return request<T>(path, { method: 'GET', headers })
}

export function apiPost<T>(path: string, body?: unknown) {
  return request<T>(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
  )
}

export function apiPut<T>(path: string, body: unknown) {
  return request<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function apiPatch<T>(path: string, body: unknown) {
  return request<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function apiDelete(path: string) {
  return request<void>(path, { method: 'DELETE' })
}

export function tenantApiGet<T>(path: string) {
  return request<T>(path, { method: 'GET' }, true)
}

export function tenantApiPut<T>(path: string, body: unknown) {
  return request<T>(
    path,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    true,
  )
}

export function tenantApiPatch<T>(path: string, body: unknown) {
  return request<T>(
    path,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    true,
  )
}

export function tenantApiPost<T>(path: string, body?: unknown) {
  return request<T>(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    true,
  )
}

export function tenantApiDelete(path: string) {
  return request<void>(path, { method: 'DELETE' }, true)
}

export async function tenantApiDownload(path: string) {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'GET',
    headers: {
      ...authHeaders(),
      ...tenantHeaders(),
    },
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    throw new ApiError(errorMessage(data, res.status), res.status)
  }
  return {
    blob: await res.blob(),
    fileName:
      res
        .headers
        .get('content-disposition')
        ?.match(/filename="([^"]+)"/)?.[1] ?? 'report.bin',
  }
}
