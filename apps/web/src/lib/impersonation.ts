import { clearAccessToken, setAccessToken } from './refresh'
import { clearActiveTenant } from './tenant-context'

const ORIGINAL_ACCESS_KEY = 'metnex_impersonation_original_access_token'
const META_KEY = 'metnex_impersonation_meta'

export interface ImpersonationMeta {
  impersonatedUserId: string
  impersonatedUserEmail: string
  impersonatedUserDisplayName: string
  impersonatorEmail: string
}

function readAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('metnex_access_token')
}

export function isImpersonating(): boolean {
  if (typeof window === 'undefined') return false
  return !!localStorage.getItem(META_KEY)
}

export function getImpersonationMeta(): ImpersonationMeta | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(META_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ImpersonationMeta
  } catch {
    return null
  }
}

export function beginImpersonation(accessToken: string, meta: ImpersonationMeta): void {
  if (typeof window === 'undefined') return
  const currentAccessToken = readAccessToken()
  if (currentAccessToken) {
    localStorage.setItem(ORIGINAL_ACCESS_KEY, currentAccessToken)
  }
  localStorage.setItem(META_KEY, JSON.stringify(meta))
  document.cookie = 'metnex_is_impersonating=true; path=/; SameSite=Lax'
  clearActiveTenant()
  setAccessToken(accessToken)
}

export function endImpersonation(): void {
  if (typeof window === 'undefined') return
  const original = localStorage.getItem(ORIGINAL_ACCESS_KEY)
  localStorage.removeItem(ORIGINAL_ACCESS_KEY)
  localStorage.removeItem(META_KEY)
  document.cookie = 'metnex_is_impersonating=; path=/; SameSite=Lax; Max-Age=0'
  clearActiveTenant()

  if (original) {
    setAccessToken(original)
  } else {
    clearAccessToken()
  }
}
