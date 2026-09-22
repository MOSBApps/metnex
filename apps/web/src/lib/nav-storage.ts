import { getAccessToken } from './api'

const NAV_STORAGE_NAMESPACE = 'metnex.nav.v1'

function decodeJwtSub(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
    const claims = JSON.parse(atob(padded)) as { sub?: string }
    return claims.sub ?? null
  } catch {
    return null
  }
}

function getCurrentUserId(): string {
  const token = getAccessToken()
  if (!token) return 'anonymous'
  return decodeJwtSub(token) ?? 'anonymous'
}

function storageKey(tenantId: string): string {
  return `${NAV_STORAGE_NAMESPACE}:${getCurrentUserId()}:${tenantId}`
}

export type NavOpenState = Record<string, boolean>

export function loadNavOpenState(tenantId: string): NavOpenState {
  if (typeof window === 'undefined' || !tenantId) return {}
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as NavOpenState
  } catch {
    return {}
  }
}

export function saveNavOpenState(tenantId: string, state: NavOpenState): void {
  if (typeof window === 'undefined' || !tenantId) return
  try {
    window.localStorage.setItem(storageKey(tenantId), JSON.stringify(state))
  } catch {
    // best effort — storage may be full or disabled, accordion state just won't persist
  }
}
