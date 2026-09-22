const ACCESS_KEY = 'metnex_access_token'
const IS_SYSTEM_ADMIN_COOKIE = 'metnex_is_system_admin'

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
  } catch {
    return null
  }
}

export function setAccessToken(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(ACCESS_KEY, token)
  document.cookie = `${ACCESS_KEY}=${encodeURIComponent(token)}; path=/; SameSite=Lax`
  const payload = decodeJwtPayload(token)
  if (payload?.['isSystemAdmin'] === true) {
    document.cookie = `${IS_SYSTEM_ADMIN_COOKIE}=true; path=/; SameSite=Lax`
  } else {
    document.cookie = `${IS_SYSTEM_ADMIN_COOKIE}=; path=/; SameSite=Lax; Max-Age=0`
  }
}

export function clearAccessToken(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ACCESS_KEY)
  document.cookie = `${ACCESS_KEY}=; path=/; SameSite=Lax; Max-Age=0`
  document.cookie = `${IS_SYSTEM_ADMIN_COOKIE}=; path=/; SameSite=Lax; Max-Age=0`
}

let inflightRefresh: Promise<string | null> | null = null

export function coordinatedRefresh(apiBase: string): Promise<string | null> {
  if (inflightRefresh) return inflightRefresh

  inflightRefresh = (async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) return null
      const data = (await res.json()) as { accessToken: string }
      setAccessToken(data.accessToken)
      return data.accessToken
    } catch {
      return null
    } finally {
      inflightRefresh = null
    }
  })()

  return inflightRefresh
}
